import { Injectable } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { AdminAuthService } from '../services/admin-auth.service';

@Injectable({
  providedIn: 'root'
})
export class AdminGuard implements CanActivate {
  constructor(
    private adminAuth: AdminAuthService,
    private router: Router
  ) {}

  async canActivate(): Promise<boolean> {
    if (!this.adminAuth.isConfigured) {
      this.router.navigate(['/admin/login'], {
        queryParams: { error: 'supabase' },
      });
      return false;
    }

    const session = await this.adminAuth.refreshSession();
    if (session) {
      return true;
    }

    this.router.navigate(['/admin/login']);
    return false;
  }
}
