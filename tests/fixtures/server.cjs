const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

// A separate process keeps serving while the tests run synchronous CLI calls.
const server = http.createServer((req, res) => {
  // Also act as a deny-only proxy for browser background traffic. Never forward
  // requests: an absolute proxy URL or a non-loopback Host is always rejected.
  if (/^https?:\/\//i.test(req.url) || req.headers.host !== `127.0.0.1:${server.address().port}`) {
    res.writeHead(403); res.end('Only local fixtures are permitted'); return;
  }
  const url = new URL(req.url, 'http://127.0.0.1');
  const body = url.pathname === '/linkedin-people-search.html'
    ? fs.readFileSync(path.join(__dirname, 'linkedin-people-search.html'))
    : `<!doctype html><html><head><title>Example Domain</title></head><body><h1>Example Domain</h1><p>Local synthetic page ${url.pathname}</p></body></html>`;
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Content-Security-Policy': "default-src 'none'; img-src data:; style-src 'unsafe-inline'; connect-src 'self'",
  });
  res.end(body);
});
server.on('connect', (_request, socket) => {
  // Chromium may cancel a background tunnel while the denial is being written.
  // CONNECT sockets are detached from HTTP's usual socket error handling.
  socket.on('error', () => socket.destroy());
  socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
});
server.listen(0, '127.0.0.1', () => process.send({ port: server.address().port }));
process.on('disconnect', () => server.close(() => process.exit(0)));
