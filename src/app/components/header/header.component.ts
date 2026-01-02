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
    this.translationService.getCurrentLangObservable().subscribe(lang => {
      this.currentLanguage = lang.toUpperCase();
    });
  }

  selectLanguage(language: string) {
    const langCode = language.toLowerCase();
    this.translationService.setLanguage(langCode);
  }

  getAvailableLanguages(): string[] {
    return this.languages.filter(lang => lang !== this.currentLanguage);
  }

  logout() {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}