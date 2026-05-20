import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Session } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';

@Injectable({
  providedIn: 'root'
})
export class AdminAuthService {
  private sessionSubject = new BehaviorSubject<Session | null>(null);
  public session$ = this.sessionSubject.asObservable();

  constructor(private supabaseService: SupabaseService) {
    if (this.supabaseService.isConfigured) {
      this.supabaseService.supabase.auth.onAuthStateChange((_event, session) => {
        this.sessionSubject.next(session);
      });
      this.refreshSession();
    }
  }

  get isConfigured(): boolean {
    return this.supabaseService.isConfigured;
  }

  async refreshSession(): Promise<Session | null> {
    if (!this.isConfigured) {
      return null;
    }
    const { data } = await this.supabaseService.supabase.auth.getSession();
    this.sessionSubject.next(data.session);
    return data.session;
  }

  async signIn(email: string, password: string): Promise<void> {
    const { error } = await this.supabaseService.supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      throw error;
    }
    await this.refreshSession();
  }

  async signOut(): Promise<void> {
    await this.supabaseService.supabase.auth.signOut();
    this.sessionSubject.next(null);
  }

  isLoggedIn(): boolean {
    return !!this.sessionSubject.value;
  }

  getSession(): Session | null {
    return this.sessionSubject.value;
  }
}
