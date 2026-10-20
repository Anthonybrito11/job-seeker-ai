import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { run, cleanup, tmpDir, HEADLESS, TEST_URL_A, TEST_URL_B, TEST_URL_C, TEST_URL_D } from './helpers.mjs';

// The current wrapper explicitly requires sequential tab access. A CLI batch
// preserves ordering without Unix background jobs or a shared-tab race.
describe('ordered multi-tab work', () => {
  beforeAll(() => {
    cleanup();
    expect(run(['open', TEST_URL_A, HEADLESS]).exitCode).toBe(0);
    expect(run(['tab-new', TEST_URL_B, '--name', 'worker-a']).exitCode).toBe(0);
    expect(run(['tab-new', TEST_URL_C, '--name', 'worker-b']).exitCode).toBe(0);
  });
  afterAll(() => cleanup());
  it('sequential workers read their own named tabs', () => {
    expect(run(['exec', 'eval', 'location.href', '--tab', 'worker-a']).stdout).toContain(TEST_URL_B);
    expect(run(['exec', 'eval', 'location.href', '--tab', 'worker-b']).stdout).toContain(TEST_URL_C);
  });
  it('a batch navigates two tabs and reads each in order', () => {
    const file = path.join(tmpDir(), 'commands.json');
    fs.writeFileSync(file, JSON.stringify([
      ['tab-select', '1'], ['goto', TEST_URL_D], ['eval', 'location.href'],
      ['tab-select', '2'], ['goto', TEST_URL_A], ['eval', 'location.href'],
    ]));
    const r = run(['batch', file]);
    expect(r.exitCode, r.stderr).toBe(0);
    const results = JSON.parse(r.stdout);
    expect(results).toHaveLength(6);
    expect(results.every(item => item.ok)).toBe(true);
    expect(results[2].text).toContain(TEST_URL_D);
    expect(results[5].text).toContain(TEST_URL_A);
  });
  it('each tab retains its final URL after the batch', () => {
    expect(run(['exec', 'eval', 'location.href', '--tab', 'worker-a']).stdout).toContain(TEST_URL_D);
    expect(run(['exec', 'eval', 'location.href', '--tab', 'worker-b']).stdout).toContain(TEST_URL_A);
  });
});
