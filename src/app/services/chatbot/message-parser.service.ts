import { Injectable } from '@angular/core';
import { WebSocketEvent } from './interfaces/websocket-events.interface';

@Injectable({
  providedIn: 'root'
})
export class MessageParserService {

  constructor() {}

  formatSources(sources: any[]): Array<{id: string; url: string; title?: string; type?: string}> {
    if (!sources) return [];
    
    return sources.map((source, index) => ({
      id: (index + 1).toString(),
      url: source.url || source.source_url || source.metadata?.url || '#',
      title: source.title || source.document_title || source.metadata?.title || `Fuente ${index + 1}`,
      type: source.type || source.document_type || 'Referencia'
    }));
  }

  formatRAGResponse(response: string, sources: any[]): string {
    if (!sources || sources.length === 0) {
      return response;
    }

    let formattedResponse = response;
    const existingReferences = response.match(/\[\d+\]/g);
    
    if (!existingReferences || existingReferences.length < sources.length) {
      sources.forEach((source, index) => {
        const reference = `[${index + 1}]`;
        if (!formattedResponse.includes(reference)) {
          formattedResponse += ` ${reference}`;
        }
      });
    }
    
    return formattedResponse;
  }

  isStreamingEvent(event: WebSocketEvent): boolean {
    return event.type === 'stream_start' || 
           event.type === 'stream_chunk' || 
           event.type === 'stream_end';
  }

  isErrorEvent(event: WebSocketEvent): boolean {
    return event.type === 'error';
  }
}