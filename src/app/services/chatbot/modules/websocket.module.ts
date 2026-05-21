import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Observable, Subject, takeUntil } from 'rxjs';
import { StreamingModule } from './streaming.module';
import { ChatbotStateService } from '../core/chatbot-state.service';
import { WebsocketService } from './../shared/websocket.service';
import { environment } from '../../../../environments/environment';

export interface WebsocketEvent {
  type: string;
  [key: string]: any;
}

@Injectable({ providedIn: 'root' })
export class WebsocketModule implements OnDestroy {
  private connectionStatus = new BehaviorSubject<string>('disconnected');
  private destroyed = new Subject<void>();
  
  private readonly WS_URL = this.buildWebsocketUrl();
  private isInitialized = false;
  private currentQuestion = '';
  private currentQuestionType: 'user' | 'predefined' = 'user';
  private streamingActive = false;
  private ignoreNextStreamEnd = false;
  private healthProfileEnabled = false;
  
  public connectionStatus$ = this.connectionStatus.asObservable();

  constructor(
    private websocket: WebsocketService,
    private streaming: StreamingModule,
    private state: ChatbotStateService
  ) {
  }

  // ============ API PÚBLICA SIMPLIFICADA ============

  initialize(): void {
    if (this.isInitialized) {
      return;
    }
    
    this.isInitialized = true;
    
    this.websocket.connect(this.WS_URL).subscribe({
      next: (connected) => {
        if (connected) {
          this.setupMessageHandling();
          this.connectionStatus.next('connected');
        } else {
          this.connectionStatus.next('disconnected');
        }
      },
      error: (error) => {
        console.error('💥 Error en WebSocket.connect():', error);
        this.connectionStatus.next('error');
      }
    });
  }

  setHealthProfileEnabled(enabled: boolean): void {
    this.healthProfileEnabled = enabled;
  }

  getHealthProfileEnabled(): boolean {
    return this.healthProfileEnabled;
  }

  sendQuery(query: string, filters: any = {}, questionType: 'user' | 'predefined' = 'user'): void {
    if (!this.isConnected()) {
      console.error('❌ ERROR: WebSocket no conectado');
      throw new Error('WebSocket not connected');
    }

    // Preparar nuevo estado
    this.currentQuestion = query;
    this.currentQuestionType = questionType;
    this.streamingActive = true;

    const message: any = {
      query: query,
      stream: false,
      timestamp: Date.now()
    };

    this.websocket.sendMessage(message);
  }

  sendReset(filters: any = {}, history: { role: string; content: string }[] = []): void {
    if (!this.isConnected()) {
      console.error('❌ ERROR: WebSocket no conectado');
      return;
    }

    const resetFilters: any = {};

    // Only include health profile fields if MHP (My Health Profile) toggle is enabled (for new conversation creation)
    const { tumor_type, tumor_alteration, treatment } = filters;
    if (tumor_type)       resetFilters['tumor_type']       = tumor_type;
    if (tumor_alteration) resetFilters['tumor_alteration'] = tumor_alteration;
    if (treatment)        resetFilters['treatment']        = treatment;

    const message: any = {
      type: 'reset',
      filters: resetFilters,
      history,
      timestamp: Date.now()
    };

    this.websocket.sendMessage(message);
  }

  cancelCurrentQuery(): void {
    if (!this.streamingActive) {
      return;
    }

    // Marcar que debemos ignorar el próximo stream_end
    this.ignoreNextStreamEnd = true;
    
    // Cancelar en el streaming module
    this.streaming.cancelStream('user_request');

    // Poner streamingActive en false para ignorar chunks futuros
    this.streamingActive = false;
  }

  reconnect(): void {
    this.disconnect();
    setTimeout(() => {
      this.initialize();
    }, 1000);
  }

  forceReset(): void {
    this.resetStreamState();
    
    // Verificar estado de conexión
    if (!this.isConnected()) {
      this.reconnect();
    }
  }

  disconnect(): void {
    this.isInitialized = false;
    this.resetStreamState();
    this.websocket.disconnect();
    this.connectionStatus.next('disconnected');
  }

