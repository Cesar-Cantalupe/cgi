import { Component, Output, EventEmitter, OnInit } from '@angular/core';
import { SuggestionsService } from '../../../services/suggestions.service';

@Component({
  selector: 'app-chatbot-welcome',
  templateUrl: './chatbot-welcome.component.html'
})
export class ChatbotWelcomeComponent implements OnInit {
  @Output() suggestedQuestion = new EventEmitter<string>();

  suggestedQuestions: string[] = [];

  constructor(private suggestionsService: SuggestionsService) {}

  ngOnInit() {
    this.suggestedQuestions = this.suggestionsService.getMedicalSuggestions();
  }

  onSuggestedQuestionClick(question: string): void {
    this.suggestedQuestion.emit(question);
  }
}