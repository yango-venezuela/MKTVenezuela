import express from 'express';
import { rateLimit } from 'express-rate-limit';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { COOKIE, SESSION_SECONDS, cookieValue, issueSession, readSession, verifyPassword } from './lib/auth.mjs';
import { DataProvider } from './lib/sheets.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));

export function createApp(config = process.env, provider = new DataProvider(config)) {
  if (!config.APP_USERNAME || !config.APP_PASSWORD_HASH || String(config.SESSION_SECRET || '').length < 32) throw new Error('Configura APP_USERNAME, APP_PASSWORD_HASH y SESSION_SECRET antes de iniciar.');
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use((req, res, next) => {
    res.set({
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'",
      'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin',
      'Cache-Control': 'no-store', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    });
    next();
  });
  app.use(express.json({ limit: '4kb' }));
  const session = req => readSession(cookieValue(req.headers.cookie), config.APP_USERNAME, config.SESSION_SECRET);
  const secure = req => config.NODE_ENV === 'production' || req.secure;
  const options = req => ({ httpOnly: true, sameSite: 'strict', secure: secure(req), path: '/' });
  const sameOrigin = (req, res, next) => {
    const expected = config.PUBLIC_BASE_URL ? new URL(config.PUBLIC_BASE_URL).origin : `${req.protocol}://${req.get('host')}`;
    if (req.headers.origin !== expected) return res.status(403).json({ error: 'Solicitud no permitida.' });
    next();
  };
  const requireSession = (req, res, next) => session(req) ? next() : res.status(401).json({ error: 'Inicia sesion para continuar.' });
  app.get('/healthz', (req, res) => res.json({ status: 'ok' }));
  app.get('/login', (req, res) => session(req) ? res.redirect('/') : res.sendFile(path.join(root, 'public/login.html')));
  app.get('/', (req, res) => session(req) ? res.sendFile(path.join(root, 'public/index.html')) : res.redirect('/login'));
  app.get('/api/session', (req, res) => {
    const current = session(req);
    return current ? res.json({ username: current.user }) : res.status(401).json({ error: 'Sesion no disponible.' });
  });
  app.post('/api/login', sameOrigin, rateLimit({ windowMs: 15 * 60 * 1000, limit: 12, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Demasiados intentos. Intenta de nuevo mas tarde.' } }), async (req, res) => {
    const valid = await verifyPassword(req.body?.password, config.APP_PASSWORD_HASH);
    if (!valid || req.body?.username !== config.APP_USERNAME) return res.status(401).json({ error: 'Usuario o clave incorrectos.' });
    res.cookie(COOKIE, issueSession(config.APP_USERNAME, config.SESSION_SECRET), { ...options(req), maxAge: SESSION_SECONDS * 1000 });
    return res.json({ ok: true });
  });
  app.post('/api/logout', sameOrigin, (req, res) => { res.clearCookie(COOKIE, options(req)); res.json({ ok: true }); });
  app.get('/api/dashboard', requireSession, async (req, res) => {
    try { res.json(await provider.load(req.query.refresh === '1')); }
    catch { res.status(503).json({ error: 'No pudimos cargar los datos. Intenta actualizar mas tarde.' }); }
  });
  app.get('/vendor/chart.js', (req, res) => res.sendFile(path.join(root, 'node_modules/chart.js/dist/chart.umd.js')));
  app.get('/vendor/lucide.js', (req, res) => res.sendFile(path.join(root, 'node_modules/lucide/dist/umd/lucide.js')));
  app.use('/assets', express.static(path.join(root, 'public/assets'), { dotfiles: 'deny', maxAge: 0 }));
  for (const file of ['styles.css', 'login.css', 'app.js', 'login.js', 'model.js', 'runtime.js', 'chart-weeks.js']) app.get(`/${file}`, (req, res) => res.sendFile(path.join(root, 'public', file)));
  app.use((req, res) => res.status(404).json({ error: 'No encontrado.' }));
  app.use((error, req, res, next) => res.status(error.status === 413 ? 413 : 400).json({ error: 'Solicitud invalida.' }));
  return app;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT || 4173);
  createApp().listen(port, process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1', () => console.log(`Measurement Venezuela: http://localhost:${port}`));
}
