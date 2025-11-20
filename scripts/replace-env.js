cat > scripts/replace-env.js << 'EOF'
const fs = require('fs');
const path = require('path');

if (process.env.NODE_ENV === 'production') {
  const envPath = path.join(__dirname, '../src/environments/environment.prod.ts');
  
  try {
    let content = fs.readFileSync(envPath, 'utf8');
    
    // Reemplazar el placeholder con la variable real de Vercel
    content = content.replace(
      "apiKey: 'API_KEY_PLACEHOLDER'", 
      `apiKey: '${process.env.API_KEY || ''}'`
    );
    
    fs.writeFileSync(envPath, content, 'utf8');
    console.log('✅ Environment variables injected for production');
  } catch (error) {
    console.error('❌ Error injecting environment variables:', error.message);
  }
}
EOF