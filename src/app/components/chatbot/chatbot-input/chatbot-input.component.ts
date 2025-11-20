import { Component, Input, Output, EventEmitter } from '@angular/core';
import { TranslationService } from '../../../services/translation.service';


@Component({
  selector: 'app-chatbot-input',
  templateUrl: './chatbot-input.component.html'
})
export class ChatbotInputComponent {
  @Input() newMessage = '';
  @Input() showQuickSuggestions = false;
  @Output() inputChange = new EventEmitter<string>();
  @Output() sendMessage = new EventEmitter<void>();
  @Output() quickSuggestion = new EventEmitter<string>();
  
  constructor() {}

  onInputChange(event: any): void {
    this.inputChange.emit(event.target.value);
  }

  onSend(): void {
    if (this.newMessage.trim()) {
      this.sendMessage.emit();
    }
  }

  onKeyPress(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.onSend();
    }
  }

}