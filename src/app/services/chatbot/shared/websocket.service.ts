import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { WebSocketEvent, QueryRequest, PingMessage } from '../interfaces/websocket-events.interface';
import { TranslationService } from '../../translation.service';

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
  private readonly PONG_TIMEOUT = 10000;
  private pingPongTimeoutId: any = null;
  private clientId: string = '';
  
  private pingCount = 0;
  private pongCount = 0;

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
  }

  private sendPing(): void {
    if (!this.isWebSocketConnected()) {
      console.warn('ERRORS.PING_NOT_CONNECTED');
      return;
    }
    
    this.pingCount++;
    this.lastPingTime = Date.now();
    
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
      console.warn('ERRORS.INVALID_PONG_FORMAT', pongData);
      return;
    }
    
    this.pongCount++;
    this.lastPongTime = Date.now();
    
    if (this.pingPongTimeoutId) {
      clearTimeout(this.pingPongTimeoutId);
      this.pingPongTimeoutId = null;
    }
    
    const pingTime = this.lastPingTime;
    const pongTime = this.lastPongTime;
    const latency = pongTime - pingTime;
    
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
    
    this.pingPongTimeoutId = setTimeout(() => {
      console.warn('ERRORS.PONG_TIMEOUT', this.PONG_TIMEOUT);
      
      if (this.isWebSocketConnected()) {
        console.warn('ERRORS.RECONNECT_DUE_TO_PONG_TIMEOUT');
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
    return this.isConnected && this.socket?.readyState === WebSocket.OPEN;
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
}