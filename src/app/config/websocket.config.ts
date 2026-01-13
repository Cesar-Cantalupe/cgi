export const WEBSOCKET_CONFIG = {
  // 🎭 CAMBIAR A true PARA DEBUGEAR CON MOCK
  // 🔌 CAMBIAR A false PARA USAR BACKEND REAL
  USE_MOCK_MODE: false,
  
  // URL del backend real
  BACKEND_URL: 'ws://localhost:8000/ws',
  
  // Configuración del mock
  MOCK: {
    chunkSize: 50,              // Caracteres por chunk
    delayBetweenChunks: 150,    // Milisegundos entre chunks
    delayBeforeStart: 500,      // Milisegundos antes de stream_start
  }
};
