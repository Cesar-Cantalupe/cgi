import { Injectable } from '@angular/core';
import { ChatHistoryItem } from './interfaces/chat-history.interface';
import { StorageData } from './interfaces/storage.interface';

@Injectable({
  providedIn: 'root'
})
export class StorageService {
  private readonly STORAGE_KEY = 'chatHistory';
  private readonly EXPIRY_HOURS = 48;

  constructor() {}

  saveChatHistory(history: ChatHistoryItem[]): void {
    const storageData: StorageData = {
      data: history,
      expiry: Date.now() + (this.EXPIRY_HOURS * 60 * 60 * 1000)
    };
    
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(storageData));
    } catch (error) {
      console.error('Error guardando en localStorage:', error);
    }
  }

  loadChatHistory(): ChatHistoryItem[] | null {
    try {
      const item = localStorage.getItem(this.STORAGE_KEY);
      if (!item) return null;

      const storageData: StorageData = JSON.parse(item);
      
      if (Date.now() > storageData.expiry) {
        this.clearChatHistory();
        return null;
      }
      
      return storageData.data;
    } catch (error) {
      console.error('Error cargando de localStorage:', error);
      this.clearChatHistory();
      return null;
    }
  }

  clearChatHistory(): void {
    try {
      localStorage.removeItem(this.STORAGE_KEY);
    } catch (error) {
      console.error('Error limpiando localStorage:', error);
    }
  }
}