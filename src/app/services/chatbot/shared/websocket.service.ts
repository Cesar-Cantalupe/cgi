import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { WebSocketEvent, QueryRequest, PingMessage } from '../interfaces/websocket-events.interface';
import { TranslationService } from '../../translation.service';
import { WEBSOCKET_CONFIG } from '../../../config/websocket.config';

@Injectable({
  providedIn: 'root'
})
export class WebsocketService implements OnDestroy {
  private socket: WebSocket | null = null;
  private messageSubject = new Subject<WebSocketEvent>();
  private connectionStatusSubject = new BehaviorSubject<string>('Disconnected');
  private isConnected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 2000;
  private destroy$ = new Subject<void>();
  private currentUrl: string = '';
  private isReconnecting = false;
  private reconnectTimeoutId: any = null;
  
  private pingIntervalId: any = null;
  private readonly PING_INTERVAL = 45000;
  private lastPingTime: number = 0;
  private lastPongTime: number = 0;
  private readonly PONG_TIMEOUT = 30000; // Aumentado de 10s a 30s para dar más margen al servidor
  private pingPongTimeoutId: any = null;
  private clientId: string = '';
  
  private pingCount = 0;
  private pongCount = 0;
  private isPingAwaitingPong = false; // Rastrear si hay un PING sin responder
  
  private usingMock = WEBSOCKET_CONFIG.USE_MOCK_MODE;

  public messages$ = this.messageSubject.asObservable();
  public connectionStatus$ = this.connectionStatusSubject.asObservable();

  constructor(private translationService: TranslationService) {
    this.generateClientId();
  }

