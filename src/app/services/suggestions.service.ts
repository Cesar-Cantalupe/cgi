// services/suggestions.service.ts
import { Injectable } from '@angular/core';
import { TranslationService } from './translation.service';

@Injectable({
  providedIn: 'root'
})
export class SuggestionsService {
  
  
  medicalSuggestionKeys = [
    "SUGGESTIONS.WHAT_IS_CANCER",
    "SUGGESTIONS.CANCER_MUTATION",
    "SUGGESTIONS.GENOMIC_SEQUENCING_DIAGNOSIS", 
    "SUGGESTIONS.SOMATIC_GERMLINE_DIFFERENCE"
  ];

  
  predefinedQuestionKeys = [
    "SUGGESTIONS.WHAT_IS_CANCER",
    "SUGGESTIONS.CANCER_MUTATIONS",          
    "SUGGESTIONS.TREATMENT_OPTIONS", 
    "SUGGESTIONS.GENOMIC_SEQUENCING",         
    "SUGGESTIONS.IMMUNOTHERAPY_WORK",
    "SUGGESTIONS.CANCER_MUTATION",            
    "SUGGESTIONS.GENOMIC_SEQUENCING_DIAGNOSIS", 
    "SUGGESTIONS.SOMATIC_GERMLINE_DIFFERENCE"
  ];

  constructor(private translationService: TranslationService) {}

  getMedicalSuggestions(): string[] {
    return this.medicalSuggestionKeys.map(key => 
      this.translationService.instant(key)
    );
  }

  getPredefinedQuestions(): any[] {
    return this.predefinedQuestionKeys.map((key, index) => ({
      id: `predefined-${index}`,
      questionKey: key,
      questionText: this.translationService.instant(key),
      isPredefined: true
    }));
  }
}