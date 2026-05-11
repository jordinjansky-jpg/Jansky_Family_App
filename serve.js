// Local dev server — serves static files from project root on port 8080.
// No dependencies — uses Node built-ins only.
//
// Usage:
//   node serve.js
//
// Dev mode (isolated Firebase path rundown-dev/):
//   http://localhost:8080/?env=dev
//   http://localhost:8080/kitchen.html?env=dev
//   etc.

const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT = 8080;
const ROOT = __dirname;

const MIME = {
  '.html':        'text/html; charset=utf-8',
  '.js':          'application/javascript; charset=utf-8',
  '.css':         'text/css; charset=utf-8',
  '.json':        'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.png':         'image/png',
  '.jpg':         'image/jpeg',
  '.jpeg':        'image/jpeg',
  '.svg':         'image/svg+xml',
  '.ico':         'image/x-icon',
  '.webp':        'image/webp',
  '.woff2':       'font/woff2',
  '.txt':         'text/plain; charset=utf-8',
};

const server = http.createServer((req, res) => {
  let urlPath = req.url.split('?')[0];
  if (urlPath === '/') urlPath = '/index.html';

  const filePath = path.join(ROOT, urlPath);

  // Prevent directory traversal outside project root
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  const ext         = path.extname(filePath).toLowerCase();
  const contentType = MIME[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end(`404 Not found: ${urlPath}`);
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('');
  console.log('  Daily Rundown — local dev server');
  console.log('');
  console.log(`  Dashboard:  http://localhost:${PORT}/`);
  console.log(`  Dev mode:   http://localhost:${PORT}/?env=dev`);
  console.log('');
  console.log('  All pages support ?env=dev — writes go to rundown-dev/,');
  console.log('  not your family\'s live data. Use the orange banner to clear it.');
  console.log('');
  console.log('  Ctrl+C to stop.');
  console.log('');
});
