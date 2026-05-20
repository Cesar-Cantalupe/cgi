import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import {
  I18N_LOCALE_LABELS,
  I18N_LOCALES,
  I18N_NAMESPACE_LABELS,
  I18N_NAMESPACES,
  I18nLocale,
  I18nNamespace,
} from '../../../constants/i18n-admin.constants';
import { AdminAuthService } from '../../../services/admin-auth.service';
import { EditableTranslation, I18nAdminService } from '../../../services/i18n-admin.service';

@Component({
  selector: 'app-i18n-admin',
  templateUrl: './i18n-admin.component.html',
})
export class I18nAdminComponent implements OnInit, OnDestroy {
  readonly locales = I18N_LOCALES;
  readonly localeLabels = I18N_LOCALE_LABELS;
  readonly namespaces = I18N_NAMESPACES;
  readonly namespaceLabels = I18N_NAMESPACE_LABELS;

  activeLocale: I18nLocale = 'en';
  activeNamespace: I18nNamespace = 'HEADER';
  searchQuery = '';

  entries: EditableTranslation[] = [];
  filteredEntries: EditableTranslation[] = [];

  isLoading = false;
  isSaving = false;
  statusMessage = '';
  statusType: 'success' | 'error' | 'info' = 'info';

  private beforeUnloadHandler = (e: BeforeUnloadEvent) => {
    if (this.dirtyCount > 0) {
      e.preventDefault();
      e.returnValue = '';
    }
  };

  constructor(
    private i18nAdmin: I18nAdminService,
    private adminAuth: AdminAuthService,
    private router: Router
  ) {}

  get dirtyCount(): number {
    return this.entries.filter((e) => e.dirty).length;
  }

  ngOnInit(): void {
    window.addEventListener('beforeunload', this.beforeUnloadHandler);
    this.loadLocale(this.activeLocale);
  }

  ngOnDestroy(): void {
    window.removeEventListener('beforeunload', this.beforeUnloadHandler);
  }

  async onLocaleChange(locale: I18nLocale): Promise<void> {
    if (locale === this.activeLocale) {
      return;
    }
    if (this.dirtyCount > 0) {
      const ok = confirm('Hay cambios sin guardar. ¿Cambiar de idioma y descartarlos?');
      if (!ok) {
        return;
      }
    }
    this.activeLocale = locale;
    await this.loadLocale(locale);
  }

  onNamespaceChange(ns: I18nNamespace): void {
    this.activeNamespace = ns;
    this.applyFilter();
  }

  async loadLocale(locale: I18nLocale): Promise<void> {
    this.isLoading = true;
    this.statusMessage = '';
    try {
      this.entries = await this.i18nAdmin.loadEntriesForLocale(locale);
      this.applyFilter();
      const fromSupabase = this.entries.filter((e) => e.storedInSupabase).length;
      this.setStatus(
        `Cargados ${this.entries.length} textos desde assets/i18n (${fromSupabase} ya en Supabase).`,
        'info'
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al cargar traducciones';
      this.setStatus(msg, 'error');
    } finally {
      this.isLoading = false;
    }
  }

  applyFilter(): void {
    const q = this.searchQuery.trim().toLowerCase();
    this.filteredEntries = this.entries.filter((e) => {
      if (e.namespace !== this.activeNamespace) {
        return false;
      }
      if (!q) {
        return true;
      }
      return (
        e.key.toLowerCase().includes(q) ||
        e.value.toLowerCase().includes(q)
      );
    });
  }

  onSearchChange(): void {
    this.applyFilter();
  }

  onValueChange(entry: EditableTranslation): void {
    entry.dirty = entry.value !== entry.originalValue;
  }

  resetEntry(entry: EditableTranslation): void {
    entry.value = entry.originalValue;
    entry.dirty = false;
  }

  dirtyInNamespace(ns: I18nNamespace): number {
    return this.entries.filter((e) => e.namespace === ns && e.dirty).length;
  }

  async saveAll(): Promise<void> {
    if (this.dirtyCount === 0) {
      this.setStatus('No hay cambios que guardar.', 'info');
      return;
    }

    this.isSaving = true;
    try {
      const saved = await this.i18nAdmin.saveChanges(this.entries);
      this.entries.forEach((e) => {
        if (e.dirty) {
          e.originalValue = e.value;
          e.dirty = false;
          e.storedInSupabase = true;
        }
      });
      this.setStatus(
        `Guardado en Supabase: ${saved} texto(s). La app usará estos valores al recargar.`,
        'success'
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al guardar';
      this.setStatus(msg, 'error');
    } finally {
      this.isSaving = false;
    }
  }

  async logout(): Promise<void> {
    if (this.dirtyCount > 0 && !confirm('Hay cambios sin guardar. ¿Salir igualmente?')) {
      return;
    }
    await this.adminAuth.signOut();
    await this.router.navigate(['/admin/login']);
  }

  fieldKey(entry: EditableTranslation): string {
    return `${entry.namespace}.${entry.key}`;
  }

  isLongText(entry: EditableTranslation): boolean {
    return entry.value.length > 80 || entry.value.includes('\n') || entry.value.includes('<');
  }

  private setStatus(message: string, type: 'success' | 'error' | 'info'): void {
    this.statusMessage = message;
    this.statusType = type;
  }
}
