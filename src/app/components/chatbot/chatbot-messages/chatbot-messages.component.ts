import { 
  Component, 
  Input, 
  OnChanges, 
  SimpleChanges, 
  OnInit, 
  OnDestroy, 
  ChangeDetectorRef,
  ChangeDetectionStrategy,
  ViewEncapsulation,
  Output,
  EventEmitter
} from '@angular/core';

import { ChatMessage } from '../../../services/chatbot/interfaces/chat-message.interface';
import { ChatbotService } from '../../../services/chatbot/chatbot.service';
import { TranslationService } from '../../../services/translation.service';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { TypewriterModule } from '../../../services/chatbot/modules/typewriter.module';
import { ChatbotStateService } from '../../../services/chatbot/core/chatbot-state.service';

interface FeedbackState {
  type: 'like' | 'dislike' | null;
  showFeedbackBox: boolean;
  feedbackText: string;
  isSubmitting: boolean;
}

@Component({
  selector: 'app-chatbot-messages',
  templateUrl: './chatbot-messages.component.html',
  styleUrls: ['./chatbot-messages.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None
})
export class ChatbotMessagesComponent implements OnChanges, OnInit, OnDestroy {
  @Input() messages: ChatMessage[] = [];
  @Input() isProcessing: boolean = false;
  
  @Output() regenerate = new EventEmitter<ChatMessage>();
  @Output() stop = new EventEmitter<{
    message: ChatMessage,
    questionType?: 'user' | 'predefined',
    shouldRestoreToInput?: boolean,
    questionContent?: string
  }>();
  @Output() feedback = new EventEmitter<{message: ChatMessage, rating: 'up' | 'down' | null, comment: string}>();

  private cursorInterval: any;
  showCursor = true;
  private visiblePopoverIndex: number | null = null;
  private popoverTimeout: any;
  
  feedbackStates = new Map<string, FeedbackState>();
    
  filteredMessages: ChatMessage[] = [];
  currentStreamingMessage: ChatMessage | null = null;
  
  // Cache para última pregunta de usuario
  private lastUserQuestion: {
    content: string;
    type: 'user' | 'predefined';
    messageId: string;
    timestamp: number;
  } | null = null;

  // Control para evitar múltiples STOPs
  private isStopInProgress = false;
  private stopRetryCount = 0;
  private readonly MAX_STOP_RETRIES = 3;
  public isStopping = false;

  constructor(
    private chatbotService: ChatbotService,
    private translationService: TranslationService,
    private sanitizer: DomSanitizer,
    private typewriterModule: TypewriterModule,
    private cdr: ChangeDetectorRef,
    private state: ChatbotStateService
  ) {
    this.chatbotService.isStopping$.subscribe(val => {
      this.isStopping = val;
      this.cdr.markForCheck();
    });
  }

  ngOnInit() {
    // Inicializar con los mensajes recibidos
    this.updateFilteredMessages();
    
    // Cursor para animación de typing
    this.cursorInterval = setInterval(() => {
      this.showCursor = !this.showCursor;
      this.cdr.markForCheck();
    }, 500);
    
    // Inicializar estados de feedback
    this.initializeFeedbackStates(this.filteredMessages);
    
    // Trackear última pregunta del usuario
    this.trackLastUserQuestion();
    
    // Suscribirse a cambios de mensajes del estado para forzar detección
    this.state.messages$.subscribe((messages) => {
      this.cdr.markForCheck();
    });
    
    // ⚠️ CRÍTICO: Escuchar cuando termina el streaming para actualizar la UI inmediatamente
    this.state.streamingCompleted$.subscribe((message) => {
      // Usar detectChanges() en lugar de markForCheck() para forzar re-evaluación del template
      this.cdr.detectChanges();
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['messages']) {
      // Limpiar estados de streaming obsoletos
      this.cleanupOldStreamingStates();
      
      // ACTUALIZAR filteredMessages cuando cambian los mensajes
      this.updateFilteredMessages();
     
      // Actualizar feedback states
      this.initializeFeedbackStates(this.filteredMessages);
      
      // Actualizar cache de última pregunta
      this.updateLastUserQuestionCache();
      
      // Actualizar currentStreamingMessage (para mostrar botón STOP fuera del loop)
      this.currentStreamingMessage = this.findCurrentStreamingMessage();
      
      // Resetear contador de STOP si los mensajes cambiaron
      this.stopRetryCount = 0;
      
      // Marcar para re-check SOLO si el array realmente cambió
      this.cdr.markForCheck();
    }
    
    if (changes['isProcessing']) {
      this.cdr.markForCheck();
    }
  }
  
  // ============ SISTEMA UNIFICADO DE STOP MEJORADO ============
   // ============ SISTEMA UNIFICADO DE STOP MEJORADO ============
  
onStopResponse(event?: {questionType?: 'user' | 'predefined'}): void {
  // Evitar múltiples STOPs simultáneos
  if (this.isStopInProgress) {
    return;
  }
  
  this.isStopInProgress = true;
  
  try {
    // 1. Obtener información actual del streaming
    const streamingMessage = this.findCurrentStreamingMessage();
    
    // 2. Determinar tipo de pregunta
    const questionType = this.determineStopQuestionType(streamingMessage, event?.questionType);
    
    // 3. Buscar última pregunta del usuario
    const lastUserMessage = this.findLastUserMessage();
    
    // 4. Preparar información para el sistema unificado
    // CORRECCIÓN: Asegurar que siempre tengamos un mensaje válido
    const stopData = {
      message: streamingMessage || this.createFallbackStopMessage(),
      questionType: questionType,
      shouldRestoreToInput: questionType === 'user' && !!lastUserMessage?.content,
      questionContent: lastUserMessage?.content || ''
    };
    
    // 5. Emitir evento (SIEMPRE, incluso si no hay streamingMessage)
    this.stop.emit(stopData);
    
    // 6. Feedback visual inmediato MEJORADO
    this.performImmediateVisualCleanup(streamingMessage, questionType);
    
    // 7. Resetear contador de reintentos
    this.stopRetryCount = 0;
    
  } catch (error) {
    console.error('💥 Error en onStopResponse:', error);
    
    // Reintentar si es necesario
    if (this.stopRetryCount < this.MAX_STOP_RETRIES) {
      this.stopRetryCount++;
      setTimeout(() => {
        this.isStopInProgress = false;
        this.onStopResponse(event);
      }, 300);
      return;
    }
  } finally {
    // Siempre liberar el lock después de un tiempo
    setTimeout(() => {
      this.isStopInProgress = false;
    }, 1000);
  }
}

// ============ NUEVO MÉTODO: CREAR MENSAJE DE FALLBACK ============

private createFallbackStopMessage(): ChatMessage {
  // Buscar cualquier mensaje de bot como fallback
  const botMessages = this.filteredMessages.filter(m => 
    this.getMessageSender(m) === 'bot'
  );
  
  if (botMessages.length > 0) {
    return botMessages[botMessages.length - 1];
  }
  
  // Si no hay mensajes de bot, crear uno dummy
  return {
    id: `stop-fallback-${Date.now()}`,
    content: '',
    text: '',
    sender: 'bot',
    isUser: false,
    timestamp: new Date(),
    isStreaming: false
  };
}
  
  // ============ NUEVO MÉTODO PARA DETERMINAR TIPO DE STOP ============
  
  private determineStopQuestionType(
    streamingMessage: ChatMessage | null, 
    providedType?: 'user' | 'predefined'
  ): 'user' | 'predefined' {
    
    // Prioridad 1: Tipo proporcionado
    if (providedType) {
      return providedType;
    }
    
    // Prioridad 2: Usar cache local
    if (this.lastUserQuestion) {
      return this.lastUserQuestion.type;
    }
    
    // Prioridad 3: Usar _originalQuestionType del mensaje de streaming
    if (streamingMessage && (streamingMessage as any)._originalQuestionType) {
      return (streamingMessage as any)._originalQuestionType;
    }
    
    // Prioridad 4: Buscar en mensajes previos
    if (streamingMessage) {
      const messageIndex = this.messages.findIndex(m => m.id === streamingMessage.id);
      if (messageIndex > 0) {
        for (let i = messageIndex - 1; i >= 0; i--) {
          const prevMessage = this.messages[i];
          if (prevMessage.sender === 'user' || prevMessage.isUser) {
            const isPredefined = (prevMessage as any)._isPredefinedQuestion;
            return isPredefined ? 'predefined' : 'user';
          }
        }
      }
    }
    
    // Prioridad 5: Último mensaje de usuario
    const lastUserMessage = this.findLastUserMessage();
    if (lastUserMessage) {
      const isPredefined = (lastUserMessage as any)._isPredefinedQuestion;
      return isPredefined ? 'predefined' : 'user';
    }
    
    // Por defecto: user
    return 'user';
  }
  
  // ============ MÉTODO CLAVE CORREGIDO ============
  
  private updateFilteredMessages(): void {
    if (!this.messages || this.messages.length === 0) {
      this.filteredMessages = [];
      return;
    }
    
    // OPTIMIZACIÓN: Solo recrear el array si realmente cambió la longitud
    // o si hay nuevos mensajes (no solo actualizaciones de streaming)
    const newFilteredMessages = this.messages.filter(message => {
      const sender = this.getMessageSender(message);
      
      // REGLA 1: Mensajes del USUARIO siempre se muestran
      if (sender === 'user') {
        return true;
      }
      
      // REGLA 2: Mensajes del SISTEMA siempre se muestran
      if (sender === 'system') {
        return true;
      }
      
      // REGLA 3: Mensajes del BOT - lógica especial
      if (sender === 'bot') {
        // 3a. Si NO está en streaming, siempre mostrar
        if (!message.isStreaming) {
          return true;
        }
        
        // 3b. Si está en streaming, verificar si tiene contenido
        const hasContent = !!(message.content || message.text);
        
        // 3c. Si es placeholder vacío, ocultar
        if (message._isProcessingPlaceholder && !hasContent) {
          return message.isStreaming === true;
        }
        
        // 3d. Si está en streaming con contenido, mostrar
        return true;
      }

      // Por defecto, mostrar
      return true;
    });
    
    // Solo actualizar si el array realmente cambió
    // Comparar longitud y IDs para evitar re-renders innecesarios
    const lengthChanged = this.filteredMessages.length !== newFilteredMessages.length;
    const idsChanged = this.filteredMessages.some((m, i) => m.id !== newFilteredMessages[i]?.id);

    // Si cambió el content de alguno de los mensajes
    const contentChanged = this.filteredMessages.some((m, i) => {
      const oldContent = m.content || m.text || '';
      const newContent = newFilteredMessages[i]?.content || newFilteredMessages[i]?.text || '';
      return oldContent !== newContent;
    });
    
    // ⚠️ CRÍTICO: También verificar si cambió isStreaming en cualquier mensaje
    const streamingStateChanged = this.filteredMessages.some((m, i) => {
      return m.isStreaming !== newFilteredMessages[i]?.isStreaming;
    });
    
    if (lengthChanged || idsChanged || contentChanged || streamingStateChanged) {
      this.filteredMessages = newFilteredMessages;
    }
  }
  
  // ============ MÉTODO SIMPLIFICADO PARA OBTENER TEXTO ============
  
  getMessageText(message: ChatMessage): string {
    if (!message) return '';
    
    // Para mensajes del usuario, siempre mostrar texto limpio
    if (this.getMessageSender(message) === 'user') {
      return message.content || message.text || '';
    }
    
    // Para mensajes del bot (streaming o no)
    const content = message.content || message.text || '';
    
    // Si es streaming y está vacío, devolver vacío
    if (message.isStreaming && !content.trim()) {
      return '';
    }
    
    // Para streaming, limpiar caracteres especiales
    if (message.isStreaming && content) {
      return content
        .replace(/\|+\s*$/g, '')
        .replace(/[▏▕▌▍▎]\s*$/g, '')
        .trim();
    }
    
    // Para mensajes normales, devolver el contenido tal cual
    return content;
  }
  
  // ============ MÉTODO PARA EL TEMPLATE (usa getMessageText) ============
  
  getMessageDisplayText(message: ChatMessage): string {
    return this.getMessageText(message);
  }
  
  // ============ MÉTODOS DE ESTADO ============
  
  private initializeFeedbackStates(messages: ChatMessage[]): void {
    messages.forEach((message: ChatMessage, index: number) => {
      if (this.getMessageSender(message) === 'bot' && !message.isStreaming) {
        const messageId = this.getMessageId(message, index);
        
        if (!this.feedbackStates.has(messageId)) {
          this.feedbackStates.set(messageId, {
            type: message.feedback === 'like' ? 'like' : 
                  message.feedback === 'dislike' ? 'dislike' : null,
            showFeedbackBox: false,
            feedbackText: '',
            isSubmitting: false
          });
        }
      }
    });
  }
  
  isProcessingState(message: ChatMessage): boolean {
    if (!message.isStreaming) return false;
    
    const isPlaceholder = message._isProcessingPlaceholder === true;
    const hasContent = !!(message.content || message.text);
    const contentLength = (message.content || message.text || '').length;
    
    // Si es placeholder Y (no tiene contenido O tiene muy poco contenido)
    return isPlaceholder && (!hasContent || contentLength < 10);
  }
  
  shouldShowTypingAnimation(message: ChatMessage): boolean {
    return !!(message.isStreaming && !this.isProcessingState(message));
  }
  
  hasVisibleContent(message: ChatMessage): boolean {
    if (!message) return false;
    
    // Si es streaming, siempre mostrar (incluso si está vacío)
    if (message.isStreaming) {
      return true;
    }
    
    // Para mensajes normales, verificar contenido
    return !!(message.content || message.text);
  }
  
  // ============ MÉTODOS DE UI ============
  
  trackByMessage(index: number, message: ChatMessage): string {
    if (!message) return `null-${index}`;
    
    // Usar SOLO el ID, no el _streamingUpdate
    // Esto evita que se re-renderice cada chunk del streaming
    return message.id || `index-${index}`;
  }
  
  // ============ FEEDBACK METHODS ============
  
  setFeedback(message: ChatMessage, type: 'like' | 'dislike'): void {
    if (this.getMessageSender(message) === 'user' || message.isStreaming) return;
    
    const messageId = this.getMessageId(message);
    const state = this.getOrCreateFeedbackState(messageId);
    
    if (state.type === type) {
      state.type = null;
      state.showFeedbackBox = false;
    } else {
      state.type = type;
      state.showFeedbackBox = true;
    }
    
    this.cdr.markForCheck();
  }

  toggleFeedbackBox(message: ChatMessage): void {
    const messageId = this.getMessageId(message);
    const state = this.getOrCreateFeedbackState(messageId);
    
    state.showFeedbackBox = !state.showFeedbackBox;
    if (!state.showFeedbackBox) {
      state.feedbackText = '';
    }
    
    this.cdr.markForCheck();
  }

  submitFeedback(message: ChatMessage, commentFromView?: string): void {
    const messageId = this.getMessageId(message);
    const state = this.getOrCreateFeedbackState(messageId);
    
    if (state.isSubmitting) return;
    
    state.isSubmitting = true;
    
    const rating = state.type === 'like' ? 'up' : 
                   state.type === 'dislike' ? 'down' : null;
    const comment = commentFromView || state.feedbackText || '';
    
    this.feedback.emit({ message, rating, comment });
    
    setTimeout(() => {
      state.isSubmitting = false;
      state.showFeedbackBox = false;
      state.feedbackText = '';
      this.cdr.markForCheck();
    }, 1000);
  }

  private getOrCreateFeedbackState(messageId: string): FeedbackState {
    if (!this.feedbackStates.has(messageId)) {
      this.feedbackStates.set(messageId, {
        type: null,
        showFeedbackBox: false,
        feedbackText: '',
        isSubmitting: false
      });
    }
    return this.feedbackStates.get(messageId)!;
  }

  getFeedbackState(message: ChatMessage): FeedbackState & { hasSubmitted: boolean } {
    const messageId = this.getMessageId(message);
    const state = this.getOrCreateFeedbackState(messageId);
    
    (state as any).hasSubmitted = message.feedback === 'like' || message.feedback === 'dislike';
    return state as FeedbackState & { hasSubmitted: boolean };
  }

  shouldShowFeedback(message: ChatMessage): boolean {
    const isBotMessage = this.getMessageSender(message) === 'bot';
    const hasContent = !!this.getMessageText(message)?.trim();
    const isNotStreaming = !message.isStreaming;
    
    return isBotMessage && hasContent && isNotStreaming;
  }
  
  // ============ SOURCES POPOVER ============
  
  showSourcesPopoverFor(index: number): void {
    clearTimeout(this.popoverTimeout);
    this.visiblePopoverIndex = index;
  }

  hideSourcesPopoverFor(index: number): void {
    this.popoverTimeout = setTimeout(() => {
      if (this.visiblePopoverIndex === index) {
        this.visiblePopoverIndex = null;
      }
    }, 300);
  }

  toggleSourcesPopover(index: number): void {
    this.visiblePopoverIndex = this.visiblePopoverIndex === index ? null : index;
  }

  isSourcesPopoverVisible(index: number): boolean {
    return this.visiblePopoverIndex === index;
  }
  
  // ============ UTILITY METHODS ============
  
  getMessageSender(message: ChatMessage): 'user' | 'bot' | 'system' {
    return message.sender || (message.isUser ? 'user' : 'bot');
  }

  getMessageId(message: ChatMessage, index?: number): string {
    return message.id || `index-${index || 0}`;
  }

  trackBySource(index: number, source: any): string {
    return source.id || `src-${index}`;
  }
  
  // ============ CONTROL METHODS ============
  
  onRegenerateMessage(message: ChatMessage): void {
    if (!message.id) {
      console.warn(this.translationService.instant('ERRORS.REGENERATION_NO_ID'));
      return;
    }
    if (!this.canSendMessages()) {
      console.warn(this.translationService.instant('ERRORS.CHATBOT_BUSY'));
      return;
    }
    this.regenerate.emit(message);
  }

  onStopButton(message: ChatMessage): void {
    if (!message) {
      console.error('❌ Message es null/undefined');
      return;
    }
    
    // Construir el evento con la información del mensaje
    const stopEvent = {
      message: message,
      questionType: (message as any)._originalQuestionType || 'user',
      questionContent: this.findLastUserMessage()?.content || '',
      shouldRestoreToInput: false
    };
    
    // console.log('📤 EMITIENDO EVENTO STOP CON DATOS:', {
    //   messageId: stopEvent.message.id,
    //   questionType: stopEvent.questionType,
    //   contentPreview: stopEvent.questionContent?.substring(0, 50)
    // });
    
    // Emitir el evento
    this.stop.emit(stopEvent);
  }
  
  // ============ MÉTODOS MEJORADOS PARA SISTEMA UNIFICADO ============
  
  private performImmediateVisualCleanup(
    streamingMessage: ChatMessage | null, 
    questionType: 'user' | 'predefined'
  ): void {
    // console.log('🎨 Realizando limpieza visual inmediata...', {
    //   hasStreamingMessage: !!streamingMessage,
    //   questionType,
    //   streamingMessageContent: streamingMessage?.content?.substring(0, 50)
    // });
    
    const beforeCount = this.filteredMessages.length;
    
    // CORRECCIÓN: NO eliminar el mensaje de streaming
    // En su lugar, mantener el contenido y solo cambiar isStreaming a false
    
    // 1. Si hay mensaje de streaming con contenido, mantenerlo pero marcar como NO streaming
    if (streamingMessage && streamingMessage.content && streamingMessage.content.trim()) {
      // console.log('💾 Manteniendo contenido del mensaje de streaming:', {
      //   id: streamingMessage.id,
      //   contentLength: streamingMessage.content.length,
      //   preview: streamingMessage.content.substring(0, 100)
      // });
      
      // Buscar el mensaje en filteredMessages y actualizar su estado
      const messageIndex = this.filteredMessages.findIndex(m => m.id === streamingMessage.id);
      if (messageIndex !== -1) {
        this.filteredMessages[messageIndex] = {
          ...this.filteredMessages[messageIndex],
          isStreaming: false,
          _isProcessingPlaceholder: false
        };
        // console.log('✅ Mensaje actualizado a NO streaming pero con contenido preservado');
      }
    } else {
      // Solo si NO hay contenido, entonces eliminar el mensaje
      if (streamingMessage) {
        // console.log('🗑️ Eliminando mensaje de streaming vacío');
        this.filteredMessages = this.filteredMessages.filter(m => 
          m.id !== streamingMessage.id
        );
      }
      
      // También remover otros mensajes de bot en streaming SIN contenido
      const messagesToRemove: string[] = [];
      this.filteredMessages = this.filteredMessages.filter(m => {
        const isStreamingBot = m.isStreaming && this.getMessageSender(m) === 'bot';
        const hasNoContent = !m.content || !m.content.trim();
        
        if (isStreamingBot && hasNoContent) {
          messagesToRemove.push(m.id || 'unknown');
          return false;
        }
        return true;
      });
      
      if (messagesToRemove.length > 0) {
        // console.log('🗑️ Mensajes de streaming vacíos removidos:', messagesToRemove);
      }
    }
    
    // 2. Si es pregunta predefinida, también remover la pregunta del usuario
    if (questionType === 'predefined') {
      const lastUserMessage = this.findLastUserMessage();
      if (lastUserMessage && (lastUserMessage as any)._isPredefinedQuestion) {
        // console.log('🗑️ Removiendo pregunta predefinida del chat:', lastUserMessage.id);
        this.filteredMessages = this.filteredMessages.filter(m => 
          m.id !== lastUserMessage.id
        );
      }
    }
    
    const removedCount = beforeCount - this.filteredMessages.length;
    
    // 3. Forzar actualización de UI
    this.cdr.detectChanges();
    
    // console.log('✅ Limpieza visual completada. Mensajes removidos:', removedCount);
  }
  
  private trackLastUserQuestion(): void {
    // Suscribirse a cambios en los mensajes
    // Este método se llama desde ngOnChanges
  }
  
  private updateLastUserQuestionCache(): void {
    const userMessages = this.messages.filter(m => 
      m.sender === 'user' || m.isUser
    );
    
    if (userMessages.length === 0) {
      this.lastUserQuestion = null;
      return;
    }
    
    const lastUserMessage = userMessages[userMessages.length - 1];
    const isPredefined = (lastUserMessage as any)._isPredefinedQuestion;
    
    this.lastUserQuestion = {
      content: lastUserMessage.content || lastUserMessage.text || '',
      type: isPredefined ? 'predefined' : 'user',
      messageId: lastUserMessage.id || '',
      timestamp: Date.now()
    };
    
    // console.log('💾 Última pregunta cacheada:', {
    //   type: this.lastUserQuestion.type,
    //   content: this.lastUserQuestion.content.substring(0, 50),
    //   id: this.lastUserQuestion.messageId
    // });
  }
  
  private findLastUserMessage(): ChatMessage | null {
    const userMessages = this.messages.filter(m => 
      m.sender === 'user' || m.isUser
    );
    
    if (userMessages.length === 0) {
      return null;
    }
    
    return userMessages[userMessages.length - 1];
  }
  
  // ============ MÉTODOS DE STREAMING MEJORADOS ============
  
  private findCurrentStreamingMessage(): ChatMessage | null {
    const streamingMessages = this.filteredMessages.filter(m => 
      (this.getMessageSender(m) === 'bot' || !m.isUser) && 
      m.isStreaming === true
    );
    
    // console.log('🔍 Buscando mensajes de streaming:', {
    //   totalFiltered: this.filteredMessages.length,
    //   streamingFound: streamingMessages.length,
    //   streamingIds: streamingMessages.map(m => ({id: m.id, contentLength: m.content?.length}))
    // });
    
    if (streamingMessages.length === 0) {
      return null;
    }
    
    const latest = streamingMessages.reduce((latest, current) => {
      const latestTime = latest._streamingUpdate || latest.timestamp?.getTime() || 0;
      const currentTime = current._streamingUpdate || current.timestamp?.getTime() || 0;
      return currentTime > latestTime ? current : latest;
    });
    
    // console.log('🎯 Último mensaje de streaming encontrado:', {
    //   id: latest.id,
    //   contentLength: latest.content?.length,
    //   timestamp: latest.timestamp,
    //   _streamingUpdate: latest._streamingUpdate
    // });
    
    return latest;
  }

  private findAllStreamingMessages(): ChatMessage[] {
    return this.filteredMessages.filter(m => 
      (this.getMessageSender(m) === 'bot' || !m.isUser) && 
      m.isStreaming === true
    );
  }

  private hasActiveStreaming(): boolean {
    const streamingMessages = this.findAllStreamingMessages();
    
    // Verificar que el streaming tenga contenido reciente
    const activeStreaming = streamingMessages.some(m => {
      const lastUpdate = m._streamingUpdate || m.timestamp?.getTime() || 0;
      const timeSinceUpdate = Date.now() - lastUpdate;
      
      // Considerar activo si se actualizó en los últimos 30 segundos
      return timeSinceUpdate < 30000;
    });
    
    return activeStreaming;
  }

  private cleanupOldStreamingStates(): void {
    const now = Date.now();
    let foundOldStreaming = false;
    
    this.messages.forEach((message, index) => {
      if (message.isStreaming && this.getMessageSender(message) === 'bot') {
        const lastUpdate = message._streamingUpdate || message.timestamp?.getTime() || 0;
        const timeSinceUpdate = now - lastUpdate;
        
        // Si no se ha actualizado en 30 segundos, probablemente está obsoleto
        if (timeSinceUpdate > 30000) {
          foundOldStreaming = true;
          console.warn('⚠️ Mensaje de streaming obsoleto detectado:', {
            id: message.id,
            timeSinceUpdate: Math.round(timeSinceUpdate / 1000) + ' segundos',
            contentLength: message.content?.length,
            contentPreview: message.content?.substring(0, 50)
          });
        }
      }
    });
    
    if (foundOldStreaming) {
      // console.log('🔧 Recomendación: Los mensajes con isStreaming:true y sin actualización reciente deberían tener isStreaming:false');
    }
  }

  // ============ MÉTODOS DE DETERMINACIÓN DE TIPO DE PREGUNTA ============
  
  private determineQuestionTypeForMessage(
    message: ChatMessage, 
    providedType?: 'user' | 'predefined'
  ): 'user' | 'predefined' | undefined {
    
    if (providedType) {
      return providedType;
    }
    
    // Prioridad 1: Usar cache local
    if (this.lastUserQuestion) {
      // console.log('📋 Usando lastUserQuestion cacheado:', this.lastUserQuestion.type);
      return this.lastUserQuestion.type;
    }
    
    // Prioridad 2: Usar _originalQuestionType
    if ((message as any)._originalQuestionType) {
      // console.log('📋 Usando _originalQuestionType:', (message as any)._originalQuestionType);
      return (message as any)._originalQuestionType;
    }
    
    // Prioridad 3: Buscar en mensajes previos
    if (message.sender === 'bot' || !message.isUser) {
      const messageIndex = this.messages.findIndex(m => m.id === message.id);
      if (messageIndex > 0) {
        for (let i = messageIndex - 1; i >= 0; i--) {
          const prevMessage = this.messages[i];
          if (prevMessage.sender === 'user' || prevMessage.isUser) {
            const isPredefined = (prevMessage as any)._isPredefinedQuestion;
            // console.log('🔍 Tipo determinado desde mensaje previo:', {
            //   isPredefined,
            //   content: prevMessage.content?.substring(0, 50)
            // });
            return isPredefined ? 'predefined' : 'user';
          }
        }
      }
    }
    
    // Prioridad 4: Buscar en el mensaje actual (si es usuario)
    if (message.sender === 'user' || message.isUser) {
      const isPredefined = (message as any)._isPredefinedQuestion;
      // console.log('🔍 Tipo determinado desde mensaje actual:', isPredefined ? 'predefined' : 'user');
      return isPredefined ? 'predefined' : 'user';
    }
    
    // console.log('❓ No se pudo determinar el tipo de pregunta');
    return undefined;
  }

  // ============ MÉTODOS DE VISIBILIDAD DE BOTONES ============

  shouldShowRegenerateButton(message: ChatMessage): boolean {
    const isBotMessage = this.getMessageSender(message) === 'bot';
    const isComplete = !message.isStreaming;
    const hasContent = !!this.getMessageText(message);
    const isNotSystemMessage = this.getMessageSender(message) !== 'system';
    const isNotError = !message.content?.includes('ERRORS.') &&
                      !message.text?.includes('ERRORS.');

    const canRegenerateNow = this.canSendMessages() && !this.isProcessing;

    const lastBotMessage = [...this.filteredMessages].reverse().find(m => this.getMessageSender(m) === 'bot');
    const isLastBotMessage = lastBotMessage?.id === message.id;

    const result = isBotMessage && isComplete && hasContent && isNotSystemMessage && isNotError && canRegenerateNow && isLastBotMessage;

    return result;
  }

  // ============ MÉTODO MEJORADO: VISIBILIDAD DEL BOTÓN STOP ============
  
  shouldShowStopButton(message: ChatMessage): boolean {
    const isBotMessage = this.getMessageSender(message) === 'bot';
    const isStreaming = message.isStreaming === true;

    return isBotMessage && isStreaming && this.isProcessing && !this.isStopping;
  }

  canSendMessages(): boolean {
    const result = this.chatbotService.canSendMessages();
    return result;
  }
  
  // ============ MÉTODOS PARA TEMPLATE ============
  
  getStopButtonText(): string {
    return this.translationService.instant('CONTROLS.STOP');
  }

  getRegenerateButtonText(): string {
    return this.translationService.instant('CONTROLS.REGENERATE');
  }

  getProcessingText(): string {
    return this.translationService.instant('CHAT.PROCESSING');
  }

  getTypingText(): string {
    return this.translationService.instant('CHAT.TYPING');
  }

  getStartingText(): string {
    return this.translationService.instant('CHAT.STARTING');
  }
  
  // ============ MÉTODO PARA VERIFICAR STREAMING RECIENTE ============
  
  hasRecentStreamingUpdate(message: ChatMessage): boolean {
    if (!message.isStreaming) return false;
    
    const lastUpdate = message._streamingUpdate || message.timestamp?.getTime() || 0;
    const timeSinceUpdate = Date.now() - lastUpdate;
    
    // Considerar "reciente" si se actualizó en los últimos 15 segundos
    const isRecent = timeSinceUpdate < 15000;
    
    // console.log('⏰ Recent streaming check:', {
    //   id: message.id?.substring(0, 20),
    //   isStreaming: message.isStreaming,
    //   lastUpdate,
    //   timeSinceUpdate: Math.round(timeSinceUpdate / 1000) + 's',
    //   isRecent
    // });
    
    return isRecent;
  }
  
  // ============ MÉTODOS DE EMERGENCIA ============
  
  emergencyStop(): void {
    // console.log('🚨 EMERGENCY STOP desde ChatbotMessagesComponent');
    this.onStopResponse();
  }
  
  debugCurrentState(): void {
    const debugInfo = {
      messagesCount: this.messages.length,
      filteredMessagesCount: this.filteredMessages.length,
      isProcessing: this.isProcessing,
      lastUserQuestion: this.lastUserQuestion,
      streamingMessages: this.findAllStreamingMessages().length,
      shouldShowStopButtons: this.filteredMessages.filter(m => this.shouldShowStopButton(m)).length,
      canSendMessages: this.canSendMessages()
    };
    
    // console.log('🐛 DEBUG ChatbotMessagesComponent:', debugInfo);
  }
  
  // ============ CLEANUP ============

  ngOnDestroy() {
    if (this.cursorInterval) clearInterval(this.cursorInterval);
    if (this.popoverTimeout) clearTimeout(this.popoverTimeout);
    this.feedbackStates.clear();
  }
}