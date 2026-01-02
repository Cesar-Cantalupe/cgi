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
  private streamingActive = false;
  
  public connectionStatus$ = this.connectionStatus.asObservable();

  constructor(
    private websocket: WebsocketService,
    private streaming: StreamingModule,
    private state: ChatbotStateService
  ) {
    console.log('🔧 WebsocketModule creado');
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

  sendQuery(query: string, filters: any = {}): void {
    if (!this.isConnected()) {
      console.error('❌ ERROR: WebSocket no conectado');
      throw new Error('WebSocket not connected');
    }
    
    this.currentQuestion = query;
    this.streamingActive = true;
    
    const message = {
      query: query,
      filters: filters,
      stream: true,
      timestamp: Date.now()
    };
    
    this.websocket.sendMessage(message);
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
        break;
        
      case 'error':
        console.error('💥 Error WebSocket:', event);
        this.handleErrorEvent(event);
        break;
        
      case 'pong':
        break;
    }
  }

  private handleStreamStart(event: WebsocketEvent): void {
    if (event['client_id']) {
      this.state.setClientId(event['client_id']);
    }
    
    if (!this.streaming.isStreaming()) {
      this.streaming.startStream(this.currentQuestion);
    }
  }

  private handleStreamChunk(event: WebsocketEvent): void {
    if (!this.streamingActive) {
      return;
    }
    
    const chunk = event['chunk'];
    if (chunk && chunk.trim()) {
      this.streaming.addChunk(chunk);
    }
  }

  private handleStreamEnd(event: WebsocketEvent): void {
    if (!this.streamingActive) {
      return;
    }
    
    const fullResponse = event['full_response'] || '';
    const sources = event['sources'] || [];
    
    this.streaming.completeStream(fullResponse, sources)
      .then(() => {
        this.resetStreamState();
      })
      .catch(error => {
        console.error('💥 Error completando stream:', error);
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
    this.streamingActive = false;
    this.currentQuestion = '';
    this.state.setProcessing(false);
    this.state.setClientId(null);
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
      return;
    }
      
    const message = {
      type: 'feedback',
      ...feedbackData,
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