  isConnected(): boolean {
    return this.websocket.isWebSocketConnected();
  }

  canSendQuery(): boolean {
    // No se puede enviar si:
    // 1. Hay streaming activo
    // 2. Estamos esperando el stream_end después de STOP
    return !this.streamingActive && !this.ignoreNextStreamEnd;
  }

  // ============ MÉTODOS PRIVADOS ============

  private buildWebsocketUrl(): string {
    const baseUrl = environment.websocketUrl || 'ws://localhost:8000/ws';
    const apiKey = environment.apiKey ? `?api_key=${environment.apiKey}` : '';
    return `${baseUrl}${apiKey}`;
  }

  private setupMessageHandling(): void {
    this.websocket.messages$
      .pipe(takeUntil(this.destroyed))
      .subscribe({
        next: (event: WebsocketEvent) => {
          this.handleWebSocketEvent(event);
        },
        error: (error) => {
          console.error('💥 Error en suscripción a mensajes:', error);
          this.handleConnectionError(error);
        }
      });
  }

  private handleWebSocketEvent(event: WebsocketEvent): void {
    if (!event || !event.type) {
      return;
    }

    switch (event.type) {
      case 'stream_start':
        this.handleStreamStart(event);
        break;
        
      case 'stream_chunk':
        this.handleStreamChunk(event);
        break;
        
      case 'stream_end':
        this.handleStreamEnd(event);
        break;

      case 'response': //Se recibe la Respuesta entera (usado cuando stream=false en el envío de la query)
        this.handleResponse(event);
        break;
        
      case 'status':
        if (event['client_id']) {
          this.state.setClientId(event['client_id']);
        }
        break;
        
      case 'error':
        this.handleErrorEvent(event);
        break;
        
      case 'pong':
        if (event['client_id']) {
          this.state.setClientId(event['client_id']);
        }
        break;
    }
  }

  private handleStreamStart(event: WebsocketEvent): void {
    if (event['client_id']) {
      this.state.setClientId(event['client_id']);
    }
    
    if (!this.streaming.isStreaming()) {
      this.streaming.startStream(this.currentQuestion, this.currentQuestionType, this.ignoreNextStreamEnd);
    } else {
      console.warn('⚠️ Ya hay un stream activo, ignorando nuevo stream_start');
    }
  }

  private handleStreamChunk(event: WebsocketEvent): void {
    console.log('📦 CHUNK recibido');
    
    if (!this.streamingActive) {
      console.warn('⚠️ IGNORANDO chunk (después de STOP)');
      return;
    }
    
    const chunk = event['chunk'];
    if (chunk && chunk.trim()) {
      this.streaming.addChunk(chunk);
    }
  }

  private handleStreamEnd(event: WebsocketEvent): void {
    console.log('📨 Stream END recibido');

    // Si debemos ignorar este stream_end
    if (this.ignoreNextStreamEnd) {
      console.warn('⚠️ IGNORANDO stream_end (después de STOP)');
      
      // Limpiar el flag
      this.ignoreNextStreamEnd = false;
      
      // Resetear completamente el estado
      this.resetStreamState();
      
      // Limpiar mensajes de streaming del estado
      this.cleanupStreamingMessages();
      
      this.state.setStopping(false);
      
      console.log('✅ Limpieza completada, listo para nueva pregunta');
      return;
    }
    
    const fullResponse = event['full_response'] || event['response'] || '';
    const sources = event['sources'] || [];

    console.log('✅ [WEBSOCKET MODULE] Completando stream con respuesta:', {
      length: fullResponse.length,
      sourcesCount: sources.length
    });

    this.streaming.completeStream(fullResponse, sources)
      .then(() => {
        console.log('✅ [WEBSOCKET MODULE] completeStream() completado, reseteando stream state');
        this.resetStreamState();
      })
      .catch(error => {
        console.error('💥 [WEBSOCKET MODULE] Error completando stream:', error);
        this.resetStreamState();
      });
  }

