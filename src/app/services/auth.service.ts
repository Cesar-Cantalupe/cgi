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
    
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) {
      const user = JSON.parse(savedUser);
      this.currentUserSubject.next(user);
      this.isAuthenticatedSubject.next(true);
    }
  }

  login(email: string, password: string): boolean {
    /*
    if (email === 'test@gmail.com' && password === '20432043') {
      const user: User = {
        email: email,
        name: 'Usuario Test'
      };
            
      localStorage.setItem('currentUser', JSON.stringify(user));
            
      this.currentUserSubject.next(user);
      this.isAuthenticatedSubject.next(true);
      
      return true;
    }
    */

    if (email === 'test@cgi.com' && password === '20252026') {
      const user: User = {
        email: email,
        name: 'CGI Test'
      };
            
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

  isAuthenticated(): boolean {
    return this.isAuthenticatedSubject.value;
  }
}
