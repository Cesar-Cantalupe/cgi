import { Injectable, OnDestroy } from '@angular/core';
import { WebsocketModule } from '../modules/websocket.module';
import { StreamingModule } from '../modules/streaming.module';
import { ConversationService } from './conversation.service';
import { FiltersModule } from '../modules/filters.module';
import { ChatbotStateService, MessageCleanupOptions } from './chatbot-state.service';
import { TranslationService } from '../../translation.service';
import { ChatMessage } from '../interfaces/chat-message.interface';
import { Subscription } from 'rxjs';

interface StreamingCompleteResult {
  content: string;
  sources: any[];
  question: string;
  wasCancelled?: boolean;
}

@Injectable({ providedIn: 'root' })
export class ChatbotEngineService implements OnDestroy {
  private lastUserMessage: string = '';
  private lastUserMessageId: string = '';
  private streamingCompleteSubscription?: Subscription;
  private messageSubscription?: Subscription;
  private currentBotMessageId: string | null = null;
  private isSaving = false;
  private saveQueue: Array<{question: string, answer: string, sources?: any[]}> = [];
  private currentStreamingMessageId: string | null = null;
  private isStreamingActive = false;
  private streamStartTime: number = 0;
  
  private stopRequested = false;
  private isRegenerating = false;
  private isHandlingStop = false;

  private currentQuestionType: 'user' | 'predefined' | null = null;
  private lastUserMessageObject: ChatMessage | null = null;
  
  private currentPredefinedQuestionId: string | null = null;
  
  // Cache para información de la última pregunta
  private lastQuestionData: {
    content: string;
    id: string;
    type: 'user' | 'predefined';
    timestamp: number;
  } | null = null;

  constructor(
    private state: ChatbotStateService,
    private websocket: WebsocketModule,
    private streaming: StreamingModule,
    private conversationService: ConversationService,
    private filters: FiltersModule,
    private translation: TranslationService
  ) {
    console.log('🚀 ChatbotEngineService creado');
    this.setupStreamingCompletionListener();
    this.setupMessageMonitoring();
    this.setupHungStateDetection();
    this.setupStopCoordination();
  }
  
  async sendUserMessage(
    message: string, 
    customFilters: any = null,
    fromSidebar: boolean = false,
    questionType: 'user' | 'predefined' = 'user'
  ): Promise<boolean> {
    console.log('📤 ChatbotEngineService.sendUserMessage:', {
      message: message.substring(0, 50) + (message.length > 50 ? '...' : ''),
      questionType,
      fromSidebar
    });
    
    if (!this.canSendMessage()) {
      console.warn('❌ No se puede enviar mensaje:', this.translation.instant('ERRORS.ENGINE_CANNOT_SEND_MESSAGE'));
      return false;
    }
    
    if (!message.trim()) {
      console.warn('❌ Mensaje vacío');
      return false;
    }
    
    try {
      // Registrar última pregunta
      this.lastUserMessage = message;
      this.lastUserMessageId = `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      this.currentQuestionType = questionType;
      
      // Guardar datos de la pregunta
      this.lastQuestionData = {
        content: message,
        id: this.lastUserMessageId,
        type: questionType,
        timestamp: Date.now()
      };
      
      if (questionType === 'predefined') {
        this.currentPredefinedQuestionId = this.lastUserMessageId;
      }
      
      this.state.setProcessing(true);
      
      const userMessage = this.addUserMessage(message, questionType);
      this.lastUserMessageObject = userMessage;
      
      const streamingMessageId = `stream-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      console.log('📝 Creando mensaje de streaming placeholder:', streamingMessageId);
      const placeholderMessage: ChatMessage = {
        id: streamingMessageId,
        content: '',
        text: '', // Asegurar que text también esté presente
        sender: 'bot',
        isUser: false,
        isStreaming: true,
        timestamp: new Date(),
        _streamingUpdate: Date.now(),
        _isProcessingPlaceholder: true, // Solo placeholder al inicio
        _originalQuestionType: questionType,
        showFeedbackBox: false
      };
      
      this.state.addMessage(placeholderMessage);
      
      this.currentBotMessageId = streamingMessageId;
      this.currentStreamingMessageId = streamingMessageId;
      
      this.state.setStreamingMessage(placeholderMessage);
      
      this.streaming.setLastQuestion(message);
      this.isStreamingActive = true;
      this.streamStartTime = Date.now();
      this.stopRequested = false;
      this.isHandlingStop = false;
      
      const filterConfig = this.filters.getCombinedFilters(customFilters);
      
      this.websocket.sendQuery(message, filterConfig);
      
      return true;
      
    } catch (error) {
      console.error('💥 Error enviando mensaje:', error, this.translation.instant('ERRORS.SEND_USER_MESSAGE_ERROR'));
      this.addSystemMessage('ERRORS.CONNECTION_ERROR');
      this.state.setProcessing(false);
      
      if (this.currentStreamingMessageId) {
        this.state.removeMessage(msg => msg.id === this.currentStreamingMessageId);
      }
      
      this.currentPredefinedQuestionId = null;
      this.lastQuestionData = null;
      
      return false;
    }
  }

