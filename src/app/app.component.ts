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
        <p class="mt-4 text-gray-600">Cargando traducciones...</p>
      </div>
    </div>

    <div *ngIf="translationsReady">
      <div *ngIf="(authService.isAuthenticated$ | async) === true; else loginLayout"
          class="min-h-screen bg-white flex flex-col">
        
        <app-header *ngIf="!isChatRoute"></app-header>
        
        <main class="flex-grow">
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
  isChatRoute: boolean = false;
  translationsReady = false;
  currentRoute: string = '';

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
        this.isChatRoute = event.url.includes('/chat');
        this.currentRoute = event.url;
        
        setTimeout(() => {
          this.forceLayoutUpdate();
        }, 100);
      });
  }

  getLoginMainClasses(): string {
    return 'flex-grow flex flex-col justify-center items-center px-4';
  }

  private forceLayoutUpdate() {
    if (document && document.body) {
      document.body.offsetHeight;
    }
  }

  async ngOnInit() {
    await this.translationService.waitForTranslations();
    this.translationsReady = true;
  }
}