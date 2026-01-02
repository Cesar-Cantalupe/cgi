import { Component, Input, Output, EventEmitter, OnDestroy, OnInit, ChangeDetectorRef } from '@angular/core';
import { ChatbotStateService } from '../../../services/chatbot/core/chatbot-state.service';
import { ChatbotService } from '../../../services/chatbot/chatbot.service';
import { TranslationService } from '../../../services/translation.service';
import { ChatMessage } from '../../../services/chatbot/interfaces/chat-message.interface';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-chatbot-controls',
  templateUrl: './chatbot-controls.component.html',
  styleUrls: ['./chatbot-controls.component.css']
})
export class ChatbotControlsComponent implements OnInit, OnDestroy {
  @Input() showRegenerate: boolean = false;
  @Input() showStop: boolean = false;
  @Input() targetMessage: ChatMessage | null = null;
  @Input() isProcessing: boolean = false;
  
  @Output() regenerate = new EventEmitter<ChatMessage>();
  @Output() stop = new EventEmitter<{questionType?: 'user' | 'predefined'}>();
  
  private isStreamingSubscription!: Subscription;
  private processingSubscription!: Subscription;
  private messagesSubscription!: Subscription;
  private lastStopTime: number = 0;
  private readonly STOP_COOLDOWN_MS = 1000;
  
  isStreamingActive: boolean = false;
  
  regenerateTooltipText: string = '';
  stopTooltipText: string = '';
  regenerateButtonText: string = '';
  stopButtonText: string = '';
  
  constructor(
    private state: ChatbotStateService,
    private chatbotService: ChatbotService,
    private translation: TranslationService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.loadTranslations();
    
    // Suscribirse a cambios en el estado de streaming
    this.isStreamingSubscription = this.state.currentStreamingMessage$.subscribe(
      (streamingMessage) => {
        const wasActive = this.isStreamingActive;
        this.isStreamingActive = !!streamingMessage?.isStreaming;
        
        if (wasActive !== this.isStreamingActive) {
          console.log('🔄 ChatbotControls: Estado streaming cambiado:', this.isStreamingActive);
          this.cdr.detectChanges();
        }
      }
    );

    // Suscribirse a cambios en el estado de procesamiento
    this.processingSubscription = this.state.isProcessing$.subscribe(
      (processing) => {
        const wasProcessing = this.isProcessing;
        this.isProcessing = processing;
        
        if (wasProcessing !== this.isProcessing) {
          console.log('🔄 ChatbotControls: Estado procesamiento cambiado:', this.isProcessing);
          this.cdr.detectChanges();
        }
      }
    );
    
    // Suscribirse a cambios en los mensajes para detectar streaming
    this.messagesSubscription = this.state.messages$.subscribe(
      (messages) => {
        // Verificar si hay mensajes de streaming
        const hasStreamingMessages = messages.some(m => 
          (m.sender === 'bot' || !m.isUser) && 
          m.isStreaming === true
        );
        
        if (hasStreamingMessages !== this.isStreamingActive) {
          console.log('📥 ChatbotControls: Mensajes actualizados, streaming detectado:', hasStreamingMessages);
          this.isStreamingActive = hasStreamingMessages;
          this.cdr.detectChanges();
        }
      }
    );
    
    this.translation.getCurrentLangObservable().subscribe(() => {
      this.loadTranslations();
      this.cdr.detectChanges();
    });
  }
  
  private loadTranslations(): void {
    this.regenerateTooltipText = this.translation.instant('CONTROLS.REGENERATE_TOOLTIP');
    this.stopTooltipText = this.translation.instant('CONTROLS.STOP_TOOLTIP');
    this.regenerateButtonText = this.translation.instant('CONTROLS.REGENERATE');
    this.stopButtonText = this.translation.instant('CONTROLS.STOP');
  }

  onRegenerate(): void {
    console.log('🔄 ChatbotControls: onRegenerate llamado');
    
    if (!this.targetMessage) {
      const lastBotMessage = this.state.getLastCompleteBotMessage();
      if (lastBotMessage) {
        this.triggerRegeneration(lastBotMessage);
      }
    } else {
      this.triggerRegeneration(this.targetMessage);
    }
  }

  onStop(): void {
    console.log('🛑 ChatbotControls: onStop llamado');
    
    const now = Date.now();
    const timeSinceLastStop = now - this.lastStopTime;
    
    if (timeSinceLastStop < this.STOP_COOLDOWN_MS) {
      console.log('⏳ ChatbotControls: Cooldown activo, ignorando stop');
      return;
    }
    
    this.lastStopTime = now;
    
    const questionType = this.getCurrentQuestionType();
    const stopEvent = {
      questionType: questionType
    };
    
    console.log('📤 ChatbotControls: Emitiendo evento stop:', stopEvent);
    this.stop.emit(stopEvent);
    
    // Forzar actualización de UI
    this.cdr.detectChanges();
  }

  private triggerRegeneration(message: ChatMessage): void {
    if (!message.id) {
      console.warn('❌ ChatbotControls: No se puede regenerar, mensaje sin ID');
      return;
    }
    
    if (this.chatbotService.canSendMessages()) {
      console.log('✅ ChatbotControls: Emitiendo regenerate para:', message.id);
      this.regenerate.emit(message);
    } else {
      console.warn('❌ ChatbotControls: No se puede regenerar, chatbot ocupado');
    }
  }

