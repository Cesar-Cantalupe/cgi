import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import {
  I18N_NAMESPACES,
  I18nLocale,
  I18nNamespace,
} from '../constants/i18n-admin.constants';
import { SupabaseService } from './supabase.service';
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
  /** true si el valor mostrado viene ya de Supabase */
  storedInSupabase: boolean;
}

interface SupabaseEntry {
  id?: string;
  value: string;
}

@Injectable({
  providedIn: 'root'
})
export class I18nAdminService {
  private readonly BATCH_SIZE = 100;
  private templateCache: TranslationDictionary | null = null;

  constructor(
    private supabaseService: SupabaseService,
    private http: HttpClient
  ) {}

  /**
   * Carga textos para editar: base desde assets/i18n/{locale}.json,
   * sobrescrito por lo guardado en Supabase (si existe).
   */
  async loadEntriesForLocale(locale: I18nLocale): Promise<EditableTranslation[]> {
    const localEntries = await this.loadLocalEntries(locale);
    const supabaseMap = await this.fetchSupabaseMap(locale);

    const entries: EditableTranslation[] = localEntries.map((local) => {
      const mapKey = `${local.namespace}.${local.key}`;
      const remote = supabaseMap.get(mapKey);
      const value = remote?.value ?? local.value;

      return {
        namespace: local.namespace,
        key: local.key,
        locale,
        id: remote?.id,
        value,
        originalValue: value,
        dirty: false,
        storedInSupabase: !!remote,
      };
    });

    // Claves solo en Supabase (p. ej. editadas antes)
    for (const [mapKey, remote] of supabaseMap) {
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
        storedInSupabase: true,
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

    const payload = dirty.map(({ namespace, key, locale, value }) => ({
      namespace,
      key,
      locale,
      value,
    }));

    let saved = 0;
    for (let i = 0; i < payload.length; i += this.BATCH_SIZE) {
      const chunk = payload.slice(i, i + this.BATCH_SIZE);
      const { error } = await this.supabaseService.supabase
        .from('i18n_translations')
        .upsert(chunk, { onConflict: 'namespace,key,locale' });

      if (error) {
        throw error;
      }
      saved += chunk.length;
    }

    return saved;
  }

  private async fetchSupabaseMap(
    locale: I18nLocale
  ): Promise<Map<string, SupabaseEntry>> {
    const map = new Map<string, SupabaseEntry>();

    try {
      const { data, error } = await this.supabaseService.supabase
        .from('i18n_translations')
        .select('id, namespace, key, value')
        .eq('locale', locale);

      if (error) {
        console.warn('[i18n-admin] Supabase no disponible, solo JSON local:', error.message);
        return map;
      }

      for (const row of data ?? []) {
        map.set(`${row.namespace}.${row.key}`, { id: row.id, value: row.value });
      }
    } catch (err) {
      console.warn('[i18n-admin] Error leyendo Supabase:', err);
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