  /**
   * Método especial para regeneración que reutiliza el mensaje de usuario existente
   */
  async regenerateResponse(
    message: string,
    existingUserMessageId: string,
    customFilters: any = null,
    questionType: 'user' | 'predefined' = 'user'
  ): Promise<boolean> {
    console.log('🔄 ChatbotEngineService.regenerateResponse:', {
      message: message.substring(0, 50),
      existingUserMessageId,
      questionType
    });
    
    if (!this.canSendMessage()) {
      console.warn('❌ No se puede enviar mensaje para regeneración');
      return false;
    }
    
    try {
      // Reutilizar el ID del mensaje existente
      this.lastUserMessage = message;
      this.lastUserMessageId = existingUserMessageId; // NO crear nuevo ID
      this.currentQuestionType = questionType;
      
      this.lastQuestionData = {
        content: message,
        id: existingUserMessageId,
        type: questionType,
        timestamp: Date.now()
      };
      
      this.state.setProcessing(true);
      
      const streamingMessageId = `stream-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      console.log('📝 Creando nuevo mensaje de streaming para regeneración:', streamingMessageId);
      const placeholderMessage: ChatMessage = {
        id: streamingMessageId,
        content: '',
        text: '',
        sender: 'bot',
        isUser: false,
        isStreaming: true,
        timestamp: new Date(),
        _streamingUpdate: Date.now(),
        _isProcessingPlaceholder: true,
        _originalQuestionType: questionType,
        showFeedbackBox: false
      };
      
      this.state.addMessage(placeholderMessage);
      
      this.currentBotMessageId = streamingMessageId;
      this.currentStreamingMessageId = streamingMessageId;
      
      this.state.setStreamingMessage(placeholderMessage);
      
      this.streaming.setLastQuestion(message);
      this.isStreamingActive = true;
      this.streamStartTime = Date.now();
      this.stopRequested = false;
      this.isHandlingStop = false;
      
      const filterConfig = this.filters.getCombinedFilters(customFilters);
      
      this.websocket.sendQuery(message, filterConfig);
      
      return true;
      
    } catch (error) {
      console.error('💥 Error en regeneración:', error);
      this.state.setProcessing(false);
      
      if (this.currentStreamingMessageId) {
        this.state.removeMessage(msg => msg.id === this.currentStreamingMessageId);
      }
      
      return false;
    }
  }
  
  private addUserMessage(text: string, questionType: 'user' | 'predefined' = 'user'): ChatMessage {
    const message: ChatMessage = {
      id: this.lastUserMessageId,
      content: text,
      text: text,
      sender: 'user',
      isUser: true,
      timestamp: new Date(),
      isStreaming: false,
      _isPredefinedQuestion: questionType === 'predefined'
    };
    
    this.state.addMessage(message);
    
    // También agregar al ConversationService
    this.conversationService.addMessage(text, 'user');
    
    return message;
  }
  
  private addSystemMessage(textKey: string): void {
    const translatedText = this.translation.instant(textKey);
    const message: ChatMessage = {
      id: `system-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      content: translatedText,
      text: translatedText,
      sender: 'system',
      isUser: false,
      timestamp: new Date(),
      isStreaming: false
    };
    
    this.state.addMessage(message);
  }

  private setupStopCoordination(): void {
    // El ChatbotService maneja la coordinación principal
    // Este servicio solo necesita responder a eventos de stop
  }

  // ============ NUEVOS MÉTODOS PARA EL SISTEMA UNIFICADO DE STOP ============

