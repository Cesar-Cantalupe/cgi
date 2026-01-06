import { Injectable, EventEmitter } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { Conversation, StoredConversation } from '../interfaces/conversation.interface';
import { ChatMessage } from '../interfaces/chat-message.interface';

@Injectable({ providedIn: 'root' })
export class ConversationService {
  private readonly STORAGE_KEY = 'chat_conversations_v2';
  private conversations = new BehaviorSubject<Conversation[]>([]);
  private activeConversation = new BehaviorSubject<Conversation | null>(null);
  
  public conversations$ = this.conversations.asObservable();
  public activeConversation$ = this.activeConversation.asObservable();
  public conversationBlurred = new EventEmitter<Conversation>();

  constructor() {
    this.loadFromStorage();
    this.ensureActiveConversation();
  }

  // ============ API PÚBLICA ============

  getConversations(): Conversation[] {
    return this.sortConversations([...this.conversations.value]);
  }

  getActiveConversation(): Conversation | null {
    return this.activeConversation.value;
  }

  createConversation(firstMessage?: string): Conversation {
    // console.log('🆕 ConversationService: Creando nueva conversación');
    const previousActive = this.getActiveConversation();
    if (previousActive) {
      this.conversationBlurred.emit(previousActive);
    }
    
    // Crear nueva conversación
    const conversation = this.buildConversation(firstMessage);
    
    // Desactivar todas las conversaciones existentes
    this.deactivateAll();
    
    // Agregar nueva conversación
    const currentConversations = this.conversations.value;
    const updatedConversations = [...currentConversations, conversation];
    this.conversations.next(updatedConversations);
    
    // Establecer como activa
    this.activeConversation.next(conversation);
    
    // Guardar en storage
    this.saveToStorage();
    
    // console.log('✅ Nueva conversación creada con ID:', conversation.id);
    return conversation;
  }

  selectConversation(id: string): boolean {
    const conversation = this.conversations.value.find(c => c.id === id);
    if (!conversation) {
      console.warn('❌ Conversación no encontrada:', id);
      return false;
    }

    // Si había otra conversación seleccionada antes que esta, emite su evento de blurred
    const prevActive = this.getActiveConversation();
    if (prevActive && prevActive.id !== conversation.id) {
      this.conversationBlurred.emit(prevActive);
    }

    // Desactivar todas
    this.deactivateAll();
    
    // Activar la seleccionada
    conversation.isActive = true;
    this.activeConversation.next(conversation);
    
    // Guardar cambios
    this.saveToStorage();
    
    // console.log('✅ Conversación seleccionada:', id);
    return true;
  }

  addMessage(content: string, sender: 'user' | 'bot' | 'system' = 'user'): void {
    const active = this.getActiveConversation();
    
    if (!active) {
      // console.log('📝 No hay conversación activa, creando nueva...');
      this.createConversation(sender === 'user' ? content : undefined);
      
      if (sender === 'bot') {
        const newActive = this.getActiveConversation();
        if (newActive) {
          this.addMessageToConversation(content, 'bot');
        }
      }
      return;
    }

    this.addMessageToConversation(content, sender);
  }

  updateConversationMessages(id: string, messages: any[]): boolean {
    const conversation = this.conversations.value.find(c => c.id === id);
    if (!conversation) return false;

    conversation.messages = messages.map(msg => this.normalizeMessage(msg, id));
    conversation.messageCount = messages.length;
    //conversation.updatedAt = new Date(); //Muestra la conversación arriba de todo en el sidebar
    conversation.preview = this.getConversationPreview(messages);
    
    this.saveToStorage();
    return true;
  }

  updateMessageFeedback(messageId: string, feedback: 'like' | 'dislike' | null): boolean {
    let updated = false;
    
    this.conversations.value.forEach(conversation => {
      const message = conversation.messages.find(msg => msg.id === messageId);
      if (message) {
        message.feedback = feedback;
        conversation.updatedAt = new Date();
        updated = true;
      }
    });

    if (updated) {
      this.saveToStorage();
    }
    
    return updated;
  }

  renameConversation(id: string, title: string): boolean {
    const conversation = this.conversations.value.find(c => c.id === id);
    if (!conversation) return false;

    conversation.title = title.trim();
    conversation.updatedAt = new Date();
    this.saveToStorage();
    return true;
  }

  deleteConversation(id: string): boolean {
    const toDelete = this.conversations.value.find(c => c.id === id);
    const conversations = this.conversations.value.filter(c => c.id !== id);
    if (conversations.length === this.conversations.value.length) return false;

    if (toDelete && toDelete.isActive) {
      this.conversationBlurred.emit(toDelete);
    }

    this.conversations.next(conversations);
    
    // Si la conversación eliminada era la activa, seleccionar otra
    if (this.getActiveConversation()?.id === id) {
      this.autoSelectConversation();
    }
    
    this.saveToStorage();
    return true;
  }

  clearAll(): void {
    this.conversations.next([]);
    this.activeConversation.next(null);
    localStorage.removeItem(this.STORAGE_KEY);
    // console.log('🧹 Todas las conversaciones eliminadas');
  }

  getStats() {
    const conversations = this.conversations.value;
    return {
      total: conversations.length,
      totalMessages: conversations.reduce((sum, c) => sum + c.messageCount, 0),
      activeId: this.getActiveConversation()?.id || null
    };
  }

  // ============ MÉTODOS PRIVADOS ============

  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (!stored) {
        // console.log('📂 No hay conversaciones almacenadas');
        return;
      }

      const data: { conversations: StoredConversation[] } = JSON.parse(stored);
      // console.log('📥 Cargando', data.conversations.length, 'conversaciones del storage');
      
