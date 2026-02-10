import { Component, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css']
})
export class HomeComponent implements OnInit {
  showAgreementPopup: boolean = false;
  private medicalFilters: any = {};

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private sanitizer: DomSanitizer
  ) {}

  ngOnInit() {
    this.route.queryParams.subscribe(params => {
      this.medicalFilters = {};
      
      if (params['tumor_type'] || params['gene'] || params['treatment_drug']) {
        this.medicalFilters = { ...params };
      }
    });
  }

  startChatbot() {
    this.router.navigate(['/chat'], { 
      queryParams: this.medicalFilters 
    });
  }

  openAgreementPopup() {
    this.showAgreementPopup = true;
  }

  closeAgreementPopup() {
    this.showAgreementPopup = false;
  }

  getAgreementTextWithLink(agreementText: string): SafeHtml {
    const linkedText = agreementText.replace(
      /CGI-Clinics/g,
      '<a href="https://www.cgiclinics.eu/" target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:text-blue-800 underline">CGI-Clinics</a>'
    );
    return this.sanitizer.bypassSecurityTrustHtml(linkedText + ' ');
  }
}