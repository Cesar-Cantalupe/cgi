import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { ChatMessage } from '../interfaces/chat-message.interface';
import { ConversationService } from './conversation.service';

export interface MessageCleanupOptions {
  keepUserQuestions?: boolean;
  keepPredefinedQuestions?: boolean;
  removeStreamingMessages?: boolean;
  specificMessageId?: string;
  removeAfterMessageId?: string;
  questionType?: 'user' | 'predefined';
}

@Injectable({ providedIn: 'root' })
export class ChatbotStateService {
  // Estado privado
  private messagesSubject = new BehaviorSubject<ChatMessage[]>([]);
  private processingSubject = new BehaviorSubject<boolean>(false);
  private isStoppingSubject = new BehaviorSubject<boolean>(false);
  private streamingMessageSubject = new BehaviorSubject<ChatMessage | null>(null);
  private clientIdSubject = new BehaviorSubject<string | null>(null);
  private streamingCompletedSubject = new Subject<ChatMessage>(); // ⚠️ Emite cuando streaming termina
  
  // Público
  public messages$ = this.messagesSubject.asObservable();
  public isProcessing$ = this.processingSubject.asObservable();
  public isStopping$ = this.isStoppingSubject.asObservable();
  public currentStreamingMessage$ = this.streamingMessageSubject.asObservable();
  public currentClientId$ = this.clientIdSubject.asObservable();
  public streamingCompleted$ = this.streamingCompletedSubject.asObservable();

  // Getters síncronos
  get messages(): ChatMessage[] {
    return this.messagesSubject.value;
  }

  get isProcessing(): boolean {
    return this.processingSubject.value;
  }

  get isStopping(): boolean {
    return this.isStoppingSubject.value;
  }

  get currentStreamingMessage(): ChatMessage | null {
    return this.streamingMessageSubject.value;
  }

  get currentClientId(): string | null {
    return this.clientIdSubject.value;
  }

  setStopping(val: boolean) { this.isStoppingSubject.next(val); }

  constructor(private conversationService: ConversationService) {
    this.setupConversationSync();
    this.setupCleanupInterval();
  }

  private setupConversationSync(): void {
    this.conversationService.activeConversation$.subscribe(conversation => {
      if (conversation?.messages.length) {
        const chatMessages = conversation.messages.map(msg => ({
          ...msg,
          content: msg.content || '',
          text: msg.content || '',
          sender: msg.sender,
          isUser: msg.sender === 'user',
          isStreaming: msg.isStreaming || false,
          timestamp: msg.timestamp || new Date(),
          showFeedbackBox: msg.sender === 'bot' && !msg.isStreaming
        }));
        
        this.setMessages(chatMessages);
      }
    });

    this.messages$.subscribe(messages => {
      this.syncToActiveConversation(messages);
    });
  }

  private setupCleanupInterval(): void {
    setInterval(() => {
      this.cleanupOrphanedStreamingMessages();
    }, 10000);
  }

  private syncToActiveConversation(messages: ChatMessage[]): void {
    const activeConversation = this.conversationService.getActiveConversation();
    if (!activeConversation) {
      return;
    }

    const conversationMessages = messages
      .filter(msg => !this.isTemporaryMessage(msg))
      .map(msg => ({
        id: msg.id,
        content: msg.content || msg.text || '',
        sender: msg.sender || (msg.isUser ? 'user' : 'bot'),
        timestamp: msg.timestamp || new Date(),
        sources: msg.sources || [],
        feedback: msg.feedback || null,
        isStreaming: msg.isStreaming || false
      }));

    if (conversationMessages.length > 0) {
      this.conversationService.updateConversationMessages(
        activeConversation.id,
        conversationMessages
      );
    }
  }

  private isTemporaryMessage(message: ChatMessage): boolean {
    if (!message) return true;
    
    const isPlaceholder = message._isProcessingPlaceholder || false;
    const hasContent = !!(message.content?.trim() || message.text?.trim());
    const isStreaming = message.isStreaming || false;
    const isSystemMessage = message.sender === 'system';
    
    if (isPlaceholder && !hasContent) {
      return true;
    }
    
    if (isSystemMessage && message.id?.startsWith('system-')) {
      return true;
    }
    
    if (isStreaming && hasContent) {
      return false;
    }
    
    return false;
  }

  // ============ API PÚBLICA ============

  setMessages(messages: ChatMessage[]): void {
    const deduplicated = this.deduplicateMessages(messages);
    this.messagesSubject.next(deduplicated);
  }
  
  notifyStreamingCompleted(message: ChatMessage): void {
    this.streamingCompletedSubject.next(message);
  }