      const conversations = data.conversations.map(this.normalizeStoredConversation.bind(this));
      
      this.conversations.next(conversations);
      
    } catch (error) {
      console.error('❌ Error loading conversations:', error);
      // Limpiar storage corrupto
      localStorage.removeItem(this.STORAGE_KEY);
    }
  }

  private saveToStorage(): void {
    try {
      const storedConversations: StoredConversation[] = this.conversations.value.map(conv => {
        const storedConv: StoredConversation = {
          id: conv.id,
          title: conv.title,
          messages: conv.messages.map(msg => ({
            id: msg.id,
            conversationId: conv.id,
            content: msg.content,
            sender: msg.sender,
            timestamp: msg.timestamp.toISOString(),
            sources: msg.sources || [],
            feedback: msg.feedback || null,
            isStreaming: msg.isStreaming || false
          })),
          createdAt: conv.createdAt.toISOString(),
          updatedAt: conv.updatedAt.toISOString(),
          preview: conv.preview || '',
          messageCount: conv.messageCount || conv.messages.length
        };
        
        return storedConv;
      });

      const saveData = { 
        conversations: storedConversations,
        savedAt: new Date().toISOString(),
        version: '2.0'
      };
      
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(saveData));
      // console.log('💾 Guardadas', storedConversations.length, 'conversaciones');
      
    } catch (error) {
      console.error('❌ Error saving conversations:', error);
    }
  }

  private buildConversation(firstMessage?: string): Conversation {
    const now = new Date();
    const id = `conv-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    
    const messages: ChatMessage[] = firstMessage ? [{
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
      content: firstMessage,
      text: firstMessage,
      sender: 'user' as const,
      isUser: true,
      timestamp: now,
      isStreaming: false
    }] : [];
    
    return {
      id,
      title: firstMessage ? this.generateTitle(firstMessage) : 'New Chat',
      messages,
      createdAt: now,
      updatedAt: now,
      preview: firstMessage ? this.truncateText(firstMessage, 100) : '',
      messageCount: messages.length,
      isActive: true
    };
  }

  private addMessageToConversation(content: string, sender: 'user' | 'bot' | 'system'): void {
    const conversation = this.getActiveConversation();
    if (!conversation) {
      console.warn('⚠️ No hay conversación activa para agregar mensaje');
      return;
    }

    const message: ChatMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
      content,
      text: content,
      sender,
      isUser: sender === 'user',
      timestamp: new Date(),
      isStreaming: false
    };

    conversation.messages.push(message);
    conversation.messageCount = conversation.messages.length;
    conversation.updatedAt = new Date();
    conversation.preview = this.truncateText(content, 100);
    
    // Generar título automático si es el primer mensaje de usuario
    if (conversation.messages.length === 1 && sender === 'user') {
      conversation.title = this.generateTitle(content);
    }

    this.saveToStorage();
  }

  private ensureActiveConversation(): void {
    if (!this.getActiveConversation() && this.conversations.value.length > 0) {
      this.autoSelectConversation();
    }
  }

  private autoSelectConversation(): void {
    const conversations = this.sortConversations([...this.conversations.value]);
    if (conversations.length > 0) {
      this.selectConversation(conversations[0].id);
    }
  }

  private deactivateAll(): void {
    this.conversations.value.forEach(c => c.isActive = false);
  }

  private sortConversations(conversations: Conversation[]): Conversation[] {
    return conversations.sort((a, b) => 
      b.updatedAt.getTime() - a.updatedAt.getTime()
    );
  }

  private normalizeStoredConversation(stored: StoredConversation): Conversation {
    const messages: ChatMessage[] = stored.messages.map(msg => ({
      id: msg.id,
      content: msg.content,
      text: msg.content,
      sender: msg.sender as 'user' | 'bot' | 'system',
      isUser: msg.sender === 'user',
      timestamp: new Date(msg.timestamp),
      sources: msg.sources || [],
      feedback: msg.feedback || null,
      isStreaming: msg.isStreaming || false
    }));
    
    return {
      id: stored.id,
      title: stored.title,
      messages,
      createdAt: new Date(stored.createdAt),
      updatedAt: new Date(stored.updatedAt),
      preview: stored.preview || '',
      messageCount: stored.messageCount || stored.messages.length,
      isActive: false
    };
  }

  private normalizeMessage(msg: any, conversationId: string): ChatMessage {
    const sender = msg.sender || (msg.isUser ? 'user' : 'bot');
    
    return {
      id: msg.id || `msg-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
      content: msg.content || msg.text || '',
      text: msg.text || msg.content || '',
      sender: sender as 'user' | 'bot' | 'system',
      isUser: sender === 'user',
      timestamp: msg.timestamp instanceof Date ? msg.timestamp : new Date(msg.timestamp),
      sources: msg.sources,
      feedback: msg.feedback,
      isStreaming: msg.isStreaming || false
    };
  }

  private getConversationPreview(messages: any[]): string {
    const lastMessage = messages[messages.length - 1];
    return lastMessage?.content ? this.truncateText(lastMessage.content, 100) : '';
  }

  private generateTitle(firstMessage: string): string {
    if (!firstMessage.trim()) return 'New Chat';
    
    const words = firstMessage.trim().split(/\s+/);
    if (words.length <= 5) {
      return firstMessage;
    }
    
    return words.slice(0, 5).join(' ') + '...';
  }

  private truncateText(text: string, maxLength: number): string {
    if (!text || text.length <= maxLength) {
      return text || '';
    }
    
    return text.substring(0, maxLength).trim() + '...';
  }
}