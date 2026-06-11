import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { collection, doc, getDocs, query, where, writeBatch } from 'firebase/firestore';
import { firstValueFrom } from 'rxjs';
import {
  I18N_NAMESPACES,
  I18nLocale,
  I18nNamespace,
} from '../constants/i18n-admin.constants';
import {
  I18N_TRANSLATIONS_COLLECTION,
  translationDocId,
} from '../utils/i18n-firestore.util';
import { FirebaseService } from './firebase.service';
import { TranslationDictionary } from './translation.service';

export interface I18nTranslationRow {
  id?: string;
  namespace: string;
  key: string;
  locale: string;
  value: string;
}

export interface EditableTranslation extends I18nTranslationRow {
  originalValue: string;
  dirty: boolean;
  /** true si el valor mostrado viene ya de Firestore */
  storedRemotely: boolean;
}

interface RemoteEntry {
  id: string;
  value: string;
}

@Injectable({
  providedIn: 'root'
})
export class I18nAdminService {
  private readonly BATCH_SIZE = 400;
  private templateCache: TranslationDictionary | null = null;

  constructor(
    private firebaseService: FirebaseService,
    private http: HttpClient
  ) {}

  /**
   * Carga textos para editar: base desde assets/i18n/{locale}.json,
   * sobrescrito por lo guardado en Firestore (si existe).
   */
  async loadEntriesForLocale(locale: I18nLocale): Promise<EditableTranslation[]> {
    const localEntries = await this.loadLocalEntries(locale);
    const remoteMap = await this.fetchRemoteMap(locale);

    const entries: EditableTranslation[] = localEntries.map((local) => {
      const mapKey = `${local.namespace}.${local.key}`;
      const remote = remoteMap.get(mapKey);
      const value = remote?.value ?? local.value;

      return {
        namespace: local.namespace,
        key: local.key,
        locale,
        id: remote?.id,
        value,
        originalValue: value,
        dirty: false,
        storedRemotely: !!remote,
      };
    });

    for (const [mapKey, remote] of remoteMap) {
      if (localEntries.some((l) => `${l.namespace}.${l.key}` === mapKey)) {
        continue;
      }
      const dotIndex = mapKey.indexOf('.');
      const namespace = mapKey.slice(0, dotIndex);
      const key = mapKey.slice(dotIndex + 1);
      entries.push({
        namespace,
        key,
        locale,
        id: remote.id,
        value: remote.value,
        originalValue: remote.value,
        dirty: false,
        storedRemotely: true,
      });
    }

    return entries.sort(
      (a, b) =>
        a.namespace.localeCompare(b.namespace) || a.key.localeCompare(b.key)
    );
  }

  async saveChanges(entries: EditableTranslation[]): Promise<number> {
    const dirty = entries.filter((e) => e.dirty && e.value !== e.originalValue);
    if (!dirty.length) {
      return 0;
    }

    const db = this.firebaseService.firestore;
    let saved = 0;

    for (let i = 0; i < dirty.length; i += this.BATCH_SIZE) {
      const chunk = dirty.slice(i, i + this.BATCH_SIZE);
      const batch = writeBatch(db);

      for (const entry of chunk) {
        const id = translationDocId(entry.namespace, entry.key, entry.locale);
        const ref = doc(db, I18N_TRANSLATIONS_COLLECTION, id);
        batch.set(ref, {
          namespace: entry.namespace,
          key: entry.key,
          locale: entry.locale,
          value: entry.value,
          updatedAt: new Date().toISOString(),
        });
      }

      await batch.commit();
      saved += chunk.length;
    }

    return saved;
  }

  private async fetchRemoteMap(locale: I18nLocale): Promise<Map<string, RemoteEntry>> {
    const map = new Map<string, RemoteEntry>();

    if (!this.firebaseService.isConfigured) {
      return map;
    }

    try {
      const q = query(
        collection(this.firebaseService.firestore, I18N_TRANSLATIONS_COLLECTION),
        where('locale', '==', locale)
      );
      const snapshot = await getDocs(q);

      for (const docSnap of snapshot.docs) {
        const data = docSnap.data();
        if (!data['namespace'] || !data['key'] || typeof data['value'] !== 'string') {
          continue;
        }
        map.set(`${data['namespace']}.${data['key']}`, {
          id: docSnap.id,
          value: data['value'],
        });
      }
    } catch (err) {
      console.warn('[i18n-admin] Error leyendo Firestore:', err);
    }

    return map;
  }

  private async loadLocalEntries(locale: I18nLocale): Promise<I18nTranslationRow[]> {
    const template = await this.getTemplateDictionary();
    const localeDict = await this.getLocaleDictionary(locale);
    const rows: I18nTranslationRow[] = [];

    for (const ns of I18N_NAMESPACES) {
      const templateSection = template[ns];
      if (!templateSection || typeof templateSection !== 'object') {
        continue;
      }

      const localeSection =
        localeDict[ns] && typeof localeDict[ns] === 'object'
          ? (localeDict[ns] as TranslationDictionary)
          : {};

      for (const key of Object.keys(templateSection as TranslationDictionary)) {
        const templateVal = (templateSection as TranslationDictionary)[key];
        if (typeof templateVal !== 'string') {
          continue;
        }

        const localeVal = localeSection[key];
        const value =
          typeof localeVal === 'string' ? localeVal : templateVal;

        rows.push({ namespace: ns, key, locale, value });
      }
    }

    return rows;
  }

  private async getTemplateDictionary(): Promise<TranslationDictionary> {
    if (!this.templateCache) {
      this.templateCache = await firstValueFrom(
        this.http.get<TranslationDictionary>('/assets/i18n/en.json')
      );
    }
    return this.templateCache;
  }

  private async getLocaleDictionary(locale: I18nLocale): Promise<TranslationDictionary> {
    try {
      return await firstValueFrom(
        this.http.get<TranslationDictionary>(`/assets/i18n/${locale}.json`)
      );
    } catch {
      return locale === 'en' ? {} : this.getTemplateDictionary();
    }
  }
}
