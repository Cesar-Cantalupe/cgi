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
import { SharedModule } from './shared/shared.module'; // ← Importar SharedModule
import { AuthService } from './services/auth.service';
import { AuthGuard } from './guards/auth.guard';
import { TranslationService } from './services/translation.service';

@NgModule({
  declarations: [
    AppComponent,
    HeaderComponent,
    FooterComponent,
    HomeComponent,
    LoginFormComponent
  ],
  imports: [
    BrowserModule,
    HttpClientModule,
    FormsModule,        
    AppRoutingModule,   
    ChatbotModule,
    SharedModule
  ],
  providers: [
    AuthService,        
    AuthGuard,
    TranslationService           
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }