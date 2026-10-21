import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { getServices, saveServices, getHistory, getLibrary, plan, execute, testService, exportData, importData, resetLibraryCache } from './lib.js';
import { snapshot, restoreFrom, DATA, securityInfo } from './db.js';
import { authRoutes, requireAuth, sameOrigin, bootstrapAdmin, AUTH_DISABLED } from './auth.js';

const MASK = '********';
const app = express();
app.disable('x-powered-by');
if (process.env.MMM_TRUST_PROXY === 'true') app.set('trust proxy', true); // behind a reverse proxy: honour X-Forwarded-* (client IP, https)
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});
app.use(express.json({ limit: '20mb' })); // imports can carry a long history
app.use('/api', sameOrigin);
authRoutes(app); // /api/auth/* handles its own access rules
app.use('/api', requireAuth); // everything below needs a signed-in user

const wrap = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((e) => res.status(500).json({ error: e.message }));
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

app.get('/api/services', (req, res) => res.json(getServices().map(mask)));
app.put('/api/services', wrap((req, res) => {
  const old = getServices();
  saveServices(req.body.map((s) => unmask(s, old)));
  res.json(getServices().map(mask));
}));
app.post('/api/services/test', wrap(async (req, res) => {
  try { res.json({ ok: true, detail: await testService(unmask(req.body, getServices())) }); }
  catch (e) { res.json({ ok: false, detail: e.message }); }
}));

app.get('/api/library', wrap(async (req, res) => {
  const { items, errors } = await getLibrary(req.query.refresh === '1');
  res.json({ items, errors, serviceTypes: [...new Set(getServices().map((s) => s.type))] });
}));
app.post('/api/plan', wrap(async (req, res) => res.json(await plan(req.body.keys))));
app.post('/api/delete', wrap(async (req, res) => res.json(await execute(req.body.keys, req.body.options))));
app.get('/api/history', (req, res) => res.json(getHistory()));

app.get('/api/export', wrap((req, res) => {
  res.json(exportData({ secrets: req.query.secrets === '1', history: req.query.history !== '0' }));
}));
app.post('/api/import', wrap((req, res) => {
  try { res.json(importData(req.body.data, req.body.options || {})); }
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

const dist = path.resolve('dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

await bootstrapAdmin();
const port = process.env.PORT || 3001;
app.listen(port, () => {
  console.log(`Media Middle Manager API on http://localhost:${port}`);
  if (AUTH_DISABLED) console.warn('WARNING: authentication is disabled (MMM_AUTH_DISABLED=true). Anyone who can reach this port can delete media.');
});
