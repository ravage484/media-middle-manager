import crypto from 'node:crypto';
import { db } from './db.js';

/*
 * Local accounts with cookie sessions.
 *  - Passwords: scrypt with a per-user salt.
 *  - Sessions: a random token in an HttpOnly, SameSite=Strict cookie; only its SHA-256 is stored.
 *  - Env: MMM_AUTH_DISABLED=true (for use behind an authenticating proxy), MMM_ADMIN_USER / MMM_ADMIN_PASSWORD
 *    (create the first account without the setup page), MMM_TRUST_PROXY=true (use X-Forwarded-* headers).
 */
export const AUTH_DISABLED = process.env.MMM_AUTH_DISABLED === 'true';

const COOKIE = 'mmm_session';
const DAY = 86400000;
const TTL = 14 * DAY;
const iso = (ms) => new Date(ms).toISOString();
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

/* ---------- passwords ---------- */
const N = 16384;
const scrypt = (pw, salt) => new Promise((res, rej) => crypto.scrypt(pw, salt, 64, { N, r: 8, p: 1 }, (e, k) => (e ? rej(e) : res(k))));

export async function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  return `scrypt$${N}$${salt.toString('base64')}$${(await scrypt(pw, salt)).toString('base64')}`;
}
async function verifyPassword(pw, stored) {
  const [alg, n, salt, hash] = String(stored).split('$');
  if (alg !== 'scrypt' || Number(n) !== N) return false;
  const want = Buffer.from(hash, 'base64');
  const got = await scrypt(pw, Buffer.from(salt, 'base64'));
  return want.length === got.length && crypto.timingSafeEqual(want, got);
}
let dummyHash; // verified against when the user doesn't exist, so timing doesn't reveal which usernames exist
const dummy = async () => (dummyHash ||= await hashPassword(crypto.randomBytes(8).toString('hex')));

const validUsername = (u) => typeof u === 'string' && /^[A-Za-z0-9._@-]{3,40}$/.test(u);
const validPassword = (p) => typeof p === 'string' && p.length >= 10 && p.length <= 200;
const USERNAME_RULE = 'Username must be 3-40 characters: letters, numbers and . _ @ -';
const PASSWORD_RULE = 'Password must be at least 10 characters.';

/* ---------- login throttling (in memory, per IP and per username) ---------- */
const fails = new Map(); // key -> { n, until }
const lockedFor = (keys) => Math.max(0, ...keys.map((k) => (fails.get(k)?.until || 0) - Date.now()));
function recordFail(keys) {
  for (const k of keys) {
    const f = fails.get(k) || { n: 0, until: 0 };
    f.n++;
    if (f.n >= 5) f.until = Date.now() + Math.min(15 * 60000, 30000 * 2 ** (f.n - 5));
    fails.set(k, f);
  }
}
setInterval(() => { for (const [k, f] of fails) if (f.until < Date.now() - 3600000) fails.delete(k); }, 600000).unref();

/* ---------- sessions ---------- */
function createSession(userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const now = Date.now();
  db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at, last_seen) VALUES (?, ?, ?, ?, ?)').run(sha(token), userId, iso(now), iso(now + TTL), iso(now));
  return token;
}

function cookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) { try { out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); } catch { /* ignore */ } }
  }
  return out;
}

function sessionFor(req) {
  const token = cookies(req)[COOKIE];
  if (!token) return null;
  const hash = sha(token);
  const row = db.prepare('SELECT s.user_id, s.last_seen, u.username FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?').get(hash, iso(Date.now()));
  if (!row) return null;
  if (Date.now() - Date.parse(row.last_seen) > 3600000) { // sliding expiry, written at most hourly
    db.prepare('UPDATE sessions SET last_seen = ?, expires_at = ? WHERE token_hash = ?').run(iso(Date.now()), iso(Date.now() + TTL), hash);
  }
  return { userId: row.user_id, username: row.username, hash };
}

