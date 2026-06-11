import { Injectable } from '@angular/core';
import { FirebaseApp, initializeApp } from 'firebase/app';
import { Auth, getAuth } from 'firebase/auth';
import { Firestore, getFirestore } from 'firebase/firestore';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class FirebaseService {
  private firebaseApp: FirebaseApp | null = null;
  private firebaseAuth: Auth | null = null;
  private firebaseDb: Firestore | null = null;

  get isConfigured(): boolean {
    return Boolean(
      environment.firebaseApiKey &&
      environment.firebaseAuthDomain &&
      environment.firebaseProjectId &&
      environment.firebaseAppId
    );
  }

  get app(): FirebaseApp {
    if (!this.isConfigured) {
      throw new Error(
        'Firebase no está configurado. Define las variables FIREBASE_* en .env.local y ejecuta npm run sync-env.'
      );
    }
    if (!this.firebaseApp) {
      this.firebaseApp = initializeApp({
        apiKey: environment.firebaseApiKey,
        authDomain: environment.firebaseAuthDomain,
        projectId: environment.firebaseProjectId,
        appId: environment.firebaseAppId,
        storageBucket: environment.firebaseStorageBucket || undefined,
        messagingSenderId: environment.firebaseMessagingSenderId || undefined,
      });
    }
    return this.firebaseApp;
  }

  get auth(): Auth {
    if (!this.firebaseAuth) {
      this.firebaseAuth = getAuth(this.app);
    }
    return this.firebaseAuth;
  }

  get firestore(): Firestore {
    if (!this.firebaseDb) {
      this.firebaseDb = getFirestore(this.app);
    }
    return this.firebaseDb;
  }
}
