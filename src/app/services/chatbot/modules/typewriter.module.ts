import { Injectable, NgZone, OnDestroy } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';

export interface TypewriterAnimation {
  messageId: string;
  subject: BehaviorSubject<string>;
  fullText: string;
  currentText: string;
  isComplete: boolean;
  timeoutId?: number;
}

@Injectable({ providedIn: 'root' })
export class TypewriterModule implements OnDestroy {
  private animations = new Map<string, TypewriterAnimation>();
  private destroyed = new Subject<void>();
  
  private readonly DEFAULT_TYPING_SPEED = 20;
  private readonly DEFAULT_INITIAL_DELAY = 100;
  private readonly CHARS_PER_BATCH = 2;

  constructor(private ngZone: NgZone) {}

  // ============ API PÚBLICA SIMPLIFICADA ============

  startAnimation(
    messageId: string, 
    fullText: string, 
    speed: number = this.DEFAULT_TYPING_SPEED,
    initialDelay: number = this.DEFAULT_INITIAL_DELAY
  ): BehaviorSubject<string> {
    
    this.stopAnimation(messageId);
    
    const subject = new BehaviorSubject<string>('');
    
    const animation: TypewriterAnimation = {
      messageId,
      subject,
      fullText,
      currentText: '',
      isComplete: false
    };
    
    this.animations.set(messageId, animation);
    
    const startAnimation = () => {
      if (!this.animations.has(messageId)) {
        return;
      }
      
      this.animateText(messageId, speed);
    };
    
    if (initialDelay <= 0) {
      requestAnimationFrame(() => this.ngZone.run(startAnimation));
    } else {
      animation.timeoutId = window.setTimeout(() => {
        requestAnimationFrame(() => this.ngZone.run(startAnimation));
      }, initialDelay);
    }
    
    return subject;
  }

  stopAnimation(messageId: string): void {
    const animation = this.animations.get(messageId);
    
    if (animation) {
      this.clearTimeout(animation);
      animation.subject.complete();
      this.animations.delete(messageId);
    }
  }

  stopAllAnimations(): void {
    this.animations.forEach((animation, messageId) => {
      this.clearTimeout(animation);
      animation.subject.complete();
    });
    
    this.animations.clear();
  }

  isAnimating(messageId: string): boolean {
    const animation = this.animations.get(messageId);
    return !!animation && !animation.isComplete;
  }

  getCurrentText(messageId: string): string {
    return this.animations.get(messageId)?.currentText || '';
  }

  accelerateAnimation(messageId: string, immediate: boolean = false): void {
    const animation = this.animations.get(messageId);
    
    if (!animation || animation.isComplete) {
      return;
    }
    
    this.clearTimeout(animation);
    
    if (immediate) {
      animation.currentText = animation.fullText;
      animation.isComplete = true;
      
      this.ngZone.run(() => {
        animation.subject.next(animation.fullText);
        animation.subject.complete();
      });
      
      this.animations.delete(messageId);
    } else {
      this.animateText(messageId, 5);
    }
  }

  // ============ MÉTODOS PRIVADOS OPTIMIZADOS ============

  private animateText(messageId: string, speed: number): void {
    const animation = this.animations.get(messageId);
    
    if (!animation || animation.isComplete) {
      return;
    }
    
    const { fullText, currentText } = animation;
    const charsRemaining = fullText.length - currentText.length;
    
    if (charsRemaining <= 0) {
      this.completeAnimation(messageId);
      return;
    }
    
    const charsToAdd = Math.min(this.CHARS_PER_BATCH, charsRemaining);
    const newText = fullText.substring(0, currentText.length + charsToAdd);
    
    animation.currentText = newText;
    
    this.ngZone.run(() => {
      animation.subject.next(newText);
    });
    
    if (newText.length < fullText.length) {
      const adjustedSpeed = this.adjustSpeed(speed, currentText.length, fullText.length);
      
      animation.timeoutId = window.setTimeout(() => {
        requestAnimationFrame(() => this.ngZone.run(() => 
          this.animateText(messageId, adjustedSpeed)
        ));
      }, adjustedSpeed);
    } else {
      this.completeAnimation(messageId);
    }
  }

  private completeAnimation(messageId: string): void {
    const animation = this.animations.get(messageId);
    
    if (!animation) {
      return;
    }
    
    animation.currentText = animation.fullText;
    animation.isComplete = true;
    this.clearTimeout(animation);
    
    this.ngZone.run(() => {
      animation.subject.next(animation.fullText);
      animation.subject.complete();
    });
    
    animation.timeoutId = window.setTimeout(() => {
      if (this.animations.has(messageId)) {
        this.animations.delete(messageId);
      }
    }, 100);
  }

  private adjustSpeed(baseSpeed: number, currentPos: number, totalLength: number): number {
    if (currentPos < 10) {
      return baseSpeed * 1.2;
    } else if (currentPos > totalLength - 10) {
      return baseSpeed * 1.1;
    } else {
      return baseSpeed;
    }
  }

  private clearTimeout(animation: TypewriterAnimation): void {
    if (animation.timeoutId) {
      window.clearTimeout(animation.timeoutId);
      animation.timeoutId = undefined;
    }
  }

  // ============ MÉTODOS DE CONFIGURACIÓN ============

  getDefaultSpeed(): number {
    return this.DEFAULT_TYPING_SPEED;
  }

  getDefaultInitialDelay(): number {
    return this.DEFAULT_INITIAL_DELAY;
  }

  // ============ DEBUG METHODS ============

  getActiveAnimations(): string[] {
    return Array.from(this.animations.keys());
  }

  getAnimationInfo(messageId: string): { currentText: string, isComplete: boolean } | null {
    const animation = this.animations.get(messageId);
    if (!animation) return null;
    
    return {
      currentText: animation.currentText,
      isComplete: animation.isComplete
    };
  }

  // ============ CLEANUP ============

  ngOnDestroy(): void {
    this.destroyed.next();
    this.destroyed.complete();
    this.stopAllAnimations();
  }
}