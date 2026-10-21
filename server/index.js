import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { getServices, saveServices, getHistory, getLibrary, plan, execute, testService, exportData, importData } from './lib.js';

const MASK = '********';
const app = express();
app.use(express.json({ limit: '20mb' })); // imports can carry a long history

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

const dist = path.resolve('dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

const port = process.env.PORT || 3001;
app.listen(port, () => console.log(`Media Middle Manager API on http://localhost:${port}`));
