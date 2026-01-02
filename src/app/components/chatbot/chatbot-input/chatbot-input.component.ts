import { Component, Input, Output, EventEmitter, ChangeDetectorRef, NgZone, OnDestroy, OnInit } from '@angular/core';
import { ChatbotService } from '../../../services/chatbot/chatbot.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-chatbot-input',
  templateUrl: './chatbot-input.component.html'
})
export class ChatbotInputComponent implements OnInit, OnDestroy {
  private _newMessage = '';

  @Input() 
  set newMessage(value: string) {
    if (this._newMessage !== value) {
      this._newMessage = value;
      setTimeout(() => {
        this.cdr.markForCheck();
      }, 0);
    }
  }

  get newMessage(): string {
    return this._newMessage;
  }

  @Output() newMessageChange = new EventEmitter<string>();
  @Input() showQuickSuggestions = false;
    
  @Output() sendMessage = new EventEmitter<void>();
  @Output() quickSuggestion = new EventEmitter<string>();
  
  isProcessing = false;
  isWebSocketConnected = false;
  
  private processingSubscription?: Subscription;
  private connectionSubscription?: Subscription;
  
  constructor(
    private chatbotService: ChatbotService,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone
  ) {
    this.initializeSubscriptions();
  }

  ngOnInit() {
    this.updateConnectionState();
  }

  private initializeSubscriptions(): void {
    this.processingSubscription = this.chatbotService.isProcessing$.subscribe(
      (processing: boolean) => {
        this.safeUpdateState('isProcessing', processing);
      }
    );  
    
    this.connectionSubscription = this.chatbotService.getConnectionStatus().subscribe(
      (status: string) => {
        const isConnected = status === 'connected' || status === 'Connected' || 
                           status === 'Conectado' || status === 'Connected via WebSocket' ||
                           status === 'Conectado via WebSocket';
        this.safeUpdateState('isWebSocketConnected', isConnected);
      }
    );
  }

  getDisabledTitle(): string {
  if (!this.isWebSocketConnected) {
    return 'Waiting for connection...';
  }
  if (this.isProcessing) {
    return 'Processing response...';
  }
  if (!this._newMessage.trim()) {
    return 'Write a message first';
  }
  return 'Cannot send';
}

  private safeUpdateState(property: 'isProcessing' | 'isWebSocketConnected', value: boolean): void {
    if (this[property] !== value) {
      setTimeout(() => {
        this.ngZone.run(() => {
          this[property] = value;
          this.cdr.markForCheck();
        });
      }, 0);
    }
  }

  isInputEnabled(): boolean {
    return !this.isProcessing && this.isWebSocketConnected;
  }

  private updateConnectionState(): void {
    this.isWebSocketConnected = this.chatbotService.isConnected();
  }

  onInputChange(value: string): void {
    this._newMessage = value;
    this.newMessageChange.emit(value);
  }

  onKeyPress(event: KeyboardEvent): void {
    if (event.key === 'Enter' && this.canSend()) {
      event.preventDefault();
      this.onSend();
    }
  }

  onSend(): void {
    if (this.canSend()) {
      this.sendMessage.emit();
    }
  }
  
  onQuickSuggestionClick(suggestion: string): void {
    this.quickSuggestion.emit(suggestion);
  }

  canSend(): boolean {
    const canSendFromService = this.chatbotService.canSendMessages();
    const hasMessage = this._newMessage.trim().length > 0;
    return canSendFromService && hasMessage && !this.isProcessing && this.isWebSocketConnected;
  }

  clearInput(): void {
    this.ngZone.run(() => {
      this._newMessage = '';
      this.newMessageChange.emit('');
      this.cdr.markForCheck();
    });
  }

  setInputValue(value: string): void {
    this.ngZone.run(() => {
      this._newMessage = value;
      this.newMessageChange.emit(value);
      
      setTimeout(() => {
        this.cdr.markForCheck();
      }, 0);
    });
  }

  ngOnDestroy(): void {
    if (this.processingSubscription) {
      this.processingSubscription.unsubscribe();
    }
    if (this.connectionSubscription) {
      this.connectionSubscription.unsubscribe();
    }
  }
}