import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const helper = require('../../.agents/skills/browser-automation/scripts/helper.js');
let tempDir;

afterEach(() => {
  vi.unstubAllEnvs();
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  tempDir = undefined;
});

describe('local CLI migration without a browser or external sessions', () => {
  it('resolves the local CLI with an empty PATH and retains its command interface', () => {
    vi.stubEnv('PATH', '');
    expect(helper.cliPackageDir()).toBe(path.dirname(require.resolve('@playwright/cli/package.json')));
    const entry = helper.cliEntrypoint();
    const help = execFileSync(process.execPath, [entry, '--help'], {
      encoding: 'utf8', timeout: 10000,
      env: { ...process.env, CI: '1', NO_UPDATE_NOTIFIER: '1' },
    });
    for (const command of ['open', 'goto', 'close', 'snapshot', 'eval', 'tab-new', 'install-browser']) {
      expect(help).toContain(command);
    }
  });

  it('loads string flags from the hoisted playwright-core package', () => {
    expect(helper.buildArgs(['open', '--idle-timeout', '1500', '--headed'])).toEqual({
      _: ['open'], 'idle-timeout': '1500', headed: true,
    });
  });

  it('rejects synthetic sessions from an incompatible core version', () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'job-seeker-cli-test-'));
    const workspace = path.join(tempDir, 'workspace');
    fs.mkdirSync(path.join(workspace, '.playwright'), { recursive: true });
    const daemon = path.join(tempDir, 'daemon');
    const sessions = path.join(daemon, 'synthetic');
    fs.mkdirSync(sessions, { recursive: true });
    const socket = path.join(tempDir, 'synthetic-socket');
    fs.writeFileSync(socket, '');
    vi.stubEnv('PWTEST_DAEMON_SESSION_DIR', daemon);
    const base = { workspaceDir: workspace, name: 'security-test', socketPath: socket };
    const file = path.join(sessions, 'security-test.session');
    fs.writeFileSync(file, JSON.stringify({ ...base, version: '0.0.0' }));
    expect(helper.resolveSession(workspace, 'security-test')).toBeNull();
    const version = require('playwright-core/package.json').version;
    fs.writeFileSync(file, JSON.stringify({ ...base, version }));
    expect(helper.resolveSession(workspace, 'security-test')?.version).toBe(version);
  });
});