  /**
   * Método principal para detener procesos activos
   * Integrado con el sistema unificado del ChatbotService
   */
  stopCurrentRequest(): void {
    console.log('⏹️ ChatbotEngineService.stopCurrentRequest() llamado');
    
    if (this.isHandlingStop) {
      console.log('🔄 Ya se está manejando un stop');
      return;
    }
    
    this.isHandlingStop = true;
    this.stopRequested = true;
    
    // 1. Cancelar consulta WebSocket
    this.websocket.cancelCurrentQuery();
    
    // 2. Cancelar streaming
    this.streaming.cancelStream();
    
    // 3. Marcar streaming como inactivo
    if (this.isStreamingActive) {
      this.isStreamingActive = false;
    }
    
    // 4. Limpiar mensajes de streaming inmediatamente
    this.cleanupActiveStreamingMessages();
    
    // 5. Resetear estado interno
    this.resetEngineStateAfterStop();
    
    console.log('✅ ChatbotEngineService: Stop completado');
  }

  /**
   * Método para obtener información de la pregunta actual
   * Útil para el sistema unificado de STOP
   */
  getCurrentQuestionInfo(): {
    id: string | null;
    content: string;
    type: 'user' | 'predefined' | null;
    shouldRestoreToInput: boolean;
    shouldCleanMessages: boolean;
  } {
    const currentData = this.findCurrentQuestionBeingAnswered();
    
    let shouldRestoreToInput = false;
    let shouldCleanMessages = true;
    
    if (currentData.questionType === 'user') {
      shouldRestoreToInput = true;
      // Para preguntas de usuario: mantener pregunta, limpiar respuestas
      shouldCleanMessages = true;
    } else if (currentData.questionType === 'predefined') {
      shouldRestoreToInput = false;
      // Para preguntas predefinidas: limpiar TODO
      shouldCleanMessages = true;
    }
    
    return {
      id: currentData.questionId,
      content: this.lastUserMessage || '',
      type: currentData.questionType,
      shouldRestoreToInput,
      shouldCleanMessages
    };
  }

  /**
   * Método para limpiar mensajes según el tipo de pregunta
   * Integrado con ChatbotStateService
   */
  cleanupMessagesByQuestionType(questionType: 'user' | 'predefined' | null, questionId?: string): number {
    console.log('🧹 ChatbotEngineService.cleanupMessagesByQuestionType:', { questionType, questionId });
    
    if (!questionType) {
      // Limpieza genérica: solo mensajes de streaming
      return this.state.cleanupActiveStreamingMessages();
    }
    
    let cleanupCount = 0;
    
    if (questionType === 'user') {
      // Para preguntas de usuario: mantener pregunta, limpiar respuestas
      if (questionId) {
        cleanupCount = this.state.cleanupBotResponsesAfterQuestion(questionId);
      } else {
        // Limpiar todas las respuestas de bot
        cleanupCount = this.state.cleanupBotResponsesOnly();
      }
    } 
    else if (questionType === 'predefined') {
      // Para preguntas predefinidas: limpiar pregunta y respuestas
      if (questionId) {
        // Limpiar respuestas después de la pregunta
        const botResponsesCount = this.state.cleanupBotResponsesAfterQuestion(questionId);
        
        // Limpiar la pregunta misma
        this.state.removeMessage(m => m.id === questionId);
        
        cleanupCount = botResponsesCount + 1;
      } else {
        // Limpiar la última pregunta predefinida
        cleanupCount = this.state.cleanupPredefinedQuestion();
      }
    }
    
    console.log(`✅ ChatbotEngineService: Limpiados ${cleanupCount} mensajes`);
    return cleanupCount;
  }

  /**
   * Limpia mensajes de streaming activos inmediatamente
   */
  private cleanupActiveStreamingMessages(): number {
    return this.state.cleanupActiveStreamingMessages();
  }

  // ============ MÉTODOS EXISTENTES MEJORADOS ============

  private handleStopCompletion(result: StreamingCompleteResult): void {
    if (this.isStreamingActive) {
      this.isStreamingActive = false;
    }
    
    const { questionId, questionType } = this.findCurrentQuestionBeingAnswered();
    
    // Usar el nuevo sistema de limpieza
    if (questionId && questionType) {
      this.cleanupMessagesByQuestionType(questionType, questionId);
    }
    
    this.saveQueue = this.saveQueue.filter(item => 
      item.question !== this.lastUserMessage
    );
    
    // Resetear estado
    this.resetEngineStateAfterStop();
  }

