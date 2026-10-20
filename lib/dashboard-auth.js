'use strict';
const { createHmac, timingSafeEqual, randomBytes, createHash } = require('node:crypto');

const SESSION_COOKIE = '__Host-dashboard_session';
const FLOW_COOKIE = '__Host-dashboard_oauth';
const SESSION_SECONDS = 60 * 60 * 24 * 7;

function configuration(env = process.env) {
  const { GOOGLE_CLIENT_ID: clientId, GOOGLE_CLIENT_SECRET: clientSecret,
    DASHBOARD_SESSION_SECRET: secret, DASHBOARD_ALLOWED_EMAIL: allowedEmail } = env;
  if (!clientId || !clientSecret || !secret || secret.length < 32 || !allowedEmail) {
    throw new Error('Dashboard authentication is not configured');
  }
  const origin = new URL(env.DASHBOARD_ORIGIN);
  if (origin.protocol !== 'https:' || origin.pathname !== '/' || origin.search || origin.hash || origin.username || origin.password) {
    throw new Error('A canonical HTTPS origin is required');
  }
  return { clientId, clientSecret, secret, allowedEmail: allowedEmail.trim().toLowerCase(), origin: origin.origin };
}

function sign(payload, secret) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return body + '.' + createHmac('sha256', secret).update(body).digest('base64url');
}

function verify(token, secret, purpose, now = Date.now()) {
  try {
    if (!token || token.length > 4096) return null;
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const signature = Buffer.from(parts[1], 'base64url');
    const expected = createHmac('sha256', secret).update(parts[0]).digest();
    if (signature.length !== expected.length || !timingSafeEqual(signature, expected)) return null;
    const payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
    if (payload.purpose !== purpose || !Number.isSafeInteger(payload.exp) || payload.exp <= Math.floor(now / 1000)) return null;
    return payload;
  } catch { return null; }
}

function cookie(request, name) {
  return (request.headers.get('cookie') || '').split(';').map(s => s.trim()).find(s => s.startsWith(name + '='))?.slice(name.length + 1);
}

function setCookie(name, value, seconds) {
  return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${seconds}`;
}

function session(request, settings) {
  const payload = verify(cookie(request, SESSION_COOKIE), settings.secret, 'session');
  return payload && payload.email === settings.allowedEmail && typeof payload.sub === 'string' && payload.sub ? payload : null;
}

function startLogin(settings) {
  const state = randomBytes(32).toString('base64url');
  const nonce = randomBytes(32).toString('base64url');
  const verifier = randomBytes(48).toString('base64url');
  const payload = { purpose: 'oauth', state, nonce, verifier, exp: Math.floor(Date.now() / 1000) + 600 };
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  const params = { client_id: settings.clientId, redirect_uri: settings.origin + '/auth/callback',
    response_type: 'code', scope: 'openid email', state, nonce, prompt: 'select_account',
    code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' };
  Object.entries(params).forEach(([k,v]) => url.searchParams.set(k,v));
  return { url: url.href, cookie: setCookie(FLOW_COOKIE, sign(payload, settings.secret), 600) };
}

async function completeLogin(request, settings, clientFactory) {
  const url = new URL(request.url);
  const flow = verify(cookie(request, FLOW_COOKIE), settings.secret, 'oauth');
  if (!flow || !url.searchParams.get('code') || url.searchParams.get('state') !== flow.state || url.searchParams.has('error')) {
    return null;
  }
  const client = clientFactory();
  const { tokens } = await client.getToken({ code: url.searchParams.get('code'), codeVerifier: flow.verifier, redirect_uri: settings.origin + '/auth/callback' });
  if (!tokens.id_token) return null;
  const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: settings.clientId });
  const user = ticket.getPayload();
  if (!user || user.nonce !== flow.nonce || user.email_verified !== true || user.email?.toLowerCase() !== settings.allowedEmail || !user.sub) return null;
  const payload = { purpose: 'session', email: settings.allowedEmail, sub: user.sub, exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS };
  return setCookie(SESSION_COOKIE, sign(payload, settings.secret), SESSION_SECONDS);
}

module.exports = { configuration, sign, verify, cookie, setCookie, session, startLogin, completeLogin, SESSION_COOKIE, FLOW_COOKIE };
