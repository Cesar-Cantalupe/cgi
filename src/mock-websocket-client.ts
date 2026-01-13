/**
 * Mock WebSocket Client para pruebas de streaming
 * Ejecutar en la consola del navegador o en Node.js
 */

export class MockWebSocketClient {
  private ws: WebSocket | null = null;
  private wsUrl: string;

  constructor(wsUrl: string = 'ws://localhost:8000/ws') {
    this.wsUrl = wsUrl;
  }

  /**
   * Conectar al WebSocket real
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.wsUrl);
        
        this.ws.onopen = () => {
          console.log('✅ Conectado al WebSocket');
          resolve();
        };
        
        this.ws.onerror = (error) => {
          console.error('❌ Error en WebSocket:', error);
          reject(error);
        };
        
        this.ws.onmessage = (event) => {
          console.log('📨 Mensaje recibido:', event.data);
        };
      } catch (error) {
        console.error('❌ Error conectando:', error);
        reject(error);
      }
    });
  }

  /**
   * Enviar una query real
   */
  sendQuery(query: string, filters: any = {}): void {
    if (!this.ws) {
      console.error('❌ WebSocket no conectado');
      return;
    }

    const message = {
      query: query,
      filters: filters,
      stream: true,
      timestamp: Date.now()
    };

    console.log('📤 Enviando query:', message);
    this.ws.send(JSON.stringify(message));
  }

  /**
   * Simular stream_start
   */
  private sendStreamStart(clientId: string = 'mock-client-123'): void {
    if (!this.ws) return;

    const message = {
      type: 'stream_start',
      client_id: clientId
    };

    console.log('📤 Enviando stream_start:', message);
    this.ws.send(JSON.stringify(message));
  }

  /**
   * Simular un stream_chunk
   */
  private sendStreamChunk(chunk: string, index: number): void {
    if (!this.ws) return;

    const message = {
      type: 'stream_chunk',
      chunk: chunk,
      index: index
    };

    console.log(`📤 Enviando chunk #${index}:`, chunk.substring(0, 50) + '...');
    this.ws.send(JSON.stringify(message));
  }

  /**
   * Simular stream_end
   */
  private sendStreamEnd(fullResponse: string, sources: any[] = []): void {
    if (!this.ws) return;

    const message = {
      type: 'stream_end',
      full_response: fullResponse,
      sources: sources
    };

    console.log('📤 Enviando stream_end con', fullResponse.length, 'caracteres');
    this.ws.send(JSON.stringify(message));
  }

  /**
   * Simular un stream completo con chunks progresivos
   */
  async simulateCompleteStream(
    fullResponse: string,
    chunkSize: number = 50,
    delayMs: number = 100,
    sources: any[] = []
  ): Promise<void> {
    console.log('🚀 Iniciando simulación de stream...');
    console.log(`📊 Total chars: ${fullResponse.length}, Chunk size: ${chunkSize}, Delay: ${delayMs}ms`);

    // 1. Enviar stream_start
    this.sendStreamStart();
    await this.sleep(200);

    // 2. Enviar chunks progresivos
    const chunks = this.chunkText(fullResponse, chunkSize);
    for (let i = 0; i < chunks.length; i++) {
      this.sendStreamChunk(chunks[i], i);
      await this.sleep(delayMs);
    }

    // 3. Enviar stream_end
    await this.sleep(200);
    this.sendStreamEnd(fullResponse, sources);

    console.log('✅ Simulación completada');
  }

  /**
   * Dividir texto en chunks
   */
  private chunkText(text: string, size: number): string[] {
    const chunks: string[] = [];
    for (let i = 0; i < text.length; i += size) {
      chunks.push(text.substring(i, i + size));
    }
    return chunks;
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Desconectar
   */
  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      console.log('🔌 WebSocket desconectado');
    }
  }
}

// ============ TEXTO DE EJEMPLO PARA PRUEBAS ============

export const MOCK_RESPONSES = {
  short: `Este es un mensaje corto para pruebas rápidas. Tiene suficientes caracteres para ver varios chunks.`,
  
  medium: `La inteligencia artificial es un campo fascinante de la informática que busca crear máquinas capaces de realizar tareas que típicamente requieren inteligencia humana. Esto incluye aprendizaje automático, procesamiento del lenguaje natural, visión por computadora, y muchas otras disciplinas.`,
  
  long: `La inteligencia artificial es un campo fascinante de la informática que busca crear máquinas capaces de realizar tareas que típicamente requieren inteligencia humana. Esto incluye aprendizaje automático, procesamiento del lenguaje natural, visión por computadora, y muchas otras disciplinas.

En las últimas décadas, la IA ha experimentado un crecimiento exponencial, impulsado por el aumento de la potencia computacional, la disponibilidad de grandes volúmenes de datos, y el desarrollo de nuevos algoritmos.

Las aplicaciones prácticas de la IA son cada vez más comunes en nuestra vida cotidiana. Desde asistentes virtuales como Siri o Alexa, hasta sistemas de recomendación en plataformas de streaming, pasando por diagnósticos médicos asistidos por IA.

Sin embargo, también existen desafíos significativos, como la ética de la IA, la seguridad, la privacidad, y el impacto en el mercado laboral.`
};

// ============ EJEMPLO DE USO ============

// En la consola del navegador:
/*
// 1. Crear cliente
const mock = new MockWebSocketClient('ws://localhost:8000/ws');

// 2. Conectar
await mock.connect();

// 3. Enviar query real
mock.sendQuery('¿Qué es la inteligencia artificial?');

// 4. Esperar un poco y simular respuesta
setTimeout(() => {
  mock.simulateCompleteStream(
    MOCK_RESPONSES.long,
    50,      // chunkSize
    100,     // delayMs entre chunks
    []       // sources
  );
}, 5000);

// 5. Desconectar cuando termines
// mock.disconnect();
*/
