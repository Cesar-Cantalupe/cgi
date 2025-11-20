import { Component } from '@angular/core';
import { AuthService } from '../../services/auth.service';
import { Router } from '@angular/router';
import { TranslationService } from '../../services/translation.service';

@Component({
  selector: 'app-login-form',
  templateUrl: './login-form.component.html'
})
export class LoginFormComponent {
  email: string = '';
  password: string = '';
  rememberMe: boolean = false;
  isLoading: boolean = false;
  
  errorMessage: string = '';
  emailError: string = '';
  passwordError: string = '';

  constructor(
    private authService: AuthService,
    private router: Router,
    private translationService: TranslationService
  ) {}

  onLoginSubmit(event: Event) {
    event.preventDefault();
    
    this.clearAllErrors();
    
    if (!this.validateEmail() || !this.validatePassword()) {
      this.errorMessage = this.translationService.instant('LOGIN.ERROR_REQUIRED_FIELDS');
      return;
    }

    this.isLoading = true;
    
    setTimeout(() => {
      const isAuthenticated = this.authService.login(this.email, this.password);
      
      if (isAuthenticated) {
        this.errorMessage = '';
        this.router.navigate(['/home']);
      } else {
        this.errorMessage = this.translationService.instant('LOGIN.ERROR_INVALID_CREDENTIALS');
      }
      
      this.isLoading = false;
    }, 1000);
  }

  validateEmail(): boolean {
    if (!this.email) {
      this.emailError = this.translationService.instant('LOGIN.EMAIL_REQUIRED');
      return false;
    }
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(this.email)) {
      this.emailError = this.translationService.instant('LOGIN.EMAIL_INVALID');
      return false;
    }
    
    this.emailError = '';
    return true;
  }

  validatePassword(): boolean {
    if (!this.password) {
      this.passwordError = this.translationService.instant('LOGIN.PASSWORD_REQUIRED');
      return false;
    }
    
    if (this.password.length < 6) {
      this.passwordError = this.translationService.instant('LOGIN.PASSWORD_LENGTH');
      return false;
    }
    
    this.passwordError = '';
    return true;
  }

  clearError() {
    this.errorMessage = '';
    this.emailError = '';
    this.passwordError = '';
  }

  clearAllErrors() {
    this.errorMessage = '';
    this.emailError = '';
    this.passwordError = '';
  }
}