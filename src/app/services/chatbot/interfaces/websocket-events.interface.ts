// interfaces/websocket-events.interface.ts

export interface WebSocketEvent {
  type: 'status' | 'stream_start' | 'stream_chunk' | 'stream_end' | 'error' | 'pong';
  message?: string;
  query?: string;
  chunk?: string;
  full_response?: string;
  sources?: any[];
  metadata?: any;
  client_id?: string;
  timestamp?: string;
  server_time?: string;
}

export interface QueryRequest {
  query: string;
  filters?: any;
  stream?: boolean;
}

export interface FeedbackRequest {
  type: string;           
  rating: 'up' | 'down';  
  comment: string;        
  response_id?: string;   
  client_id?: string;     
  query?: string;         
}

export interface PingMessage {
  type: 'ping';
  client_id: string;
  timestamp: string;  
}

export interface PongMessage {
  type: 'pong';
  client_id: string;
  timestamp: string;  // ISO 8601
  server_time: string; // ISO 8601
}