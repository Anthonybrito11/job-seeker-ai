import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { run, cleanup, newWorkspace, TEST_WORKSPACE, PROFILE_DIR, HEADLESS, TEST_URL_A, TEST_URL_B } from './helpers.mjs';

// --session/attach/ref-count were removed from the wrapper. The CLI session
// environment and independent working directories are the supported boundaries.
describe('named CLI session through its environment', () => {
  const named = args => run(args, { env: { PLAYWRIGHT_CLI_SESSION: 'synthetic-session' } });
  beforeAll(() => cleanup());
  afterAll(() => cleanup());
  it('opens a named CLI session', () => { const r = named(['open', TEST_URL_A, HEADLESS]); expect(r.exitCode, r.stderr).toBe(0); });
  it('ensure confirms the named session', () => { expect(named(['ensure']).exitCode).toBe(0); });
  it('goto navigates the named session', () => {
    expect(named(['goto', TEST_URL_B]).exitCode).toBe(0);
    expect(named(['exec', 'eval', 'location.href']).stdout).toContain(TEST_URL_B);
  });
  it('close ends the named session', () => {
    expect(named(['close']).exitCode).toBe(0);
    expect(named(['ensure']).exitCode).toBe(1);
  });
});

describe('workspace and profile isolation', () => {
  let other;
  beforeAll(() => { cleanup(); other = newWorkspace(); });
  afterAll(() => { run(['close-all'], { cwd: other }); cleanup(); });
  it('opens a session in the first temporary workspace', () => { expect(run(['open', TEST_URL_A, HEADLESS]).exitCode).toBe(0); });
  it('a second workspace sees no active session', () => { expect(run(['ensure'], { cwd: other }).exitCode).toBe(1); });
  it('the first workspace remains active', () => { expect(run(['ensure']).exitCode).toBe(0); });
  it('status reports only its own temporary profile', () => {
    const r = run(['status']);
    expect(r.stdout).toContain(PROFILE_DIR);
    expect(r.stdout).not.toContain(path.join(other, '.browser-profile'));
  });
  it('profile and daemon state are beneath the owned workspace', () => {
    expect(fs.existsSync(path.join(TEST_WORKSPACE, 'daemon'))).toBe(true);
    expect(fs.existsSync(PROFILE_DIR)).toBe(true);
  });
  it('closing an empty second workspace leaves the first alive', () => {
    expect(run(['close-all'], { cwd: other }).exitCode).toBe(0);
    expect(run(['ensure']).exitCode).toBe(0);
  });
});
