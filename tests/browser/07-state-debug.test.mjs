/**
 * Tests de auth state, debugging tools y edge cases.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'node:path';
import { run, cleanup, resultValue, ORIGIN, HEADLESS, TEST_URL_A, AUTH_STATE_PATH, LOCK_PATH, PROFILE_DIR, tmpDir, TEST_URL_B } from './helpers.mjs';

describe('save/load state', () => {
  beforeAll(() => {
    cleanup();
    run(['open', TEST_URL_A, HEADLESS]);
  });
  afterAll(() => cleanup());

  it('save-state creates auth-state.json', () => {
    expect(run(['exec', 'eval', "() => localStorage.setItem('synthetic-marker', 'fixture-only')"]).exitCode).toBe(0);
    const result = run(['save-state']);
    expect(result.exitCode).toBe(0);
    expect(fs.existsSync(AUTH_STATE_PATH)).toBe(true);
    const state = JSON.parse(fs.readFileSync(AUTH_STATE_PATH, 'utf8'));
    expect(state.cookies.map(cookie => cookie.domain)).toEqual([]);
    expect(state.origins.map(item => item.origin)).toEqual([ORIGIN]);
  });

  it('load-state restores from auth-state.json', () => {
    expect(run(['exec', 'eval', "() => localStorage.removeItem('synthetic-marker')"]).exitCode).toBe(0);
    const result = run(['load-state']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('loaded');
    expect(resultValue(run(['exec', 'eval', "() => localStorage.getItem('synthetic-marker')"]).stdout)).toBe('fixture-only');
  });

  it('load-state with missing file fails with clear error', () => {
    const result = run(['load-state', '--filename', path.join(tmpDir(), 'nonexistent.json')]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('not found');
  });

  it('save-state with custom filename', () => {
    const customPath = path.join(tmpDir(), 'synthetic-state.json');
    const result = run(['save-state', '--filename', customPath]);
    expect(result.exitCode).toBe(0);
    expect(fs.existsSync(customPath)).toBe(true);
    fs.unlinkSync(customPath);
  });
});

describe('console and requests', () => {
  beforeAll(() => {
    cleanup();
    run(['open', TEST_URL_A, HEADLESS]);
  });
  afterAll(() => cleanup());

  it('console error exits 0', () => {
    const result = run(['exec', 'console', 'error']);
    expect(result.exitCode).toBe(0);
  });

  it('console with invalid level exits 1', () => {
    const result = run(['console', 'invalid-level']);
    expect(result.exitCode).toBe(1);
  });

  it('requests exits 0', () => {
    const result = run(['exec', 'requests']);
    expect(result.exitCode).toBe(0);
  });
});

describe('trace and video', () => {
  beforeAll(() => {
    cleanup();
    run(['open', TEST_URL_A, HEADLESS]);
  });
  afterAll(() => cleanup());

  it('trace-start and trace-stop', () => {
    expect(run(['exec', 'tracing-start']).exitCode).toBe(0);
    expect(run(['exec', 'tracing-stop']).exitCode).toBe(0);
  });

  it('video-start and video-stop', () => {
    const started = run(['exec', 'video-start']);
    expect(started.exitCode, started.stderr || started.stdout).toBe(0);
    expect(run(['exec', 'eval', '() => new Promise(resolve => setTimeout(() => resolve(true), 300))']).exitCode).toBe(0);
    expect(run(['exec', 'video-stop']).exitCode).toBe(0);
  });
});

describe('legacy lockfiles do not control the current wrapper', () => {
  beforeAll(() => {
    cleanup();
    run(['open', TEST_URL_A, HEADLESS]);
  });
  afterAll(() => cleanup());

  it('ensure works with an obsolete synthetic lock present', () => {
    if (!fs.existsSync(PROFILE_DIR)) fs.mkdirSync(PROFILE_DIR, { recursive: true });
    fs.writeFileSync(LOCK_PATH, '99999');

    const result = run(['ensure']);
    expect(result.exitCode).toBe(0);
  });

  it('reopening does not depend on the obsolete lock', () => {
    fs.writeFileSync(LOCK_PATH, '99999');
    const result = run(['open', TEST_URL_B, HEADLESS]);
    expect(result.exitCode).toBe(0);
  });
});

describe('URL with dashes (parsing)', () => {
  beforeAll(() => cleanup());
  afterAll(() => cleanup());

  it('open with URL containing dashes in query string', () => {
    const result = run(['open', `${TEST_URL_A}?redirect=-foo`, HEADLESS]);
    expect(result.exitCode).toBe(0);
  });
});

describe('exec passthrough', () => {
  beforeAll(() => {
    cleanup();
    run(['open', TEST_URL_A, HEADLESS]);
  });
  afterAll(() => cleanup());

  it('exec eval returns page title', () => {
    const result = run(['exec', 'eval', 'document.title']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Example Domain');
  });

  it('exec snapshot exits 0', () => {
    const result = run(['exec', 'snapshot']);
    expect(result.exitCode).toBe(0);
  });

  it('exec with --tab selects tab then runs command', () => {
    run(['tab-new', TEST_URL_B, '--name', 'test-tab']);
    const result = run(['exec', 'eval', 'window.location.href', '--tab', 'test-tab']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(TEST_URL_B);
  });
});
