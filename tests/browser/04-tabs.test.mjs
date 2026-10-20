import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import { run, cleanup, TABS_PATH, HEADLESS, TEST_URL_A, TEST_URL_B, TEST_URL_C, TEST_URL_D } from './helpers.mjs';

// Named tabs are created by the wrapper; raw tab management uses exec.
describe('tab management through the current wrapper API', () => {
  beforeAll(() => { cleanup(); expect(run(['open', TEST_URL_A, HEADLESS]).exitCode).toBe(0); });
  afterAll(() => cleanup());
  it('tab-new creates a named tab', () => {
    const result = run(['tab-new', TEST_URL_B, '--name', 'tab-b']);
    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.stdout).toContain("Tab 'tab-b' created");
  });
  it('tab-new creates a second tab', () => { expect(run(['tab-new', TEST_URL_C, '--name', 'tab-c']).exitCode).toBe(0); });
  it('exec tab-list shows all live tabs', () => {
    const result = run(['exec', 'tab-list']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(TEST_URL_B);
    expect(result.stdout).toContain(TEST_URL_C);
  });
  it('the named mapping is valid JSON and records distinct tab indexes', () => {
    const state = JSON.parse(fs.readFileSync(TABS_PATH, 'utf8'));
    expect(Object.keys(state.tabs)).toHaveLength(3);
    expect(state.tabs['tab-b'].index).not.toBe(state.tabs['tab-c'].index);
    expect(state.tabs['tab-b'].url).toBe(TEST_URL_B);
  });
  it('exec tab-select selects a tab by index', () => { expect(run(['exec', 'tab-select', '1']).exitCode).toBe(0); });
  it('named targeting fails for a nonexistent tab', () => {
    const result = run(['exec', 'eval', 'location.href', '--tab', 'nonexistent']);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('not found');
  });
  it('exec tab-close closes a tab by index', () => { expect(run(['exec', 'tab-close', '2']).exitCode).toBe(0); });
  it('closed tab is removed from the live list', () => { expect(run(['exec', 'tab-list']).stdout).not.toContain(TEST_URL_C); });
  it('closing extra tabs in descending order leaves one tab', () => {
    expect(run(['tab-new', TEST_URL_D, '--name', 'tab-d']).exitCode).toBe(0);
    expect(run(['exec', 'eval', 'location.href', '--tab', 'tab-d']).stdout).toContain(TEST_URL_D);
    expect(run(['exec', 'tab-close', '2']).exitCode).toBe(0);
    expect(run(['exec', 'tab-close', '1']).exitCode).toBe(0);
    const result = run(['exec', 'tab-list']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain(TEST_URL_D);
    expect(result.stdout).not.toContain(TEST_URL_B);
  });
});