  private handleResponse(event: WebsocketEvent): void {
    // Si el usuario canceló mientras esperaba la respuesta, ignorarla
    if (this.ignoreNextStreamEnd) {
      console.warn('⚠️ IGNORANDO response (después de STOP)');
      this.ignoreNextStreamEnd = false;
      this.resetStreamState();
      this.cleanupStreamingMessages();
      this.state.setStopping(false);
      return;
    }

    if (!this.streamingActive) {
      console.warn('⚠️ IGNORANDO response (streamingActive=false)');
      return;
    }

    const clientId = event['metadata']?.['client_id'] || event['client_id'];
    if (clientId) {
      this.state.setClientId(clientId);
    }

    const fullResponse = event['response'] || '';
    const sources = event['sources'] || [];

    // Iniciar stream solo si no hay uno activo ya (el engine pudo haberlo iniciado)
    if (!this.streaming.isStreaming()) {
      this.streaming.startStream(this.currentQuestion, this.currentQuestionType, false);
    }
    this.streaming.completeStream(fullResponse, sources)
      .then(() => {
        this.resetStreamState();
      })
      .catch(error => {
        console.error('💥 [WEBSOCKET MODULE] Error completando response:', error);
        this.resetStreamState();
      });
  }

  private handleFollowUp(event: WebsocketEvent): void {
    const questions: string[] = event['questions'] || [];
    if (!questions.length) return;

    this.state.setFollowUpQuestions(questions);
  }

  private handleErrorEvent(event: WebsocketEvent): void {
    const errorMsg = event['message'] || '';

    // Error por tipo de mensaje no soportado (ej: "reset" en backend viejo)
    // No es fatal, solo loguear y seguir
    if (errorMsg.includes('Unsupported message type')) {
      console.warn('⚠️ Tipo de mensaje no soportado por la API:', errorMsg);
      return;
    }

    // Errores fatales — cancelar y marcar desconexión
    console.error('💥 Error fatal WebSocket:', event);
    this.streaming.cancelStream();
    this.resetStreamState();
    this.connectionStatus.next('error');
  }

  private handleConnectionError(error: any): void {
    this.state.setProcessing(false);
    this.streaming.cancelStream();
    this.resetStreamState();
    this.connectionStatus.next('error');
  }

  private resetStreamState(): void {
    this.streamingActive = false;
    this.currentQuestion = '';
    this.currentQuestionType = 'user';
    this.ignoreNextStreamEnd = false;
    this.state.setProcessing(false);
    this.state.setClientId(null);
  }

  private cleanupStreamingMessages(): void {
    // Eliminar todos los mensajes con isStreaming=true
    const streamingMessages = this.state.messages.filter(m => m.isStreaming === true);
    
    console.log('🧹 Limpiando mensajes de streaming:', streamingMessages.length);
    
    streamingMessages.forEach(msg => {
      if (msg.id) {
        this.state.removeMessage(m => m.id === msg.id);
      }
    });
    
    // Limpiar también el currentStreamingMessage
    this.state.setStreamingMessage(null);
  }

  // ============ MÉTODOS UTILITARIOS ============

  getStats() {
    return {
      connected: this.isConnected(),
      streamingActive: this.streamingActive,
      currentQuestion: this.currentQuestion,
      connectionStatus: this.connectionStatus.value
    };
  }

  sendFeedback(feedbackData: any): void {
    if (!this.isConnected()) {
      console.warn('⚠️ WebSocket not connected, feedback not sent');
      return;
    }
    
    // Construir mensaje en el formato especificado por la documentación "2025-11-06_front-back-integration [WIP] (3)"
    const message = {
      client_id: feedbackData.client_id || this.state.currentClientId || '',
      type: 'feedback',
      query: feedbackData.query || '',
      response: feedbackData.response || '',
      rating: feedbackData.rating || '',
      comment: feedbackData.comment || '',
      timestamp: Date.now()
    };
    
    this.websocket.sendMessage(message);
  }

 

  ngOnDestroy(): void {
    this.destroyed.next();
    this.destroyed.complete();
    this.disconnect();
  }
}