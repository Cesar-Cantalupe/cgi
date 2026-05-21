import { ChatMessage } from './chat-message.interface';

// Conversación principal
export interface Conversation {
  id: string;                      
  title: string;                   
  messages: ChatMessage[];         
  createdAt: Date;                 
  updatedAt: Date;                 
  preview?: string;                
  messageCount: number;            
  isActive?: boolean;              
  date?: Date;
  tags?: string[];
  metadata?: any;
  filters?: Array<{
    tumor_type?: string;
    tumor_alteration?: string[];
    treatment?: string[];
  }>;
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
  date?: string;
  tags?: string[];
  metadata?: any;
  filters?: Array<{
    tumor_type?: string;
    tumor_alteration?: string[];
    treatment?: string[];
  }>;
}
