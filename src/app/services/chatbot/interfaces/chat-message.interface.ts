// interfaces/chat-message.interface.ts
export interface ChatMessage {
  id: string;
  content: string;
  sender: 'user' | 'bot' | 'system';
  timestamp: Date;
  isStreaming?: boolean;
  sources?: any[];
  feedback?: 'like' | 'dislike' | null;
  showFeedbackBox?: boolean;
  
  // Propiedades para compatibilidad
  isUser?: boolean;
  text?: string;
  
  // Propiedades internas para streaming
  _streamingUpdate?: number;
  _isProcessingPlaceholder?: boolean;
  _originalQuestionType?: 'user' | 'predefined';
  _isPredefinedQuestion?: boolean;
  _initialStreaming?: boolean;
  
  // Propiedad específica de conversaciones
  conversationId?: string;
}