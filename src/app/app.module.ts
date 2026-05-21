import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { HttpClientModule } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { AppComponent } from './app.component';
import { AppRoutingModule } from './app-routing.module';
import { HeaderComponent } from './components/header/header.component';
import { FooterComponent } from './components/footer/footer.component';
import { HomeComponent } from './components/home/home.component';
import { LoginFormComponent } from './components/login-form/login-form.component';
import { ChatbotModule } from './components/chatbot/chatbot.module';
import { SharedModule } from './shared/shared.module';
import { LegalPageComponent } from './components/legal-page/legal-page.component';
import { AdminLoginComponent } from './components/admin/admin-login/admin-login.component';
import { I18nAdminComponent } from './components/admin/i18n-admin/i18n-admin.component';
import { AdminGuard } from './guards/admin.guard';
import { AdminAuthService } from './services/admin-auth.service';
import { I18nAdminService } from './services/i18n-admin.service';

@NgModule({
  declarations: [
    AppComponent,
    HeaderComponent,
    FooterComponent,
    HomeComponent,
    LoginFormComponent,
    LegalPageComponent,
    AdminLoginComponent,
    I18nAdminComponent
  ],
  imports: [
    BrowserModule,
    HttpClientModule,
    FormsModule,
    AppRoutingModule,
    SharedModule,
    ChatbotModule
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }