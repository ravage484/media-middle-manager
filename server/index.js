import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { getServices, saveServices, getHistory, getLibrary, plan, execute, testService, exportData, importData, resetLibraryCache, cleanService } from './lib.js';
import { snapshot, restoreFrom, DATA, securityInfo } from './db.js';
import { authRoutes, requireAuth, sameOrigin, bootstrapAdmin, AUTH_DISABLED } from './auth.js';

const MASK = '********';
const app = express();
app.disable('x-powered-by');
if (process.env.MMM_TRUST_PROXY === 'true') app.set('trust proxy', true); // behind a reverse proxy: honour X-Forwarded-* (client IP, https)

// Everything the app loads comes from itself, except poster images, which are fetched from the image hosts Radarr/Sonarr name.
const CSP = [
  "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'", "img-src 'self' data: https: http:",
  "font-src 'self' data:", "connect-src 'self'", "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'",
].join('; ');
app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  if (req.secure) res.setHeader('Strict-Transport-Security', 'max-age=15552000'); // 180 days; only sent over HTTPS
  if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store'); // library, exports and backups must not be cached
  next();
});

// Bodies are parsed before anyone is signed in, so the default limit is small. Only the (authenticated) import may be large.
const smallJson = express.json({ limit: '100kb' });
const bigJson = express.json({ limit: '20mb' }); // an import can carry a long history
app.use((req, res, next) => (req.method === 'POST' && req.path === '/api/import' ? next() : smallJson(req, res, next)));
app.use('/api', sameOrigin);
authRoutes(app); // /api/auth/* handles its own access rules
app.use('/api', requireAuth); // everything below needs a signed-in user

const wrap = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((e) => res.status(500).json({ error: e.message }));
const bad = (res, msg) => res.status(400).json({ error: msg });
const mask = (s) => ({ ...s, apiKey: s.apiKey ? MASK : '', password: s.password ? MASK : '' });
// Replace masked secrets with the stored ones.
const unmask = (s, old) => {
  const prev = old.find((o) => o.id === s.id) || {};
  return {
    ...s,
    id: s.id || crypto.randomUUID(),
    apiKey: s.apiKey === MASK ? prev.apiKey || '' : s.apiKey || '',
    password: s.password === MASK ? prev.password || '' : s.password || '',
  };
};
const asObject = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

// Titles are addressed by keys like "movie:603" or "show:81189"; nothing else is accepted.
const KEY_RE = /^(movie|show):[A-Za-z0-9@._-]{1,120}$/;
function cleanKeys(keys) {
  if (!Array.isArray(keys) || !keys.length || keys.length > 1000 || !keys.every((k) => typeof k === 'string' && KEY_RE.test(k))) {
    throw new Error('Expected a list of 1 to 1000 titles');
  }
  return [...new Set(keys)];
}
// Missing options mean the least destructive choice; unknown values are rejected rather than guessed.
function cleanOptions(o) {
  o = asObject(o);
  if (o.overseerr !== undefined && !['delete', 'decline', 'none'].includes(o.overseerr)) throw new Error('Invalid Overseerr option');
  return { overseerr: o.overseerr ?? 'none', unmonitor: true, files: o.files === true, torrents: o.torrents === true, plex: o.plex === true };
}

app.get('/api/services', (req, res) => res.json(getServices().map(mask)));
app.put('/api/services', wrap((req, res) => {
  if (!Array.isArray(req.body) || req.body.length > 100) return bad(res, 'Expected a list of at most 100 services');
  const old = getServices();
  let list;
  try { list = req.body.map((s, i) => cleanService(unmask(asObject(s), old), i)); } catch (e) { return bad(res, e.message); }
  if (new Set(list.map((s) => s.id)).size !== list.length) return bad(res, 'Duplicate service ids');
  saveServices(list);
  res.json(getServices().map(mask));
}));
app.post('/api/services/test', wrap(async (req, res) => {
  let svc;
  try { svc = cleanService(unmask({ name: 'test', ...asObject(req.body) }, getServices())); } catch (e) { return bad(res, e.message); }
  try { res.json({ ok: true, detail: await testService(svc) }); }
  catch (e) { res.json({ ok: false, detail: e.message }); }
}));

