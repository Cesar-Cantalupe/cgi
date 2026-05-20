import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class SupabaseService {
  private client: SupabaseClient | null = null;

  get isConfigured(): boolean {
    return Boolean(environment.supabaseUrl && environment.supabaseAnonKey);
  }

  get supabase(): SupabaseClient {
    if (!this.isConfigured) {
      throw new Error(
        'Supabase no está configurado. Define supabaseUrl y supabaseAnonKey en environment.'
      );
    }
    if (!this.client) {
      this.client = createClient(environment.supabaseUrl, environment.supabaseAnonKey);
    }
    return this.client;
  }
}