  private setupStreamingCompletionListener(): void {
    if (this.streamingCompleteSubscription) {
      this.streamingCompleteSubscription.unsubscribe();
    }
    
    this.streamingCompleteSubscription = this.streaming.onStreamComplete.subscribe({
      next: (result: StreamingCompleteResult) => {
        console.log('🎬 Streaming completado:', {
          contentLength: result.content?.length,
          sourcesCount: result.sources?.length,
          wasCancelled: result.wasCancelled,
          question: result.question?.substring(0, 50)
        });
        
        if (result.wasCancelled) {
          if (this.isStreamingActive) {
            this.isStreamingActive = false;
          }
          
          // NO resetear estado inmediatamente - el sistema unificado manejará la limpieza
          // Solo marcar que no estamos procesando
          this.state.setProcessing(false);
          
          console.log('📡 Streaming cancelado - limpieza manejada por sistema unificado');
          return;
        }
        
        if (this.stopRequested) {
          this.handleStopCompletion(result);
          return;
        }
        
        if (this.isStreamingActive) {
          this.isStreamingActive = false;
        }
        
        this.currentBotMessageId = null;
        this.currentStreamingMessageId = null;
        
        this.state.setProcessing(false);
        
        const questionToSave = result.question || this.lastUserMessage;
        if (questionToSave && result.content && result.content.trim()) {
          this.lastUserMessage = '';
          this.lastUserMessageId = '';
          this.lastUserMessageObject = null;
          this.currentQuestionType = null;
          this.currentPredefinedQuestionId = null;
          this.lastQuestionData = null;
        }
      },
      error: (error: any) => {
        console.error('💥 Error en completación de streaming:', error);
        
        if (this.isStreamingActive) {
          this.isStreamingActive = false;
        }
        
        this.state.setProcessing(false);
        this.currentBotMessageId = null;
        this.currentStreamingMessageId = null;
        this.stopRequested = false;
        this.currentQuestionType = null;
        this.currentPredefinedQuestionId = null;
        this.lastQuestionData = null;
        this.isHandlingStop = false;
      }
    });
  }

  private findCurrentQuestionBeingAnswered(): { questionId: string | null, questionType: 'user' | 'predefined' | null } {
    const messages = this.state.messages;

    if (messages.length === 0) {
      return { questionId: null, questionType: null };
    }
    
    // Prioridad 1: Usar datos de última pregunta cacheados
    if (this.lastQuestionData) {
      return { 
        questionId: this.lastQuestionData.id, 
        questionType: this.lastQuestionData.type 
      };
    }
    
    // Prioridad 2: Usar lastUserMessageId
    if (this.lastUserMessageId) {
      const question = messages.find(m => m.id === this.lastUserMessageId);
      if (question) {
        const isPredefined = (question as any)._isPredefinedQuestion || false;
        return { 
          questionId: this.lastUserMessageId, 
          questionType: isPredefined ? 'predefined' : 'user' 
        };
      }
    }
    
    // Prioridad 3: Buscar en mensajes
    const userMessages = messages.filter(m => m.sender === 'user' || m.isUser);
    if (userMessages.length > 0) {
      const lastUserMessage = userMessages[userMessages.length - 1];
      const isPredefined = (lastUserMessage as any)._isPredefinedQuestion || false;
      
      return { 
        questionId: lastUserMessage.id || null, 
        questionType: isPredefined ? 'predefined' : 'user' 
      };
    }
    
    return { questionId: null, questionType: null };
  }

  private resetEngineStateAfterStop(): void {
    console.log('🔄 ChatbotEngineService: Reseteando estado después de STOP');
    
    this.currentBotMessageId = null;
    this.currentStreamingMessageId = null;
    this.currentQuestionType = null;
    this.currentPredefinedQuestionId = null;
    this.stopRequested = false;
    this.isHandlingStop = false;
    
    // No resetear lastQuestionData aquí - el sistema unificado lo necesita
    // this.lastQuestionData = null;
    
    const hasActiveStreaming = this.state.messages.some(m => 
      m.isStreaming && m.sender === 'bot'
    );
    
    if (!hasActiveStreaming) {
      this.state.setProcessing(false);
    }
    
    console.log('✅ Estado resetado después de STOP');
  }

