// feedback.module.ts (sin analytics - versión simplificada)
import { Injectable } from '@angular/core';
import { WebsocketModule } from './websocket.module';
import { ChatbotStateService } from '../core/chatbot-state.service';
import { ChatMessage } from '../interfaces/chat-message.interface';

export interface FeedbackData {
  messageId: string;
  clientId: string;
  rating: 'up' | 'down' | null;
  comment: string;
  query: string;
  response: string;
  timestamp: string;
}

@Injectable({
  providedIn: 'root'
})
export class FeedbackModule {
  private pendingFeedback: FeedbackData[] = [];

  constructor(
    private websocket: WebsocketModule,
    private state: ChatbotStateService
  ) {
    this.loadPendingFeedback();
  }

  // ============ API PÚBLICA SIMPLE ============

  /**
   * Envía feedback (rating o comentario o ambos)
   */
  sendFeedback(
    message: ChatMessage,
    rating: 'up' | 'down' | null = null,
    comment: string = ''
  ): void {
    if (!message?.id) {
      console.warn('Cannot send feedback: invalid message');
      return;
    }

    // Verificar que haya algo para enviar
    const hasFeedback = rating !== null || comment.trim().length > 0;
    if (!hasFeedback) {
      console.warn('Cannot send feedback: no rating or comment provided');
      return;
    }

    const clientId = this.state.currentClientId;
    const originalQuery = this.findOriginalQuery(message);

    // Intentar enviar inmediatamente si hay conexión
    if (clientId && this.websocket.isConnected()) {
      this.sendFeedbackImmediately(
        message.id,
        clientId,
        rating,
        comment,
        originalQuery,
        message.content || ''
      );
    } else {
      // Almacenar localmente para enviar después
      this.storeFeedbackLocally(message, rating, comment, originalQuery);
    }
  }

  /**
   * Envía solo un comentario de texto
   */
  sendTextFeedback(message: ChatMessage, comment: string): void {
    if (!comment.trim()) return;
    this.sendFeedback(message, null, comment);
  }

  /**
   * Envía solo un rating
   */
  sendRatingFeedback(message: ChatMessage, rating: 'up' | 'down'): void {
    this.sendFeedback(message, rating, '');
  }

  // ============ MANEJO DE CONEXIÓN ============

  /**
   * Envía todo el feedback pendiente cuando hay conexión
   */
  sendPendingFeedback(): void {
    if (!this.websocket.isConnected() || this.pendingFeedback.length === 0) {
      return;
    }

    const failedFeedback: FeedbackData[] = [];

    this.pendingFeedback.forEach(feedback => {
      try {
        this.sendFeedbackImmediately(
          feedback.messageId,
          feedback.clientId,
          feedback.rating,
          feedback.comment,
          feedback.query,
          feedback.response
        );
      } catch (error) {
        console.warn('Failed to send pending feedback:', error);
        failedFeedback.push(feedback);
      }
    });

    // Solo guardar los que fallaron
    this.pendingFeedback = failedFeedback;
    this.savePendingFeedback();
  }

  // ============ MÉTODOS PRIVADOS ============

  private sendFeedbackImmediately(
    messageId: string,
    clientId: string,
    rating: 'up' | 'down' | null,
    comment: string,
    query: string,
    response: string
  ): void {
    // Crear objeto feedback para enviar
    const feedbackData = {
      messageId,
      clientId,
      rating,
      comment,
      query,
      response,
      timestamp: new Date().toISOString()
    };
    
    this.websocket.sendFeedback(feedbackData);
  }

  private findOriginalQuery(message: ChatMessage): string {
    const messages = this.state.messages;
    const messageIndex = messages.findIndex(m => m.id === message.id);
    
    if (messageIndex === -1) return '';
    
    // Buscar el último mensaje de usuario antes de este
    for (let i = messageIndex - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.sender === 'user' || msg.isUser) {
        return msg.content || '';
      }
    }
    
    return '';
  }

  private storeFeedbackLocally(
    message: ChatMessage,
    rating: 'up' | 'down' | null,
    comment: string,
    originalQuery: string
  ): void {
    const feedbackData: FeedbackData = {
      messageId: message.id!,
      clientId: this.state.currentClientId || 'unknown',
      rating,
      comment,
      query: originalQuery,
      response: message.content || '',
      timestamp: new Date().toISOString()
    };

    this.pendingFeedback.push(feedbackData);
    this.savePendingFeedback();
  }

  // ============ PERSISTENCIA LOCAL ============

  private loadPendingFeedback(): void {
    try {
      const pending = localStorage.getItem('pending_feedback');
      this.pendingFeedback = pending ? JSON.parse(pending) : [];
    } catch (error) {
      console.error('Error loading pending feedback:', error);
      this.pendingFeedback = [];
    }
  }

  private savePendingFeedback(): void {
    try {
      localStorage.setItem('pending_feedback', JSON.stringify(this.pendingFeedback));
    } catch (error) {
      console.error('Error saving pending feedback:', error);
    }
  }

  // ============ MÉTODOS DE UTILIDAD ============

  /**
   * Obtiene feedback pendiente (solo para debug)
   */
  getPendingFeedback(): FeedbackData[] {
    return [...this.pendingFeedback];
  }

  /**
   * Limpia feedback pendiente antiguo
   */
  cleanupOldFeedback(daysToKeep: number = 7): void {
    const cutoffTime = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000);
    
    this.pendingFeedback = this.pendingFeedback.filter(feedback => {
      const feedbackTime = new Date(feedback.timestamp).getTime();
      return feedbackTime > cutoffTime;
    });
    
    this.savePendingFeedback();
  }
}