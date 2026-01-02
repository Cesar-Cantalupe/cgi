import { Injectable, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { Observable, Subject, takeUntil } from 'rxjs';
import { ActivatedRoute } from '@angular/router';

import { TranslationService } from '../translation.service';
import { SuggestionsService } from '../suggestions.service';
import { ChatbotStateService } from './core/chatbot-state.service';
import { ChatbotEngineService } from './core/chatbot-engine.service';
import { ConversationService } from './core/conversation.service';
import { StreamingModule } from './modules/streaming.module';
import { WebsocketModule } from './modules/websocket.module';
import { FiltersModule } from './modules/filters.module';
import { FeedbackModule } from './modules/feedback.module';
import { ChatMessage } from './interfaces/chat-message.interface';
import { Conversation } from './interfaces/conversation.interface';
import { MessageParserService } from './shared/message-parser.service';

// Interface para eventos de STOP
export interface StopRequestData {
  messageId?: string;
  questionType?: 'user' | 'predefined';
  questionContent?: string;
  shouldRestoreToInput?: boolean;
  shouldCleanMessages?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class ChatbotService implements OnDestroy {
  // Observables del estado
  public messages$: Observable<ChatMessage[]>;
  public isProcessing$: Observable<boolean>;
  public currentStreamingMessage$: Observable<ChatMessage | null>;
  public currentClientId$: Observable<string | null>;
  public connectionStatus$: Observable<string>;
  
  // Observables de conversaciones (directos del ConversationService)
  public conversations$: Observable<Conversation[]>;
  public currentConversation$: Observable<Conversation | null>;
  
  // Subject para eventos de STOP
  private stopRequested$ = new Subject<StopRequestData>();
  public onStopRequested$ = this.stopRequested$.asObservable();
  
  // Módulos públicos
  public streaming = this.streamingModule;
  public websocket = this.websocketModule;
  public filters = this.filtersModule;
  public feedback = this.feedbackModule;
  
  private destroy$ = new Subject<void>();
  private initializationComplete = false;
  private processingMessageId: string | null = null;
  private debugMode = false;
  private lastCanSendCheck = 0;
  private readonly CAN_SEND_CHECK_INTERVAL = 500;
  private lastProcessingStartTime: number = 0;
  private readonly MAX_PROCESSING_TIME = 30000;
  
  // Cache para última pregunta y su tipo
  private lastStopData: StopRequestData | null = null;
  private lastUserQuestion: {content: string, id: string, type: 'user' | 'predefined'} | null = null;

  constructor(
    private state: ChatbotStateService,
    private engine: ChatbotEngineService,
    private conversationService: ConversationService,
    private suggestionsService: SuggestionsService,
    private websocketModule: WebsocketModule,
    private streamingModule: StreamingModule,
    private filtersModule: FiltersModule,
    private feedbackModule: FeedbackModule,
    private translationService: TranslationService,
    private route: ActivatedRoute,
    private messageParser: MessageParserService
  ) {
    // Observables del estado
    this.messages$ = this.state.messages$;
    this.isProcessing$ = this.state.isProcessing$;
    this.currentStreamingMessage$ = this.state.currentStreamingMessage$;
    this.currentClientId$ = this.state.currentClientId$;
    this.connectionStatus$ = this.websocketModule.connectionStatus$;
    
    // Observables de conversaciones
    this.conversations$ = this.conversationService.conversations$;
    this.currentConversation$ = this.conversationService.activeConversation$;
    
    this.initialize();
  }

  private initialize(): void {
    // Configurar filtros de URL
    this.setupUrlFilters();
    
    // Inicializar websocket
    setTimeout(() => {
      this.websocketModule.initialize();
      this.monitorConnection();
      this.initializationComplete = true;
    }, 200);
    
    // Detección de estado bloqueado
    this.setupHungStateDetection();
    
    // Escuchar eventos de streaming completado
    this.setupStreamingCompletionListener();
    
    // Escuchar eventos de STOP internos
    this.setupStopEventListener();
    
    // Trackear última pregunta del usuario
    this.trackLastUserQuestion();
  }

  // ============ NUEVO: SISTEMA UNIFICADO DE STOP ============

  /**
   * MÉTODO PRINCIPAL DE STOP - COORDINA TODO EL SISTEMA
   */
  async emergencyStop(options?: {
    messageId?: string;
    questionType?: 'user' | 'predefined';
    questionContent?: string;
    shouldRestoreToInput?: boolean;
    shouldCleanMessages?: boolean;
  }): Promise<StopRequestData> {
    console.log('🚨 EMERGENCY STOP ejecutado con opciones:', options);
    
    // 1. Obtener información actual
    const currentData = await this.collectCurrentStopData(options);
    
    // 2. Emitir evento de STOP para que los componentes sepan
    this.stopRequested$.next(currentData);
    
    // 3. Detener todos los procesos activos
    this.stopAllActiveProcesses();
    
    // 4. Limpiar mensajes según el tipo de pregunta
    await this.cleanupMessagesByQuestionType(currentData);
    
    // 5. Actualizar conversación si es necesario
    this.updateConversationAfterStop(currentData);
    
    // 6. Resetear estado interno
    this.resetInternalState();
    
    // 7. Cachear datos para referencia
    this.lastStopData = currentData;
    
    console.log('✅ EMERGENCY STOP completado:', {
      tipo: currentData.questionType,
      limpiarMensajes: currentData.shouldCleanMessages,
      restaurarInput: currentData.shouldRestoreToInput,
      contenidoPregunta: currentData.questionContent?.substring(0, 50)
    });
    
    return currentData;
  }

  /**
   * Versión simple para el botón STOP
   */
  forceStopProcessing(): void {
    this.emergencyStop().catch(console.error);
  }

  /**
   * Versión para regeneración
   */
  async stopAndPrepareForRegeneration(message: ChatMessage): Promise<StopRequestData> {
    console.log('🔄 STOP para regeneración:', message.id);
    
    const stopData = await this.emergencyStop({
      messageId: message.id,
      questionType: 'user', // Asumimos que es pregunta de usuario para regenerar
      shouldRestoreToInput: false
    });
    
    return stopData;
  }

  private async collectCurrentStopData(options?: any): Promise<StopRequestData> {
    const messages = this.state.messages;
    const streamingMessage = this.state.currentStreamingMessage;
    
    // Determinar tipo de pregunta
    let questionType: 'user' | 'predefined' = 'user';
    let questionContent = '';
    let messageId = options?.messageId;
    let shouldRestoreToInput = options?.shouldRestoreToInput ?? true;
    let shouldCleanMessages = true;
    
    // Usar el tipo proporcionado o determinar automáticamente
    if (options?.questionType) {
      questionType = options.questionType;
    } else if (this.lastUserQuestion) {
      questionType = this.lastUserQuestion.type;
      questionContent = this.lastUserQuestion.content;
    }
    
    // Buscar última pregunta de usuario si no la tenemos
    if (!questionContent && messages.length > 0) {
      const userMessages = messages.filter(m => m.sender === 'user' || m.isUser);
      if (userMessages.length > 0) {
        const lastUserMessage = userMessages[userMessages.length - 1];
        questionContent = lastUserMessage.content || lastUserMessage.text || '';
        
        if (!questionType) {
          const isPredefined = (lastUserMessage as any)._isPredefinedQuestion;
          questionType = isPredefined ? 'predefined' : 'user';
        }
      }
    }
    
    // Para preguntas predefinidas, NO restaurar al input
    if (questionType === 'predefined') {
      shouldRestoreToInput = false;
    }
    
    // Para streaming actual, obtener el ID
    if (!messageId && streamingMessage?.isStreaming) {
      messageId = streamingMessage.id;
    }
    
    return {
      messageId,
      questionType,
      questionContent,
      shouldRestoreToInput,
      shouldCleanMessages: true // Siempre limpiar mensajes
    };
  }

  private stopAllActiveProcesses(): void {
    console.log('⏹️ Deteniendo todos los procesos activos...');
    
    // 1. Detener streaming
    this.streamingModule.cancelStream();
    
    // 2. Cancelar consulta WebSocket
    this.websocketModule.cancelCurrentQuery();
    
    // 3. Detener motor
    this.engine.stopCurrentRequest();
    
    // 4. Resetear estado
    this.state.setProcessing(false);
    this.state.setStreamingMessage(null);
    
    // 5. Resetear tiempos
    this.processingMessageId = null;
    this.lastProcessingStartTime = 0;
  }

  private async cleanupMessagesByQuestionType(data: StopRequestData): Promise<void> {
    if (!data.shouldCleanMessages) return;
    
    const messages = this.state.messages;
    console.log('🧹 Limpiando mensajes. Tipo:', data.questionType);
    
    if (data.questionType === 'user' && data.questionContent) {
      // CASO 1: Pregunta de usuario - mantener pregunta, limpiar respuesta
      await this.cleanupForUserQuestion(data, messages);
    } else if (data.questionType === 'predefined') {
      // CASO 2: Pregunta predefinida - limpiar TODO
      await this.cleanupForPredefinedQuestion(data, messages);
    } else {
      // CASO 3: Desconocido - limpiar mensajes de streaming
      this.cleanupStreamingMessagesOnly(messages);
    }
  }

  private async cleanupForUserQuestion(data: StopRequestData, messages: ChatMessage[]): Promise<void> {
    console.log('👤 Limpieza para pregunta de usuario');
    
    // Encontrar la pregunta del usuario
    const userMessage = messages.find(m => 
      (m.sender === 'user' || m.isUser) && 
      (m.content === data.questionContent || m.text === data.questionContent)
    );
    
    if (userMessage) {
      // Encontrar respuestas de bot después de esta pregunta
      const userIndex = messages.indexOf(userMessage);
      const messagesAfter = messages.slice(userIndex + 1);
      const botResponses = messagesAfter.filter(m => 
        m.sender === 'bot' || !m.isUser
      );
      
      // Eliminar respuestas de bot
      botResponses.forEach(msg => {
        if (msg.id) {
          this.state.removeMessage(m => m.id === msg.id);
        }
      });
      
      console.log(`🗑️ Eliminadas ${botResponses.length} respuestas de bot`);
    }
  }

  private async cleanupForPredefinedQuestion(data: StopRequestData, messages: ChatMessage[]): Promise<void> {
    console.log('🔖 Limpieza para pregunta predefinida');
    
    // Para preguntas predefinidas, limpiar pregunta y respuesta
    const predefinedQuestions = messages.filter(m => 
      (m.sender === 'user' || m.isUser) && 
      (m as any)._isPredefinedQuestion === true
    );
    
    if (predefinedQuestions.length > 0) {
      const lastPredefinedQuestion = predefinedQuestions[predefinedQuestions.length - 1];
      
      // Eliminar la pregunta predefinida
      this.state.removeMessage(m => m.id === lastPredefinedQuestion.id);
      
      // Eliminar respuestas de bot después de esta pregunta
      const questionIndex = messages.indexOf(lastPredefinedQuestion);
      const messagesAfter = messages.slice(questionIndex + 1);
      const botResponses = messagesAfter.filter(m => 
        m.sender === 'bot' || !m.isUser
      );
      
      botResponses.forEach(msg => {
        if (msg.id) {
          this.state.removeMessage(m => m.id === msg.id);
        }
      });
      
      console.log(`🗑️ Eliminada pregunta predefinida y ${botResponses.length} respuestas`);
    }
  }

  private cleanupStreamingMessagesOnly(messages: ChatMessage[]): void {
    console.log('🌀 Limpieza genérica de mensajes streaming');
    
    const streamingMessages = messages.filter(m => m.isStreaming);
    streamingMessages.forEach(msg => {
      if (msg.id) {
        this.state.removeMessage(m => m.id === msg.id);
      }
    });
    
    console.log(`🗑️ Eliminados ${streamingMessages.length} mensajes de streaming`);
  }

  private updateConversationAfterStop(data: StopRequestData): void {
    const activeConversation = this.conversationService.getActiveConversation();
    if (!activeConversation) return;
    
    // Sincronizar mensajes actuales con la conversación
    const currentMessages = this.state.messages
      .filter(m => !m.isStreaming) // No incluir mensajes streaming
      .map(m => ({
        id: m.id,
        content: m.content || m.text || '',
        sender: m.sender || (m.isUser ? 'user' : 'bot'),
        timestamp: m.timestamp || new Date(),
        sources: this.messageParser.formatSources(m.sources || []),
        feedback: m.feedback || null,
        isStreaming: false
      }));
    
    this.conversationService.updateConversationMessages(
      activeConversation.id,
      currentMessages
    );
  }

  private resetInternalState(): void {
    this.processingMessageId = null;
    this.lastProcessingStartTime = 0;
    
    // Resetear motor si es necesario
    if (typeof this.engine['resetEngineState'] === 'function') {
      (this.engine as any).resetEngineState();
    }
  }

  private setupStopEventListener(): void {
    // Escuchar eventos de STOP del streaming module
    this.streamingModule.onStreamComplete
      .pipe(takeUntil(this.destroy$))
      .subscribe(result => {
        if (result.wasCancelled) {
          console.log('📡 Streaming cancelado, ejecutando limpieza automática');
          // Si fue cancelado, hacer limpieza automática
          setTimeout(() => {
            this.cleanupAfterStreamingCancellation();
          }, 100);
        }
      });
  }

  private cleanupAfterStreamingCancellation(): void {
    // Limpiar mensajes de streaming obsoletos
    const messages = this.state.messages;
    const streamingMessages = messages.filter(m => 
      m.isStreaming && 
      (!m.content || m.content.trim().length === 0)
    );
    
    streamingMessages.forEach(msg => {
      if (msg.id) {
        this.state.removeMessage(m => m.id === msg.id);
      }
    });
    
    // Resetear estado
    this.state.setProcessing(false);
  }

  private trackLastUserQuestion(): void {
    this.state.messages$
      .pipe(takeUntil(this.destroy$))
      .subscribe(messages => {
        const userMessages = messages.filter(m => m.sender === 'user' || m.isUser);
        if (userMessages.length > 0) {
          const lastUserMessage = userMessages[userMessages.length - 1];
          const isPredefined = (lastUserMessage as any)._isPredefinedQuestion;
          
          this.lastUserQuestion = {
            content: lastUserMessage.content || lastUserMessage.text || '',
            id: lastUserMessage.id || '',
            type: isPredefined ? 'predefined' : 'user'
          };
        }
      });
  }

  // ============ MÉTODOS EXISTENTES (MODIFICADOS) ============

  private setupUrlFilters(): void {
    this.route.queryParams
      .pipe(takeUntil(this.destroy$))
      .subscribe(params => {
        const filters: any = {};
        
        const paramMappings: { [key: string]: string } = {
          'tumor_type': 'tumor_type',
          'cancer_type': 'cancer_type',
          'gene': 'gene',
          'mutation_type': 'mutation_type',
          'treatment_drug': 'treatment_drug',
          'treatment_family': 'treatment_family',
          'treatment_response': 'treatment_response'
        };
        
        Object.keys(paramMappings).forEach(paramKey => {
          if (params[paramKey]) {
            filters[paramMappings[paramKey]] = params[paramKey];
          }
        });
        
        Object.keys(filters).forEach(key => {
          if (!filters[key]?.trim()) delete filters[key];
        });
        
        this.filtersModule.setUrlFilters(filters);
      });
  }

  private setupStreamingCompletionListener(): void {
    this.streamingModule.onStreamComplete
      .pipe(takeUntil(this.destroy$))
      .subscribe(result => {
        if (!this.state.isProcessing && this.processingMessageId) {
          this.processingMessageId = null;
          this.lastProcessingStartTime = 0;
        }
      });
  }

  private monitorConnection(): void {
    this.connectionStatus$
      .pipe(takeUntil(this.destroy$))
      .subscribe(status => {
        if ((status === 'disconnected' || status === 'error') && this.initializationComplete) {
          setTimeout(() => {
            if (!this.isConnected()) {
              this.websocketModule.reconnect();
            }
          }, 3000);
        }
      });
  }

  private setupHungStateDetection(): void {
    setInterval(() => {
      if (this.state.isProcessing && this.lastProcessingStartTime > 0) {
        const processingTime = Date.now() - this.lastProcessingStartTime;
        
        if (processingTime > this.MAX_PROCESSING_TIME) {
          this.softResetProcessingState();
        }
      }
    }, 10000);
  }

  // ============ MÉTODOS PARA CONVERSACIONES ============

  getConversations(): Conversation[] {
    return this.conversationService.getConversations();
  }

  getCurrentConversation(): Conversation | null {
    return this.conversationService.getActiveConversation();
  }

  createNewConversation(firstMessage?: string): Conversation {
    // 1. Limpiar estado actual ANTES de crear nueva conversación
    this.engine.clearChat();
    this.state.clearMessages();
    this.state.setProcessing(false);
    this.processingMessageId = null;
    this.lastProcessingStartTime = 0;
    this.lastUserQuestion = null;
    
    // 2. Cancelar cualquier streaming activo
    this.streaming.cancelStream();
    this.websocket.cancelCurrentQuery();
    
    // 3. Crear nueva conversación
    const newConversation = this.conversationService.createConversation(firstMessage);
    
    return newConversation;
  }

  setCurrentConversation(conversationId: string): boolean {
    return this.conversationService.selectConversation(conversationId);
  }

  loadConversationToChat(conversationId: string): void {
    this.conversationService.selectConversation(conversationId);
  }

  deleteConversation(conversationId: string): boolean {
    return this.conversationService.deleteConversation(conversationId);
  }

  updateConversationTitle(conversationId: string, title: string): boolean {
    return this.conversationService.renameConversation(conversationId, title);
  }

  // ============ MÉTODOS PRINCIPALES ============

  async sendMessage(
    message: string, 
    customFilters: any = null,
    fromSidebar: boolean = false,
    questionType: 'user' | 'predefined' = 'user'
  ): Promise<boolean> {
    if (!this.initializationComplete) {
      return false;
    }
    
    // Verificar si puede enviar
    if (!this.canSendMessages()) {
      if (this.checkForInconsistentState()) {
        await this.softResetProcessingState();
        await new Promise(resolve => setTimeout(resolve, 100));
        
        if (this.canSendMessages()) {
          return this.sendMessage(message, customFilters, fromSidebar, questionType);
        }
      }
      
      return false;
    }
    
    // Registrar inicio de procesamiento
    this.processingMessageId = `user-${Date.now()}`;
    this.lastProcessingStartTime = Date.now();
    
    // Registrar última pregunta del usuario
    this.lastUserQuestion = {
      content: message,
      id: this.processingMessageId,
      type: questionType
    };
    
    // Agregar mensaje a conversación activa
    const currentConversation = this.getCurrentConversation();
    if (!currentConversation) {
      this.conversationService.createConversation(message);
    } else {
      this.conversationService.addMessage(message, 'user');
    }
    
    // Enviar al motor
    const result = await this.engine.sendUserMessage(message, customFilters, fromSidebar, questionType);
    
    if (!result) {
      this.processingMessageId = null;
      this.lastProcessingStartTime = 0;
      this.lastUserQuestion = null;
    }
    
    return result;
  }

  canSendMessages(): boolean {
    const now = Date.now();
    
    // Cache de verificación por intervalo
    if (now - this.lastCanSendCheck < this.CAN_SEND_CHECK_INTERVAL) {
      return !this.state.isProcessing && 
             !this.streamingModule.getIsAnimating() && 
             this.initializationComplete &&
             this.engine.canSendMessage();
    }
    
    this.lastCanSendCheck = now;
    
    const hasActiveStreaming = !!this.state.currentStreamingMessage?.isStreaming;
    const isEngineReady = this.engine.canSendMessage();
    const isServiceReady = this.initializationComplete;
    const isStateProcessing = this.state.isProcessing;
    const isStreamingAnimating = this.streamingModule.getIsAnimating();
    const isConnected = this.engine.isConnected();
    
    // Detectar streaming activo
    const actuallyStreaming = hasActiveStreaming || isStreamingAnimating;
    
    if (actuallyStreaming) {
      if (isStateProcessing && !this.engine.canSendMessage()) {
        // Estado correcto
      } else {
        return false;
      }
    }
    
    // Detectar desincronización
    if (isStateProcessing && isEngineReady && !actuallyStreaming) {
      setTimeout(() => {
        if (this.state.isProcessing && this.engine.canSendMessage() && !actuallyStreaming) {
          this.state.setProcessing(false);
        }
      }, 0);
    }
    
    const result = isEngineReady && isServiceReady && !isStateProcessing && isConnected;
    
    return result;
  }

  private async softResetProcessingState(): Promise<void> {
    if (this.streamingModule.getIsAnimating()) {
      this.streamingModule.cancelStream();
    }
    
    this.state.setProcessing(false);
    this.processingMessageId = null;
    this.lastProcessingStartTime = 0;
  }

  private checkForInconsistentState(): boolean {
    const hasActiveStreaming = !!this.state.currentStreamingMessage?.isStreaming;
    const isStreamingAnimating = this.streamingModule.getIsAnimating();
    const isConnected = this.engine.isConnected();
    
    const processingTime = Date.now() - this.lastProcessingStartTime;
    const isProcessingTooLong = processingTime > 5000;
    
    const isInconsistent = this.state.isProcessing && 
                          !hasActiveStreaming && 
                          !isStreamingAnimating &&
                          !isConnected &&
                          isProcessingTooLong;
    
    return isInconsistent;
  }

  // ============ API PÚBLICA ============

  isConnected(): boolean {
    return this.engine.isConnected();
  }

  getConnectionStatus(): Observable<string> {
    return this.connectionStatus$;
  }

  getIsProcessing(): boolean {
    return this.state.isProcessing;
  }

  getCurrentFilters(): any {
    return this.filtersModule.getCombinedFilters();
  }

  hasActiveFilters(): boolean {
    return this.filtersModule.hasActiveFilters();
  }

  clearHistory(): void {
    this.state.clearMessages();
    this.conversationService.clearAll();
    this.streamingModule.cancelStream();
    this.processingMessageId = null;
    this.lastProcessingStartTime = 0;
    this.lastUserQuestion = null;
  }

  getMessages(): ChatMessage[] {
    return this.state.messages;
  }

  getPredefinedQuestions(): any[] {
    return this.suggestionsService.getPredefinedQuestions();
  }

  loadPredefinedQuestion(question: string): void {
    if (!this.state.isProcessing) {
      this.sendPredefinedQuestion(question, {});
    }
  }

  async loadQuestionFromSidebar(question: string): Promise<void> {
    if (!this.canSendMessages()) {
      return;
    }
    
    await this.sendMessage(question, {}, true, 'predefined');
  }

  sendPredefinedQuestion(question: string, customFilters: any = null): Promise<boolean> {
    return this.sendMessage(question, customFilters, false, 'predefined');
  }

  sendUserQuestion(question: string, customFilters: any = null): Promise<boolean> {
    return this.sendMessage(question, customFilters, false, 'user');
  }

  sendFeedback(message: ChatMessage, rating: 'up' | 'down' | null = null, comment: string = ''): void {
    if (!message?.id) {
      return;
    }
    
    this.feedbackModule.sendFeedback(message, rating, comment);
    
    if (rating) {
      const feedback = rating === 'up' ? 'like' : 'dislike';
      this.conversationService.updateMessageFeedback(message.id, feedback);
    }
  }
  
  newChat(): void {
    // 1. Crear nueva conversación
    const newConversation = this.createNewConversation();
    
    // 2. Forzar sincronización del estado
    setTimeout(() => {
      this.state.clearMessages();
      this.state.setProcessing(false);
    }, 50);
  }

  testConnection(): void {
    this.websocketModule.reconnect();
  }

  getDebugState(): any {
    const currentConversation = this.getCurrentConversation();
    const conversations = this.getConversations();
    
    const debugState = {
      initializationComplete: this.initializationComplete,
      isProcessing: this.state.isProcessing,
      isConnected: this.isConnected(),
      canSendMessages: this.canSendMessages(),
      messageCount: this.state.messages.length,
      conversationCount: conversations.length,
      streamingActive: this.streamingModule.getIsAnimating(),
      processingMessageId: this.processingMessageId,
      currentStreamingMessage: this.state.currentStreamingMessage?.id,
      filters: this.getCurrentFilters(),
      engineStatus: this.engine['getStatus'] ? this.engine['getStatus']() : 'N/A',
      processingTime: this.lastProcessingStartTime > 0 ? Date.now() - this.lastProcessingStartTime : 0,
      currentConversationId: currentConversation?.id || 'none',
      currentConversationTitle: currentConversation?.title || 'none',
      currentConversationMessageCount: currentConversation?.messages.length || 0,
      totalConversations: conversations.length,
      totalMessagesInConversations: conversations.reduce((sum, conv) => sum + conv.messages.length, 0),
      lastUserQuestion: this.lastUserQuestion,
      lastStopData: this.lastStopData
    };
    
    return debugState;
  }

  isMessageBeingProcessed(messageId: string): boolean {
    return this.processingMessageId === messageId && this.state.isProcessing;
  }

  // ============ MÉTODOS ADICIONALES PARA CONVERSACIONES ============

  getConversationsInfo(): {
    total: number;
    activeConversation: string | null;
    totalMessages: number;
  } {
    const conversations = this.getConversations();
    const currentConversation = this.getCurrentConversation();
    const totalMessages = conversations.reduce((sum, conv) => sum + conv.messages.length, 0);
    
    const info = {
      total: conversations.length,
      activeConversation: currentConversation?.id || null,
      totalMessages: totalMessages
    };
    
    return info;
  }

  exportConversations(): string {
    const conversations = this.getConversations();
    return JSON.stringify(conversations, null, 2);
  }

  importConversations(jsonString: string): boolean {
    try {
      const conversations = JSON.parse(jsonString);
      
      if (!Array.isArray(conversations)) {
        throw new Error('Invalid conversations format');
      }
      
      this.conversationService.clearAll();
      
      conversations.forEach((conversation) => {
        const newConversation = this.conversationService.createConversation();
        
        this.conversationService.updateConversationMessages(
          newConversation.id, 
          conversation.messages || []
        );
        
        if (conversation.title && conversation.title !== 'New Chat') {
          this.conversationService.renameConversation(newConversation.id, conversation.title);
        }
      });
      
      return true;
      
    } catch (error) {
      return false;
    }
  }
  
  
    
  simulateStopScenario(type: 'user' | 'predefined'): void {
    const testMessage = type === 'user' 
      ? 'Esta es una pregunta de usuario de prueba'
      : '¿Cuáles son los síntomas del cáncer de pulmón?';
    
    const testData: StopRequestData = {
      questionType: type,
      questionContent: testMessage,
      shouldRestoreToInput: type === 'user',
      shouldCleanMessages: true
    };
    
    console.log('🧪 Simulando escenario STOP:', testData);
    this.stopRequested$.next(testData);
  }
  

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.websocketModule.disconnect();
    this.processingMessageId = null;
    this.lastProcessingStartTime = 0;
    this.lastUserQuestion = null;
    this.lastStopData = null;
  }
}