const setCookie = (req, res, token, maxAgeSec) =>
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAgeSec}${req.secure ? '; Secure' : ''}`);
const userCount = () => db.prepare('SELECT COUNT(*) AS c FROM users').get().c;

setInterval(() => db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(iso(Date.now())), 3600000).unref();
db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(iso(Date.now()));

/* ---------- middleware ---------- */
// Cookies are SameSite=Strict already; this also rejects state-changing requests that name a different origin.
export function sameOrigin(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.headers.origin;
  if (origin) {
    const host = (req.app.get('trust proxy') && req.headers['x-forwarded-host']) || req.headers.host;
    try { if (new URL(origin).host !== host) return res.status(403).json({ error: 'Cross-origin request blocked' }); }
    catch { return res.status(403).json({ error: 'Cross-origin request blocked' }); }
  }
  next();
}

export function requireAuth(req, res, next) {
  if (AUTH_DISABLED) return next();
  const s = sessionFor(req);
  if (!s) return res.status(401).json({ error: 'Not signed in' });
  req.user = s;
  next();
}

/* ---------- routes ---------- */
export function authRoutes(app) {
  const ok = (req, res, userId, username) => {
    setCookie(req, res, createSession(userId), TTL / 1000);
    res.json({ username });
  };

  app.get('/api/auth/status', (req, res) => {
    if (AUTH_DISABLED) return res.json({ authDisabled: true, setupRequired: false, authenticated: true, username: null });
    const s = sessionFor(req);
    res.json({ authDisabled: false, setupRequired: userCount() === 0, authenticated: !!s, username: s?.username || null });
  });

  app.post('/api/auth/setup', async (req, res) => {
    if (AUTH_DISABLED) return res.status(400).json({ error: 'Authentication is disabled' });
    if (userCount() > 0) return res.status(409).json({ error: 'An account already exists. Sign in instead.' });
    const { username, password } = req.body || {};
    if (!validUsername(username)) return res.status(400).json({ error: USERNAME_RULE });
    if (!validPassword(password)) return res.status(400).json({ error: PASSWORD_RULE });
    const r = db.prepare('INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)').run(username, await hashPassword(password), iso(Date.now()));
    ok(req, res, r.lastInsertRowid, username);
  });

  app.post('/api/auth/login', async (req, res) => {
    if (AUTH_DISABLED) return res.status(400).json({ error: 'Authentication is disabled' });
    const { username, password } = req.body || {};
    const keys = [`ip:${req.ip}`, `user:${String(username).toLowerCase()}`];
    const wait = lockedFor(keys);
    if (wait > 0) {
      res.setHeader('Retry-After', Math.ceil(wait / 1000));
      return res.status(429).json({ error: `Too many failed attempts. Try again in ${Math.ceil(wait / 60000)} minute(s).` });
    }
    const user = typeof username === 'string' && typeof password === 'string'
      ? db.prepare('SELECT id, username, password_hash FROM users WHERE username = ?').get(username) : null;
    const good = await verifyPassword(String(password), user ? user.password_hash : await dummy()) && !!user;
    if (!good) { recordFail(keys); return res.status(401).json({ error: 'Wrong username or password' }); }
    for (const k of keys) fails.delete(k);
    ok(req, res, user.id, user.username);
  });

  app.post('/api/auth/logout', (req, res) => {
    const s = sessionFor(req);
    if (s) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(s.hash);
    setCookie(req, res, '', 0);
    res.json({ ok: true });
  });

  app.post('/api/auth/password', requireAuth, async (req, res) => {
    if (AUTH_DISABLED) return res.status(400).json({ error: 'Authentication is disabled' });
    const { current, next } = req.body || {};
    const user = db.prepare('SELECT id, password_hash FROM users WHERE id = ?').get(req.user.userId);
    if (!(await verifyPassword(String(current), user.password_hash))) return res.status(401).json({ error: 'Current password is wrong' });
    if (!validPassword(next)) return res.status(400).json({ error: PASSWORD_RULE });
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await hashPassword(next), user.id);
    db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').run(user.id, req.user.hash); // sign out everywhere else
    res.json({ ok: true });
  });
}

// Create the first account from the environment, so a fresh container never sits on an open setup page.
export async function bootstrapAdmin() {
  const { MMM_ADMIN_USER: u, MMM_ADMIN_PASSWORD: p } = process.env;
  if (AUTH_DISABLED || userCount() > 0 || !u || !p) return;
  if (!validUsername(u) || !validPassword(p)) { console.error(`MMM_ADMIN_USER / MMM_ADMIN_PASSWORD ignored. ${USERNAME_RULE} ${PASSWORD_RULE}`); return; }
  db.prepare('INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)').run(u, await hashPassword(p), iso(Date.now()));
  console.log(`Created account "${u}" from environment variables`);
}
