import { fork } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export default async function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'job-seeker tests '));
  const server = fork(fileURLToPath(new URL('./fixtures/server.cjs', import.meta.url)), [], {
    stdio: ['ignore', 'ignore', 'pipe', 'ipc'], windowsHide: true,
  });
  let stopping = false;
  let diagnostics = '';
  server.stderr.on('data', data => { diagnostics = (diagnostics + data.toString()).slice(-16000); });
  server.on('exit', (code, signal) => {
    if (!stopping) console.error(`Fixture server exited unexpectedly (${code ?? signal}): ${diagnostics}`);
  });
  try {
    const port = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Local fixture server did not start')), 10000);
      server.once('message', message => { clearTimeout(timer); resolve(message.port); });
      server.once('error', error => { clearTimeout(timer); reject(error); });
      server.once('exit', code => { clearTimeout(timer); reject(new Error(`Fixture server exited: ${code}`)); });
    });
    process.env.JOB_SEEKER_TEST_ROOT = root;
    process.env.JOB_SEEKER_TEST_ORIGIN = `http://127.0.0.1:${port}`;
  } catch (error) {
    stopping = true;
    server.kill();
    fs.rmSync(root, { recursive: true, force: true });
    throw error;
  }
  return async () => {
    stopping = true;
    try {
      if (server.exitCode === null && server.signalCode === null) {
        await new Promise(resolve => {
          const timer = setTimeout(() => server.kill(), 5000);
          server.once('exit', () => { clearTimeout(timer); resolve(); });
          if (server.connected) server.disconnect();
          else server.kill();
        });
      }
    } finally {
      // root is the exact directory created above, never a user-supplied path.
      fs.rmSync(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
    }
  };
}
