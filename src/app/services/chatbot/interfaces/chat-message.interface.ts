export interface ChatMessage {
  id?: string;
  content: string;
  isUser: boolean;
  timestamp: Date;
  sources?: any[];
  sender?: 'user' | 'bot' | 'system';
  text?: string;
  feedback?: 'like' | 'dislike' | null;
  showFeedbackBox?: boolean;
  feedbackText?: string;
  isStreaming?: boolean;
}