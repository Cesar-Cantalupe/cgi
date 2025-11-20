import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { WebSocketEvent, QueryRequest } from './interfaces/websocket-events.interface';

@Injectable({
  providedIn: 'root'
})
export class WebsocketService {
  private socket: WebSocket | null = null;
  private messageSubject = new Subject<WebSocketEvent>();
  private connectionStatusSubject = new BehaviorSubject<string>('Disconnected');
  private isConnected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 3;

  public messages$ = this.messageSubject.asObservable();
  public connectionStatus$ = this.connectionStatusSubject.asObservable();

  constructor() {}

  connect(url: string): Observable<boolean> {
    return new Observable(observer => {
      try {
        this.socket = new WebSocket(url);
        this.setupEventListeners(observer);
      } catch (error) {
        console.error('Error creando WebSocket:', error);
        observer.error(error);
      }
    });
  }

  private setupEventListeners(observer: any): void {
    if (!this.socket) return;

    this.socket.onopen = (event) => {
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.connectionStatusSubject.next('Connected');
      observer.next(true);
      observer.complete();
    };

    this.socket.onmessage = (event) => {
      try {
        const data: WebSocketEvent = JSON.parse(event.data);
        this.messageSubject.next(data);
      } catch (error) {
        console.error('Error parseando mensaje WebSocket:', error);
      }
    };

    this.socket.onclose = (event) => {
      this.isConnected = false;
      this.connectionStatusSubject.next('Disconnected');
      
      if (!event.wasClean && this.reconnectAttempts < this.maxReconnectAttempts) {
        this.attemptReconnection();
      }
    };

    this.socket.onerror = (error) => {
      this.connectionStatusSubject.next('Error');
      observer.error(error);
    };
  }

  private attemptReconnection(): void {
    this.reconnectAttempts++;
  }

  sendMessage(message: QueryRequest): void {
    if (this.socket?.readyState === WebSocket.OPEN && this.isConnected) {
      this.socket.send(JSON.stringify(message));
    } else {
      throw new Error('WebSocket no conectado');
    }
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.close(1000, 'Desconexión manual');
      this.socket = null;
      this.isConnected = false;
    }
  }

  isWebSocketConnected(): boolean {
    return this.isConnected;
  }
}