  setProcessing(value: boolean): void {
    if (this.processingSubject.value !== value) {
      // console.log('🔄 Estado procesamiento cambiado a:', value);
      this.processingSubject.next(value);
    }
  }

  setStreamingMessage(message: ChatMessage | null): void {
    this.streamingMessageSubject.next(message);
  }

  setClientId(clientId: string | null): void {
    this.clientIdSubject.next(clientId);
  }

  // ============ OPERACIONES DE MENSAJES ============

  addMessage(message: ChatMessage): void {
    if (this.isDuplicateMessage(message)) {
      return;
    }
    
    const messages = [...this.messages, message];
    this.messagesSubject.next(messages);
    
    if (message.sender === 'user' || message.isUser) {
      this.syncUserMessageToConversation(message);
    }
  }

  updateMessage(messageId: string, updates: Partial<ChatMessage>): ChatMessage | null {
    if (!messageId) {
      return null;
    }
    
    const index = this.messages.findIndex(msg => msg.id === messageId);
    
    if (index === -1) {
      const isStreamingMessage = messageId.startsWith('stream-');
      const hasContent = !!(updates.content || updates.text);
      
      if (isStreamingMessage && hasContent) {
        const newMessage: ChatMessage = {
          id: messageId,
          content: updates.content || '',
          text: updates.text || updates.content || '',
          sender: updates.sender || 'bot',
          isUser: updates.isUser || false,
          isStreaming: updates.isStreaming !== undefined ? updates.isStreaming : true,
          timestamp: updates.timestamp || new Date(),
          _streamingUpdate: updates._streamingUpdate || Date.now(),
          _isProcessingPlaceholder: updates._isProcessingPlaceholder || false,
          showFeedbackBox: updates.showFeedbackBox || false,
          sources: updates.sources || []
        };
        
        this.addMessage(newMessage);
        return newMessage;
      }
      
      return null;
    }


    const messages = [...this.messages];
    const updatedMessage = { ...messages[index], ...updates };
    
    if (updates.isStreaming === false && messages[index].isStreaming === true) {
      if (updatedMessage._isProcessingPlaceholder && !updatedMessage.content && !updatedMessage.text) {
        this.removeMessage(m => m.id === messageId);
        return null;
      }
    }
    
    messages[index] = updatedMessage;
    this.messagesSubject.next(messages);
    
    if (this.currentStreamingMessage?.id === messageId) {
      this.streamingMessageSubject.next(updatedMessage);
    }

    if (updatedMessage.sender === 'bot' && !updatedMessage.isStreaming && updatedMessage.content) {
      this.syncBotMessageToConversation(updatedMessage);
    }

    return updatedMessage;
  }

  removeMessage(predicate: (msg: ChatMessage) => boolean): void {
    const messages = this.messages.filter(msg => !predicate(msg));
    this.messagesSubject.next(messages);
  }

  clearMessages(): void {
    this.messagesSubject.next([]);
    this.streamingMessageSubject.next(null);
    this.setProcessing(false);
  }

  // ============ NUEVOS MÉTODOS PARA LIMPIEZA CONTROLADA ============

  /**
   * Método avanzado para limpiar mensajes con opciones específicas
   */
  cleanupMessages(options: MessageCleanupOptions): number {
    // console.log('🧹 cleanupMessages con opciones:', options);
    
    const messages = this.messages;
    let messagesToRemove: ChatMessage[] = [];
    
    // Opción 1: Remover mensaje específico
    if (options.specificMessageId) {
      const message = messages.find(m => m.id === options.specificMessageId);
      if (message) {
        messagesToRemove.push(message);
      }
    }
    
    // Opción 2: Remover mensajes después de un ID específico
    else if (options.removeAfterMessageId) {
      const startIndex = messages.findIndex(m => m.id === options.removeAfterMessageId);
      if (startIndex !== -1) {
        messagesToRemove = messages.slice(startIndex + 1);
      }
    }
    
    // Opción 3: Limpieza por tipo de pregunta
    else if (options.questionType) {
      messagesToRemove = this.filterMessagesByQuestionType(messages, options);
    }
    
    // Opción 4: Limpieza predeterminada (para STOP)
    else {
      messagesToRemove = this.filterMessagesForDefaultCleanup(messages, options);
    }
    
    // Ejecutar remoción
    if (messagesToRemove.length > 0) {
      messagesToRemove.forEach(msg => {
        this.removeMessage(m => m.id === msg.id);
      });
      
      // console.log(`✅ Removidos ${messagesToRemove.length} mensajes`);
      return messagesToRemove.length;
    }
    
    return 0;
  }

