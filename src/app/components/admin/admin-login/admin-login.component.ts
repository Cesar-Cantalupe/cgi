import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AdminAuthService } from '../../../services/admin-auth.service';

@Component({
  selector: 'app-admin-login',
  templateUrl: './admin-login.component.html',
})
export class AdminLoginComponent implements OnInit {
  email = '';
  password = '';
  isLoading = false;
  errorMessage = '';
  configError = false;

  constructor(
    private adminAuth: AdminAuthService,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    this.configError = !this.adminAuth.isConfigured;
    if (this.route.snapshot.queryParams['error'] === 'supabase') {
      this.configError = true;
    }
    if (this.adminAuth.isLoggedIn()) {
      this.router.navigate(['/admin']);
    }
  }

  async onSubmit(event: Event): Promise<void> {
    event.preventDefault();
    this.errorMessage = '';

    if (!this.email || !this.password) {
      this.errorMessage = 'Introduce email y contraseña.';
      return;
    }

    this.isLoading = true;
    try {
      await this.adminAuth.signIn(this.email, this.password);
      await this.router.navigate(['/admin']);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al iniciar sesión';
      this.errorMessage = message;
    } finally {
      this.isLoading = false;
    }
  }
}
