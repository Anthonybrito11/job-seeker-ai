/**
 * Tests de sintaxis, help y configuración.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'node:path';

import { run, script, cleanup, CONFIG_PATH, REPO_ROOT, BROWSER_JS } from './helpers.mjs';

describe('browser.js syntax and help', () => {
  it('has valid JavaScript syntax at the current skill path', () => {
    expect(script(['--check', BROWSER_JS]).status).toBe(0);
  });
  it('linkedin-warm-sourcing.js has valid JavaScript syntax', () => {
    expect(script(['--check', path.join(REPO_ROOT, 'scripts/linkedin-warm-sourcing.js')]).status).toBe(0);
  });
  it('linkedin-warm-sourcing.js exits 2 without --company', () => {
    expect(script([path.join(REPO_ROOT, 'scripts/linkedin-warm-sourcing.js')]).status).toBe(2);
  });
  it('linkedin-warm-sourcing.js exits 2 when isolated browser is not running', () => {
    cleanup();
    const result = script([path.join(REPO_ROOT, 'scripts/linkedin-warm-sourcing.js'), '--company', 'Synthetic Company']);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('not active');
  });
  it('linkedin-warm-sourcing.js --help exits 0', () => {
    const result = script([path.join(REPO_ROOT, 'scripts/linkedin-warm-sourcing.js'), '--help']);
    expect(result.status).toBe(0);
    for (const flag of ['--company', '--role', '--json']) expect(result.stdout).toContain(flag);
  });
  it('--help exits 0', () => { expect(run(['--help']).exitCode).toBe(0); });
  it('help describes the current wrapper API', () => {
    const result = run(['--help']);
    for (const command of ['open', 'goto', 'close', 'close-all', 'ensure', 'exec', 'tab-new', 'save-state', 'load-state', 'status', 'batch', 'observe', 'wait-dom', 'wait-for']) {
      expect(result.stdout).toContain(command);
    }
  });
});

describe('config file', () => {
  it('exists', () => {
    expect(fs.existsSync(CONFIG_PATH)).toBe(true);
  });

  it('is valid JSON with expected fields', () => {
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    expect(config.browser).toBeDefined();
    expect(config.browser.launchOptions.executablePath).toBeDefined();
    expect(config.browser.launchOptions.headless).toBe(true);
    expect(config.timeouts).toBeDefined();
    expect(typeof config.timeouts.action).toBe('number');
    expect(typeof config.timeouts.navigation).toBe('number');
    expect(config.network).toBeDefined();
    expect(Array.isArray(config.network.allowedOrigins)).toBe(true);
    expect(config.network.allowedOrigins.length).toBeGreaterThan(0);
    expect(config.console).toBeDefined();
    expect(config.console.level).toBeDefined();
  });
});
