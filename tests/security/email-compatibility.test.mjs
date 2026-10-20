import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const nodemailer = require('nodemailer');
const { sendEmail } = require('../../scripts/send-email.js');
const createTransport = nodemailer.createTransport.bind(nodemailer);
const envPath = path.resolve('scripts', '..', '.env');
let attachmentDir;

function fakeEnv(contents = 'SMTP_USER=sender@example.invalid\nSMTP_PASS=synthetic-test-password') {
  const read = fs.readFileSync.bind(fs);
  const exists = fs.existsSync.bind(fs);
  vi.spyOn(fs, 'existsSync').mockImplementation(file => file === envPath || exists(file));
  vi.spyOn(fs, 'readFileSync').mockImplementation((file, ...args) =>
    file === envPath ? contents : read(file, ...args));
}

function memoryTransport() {
  return vi.spyOn(nodemailer, 'createTransport').mockImplementation(() =>
    createTransport({ streamTransport: true, buffer: true, newline: 'windows' }));
}

afterEach(() => {
  vi.restoreAllMocks();
  if (attachmentDir) fs.rmSync(attachmentDir, { recursive: true, force: true });
  attachmentDir = undefined;
});

describe('SMTP API compatibility, entirely in memory', () => {
  it('imports without reading .env or creating a transport', () => {
    const read = vi.spyOn(fs, 'readFileSync');
    const transport = vi.spyOn(nodemailer, 'createTransport');
    delete require.cache[require.resolve('../../scripts/send-email.js')];
    require('../../scripts/send-email.js');
    expect(read.mock.calls.some(([file]) => file === envPath)).toBe(false);
    expect(transport).not.toHaveBeenCalled();
  });

  it('preserves SMTP options, envelope and plain text', async () => {
    fakeEnv();
    const transport = memoryTransport();
    const info = await sendEmail({ to: 'recipient@example.invalid', subject: 'Test', body: 'Synthetic body' });
    expect(transport).toHaveBeenCalledWith({
      host: 'smtp.gmail.com', port: 465, secure: true,
      auth: { user: 'sender@example.invalid', pass: 'synthetic-test-password' },
    });
    expect(info.envelope).toEqual({ from: 'sender@example.invalid', to: ['recipient@example.invalid'] });
    expect(info.message.toString()).toContain('Content-Type: text/plain; charset=utf-8');
    expect(info.message.toString()).toContain('Synthetic body');
  });

  it('preserves HTML, custom sender and STARTTLS transport configuration', async () => {
    fakeEnv('SMTP_HOST=smtp.example.invalid\nSMTP_PORT=587\nSMTP_SECURE=false\nSMTP_USER=sender@example.invalid\nSMTP_PASS=test');
    const transport = memoryTransport();
    const info = await sendEmail({ to: 'recipient@example.invalid', from: 'custom@example.invalid', subject: 'Test', body: '<b>Test</b>', html: true });
    expect(transport).toHaveBeenCalledWith(expect.objectContaining({ host: 'smtp.example.invalid', port: 587, secure: false }));
    expect(info.envelope.from).toBe('custom@example.invalid');
    expect(info.message.toString()).toContain('Content-Type: text/html; charset=utf-8');
    expect(info.message.toString()).toContain('<b>Test</b>');
  });

  it('preserves file attachments using only a synthetic temporary file', async () => {
    fakeEnv();
    memoryTransport();
    attachmentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'job-seeker-email-test-'));
    const file = path.join(attachmentDir, 'synthetic.txt');
    fs.writeFileSync(file, 'Synthetic attachment');
    const info = await sendEmail({ to: 'recipient@example.invalid', subject: 'Test', body: 'Test', attach: [file] });
    expect(info.message.toString()).toContain('filename=synthetic.txt');
    expect(info.message.toString()).toContain(Buffer.from('Synthetic attachment').toString('base64'));
  });

  it('rejects missing credentials before creating any transport', () => {
    fakeEnv('');
    const transport = memoryTransport();
    expect(() => sendEmail({ to: 'recipient@example.invalid', subject: 'Test', body: 'Test' })).toThrow('SMTP_USER and SMTP_PASS');
    expect(transport).not.toHaveBeenCalled();
  });
});
