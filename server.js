const http = require('http');
const fs = require('fs');
const path = require('path');
const chatHandler = require('./api/chat');

// Simple zero-dependency .env loader
try {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split(/\r?\n/).forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const index = trimmed.indexOf('=');
      if (index !== -1) {
        const key = trimmed.substring(0, index).trim();
        let val = trimmed.substring(index + 1).trim();
        if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
        if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
        process.env[key] = val;
      }
    });
  }
} catch (e) {
  console.error('Failed to parse .env file:', e.message);
}

const pushHandler = require('./api/push');

const server = http.createServer((req, res) => {
  // CORS Headers for API compatibility
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const runHandler = (handler) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try { req.body = JSON.parse(body); } catch (e) { req.body = {}; }
      res.json = (data) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
      };
      res.status = (code) => {
        res.statusCode = code;
        return {
          json: (data) => {
            res.writeHead(code, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(data));
          },
          end: () => res.end()
        };
      };
      handler(req, res).catch(err => {
        console.error('Serverless execution error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      });
    });
  };

  // Route API requests
  if (req.url === '/api/chat' && req.method === 'POST') {
    runHandler(chatHandler);
    return;
  }
  if (req.url === '/api/push' && req.method === 'POST') {
    runHandler(pushHandler);
    return;
  }

  // Route Static assets
  let filePath = req.url === '/' ? '/index.html' : req.url;
  filePath = path.join(__dirname, filePath);

  const ext = path.extname(filePath);
  let contentType = 'text/html';
  if (ext === '.css') contentType = 'text/css';
  else if (ext === '.js') contentType = 'application/javascript';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Asset Not Found');
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\nChai local environment server running!`);
  console.log(`Open your browser and navigate to: http://localhost:${PORT}\n`);
});
