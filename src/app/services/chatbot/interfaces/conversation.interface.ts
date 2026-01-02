// conversation.interface.ts (archivo unificado)
import { ChatMessage } from './chat-message.interface';

// Conversación principal (como en DeepSeek)
export interface Conversation {
  id: string;                      
  title: string;                   
  messages: ChatMessage[];         
  createdAt: Date;                 
  updatedAt: Date;                 
  preview?: string;                
  messageCount: number;            
  isActive?: boolean;              
  // Campos adicionales para compatibilidad
  date?: Date;                    // Para compatibilidad con ChatHistoryItem
  tags?: string[];                // Para compatibilidad
  metadata?: any;                 // Para compatibilidad
}

// Para almacenamiento en localStorage
export interface StoredConversation {
  id: string;
  title: string;
  messages: Array<{
    id: string;
    conversationId: string;
    content: string;
    sender: 'user' | 'bot' | 'system';
    timestamp: string;             
    sources?: any[];
    feedback?: 'like' | 'dislike' | null;
    isStreaming?: boolean;
  }>;
  createdAt: string;               
  updatedAt: string;               
  preview?: string;
  messageCount: number;
  // Campos adicionales para almacenamiento
  date?: string;
  tags?: string[];
  metadata?: any;
}
