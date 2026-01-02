import { Injectable } from '@angular/core';
import { ChatHistoryItem } from '../interfaces/chat-history.interface';
import { Conversation } from '../interfaces/conversation.interface';
import { StorageData, ConversationsStorageData } from '../interfaces/storage.interface';
import { TranslationService } from '../../translation.service';
import { ChatMessage } from '../interfaces/chat-message.interface';

@Injectable({
  providedIn: 'root'
})
export class StorageService {
  private readonly STORAGE_KEY = 'chatHistory';
  private readonly STORAGE_BACKUP_KEY = 'chatHistory_backup';
  private readonly CONVERSATIONS_KEY = 'chatbot_conversations_v2';
  private readonly CONVERSATIONS_BACKUP_KEY = 'chatbot_conversations_backup_v2';
  private readonly MIGRATION_FLAG_KEY = 'chatbot_migrated_to_conversations_v1';
  private readonly EXPIRY_HOURS = 48;
  private readonly STORAGE_VERSION = '1.1';
  private readonly CONVERSATIONS_VERSION = '2.0';

  constructor(private translationService: TranslationService) {}

  // ============ MÉTODOS EXISTENTES (COMPATIBILIDAD) ============

  saveChatHistory(history: ChatHistoryItem[]): void {
    try {
      if (!Array.isArray(history)) {
        throw new Error('ERRORS.INVALID_HISTORY_FORMAT');
      }

      const serializedHistory = this.serializeHistory(history);
      
      const storageData: StorageData = {
        data: serializedHistory,
        expiry: Date.now() + (this.EXPIRY_HOURS * 60 * 60 * 1000),
        version: this.STORAGE_VERSION,
        savedAt: new Date().toISOString()
      };
      
      const jsonString = JSON.stringify(storageData);
      
      if (jsonString.length > 4 * 1024 * 1024) {
        console.warn('ERRORS.STORAGE_SIZE_LIMIT');
        const truncatedHistory = history.slice(0, 50);
        this.saveChatHistory(truncatedHistory);
        return;
      }
      
      localStorage.setItem(this.STORAGE_KEY, jsonString);
      
      this.createBackup(history);
      
    } catch (error) {
      console.error('ERRORS.STORAGE_SAVE_ERROR', error);
      
      try {
        this.saveEssentialHistory(history);
      } catch (backupError) {
        console.error('ERRORS.STORAGE_BACKUP_ERROR', backupError);
      }
    }
  }

  loadChatHistory(): ChatHistoryItem[] | null {
    try {
      const item = localStorage.getItem(this.STORAGE_KEY);
      if (!item) {
        return this.loadFromBackup();
      }

      const storageData: StorageData = JSON.parse(item);
      
      if (Date.now() > storageData.expiry) {
        this.clearChatHistory();
        return null;
      }
      
      if (storageData.version && storageData.version !== this.STORAGE_VERSION) {
        // Lógica de migración futura
      }
      
      const history = this.deserializeHistory(storageData.data);
      
      return history;
      
    } catch (error) {
      console.error('ERRORS.STORAGE_LOAD_ERROR', error);
      
      try {
        return this.loadFromBackup();
      } catch (backupError) {
        console.error('ERRORS.BACKUP_LOAD_ERROR', backupError);
        this.clearCorruptedStorage();
        return null;
      }
    }
  }

  clearChatHistory(): void {
    try {
      localStorage.removeItem(this.STORAGE_KEY);
      localStorage.removeItem(this.STORAGE_BACKUP_KEY);
    } catch (error) {
      console.error('ERRORS.STORAGE_CLEAR_ERROR', error);
    }
  }

  hasChatHistory(): boolean {
    try {
      const item = localStorage.getItem(this.STORAGE_KEY);
      if (!item) return false;
      
      const storageData: StorageData = JSON.parse(item);
      return Date.now() <= storageData.expiry;
    } catch (error) {
      return false;
    }
  }

