//auth.service.ts

import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export interface User {
  email: string;
  name?: string;
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
    // Check if user is already logged in (from localStorage)
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) {
      const user = JSON.parse(savedUser);
      this.currentUserSubject.next(user);
      this.isAuthenticatedSubject.next(true);
    }
  }

  login(email: string, password: string): boolean {
    // Check credentials - hardcoded for demo
    if (email === 'test@gmail.com' && password === '20432043') {
      const user: User = {
        email: email,
        name: 'Usuario Test'
      };
      
      // Save to localStorage
      localStorage.setItem('currentUser', JSON.stringify(user));
      
      // Update state
      this.currentUserSubject.next(user);
      this.isAuthenticatedSubject.next(true);
      
      return true;
    }
    
    return false;
  }

  logout(): void {
    // Remove from localStorage
    localStorage.removeItem('currentUser');
    
    // Update state
    this.currentUserSubject.next(null);
    this.isAuthenticatedSubject.next(false);
  }

  getCurrentUser(): User | null {
    return this.currentUserSubject.value;
  }

  isAuthenticated(): boolean {
    return this.isAuthenticatedSubject.value;
  }
}
