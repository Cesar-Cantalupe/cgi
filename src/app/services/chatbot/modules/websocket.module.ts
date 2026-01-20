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
  
  public connectionStatus$ = this.connectionStatus.asObservable();

  constructor(
    private websocket: WebsocketService,
    private streaming: StreamingModule,
    private state: ChatbotStateService
  ) {
    // console.log('🔧 WebsocketModule creado');
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

  sendQuery(query: string, filters: any = {}, questionType: 'user' | 'predefined' = 'user'): void {
    if (!this.isConnected()) {
      console.error('❌ ERROR: WebSocket no conectado');
      throw new Error('WebSocket not connected');
    }
    
    // Preparar nuevo estado
    this.currentQuestion = query;
    this.currentQuestionType = questionType;
    this.streamingActive = true;
    
    const message = {
      query: query,
      filters: filters,
      stream: true,
      timestamp: Date.now()
    };
    
    this.websocket.sendMessage(message);
    // console.log('✅ Query enviado:', { query, streamingActive: this.streamingActive });
  }

  cancelCurrentQuery(): void {
    if (!this.streamingActive) {
      return;
    }
    
    this.streaming.cancelStream();
    
    if (this.isConnected()) {
      const cancelMessage = {
        query: 'CANCEL',
        filters: { reason: 'user_cancelled' },
        stream: false,
        timestamp: Date.now()
      };
      
      this.websocket.sendMessage(cancelMessage);
    }
    
    this.resetStreamState();
  }

  reconnect(): void {
    this.disconnect();
    setTimeout(() => {
      this.initialize();
    }, 1000);
  }

  forceReset(): void {
    // console.log('⚠️ FORCE RESET solicitado en WebsocketModule');
    this.resetStreamState();
    
    // Verificar estado de conexión
    if (!this.isConnected()) {
      // console.log('⚠️ Conexión caída detectada en forceReset, reconectando...');
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
        
      case 'status':
        if (event['client_id']) {
          this.state.setClientId(event['client_id']);
        }
        break;
        
      case 'error':
        console.error('💥 Error WebSocket:', event);
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
    // console.log('📨 Stream START recibido:', {
    //   clientId: event['client_id'],
    //   currentQuestion: this.currentQuestion,
    //   isStreaming: this.streaming.isStreaming(),
    //   streamingActive: this.streamingActive
    // });
    
    if (event['client_id']) {
      this.state.setClientId(event['client_id']);
    }
    
    if (!this.streaming.isStreaming()) {
      // console.log('✅ Iniciando nuevo stream para:', this.currentQuestion);
      this.streaming.startStream(this.currentQuestion, this.currentQuestionType);
    } else {
      console.warn('⚠️ Ya hay un stream activo, ignorando nuevo stream_start');
    }
  }

  private handleStreamChunk(event: WebsocketEvent): void {
    console.log('📦 CHUNK recibido:', {
      timestamp: new Date().toISOString(),
      chunk_length: event['chunk']?.length || 0,
      chunk_preview: event['chunk']?.substring(0, 100),
      streamingActive: this.streamingActive,
      isStreaming: this.streaming.isStreaming()
    });
    
    if (!this.streamingActive) {
      console.warn('⚠️ stream_chunk recibido pero streamingActive=false, ignorando:', {
        chunk_preview: event['chunk']?.substring(0, 50),
        streamingActive: this.streamingActive,
        currentQuestion: this.currentQuestion
      });
      return;
    }
    
    const chunk = event['chunk'];
    if (chunk && chunk.trim()) {
      this.streaming.addChunk(chunk);
    }
  }

  private handleStreamEnd(event: WebsocketEvent): void {
    console.log('📨 [WEBSOCKET MODULE] Stream END recibido:', {
      streamingActive: this.streamingActive,
      isStreaming: this.streaming.isStreaming(),
      fullResponse_length: event['full_response']?.length || 0,
      currentQuestion: this.currentQuestion?.substring(0, 50)
    });
    
    // Verificar si hay un stream activo en streaming.module
    const hasActiveStream = this.streaming.isStreaming();
    
    if (!this.streamingActive && !hasActiveStream) {
      console.warn('⚠️ [WEBSOCKET MODULE] Stream END recibido pero no hay stream activo');
      return;
    }
    
    const fullResponse = event['full_response'] || '';
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

  private handleErrorEvent(event: WebsocketEvent): void {
    console.error('💥 Evento de error WebSocket:', event);
    
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
    // console.log('🔄 Reseteando stream state:', {
    //   streamingActive_before: this.streamingActive,
    //   currentQuestion_before: this.currentQuestion,
    //   isStreaming: this.streaming.isStreaming()
    // });
    this.streamingActive = false;
    this.currentQuestion = '';
    this.currentQuestionType = 'user';
    this.state.setProcessing(false);
    this.state.setClientId(null);
    // console.log('✅ Stream state reseteado:', {
    //   streamingActive_after: this.streamingActive,
    //   currentQuestion_after: this.currentQuestion
    // });
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