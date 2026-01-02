import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SafeHtmlPipe } from '../pipes/safe-html.pipe';
import { TranslatePipe } from '../pipes/translate.pipe';

@NgModule({
  declarations: [
    TranslatePipe,
    SafeHtmlPipe
  ],
  imports: [
    CommonModule
  ],
  exports: [
    TranslatePipe,
    SafeHtmlPipe  
  ]
})
export class SharedModule { }