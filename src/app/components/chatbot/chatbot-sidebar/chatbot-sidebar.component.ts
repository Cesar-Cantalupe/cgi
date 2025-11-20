import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { ChatbotService,
         ChatHistoryItem 
} from '../../../services/chatbot';
import { TranslationService } from '../../../services/translation.service';

@Component({
  selector: 'app-chatbot-sidebar',
  templateUrl: './chatbot-sidebar.component.html'
})
export class ChatbotSidebarComponent implements OnInit {
  @Input() sidebarExpanded = true;
  @Input() healthProfileEnabled = false;
  
  @Output() toggleSidebar = new EventEmitter<void>();
  @Output() clearHistory = new EventEmitter<void>();
  @Output() healthProfileToggled = new EventEmitter<boolean>();
  @Output() suggestedQuestion = new EventEmitter<string>();

  chatHistory: ChatHistoryItem[] = [];
  searchQuery: string = '';

  constructor(
    private chatbotService: ChatbotService,
    private translationService: TranslationService
  ) {}

  ngOnInit() {
    this.chatbotService.chatHistory$.subscribe(history => {
      this.chatHistory = history;      
    });
  }

  get filteredChatHistory(): ChatHistoryItem[] {
    if (!this.searchQuery) {
      return this.chatHistory;
    }
    
    const query = this.searchQuery.toLowerCase();
    return this.chatHistory.filter(item =>
      item.question.toLowerCase().includes(query) ||
      (item.answer && item.answer.toLowerCase().includes(query))
    );
  }

  getUserConversations(): ChatHistoryItem[] {
    return this.chatHistory.filter(item => 
      !item.isPredefined && 
      item.answer && 
      item.answer.trim() !== ''
    );
  }

  getPredefinedQuestions(): ChatHistoryItem[] {
    return this.chatHistory.filter(item => item.isPredefined);
  }

  hasUserConversations(): boolean {
    return this.getUserConversations().length > 0;
  }

  clearSearch(): void {
    this.searchQuery = '';
  }

  onHealthProfileToggle(event: any): void {
    const isEnabled = event.target.checked;
    this.healthProfileToggled.emit(isEnabled);
  }
 
  onConversationClick(conversation: ChatHistoryItem): void {      
  this.chatbotService.loadQuestionFromSidebar(conversation.question);
    
}
  
  onPredefinedQuestionClick(question: string): void {     
  this.chatbotService.loadQuestionFromSidebar(question);
    
}
  trackByConversation(index: number, item: ChatHistoryItem): string {
    return item.id;
  }
}