  private resetEngineState(): void {
    this.currentBotMessageId = null;
    this.currentStreamingMessageId = null;
    this.currentQuestionType = null;
    this.currentPredefinedQuestionId = null;
    
    const hasActiveStreaming = this.state.messages.some(m => 
      m.isStreaming && m.sender === 'bot' && !m._isProcessingPlaceholder
    );
    
    if (!hasActiveStreaming) {
      this.state.setProcessing(false);
    }
    
    setTimeout(() => {
      this.stopRequested = false;
      this.isHandlingStop = false;
    }, 200);
  }
  
  private cleanupAfterStopReferences(): void {
    if (this.stopRequested) {
      this.currentStreamingMessageId = null;
      this.currentBotMessageId = null;
      
      setTimeout(() => {
        this.stopRequested = false;
        this.isHandlingStop = false;
      }, 300);
    }
  }

  private async handleRegeneration(message: ChatMessage): Promise<void> {
    if (this.isRegenerating) {
      console.warn(this.translation.instant('ERRORS.ALREADY_REGENERATING'));
      return;
    }
    
    this.isRegenerating = true;
    
    try {
      const messages = this.state.messages;
      const messageIndex = messages.findIndex(msg => msg.id === message.id);
      
      if (messageIndex === -1) {
        this.isRegenerating = false;
        return;
      }
      
      let userMessageIndex = -1;
      let userMessage: ChatMessage | null = null;
      
      for (let i = messageIndex; i >= 0; i--) {
        const msg = messages[i];
        if (msg.sender === 'user' || msg.isUser) {
          userMessageIndex = i;
          userMessage = msg;
          break;
        }
      }
      
      if (!userMessage || !userMessage.content) {
        this.isRegenerating = false;
        return;
      }
      
      if (!this.canSendMessage()) {
        this.isRegenerating = false;
        return;
      }
      
      const questionType = (userMessage as any)._isPredefinedQuestion ? 'predefined' : 'user';
      
      // Limpiar solo la respuesta de bot asociada a este mensaje de usuario
      if (userMessage.id) {
        this.state.cleanupBotResponsesAfterQuestion(userMessage.id);
      }
      
      this.streaming.cancelStream();
      
      this.currentBotMessageId = null;
      this.currentStreamingMessageId = null;
      this.stopRequested = false;
      this.currentPredefinedQuestionId = null;
      
      await new Promise(resolve => setTimeout(resolve, 200));
      
      this.isRegenerating = false;
      
      const result = await this.sendUserMessage(
        userMessage.content,
        this.filters.getCombinedFilters(),
        false,
        questionType
      );
      
      if (!result) {
        throw new Error(this.translation.instant('ERRORS.FAILED_SEND_MESSAGE_REGENERATE'));
      }
      
    } catch (error) {
      console.error(this.translation.instant('ERRORS.REGENERATION_ERROR'), error);
      this.state.setProcessing(false);
      this.isRegenerating = false;
    } finally {
      setTimeout(() => {
        this.isRegenerating = false;
      }, 1000);
    }
  }

  private setupMessageMonitoring(): void {
    if (this.messageSubscription) {
      this.messageSubscription.unsubscribe();
    }
    
    this.messageSubscription = this.state.messages$.subscribe(messages => {
      if (this.stopRequested) {
        this.cleanupAfterStopReferences();
        return;
      }
      
      const streamingMessages = messages.filter(m => 
        m.isStreaming && m.id && m.id.startsWith('stream-')
      );
      
      if (streamingMessages.length > 0 && !this.currentStreamingMessageId) {
        const latestStreaming = streamingMessages.reduce((latest, current) => {
          const latestTime = latest._streamingUpdate || latest.timestamp?.getTime() || 0;
          const currentTime = current._streamingUpdate || current.timestamp?.getTime() || 0;
          return currentTime > latestTime ? current : latest;
        });
        
        this.currentStreamingMessageId = latestStreaming.id || null;
        this.currentBotMessageId = this.currentStreamingMessageId;
        
        if ((latestStreaming as any)._originalQuestionType) {
          this.currentQuestionType = (latestStreaming as any)._originalQuestionType;
        }
      }
      
      if ((this.isStreamingActive || this.currentStreamingMessageId) && !this.stopRequested) {
        const recentUserMessages = messages
          .filter(m => (m.sender === 'user' || m.isUser) && m.content && m.id)
          .slice(-3);
        
        if (recentUserMessages.length > 0) {
          const lastUserMessage = recentUserMessages[recentUserMessages.length - 1];
          const isPredefined = (lastUserMessage as any)._isPredefinedQuestion;
          
          if (isPredefined && this.currentPredefinedQuestionId !== lastUserMessage.id) {
            this.currentPredefinedQuestionId = lastUserMessage.id || null;
            
            if (lastUserMessage.id && !this.lastUserMessageId) {
              this.lastUserMessageId = lastUserMessage.id;
            }
          }
        }
      }
      
      if (!this.isStreamingActive && !this.stopRequested) {
        const recentBotMessages = messages
          .filter(m => m.sender === 'bot' && !m.isStreaming && m.content && m.content.trim().length > 0)
          .slice(-2);
        
        if (recentBotMessages.length > 0 && this.lastUserMessage && !this.isSaving) {
          const lastBotMessage = recentBotMessages[recentBotMessages.length - 1];
          
          const lastUserMessage = messages
            .filter(m => m.sender === 'user' && m.content && m.content === this.lastUserMessage)
            .slice(-1)[0];
          
          if (lastUserMessage && lastBotMessage) {
            const wasInterrupted = this.wasQuestionInterrupted(lastUserMessage.id);
            
            if (!wasInterrupted) {
              setTimeout(() => {
                if (!this.isSaving && this.lastUserMessage && !this.stopRequested) {
                  // Ya no necesitamos guardar manualmente
                  // ConversationService maneja automáticamente
                }
              }, 1000);
            }
          }
        }
      }
      
      this.cleanupOrphanedPlaceholders(messages);
    });
  }

