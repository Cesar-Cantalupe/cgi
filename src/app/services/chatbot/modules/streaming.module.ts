import { Injectable, NgZone, OnDestroy } from '@angular/core';
import { Subject, Subscription, firstValueFrom } from 'rxjs';
import { ChatbotStateService } from '../core/chatbot-state.service';
import { TypewriterModule } from './typewriter.module';
import { ChatMessage } from '../interfaces/chat-message.interface';

export interface StreamingCompleteData {
  content: string;
  sources: any[];
  question: string;
  wasCancelled?: boolean;
  cancellationReason?: 'user_request' | 'timeout' | 'error' | 'system';
  questionType?: 'user' | 'predefined';
  streamDuration?: number;
  finalTextLength?: number;
}

export interface StreamingCancellationData {
  reason: 'user_request' | 'timeout' | 'error' | 'system';
  question: string;
  questionType?: 'user' | 'predefined';
  accumulatedText: string;
  streamDuration: number;
}

@Injectable({ providedIn: 'root' })
export class StreamingModule implements OnDestroy {
  // Streams de eventos
  public onStreamComplete = new Subject<StreamingCompleteData>();
  public onStreamCancelled = new Subject<StreamingCancellationData>();
  
  // Estado del streaming
  private currentStreamId: string | null = null;
  private lastQuestion = '';
  private lastQuestionType: 'user' | 'predefined' | undefined = undefined;
  private accumulatedText = '';
  private finalSources: any[] = [];
  private wasCancelled = false;
  private cancellationReason: 'user_request' | 'timeout' | 'error' | 'system' = 'user_request';
  private typewriterSubscription: Subscription | null = null;
  private streamStartTime = 0;
  
  // Tiempos de espera y config
  private readonly STREAM_TIMEOUT = 30000;
  private readonly MIN_TEXT_FOR_DISPLAY = 1;
  private cancellationTimeout: any = null;

  constructor(
    private state: ChatbotStateService,
    private typewriter: TypewriterModule,
    private ngZone: NgZone
  ) {
    console.log('🎬 StreamingModule creado');
  }

  // ============ API PÚBLICA SIMPLIFICADA ============

