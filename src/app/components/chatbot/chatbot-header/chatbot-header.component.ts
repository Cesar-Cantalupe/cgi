import { Component, Input, Output, EventEmitter } from '@angular/core';

@Component({
  selector: 'app-chatbot-header',
  templateUrl: './chatbot-header.component.html'
})
export class ChatbotHeaderComponent {
  @Input() sidebarExpanded = false;
  @Output() toggleSidebar = new EventEmitter<void>();
}