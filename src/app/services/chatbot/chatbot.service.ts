import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { TranslationService } from '../translation.service';
import { WebsocketService } from './websocket.service';
import { StorageService } from './storage.service';
import { MessageParserService } from './message-parser.service';

import { ChatMessage } from './interfaces/chat-message.interface';
import { ChatHistoryItem } from './interfaces/chat-history.interface';
import { QueryRequest, WebSocketEvent } from './interfaces/websocket-events.interface';

import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class ChatbotService {
  
  private messagesSubject = new BehaviorSubject<ChatMessage[]>([]);
  private chatHistorySubject = new BehaviorSubject<ChatHistoryItem[]>([]);
  
  public messages$ = this.messagesSubject.asObservable();
  public chatHistory$ = this.chatHistorySubject.asObservable();

  // ✅ URL DIRECTA - SIN process.env
  private readonly WS_URL = `${environment.websocketUrl}?api_key=${environment.apiKey}`;
  
  private currentStreamingMessage: ChatMessage | null = null;
  private streamingBuffer: string = '';
  private displayedContent: string = '';
  private animationFrameId: number | null = null;
  private _isAnimatingValue: boolean = false;

  private predefinedQuestionKeys = [
    "SUGGESTIONS.CANCER_MUTATIONS",
    "SUGGESTIONS.TREATMENT_OPTIONS",
    "SUGGESTIONS.GENOMIC_SEQUENCING",
    "SUGGESTIONS.IMMUNOTHERAPY_WORK",
    "SUGGESTIONS.WHAT_IS_CANCER",
    "SUGGESTIONS.CANCER_MUTATION",
    "SUGGESTIONS.GENOMIC_SEQUENCING_DIAGNOSIS",
    "SUGGESTIONS.SOMATIC_GERMLINE_DIFFERENCE"
  ];

  constructor(
    private translationService: TranslationService,
    private websocketService: WebsocketService,
    private storageService: StorageService,
    private messageParser: MessageParserService
  ) {
    this.initializeService();
    this.initializeConnection();
  }

  private get _isAnimating(): boolean {
    return this._isAnimatingValue;
  }

  private set _isAnimating(value: boolean) {
    this._isAnimatingValue = value;
  }

  private initializeService(): void {
    if (this.translationService.instant('SUGGESTIONS.CANCER_MUTATIONS') !== 'SUGGESTIONS.CANCER_MUTATIONS') {
      this.loadChatHistoryFromStorage();
    } else {
      setTimeout(() => this.initializeService(), 100);
    }
  }

  private initializeConnection(): void {
    // ✅ USAR DIRECTAMENTE this.WS_URL
    this.websocketService.connect(this.WS_URL).subscribe({
      next: (connected) => {
        if (connected) {
          this.setupMessageHandling();
        }
      },
      error: (error) => {
        console.error('Error conectando WebSocket:', error);
      }
    });
  }

  private setupMessageHandling(): void {
    this.websocketService.messages$.subscribe((event: WebSocketEvent) => {
      this.handleWebSocketEvent(event);
    });
  }

  private handleWebSocketEvent(event: WebSocketEvent): void {
    switch(event.type) {
      case 'status':
        this.handleStatusEvent(event);
        break;
      case 'stream_start':
        this.handleStreamStartEvent(event);
        break;
      case 'stream_chunk':
        this.handleStreamChunkEvent(event);
        break;
      case 'stream_end':
        this.handleStreamEndEvent(event);
        break;
      case 'error':
        this.handleErrorEvent(event);
        break;
      default:
        const unknownEvent = event as any;
        console.warn('Tipo de evento desconocido:', unknownEvent.type, unknownEvent);
    }
  }

  private handleStatusEvent(event: any): void {
    if (this.currentStreamingMessage) {
      this.displayedContent += `\n\n_${event.message}_\n\n`;
      this.updateStreamingContent(this.displayedContent);
    }
  }

  private handleStreamStartEvent(event: any): void {
    this.streamingBuffer = '';
    this.displayedContent = '';
    this._isAnimating = false;
    
    this.currentStreamingMessage = this.addBotMessage('', true);
  }

  private handleStreamChunkEvent(event: any): void {
    if (!this.currentStreamingMessage || !event.chunk) return;
    
    if (event.chunk.trim().length === 0) {
      return;
    }
    
    this.streamingBuffer += event.chunk;
    
    if (!this._isAnimating) {
      this.startStreamingAnimation();
    }
  }

  private startStreamingAnimation(): void {
    if (this._isAnimating) {
      return;
    }
    
    this._isAnimating = true;
    
    const animate = () => {
      if (!this._isAnimating) {
        return;
      }
      
      this.processAnimationFrame(3);
      
      if (this._isAnimating) {
        this.animationFrameId = requestAnimationFrame(animate);
      }
    };
    
    this.animationFrameId = requestAnimationFrame(animate);
  }

  private processAnimationFrame(charsPerBatch: number): void {
    if (this.streamingBuffer.length === 0) {
      return;
    }
    
    const charsToTake = Math.min(charsPerBatch, this.streamingBuffer.length);
    const nextChars = this.streamingBuffer.substring(0, charsToTake);
    this.streamingBuffer = this.streamingBuffer.slice(charsToTake);
    
    this.displayedContent += nextChars;
    
    this.updateStreamingContent(this.displayedContent);
  }

  private pauseStreamingAnimation(): void {
    this._isAnimating = false;
    
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  private stopStreamingAnimation(): void {
    this.pauseStreamingAnimation();
    this.streamingBuffer = '';
  }

  private handleStreamEndEvent(event: any): void {
    if (this.streamingBuffer.length > 0 && this.displayedContent.length < 100) {
      const remainingContent = this.streamingBuffer;
      this.streamingBuffer = '';
      
      this.simulateRemainingAnimation(remainingContent, event);
    } else {
      this.finalizeStreaming(event);
    }
  }

  private simulateRemainingAnimation(remainingContent: string, event: any): void {
    let currentIndex = 0;
    const chunkSize = 5;
    
    const simulateChunk = () => {
      if (currentIndex >= remainingContent.length) {
        this.finalizeStreaming(event);
        return;
      }
      
      const nextChunk = remainingContent.substring(currentIndex, currentIndex + chunkSize);
      currentIndex += chunkSize;
      
      this.displayedContent += nextChunk;
      this.updateStreamingContent(this.displayedContent);
      
      setTimeout(simulateChunk, 50);
    };
    
    simulateChunk();
  }

  private finalizeStreaming(event: any): void {
    this.stopStreamingAnimation();
    
    if (this.streamingBuffer.length > 0) {
      this.displayedContent += this.streamingBuffer;
      this.streamingBuffer = '';
      this.updateStreamingContent(this.displayedContent);
    }
    
    if (this.currentStreamingMessage && event.full_response) {
      this.finalizeStreamingMessage(
        event.full_response, 
        event.sources, 
        event.metadata
      );
    } else if (this.currentStreamingMessage) {
      this.finalizeStreamingMessage(
        this.displayedContent, 
        event.sources || [], 
        event.metadata || {}
      );
    }
    
    this.currentStreamingMessage = null;
  }

  private updateStreamingContent(content: string): void {
    if (!this.currentStreamingMessage) {
      return;
    }

    const currentMessages = this.messagesSubject.value;
    const messageIndex = currentMessages.findIndex(msg => 
      msg.id === this.currentStreamingMessage!.id
    );

    if (messageIndex === -1) {
      return;
    }

    const updatedMessages = currentMessages.map((message, index) => {
      if (index === messageIndex) {
        return {
          ...message,
          content: content,
          text: content,
          timestamp: new Date(),
          isStreaming: true
        };
      }
      return message;
    });

    this.messagesSubject.next(updatedMessages);
  }

  private handleErrorEvent(event: any): void {
    console.error('Error del servidor:', event.message);
    this.stopStreamingAnimation();
    this.currentStreamingMessage = null;
    this.addSystemMessage('CHAT.SERVER_ERROR');
  }

  async sendMessage(message: string, fromSidebar: boolean = false): Promise<void> {
    if (!message.trim()) return;

    if (!this.websocketService.isWebSocketConnected()) {
      this.addSystemMessage('CHAT.NOT_CONNECTED');
      
      if (!fromSidebar) {
        this.addUserMessage(message);
      }
      return;
    }

    if (!fromSidebar) {
      this.addUserMessage(message);
    }

    const request: QueryRequest = {
      query: message,
      filters: {},
      stream: true
    };

    try {
      this.websocketService.sendMessage(request);
    } catch (error) {
      console.error('Error enviando mensaje:', error);
      this.addSystemMessage('CHAT.CONNECTION_ERROR');
    }
  }

  clearHistory(): void {
    this.stopStreamingAnimation();
    this.currentStreamingMessage = null;
    this.messagesSubject.next([]);
    this.chatHistorySubject.next([]);
    this.storageService.clearChatHistory();
    this.showPredefinedQuestions();
  }

  getChatHistory(): string[] {
    return this.chatHistorySubject.value.map(item => item.question);
  }

  getFullChatHistory(): ChatHistoryItem[] {
    return this.chatHistorySubject.value;
  }

  getConnectionStatus(): Observable<string> {
    return this.websocketService.connectionStatus$;
  }

  getMessages(): ChatMessage[] {
    return this.messagesSubject.value;
  }

  testConnection(): void {
    this.addSystemMessage('CHAT.TESTING_CONNECTION');
    this.initializeConnection();
  }

  private loadChatHistoryFromStorage(): void {
    const storedHistory = this.storageService.loadChatHistory();
    
    if (storedHistory && Array.isArray(storedHistory) && storedHistory.length > 0) {
      this.chatHistorySubject.next(storedHistory);
    } else {
      this.showPredefinedQuestions();
    }
  }

  private showPredefinedQuestions(): void {
    const predefinedQuestions = this.getPredefinedQuestions();
    
    if (predefinedQuestions.some(q => !q || q.startsWith('SUGGESTIONS.'))) {
      setTimeout(() => this.showPredefinedQuestions(), 100);
      return;
    }
    
    const predefinedItems: ChatHistoryItem[] = predefinedQuestions.map((question, index) => ({
      id: `predefined-${index}`,
      question: question,
      answer: '',
      timestamp: new Date(),
      isPredefined: true
    }));
    
    this.chatHistorySubject.next(predefinedItems);
  }

  getPredefinedQuestions(): string[] {
    return this.predefinedQuestionKeys.map(key => 
      this.translationService.instant(key)
    );
  }

  private finalizeStreamingMessage(
    fullResponse: string, 
    sources: any[], 
    metadata: any
  ): void {
    const currentMessages = this.messagesSubject.value;
    const updatedMessages = currentMessages.map(msg => {
      if (msg.id === this.currentStreamingMessage?.id) {
        return {
          ...msg,
          content: fullResponse,
          text: fullResponse,
          isStreaming: false,
          sources: this.messageParser.formatSources(sources),
          timestamp: new Date()
        };
      }
      return msg;
    });
    
    this.messagesSubject.next(updatedMessages);
    this.saveConversationToHistory(fullResponse, sources);
  }

  private saveConversationToHistory(answer: string, sources?: any[]): void {
    const currentMessages = this.messagesSubject.value;
    
    let userMessage: ChatMessage | null = null;
    
    for (let i = currentMessages.length - 1; i >= 0; i--) {
      const message = currentMessages[i];
      if (message.isUser && !message.isStreaming) {
        userMessage = message;
        break;
      }
    }
    
    if (userMessage && answer && answer.trim()) {
      this.addConversationToHistory(userMessage.content, answer, sources);
    }
  }

  private addConversationToHistory(question: string, answer: string, sources?: any[]): void {
    const currentHistory = this.chatHistorySubject.value;
    
    const newConversation: ChatHistoryItem = {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2),
      question: question,
      answer: answer,
      timestamp: new Date(),
      sources: sources
    };
    
    const filteredHistory = currentHistory.filter(item => 
      !item.isPredefined && 
      item.question !== question
    );
    
    const predefinedQuestions = currentHistory.filter(item => item.isPredefined);
    let newHistory = [newConversation, ...filteredHistory];
    
    if (predefinedQuestions.length > 0) {
      newHistory = [...newHistory, ...predefinedQuestions];
    }
    
    const userConversations = newHistory.filter(item => !item.isPredefined);
    if (userConversations.length > 50) {
      const recentUserConversations = userConversations.slice(0, 50);
      const predefined = newHistory.filter(item => item.isPredefined);
      newHistory = [...recentUserConversations, ...predefined];
    }
    
    this.chatHistorySubject.next(newHistory);
    
    try {
      this.storageService.saveChatHistory(newHistory);
    } catch (error) {
      console.error('Error guardando en storage:', error);
    }
  }

  private addSystemMessage(textKey: string): void {
    const translatedText = this.translationService.instant(textKey);
    this.addMessage('system', translatedText);
  }

  private addUserMessage(text: string): void {
    this.addMessage('user', text);
  }

  private addBotMessage(textKey: string, isStreaming: boolean = false, sources?: any[]): ChatMessage {
    if (!isStreaming) {
      const currentMessages = this.messagesSubject.value;
      const filteredMessages = currentMessages.filter(m => 
        !(m.isUser === false && m.isStreaming)
      );
      this.messagesSubject.next(filteredMessages);
    }
    
    const translatedText = this.translationService.instant(textKey);
    return this.addMessage('bot', translatedText, isStreaming, sources);
  }

  private addMessage(
    sender: 'user' | 'bot' | 'system', 
    text: string, 
    isStreaming: boolean = false,
    sources?: any[]
  ): ChatMessage {
    const newMessage: ChatMessage = {
      id: Math.random().toString(36).substr(2, 9),
      content: text,
      text: text,
      sender: sender,
      isUser: sender === 'user',
      timestamp: new Date(),
      isStreaming,
      sources: sources
    };
    
    const currentMessages = this.messagesSubject.value;
    this.messagesSubject.next([...currentMessages, newMessage]);
    
    return newMessage;
  }

  loadConversationFromHistory(conversationId: string): void {
    const currentHistory = this.chatHistorySubject.value;
    const conversation = currentHistory.find(item => item.id === conversationId);
    
    if (conversation && conversation.answer) {
      const currentMessages = this.messagesSubject.value;
      
      const userMessage: ChatMessage = {
        id: `history-user-${conversation.id}`,
        content: conversation.question,
        text: conversation.question,
        sender: 'user',
        isUser: true,
        timestamp: conversation.timestamp
      };
      
      const botMessage: ChatMessage = {
        id: `history-bot-${conversation.id}`,
        content: conversation.answer,
        text: conversation.answer,
        sender: 'bot',
        isUser: false,
        timestamp: new Date(conversation.timestamp.getTime() + 1000),
        sources: conversation.sources ? this.messageParser.formatSources(conversation.sources) : undefined
      };
      
      this.messagesSubject.next([...currentMessages, userMessage, botMessage]);
    }
  }

  loadPredefinedQuestion(question: string): void {
    this.sendMessage(question);
  }

  async loadQuestionFromSidebar(question: string): Promise<void> {
    const currentMessages = this.messagesSubject.value;
    
    const userMessage: ChatMessage = {
      id: `sidebar-${Date.now()}`,
      content: question,
      text: question,
      sender: 'user',
      isUser: true,
      timestamp: new Date()
    };
    
    this.messagesSubject.next([...currentMessages, userMessage]);
    
    if (this.websocketService.isWebSocketConnected()) {
      await this.sendMessage(question, true);
    } else {
      this.addSystemMessage('CHAT.NOT_CONNECTED');
    }
  } 

  ngOnDestroy(): void {
    this.stopStreamingAnimation();
    this.websocketService.disconnect();
  }
}