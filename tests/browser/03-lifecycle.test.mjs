/**
 * Tests del lifecycle: open, ensure, status, close.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { run, cleanup, HEADLESS, TEST_URL_A, TEST_URL_B } from './helpers.mjs';

describe('lifecycle: open + ensure + close', () => {
  beforeAll(() => cleanup());
  afterAll(() => cleanup());

  it('open exits 0 and shows browser opened', () => {
    const result = run(['open', TEST_URL_A, HEADLESS]);
    expect(result.exitCode, result.stderr || result.stdout).toBe(0);
    expect(result.stdout).toContain('Browser');
  });

  it('ensure confirms healthy session', () => {
    const result = run(['ensure']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('active and healthy');
  });

  it('status shows browser_mode and active_sessions', () => {
    const result = run(['status']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Browser mode: headless');
    expect(result.stdout).toContain('Active sessions: default');
  });

  it('close exits 0', () => {
    const result = run(['close']);
    expect(result.exitCode).toBe(0);
  });

  it('ensure fails after close', () => {
    const result = run(['ensure']);
    expect(result.exitCode).toBe(1);
  });
});

describe('open reuses existing session', () => {
  beforeAll(() => cleanup());
  afterAll(() => cleanup());

  it('open then open again does goto instead of failing', () => {
    const open1 = run(['open', TEST_URL_A, HEADLESS]);
    expect(open1.exitCode, open1.stderr || open1.stdout).toBe(0);

    const open2 = run(['open', TEST_URL_B, HEADLESS]);
    expect(open2.exitCode).toBe(0);
    expect(open2.stderr).toContain('already active');
  });
});
