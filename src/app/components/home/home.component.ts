import { Component, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';

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
    private route: ActivatedRoute
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
}