  private cleanupOrphanedPlaceholders(messages: ChatMessage[]): void {
    const orphanedPlaceholders = messages.filter(m => {
      const isPlaceholder = m._isProcessingPlaceholder;
      const isOld = m.timestamp && (Date.now() - m.timestamp.getTime() > 10000);
      const hasNoContent = !m.content || m.content.trim() === '';
      
      return isPlaceholder && (isOld || hasNoContent);
    });
    
    if (orphanedPlaceholders.length > 0 && !this.stopRequested) {
      orphanedPlaceholders.forEach(p => {
        if (p.id) {
          this.state.removeMessage(m => m.id === p.id);
        }
      });
    }
  }

  private setupHungStateDetection(): void {
    setInterval(() => {
      if (this.state.isProcessing && !this.state.currentStreamingMessage?.isStreaming) {
        const processingTime = Date.now() - (this.state.currentStreamingMessage?._streamingUpdate || Date.now());
        
        if (processingTime > 30000) {
          this.forceReset();
        }
      }
      
      if (this.isStreamingActive) {
        const streamDuration = Date.now() - this.streamStartTime;
        if (streamDuration > 120000) {
          this.stopCurrentRequest();
        }
      }
    }, 30000);
  }
  
  private handleConnectionError(): void {
    this.addSystemMessage('ERRORS.CONNECTION_ERROR');
    
    if (this.isStreamingActive) {
      this.isStreamingActive = false;
    }
    
    this.state.setProcessing(false);
    this.stopRequested = false;
    this.isHandlingStop = false;
    
    if (this.currentStreamingMessageId) {
      this.state.updateMessage(this.currentStreamingMessageId, {
        content: this.translation.instant('ERRORS.CONNECTION_ERROR'),
        isStreaming: false,
        showFeedbackBox: false
      });
    }
    
    this.currentBotMessageId = null;
    this.currentStreamingMessageId = null;
    this.currentQuestionType = null;
    this.currentPredefinedQuestionId = null;
    this.lastQuestionData = null;
  }
  
  // ============ API PÚBLICA MEJORADA ============
  
  canSendMessage(): boolean {
    return this.websocket.isConnected() && !this.state.isProcessing;
  }
  
  isConnected(): boolean {
    return this.websocket.isConnected();
  }
  
  clearChat(): void {
    this.state.clearMessages();
    this.streaming.cancelStream();
    
    if (this.isStreamingActive) {
      this.isStreamingActive = false;
    }
    
    this.lastUserMessage = '';
    this.lastUserMessageId = '';
    this.currentBotMessageId = null;
    this.currentStreamingMessageId = null;
    this.isSaving = false;
    this.saveQueue = [];
    this.state.setProcessing(false);
    this.stopRequested = false;
    this.isRegenerating = false;
    this.currentQuestionType = null;
    this.currentPredefinedQuestionId = null;
    this.lastUserMessageObject = null;
    this.lastQuestionData = null;
    this.isHandlingStop = false;
  }
  