  getStorageInfo(): { size: number; count: number; expires: Date } | null {
    try {
      const item = localStorage.getItem(this.STORAGE_KEY);
      if (!item) return null;
      
      const storageData: StorageData = JSON.parse(item);
      const history = storageData.data || [];
      
      return {
        size: item.length,
        count: history.length,
        expires: new Date(storageData.expiry)
      };
    } catch (error) {
      return null;
    }
  }

  // ============ MÉTODOS NUEVOS PARA CONVERSACIONES ============

saveConversations(conversations: Conversation[]): void {
  try {
    if (!Array.isArray(conversations)) {
      throw new Error('ERRORS.INVALID_CONVERSATIONS_FORMAT');
    }

    // Serializar conversaciones - convertir Dates a strings
    const serializedConversations = conversations.map(conv => ({
      ...conv,
      createdAt: conv.createdAt.toISOString(),
      updatedAt: conv.updatedAt.toISOString(),
      messages: conv.messages.map(msg => ({
        ...msg,
        timestamp: msg.timestamp.toISOString()
      }))
    }));

    // DOBLE CAST necesario porque TypeScript no ve la compatibilidad
    const storageData: ConversationsStorageData = {
      data: serializedConversations as unknown as ConversationsStorageData['data'],
      expiry: Date.now() + (this.EXPIRY_HOURS * 60 * 60 * 1000),
      version: this.CONVERSATIONS_VERSION,
      savedAt: new Date().toISOString()
    };
    
    const jsonString = JSON.stringify(storageData);
    
    // Verificar límite de tamaño
    if (jsonString.length > 5 * 1024 * 1024) {
      console.warn('ERRORS.CONVERSATIONS_STORAGE_SIZE_LIMIT');
      const optimizedConversations = conversations
        .slice(-20)
        .map(conv => ({
          ...conv,
          messages: conv.messages.slice(-50)
        }));
      this.saveConversations(optimizedConversations);
      return;
    }
    
    localStorage.setItem(this.CONVERSATIONS_KEY, jsonString);
    
    // Crear backup
    this.createConversationsBackup(conversations);
    
  } catch (error) {
    console.error('ERRORS.CONVERSATIONS_SAVE_ERROR', error);
    
    try {
      this.saveEssentialConversations(conversations);
    } catch (backupError) {
      console.error('ERRORS.CONVERSATIONS_BACKUP_ERROR', backupError);
    }
  }
}

  loadConversations(): Conversation[] | null {
  try {
    const item = localStorage.getItem(this.CONVERSATIONS_KEY);
    if (!item) {
      // Si no hay conversaciones, intentar migrar del historial antiguo
      return this.migrateFromOldHistory();
    }

    const storageData: ConversationsStorageData = JSON.parse(item);
    
    // Verificar expiración
    if (Date.now() > storageData.expiry) {
      console.warn('ERRORS.CONVERSATIONS_EXPIRED');
      this.clearConversations();
      return null;
    }
    
    // Deserializar conversaciones - convertir strings a Date
    const conversations = this.deserializeConversations(storageData.data);
    
    return conversations;
    
  } catch (error) {
    console.error('ERRORS.CONVERSATIONS_LOAD_ERROR', error);
    
    try {
      return this.loadConversationsFromBackup();
    } catch (backupError) {
      console.error('ERRORS.CONVERSATIONS_BACKUP_LOAD_ERROR', backupError);
      return null;
    }
  }
}

  clearConversations(): void {
    try {
      localStorage.removeItem(this.CONVERSATIONS_KEY);
      localStorage.removeItem(this.CONVERSATIONS_BACKUP_KEY);
      localStorage.removeItem(this.MIGRATION_FLAG_KEY);
    } catch (error) {
      console.error('ERRORS.CONVERSATIONS_CLEAR_ERROR', error);
    }
  }

