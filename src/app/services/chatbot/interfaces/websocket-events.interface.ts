export interface QueryRequest {
  query: string;
  filters?: any;
  stream?: boolean;
}

export interface StreamStartEvent {
  type: 'stream_start';
  query: string;
  client_id: string;
}

export interface StreamChunkEvent {
  type: 'stream_chunk';
  chunk: string;
}

export interface StreamEndEvent {
  type: 'stream_end';
  full_response: string;
  sources: any[];
  metadata: {
    query: string;
    client_id: string;
  };
}

export interface StatusEvent {
  type: 'status';
  message: string;
  client_id: string;
}

export interface ErrorEvent {
  type: 'error';
  message: string;
}

export type WebSocketEvent = 
  | StreamStartEvent 
  | StreamChunkEvent 
  | StreamEndEvent 
  | StatusEvent 
  | ErrorEvent;