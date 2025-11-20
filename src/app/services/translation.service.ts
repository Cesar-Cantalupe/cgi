import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';

export interface TranslationDictionary {
  [key: string]: string | TranslationDictionary;
}

@Injectable({
  providedIn: 'root'
})
export class TranslationService {
  private currentLang = new BehaviorSubject<string>('en');
  private translations = new BehaviorSubject<TranslationDictionary | null>(null);
  private translationsCache: { [lang: string]: TranslationDictionary } = {};
  private readonly STORAGE_KEY = 'selected_language';
  private isInitialized = false;

  public translations$ = this.translations.asObservable();

  constructor(private http: HttpClient) {
    this.initializeLanguage();
  }

  private initializeLanguage(): void {
    const savedLang = localStorage.getItem(this.STORAGE_KEY);
    const browserLang = navigator.language;
    const browserLangShort = browserLang.split('-')[0];
    const defaultLang = 'en';
    
    let langToUse = defaultLang;
    
    if (savedLang && this.isSupportedLanguage(savedLang)) {
      langToUse = savedLang;
    } else if (this.isSupportedLanguage(browserLangShort)) {
      langToUse = browserLangShort;
    }
    
    this.loadTranslations(langToUse).then(() => {
      this.isInitialized = true;
    });
  }

  private async loadTranslations(lang: string): Promise<void> {
    if (this.translationsCache[lang]) {
      this.translations.next(this.translationsCache[lang]);
      this.currentLang.next(lang);
      return;
    }

    try {
      const translations = await this.http.get<TranslationDictionary>(
        `/assets/i18n/${lang}.json`
      ).pipe(
        tap(translations => {
          this.translationsCache[lang] = translations;
          this.translations.next(translations);
          this.currentLang.next(lang);
        }),
        catchError(error => {
          if (lang !== 'en') {
            return this.loadTranslations('en');
          }
          return of({});
        })
      ).toPromise();

    } catch (error) {
      console.error('Error cargando traducciones:', error);
    }
  }

  private isSupportedLanguage(lang: string): boolean {
    const supportedLangs = ['en', 'es', 'fr', 'de', 'ca', 'el'];
    return supportedLangs.includes(lang);
  }

  setLanguage(lang: string): void {
    if (this.isSupportedLanguage(lang)) {
      localStorage.setItem(this.STORAGE_KEY, lang);
      this.loadTranslations(lang);
      
      setTimeout(() => {
        window.location.reload();
      }, 100);
    }
  }

  getCurrentLang(): string {
    return this.currentLang.value;
  }

  getCurrentLangObservable(): Observable<string> {
    return this.currentLang.asObservable();
  }

  instant(key: string): string {
    const currentTranslations = this.translations.value;
    const lang = this.currentLang.value;
    
    if (!currentTranslations) {
      return key;
    }

    const translation = this.getNestedTranslation(key, currentTranslations);
    return translation || key;
  }

  private getNestedTranslation(key: string, translations: TranslationDictionary): string {
    if (!translations) {
      return '';
    }

    const keys = key.split('.');
    let current: string | TranslationDictionary = translations;

    for (const k of keys) {
      if (typeof current === 'object' && current[k] !== undefined) {
        current = current[k];
      } else {
        return '';
      }
    }

    return typeof current === 'string' ? current : '';
  }

  waitForTranslations(): Promise<void> {
    return new Promise((resolve) => {
      if (this.isInitialized) {
        resolve();
      } else {
        const sub = this.translations$.subscribe(translations => {
          if (translations) {
            sub.unsubscribe();
            resolve();
          }
        });
      }
    });
  }
}