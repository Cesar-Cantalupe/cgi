import { Component, Output, EventEmitter } from '@angular/core';
import { TranslationService } from '../../../services/translation.service';

@Component({
  selector: 'app-chatbot-welcome',
  templateUrl: './chatbot-welcome.component.html'
})
export class ChatbotWelcomeComponent {
  @Output() suggestedQuestion = new EventEmitter<string>();
  
  medicalSuggestionKeys = [
    "SUGGESTIONS.WHAT_IS_CANCER",
    "SUGGESTIONS.CANCER_MUTATION",
    "SUGGESTIONS.GENOMIC_SEQUENCING_DIAGNOSIS",
    "SUGGESTIONS.SOMATIC_GERMLINE_DIFFERENCE"
  ];

  constructor(private translationService: TranslationService) {}
  
  getTranslatedSuggestions(): string[] {
    return this.medicalSuggestionKeys.map(key => 
      this.translationService.instant(key)
    );
  }
  
  onSuggestedQuestionClick(key: string): void {    
    const translatedQuestion = this.translationService.instant(key);
    this.suggestedQuestion.emit(translatedQuestion);
  }
}