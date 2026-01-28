import { Component, OnInit, OnDestroy, ViewChild, ElementRef, ChangeDetectorRef } from '@angular/core';
import { Subject, combineLatest, takeUntil, debounceTime, distinctUntilChanged } from 'rxjs';
import { ChatbotService, StopRequestData } from '../../services/chatbot/chatbot.service';
import { TranslationService } from '../../services/translation.service';
import { SuggestionsService } from '../../services/suggestions.service';
import { ChatbotStateService } from '../../services/chatbot/core/chatbot-state.service';
import { ConversationService } from '../../services/chatbot/core/conversation.service';
import { FeedbackModule } from '../../services/chatbot/modules/feedback.module';
import { ChatMessage } from '../../services/chatbot/interfaces/chat-message.interface';
import { Conversation } from '../../services/chatbot/interfaces/conversation.interface';

@Component({
  selector: 'app-chatbot',
  templateUrl: './chatbot.component.html',
  styleUrls: ['./chatbot.component.css']
})
export class ChatbotComponent implements OnInit, OnDestroy {
  // Estado del componente
  sidebarExpanded = true;
  healthProfileEnabled = false;
  newMessage = '';
  messages: ChatMessage[] = [];
  connectionStatus = '';
  predefinedQuestions: string[] = [];
  isProcessing = false;
  isStopping = false;
  isWebSocketConnected = false;
  showTitleEditor = false;
  editingTitle = '';
  
  // Estado para feedback de texto
  showTextFeedbackFor: ChatMessage | null = null;
  textFeedback = '';
  
  // Estado de conversaciones
  conversations: Conversation[] = [];
  currentConversation: Conversation | null = null;
  
  // Referencias
  @ViewChild('messagesArea') private messagesArea!: ElementRef;
  
  // Estado privado
  private destroy$ = new Subject<void>();
  private isUserScrolling = false;
  private shouldAutoScroll = true;
  private scrollTimeout?: number;
  
  // Cache para última pregunta de usuario (para restauración)
  private lastUserQuestionForRestoration: {
    content: string;
    type: 'user' | 'predefined';
    timestamp: number;
  } | null = null;

  // Control para evitar múltiples STOPs
  private isHandlingStop = false;
  private stopDebounceTimeout: any;

  constructor(
    private chatbotService: ChatbotService,
    private translationService: TranslationService,
    private suggestionsService: SuggestionsService,
    private conversationService: ConversationService,
    private feedbackModule: FeedbackModule,
    private cdr: ChangeDetectorRef,
    private state: ChatbotStateService
  ) {}

