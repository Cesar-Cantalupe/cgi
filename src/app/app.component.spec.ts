import { TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { AppComponent } from './app.component';
import { AuthService } from './services/auth.service';
import { TranslationService } from './services/translation.service';

// Mocks para los servicios
class MockAuthService {
  isAuthenticated$ = {
    pipe: () => ({ subscribe: (callback: any) => callback(false) })
  };
}

class MockTranslationService {
  waitForTranslations = () => Promise.resolve();
}

describe('AppComponent', () => {
  beforeEach(() => TestBed.configureTestingModule({
    imports: [RouterTestingModule],
    declarations: [AppComponent],
    providers: [
      { provide: AuthService, useClass: MockAuthService },
      { provide: TranslationService, useClass: MockTranslationService }
    ]
  }));

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should have isChatRoute property', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app.isChatRoute).toBeDefined();
    expect(typeof app.isChatRoute).toBe('boolean');
  });

  it('should have translationsReady property', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app.translationsReady).toBeDefined();
    expect(typeof app.translationsReady).toBe('boolean');
  });

  it('should initialize with correct default values', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app.isChatRoute).toBe(false);
    expect(app.translationsReady).toBe(false);
  });
});