  /**
   * Limpia mensajes de streaming activos
   * CORREGIDO: Mantiene mensajes con contenido, solo elimina placeholders vacíos
   */
  cleanupActiveStreamingMessages(): number {
    const streamingMessages = this.messages.filter(m => m.isStreaming);
    
    if (streamingMessages.length > 0) {
      let removed = 0;
      let preserved = 0;
      
      streamingMessages.forEach(msg => {
        const hasContent = msg.content && msg.content.trim().length > 0;
        
        if (hasContent) {
          // Mantener el mensaje pero cambiar isStreaming a false
          // console.log(`💾 Manteniendo contenido de streaming:`, {
          //   id: msg.id?.substring(0, 20),
          //   contentLength: msg.content?.length
          // });
          
          // Actualizar el mensaje in-place
          msg.isStreaming = false;
          msg._isProcessingPlaceholder = false;
          preserved++;
        } else {
          // Eliminar solo si está vacío
          // console.log(`🗑️ Eliminando mensaje de streaming vacío:`, msg.id?.substring(0, 20));
          this.removeMessage(m => m.id === msg.id);
          removed++;
        }
      });
      
      // console.log(`🧹 Limpieza de streaming: ${preserved} preservados, ${removed} eliminados`);
      return removed;
    }
    
    return 0;
  }

  /**
   * Limpia respuestas de bot después de una pregunta específica
   */
  cleanupBotResponsesAfterQuestion(questionMessageId: string): number {
    const messages = this.messages;
    const questionIndex = messages.findIndex(m => m.id === questionMessageId);
    
    if (questionIndex === -1) {
      return 0;
    }
    
    const messagesAfter = messages.slice(questionIndex + 1);
    const botResponses = messagesAfter.filter(m => 
      m.sender === 'bot' || !m.isUser
    );
    
    if (botResponses.length > 0) {
      botResponses.forEach(msg => {
        this.removeMessage(m => m.id === msg.id);
      });
      
      // console.log(`🤖 Limpiadas ${botResponses.length} respuestas de bot`);
      return botResponses.length;
    }
    
    return 0;
  }

  /**
   * Limpia pregunta y respuestas para preguntas predefinidas
   */
  cleanupPredefinedQuestion(questionContent?: string): number {
    const messages = this.messages;
    const predefinedQuestions = messages.filter(m => 
      (m.sender === 'user' || m.isUser) && 
      (m as any)._isPredefinedQuestion === true
    );
    
    if (predefinedQuestions.length === 0) {
      return 0;
    }
    
    let questionToRemove: ChatMessage | null = null;
    
    if (questionContent) {
      // Buscar por contenido específico
      questionToRemove = predefinedQuestions.find(q => 
        q.content === questionContent || q.text === questionContent
      ) || null;
    } else {
      // Tomar la última pregunta predefinida
      questionToRemove = predefinedQuestions[predefinedQuestions.length - 1];
    }
    
    if (!questionToRemove) {
      return 0;
    }
    
    // Limpiar pregunta y respuestas
    const removedCount = 1 + this.cleanupBotResponsesAfterQuestion(questionToRemove.id!);
    
    // Remover la pregunta misma
    this.removeMessage(m => m.id === questionToRemove!.id);
    
    // console.log(`🔖 Limpiada pregunta predefinida y ${removedCount - 1} respuestas`);
    return removedCount;
  }

  /**
   * Limpia solo respuestas manteniendo preguntas de usuario
   */
  cleanupBotResponsesOnly(): number {
    const botMessages = this.messages.filter(m => 
      m.sender === 'bot' || !m.isUser
    );
    
    if (botMessages.length > 0) {
      botMessages.forEach(msg => {
        this.removeMessage(m => m.id === msg.id);
      });
      
      // console.log(`🤖 Limpiadas ${botMessages.length} respuestas de bot (manteniendo preguntas)`);
      return botMessages.length;
    }
    
    return 0;
  }

  // ============ MÉTODOS DE LIMPIEZA ============

  cleanupOrphanedStreamingMessages(): void {
    const now = Date.now();
    const orphanedMessages = this.messages.filter(msg => {
      if (!msg.isStreaming || !msg.id?.startsWith('stream-')) {
        return false;
      }
      
      const lastUpdate = msg._streamingUpdate || msg.timestamp?.getTime() || 0;
      const timeSinceUpdate = now - lastUpdate;
      
      const isOld = timeSinceUpdate > 30000;
      const isEmptyPlaceholder = msg._isProcessingPlaceholder && (!msg.content && !msg.text);
      const isVeryOld = timeSinceUpdate > 60000;
      
      return isVeryOld || (isOld && isEmptyPlaceholder);
    });
    
    if (orphanedMessages.length > 0) {
      orphanedMessages.forEach(msg => {
        this.removeMessage(m => m.id === msg.id);
      });
    }
  }

