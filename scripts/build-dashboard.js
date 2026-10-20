'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const target = path.join(root, 'dist', 'dashboard');
fs.mkdirSync(target, { recursive: true });
// The browser bundle contains only the generic template, never the local .env or DB data.
const html = fs.readFileSync(path.join(__dirname, 'templates', 'dashboard.html'), 'utf8')
  .replace('<head>', '<head>\n<meta name="dashboard-auth" content="google">');
fs.writeFileSync(path.join(target, 'index.html'), html);
console.log('Built static dashboard in dist/dashboard');
