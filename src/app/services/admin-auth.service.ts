import { Injectable } from '@angular/core';
import { User, onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { BehaviorSubject } from 'rxjs';
import { FirebaseService } from './firebase.service';

@Injectable({
  providedIn: 'root'
})
export class AdminAuthService {
  private userSubject = new BehaviorSubject<User | null>(null);
  public user$ = this.userSubject.asObservable();

  constructor(private firebaseService: FirebaseService) {
    if (this.firebaseService.isConfigured) {
      onAuthStateChanged(this.firebaseService.auth, (user) => {
        this.userSubject.next(user);
      });
    }
  }

  get isConfigured(): boolean {
    return this.firebaseService.isConfigured;
  }

  async refreshSession(): Promise<User | null> {
    if (!this.isConfigured) {
      return null;
    }
    const user = this.firebaseService.auth.currentUser;
    this.userSubject.next(user);
    return user;
  }

  async signIn(email: string, password: string): Promise<void> {
    await signInWithEmailAndPassword(this.firebaseService.auth, email, password);
    await this.refreshSession();
  }

  async signOut(): Promise<void> {
    await signOut(this.firebaseService.auth);
    this.userSubject.next(null);
  }

  isLoggedIn(): boolean {
    return !!this.userSubject.value;
  }

  getUser(): User | null {
    return this.userSubject.value;
  }
}