  hasConversations(): boolean {
    try {
      const item = localStorage.getItem(this.CONVERSATIONS_KEY);
      if (!item) return false;
      
      const storageData: StorageData = JSON.parse(item);
      return Date.now() <= storageData.expiry;
    } catch (error) {
      return false;
    }
  }

  getConversationsInfo(): { 
  size: number; 
  count: number; 
  totalMessages: number; 
  expires: Date 
} | null {
  try {
    const item = localStorage.getItem(this.CONVERSATIONS_KEY);
    if (!item) return null;
    
    const storageData: ConversationsStorageData = JSON.parse(item);
    const conversations = storageData.data || [];
    const totalMessages = conversations.reduce((sum: number, conv: Conversation) => 
      sum + (conv.messages?.length || 0), 0
    );
    
    return {
      size: item.length,
      count: conversations.length,
      totalMessages: totalMessages,
      expires: new Date(storageData.expiry)
    };
  } catch (error) {
    return null;
  }
}

  // ============ MÉTODOS PRIVADOS NUEVOS ============

    private deserializeConversations(serializedConversations: any[]): Conversation[] {
    return serializedConversations.map(conv => {
      // Parsear fechas
      let createdAt: Date;
      let updatedAt: Date;
      
      try {
        createdAt = new Date(conv.createdAt);
        if (isNaN(createdAt.getTime())) createdAt = new Date();
      } catch {
        createdAt = new Date();
      }
      
      try {
        updatedAt = new Date(conv.updatedAt);
        if (isNaN(updatedAt.getTime())) updatedAt = new Date();
      } catch {
        updatedAt = new Date();
      }
      
      // Deserializar mensajes
      const messages = (conv.messages || []).map((msg: any) => {
        let timestamp: Date;
        try {
          timestamp = new Date(msg.timestamp);
          if (isNaN(timestamp.getTime())) timestamp = new Date();
        } catch {
          timestamp = new Date();
        }
        
        return {
          ...msg,
          timestamp: timestamp,
          sender: msg.sender || (msg.isUser ? 'user' : 'bot'),
          // Asegurar propiedades requeridas
          content: msg.content || msg.text || '',
          text: msg.text || msg.content || '',
          isUser: msg.isUser || msg.sender === 'user'
        } as ChatMessage;
      });
      
      return {
        ...conv,
        id: conv.id || `conv-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        title: conv.title || 'Conversación sin título',
        messages: messages,
        createdAt: createdAt,
        updatedAt: updatedAt,
        lastMessagePreview: conv.lastMessagePreview || conv.preview || ''
      } as Conversation;
    });
  }

  private migrateFromOldHistory(): Conversation[] | null {
    // Verificar si ya se migró
    const alreadyMigrated = localStorage.getItem(this.MIGRATION_FLAG_KEY);
    if (alreadyMigrated === 'true') {
      return [];
    }
    
    // Cargar historial antiguo
    const oldHistory = this.loadChatHistory();
    if (!oldHistory || oldHistory.length === 0) {
      localStorage.setItem(this.MIGRATION_FLAG_KEY, 'true');
      return [];
    }
    
    try {
      // Filtrar solo conversaciones de usuario (no preguntas predefinidas)
      const userConversations = oldHistory.filter(item => 
        !item.isPredefined && 
        item.answer && 
        item.answer.trim() !== '' &&
        item.question && 
        item.question.trim() !== ''
      );
      
      if (userConversations.length === 0) {
        localStorage.setItem(this.MIGRATION_FLAG_KEY, 'true');
        return [];
      }
      
      // Crear una conversación por cada item (para mantener compatibilidad inicial)
      // Podemos agrupar por timestamp o crear una conversación general
      const defaultConversation: Conversation = {
        id: 'migrated-conversation-' + Date.now(),
        title: 'Historial anterior',
        messages: userConversations.flatMap((item, index) => [
          {
            id: `migrated-${item.id}-user`,
            content: item.question,
            text: item.question,
            sender: 'user',
            isUser: true,
            timestamp: item.timestamp,
            sources: []
          },
          {
            id: `migrated-${item.id}-bot`,
            content: item.answer,
            text: item.answer,
            sender: 'bot',
            isUser: false,
            timestamp: new Date(item.timestamp.getTime() + 1000),
            sources: item.sources || []
          }
        ]),
        createdAt: userConversations[0].timestamp,
        updatedAt: userConversations[userConversations.length - 1].timestamp,
        lastMessagePreview: userConversations[userConversations.length - 1].question
      };
      
      const conversations = [defaultConversation];
      
      // Guardar conversaciones migradas
      this.saveConversations(conversations);
      
      // Marcar como migrado
      localStorage.setItem(this.MIGRATION_FLAG_KEY, 'true');
      
      console.log('ERRORS.HISTORY_MIGRATION_COMPLETE', {
        oldItems: oldHistory.length,
        userConversations: userConversations.length,
        newConversations: conversations.length
      });
      
      return conversations;
      
    } catch (error) {
      console.error('ERRORS.HISTORY_MIGRATION_ERROR', error);
      localStorage.setItem(this.MIGRATION_FLAG_KEY, 'true');
      return [];
    }
  }

  private saveEssentialConversations(conversations: Conversation[]): void {
    try {
      // Guardar solo información esencial para backup
      const essentialConversations = conversations
        .slice(-10) // Últimas 10 conversaciones
        .map(conv => ({
          id: conv.id,
          title: conv.title || 'Conversación',
          lastMessagePreview: conv.lastMessagePreview || '',
          createdAt: conv.createdAt.toISOString(),
          updatedAt: conv.updatedAt.toISOString(),
          messageCount: conv.messages.length
        }));
      
      localStorage.setItem(
        this.CONVERSATIONS_BACKUP_KEY, 
        JSON.stringify(essentialConversations)
      );
    } catch (error) {
      console.error('ERRORS.ESSENTIAL_CONVERSATIONS_BACKUP_ERROR', error);
    }
  }

  private loadConversationsFromBackup(): Conversation[] | null {
    try {
      const backupItem = localStorage.getItem(this.CONVERSATIONS_BACKUP_KEY);
      if (!backupItem) {
        return null;
      }
      
      const backupData = JSON.parse(backupItem);
      
      // El backup solo tiene información básica, no mensajes completos
      console.warn('ERRORS.LOADING_CONVERSATIONS_FROM_BACKUP');
      
      // Crear conversaciones vacías basadas en el backup
      const conversations: Conversation[] = Array.isArray(backupData) 
        ? backupData.map(item => ({
            id: item.id || `backup-${Date.now()}`,
            title: item.title || 'Conversación recuperada',
            messages: [], // No podemos recuperar mensajes del backup básico
            createdAt: new Date(item.createdAt || new Date()),
            updatedAt: new Date(item.updatedAt || new Date()),
            lastMessagePreview: item.lastMessagePreview || ''
          }))
        : [];
      
      return conversations;
      
    } catch (error) {
      console.error('ERRORS.CONVERSATIONS_BACKUP_LOAD_ERROR', error);
      return null;
    }
  }

  private createConversationsBackup(conversations: Conversation[]): void {
    try {
      const recentConversations = conversations.slice(-10);
      
      if (recentConversations.length > 0) {
        this.saveEssentialConversations(recentConversations);
      }
    } catch (error) {
      // Error silenciado para backup
    }
  }

  // ============ MÉTODOS PRIVADOS EXISTENTES ============

  private serializeHistory(history: ChatHistoryItem[]): any[] {
    return history.map(item => ({
      ...item,
      timestamp: item.timestamp instanceof Date 
        ? item.timestamp.toISOString() 
        : (typeof item.timestamp === 'string' 
            ? item.timestamp 
            : new Date().toISOString()),
      sources: Array.isArray(item.sources) ? item.sources : []
    }));
  }

  private deserializeHistory(serializedHistory: any[]): ChatHistoryItem[] {
    return serializedHistory.map(item => {
      let timestamp: Date;
      try {
        if (item.timestamp instanceof Date) {
          timestamp = item.timestamp;
        } else if (typeof item.timestamp === 'string') {
          timestamp = new Date(item.timestamp);
          if (isNaN(timestamp.getTime())) {
            timestamp = new Date();
          }
        } else {
          timestamp = new Date();
        }
      } catch {
        timestamp = new Date();
      }
      
      return {
        ...item,
        timestamp: timestamp,
        isPredefined: item.isPredefined || false,
        // Nuevas propiedades para compatibilidad
        conversationId: item.conversationId || 'migrated-conversation',
        _conversationTitle: item._conversationTitle || 'Historial anterior',
        _isMigrated: item._isMigrated || true
      };
    });
  }

  private saveEssentialHistory(history: ChatHistoryItem[]): void {
    try {
      const essentialData = history.map(item => ({
        id: item.id || `backup-${Date.now()}`,
        question: item.question || '',
        answer: item.answer || '',
        isPredefined: item.isPredefined || false,
        timestamp: new Date().toISOString()
      }));
      
      localStorage.setItem(this.STORAGE_BACKUP_KEY, JSON.stringify(essentialData));
    } catch (error) {
      console.error('ERRORS.ESSENTIAL_BACKUP_ERROR', error);
    }
  }

  private loadFromBackup(): ChatHistoryItem[] | null {
    try {
      const backupItem = localStorage.getItem(this.STORAGE_BACKUP_KEY);
      if (!backupItem) {
        return null;
      }
      
      const backupData = JSON.parse(backupItem);
      
      const history: ChatHistoryItem[] = Array.isArray(backupData) 
        ? backupData.map(item => ({
            ...item,
            timestamp: new Date(item.timestamp || new Date()),
            sources: [],
            isPredefined: item.isPredefined || false,
            conversationId: 'backup-conversation',
            _conversationTitle: 'Historial de respaldo',
            _isMigrated: true
          }))
        : [];
      
      if (history.length > 0) {
        this.saveChatHistory(history);
      }
      
      return history;
      
    } catch (error) {
      console.error('ERRORS.BACKUP_LOAD_ERROR', error);
      return null;
    }
  }

  private createBackup(history: ChatHistoryItem[]): void {
    try {
      const recentHistory = history
        .filter(item => !item.isPredefined && item.answer?.trim())
        .slice(0, 20);
      
      if (recentHistory.length > 0) {
        this.saveEssentialHistory(recentHistory);
      }
    } catch (error) {
      // Error silenciado para backup
    }
  }

  private clearCorruptedStorage(): void {
    try {
      localStorage.removeItem(this.STORAGE_KEY);
    } catch (error) {
      console.error('ERRORS.CORRUPTED_STORAGE_CLEANUP_ERROR', error);
    }
  }

  // ============ MÉTODOS DE UTILIDAD ============

  clearAll(): void {
    this.clearChatHistory();
    this.clearConversations();
  }

  getStorageUsage(): {
    total: number;
    chatHistory: number;
    conversations: number;
    other: number;
  } {
    let total = 0;
    let chatHistory = 0;
    let conversations = 0;
    let other = 0;

    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key) continue;

        const value = localStorage.getItem(key) || '';
        const size = new Blob([value]).size;

        total += size;

        if (key === this.STORAGE_KEY || key === this.STORAGE_BACKUP_KEY) {
          chatHistory += size;
        } else if (key === this.CONVERSATIONS_KEY || key === this.CONVERSATIONS_BACKUP_KEY) {
          conversations += size;
        } else {
          other += size;
        }
      }
    } catch (error) {
      console.error('ERRORS.STORAGE_USAGE_ERROR', error);
    }

    return { total, chatHistory, conversations, other };
  }
}