  /**
   * Inicia un nuevo stream
   */
  startStream(question?: string, questionType?: 'user' | 'predefined'): ChatMessage {
    console.log('🚀 STREAMING: startStream() - pregunta:', {
      content: question?.substring(0, 50),
      type: questionType
    });
    
    this.cleanupCurrentStream();
    
    this.streamStartTime = Date.now();
    this.wasCancelled = false;
    this.cancellationReason = 'user_request';
    this.accumulatedText = '';
    this.finalSources = [];
    
    if (question) {
      this.lastQuestion = question;
    }
    
    if (questionType) {
      this.lastQuestionType = questionType;
    }
    
    // Crear mensaje de streaming
    const messageId = `stream-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const message: ChatMessage = {
      id: messageId,
      content: '',
      text: '',
      sender: 'bot',
      isUser: false,
      timestamp: new Date(),
      isStreaming: true,
      sources: [],
      // Propiedades para control interno
      _isProcessingPlaceholder: true,
      _streamingUpdate: Date.now(),
      _initialStreaming: true,
      _originalQuestionType: questionType,
      showFeedbackBox: false
    };
    
    console.log('📝 STREAMING: Creando mensaje con ID:', messageId, 'Tipo pregunta:', questionType);
    
    // Agregar al estado
    this.state.addMessage(message);
    this.state.setStreamingMessage(message);
    this.state.setProcessing(true);
    
    this.currentStreamId = messageId;
    
    // Configurar timeout automático
    this.setupAutoCancellation();
    
    return message;
  }

  /**
   * Agrega texto al stream actual
   */
  addChunk(chunk: string): void {
    if (this.wasCancelled || !this.currentStreamId) {
      return;
    }
    
    if (!chunk?.trim() && chunk !== ' ') {
      return;
    }
    
    // ACUMULAR TEXTO
    this.accumulatedText += chunk;
    
    // Resetear timeout de cancelación automática
    this.resetAutoCancellation();
    
    // ACTUALIZAR SIEMPRE
    if (this.accumulatedText.length > 0) {
      // ACTUALIZAR EL ESTADO
      this.updateMessage(this.currentStreamId, {
        content: this.accumulatedText,
        text: this.accumulatedText,
        isStreaming: true,
        _isProcessingPlaceholder: this.accumulatedText.length < 10,
        _streamingUpdate: Date.now(),
        _initialStreaming: false
      });
    }
  }

  /**
   * Finaliza el stream con el texto completo
   */
  async completeStream(fullResponse: string, sources: any[] = []): Promise<void> {
    console.log('🏁 STREAMING: completeStream() - respuesta completa:', {
      length: fullResponse.length,
      questionType: this.lastQuestionType,
      question: this.lastQuestion?.substring(0, 50)
    });
    
    if (this.wasCancelled || !this.currentStreamId) {
      this.cleanupCurrentStream();
      return;
    }
    
    // Limpiar timeout de cancelación automática
    this.clearAutoCancellation();
    
    this.accumulatedText = fullResponse;
    this.finalSources = sources;
    
    // Primero, actualizar el mensaje con el texto completo (sin animación)
    this.updateMessage(this.currentStreamId, {
      content: this.accumulatedText,
      isStreaming: true,
      _isProcessingPlaceholder: false,
      _streamingUpdate: Date.now(),
      text: this.accumulatedText,
      sources: this.finalSources
    });
    
    // Luego animar si es necesario
    await this.animateFinalText();
    
    // Marcar como completado
    this.finalizeStream();
  }

  /**
   * Cancela el stream actual
   */
  cancelStream(reason: 'user_request' | 'timeout' | 'error' | 'system' = 'user_request'): void {
    console.log('⏹️ STREAMING: cancelStream() llamado - Razón:', reason);
    
    if (this.wasCancelled) {
      console.log('ℹ️ Stream ya cancelado previamente');
      return;
    }
    
    this.wasCancelled = true;
    this.cancellationReason = reason;
    
    // Limpiar timeout de cancelación automática
    this.clearAutoCancellation();
    
    // Detener animación si existe
    if (this.currentStreamId) {
      this.typewriter.stopAnimation(this.currentStreamId);
    }
    
    // Emitir evento de cancelación
    this.emitCancellationEvent(reason);
    
    // Esperar un momento antes de limpiar si hay animación
    const isAnimating = this.typewriter.isAnimating(this.currentStreamId || '');
    
    if (isAnimating) {
      console.log('⏳ Hay animación activa, esperando para limpiar...');
      setTimeout(() => {
        this.completeCancellation();
      }, 300);
    } else {
      this.completeCancellation();
    }
  }

  /**
   * Verifica si hay un stream activo
   */
  isStreaming(): boolean {
    return !!this.currentStreamId && !this.wasCancelled;
  }

  /**
   * Obtiene información de debug
   */
  getDebugInfo() {
    const streamDuration = this.streamStartTime ? Date.now() - this.streamStartTime : 0;
    
    return {
      streamId: this.currentStreamId,
      textLength: this.accumulatedText.length,
      isCancelled: this.wasCancelled,
      cancellationReason: this.cancellationReason,
      sourcesCount: this.finalSources.length,
      duration: streamDuration,
      lastQuestion: this.lastQuestion?.substring(0, 50),
      lastQuestionType: this.lastQuestionType,
      streamStartTime: this.streamStartTime,
      isAnimating: this.typewriter.isAnimating(this.currentStreamId || '')
    };
  }

  // ============ NUEVOS MÉTODOS PARA SISTEMA UNIFICADO DE STOP ============

  /**
   * Obtiene información completa de la cancelación actual
   */
  getCancellationInfo(): StreamingCancellationData {
    const streamDuration = this.streamStartTime ? Date.now() - this.streamStartTime : 0;
    
    return {
      reason: this.cancellationReason,
      question: this.lastQuestion,
      questionType: this.lastQuestionType,
      accumulatedText: this.accumulatedText,
      streamDuration: streamDuration
    };
  }

  /**
   * Obtiene información del stream actual
   */
  getCurrentStreamInfo() {
    return {
      id: this.currentStreamId,
      question: this.lastQuestion,
      questionType: this.lastQuestionType,
      textLength: this.accumulatedText.length,
      isCancelled: this.wasCancelled,
      startTime: this.streamStartTime,
      duration: this.streamStartTime ? Date.now() - this.streamStartTime : 0
    };
  }

  /**
   * Limpia el stream actual sin emitir eventos
   * Para uso del sistema unificado de STOP
   */
  silentCleanup(): void {
    console.log('🔇 STREAMING: silentCleanup() - Limpieza silenciosa');
    this.cleanupCurrentStream();
  }

  // ============ MÉTODOS PRIVADOS ============

  private emitCancellationEvent(reason: 'user_request' | 'timeout' | 'error' | 'system'): void {
    const streamDuration = this.streamStartTime ? Date.now() - this.streamStartTime : 0;
    
    const cancellationData: StreamingCancellationData = {
      reason: reason,
      question: this.lastQuestion,
      questionType: this.lastQuestionType,
      accumulatedText: this.accumulatedText,
      streamDuration: streamDuration
    };
    
    console.log('📤 STREAMING: Emitiendo evento de cancelación:', {
      reason: cancellationData.reason,
      questionType: cancellationData.questionType,
      textLength: cancellationData.accumulatedText.length,
      duration: cancellationData.streamDuration
    });
    
    this.ngZone.run(() => {
      this.onStreamCancelled.next(cancellationData);
    });
  }

  private completeCancellation(): void {
    console.log('✅ STREAMING: Completando cancelación');
    
    const streamDuration = this.streamStartTime ? Date.now() - this.streamStartTime : 0;
    
    // Emitir evento de cancelación completa
    const completionData: StreamingCompleteData = {
      content: this.accumulatedText,
      sources: this.finalSources,
      question: this.lastQuestion,
      wasCancelled: true,
      cancellationReason: this.cancellationReason,
      questionType: this.lastQuestionType,
      streamDuration: streamDuration,
      finalTextLength: this.accumulatedText.length
    };
    
    this.ngZone.run(() => {
      this.onStreamComplete.next(completionData);
    });
    
    console.log('📤 STREAMING: Evento onStreamComplete emitido (cancelado):', {
      wasCancelled: true,
      reason: this.cancellationReason,
      questionType: this.lastQuestionType
    });
    
    // Limpiar TODO
    this.cleanupCurrentStream();
  }

  private async animateFinalText(): Promise<void> {
    if (!this.currentStreamId || !this.accumulatedText) {
      return;
    }
    
    // GUARDAR REFERENCIAS LOCALES para evitar problemas de timing
    const streamIdToAnimate = this.currentStreamId;
    const textToAnimate = this.accumulatedText;
    const sourcesToUse = [...this.finalSources];
    const questionType = this.lastQuestionType;
    
    try {
      // Detener cualquier animación previa
      this.typewriter.stopAnimation(streamIdToAnimate);
      
      // Iniciar nueva animación
      const animation$ = this.typewriter.startAnimation(
        streamIdToAnimate,
        textToAnimate
      );
      
      this.typewriterSubscription = animation$.subscribe({
        next: (animatedText) => {
          this.ngZone.run(() => {
            // Usar la referencia local
            this.updateMessage(streamIdToAnimate, {
              content: animatedText,
              text: animatedText,
              isStreaming: true,
              _isProcessingPlaceholder: false,
              _streamingUpdate: Date.now()
            });
          });
        },
        complete: () => {
          this.ngZone.run(() => {
            // Llamar a un método que use la referencia local
            this.finalizeAnimationWithId(streamIdToAnimate, textToAnimate, sourcesToUse, questionType);
          });
        },
        error: (error) => {
          console.error('💥 STREAMING: Error en animación:', error);
          this.ngZone.run(() => {
            this.finalizeAnimationWithId(streamIdToAnimate, textToAnimate, sourcesToUse, questionType);
          });
        }
      });
      
      // Esperar a que complete la animación
      await firstValueFrom(animation$);
      
    } catch (error) {
      console.error('💥 STREAMING: Error en animateFinalText:', error);
      // Asegurarse de finalizar incluso si hay error
      this.finalizeAnimationWithId(streamIdToAnimate, textToAnimate, sourcesToUse, questionType);
    }
  }

  // Método para finalizar con ID explícito
  private finalizeAnimationWithId(
    messageId: string, 
    finalText: string, 
    sources: any[], 
    questionType?: 'user' | 'predefined'
  ): void {
    if (!messageId) {
      console.error('❌ STREAMING: No hay ID para finalizar');
      return;
    }
    
    // Actualizar mensaje como completado
    this.updateMessage(messageId, {
      content: finalText,
      text: finalText,
      isStreaming: false,
      showFeedbackBox: true,
      sources: sources,
      _isProcessingPlaceholder: false,
      _streamingUpdate: Date.now(),
      _originalQuestionType: questionType
    });
    
    // Solo marcar processing como false si este es el stream actual
    if (this.currentStreamId === messageId) {
      this.state.setProcessing(false);
    }
  }

  private finalizeStream(): void {
    if (!this.currentStreamId) {
      console.error('❌ STREAMING: No hay stream para finalizar');
      return;
    }
    
    const streamDuration = this.streamStartTime ? Date.now() - this.streamStartTime : 0;
    
    const completionData: StreamingCompleteData = {
      content: this.accumulatedText,
      sources: this.finalSources,
      question: this.lastQuestion,
      wasCancelled: false,
      questionType: this.lastQuestionType,
      streamDuration: streamDuration,
      finalTextLength: this.accumulatedText.length
    };
    
    // Emitir evento de completado
    this.ngZone.run(() => {
      this.onStreamComplete.next(completionData);
    });
    
    console.log('📤 STREAMING: Evento onStreamComplete emitido (completado):', {
      wasCancelled: false,
      questionType: this.lastQuestionType,
      textLength: this.accumulatedText.length
    });
    
    // Limpiar estado
    this.state.setStreamingMessage(null);
    this.currentStreamId = null;
    
    console.log('✅ STREAMING: Stream finalizado exitosamente');
  }

  private updateMessage(messageId: string, updates: Partial<ChatMessage>): void {
    try {
      // Forzar nueva referencia del objeto para activar change detection
      const fullUpdates = {
        ...updates,
        _streamingUpdate: Date.now() // Siempre actualizar timestamp
      };
      
      this.state.updateMessage(messageId, fullUpdates);
    } catch (error) {
      console.error('💥 STREAMING: Error actualizando mensaje:', error);
    }
  }

  private cleanupCurrentStream(): void {
    console.log('🧹 STREAMING: Limpiando stream actual');
    
    // Limpiar timeout de cancelación automática
    this.clearAutoCancellation();
    
    // Verificar si hay animación activa
    const isAnimating = this.currentStreamId 
      ? this.typewriter.isAnimating(this.currentStreamId)
      : false;
    
    if (isAnimating) {
      // Solo limpiar suscripción
      if (this.typewriterSubscription) {
        this.typewriterSubscription.unsubscribe();
        this.typewriterSubscription = null;
      }
      
      // Detener animación
      if (this.currentStreamId) {
        this.typewriter.stopAnimation(this.currentStreamId);
      }
      
      return;
    }
    
    // Limpio total solo si no hay animación
    if (this.typewriterSubscription) {
      this.typewriterSubscription.unsubscribe();
      this.typewriterSubscription = null;
    }
    
    // Detener animaciones
    if (this.currentStreamId) {
      this.typewriter.stopAnimation(this.currentStreamId);
    }
    
    // Resetear estado
    this.currentStreamId = null;
    this.accumulatedText = '';
    this.finalSources = [];
    this.wasCancelled = false;
    this.cancellationReason = 'user_request';
    this.state.setProcessing(false);
    this.state.setStreamingMessage(null);
    this.lastQuestionType = undefined;
  }

  // ============ MÉTODOS DE TIMEOUT AUTOMÁTICO ============

  private setupAutoCancellation(): void {
    // Limpiar timeout previo si existe
    this.clearAutoCancellation();
    
    // Configurar nuevo timeout
    this.cancellationTimeout = setTimeout(() => {
      if (this.currentStreamId && !this.wasCancelled) {
        console.log('⏰ STREAMING: Timeout automático alcanzado, cancelando stream');
        this.cancelStream('timeout');
      }
    }, this.STREAM_TIMEOUT);
  }

  private resetAutoCancellation(): void {
    if (this.cancellationTimeout) {
      clearTimeout(this.cancellationTimeout);
      this.setupAutoCancellation();
    }
  }

  private clearAutoCancellation(): void {
    if (this.cancellationTimeout) {
      clearTimeout(this.cancellationTimeout);
      this.cancellationTimeout = null;
    }
  }

  // ============ MÉTODOS DE CONFIGURACIÓN ============

  setLastQuestion(question: string): void {
    this.lastQuestion = question;
  }

  setQuestionType(questionType: 'user' | 'predefined'): void {
    this.lastQuestionType = questionType;
    console.log('🏷️ STREAMING: Tipo de pregunta establecido:', questionType);
  }

  getIsAnimating(): boolean {
    return this.typewriter.isAnimating(this.currentStreamId || '');
  }
  
  // ============ MÉTODOS ADICIONALES PARA DEBUG ============
  
  /**
   * Método para debug: obtener el mensaje actual
   */
  getCurrentStreamMessage(): ChatMessage | null {
    if (!this.currentStreamId) return null;
    
    const messages = this.state.messages;
    return messages.find(m => m.id === this.currentStreamId) || null;
  }
  
  /**
   * Verifica si el stream actual corresponde a una pregunta específica
   */
  isStreamForQuestion(question: string, questionType?: 'user' | 'predefined'): boolean {
    if (!this.currentStreamId || this.wasCancelled) {
      return false;
    }
    
    const isSameQuestion = this.lastQuestion === question;
    const isSameType = !questionType || this.lastQuestionType === questionType;
    
    return isSameQuestion && isSameType;
  }
  
  /**
   * Obtiene estadísticas del stream
   */
  getStreamStats() {
    const streamDuration = this.streamStartTime ? Date.now() - this.streamStartTime : 0;
    const charsPerSecond = streamDuration > 0 ? 
      Math.round((this.accumulatedText.length / streamDuration) * 1000) : 0;
    
    return {
      duration: streamDuration,
      textLength: this.accumulatedText.length,
      charsPerSecond: charsPerSecond,
      isActive: !!this.currentStreamId && !this.wasCancelled,
      questionType: this.lastQuestionType,
      startTime: new Date(this.streamStartTime).toISOString()
    };
  }

  
  ngOnDestroy(): void {
    console.log('🧹 STREAMING: ngOnDestroy() llamado');
    this.cancelStream('system');
    this.onStreamComplete.complete();
    this.onStreamCancelled.complete();
    this.clearAutoCancellation();
  }
}