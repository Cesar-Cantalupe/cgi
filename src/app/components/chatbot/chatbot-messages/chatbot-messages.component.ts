import { Component, Input, OnChanges, SimpleChanges, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { ChatMessage } from '../../../services/chatbot/interfaces/chat-message.interface';
import { ChatbotService } from '../../../services/chatbot/chatbot.service';

@Component({
  selector: 'app-chatbot-messages',
  templateUrl: './chatbot-messages.component.html'
})
export class ChatbotMessagesComponent implements OnChanges, OnInit, OnDestroy {
  @Input() messages: ChatMessage[] = [];
  
  private lastDisplayedState: { [key: string]: string } = {};
  private visiblePopoverIndex: number | null = null;
  private popoverTimeout: any;
  showCursor = true;
  private cursorInterval: any;

  constructor(
    private chatbotService: ChatbotService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.cursorInterval = setInterval(() => {
      this.showCursor = !this.showCursor;
      if (this.messages.some((message: ChatMessage) => message.isStreaming)) {
        this.cdr.detectChanges();
      }
    }, 500);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['messages']) {
      const previousMessages = changes['messages'].previousValue || [];
      const currentMessages = changes['messages'].currentValue || [];
      
      currentMessages.forEach((message: ChatMessage, index: number) => {
        const content = message.text || message.content || '';
        const messageId = message.id || `index-${index}`;
        const lastContent = this.lastDisplayedState[messageId];
        
        if (content !== lastContent) {
          this.lastDisplayedState[messageId] = content;
        }
      });

      if (currentMessages.some((message: ChatMessage) => message.isStreaming)) {
        this.cdr.detectChanges();
      }
    }
  }

  ngOnDestroy() {
    if (this.cursorInterval) {
      clearInterval(this.cursorInterval);
    }
  }

  getMessageSender(message: ChatMessage): 'user' | 'bot' | 'system' {
    if (message.sender) {
      return message.sender;
    }
    return message.isUser ? 'user' : 'bot';
  }

  getMessageText(message: ChatMessage): string {
    return message.text || message.content || '';
  }

  trackByMessage(index: number, message: ChatMessage): string {
    const messageId = message.id || `index-${index}`;
    const contentHash = (message.text || message.content || '').length;
    const timestamp = (message as any)._lastUpdate || message.timestamp?.getTime() || 0;
    const streaming = message.isStreaming ? 'streaming' : 'complete';
    
    return `${messageId}-${streaming}-${contentHash}-${timestamp}`;
  }

  trackBySource(index: number, source: any): string {
    return source.id || index.toString();
  }

  getTextWithoutReferences(text: string): string {
    if (!text) return '';
    return text.replace(/\[\d+\]/g, '');
  }

  getReferencesFromText(text: string): string[] {
    if (!text) return [];
    const references = text.match(/\[\d+\]/g) || [];
    return references;
  }

  showSourcesPopoverFor(index: number): void {
    clearTimeout(this.popoverTimeout);
    this.visiblePopoverIndex = index;
  }

  hideSourcesPopoverFor(index: number): void {
    this.popoverTimeout = setTimeout(() => {
      if (this.visiblePopoverIndex === index) {
        this.visiblePopoverIndex = null;
      }
    }, 300);
  }

  toggleSourcesPopover(index: number): void {
    if (this.visiblePopoverIndex === index) {
      this.visiblePopoverIndex = null;
    } else {
      this.visiblePopoverIndex = index;
    }
  }

  isSourcesPopoverVisible(index: number): boolean {
    return this.visiblePopoverIndex === index;
  }

  setFeedback(message: ChatMessage, type: 'like' | 'dislike'): void {
    if (!message.hasOwnProperty('feedback')) {
      (message as any).feedback = null;
    }
    (message as any).feedback = type;
  }

  toggleFeedbackBox(message: ChatMessage): void {
    if (!message.hasOwnProperty('showFeedbackBox')) {
      (message as any).showFeedbackBox = false;
    }
    if (!message.hasOwnProperty('feedbackText')) {
      (message as any).feedbackText = '';
    }
    
    (message as any).showFeedbackBox = !(message as any).showFeedbackBox;
    if (!(message as any).showFeedbackBox) {
      (message as any).feedbackText = '';
    }
  }

  submitFeedback(message: ChatMessage): void {
    (message as any).showFeedbackBox = false;
    (message as any).feedbackText = '';
  }

  getDisplayedContent(message: ChatMessage): string {
    let content = message.text || message.content || '';
    
    if (message.isStreaming && this.showCursor) {
      return content + '▊';
    }
    
    return content;
  }
}