  forceReset(): void {
    console.log('🔄 Forzando reset del engine');
    
    if (this.isStreamingActive) {
      this.isStreamingActive = false;
    }
    
    this.lastUserMessage = '';
    this.lastUserMessageId = '';
    this.currentBotMessageId = null;
    this.currentStreamingMessageId = null;
    this.isSaving = false;
    this.saveQueue = [];
    this.stopRequested = false;
    this.isRegenerating = false;
    this.currentQuestionType = null;
    this.currentPredefinedQuestionId = null;
    this.lastUserMessageObject = null;
    this.lastQuestionData = null;
    this.isHandlingStop = false;
    
    this.streaming.cancelStream();
    
    this.state.setProcessing(false);
    
    if (this.streamingCompleteSubscription) {
      this.streamingCompleteSubscription.unsubscribe();
      this.streamingCompleteSubscription = undefined;
    }
    
    if (this.messageSubscription) {
      this.messageSubscription.unsubscribe();
      this.messageSubscription = undefined;
    }
    
    this.setupStreamingCompletionListener();
    this.setupMessageMonitoring();
  }
  
  isStopRequested(): boolean {
    return this.stopRequested;
  }

  isRegeneratingResponse(): boolean {
    return this.isRegenerating;
  }

  getCurrentQuestionType(): 'user' | 'predefined' | null {
    return this.currentQuestionType;
  }
  
  getLastQuestionData() {
    return this.lastQuestionData;
  }
  
  getStatus(): any {
    const questionInfo = this.getCurrentQuestionInfo();
    
    return {
      isProcessing: this.state.isProcessing,
      isConnected: this.isConnected(),
      canSendMessage: this.canSendMessage(),
      currentStreamingMessageId: this.currentStreamingMessageId,
      currentBotMessageId: this.currentBotMessageId,
      lastUserMessage: this.lastUserMessage?.substring(0, 50),
      isSaving: this.isSaving,
      saveQueueLength: this.saveQueue.length,
      isStreamingActive: this.isStreamingActive,
      stopRequested: this.stopRequested,
      isRegenerating: this.isRegenerating,
      currentQuestionType: this.currentQuestionType,
      currentPredefinedQuestionId: this.currentPredefinedQuestionId,
      lastQuestionData: this.lastQuestionData,
      questionInfo: questionInfo,
      isHandlingStop: this.isHandlingStop
    };
  }

  // Método para regeneración
  // regenerateResponse(message: ChatMessage): Promise<boolean> {
  //   console.log('🔄 Regenerando respuesta para:', message.id);
  //   return this.handleRegeneration(message)
  //     .then(() => true)
  //     .catch(() => false);
  // }

  // ============ MÉTODOS DE DEBUG ============
  
  getDebugInfo() {
    const engineStatus = this.getStatus();
    const stateInfo = this.state.getDebugInfo();
    const questionInfo = this.getCurrentQuestionInfo();
    
    return {
      engineStatus: engineStatus,
      stateInfo: stateInfo,
      questionInfo: questionInfo,
      conversationService: {
        activeConversation: this.conversationService.getActiveConversation()?.id,
        conversationsCount: this.conversationService.getConversations().length
      }
    };
  }

  // ============ MÉTODOS AUXILIARES PRIVADOS ============

  private wasQuestionInterrupted(questionId: string | undefined): boolean {
    if (!questionId) return false;
    
    const wasCurrentQuestion = questionId === this.lastUserMessageId;
    const hadStopRequest = this.stopRequested;
    
    return wasCurrentQuestion && hadStopRequest;
  }
  
  private saveToConversation(question: string, answer: string, sources?: any[]): void {
    // Método vacío - ConversationService maneja automáticamente
    this.isSaving = false;
  }
  
  private processSaveQueue(): void {
    // Vacío - ya no hay cola que procesar
    this.saveQueue = [];
    this.isSaving = false;
  }
  
  private tryAlternativeSave(): void {
    // Vacío - ConversationService maneja automáticamente
  }

  ngOnDestroy(): void {
    console.log('🧹 ChatbotEngineService ngOnDestroy');
    
    if (this.isStreamingActive) {
      this.isStreamingActive = false;
    }
    
    if (this.streamingCompleteSubscription) {
      this.streamingCompleteSubscription.unsubscribe();
    }
    
    if (this.messageSubscription) {
      this.messageSubscription.unsubscribe();
    }
    
    this.saveQueue = [];
  }
}