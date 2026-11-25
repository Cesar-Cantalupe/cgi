import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';

const LEGAL_FILES: Record<string, string> = {
  terms: 'assets/legal/terms.html',
  privacy: 'assets/legal/privacy.html',
  cookies: 'assets/legal/cookies.html',
  'legal-notice': 'assets/legal/legal-notice.html'
};

@Component({
  selector: 'app-legal-page',
  templateUrl: './legal-page.component.html',
  styleUrls: ['./legal-page.component.css']
})
export class LegalPageComponent implements OnInit, OnDestroy {
  pageType = '';
  contentHtml = '';
  loading = true;
  loadError = false;

  private routeSub?: Subscription;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private http: HttpClient
  ) {}

  ngOnInit(): void {
    this.routeSub = this.route.params.subscribe(params => {
      this.pageType = params['type'] || '';
      this.loadContent(this.pageType);
    });
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
  }

  getTitle(): string {
    const titles: Record<string, string> = {
      terms: 'LEGAL.TERMS_TITLE',
      privacy: 'LEGAL.PRIVACY_TITLE',
      cookies: 'LEGAL.COOKIES_TITLE',
      'legal-notice': 'LEGAL.LEGAL_NOTICE_TITLE'
    };
    return titles[this.pageType] || 'LEGAL.DEFAULT_TITLE';
  }

  @HostListener('click', ['$event'])
  onContentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    const anchor = target?.closest('a') as HTMLAnchorElement | null;
    if (!anchor) {
      return;
    }
    const href = anchor.getAttribute('href');
    if (href?.startsWith('/legal/')) {
      event.preventDefault();
      this.router.navigateByUrl(href);
    }
  }

  private loadContent(type: string): void {
    const file = LEGAL_FILES[type];
    this.loading = true;
    this.loadError = false;
    this.contentHtml = '';

    if (!file) {
      this.loading = false;
      this.loadError = true;
      return;
    }

    this.http.get(file, { responseType: 'text' }).subscribe({
      next: html => {
        this.contentHtml = this.decorateContent(html);
        this.loading = false;
      },
      error: () => {
        this.loadError = true;
        this.loading = false;
      }
    });
  }

  private decorateContent(html: string): string {
    return html.replace(
      /<p>(Date of last update:[\s\S]*?)<\/p>/i,
      '<p class="legal-updated">$1</p>'
    );
  }
}