  forceCleanupStreaming(): void {
    const streamingMessages = this.messages.filter(m => m.isStreaming);
    
    streamingMessages.forEach(msg => {
      this.removeMessage(m => m.id === msg.id);
    });
    
    this.setProcessing(false);
    this.setStreamingMessage(null);
  }

  // ============ MÉTODOS DE UTILIDAD ============

  private deduplicateMessages(messages: ChatMessage[]): ChatMessage[] {
    const seen = new Set<string>();
    return messages.filter(msg => {
      const key = msg.id || `${msg.sender}-${msg.content?.substring(0, 50)}-${msg.timestamp?.getTime()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private isDuplicateMessage(newMessage: ChatMessage): boolean {
    const recentMessages = this.messages.slice(-10);
    return recentMessages.some(msg => 
      msg.id === newMessage.id ||
      (msg.content === newMessage.content &&
       msg.sender === newMessage.sender &&
       Math.abs((msg.timestamp?.getTime() || 0) - (newMessage.timestamp?.getTime() || 0)) < 1000)
    );
  }

  private syncUserMessageToConversation(message: ChatMessage): void {
    if (!message.content?.trim() && !message.text?.trim()) return;
    
    const content = message.content || message.text || '';
    this.conversationService.addMessage(content, message.sender || 'user');
  }
  
  private syncBotMessageToConversation(message: ChatMessage): void {
    if (!message.content?.trim() && !message.text?.trim()) return;
    
    const activeConversation = this.conversationService.getActiveConversation();
    if (!activeConversation) return;
    
    this.conversationService.updateConversationMessages(
      activeConversation.id,
      [...activeConversation.messages, {
        id: message.id,
        content: message.content || message.text || '',
        sender: 'bot',
        timestamp: message.timestamp || new Date(),
        sources: message.sources || [],
        feedback: message.feedback || null,
        isStreaming: false
      }]
    );
  }

  // ============ MÉTODOS DE FILTRADO PARA LIMPIEZA ============

  private filterMessagesByQuestionType(messages: ChatMessage[], options: MessageCleanupOptions): ChatMessage[] {
    const filtered: ChatMessage[] = [];
    
    if (options.questionType === 'user') {
      // Para preguntas de usuario: mantener pregunta, limpiar respuestas
      const userMessages = messages.filter(m => 
        (m.sender === 'user' || m.isUser) && 
        (m as any)._isPredefinedQuestion !== true
      );
      
      if (userMessages.length > 0) {
        const lastUserMessage = userMessages[userMessages.length - 1];
        const userIndex = messages.indexOf(lastUserMessage);
        
        // Agregar respuestas de bot después de la pregunta
        const botResponses = messages.slice(userIndex + 1).filter(m => 
          m.sender === 'bot' || !m.isUser
        );
        
        filtered.push(...botResponses);
      }
    } 
    else if (options.questionType === 'predefined') {
      // Para preguntas predefinidas: limpiar pregunta y respuestas
      const predefinedQuestions = messages.filter(m => 
        (m.sender === 'user' || m.isUser) && 
        (m as any)._isPredefinedQuestion === true
      );
      
      if (predefinedQuestions.length > 0) {
        const lastPredefined = predefinedQuestions[predefinedQuestions.length - 1];
        const questionIndex = messages.indexOf(lastPredefined);
        
        // Agregar la pregunta predefinida
        filtered.push(lastPredefined);
        
        // Agregar respuestas después
        const responses = messages.slice(questionIndex + 1).filter(m => 
          m.sender === 'bot' || !m.isUser
        );
        
        filtered.push(...responses);
      }
    }
    
    return filtered;
  }

  private filterMessagesForDefaultCleanup(messages: ChatMessage[], options: MessageCleanupOptions): ChatMessage[] {
    const filtered: ChatMessage[] = [];
    
    // Siempre remover mensajes de streaming
    if (options.removeStreamingMessages !== false) {
      const streamingMessages = messages.filter(m => m.isStreaming);
      filtered.push(...streamingMessages);
    }
    
    // Remover respuestas de bot si no se especifica mantener preguntas
    if (options.keepUserQuestions === false || options.keepPredefinedQuestions === false) {
      const botMessages = messages.filter(m => 
        m.sender === 'bot' || !m.isUser
      );
      
      // Filtrar para no duplicar si ya están en streamingMessages
      const newBotMessages = botMessages.filter(botMsg => 
        !filtered.some(f => f.id === botMsg.id)
      );
      
      filtered.push(...newBotMessages);
    }
    
    return filtered;
  }

  // ============ MÉTODOS GETTER PÚBLICOS ============
  
  getLastBotMessage(): ChatMessage | null {
    const botMessages = this.messages.filter(m => 
      (m.sender === 'bot' || (!m.isUser && m.sender !== 'user')) && 
      !m.isStreaming
    );
    return botMessages.length ? botMessages[botMessages.length - 1] : null;
  }
  
  getLastUserMessage(): ChatMessage | null {
    const userMessages = this.messages.filter(m => 
      m.sender === 'user' || m.isUser
    );
    return userMessages.length ? userMessages[userMessages.length - 1] : null;
  }
  
  getLastCompleteBotMessage(): ChatMessage | null {
    const botMessages = this.messages.filter(m => 
      (m.sender === 'bot' || (!m.isUser && m.sender !== 'user')) && 
      !m.isStreaming &&
      (m.content?.trim() || m.text?.trim())
    );
    return botMessages.length ? botMessages[botMessages.length - 1] : null;
  }
  
  getLastUserQuestion(): {message: ChatMessage, isPredefined: boolean} | null {
    const userMessages = this.messages.filter(m => 
      m.sender === 'user' || m.isUser
    );
    
    if (userMessages.length === 0) {
      return null;
    }
    
    const lastUserMessage = userMessages[userMessages.length - 1];
    const isPredefined = (lastUserMessage as any)._isPredefinedQuestion === true;
    
    return {
      message: lastUserMessage,
      isPredefined: isPredefined
    };
  }
  
  getProcessing(): boolean {
    return this.isProcessing;
  }
  
  getClientId(): string | null {
    return this.currentClientId;
  }
  
  getCurrentStreamingMessage(): ChatMessage | null {
    return this.currentStreamingMessage;
  }
  
  getMessageById(id: string): ChatMessage | null {
    return this.messages.find(m => m.id === id) || null;
  }
  
  // ============ MÉTODOS DE INFORMACIÓN PARA DEBUG ============
  
  getStreamingMessagesInfo(): {
    count: number;
    messages: Array<{id: string, contentLength: number, isPlaceholder: boolean}>;
  } {
    const streamingMessages = this.messages.filter(m => m.isStreaming);
    
    return {
      count: streamingMessages.length,
      messages: streamingMessages.map(m => ({
        id: m.id?.substring(0, 20) || 'unknown',
        contentLength: (m.content || m.text || '').length,
        isPlaceholder: !!m._isProcessingPlaceholder
      }))
    };
  }
  
  getQuestionsInfo(): {
    userQuestions: number;
    predefinedQuestions: number;
    lastQuestionType: 'user' | 'predefined' | 'none';
    lastQuestionContent: string;
  } {
    const userMessages = this.messages.filter(m => 
      m.sender === 'user' || m.isUser
    );
    
    const predefinedQuestions = userMessages.filter(m => 
      (m as any)._isPredefinedQuestion === true
    );
    
    const userQuestions = userMessages.length - predefinedQuestions.length;
    
    let lastQuestionType: 'user' | 'predefined' | 'none' = 'none';
    let lastQuestionContent = '';
    
    if (userMessages.length > 0) {
      const lastMessage = userMessages[userMessages.length - 1];
      lastQuestionContent = lastMessage.content || lastMessage.text || '';
      lastQuestionType = (lastMessage as any)._isPredefinedQuestion ? 'predefined' : 'user';
    }
    
    return {
      userQuestions,
      predefinedQuestions: predefinedQuestions.length,
      lastQuestionType,
      lastQuestionContent: lastQuestionContent.substring(0, 50) + 
        (lastQuestionContent.length > 50 ? '...' : '')
    };
  }
  
  getDebugInfo() {
    const questionsInfo = this.getQuestionsInfo();
    const streamingInfo = this.getStreamingMessagesInfo();
    
    return {
      messageCount: this.messages.length,
      isProcessing: this.isProcessing,
      currentStreamingMessage: this.currentStreamingMessage?.id,
      clientId: this.currentClientId,
      streamingMessages: streamingInfo,
      questions: questionsInfo,
      messages: this.messages.map(m => ({
        id: m.id?.substring(0, 20),
        sender: m.sender,
        isStreaming: m.isStreaming,
        isPredefined: (m as any)._isPredefinedQuestion,
        contentLength: m.content?.length || m.text?.length || 0,
        contentPreview: (m.content || m.text || '').substring(0, 30)
      }))
    };
  }
}