  private getCurrentQuestionType(): 'user' | 'predefined' | undefined {
    console.log('🔍 ChatbotControls: Determinando tipo de pregunta');
    
    if (this.targetMessage && (this.targetMessage as any)._originalQuestionType) {
      console.log('📋 Usando _originalQuestionType:', (this.targetMessage as any)._originalQuestionType);
      return (this.targetMessage as any)._originalQuestionType;
    }
    
    if (this.targetMessage && (this.targetMessage.sender === 'bot' || !this.targetMessage.isUser)) {
      const lastUserMessage = this.state.getLastUserMessage();
      
      if (lastUserMessage) {
        if ((lastUserMessage as any)._isPredefinedQuestion) {
          console.log('🔍 Tipo determinado desde último mensaje usuario (predefined)');
          return 'predefined';
        } else {
          console.log('🔍 Tipo determinado desde último mensaje usuario (user)');
          return 'user';
        }
      }
    }
    
    if (this.targetMessage && (this.targetMessage.sender === 'user' || this.targetMessage.isUser)) {
      const isPredefined = (this.targetMessage as any)._isPredefinedQuestion;
      console.log('🔍 Tipo determinado desde mensaje actual:', isPredefined ? 'predefined' : 'user');
      return isPredefined ? 'predefined' : 'user';
    }
    
    const allMessages = this.state.messages;
    const hasPredefinedMessages = allMessages.some(m => 
      (m as any)._isPredefinedQuestion || (m as any)._originalQuestionType === 'predefined'
    );
    
    const currentMessageContent = this.getMessageContent(this.targetMessage);
    const looksLikePredefinedQuestion = currentMessageContent.includes('?') && 
                                       currentMessageContent.length < 100;
    
    if (hasPredefinedMessages && looksLikePredefinedQuestion) {
      console.log('🔍 Tipo determinado por análisis de contenido (predefined)');
      return 'predefined';
    }
    
    console.log('🔍 Tipo determinado por defecto (user)');
    return 'user';
  }

  shouldShowRegenerate(): boolean {
    if (!this.targetMessage) {
      return false;
    }
    
    const isBotMessage = this.isBotMessage();
    const isComplete = !this.targetMessage.isStreaming;
    const hasContent = !!this.getMessageContent(this.targetMessage);
    const isNotProcessing = !this.isProcessing;
    const isNotError = !this.getMessageContent(this.targetMessage).includes('ERRORS.');
    const canRegenerate = this.showRegenerate;
    
    const result = isBotMessage && isComplete && hasContent && isNotProcessing && isNotError && canRegenerate;
    
    if (result) {
      console.log('🔄 ChatbotControls: shouldShowRegenerate = TRUE para:', this.targetMessage.id);
    }
    
    return result;
  }

   shouldShowStop(): boolean {
  console.log('🛑 ChatbotControls: shouldShowStop evaluando', {
    showStopInput: this.showStop,
    targetMessage: this.targetMessage?.id,
    targetMessageIsStreaming: this.targetMessage?.isStreaming,
    isStreamingActive: this.isStreamingActive,
    isProcessing: this.isProcessing
  });
  
  // PRIORIDAD 1: Si el input showStop es true, mostrar siempre
  if (this.showStop === true) {
    console.log('✅ ChatbotControls: Mostrando STOP porque showStop input es TRUE');
    return true;
  }
  
  // PRIORIDAD 2: Si el mensaje objetivo está en streaming
  if (this.targetMessage && this.targetMessage.isStreaming === true) {
    console.log('✅ ChatbotControls: Mostrando STOP porque targetMessage.isStreaming es TRUE');
    return true;
  }
  
  // PRIORIDAD 3: Si hay streaming activo en el estado general
  if (this.isStreamingActive === true) {
    console.log('✅ ChatbotControls: Mostrando STOP porque isStreamingActive es TRUE');
    return true;
  }
  
  // PRIORIDAD 4: Si hay procesamiento en curso
  if (this.isProcessing === true) {
    console.log('✅ ChatbotControls: Mostrando STOP porque isProcessing es TRUE');
    return true;
  }
  
  console.log('❌ ChatbotControls: NO mostrando STOP');
  return false;
}

  private getMessageContent(message: ChatMessage | null): string {
    if (!message) return '';
    return message.content || message.text || '';
  }

  private isBotMessage(): boolean {
    if (!this.targetMessage) return false;
    return this.targetMessage.sender === 'bot' || !this.targetMessage.isUser;
  }

  private isUserMessage(): boolean {
    if (!this.targetMessage) return false;
    return this.targetMessage.sender === 'user' || !!this.targetMessage.isUser;
  }

  get messageContent(): string {
    return this.getMessageContent(this.targetMessage);
  }

  get canShowRegenerate(): boolean {
    return this.shouldShowRegenerate();
  }

  get canShowStop(): boolean {
    return this.shouldShowStop();
  }

  getDebugInfo() {
    return {
      targetMessageId: this.targetMessage?.id,
      targetMessageIsStreaming: this.targetMessage?.isStreaming,
      showRegenerate: this.showRegenerate,
      showStop: this.showStop,
      isProcessing: this.isProcessing,
      isStreamingActive: this.isStreamingActive,
      canSendMessages: this.chatbotService.canSendMessages(),
      stateMessagesCount: this.state.messages.length,
      lastBotMessage: this.state.getLastCompleteBotMessage()?.id,
      lastUserMessage: this.state.getLastUserMessage()?.id,
      shouldShowRegenerateResult: this.shouldShowRegenerate(),
      shouldShowStopResult: this.shouldShowStop()
    };
  }

  ngOnDestroy(): void {
    if (this.isStreamingSubscription) {
      this.isStreamingSubscription.unsubscribe();
    }
    
    if (this.processingSubscription) {
      this.processingSubscription.unsubscribe();
    }
    
    if (this.messagesSubscription) {
      this.messagesSubscription.unsubscribe();
    }
  }
}