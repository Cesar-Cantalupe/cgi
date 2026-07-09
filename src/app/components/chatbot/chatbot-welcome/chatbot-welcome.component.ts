import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { SuggestionsService } from '../../../services/suggestions.service';

@Component({
  selector: 'app-chatbot-welcome',
  templateUrl: './chatbot-welcome.component.html'
})
export class ChatbotWelcomeComponent implements OnInit {
  @Input() newMessage: string = '';
  @Output() newMessageChange = new EventEmitter<string>();
  @Output() sendMessage = new EventEmitter<void>();
  @Output() suggestedQuestion = new EventEmitter<string>();

  suggestedQuestions: string[] = [];

  constructor(private suggestionsService: SuggestionsService) {}

  ngOnInit() {
    this.suggestedQuestions = this.suggestionsService.getMedicalSuggestions();
  }

  onInputChange(value: string): void {
    this.newMessageChange.emit(value);
  }

  onKeyPress(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.onSend();
    }
  }

  onSend(): void {
    if (this.newMessage?.trim()) {
      this.sendMessage.emit();
    }
  }

  onSuggestedQuestionClick(question: string): void {
    this.suggestedQuestion.emit(question);
  }
}