import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { LoginFormComponent } from './components/login-form/login-form.component';
import { HomeComponent } from './components/home/home.component';
import { ChatbotComponent } from './components/chatbot/chatbot.component';
import { LegalPageComponent } from './components/legal-page/legal-page.component';
import { AuthGuard } from './guards/auth.guard';
import { AdminGuard } from './guards/admin.guard';
import { AdminLoginComponent } from './components/admin/admin-login/admin-login.component';
import { I18nAdminComponent } from './components/admin/i18n-admin/i18n-admin.component';

const routes: Routes = [
  { path: 'admin/login', component: AdminLoginComponent },
  { path: 'admin', component: I18nAdminComponent, canActivate: [AdminGuard] },
  // { path: '', component: ChatbotComponent, canActivate: [AuthGuard], pathMatch: 'full' },
  { path: '', component: HomeComponent, canActivate: [AuthGuard] },
  { path: 'login', component: LoginFormComponent },
  { path: 'home', component: HomeComponent, canActivate: [AuthGuard] },
  { path: 'chat', component: ChatbotComponent, canActivate: [AuthGuard] },
  { path: 'legal/:type', component: LegalPageComponent },
  { path: '**', redirectTo: '/chat' }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }