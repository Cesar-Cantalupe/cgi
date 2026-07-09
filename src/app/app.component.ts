import { Component, OnInit } from '@angular/core';
import { AuthService } from './services/auth.service';
import { Router, NavigationEnd, Event } from '@angular/router';
import { TranslationService } from './services/translation.service';
import { filter } from 'rxjs/operators';

@Component({
  selector: 'app-root',
  template: `
    <div *ngIf="!translationsReady" class="min-h-screen flex items-center justify-center bg-white">
      <div class="text-center">
        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
        <p class="mt-4 text-gray-600">{{ 'LOADING_TRANSLATIONS' | translate }}</p>
      </div>
    </div>

    <div *ngIf="translationsReady && isAdminRoute" class="min-h-screen">
      <router-outlet></router-outlet>
    </div>

    <div *ngIf="translationsReady && !isAdminRoute">
      <div *ngIf="!isLoginRoute; else loginLayout"
          class="h-screen bg-white flex flex-col"
          [class.overflow-hidden]="isChatRoute">
        
        <app-header></app-header>
        
        <main class="flex-grow"
              [class.overflow-hidden]="isChatRoute">
          <router-outlet></router-outlet>
        </main>
        
        <app-footer *ngIf="!isChatRoute"></app-footer>
        
      </div>

      <ng-template #loginLayout>
        <div class="min-h-screen bg-gradient-to-br from-blue-50 to-pink-50 flex flex-col" [attr.data-route-key]="currentRoute">
          
          <app-header></app-header>
          
          <main [class]="'flex-grow flex flex-col justify-center items-center px-4 ' + currentRoute">
            <div class="w-full max-w-md">
              <router-outlet></router-outlet>
            </div>
          </main>
          
          <app-footer></app-footer>
          
        </div>
      </ng-template>
    </div>
  `,
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit {
  translationsReady = false;
  currentRoute: string = '';

  get isChatRoute(): boolean {
    return this.router.url.includes('/chat') || window.location.pathname.includes('/chat');
  }

  get isLoginRoute(): boolean {
    return this.router.url === '/login' || window.location.pathname === '/login';
  }

  get isAdminRoute(): boolean {
    const path = this.router.url || window.location.pathname;
    return path.startsWith('/admin');
  }

  constructor(
    public authService: AuthService,
    private router: Router,
    private translationService: TranslationService
  ) {
    this.router.events
      .pipe(
        filter((event: Event): event is NavigationEnd => event instanceof NavigationEnd)
      )
      .subscribe((event: NavigationEnd) => {
        this.currentRoute = event.url;
        this.updateBodyClass();
      });
  }

  private updateBodyClass() {
    if (this.isChatRoute) {
      document.body.classList.add('chat-route');
    } else {
      document.body.classList.remove('chat-route');
    }
  }

  async ngOnInit() {
    if (this.isAdminRoute) {
      this.translationsReady = true;
      return;
    }
    await this.translationService.waitForTranslations();
    this.translationsReady = true;
    this.updateBodyClass();
  }

  getLoginMainClasses(): string {
    return 'flex-grow flex flex-col justify-center items-center px-4';
  }

}