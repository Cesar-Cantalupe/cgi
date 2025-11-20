export interface ChatHistoryItem {
  id: string;
  question: string;
  answer: string;
  timestamp: Date;
  sources?: any[];
  isPredefined?: boolean;
}