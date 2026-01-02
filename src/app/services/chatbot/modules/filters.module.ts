import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class FiltersModule {
  private urlFilters: any = {};
  private customFilters: any = {};
  
  setUrlFilters(filters: any): void {
    this.urlFilters = { ...filters };
  }
  
  setCustomFilters(filters: any): void {
    this.customFilters = { ...filters };
  }
  
  getCombinedFilters(additionalFilters?: any): any {
    const combined = {
      ...this.urlFilters,
      ...this.customFilters,
      ...(additionalFilters || {})
    };
    
    Object.keys(combined).forEach(key => {
      if (!combined[key] && combined[key] !== 0 && combined[key] !== false) {
        delete combined[key];
      }
    });
    
    return combined;
  }
  
  hasActiveFilters(): boolean {
    const combined = this.getCombinedFilters();
    return Object.keys(combined).length > 0;
  }
  
  getUrlFilters(): any {
    return { ...this.urlFilters };
  }
  
  clearFilters(): void {
    this.urlFilters = {};
    this.customFilters = {};
  }
}