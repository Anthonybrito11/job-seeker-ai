import { describe, expect, it } from 'vitest';
import http from 'node:http';
import net from 'node:net';

const origin = new URL(process.env.JOB_SEEKER_TEST_ORIGIN);
function request(options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(origin, options, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', data => { body += data; });
      response.on('end', () => resolve({ status: response.statusCode, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

describe('local fixtures and deny-only browser proxy', () => {
  it('serves the synthetic page directly over loopback', async () => {
    const result = await request({ path: '/a' });
    expect(result.status).toBe(200);
    expect(result.body).toContain('Local synthetic page /a');
  });
  it('rejects external proxy URLs without forwarding them', async () => {
    // The TCP connection is only to loopback; outside.invalid is request data.
    expect((await request({ path: 'http://outside.invalid/test' })).status).toBe(403);
  });
  it('rejects HTTPS tunnels without opening a remote connection', async () => {
    const status = await new Promise((resolve, reject) => {
      const req = http.request(origin, { method: 'CONNECT', path: 'outside.invalid:443' });
      req.on('connect', (response, socket) => { socket.destroy(); resolve(response.statusCode); });
      req.on('error', reject);
      req.end();
    });
    expect(status).toBe(403);
  });
  it('survives clients that cancel proxy tunnels before reading the denial', async () => {
    await Promise.all(Array.from({ length: 20 }, () => new Promise((resolve, reject) => {
      const socket = net.createConnection({ host: origin.hostname, port: Number(origin.port) });
      socket.on('error', reject);
      socket.on('close', resolve);
      socket.on('connect', () => {
        socket.write('CONNECT outside.invalid:443 HTTP/1.1\r\nHost: outside.invalid:443\r\n\r\n');
        socket.destroy();
      });
    })));
    expect((await request({ path: '/a' })).status).toBe(200);
  });
});
