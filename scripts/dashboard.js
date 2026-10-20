#!/usr/bin/env node
/**
 * dashboard.js — Local web dashboard for job application pipeline.
 *
 * Serves a single-page dashboard at http://localhost:7531 that visualizes
 * the kanban pipeline, funnel stats, and recent activity from the DB.
 *
 * Usage:
 *   node scripts/dashboard.js                Start dashboard on port 7531
 *   node scripts/dashboard.js --port 8080    Use custom port
 *   node scripts/dashboard.js --open         Open in browser automatically
 *
 * The agent should open this at the end of a round (apply, news, daily)
 * so the user can visually review the pipeline status.
 *
 * No external dependencies beyond `pg` (already installed).
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { fetchPipelineData } = require('../lib/dashboard-data');

const REPO_ROOT = path.resolve(__dirname, '..');
const ENV_PATH = path.join(REPO_ROOT, '.env');

function loadEnv() {
  if (!fs.existsSync(ENV_PATH)) {
    console.error('No .env found. Run the onboarding skill first.');
    process.exit(1);
  }
  const raw = fs.readFileSync(ENV_PATH, 'utf8');
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}

function getDashboardHTML() {
  let html = fs.readFileSync(path.join(REPO_ROOT, 'scripts', 'templates', 'dashboard.html'), 'utf8');
  // Inject docs_url from DB if available
  try {
    const { getSocial } = require('./social');
    const docsUrl = getSocial().docs_url;
    if (docsUrl) {
      html = html.replace('id="docs-link" href="#"', `id="docs-link" href="${docsUrl}"`);
    }
  } catch {}
  return html;
}

function parseArgs() {
  const args = process.argv.slice(2);
  let port = 7531;
  let open = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--port' && args[i + 1]) { port = parseInt(args[i + 1]); i++; }
    if (args[i] === '--open') open = true;
    if (args[i] === '-h' || args[i] === '--help') {
      console.log(`Usage: node scripts/dashboard.js [--port <n>] [--open]

  --port <n>   Port number (default: 7531)
  --open       Open in default browser automatically
`);
      process.exit(0);
    }
  }
  return { port, open };
}

function main() {
  loadEnv();
  const { port, open } = parseArgs();

  const server = http.createServer(async (req, res) => {
    if (req.url === '/api/data') {
      try {
        const data = await fetchPipelineData();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    if (req.url === '/' || req.url === '/index.html') {
      const html = getDashboardHTML();
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }

    res.writeHead(404);
    res.end('Not found');
  });

  server.listen(port, () => {
    const url = `http://localhost:${port}`;
    console.log(`\n  Job Seeker Dashboard running at ${url}\n`);
    console.log(`  Press Ctrl+C to stop.\n`);

    if (open) {
      const { exec } = require('child_process');
      const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
      exec(`${cmd} ${url}`);
    }
  });
}

if (require.main === module) main();
module.exports = { getDashboardHTML };
