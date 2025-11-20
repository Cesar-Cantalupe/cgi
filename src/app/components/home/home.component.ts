//home.component.ts
import { Component } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html'
})
export class HomeComponent {
  showAgreementPopup = false;

  constructor(private router: Router) { }

  startChatbot(): void {
    this.router.navigate(['/chat']);
  }

  openAgreementPopup(): void {
    this.showAgreementPopup = true;
  }

  closeAgreementPopup(): void {
    this.showAgreementPopup = false;
  }
}
