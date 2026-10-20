import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { afterAll } from 'vitest';

const require = createRequire(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BROWSER_JS = path.join(REPO_ROOT, '.agents/skills/browser-automation/scripts/browser.js');
const suiteRoot = process.env.JOB_SEEKER_TEST_ROOT;
const ORIGIN = process.env.JOB_SEEKER_TEST_ORIGIN;
if (!suiteRoot || !ORIGIN) throw new Error('Run browser tests through the Vitest global setup');
const TEST_WORKSPACE = fs.mkdtempSync(path.join(suiteRoot, 'workspace '));
const PROFILE_DIR = path.join(TEST_WORKSPACE, '.browser-profile');
const CONFIG_PATH = path.join(TEST_WORKSPACE, '.playwright', 'cli.config.json');
const TABS_PATH = path.join(PROFILE_DIR, 'tabs.json');
const LOCK_PATH = path.join(PROFILE_DIR, '.lock');
const AUTH_STATE_PATH = path.join(PROFILE_DIR, 'auth-state.json');
fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
const core = require('playwright-core');
const installed = [
  process.env.JOB_SEEKER_TEST_BROWSER,
  core.chromium.executablePath(),
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(file => file && fs.existsSync(file));
if (!installed) throw new Error('No test browser found. Set JOB_SEEKER_TEST_BROWSER to an installed Chromium executable. Tests never download browsers.');
fs.writeFileSync(CONFIG_PATH, JSON.stringify({
  browser: {
    browserName: 'chromium',
    launchOptions: {
      executablePath: installed, headless: true,
      proxy: { server: ORIGIN, bypass: '127.0.0.1' },
      args: ['--disable-background-networking', '--disable-component-update'],
    },
    contextOptions: { serviceWorkers: 'block' },
    initPage: [path.join(REPO_ROOT, 'tests/fixtures/local-only.cjs')],
  },
  network: { allowedOrigins: [ORIGIN] },
  timeouts: { action: 10000, navigation: 10000 },
  console: { level: 'info' },
}));

// Do not inherit endpoints, extensions, storage state or test hooks that could
// redirect a fresh CLI process to a personal browser or an existing registry.
const inherited = Object.fromEntries(Object.entries(process.env).filter(([name]) =>
  !/^(PLAYWRIGHT_MCP_|PLAYWRIGHT_CLI_|PWTEST_)/i.test(name)));
const TEST_ENV = {
  ...inherited,
  PWTEST_DAEMON_SESSION_DIR: path.join(TEST_WORKSPACE, 'daemon'),
  PLAYWRIGHT_CLI_SESSION: 'default',
  BROWSER_NO_UPDATE_CHECK: '1', NO_UPDATE_NOTIFIER: '1', CI: '1',
  BROWSER_MODE: 'headless',
};
// Each file owns its profile, registry and config, including during cleanup.
function run(args, opts = {}) {
  const cwd = opts.cwd || TEST_WORKSPACE;
  if (!path.resolve(cwd).startsWith(path.resolve(suiteRoot) + path.sep)) throw new Error('Test workspace must be inside the owned temporary root');
  const result = spawnSync(process.execPath, [BROWSER_JS, ...args], {
    cwd, env: { ...TEST_ENV, PWTEST_DAEMON_SESSION_DIR: path.join(cwd, 'daemon'), ...opts.env }, encoding: 'utf8',
    timeout: opts.timeout || 30000, windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  if (args[0] === 'open' && result.status !== 0) {
    console.error('Isolated browser startup failed:', result.stderr || result.stdout || result.error?.message);
  }
  return { stdout: result.stdout || '', stderr: result.stderr || result.error?.message || '', exitCode: result.status ?? 1 };
}
function newWorkspace() {
  const dir = fs.mkdtempSync(path.join(suiteRoot, 'workspace '));
  fs.mkdirSync(path.join(dir, '.playwright'));
  fs.copyFileSync(CONFIG_PATH, path.join(dir, '.playwright/cli.config.json'));
  return dir;
}
function script(args, opts = {}) {
  return spawnSync(process.execPath, args, {
    cwd: TEST_WORKSPACE, env: TEST_ENV, encoding: 'utf8', windowsHide: true,
    timeout: 15000, ...opts,
  });
}
function cleanup() {
  const result = run(['close-all', '--force']);
  if (result.exitCode !== 0) throw new Error(`Isolated cleanup failed: ${result.stderr}`);
  for (const file of [LOCK_PATH, TABS_PATH, AUTH_STATE_PATH]) fs.rmSync(file, { force: true });
}
afterAll(() => cleanup());
function tmpDir() { return fs.mkdtempSync(path.join(TEST_WORKSPACE, 'scratch ')); }
function resultValue(output) {
  return require('../../.agents/skills/browser-automation/scripts/helper.js').extractResultValue(output);
}
const HEADLESS = '--headless';
const TEST_URL_A = `${ORIGIN}/a`;
const TEST_URL_B = `${ORIGIN}/b`;
const TEST_URL_C = `${ORIGIN}/c`;
const TEST_URL_D = `${ORIGIN}/d`;
export { run, script, cleanup, tmpDir, resultValue, newWorkspace, TEST_ENV, TEST_WORKSPACE, ORIGIN,
  REPO_ROOT, BROWSER_JS, PROFILE_DIR, CONFIG_PATH, TABS_PATH, LOCK_PATH, AUTH_STATE_PATH,
  HEADLESS, TEST_URL_A, TEST_URL_B, TEST_URL_C, TEST_URL_D };