  private generateClientId(): void {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 9);
    this.clientId = `client-${timestamp}-${random}`;
  }

  connect(url: string): Observable<boolean> {
    this.currentUrl = url;
    
    // Si está configurado para usar mock, no conectar al backend real
    if (this.usingMock) {
      console.log('🎭 MODO MOCK ACTIVADO (websocket.config.ts)');
      return new Observable(observer => {
        this.isConnected = true;
        this.connectionStatusSubject.next('Connected (Mock)');
        observer.next(true);
        observer.complete();
      });
    }
    
    // Conexión real
    return new Observable(observer => {
      try {
        this.cleanup();
        this.socket = new WebSocket(url);
        this.setupEventListeners(observer);
      } catch (error) {
        console.error('ERRORS.WEBSOCKET_CREATE_ERROR', error);
        this.scheduleReconnection(observer);
      }
    });
  }
  

  private setupEventListeners(observer: any): void {
    if (!this.socket) return;

    this.socket.onopen = null;
    this.socket.onmessage = null;
    this.socket.onclose = null;
    this.socket.onerror = null;

    this.socket.onopen = (event) => {
      this.isConnected = true;
      this.isReconnecting = false;
      this.reconnectAttempts = 0;
      this.connectionStatusSubject.next('Connected');
      
      this.startPingPongSystem();
      
      observer.next(true);
      observer.complete();
    };

    this.socket.onmessage = (event) => {
      try {
        const data: WebSocketEvent = JSON.parse(event.data);
        
        if (data.type === 'pong') {
          this.handlePongMessage(data);
        } else {
          this.messageSubject.next(data);
        }
      } catch (error) {
        console.error('ERRORS.WEBSOCKET_PARSE_ERROR', error);
      }
    };

    this.socket.onclose = (event) => {
      this.isConnected = false;
      
      this.stopPingPongSystem();
      
      this.connectionStatusSubject.next('Disconnected');
      
      if (!event.wasClean && event.code !== 1000 && !this.isReconnecting) {
        this.scheduleReconnection();
      } else if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        this.connectionStatusSubject.next('Failed');
      }
    };

    this.socket.onerror = (error) => {
      console.error('ERRORS.WEBSOCKET_GENERAL_ERROR', error);
      this.connectionStatusSubject.next('Error');
    };
  }

  private startPingPongSystem(): void {
    this.stopPingPongSystem();
    
    this.lastPongTime = Date.now();
    
    setTimeout(() => this.sendPing(), 1000);
    
    this.pingIntervalId = setInterval(() => {
      this.sendPing();
    }, this.PING_INTERVAL);
    
    setInterval(() => {
      this.checkPongHealth();
    }, 30000);
  }

  private stopPingPongSystem(): void {
    if (this.pingIntervalId) {
      clearInterval(this.pingIntervalId);
      this.pingIntervalId = null;
    }
    
    if (this.pingPongTimeoutId) {
      clearTimeout(this.pingPongTimeoutId);
      this.pingPongTimeoutId = null;
    }
    
    this.pingCount = 0;
    this.pongCount = 0;
    this.isPingAwaitingPong = false;
  }

  private sendPing(): void {
    if (!this.isWebSocketConnected()) {
      console.warn('⚠️ ERRORS.PING_NOT_CONNECTED');
      return;
    }
    
    // Si hay un PING sin respuesta, no enviar otro
    if (this.isPingAwaitingPong) {
      console.warn('⚠️ Hay un PING sin respuesta, esperando PONG...');
      return;
    }
    
    this.pingCount++;
    this.lastPingTime = Date.now();
    this.isPingAwaitingPong = true; // Marcar que esperamos PONG
    
    const pingMessage: PingMessage = {
      type: 'ping',
      client_id: this.clientId,
      timestamp: new Date().toISOString()
    };
    
    try {
      const messageString = JSON.stringify(pingMessage);
      this.socket?.send(messageString);
      
      this.setupPongTimeout();
      
    } catch (error) {
      console.error('ERRORS.PING_SEND_ERROR', error);
    }
  }

  private handlePongMessage(pongData: any): void {
    if (!pongData || pongData.type !== 'pong') {
      console.warn('⚠️ ERRORS.INVALID_PONG_FORMAT', pongData);
      return;
    }
    
    this.pongCount++;
    this.lastPongTime = Date.now();
    this.isPingAwaitingPong = false; // Marcamos que recibimos PONG
    
    if (this.pingPongTimeoutId) {
      clearTimeout(this.pingPongTimeoutId);
      this.pingPongTimeoutId = null;
    }
    
    const pingTime = this.lastPingTime;
    const pongTime = this.lastPongTime;
    const latency = pongTime - pingTime;
    
    // console.log('✅ PONG recibido con latencia:', latency, 'ms');
    
    this.messageSubject.next({
      type: 'pong',
      client_id: pongData.client_id,
      timestamp: pongData.timestamp,
      server_time: pongData.server_time,
      metadata: { latency, pingCount: this.pingCount, pongCount: this.pongCount }
    });
  }

  private setupPongTimeout(): void {
    if (this.pingPongTimeoutId) {
      clearTimeout(this.pingPongTimeoutId);
    }
    
    // Solo setup timeout si hay un PING esperando PONG
    if (!this.isPingAwaitingPong) {
      return;
    }
    
    // console.log('⏳ Setup PONG timeout - esperando respuesta del servidor...');
    
    this.pingPongTimeoutId = setTimeout(() => {
      console.warn('⚠️ ERRORS.PONG_TIMEOUT', this.PONG_TIMEOUT, 'ms');
      
      if (this.isWebSocketConnected()) {
        console.warn('⚠️ ERRORS.RECONNECT_DUE_TO_PONG_TIMEOUT');
        this.isPingAwaitingPong = false;
        this.reconnect();
      }
    }, this.PONG_TIMEOUT);
  }

  private checkPongHealth(): void {
    if (!this.isWebSocketConnected() || this.lastPongTime === 0) {
      return;
    }
    
    const timeSinceLastPong = Date.now() - this.lastPongTime;
    const maxAllowedTime = this.PING_INTERVAL + this.PONG_TIMEOUT + 5000;
    
    if (timeSinceLastPong > maxAllowedTime) {
      console.warn('ERRORS.PING_PONG_HEALTH_DEGRADED', {
        timeSinceLastPong: `${timeSinceLastPong}ms`,
        maxAllowed: `${maxAllowedTime}ms`,
        pingCount: this.pingCount,
        pongCount: this.pongCount,
        difference: this.pingCount - this.pongCount
      });
      
      if (this.pingCount - this.pongCount > 2) {
        console.warn('ERRORS.RECONNECT_DUE_TO_PONG_LOSS');
        this.reconnect();
      }
    }
  }

  private scheduleReconnection(observer?: any): void {
    if (this.isReconnecting) {
      return;
    }

    this.reconnectAttempts++;
    
    if (this.reconnectAttempts > this.maxReconnectAttempts) {
      this.isReconnecting = false;
      if (observer) {
        observer.error('ERRORS.MAX_RECONNECTION_ATTEMPTS');
      }
      return;
    }

    this.isReconnecting = true;
    const delayTime = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
    }

    this.reconnectTimeoutId = setTimeout(() => {
      this.isReconnecting = false;
      if (this.currentUrl) {
        this.connect(this.currentUrl).subscribe({
          error: (error) => {
            console.error('ERRORS.RECONNECTION_FAILED', error);
          }
        });
      }
    }, delayTime);
  }

  private cleanup(): void {
    this.stopPingPongSystem();
    
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }

    this.isReconnecting = false;

    if (this.socket) {
      this.socket.onopen = null;
      this.socket.onmessage = null;
      this.socket.onclose = null;
      this.socket.onerror = null;
      
      if (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING) {
        this.socket.close(1000, 'Cleanup');
      }
      this.socket = null;
    }
    
    this.isConnected = false;
  }

  sendMessage(message: QueryRequest): void {
    // Si estamos en modo mock, simular respuesta
    if (this.usingMock) {
      this.simulateMockResponse(message);
      return;
    }
    
    // Modo real
    if (!this.isWebSocketConnected()) {
      const errorMsg = this.translationService.instant('ERRORS.WEBSOCKET_NOT_CONNECTED');
      console.error(errorMsg);
      throw new Error(errorMsg);
    }

    try {
      const messageString = JSON.stringify(message);
      this.socket?.send(messageString);
    } catch (error) {
      console.error('ERRORS.WEBSOCKET_SEND_ERROR', error);
      throw new Error(this.translationService.instant('ERRORS.WEBSOCKET_SEND_ERROR'));
    }
  }

  sendFeedback(
    clientId: string, 
    rating: 'up' | 'down' | null = null, 
    comment: string = '', 
    query?: string, 
    response?: string
  ): void {
    if (!this.isWebSocketConnected()) {
      const errorMsg = this.translationService.instant('ERRORS.WEBSOCKET_NOT_CONNECTED');
      console.error(errorMsg);
      throw new Error(errorMsg);
    }

    try {
      const feedbackMessage: any = {
        client_id: clientId,
        type: 'feedback',
        comment: comment || '',
        query: query || '',
        response: response || ''
      };

      if (rating !== null && rating !== undefined) {
        feedbackMessage.rating = rating;
      }

      const messageString = JSON.stringify(feedbackMessage);
      this.socket?.send(messageString);
    } catch (error) {
      console.error('ERRORS.WEBSOCKET_FEEDBACK_ERROR', error);
      throw new Error(this.translationService.instant('ERRORS.WEBSOCKET_FEEDBACK_ERROR'));
    }
  }

  sendRawMessage(message: any): void {
    if (!this.isWebSocketConnected()) {
      const errorMsg = this.translationService.instant('ERRORS.WEBSOCKET_NOT_CONNECTED');
      console.error(errorMsg);
      throw new Error(errorMsg);
    }

    try {
      const messageString = JSON.stringify(message);
      this.socket?.send(messageString);
    } catch (error) {
      console.error('ERRORS.WEBSOCKET_SEND_ERROR', error);
      throw error;
    }
  }

  disconnect(): void {
    this.reconnectAttempts = this.maxReconnectAttempts + 1;
    this.cleanup();
    this.connectionStatusSubject.next('Disconnected');
  }

  isWebSocketConnected(): boolean {
    return this.usingMock || (this.isConnected && this.socket?.readyState === WebSocket.OPEN);
  }

  getPingPongStats(): any {
    return {
      clientId: this.clientId,
      isConnected: this.isWebSocketConnected(),
      pingCount: this.pingCount,
      pongCount: this.pongCount,
      lastPingTime: this.lastPingTime ? new Date(this.lastPingTime).toISOString() : null,
      lastPongTime: this.lastPongTime ? new Date(this.lastPongTime).toISOString() : null,
      timeSinceLastPong: this.lastPongTime ? Date.now() - this.lastPongTime : null,
      pingInterval: this.PING_INTERVAL,
      pongTimeout: this.PONG_TIMEOUT
    };
  }

  reconnect(): void {
    this.reconnectAttempts = 0;
    this.scheduleReconnection();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    
    this.stopPingPongSystem();
    
    this.disconnect();
    
    this.messageSubject.complete();
    this.connectionStatusSubject.complete();
  }

  // ============ MÉTODOS MOCK PARA DEBUGGING ============

  private simulateMockResponse(message: QueryRequest): void {
    console.log('📤 [MOCK] Mensaje recibido:', message);

    const { chunkSize, delayBeforeStart, delayBetweenChunks } = WEBSOCKET_CONFIG.MOCK;

    setTimeout(() => {
      this.messageSubject.next({
        type: 'stream_start',
        client_id: `mock-${Date.now()}`,
      });
      console.log('📨 [MOCK] stream_start enviado');

      this.simulateStreamChunks(
        message.query || 'respuesta por defecto',
        chunkSize,
        delayBetweenChunks
      );
    }, delayBeforeStart);
  }

  private simulateStreamChunks(query: string, chunkSize: number, delayBetweenChunks: number): void {
    const mockResponses: { [key: string]: string } = {
      default: `Esta es una respuesta simulada del servidor mock. Los chunks llegan progresivamente cada ${delayBetweenChunks}ms para que puedas debugear el streaming correctamente. Esto simula un LLM real que está generando texto en tiempo real. Puedes ajustar la velocidad en websocket.config.ts cambiando delayBetweenChunks.`,
      hola: `¡Hola! Esta es una prueba de streaming progresivo. Cada fragmento de texto llega de forma gradual para simular una respuesta real del backend.`,
      ayuda: `Te estoy ayudando con esta prueba de streaming. El mock backend está enviando chunks cada ${delayBetweenChunks}ms. Puedes cambiar esto en websocket.config.ts.`,
      test: `Test de streaming en progreso. Verás cómo el texto se va mostrando poco a poco con la animación typewriter si está habilitada.`,
    };

    const responseText = mockResponses[query.toLowerCase()] || mockResponses['default'];
    const chunks = [];

    for (let i = 0; i < responseText.length; i += chunkSize) {
      chunks.push(responseText.substring(i, i + chunkSize));
    }

    console.log(`📊 [MOCK] Enviando ${chunks.length} chunks de ${chunkSize} caracteres cada ${delayBetweenChunks}ms`);

    chunks.forEach((chunk, index) => {
      setTimeout(() => {
        this.messageSubject.next({
          type: 'stream_chunk',
          chunk: chunk,
        });
        console.log(`📦 [MOCK] Chunk ${index + 1}/${chunks.length}: "${chunk.substring(0, 30)}..."`);
      }, delayBetweenChunks * (index + 1));
    });

    // Calcular el delay para stream_end: después del último chunk + un delay extra
    const streamEndDelay = delayBetweenChunks * chunks.length + 300;
    console.log(`⏰ [MOCK] stream_end programado para ${streamEndDelay}ms`);

    setTimeout(() => {
      console.log('🏁 [MOCK] Enviando stream_end ahora...');
      this.messageSubject.next({
        type: 'stream_end',
        full_response: responseText,
        sources: [
          { title: 'Mock Document 1', url: 'https://mock.example.com/doc1' },
          { title: 'Mock Document 2', url: 'https://mock.example.com/doc2' },
        ],
      });
      console.log('✅ [MOCK] stream_end enviado con', responseText.length, 'caracteres');
    }, streamEndDelay);
  }
}