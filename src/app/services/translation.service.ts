import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { BehaviorSubject, Observable, firstValueFrom, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { I18N_TRANSLATIONS_COLLECTION } from '../utils/i18n-firestore.util';
import { FirebaseService } from './firebase.service';

export interface TranslationDictionary {
  [key: string]: string | TranslationDictionary;
}

interface I18nRow {
  namespace: string;
  key: string;
  value: string;
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

  constructor(
    private http: HttpClient,
    private firebaseService: FirebaseService
  ) {
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
      let translations = await this.loadFromJson(lang);
      const remote = await this.loadFromFirestore(lang);
      if (remote) {
        translations = this.mergeTranslations(translations, remote);
      }
      this.translationsCache[lang] = translations;
      this.translations.next(translations);
      this.currentLang.next(lang);
    } catch (error) {
      console.error(this.getErrorMessage('TRANSLATION_LOAD_ERROR'), error);
      throw new Error(this.getErrorMessage('TRANSLATION_LOAD_ERROR'));
    }
  }

  private async loadFromJson(lang: string): Promise<TranslationDictionary> {
    try {
      return await firstValueFrom(
        this.http.get<TranslationDictionary>(`/assets/i18n/${lang}.json`).pipe(
          catchError(() => {
            if (lang !== 'en') {
              return this.http.get<TranslationDictionary>('/assets/i18n/en.json');
            }
            return of({});
          })
        )
      );
    } catch {
      if (lang !== 'en') {
        return this.loadFromJson('en');
      }
      return {};
    }
  }

  private async loadFromFirestore(lang: string): Promise<TranslationDictionary | null> {
    if (!this.firebaseService.isConfigured) {
      return null;
    }

    try {
      const q = query(
        collection(this.firebaseService.firestore, I18N_TRANSLATIONS_COLLECTION),
        where('locale', '==', lang)
      );
      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        return null;
      }

      const rows: I18nRow[] = [];
      for (const docSnap of snapshot.docs) {
        const data = docSnap.data();
        if (!data['namespace'] || !data['key'] || typeof data['value'] !== 'string') {
          continue;
        }
        rows.push({
          namespace: data['namespace'],
          key: data['key'],
          value: data['value'],
        });
      }

      return rows.length ? this.rowsToDictionary(rows) : null;
    } catch (err) {
      console.warn('[i18n] Error al cargar desde Firestore:', err);
      return null;
    }
  }

  private rowsToDictionary(rows: I18nRow[]): TranslationDictionary {
    const dict: TranslationDictionary = {};
    for (const row of rows) {
      if (!dict[row.namespace]) {
        dict[row.namespace] = {};
      }
      const section = dict[row.namespace] as TranslationDictionary;
      section[row.key] = row.value;
    }
    return dict;
  }

  private mergeTranslations(
    base: TranslationDictionary,
    overlay: TranslationDictionary
  ): TranslationDictionary {
    const merged: TranslationDictionary = { ...base };
    for (const [namespace, keys] of Object.entries(overlay)) {
      if (typeof keys !== 'object' || keys === null) {
        continue;
      }
      const baseSection = merged[namespace];
      merged[namespace] =
        typeof baseSection === 'object' && baseSection !== null
          ? { ...baseSection, ...keys }
          : { ...keys };
    }
    return merged;
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
      if (this.isInitialized && this.translations.value) {
        resolve();
      } else {
        const sub = this.translations$.subscribe(translations => {
          if (translations && Object.keys(translations).length > 0) {
            this.isInitialized = true;
            sub.unsubscribe();
            resolve();
          }
        });

        setTimeout(() => {
          if (!this.isInitialized) {
            console.error(this.getErrorMessage('TRANSLATION_TIMEOUT_ERROR'));
            sub.unsubscribe();
            resolve();
          }
        }, 5000);
      }
    });
  }

  private getErrorMessage(errorKey: string): string {
    const errorMessages: { [key: string]: string } = {
      'TRANSLATION_LOAD_ERROR': 'Error loading translations',
      'TRANSLATION_TIMEOUT_ERROR': 'Translation loading timeout'
    };
    return errorMessages[errorKey] || 'Unknown translation error';
  }
}
