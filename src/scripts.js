const fs = require('fs');
const path = require('path');

// Solo ejecutar en producción
if (process.env.NODE_ENV === 'production') {
  const envPath = path.join(__dirname, '../src/environments/environment.prod.ts');
  
  let content = fs.readFileSync(envPath, 'utf8');
  
  // Reemplazar el placeholder con la variable real de Vercel
  content = content.replace(
    "apiKey: 'API_KEY_PLACEHOLDER'", 
    `apiKey: '${process.env.API_KEY || ''}'`
  );
  
  fs.writeFileSync(envPath, content, 'utf8');
  console.log('✅ Environment variables injected for production');
}