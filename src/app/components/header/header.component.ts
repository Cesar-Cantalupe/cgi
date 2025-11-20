import { Component } from '@angular/core';
import { AuthService } from '../../services/auth.service';
import { Router } from '@angular/router';
import { TranslationService } from '../../services/translation.service';

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.css']
})
export class HeaderComponent {
  currentLanguage: string = 'EN';
  languages = ['EN', 'ES', 'FR', 'CA', 'DE', 'EL'];
  
  constructor(
    private authService: AuthService,
    private router: Router,
    private translationService: TranslationService
  ) {}
  
  ngOnInit() {
    // Suscribirse a cambios de idioma para actualizar currentLanguage
    this.translationService.getCurrentLangObservable().subscribe(lang => {
      this.currentLanguage = lang.toUpperCase();
    });
  }

  selectLanguage(language: string) {
    // Convertir 'EN' -> 'en', 'ES' -> 'es', etc.
    const langCode = language.toLowerCase();
    this.translationService.setLanguage(langCode);
    console.log('Language selected:', language);
  }

  getAvailableLanguages(): string[] {
    return this.languages.filter(lang => lang !== this.currentLanguage);
  }

  logout() {
    console.log('🖱️ LOGOUT BUTTON CLICKED - Starting logout process');
    
    // Verificar el estado actual
    console.log('Before logout - isAuthenticated:', this.authService.isAuthenticated());
    
    // Ejecutar logout
    this.authService.logout();
    
    console.log('After logout - isAuthenticated:', this.authService.isAuthenticated());
    
    // Navegar al login
    this.router.navigate(['/login']).then(success => {
      console.log('Navigation success:', success);
    }).catch(error => {
      console.log('Navigation error:', error);
    });
    
    console.log('Logout process completed');
  }
}