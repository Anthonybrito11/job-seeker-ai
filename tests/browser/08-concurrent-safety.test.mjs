import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { run, cleanup, tmpDir, resultValue, newWorkspace, TEST_WORKSPACE, PROFILE_DIR,
  HEADLESS, TEST_URL_A, TEST_URL_B, TEST_URL_C, TEST_URL_D } from './helpers.mjs';

describe('current session safety contract, sequential access', () => {
  let other;
  beforeAll(() => {
    cleanup(); other = newWorkspace();
    expect(run(['open', TEST_URL_A, HEADLESS]).exitCode).toBe(0);
  });
  afterAll(() => { run(['close-all'], { cwd: other }); cleanup(); });
  it('reopening the same workspace navigates its existing session', () => {
    expect(run(['open', TEST_URL_B, HEADLESS]).exitCode).toBe(0);
    expect(run(['exec', 'eval', 'location.href']).stdout).toContain(TEST_URL_B);
  });
  it('explicit named tab selection prevents sequential worker interference', () => {
    expect(run(['tab-new', TEST_URL_C, '--name', 'agent-a']).exitCode).toBe(0);
    expect(run(['tab-new', TEST_URL_D, '--name', 'agent-b']).exitCode).toBe(0);
    expect(run(['goto', TEST_URL_A, '--tab', 'agent-a']).exitCode).toBe(0);
    expect(run(['exec', 'eval', 'location.href', '--tab', 'agent-b']).stdout).toContain(TEST_URL_D);
    expect(run(['exec', 'eval', 'location.href', '--tab', 'agent-a']).stdout).toContain(TEST_URL_A);
  });
  it('batch stops after an invalid command', () => {
    const file = path.join(tmpDir(), 'stop.json');
    fs.writeFileSync(file, JSON.stringify([['nonexistent-command'], ['eval', '1+1']]));
    const r = run(['batch', file]);
    expect(r.exitCode).toBe(1);
    expect(JSON.parse(r.stdout)).toHaveLength(1);
  });
  it('batch can explicitly continue after an invalid command', () => {
    const file = path.join(tmpDir(), 'continue.json');
    fs.writeFileSync(file, JSON.stringify({ commands: [['nonexistent-command'], ['eval', '1+1']], continueOnError: true }));
    const r = run(['batch', file]);
    expect(r.exitCode).toBe(1);
    const result = JSON.parse(r.stdout);
    expect(result).toHaveLength(2);
    expect(result[0].ok).toBe(false);
    expect(result[1].ok).toBe(true);
    expect(result[1].text).toContain('2');
  });
  it('external page requests are denied by the local-only fixture policy', () => {
    const r = run(['exec', 'eval', "async () => { try { await fetch('https://outside.invalid/test'); return 'unexpected'; } catch { return 'blocked'; } }"]);
    expect(r.exitCode, r.stderr).toBe(0);
    expect(resultValue(r.stdout)).toBe('blocked');
  });
  it('status exposes only the owned temporary profile', () => {
    expect(run(['status']).stdout).toContain(PROFILE_DIR);
    expect(PROFILE_DIR.startsWith(TEST_WORKSPACE + path.sep)).toBe(true);
  });
  it('closing a second temporary browser does not close the first', () => {
    const opened = run(['open', TEST_URL_C, HEADLESS], { cwd: other });
    expect(opened.exitCode, opened.stderr).toBe(0);
    expect(run(['close-all'], { cwd: other }).exitCode).toBe(0);
    expect(run(['ensure']).exitCode).toBe(0);
  });
  it('close is idempotent after ending the current session', () => {
    expect(run(['close']).exitCode).toBe(0);
    expect(run(['close']).exitCode).toBe(0);
    expect(run(['ensure']).exitCode).toBe(1);
  });
  for (const command of ['attach', 'detach', 'who']) {
    it(`reports the retired ${command} wrapper command as unsupported`, () => {
      const result = run([command]);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain(`Unknown command: ${command}`);
    });
  }
});
