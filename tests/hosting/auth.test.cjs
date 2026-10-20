const { test } = require('node:test');
const assert = require('node:assert/strict');
const auth = require('../../lib/dashboard-auth');
const env = { GOOGLE_CLIENT_ID: 'test-client', GOOGLE_CLIENT_SECRET: 'test-client-secret',
  DASHBOARD_SESSION_SECRET: 's'.repeat(64), DASHBOARD_ALLOWED_EMAIL: 'owner@example.test', DASHBOARD_ORIGIN: 'https://example.test' };
const settings = auth.configuration(env);
const request = (path, token, name = auth.SESSION_COOKIE) => new Request(settings.origin + path, { headers: token ? { cookie: `${name}=${token}` } : {} });

test('authentication fails closed if required configuration is missing or unsafe', () => {
  assert.throws(() => auth.configuration({}));
  assert.throws(() => auth.configuration({ ...env, DASHBOARD_SESSION_SECRET: 'short' }));
  assert.throws(() => auth.configuration({ ...env, DASHBOARD_ORIGIN: 'http://example.test' }));
});

test('sessions reject tampering, expiry, wrong purpose and a different owner', () => {
  const payload = { purpose: 'session', email: settings.allowedEmail, sub: 'test-owner', exp: Math.floor(Date.now()/1000)+3600 };
  const signed = auth.sign(payload, settings.secret);
  assert.equal(auth.session(request('/api/data', signed), settings).sub, 'test-owner');
  assert.equal(auth.session(request('/api/data', signed + 'x'), settings), null);
  for (const change of [{ exp: 1 }, { purpose: 'oauth' }, { email: 'other@example.test' }]) {
    assert.equal(auth.session(request('/api/data', auth.sign({ ...payload, ...change }, settings.secret)), settings), null);
  }
  assert.equal(auth.session(request('/api/data'), settings), null);
});

test('Google flow binds state, nonce, PKCE and verifies the Google ID token', async () => {
  const login = auth.startLogin(settings);
  const url = new URL(login.url);
  assert.equal(url.searchParams.get('scope'), 'openid email');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.ok(!url.searchParams.has('access_type'));
  assert.match(login.cookie, /HttpOnly; Secure; SameSite=Lax/);
  const flowToken = login.cookie.split(';')[0].split('=')[1];
  let called = false;
  const makeClient = (changes = {}) => () => ({
    getToken: async opts => { called = true; assert.ok(opts.codeVerifier); return { tokens: { id_token: 'verified-by-library' } }; },
    verifyIdToken: async opts => {
      assert.equal(opts.audience, settings.clientId);
      return { getPayload: () => ({ sub: 'test-owner', email: settings.allowedEmail, email_verified: true, nonce: url.searchParams.get('nonce'), ...changes }) };
    },
  });
  const callback = '/auth/callback?code=one-time-code&state=' + url.searchParams.get('state');
  const result = await auth.completeLogin(request(callback, flowToken, auth.FLOW_COOKIE), settings, makeClient());
  assert.match(result, /^__Host-dashboard_session=/);
  for (const changes of [{ email: 'other@example.test' }, { nonce: 'wrong' }, { email_verified: false }]) {
    assert.equal(await auth.completeLogin(request(callback, flowToken, auth.FLOW_COOKIE), settings, makeClient(changes)), null);
  }
  called = false;
  assert.equal(await auth.completeLogin(request('/auth/callback?code=x&state=wrong', flowToken, auth.FLOW_COOKIE), settings, makeClient()), null);
  assert.equal(called, false);
});

test('API never queries the database for anonymous callers, and does not expose errors', async () => {
  const { createHandler } = await import('../../netlify/functions/dashboard.mjs');
  let calls = 0;
  const handler = createHandler({ env, loadData: async () => { calls++; return { active: [], userName: 'Example' }; } });
  assert.equal((await handler(request('/api/data'))).status, 401);
  assert.equal(calls, 0);
  const token = auth.sign({ purpose: 'session', email: settings.allowedEmail, sub: 'owner', exp: Math.floor(Date.now()/1000)+1000 }, settings.secret);
  const response = await handler(request('/api/data', token));
  assert.equal(response.status, 200); assert.equal(calls, 1);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  const broken = createHandler({ env, loadData: async () => { throw new Error('postgres://secret:password@host/database'); } });
  const error = await broken(request('/api/data', token));
  assert.equal(error.status, 503); assert.ok(!(await error.text()).includes('password'));
  assert.equal((await createHandler({ env: {} })(request('/api/data'))).status, 503);
  assert.equal((await handler(new Request(settings.origin+'/auth/logout', { method: 'POST', headers: { origin: 'https://evil.example' } }))).status, 403);
});
