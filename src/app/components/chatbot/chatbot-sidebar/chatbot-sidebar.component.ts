// chatbot-sidebar.component.ts (optimizado)
import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Subject, combineLatest, takeUntil, debounceTime, distinctUntilChanged } from 'rxjs';
import { ChatbotService } from '../../../services/chatbot/chatbot.service';
import { TranslationService } from '../../../services/translation.service';
import { SuggestionsService } from '../../../services/suggestions.service';
import { Conversation } from '../../../services/chatbot/interfaces/conversation.interface';
import { ConversationService } from '../../../services/chatbot/core/conversation.service';

@Component({
  selector: 'app-chatbot-sidebar',
  templateUrl: './chatbot-sidebar.component.html'
})
export class ChatbotSidebarComponent implements OnInit, OnDestroy {
  @Input() sidebarExpanded = true;
  @Input() healthProfileEnabled = false;
  
  @Output() toggleSidebar = new EventEmitter<void>();
  @Output() clearHistory = new EventEmitter<void>();
  @Output() healthProfileToggled = new EventEmitter<boolean>();
  @Output() suggestedQuestion = new EventEmitter<string>();
  @Output() newChat = new EventEmitter<void>();
  @Output() conversationSelected = new EventEmitter<string>();

  // Estado del sidebar
  conversations: Conversation[] = [];
  activeConversationId: string | null = null;
  searchQuery = '';
  isConnected = false;
  showHealthProfilePopup = false;
  popupPosition = { top: 0, left: 0 };
  private healthInfoBtnEl: HTMLElement | null = null;
  private scrollListener: (() => void) | null = null;

  // Predefined questions
  predefinedQuestions: any[] = [];
  
  // Gestión de suscripciones optimizada
  private destroy$ = new Subject<void>();

  constructor(
    private chatbotService: ChatbotService,
    private translationService: TranslationService,
    private suggestionsService: SuggestionsService,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef,
    private conversationService: ConversationService
  ) {
    // Cuando se cambia de conversación y había un request en curso, lo detiene
    this.conversationService.conversationBlurred.subscribe(() => {
      this.chatbotService.streaming.cancelStream();
      this.chatbotService.removeStreamingPlaceholders();
    });
  }

  ngOnInit(): void {    
    this.initialize();
  }

  private initialize(): void {
    this.loadPredefinedQuestions();
    this.setupSubscriptions();
  }

  private setupSubscriptions(): void {
    // Una sola suscripción combinada para mejor rendimiento
    combineLatest({
      conversations: this.conversationService.conversations$,
      activeConversation: this.conversationService.activeConversation$,
      connectionStatus: this.chatbotService.connectionStatus$,
      lang: this.translationService.getCurrentLangObservable(),
      routeParams: this.route.queryParams
    })
    .pipe(
      takeUntil(this.destroy$),
      debounceTime(50),
      distinctUntilChanged()
    )
    .subscribe(({
      conversations,
      activeConversation,
      connectionStatus,
      lang,
      routeParams
    }) => {
      this.handleStateUpdate(
        conversations, 
        activeConversation, 
        connectionStatus, 
        lang, 
        routeParams
      );
    });
  }

  private handleStateUpdate(
    conversations: Conversation[],
    activeConversation: Conversation | null,
    connectionStatus: string,
    lang: string,
    routeParams: any
  ): void {
    // Actualizar estado local
    this.conversations = conversations;
    this.activeConversationId = activeConversation?.id || null;
    
    // Actualizar estado de conexión
    this.updateConnectionStatus(connectionStatus);
    
    // Detectar parámetros médicos en URL
    this.detectMedicalParams(routeParams);
    
    // Actualizar preguntas predefinidas si cambió el idioma
    if (lang) {
      this.loadPredefinedQuestions();
    }
    
    this.cdr.markForCheck();
  }

  private updateConnectionStatus(status: string): void {
    const connectedStatuses = [
      'Connected',
      'Conectado',
      'Connected via WebSocket',
      'Conectado via WebSocket',
      'Connected via HTTP',
      'Conectado via HTTP'
    ];
    
    this.isConnected = connectedStatuses.some(s => status.includes(s));
  }

