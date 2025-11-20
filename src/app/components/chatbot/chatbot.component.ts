import { Component, OnInit, OnDestroy } from '@angular/core';
import { Subscription } from 'rxjs';
import { ChatbotService, ChatMessage } from '../../services/chatbot';
import { TranslationService } from '../../services/translation.service';

@Component({
  selector: 'app-chatbot',
  templateUrl: './chatbot.component.html',
  styleUrls: ['./chatbot.component.css']
})
export class ChatbotComponent implements OnInit, OnDestroy {
  sidebarExpanded = true;
  healthProfileEnabled = false;
  newMessage = '';
  messages: ChatMessage[] = [];
  connectionStatus = '';
  predefinedQuestions: string[] = [];
  preloadedQuestion: string = '';

  private langSubscription!: Subscription;
  private messagesSubscription!: Subscription;
  private connectionSubscription!: Subscription;
  
  constructor(
    private chatbotService: ChatbotService,
    private translationService: TranslationService
  ) {}

  ngOnInit() {
    this.loadPredefinedQuestions();   
            
    this.messagesSubscription = this.chatbotService.messages$.subscribe((messages: ChatMessage[]) => {
      const uniqueMessages = this.removeDuplicateMessages(messages);
      this.messages = uniqueMessages;
    });

    this.connectionSubscription = this.chatbotService.getConnectionStatus().subscribe((status: string) => {
      this.connectionStatus = status;
      this.updateConnectionStatusText();
    });

    this.langSubscription = this.translationService.getCurrentLangObservable().subscribe(() => {
      this.updateConnectionStatusText();
    });

    this.updateConnectionStatusText();
  }

  private removeDuplicateMessages(messages: ChatMessage[]): ChatMessage[] {
    const seenIds = new Set();
    return messages.filter(message => {
      if (seenIds.has(message.id)) {
        return false;
      }
      seenIds.add(message.id);
      return true;
    });
  }

  private loadPredefinedQuestions(): void {
    this.predefinedQuestions = this.chatbotService.getPredefinedQuestions();
  }

  private updateConnectionStatusText(): void {
    const currentStatus = this.connectionStatus;
    if (currentStatus === 'Conectado' || currentStatus === 'Connected') {
      this.connectionStatus = this.translationService.instant('CHAT.CONNECTED');
    } else if (currentStatus === 'Desconectado' || currentStatus === 'Disconnected') {
      this.connectionStatus = this.translationService.instant('CHAT.DISCONNECTED');
    } else if (currentStatus === 'Connected via HTTP' || currentStatus === 'Conectado via HTTP') {
      this.connectionStatus = this.translationService.instant('CHAT.CONNECTED_HTTP');
    } else if (currentStatus === 'Connected via WebSocket' || currentStatus === 'Conectado via WebSocket') {
      this.connectionStatus = this.translationService.instant('CHAT.CONNECTED_WEBSOCKET');
    } else if (currentStatus === 'Backend available' || currentStatus === 'Backend disponible') {
      this.connectionStatus = this.translationService.instant('CHAT.BACKEND_AVAILABLE');
    }
  }

  toggleSidebar(): void {
    this.sidebarExpanded = !this.sidebarExpanded;
  }

  clearHistory(): void {
    this.chatbotService.clearHistory();
  }

  onHealthProfileToggle(enabled: boolean): void {
    this.healthProfileEnabled = enabled;
  }

  onInputChange(message: string): void {
    this.newMessage = message;
  }

  send(): void {
    if (this.newMessage.trim()) {
      this.chatbotService.sendMessage(this.newMessage);
      this.newMessage = '';
      this.preloadedQuestion = '';
    }
  }

  onSuggestedQuestionClick(question: string): void {
    this.chatbotService.loadQuestionFromSidebar(question);
    this.newMessage = '';
    this.preloadedQuestion = '';
  }

  onQuickSuggestionClick(suggestion: string): void {
    this.chatbotService.sendMessage(suggestion);
  }

  trackByMessage(index: number, message: ChatMessage): string {
    return message.id || index.toString();
  }

  shouldShowPredefinedQuestions(): boolean {
    return this.messages.length === 0;
  }

  ngOnDestroy() {
    if (this.langSubscription) {
      this.langSubscription.unsubscribe();
    }
    if (this.messagesSubscription) {
      this.messagesSubscription.unsubscribe();
    }
    if (this.connectionSubscription) {
      this.connectionSubscription.unsubscribe();
    }
  }
}