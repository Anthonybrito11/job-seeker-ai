import auth from '../../lib/dashboard-auth.js';
import data from '../../lib/dashboard-data.js';
import { OAuth2Client } from 'google-auth-library';
import pg from 'pg';

const commonHeaders = { 'Cache-Control': 'private, no-store', 'Netlify-CDN-Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' };
const json = (body, status = 200) => Response.json(body, { status, headers: commonHeaders });
const redirect = (url, cookies = []) => {
  const headers = new Headers({ ...commonHeaders, Location: url });
  cookies.forEach(c => headers.append('Set-Cookie', c));
  return new Response(null, { status: 303, headers });
};

const loadPipeline = () => data.fetchPipelineData(pg.Client);
const googleLogin = (request, settings) => auth.completeLogin(request, settings,
  () => new OAuth2Client(settings.clientId, settings.clientSecret, settings.origin + '/auth/callback'));

export function createHandler({ loadData = loadPipeline, finishLogin = googleLogin, env = process.env } = {}) {
  return async function handler(request) {
    const url = new URL(request.url);
    let settings;
    try { settings = auth.configuration(env); } catch { return json({ error: 'El acceso privado todavía no está configurado.' }, 503); }
    if (request.method !== 'GET' && !(url.pathname === '/auth/logout' && request.method === 'POST')) return json({ error: 'Método no permitido.' }, 405);
    if (url.pathname === '/auth/login') {
      const flow = auth.startLogin(settings);
      return redirect(flow.url, [flow.cookie]);
    }
    if (url.pathname === '/auth/callback') {
      try {
        const sessionCookie = await finishLogin(request, settings);
        const clearFlow = auth.setCookie(auth.FLOW_COOKIE, '', 0);
        return sessionCookie ? redirect('/', [clearFlow, sessionCookie]) : redirect('/?auth=denied', [clearFlow]);
      } catch { return redirect('/?auth=error', [auth.setCookie(auth.FLOW_COOKIE, '', 0)]); }
    }
    if (url.pathname === '/auth/logout') {
      if (request.method !== 'POST' || request.headers.get('origin') !== settings.origin) return json({ error: 'Solicitud no permitida.' }, 403);
      return redirect('/', [auth.setCookie(auth.SESSION_COOKIE, '', 0)]);
    }
    const user = auth.session(request, settings);
    if (!user) return json({ error: 'Inicia sesión para ver tu panel.', login: '/auth/login' }, 401);
    if (url.pathname === '/auth/session') return json({ authenticated: true });
    if (url.pathname !== '/api/data') return json({ error: 'No encontrado.' }, 404);
    try { return json(await loadData()); }
    catch { return json({ error: 'No se pudieron consultar los datos. Vuelve a intentarlo.' }, 503); }
  };
}

export default createHandler();
export const config = { path: ['/api/data', '/auth/login', '/auth/callback', '/auth/logout', '/auth/session'] };
