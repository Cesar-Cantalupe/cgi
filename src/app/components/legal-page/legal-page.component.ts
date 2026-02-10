import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-legal-page',
  templateUrl: './legal-page.component.html',
  styleUrls: ['./legal-page.component.css']
})
export class LegalPageComponent implements OnInit {
  pageType: string = '';
  
  constructor(private route: ActivatedRoute) {}
  
  ngOnInit(): void {
    this.route.params.subscribe(params => {
      this.pageType = params['type'] || '';
    });
  }
  
  getTitle(): string {
    const titles: { [key: string]: string } = {
      'terms': 'LEGAL.TERMS_TITLE',
      'privacy': 'LEGAL.PRIVACY_TITLE',
      'cookies': 'LEGAL.COOKIES_TITLE',
      'legal-notice': 'LEGAL.LEGAL_NOTICE_TITLE'
    };
    return titles[this.pageType] || 'LEGAL.DEFAULT_TITLE';
  }
}
