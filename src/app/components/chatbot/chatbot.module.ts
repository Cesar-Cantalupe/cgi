import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SharedModule } from '../../shared/shared.module';
import { ChatbotComponent } from './chatbot.component';
import { ChatbotHeaderComponent } from './chatbot-header/chatbot-header.component';
import { ChatbotSidebarComponent } from './chatbot-sidebar/chatbot-sidebar.component';
import { ChatbotMessagesComponent } from './chatbot-messages/chatbot-messages.component';
import { ChatbotWelcomeComponent } from './chatbot-welcome/chatbot-welcome.component';
import { ChatbotInputComponent } from './chatbot-input/chatbot-input.component';

@NgModule({
  declarations: [
    ChatbotComponent,
    ChatbotHeaderComponent,
    ChatbotSidebarComponent,
    ChatbotMessagesComponent,
    ChatbotWelcomeComponent,
    ChatbotInputComponent
    
  ],
  imports: [
    CommonModule,
    FormsModule,
    SharedModule 
  ],
  exports: [
    ChatbotComponent
  ]
})
export class ChatbotModule { }