app.get('/api/library', wrap(async (req, res) => {
  const { items, errors } = await getLibrary(req.query.refresh === '1');
  res.json({ items, errors, serviceTypes: [...new Set(getServices().map((s) => s.type))] });
}));
app.post('/api/plan', wrap(async (req, res) => {
  let keys;
  try { keys = cleanKeys(asObject(req.body).keys); } catch (e) { return bad(res, e.message); }
  res.json(await plan(keys));
}));
app.post('/api/delete', wrap(async (req, res) => {
  let keys, options;
  try { keys = cleanKeys(asObject(req.body).keys); options = cleanOptions(asObject(req.body).options); } catch (e) { return bad(res, e.message); }
  res.json(await execute(keys, options));
}));
app.get('/api/history', (req, res) => res.json(getHistory()));

app.get('/api/export', wrap((req, res) => {
  res.json(exportData({ secrets: req.query.secrets === '1', history: req.query.history !== '0' }));
}));
app.post('/api/import', bigJson, wrap((req, res) => {
  try { res.json(importData(asObject(req.body).data, asObject(asObject(req.body).options))); }
  catch (e) { res.status(400).json({ error: e.message }); }
}));

app.get('/api/security', (req, res) => res.json(securityInfo()));

// Whole-database backup. API keys inside it are encrypted, but the password hash is not, so keep it private.
app.get('/api/backup/db', wrap((req, res) => {
  res.setHeader('Content-Type', 'application/vnd.sqlite3');
  res.setHeader('Content-Disposition', `attachment; filename="mmm-backup-${new Date().toISOString().slice(0, 10)}.db"`);
  res.send(snapshot());
}));
app.post('/api/restore', express.raw({ type: () => true, limit: '100mb' }), wrap((req, res) => {
  if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: 'No file received' });
  // Optional key of the install that made the backup, sent base64-encoded in a header (never in the URL). It is not logged or stored.
  let sourceKey;
  const hdr = req.headers['x-source-key'];
  if (hdr !== undefined) {
    if (typeof hdr !== 'string' || hdr.length > 2000 || !/^[A-Za-z0-9+/=]*$/.test(hdr)) return res.status(400).json({ error: 'The key was not sent in the expected format' });
    sourceKey = Buffer.from(hdr, 'base64').toString('utf8');
    if (!sourceKey.trim()) sourceKey = undefined;
  }
  const tmp = path.join(DATA, `restore-${Date.now()}.tmp.db`);
  fs.writeFileSync(tmp, req.body);
  try {
    const result = restoreFrom(tmp, sourceKey);
    resetLibraryCache();
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  } finally {
    for (const f of [tmp, `${tmp}-wal`, `${tmp}-shm`]) fs.rmSync(f, { force: true });
  }
}));

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' })); // unknown API paths never fall through to the web page

const dist = path.resolve('dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist, { dotfiles: 'ignore' }));
  app.get('*', (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

// Last resort: never send a stack trace or an HTML error page.
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'The request is too large' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'The request is not valid JSON' });
  const status = Number.isInteger(err.status) && err.status >= 400 && err.status < 600 ? err.status : 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Internal error' : 'Bad request' });
});

await bootstrapAdmin();
const port = process.env.PORT || 3001;
const host = process.env.MMM_HOST || undefined; // e.g. 127.0.0.1 when a reverse proxy on the same machine is the only client
app.listen(port, host, () => {
  console.log(`Media Middle Manager API on http://${host || 'localhost'}:${port}`);
  if (AUTH_DISABLED) console.warn('WARNING: authentication is disabled (MMM_AUTH_DISABLED=true). Anyone who can reach this port can delete media.');
});