  ngOnInit(): void {
    // console.log('🚀 ChatbotComponent iniciado');
    this.initialize();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.scrollTimeout) clearTimeout(this.scrollTimeout);
    if (this.stopDebounceTimeout) clearTimeout(this.stopDebounceTimeout);
  }

  private initialize(): void {
    this.loadPredefinedQuestions();
    
    // console.log('🔍 Estado inicial del ChatbotService:', {
    //   isConnected: this.chatbotService.isConnected(),
    //   canSendMessages: this.chatbotService.canSendMessages(),
    //   isProcessing: this.chatbotService.getIsProcessing()
    // });
    
    const initialMessages = this.chatbotService.getMessages();
    // console.log('📩 Mensajes iniciales:', initialMessages.length);
    
    this.setupSubscriptions();
    this.setupStopListener();
    
    setTimeout(() => {
      this.setupScrollListener();
    }, 1000);
  }

  private setupSubscriptions(): void {
    combineLatest({
      messages: this.chatbotService.messages$,
      processing: this.chatbotService.isProcessing$,
      connection: this.chatbotService.connectionStatus$,
      currentConversation: this.conversationService.activeConversation$,
      conversations: this.conversationService.conversations$,
      lang: this.translationService.getCurrentLangObservable()
    })
    .pipe(
      takeUntil(this.destroy$),
      debounceTime(50),
      distinctUntilChanged()
    )
    .subscribe(({
      messages, 
      processing, 
      connection, 
      currentConversation, 
      conversations,
      lang 
    }) => {
      // console.log('📥 Suscripción actualizada:', {
      //   messagesCount: messages?.length || 0,
      //   processing,
      //   connection,
      //   currentConversationId: currentConversation?.id,
      //   conversationsCount: conversations?.length || 0
      // });
      
      // ⚠️ CRÍTICO: Forzar detección de cambios para componentes con OnPush
      this.cdr.markForCheck();
      
      this.updateComponentState(messages, processing, connection, currentConversation, conversations, lang);
    });
    
    // ⚠️ CRÍTICO: Escuchar cuando termina el streaming para forzar actualización inmediata
    this.state.streamingCompleted$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        // Usar detectChanges() en lugar de markForCheck() para forzar evaluación
        this.cdr.detectChanges();
      });
  }

  private setupStopListener(): void {
    // Escuchar eventos de STOP del sistema unificado
    this.chatbotService.onStopRequested$
      .pipe(takeUntil(this.destroy$))
      .subscribe((stopData: StopRequestData) => {
        console.log('📬 ChatbotComponent: Evento STOP recibido:', {
          questionType: stopData.questionType,
          shouldRestoreToInput: stopData.shouldRestoreToInput,
          contentPreview: stopData.questionContent?.substring(0, 50)
        });
        
        this.handleStopRequest(stopData);
      });
  }

  private updateComponentState(
    messages: ChatMessage[],
    processing: boolean,
    connection: string,
    currentConversation: Conversation | null,
    conversations: Conversation[],
    lang: string
  ): void {
    const originalCount = messages?.length || 0;
    const filteredMessages = this.filterPlaceholderMessages(messages || []);
    
    // if (originalCount > filteredMessages.length) {
    //   console.log('🗑️ Mensajes filtrados:', originalCount - filteredMessages.length);
    // }
    
    this.messages = filteredMessages;
    this.isProcessing = processing;
    this.isWebSocketConnected = this.chatbotService.isConnected();
    this.connectionStatus = this.getTranslatedConnectionStatus(connection);
    this.currentConversation = currentConversation;
    this.conversations = conversations;

    if (lang) {
      this.loadPredefinedQuestions();
    }

    // Registrar última pregunta de usuario para posible restauración
    this.cacheLastUserQuestion();

    if (this.shouldAutoScroll && !this.isUserScrolling) {
      this.scheduleScroll();
    }

    this.cdr.detectChanges();
  }

  // ============ CORRECCIÓN CRÍTICA: MANEJO DE STOP UNIFICADO ============

  private handleStopRequest(stopData: StopRequestData): void {
    console.log('🛑 ChatbotComponent: Procesando STOP request:', {
      questionType: stopData.questionType,
      shouldRestoreToInput: stopData.shouldRestoreToInput,
      questionContent: stopData.questionContent?.substring(0, 50)
    });
    
    // Evitar múltiples STOPs simultáneos
    if (this.isHandlingStop) {
      // console.log('⏸️ Ya se está procesando un STOP, ignorando...');
      return;
    }
    
    this.isHandlingStop = true;
    
    // Limpiar timeout anterior si existe
    if (this.stopDebounceTimeout) {
      clearTimeout(this.stopDebounceTimeout);
    }
    
    // Stop según el tipo de pregunta
    if (stopData.questionType === 'user' && stopData.questionContent) {
      this.handleUserQuestionStop(stopData);
    } else if (stopData.questionType === 'predefined' && stopData.questionContent) {
      this.handlePredefinedQuestionStop(stopData);
    } else {
      this.handleGenericStop(stopData);
    }
    
    // 3. Forzar actualización de UI
    this.cdr.detectChanges();
    
    console.log('✅ ChatbotComponent: STOP procesado exitosamente');
    
    // Liberar el lock después de un tiempo
    this.stopDebounceTimeout = setTimeout(() => {
      this.isHandlingStop = false;
    }, 500);
  }

  // ============ CORRECCIÓN: STOP PARA PREGUNTAS DE USUARIO ============
  
  private handleUserQuestionStop(stopData: StopRequestData): void {
    // console.log('👤 Procesando STOP para pregunta de usuario');
    
    if (stopData.shouldRestoreToInput && stopData.questionContent) {
      // 1. Restaurar pregunta al input para edición
      this.newMessage = stopData.questionContent;
      // console.log('↩️ Pregunta de usuario restaurada al input:', stopData.questionContent.substring(0, 50));
      
      // 2. Borrar la pregunta y respuesta del área principal
      this.removeQuestionAndResponseFromMainArea(stopData.questionContent, 'user');
    } else {
      // Si no se debe restaurar, solo borrar
      this.removeQuestionAndResponseFromMainArea(stopData.questionContent!, 'user');
    }
    
    // Actualizar UI
    this.scheduleScroll();
  }

  // ============ CORRECCIÓN: STOP PARA PREGUNTAS PREDEFINIDAS ============
  
  private handlePredefinedQuestionStop(stopData: StopRequestData): void {
    // console.log('🔖 Procesando STOP para pregunta predefinida');
    
    // CORRECCIÓN: Para preguntas predefinidas, el input se mantiene vacío
    this.newMessage = '';
    
    // Borrar la pregunta y respuesta del área principal
    if (stopData.questionContent) {
      this.removeQuestionAndResponseFromMainArea(stopData.questionContent, 'predefined');
    }
    
    // console.log('🗑️ Pregunta predefinida removida del área principal');
    
    // Actualizar UI
    this.scheduleScroll();
  }

  private handleGenericStop(stopData: StopRequestData): void {
    // console.log('🌀 Procesando STOP genérico');
    
    // Limpieza básica
    this.cleanupStreamingMessagesLocally();
    
    // No restaurar nada al input
    this.newMessage = '';
    
    // console.log('🧹 STOP genérico completado');
  }

  // ============ NUEVO MÉTODO: REMOVER PREGUNTA Y RESPUESTA DEL ÁREA PRINCIPAL ============
  
  private removeQuestionAndResponseFromMainArea(questionContent: string, questionType: 'user' | 'predefined'): void {
    // console.log(`🗑️ Removiendo pregunta (${questionType}) del área principal:`, 
    //             questionContent.substring(0, 50));
    
    // 1. Encontrar la pregunta en los mensajes
    const questionMessage = this.messages.find(m => 
      (m.sender === 'user' || m.isUser) && 
      (m.content === questionContent || m.text === questionContent)
    );
    
    if (!questionMessage) {
      // console.warn('⚠️ No se encontró la pregunta en los mensajes:', questionContent.substring(0, 30));
      return;
    }
    
    const questionIndex = this.messages.indexOf(questionMessage);
    if (questionIndex === -1) {
      // console.error('❌ No se pudo encontrar el índice de la pregunta');
      return;
    }
    
    // console.log('📝 Pregunta encontrada:', {
    //   id: questionMessage.id,
    //   index: questionIndex,
    //   type: questionType,
    //   isPredefined: (questionMessage as any)._isPredefinedQuestion
    // });
    
    // 2. Determinar qué mensajes borrar
    const messagesToRemove: ChatMessage[] = [];
    
    // Para preguntas PREDEFINIDAS: borrar la pregunta también
    if (questionType === 'predefined') {
      messagesToRemove.push(questionMessage);
    }
    // Para preguntas de USUARIO: mantener la pregunta en el chat (solo borrar respuestas)
    // La pregunta ya fue restaurada al input
    
    // 3. Buscar respuestas de bot después de esta pregunta
    // CORRECCIÓN: Solo eliminar respuestas de bot que estén en streaming O vacías
    for (let i = questionIndex + 1; i < this.messages.length; i++) {
      const message = this.messages[i];
      if (message.sender === 'bot' || !message.isUser) {
        const hasContent = message.content && message.content.trim().length > 0;
        const isStreaming = message.isStreaming;
        
        // Solo eliminar si está en streaming O si no tiene contenido
        // Si tiene contenido y NO está en streaming, mantenerlo (es una respuesta completada)
        if (isStreaming || !hasContent) {
          messagesToRemove.push(message);
        }
      } else {
        // Si encontramos otra pregunta, detener
        break;
      }
    }
    
    // console.log('📋 Mensajes a borrar:', {
    //   total: messagesToRemove.length,
    //   incluyePregunta: questionType === 'predefined',
    //   respuestas: messagesToRemove.filter(m => m.sender === 'bot').length
    // });
    
    // 4. Filtrar para remover los mensajes
    if (messagesToRemove.length > 0) {
      const originalCount = this.messages.length;
      this.messages = this.messages.filter(msg => !messagesToRemove.includes(msg));
      
      // console.log('✅ Mensajes removidos del área principal:', {
      //   antes: originalCount,
      //   después: this.messages.length,
      //   borrados: originalCount - this.messages.length
      // });
      
      // 5. Actualizar conversación en ConversationService
      if (this.currentConversation) {
        const conversationMessages = this.messages
          .filter(m => !m.isStreaming)
          .map(m => ({
            id: m.id,
            content: m.content || m.text || '',
            sender: m.sender || (m.isUser ? 'user' : 'bot'),
            timestamp: m.timestamp || new Date(),
            sources: m.sources || [],
            feedback: m.feedback || null,
            isStreaming: false
          }));
        
        this.conversationService.updateConversationMessages(
          this.currentConversation.id,
          conversationMessages
        );
        
        // console.log('💾 Conversación actualizada en ConversationService');
      }
      
      // 6. Actualizar cache de última pregunta
      this.updateLastUserQuestionCache();
      
      // 7. Forzar actualización de UI
      this.cdr.detectChanges();
    }
  }

  // ============ NUEVO MÉTODO: ACTUALIZAR CACHE DE ÚLTIMA PREGUNTA ============
  
  private updateLastUserQuestionCache(): void {
    if (this.messages.length === 0) {
      this.lastUserQuestionForRestoration = null;
      return;
    }
    
    // Buscar la nueva última pregunta (si queda alguna)
    const userMessages = this.messages.filter(m => 
      m.sender === 'user' || m.isUser
    );
    
    if (userMessages.length > 0) {
      const lastUserMessage = userMessages[userMessages.length - 1];
      const isPredefined = (lastUserMessage as any)._isPredefinedQuestion;
      
      this.lastUserQuestionForRestoration = {
        content: lastUserMessage.content || lastUserMessage.text || '',
        type: isPredefined ? 'predefined' : 'user',
        timestamp: Date.now()
      };
      
      // console.log('💾 Nuevo cache de última pregunta:', {
      //   type: this.lastUserQuestionForRestoration.type,
      //   content: this.lastUserQuestionForRestoration.content.substring(0, 30)
      // });
    } else {
      this.lastUserQuestionForRestoration = null;
    }
  }

  private cacheLastUserQuestion(): void {
    if (this.messages.length === 0) {
      this.lastUserQuestionForRestoration = null;
      return;
    }
    
    // Buscar última pregunta de usuario
    const userMessages = this.messages.filter(m => 
      m.sender === 'user' || m.isUser
    );
    
    if (userMessages.length > 0) {
      const lastUserMessage = userMessages[userMessages.length - 1];
      const isPredefined = (lastUserMessage as any)._isPredefinedQuestion;
      
      this.lastUserQuestionForRestoration = {
        content: lastUserMessage.content || lastUserMessage.text || '',
        type: isPredefined ? 'predefined' : 'user',
        timestamp: Date.now()
      };
      
      // console.log('💾 Última pregunta cacheada:', {
      //   type: this.lastUserQuestionForRestoration.type,
      //   content: this.lastUserQuestionForRestoration.content.substring(0, 30)
      // });
    } else {
      this.lastUserQuestionForRestoration = null;
    }
  }

  private cleanupStreamingMessagesLocally(): void {
    // console.log('🧹 Limpiando mensajes de streaming localmente...');
    
    const originalCount = this.messages.length;
    let keptWithContent = 0;
    let removedEmpty = 0;
    
    // CORRECCIÓN: Mantener mensajes con contenido, solo eliminar los vacíos
    this.messages = this.messages.map(message => {
      const isBotStreaming = (message.sender === 'bot' || !message.isUser) && message.isStreaming;
      
      if (isBotStreaming) {
        const hasContent = message.content && message.content.trim().length > 0;
        
        if (hasContent) {
          // Mantener el mensaje pero cambiar isStreaming a false
          // console.log('💾 Manteniendo contenido de streaming:', {
          //   id: message.id?.substring(0, 20),
          //   contentLength: message.content?.length,
          //   preview: message.content?.substring(0, 100)
          // });
          keptWithContent++;
          return {
            ...message,
            isStreaming: false,
            _isProcessingPlaceholder: false
          };
        } else {
          // Marcar para eliminación si no tiene contenido
          // console.log('🗑️ Marcando para eliminación mensaje vacío:', {
          //   id: message.id?.substring(0, 20)
          // });
          removedEmpty++;
          return null as any;
        }
      }
      
      return message;
    }).filter(m => m !== null);
    
    // console.log('✅ Mensajes limpiados localmente:', {
    //   antes: originalCount,
    //   después: this.messages.length,
    //   mantenidosConContenido: keptWithContent,
    //   eliminadosVacios: removedEmpty
    // });
  }

  // ============ MANEJO DE CONVERSACIONES ============

  get conversationTitle(): string {
    return this.currentConversation?.title || 'New Chat';
  }

  async newChat(): Promise<void> {
    try {
      this.chatbotService.newChat();
      this.newMessage = '';
      this.lastUserQuestionForRestoration = null;
      this.handleMobileSidebar();
    } catch (error) {
      console.error('Error creating new chat:', error);
    }
  }

  loadConversation(conversationId: string): void {
    if (this.conversationService.selectConversation(conversationId)) {
      this.handleMobileSidebar();
      this.scheduleScroll();
    }
  }

  renameConversation(): void {
    if (this.currentConversation && this.editingTitle.trim()) {
      this.conversationService.renameConversation(
        this.currentConversation.id, 
        this.editingTitle.trim()
      );
      this.showTitleEditor = false;
      this.editingTitle = '';
    }
  }

  startEditingTitle(): void {
    if (this.currentConversation) {
      this.editingTitle = this.currentConversation.title;
      this.showTitleEditor = true;
    }
  }

  cancelEditingTitle(): void {
    this.showTitleEditor = false;
    this.editingTitle = '';
  }

  deleteConversation(event: Event, conversationId: string): void {
    event.stopPropagation();
    if (this.conversationService.deleteConversation(conversationId)) {
      this.cdr.markForCheck();
    }
  }

  // ============ MANEJO DE MENSAJES ============

  send(): void {
    if (!this.canSendMessages()) return;

    const message = this.newMessage.trim();
    this.newMessage = '';
    
    this.chatbotService.sendUserQuestion(message)
      .catch(error => {
        console.error('Error sending message:', error);
      });

    this.handleUserAction();
  }

  onSuggestedQuestionClick(question: string): void {
    if (!this.chatbotService.canSendMessages()) return;
    
    this.chatbotService.loadQuestionFromSidebar(question)
      .catch(error => {
        console.error('Error loading predefined question:', error);
      });

    this.handleUserAction();
  }

  onQuickSuggestionClick(suggestion: string): void {
    if (!this.chatbotService.canSendMessages()) return;

    this.chatbotService.sendUserQuestion(suggestion)
      .catch(error => {
        console.error('Error sending quick suggestion:', error);
      });

    this.handleUserAction();
  }

  // ============ FEEDBACK DE TEXTO ============

  sendFeedback(message: ChatMessage, rating: 'up' | 'down' | null = null, comment: string = ''): void {
    this.feedbackModule.sendFeedback(message, rating, comment);
    
    if (message.id && rating) {
      this.conversationService.updateMessageFeedback(
        message.id, 
        rating === 'up' ? 'like' : 'dislike'
      );
    }
  }

  sendTextFeedback(): void {
    if (this.textFeedback?.trim() && this.showTextFeedbackFor) {
      this.feedbackModule.sendTextFeedback(
        this.showTextFeedbackFor, 
        this.textFeedback
      );
      this.textFeedback = '';
      this.showTextFeedbackFor = null;
    }
  }

  showCommentInput(message: ChatMessage): void {
    this.showTextFeedbackFor = message;
    this.textFeedback = '';
  }

  cancelTextFeedback(): void {
    this.showTextFeedbackFor = null;
    this.textFeedback = '';
  }

  sendThumbsUp(message: ChatMessage): void {
    this.feedbackModule.sendRatingFeedback(message, 'up');
    this.conversationService.updateMessageFeedback(message.id!, 'like');
  }

  sendThumbsDown(message: ChatMessage): void {
    this.feedbackModule.sendRatingFeedback(message, 'down');
    this.conversationService.updateMessageFeedback(message.id!, 'dislike');
  }

  // ============ MANEJO DE SCROLL ============

  private setupScrollListener(): void {
    if (!this.messagesArea?.nativeElement) return;

    this.messagesArea.nativeElement.addEventListener('scroll', () => {
      this.handleScroll();
    });
  }

  private handleScroll(): void {
    if (!this.messagesArea) return;

    const element = this.messagesArea.nativeElement;
    const isNearBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 50;
    
    this.isUserScrolling = true;
    this.shouldAutoScroll = isNearBottom;
    
    if (this.scrollTimeout) clearTimeout(this.scrollTimeout);
    
    this.scrollTimeout = window.setTimeout(() => {
      this.isUserScrolling = false;
      this.shouldAutoScroll = true;
    }, 1500);
  }

  private scheduleScroll(): void {
    requestAnimationFrame(() => {
      try {
        const element = this.messagesArea?.nativeElement;
        if (element) {
          const isNearBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 100;
          
          if (this.shouldAutoScroll || isNearBottom) {
            setTimeout(() => {
              element.scrollTo({ top: element.scrollHeight, behavior: 'smooth' });
            }, 50);
          }
        }
      } catch (error) {
        console.warn('Scroll error:', error);
      }
    });
  }

  private handleUserAction(): void {
    this.isUserScrolling = false;
    this.shouldAutoScroll = true;
    this.scheduleScroll();
  }

  // ============ UTILIDADES ============

  private filterPlaceholderMessages(messages: ChatMessage[]): ChatMessage[] {
    if (!messages || messages.length === 0) {
      return [];
    }
    
    return messages.filter(message => {
      if (!message.isStreaming) {
        return true;
      }
      
      const hasContent = (message.content && message.content.trim().length > 0) || 
                         (message.text && message.text.trim().length > 0);
      
      if (hasContent) {
        return true;
      }
      
      if (message._isProcessingPlaceholder) {
        return message.isStreaming === true;
      }
      
      return true;
    });
  }

  private loadPredefinedQuestions(): void {
    this.predefinedQuestions = this.suggestionsService.getMedicalSuggestions();
  }

  private getTranslatedConnectionStatus(status: string): string {
    const statusMap: Record<string, string> = {
      'Conectado': 'CHAT.CONNECTED',
      'Connected': 'CHAT.CONNECTED',
      'Desconectado': 'CHAT.DISCONNECTED',
      'Disconnected': 'CHAT.DISCONNECTED',
      'Connected via HTTP': 'CHAT.CONNECTED_HTTP',
      'Conectado via HTTP': 'CHAT.CONNECTED_HTTP',
      'Connected via WebSocket': 'CHAT.CONNECTED_WEBSOCKET',
      'Conectado via WebSocket': 'CHAT.CONNECTED_WEBSOCKET'
    };
    
    return statusMap[status] 
      ? this.translationService.instant(statusMap[status]) 
      : status;
  }

  private handleMobileSidebar(): void {
    if (window.innerWidth < 768) {
      this.sidebarExpanded = false;
    }
  }

  // ============ MÉTODOS PÚBLICOS PARA TEMPLATE ============

  toggleSidebar(): void {
    this.sidebarExpanded = !this.sidebarExpanded;
  }

  clearHistory(): void {
    this.chatbotService.clearHistory();
    this.newMessage = '';
    this.lastUserQuestionForRestoration = null;
  }

  onHealthProfileToggle(enabled: boolean): void {
    this.healthProfileEnabled = enabled;
  }

  onConversationSelected(conversationId: string): void {
    this.loadConversation(conversationId);
  }

  canSendMessages(): boolean {
    return this.chatbotService.canSendMessages() && this.newMessage.trim().length > 0;
  }

  shouldShowPredefinedQuestions(): boolean {
    return !this.currentConversation || this.currentConversation.messages.length === 0;
  }

  getMessageSender(message: ChatMessage): 'user' | 'bot' | 'system' {
    return message.sender || (message.isUser === true ? 'user' : 'bot');
  }

  trackByConversation(index: number, conversation: Conversation): string {
    return conversation.id;
  }

  trackByMessage(index: number, message: ChatMessage): string {
    return message.id || `msg-${index}-${message.timestamp?.getTime() || Date.now()}`;
  }

  formatConversationDate(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) {
      return diffMins <= 1 ? 'Just now' : `${diffMins} min ago`;
    } else if (diffHours < 24) {
      return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
    } else if (diffDays < 7) {
      return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
    } else {
      return date.toLocaleDateString();
    }
  }

  // ============ MÉTODOS DE CONTROL DEL CHAT - CORREGIDOS ============

  onStopFromMessages(event: any): void {
    // console.log('════════════════════════════════════════════════');
    // console.log('🛑 onStopFromMessages RECIBIDO EN CHATBOT COMPONENT');
    // console.log('Event:', event);
    // console.log('Event keys:', event ? Object.keys(event) : 'event is null');
    
    if (!event) {
      console.error('❌ Evento STOP es null/undefined');
      return;
    }

    this.isProcessing = true; // Mostrar indicador visual
    this.isStopping = true; // Mostrar indicador visual
    
    // El evento puede venir de dos formas:
    // 1. Desde el sistema unificado: {message, questionType, shouldRestoreToInput, questionContent}
    // 2. Desde la forma anterior: {userMessageContent, isPredefinedQuestion, ...}
    
    const questionType = event?.questionType || 
                        (event?.isPredefinedQuestion ? 'predefined' : 'user');
    
    const questionContent = event?.questionContent || 
                           event?.userMessageContent || 
                           (event?.message?.content || event?.message?.text) ||
                           this.lastUserQuestionForRestoration?.content;
    
    // console.log('⚙️ STOP PROCESADO:', {
    //   questionType,
    //   hasQuestionContent: !!questionContent,
    //   contentPreview: questionContent?.substring(0, 50),
    //   eventKeys: Object.keys(event || {})
    // });
    
    // Usar el sistema unificado de STOP
    // console.log('📞 Llamando a emergencyStop()...');
    this.chatbotService.emergencyStop({
      messageId: event?.message?.id,
      questionType: questionType,
      questionContent: questionContent,
      shouldRestoreToInput: false, // No restaurar al input en STOP directo
    }).then(stopData => {
      console.log('✅ STOP ejecutado exitosamente:', stopData);
      console.log('════════════════════════════════════════════════');
    }).catch(error => {
      console.error('❌ Error ejecutando STOP:', error);
      console.log('════════════════════════════════════════════════');
    });
  }

  onRegenerateFromMessages(event: any): void {
    const botMessage: ChatMessage = event;
    // console.log('🔄 ChatbotComponent: Regeneración solicitada para:', botMessage?.id);

    if (!botMessage || botMessage.isUser || botMessage.isStreaming) {
      console.warn('❌ Regenerar solo aplica a mensajes de bot completos');
      return;
    }

    // Buscar el mensaje de usuario anterior al mensaje de bot seleccionado
    const botIndex = this.messages.findIndex(m => m.id === botMessage.id);
    if (botIndex === -1) {
      console.warn('❌ No se encontró el mensaje de bot en la lista');
      return;
    }

    let userMessage: ChatMessage | undefined;
    for (let i = botIndex - 1; i >= 0; i--) {
      const candidate = this.messages[i];
      if (candidate.isUser || candidate.sender === 'user') {
        userMessage = candidate;
        break;
      }
    }

    if (!userMessage || !userMessage.content || !userMessage.id) {
      console.warn('❌ No se encontró mensaje de usuario para regenerar');
      return;
    }

    // Parar el streaming y enviar la pregunta del usuario correspondiente
    this.isProcessing = true; // Mostrar indicador visual
    // console.log('🔄 Ejecutando emergencyStop para regeneración...');
    this.chatbotService.emergencyStop({
      questionType: (userMessage as any)._isPredefinedQuestion ? 'predefined' : 'user',
      shouldRestoreToInput: false,
      questionContent: userMessage.content
    }).then(() => {
      // console.log('✅ emergencyStop completado, regenerando...');
      
      // Forzar reset del WebSocket para evitar estado sucio
      this.chatbotService.websocket.forceReset();

      // Pequeño delay para asegurar que el estado se resetee completamente
      setTimeout(() => {
        // console.log('🔄 Reenviando pregunta existente con regenerateResponse...');
        
        // Usar regenerateResponse para reutilizar el ID del mensaje existente
        const questionType = (userMessage as any)._isPredefinedQuestion ? 'predefined' : 'user';
        
        this.chatbotService.engine.regenerateResponse(
          userMessage!.content,
          userMessage!.id, // Reutilizar el ID existente
          this.chatbotService.getCurrentFilters(),
          questionType
        ).catch(error => {
          console.error('Error en regeneración:', error);
          this.isProcessing = false;
        });
      }, 300);
    }).catch(error => {
      this.isProcessing = false;
      console.error('Error en regeneración:', error);
    });
  }

  onFeedback(event: {message: ChatMessage, rating: 'up' | 'down' | null, comment: string}): void {
    this.sendFeedback(event.message, event.rating, event.comment);
  }

  private sendMessage(message: string): void {
    this.chatbotService.sendUserQuestion(message)
      .catch(error => {
        console.error('Error sending message:', error);
      });
  }

  // ============ MÉTODOS DE EMERGENCIA Y DEBUG ============

  /**
   * Método de emergencia para forzar STOP si algo sale mal
   */
  emergencyStop(): void {
    // console.log('🚨 EMERGENCY STOP manual desde componente');
    
    // Usar cache local si hay
    const questionType = this.lastUserQuestionForRestoration?.type || 'user';
    const questionContent = this.lastUserQuestionForRestoration?.content;
    
    // CORRECCIÓN: Configurar correctamente shouldRestoreToInput
    const shouldRestoreToInput = questionType === 'user' && !!questionContent;
    
    this.chatbotService.emergencyStop({
      questionType: questionType,
      shouldRestoreToInput: shouldRestoreToInput,
      questionContent: questionContent
    }).then(stopData => {
      // console.log('✅ EMERGENCY STOP completado:', stopData);
      
      // Forzar actualización visual inmediata
      this.cleanupStreamingMessagesLocally();
      this.cdr.detectChanges();
    }).catch(error => {
      console.error('❌ Error en EMERGENCY STOP:', error);
    });
  }

  /**
   * Método para debug: mostrar información del estado actual
   */
  debugCurrentState(): void {
    const debugInfo = {
      messagesCount: this.messages.length,
      isProcessing: this.isProcessing,
      lastUserQuestion: this.lastUserQuestionForRestoration,
      newMessage: this.newMessage.substring(0, 50),
      streamingMessages: this.messages.filter(m => m.isStreaming).length,
      chatbotServiceDebug: this.chatbotService.getDebugState()
    };
    
    // console.log('🐛 DEBUG ChatbotComponent:', debugInfo);
  }

  /**
   * Restaurar última pregunta al input manualmente
   */
  restoreLastQuestionToInput(): void {
    if (this.lastUserQuestionForRestoration) {
      this.newMessage = this.lastUserQuestionForRestoration.content;
      // console.log('↩️ Última pregunta restaurada manualmente:', {
      //   type: this.lastUserQuestionForRestoration.type,
      //   content: this.lastUserQuestionForRestoration.content.substring(0, 50)
      // });
    } else {
      console.warn('⚠️ No hay pregunta para restaurar');
    }
  }
}