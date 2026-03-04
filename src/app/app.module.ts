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
import { AuthService } from './services/auth.service';
import { AuthGuard } from './guards/auth.guard';
import { TranslationService } from './services/translation.service';
import { LegalPageComponent } from './components/legal-page/legal-page.component';


// ✅ SOLO este servicio necesitas proveer aquí
import { ChatbotService } from './services/chatbot/chatbot.service';

@NgModule({
  declarations: [
    AppComponent,
    HeaderComponent,
    FooterComponent,
    HomeComponent,
    LoginFormComponent,
    LegalPageComponent
  ],
  imports: [
    BrowserModule,
    HttpClientModule,
    FormsModule,
    AppRoutingModule,
    SharedModule,
    ChatbotModule
  ],
  providers: [
    AuthService,
    AuthGuard,
    TranslationService,
    ChatbotService
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }