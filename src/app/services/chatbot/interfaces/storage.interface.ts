import { StoredConversation } from './conversation.interface';

export interface ConversationsStorage {
  version: '2.0';                  
  conversations: StoredConversation[];
  savedAt: string;                 
}