  private detectMedicalParams(params: any): void {
    const hasMedicalParams = params['tumor_type'] || params['tumor_alteration'] || params['treatment'];

    if (hasMedicalParams && !this.healthProfileEnabled) {
      this.healthProfileEnabled = true;
      this.healthProfileToggled.emit(true);
    }
  }

  private loadPredefinedQuestions(): void {
    this.predefinedQuestions = this.suggestionsService.getPredefinedQuestions();
  }

  // ============ MÉTODOS PARA CONVERSACIONES ============

  getFilteredConversations(): Conversation[] {
    if (!this.searchQuery.trim()) {
      return this.getUserConversations();
    }
    
    const query = this.searchQuery.toLowerCase().trim();
    return this.getUserConversations().filter(conv => 
      conv.title.toLowerCase().includes(query) || 
      (conv.preview && conv.preview.toLowerCase().includes(query)) ||
      conv.messages.some(msg => 
        msg.content.toLowerCase().includes(query)
      )
    );
  }

  getUserConversations(): Conversation[] {
    return this.conversations
      .filter(conv => conv.messages && conv.messages.length > 0)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  hasUserConversations(): boolean {
    return this.getUserConversations().length > 0;
  }

  // ============ MÉTODOS DE UI ============

  clearSearch(): void {
    this.searchQuery = '';
  }

  onHealthProfileToggle(enabled: boolean): void {
    this.healthProfileEnabled = enabled;
    this.healthProfileToggled.emit(enabled);
  }

  onHealthProfileIconClick(): void {
    this.healthProfileEnabled = !this.healthProfileEnabled;
    this.healthProfileToggled.emit(this.healthProfileEnabled);
  }

  onHealthInfoBtnClick(event: MouseEvent): void {
    this.showHealthProfilePopup = !this.showHealthProfilePopup;
    if (this.showHealthProfilePopup) {
      this.healthInfoBtnEl = event.currentTarget as HTMLElement;
      this.updatePopupPosition();
      this.scrollListener = () => this.updatePopupPosition();
      window.addEventListener('scroll', this.scrollListener, true);
      window.addEventListener('resize', this.scrollListener, true);
    } else {
      this.removeScrollListener();
    }
  }

  private updatePopupPosition(): void {
    if (!this.healthInfoBtnEl) return;
    const rect = this.healthInfoBtnEl.getBoundingClientRect();
    this.popupPosition = { top: rect.top - 12, left: rect.right + 10 };
  }

  private removeScrollListener(): void {
    if (this.scrollListener) {
      window.removeEventListener('scroll', this.scrollListener, true);
      this.scrollListener = null;
    }
  }

  getHealthParamGroups(): { label: string; entries: { value: string }[] }[] {
    const filters = this.chatbotService.getCurrentFilters();
    const groups = [
      { labelKey: 'SIDEBAR.HEALTH_PARAM_TUMOR_TYPE',       keys: ['tumor_type'] },
      { labelKey: 'SIDEBAR.HEALTH_PARAM_TUMOR_ALTERATION', keys: ['tumor_alteration'] },
      { labelKey: 'SIDEBAR.HEALTH_PARAM_TREATMENT',        keys: ['treatment'] }
    ];
    return groups
      .map(g => ({
        label: this.translationService.instant(g.labelKey),
        entries: g.keys.filter(k => filters[k]).map(k => ({ value: filters[k] }))
      }))
      .filter(g => g.entries.length > 0);
  }

  onConversationClick(conversation: Conversation): void {
    if (this.activeConversationId == conversation.id){
      return;
    }
    // Cancelar cualquier stream pendiente antes de cambiar
    if (this.chatbotService.cancelAllStreamsOnConversationChange) {
      this.chatbotService.cancelAllStreamsOnConversationChange();
    } else {
      // Fallback: cancelar stream activo y placeholders
      this.chatbotService.streaming.cancelStream();
      this.chatbotService.removeStreamingPlaceholders();
    }
    
    // Forzar actualización del estado de envío después de cambiar conversación
    this.cdr.markForCheck();
    
    this.conversationSelected.emit(conversation.id);
    this.handleMobileSidebar();
  }

  onPredefinedQuestionClick(questionItem: any): void {     
    if (!this.chatbotService.canSendMessages()) {
      console.warn('⚠️ Cannot send question: request in progress or connection unavailable');
      return; 
    }    
   
    this.suggestedQuestion.emit(questionItem.questionText);
    this.handleMobileSidebar();
  }

  onNewChat(): void {
    this.conversationService.createConversation();
    this.newChat.emit();
    this.handleMobileSidebar();
  }

  onDeleteConversation(conversationId: string, event: Event): void {
    event.stopPropagation();
    
    if (confirm(this.translationService.instant('SIDEBAR.DELETE_CONVERSATION_CONFIRM'))) {
      this.conversationService.deleteConversation(conversationId);
    }
  }

  private handleMobileSidebar(): void {
    if (window.innerWidth < 768) {
      this.toggleSidebar.emit();
    }
  }

  // ============ MÉTODOS DE BÚSQUEDA Y FILTRADO ============

  getFilteredPredefinedQuestions(): any[] {
    if (!this.predefinedQuestions?.length) {
      return [];
    }
    
    // Filtrar preguntas ya respondidas
    const unansweredQuestions = this.predefinedQuestions.filter(item => 
      !this.isQuestionAlreadyAnswered(item.questionText)
    );
    
    if (!this.searchQuery.trim()) {
      return unansweredQuestions;
    }
    
    const query = this.searchQuery.toLowerCase().trim();
    return unansweredQuestions.filter(item => 
      item.questionText.toLowerCase().includes(query)
    );
  }

  isQuestionAlreadyAnswered(questionText: string): boolean {
    return this.conversations.some(conv => 
      conv.messages.some(msg => 
        msg.sender === 'user' && 
        msg.content === questionText &&
        conv.messages.some(m => m.sender === 'bot' && m.content.trim() !== '')
      )
    );
  }

  canSendPredefinedQuestions(): boolean {
    return this.chatbotService.canSendMessages();
  }

  canClearHistory(): boolean {
    return this.chatbotService.canSendMessages();
  }

  // ============ MÉTODOS DE UTILIDAD ============

  getConversationPreview(conversation: Conversation): string {
    // Usar preview del servicio si existe
    if (conversation.preview) {
      return conversation.preview;
    }
    
    // Buscar último mensaje no vacío
    const lastMessage = [...conversation.messages]
      .reverse()
      .find(msg => msg.content?.trim());
    
    return lastMessage ? this.truncateText(lastMessage.content, 80) : 'Empty conversation';
  }

  getConversationTitle(conversation: Conversation): string {
    return conversation.title || 'Untitled conversation';
  }

  isActiveConversation(conversationId: string): boolean {
    return this.activeConversationId === conversationId;
  }

    // En chatbot-sidebar.component.ts
  formatDate(date: Date): string {
    if (!date) return '';
    
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Ahora';
    if (diffMins < 60) return `${diffMins} min`;
    if (diffHours < 24) return `${diffHours} h`;
    if (diffDays < 7) return `${diffDays} d`;
    
    // Formato de fecha fijo sin locale
    const day = date.getDate();
    const month = date.getMonth() + 1;
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  }

  private truncateText(text: string, maxLength: number): string {
    if (!text || text.length <= maxLength) {
      return text || '';
    }
    
    return text.substring(0, maxLength).trim() + '...';
  }

  // ============ MÉTODOS DE RENDIMIENTO ============

  trackByConversation(index: number, conversation: Conversation): string {
    return `${conversation.id}-${conversation.updatedAt.getTime()}`;
  }

  trackByPredefinedQuestion(index: number, item: any): string {
    return item.id || item.questionText || `question-${index}`;
  }

  // ============ CLEANUP ============

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.removeScrollListener();
  }
}