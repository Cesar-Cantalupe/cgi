//auth.service.ts

import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export interface User {
  email: string;
  name?: string;
  type?: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private isAuthenticatedSubject = new BehaviorSubject<boolean>(false);
  private currentUserSubject = new BehaviorSubject<User | null>(null);

  public isAuthenticated$: Observable<boolean> = this.isAuthenticatedSubject.asObservable();
  public currentUser$: Observable<User | null> = this.currentUserSubject.asObservable();

  constructor() {
    
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) {
      const user = JSON.parse(savedUser);
      this.currentUserSubject.next(user);
      this.isAuthenticatedSubject.next(true);
    }
  }

  login(email: string, password: string): boolean {
    let user: User = { email: '' };

    if (email === 'internal@cgi.com' && password === 'juramento') {
      user = {
        email: email,
        name: 'CGI Internal',
        type: 'internal'
      };
    }

    if (email === 'external@cgi.com' && password === 'coraje') {
      user = {
        email: email,
        name: 'CGI External',
        type: 'external'
      };
    }

    if (user.email) {
      localStorage.setItem('currentUser', JSON.stringify(user));
            
      this.currentUserSubject.next(user);
      this.isAuthenticatedSubject.next(true);
      
      return true;
    }

    return false;
  }

  logout(): void {
    
    localStorage.removeItem('currentUser');
   
    this.currentUserSubject.next(null);
    this.isAuthenticatedSubject.next(false);
  }

  getCurrentUser(): User | null {
    return this.currentUserSubject.value;
  }

  getCurrentUserType(): string {
    return this.currentUserSubject.value?.type || 'unknown';
  }

  isAuthenticated(): boolean {
    return this.isAuthenticatedSubject.value;
  }
}
