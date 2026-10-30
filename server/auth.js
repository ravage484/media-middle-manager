import crypto from 'node:crypto';
import { log } from './log.js';
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
const TTL = 14 * DAY; // sliding: renewed while you keep using the app
const MAX_LIFETIME = 30 * DAY; // absolute: even a busy session must sign in again after this
const iso = (ms) => new Date(ms).toISOString();
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

/* ---------- passwords ---------- */
// scrypt, N=2^16 r=8 p=2 (~64 MB, an OWASP-recommended equivalent of N=2^17 p=1). The parameters are stored in each hash,
// so they can be raised later; a hash made with weaker parameters is upgraded the next time its owner signs in.
const PARAMS = { N: 65536, r: 8, p: 2 };
const LEGACY = { N: 16384, r: 8, p: 1 }; // the first version stored "scrypt$16384$salt$hash"
const MAX = { N: 1 << 20, r: 16, p: 4 }; // a restored/tampered hash must not be able to demand unbounded memory or time

// At most two hashes run at once, so a flood of login attempts cannot exhaust memory (each one needs ~64 MB).
let running = 0;
const waiting = [];
const slot = () => new Promise((res) => { if (running < 2) { running++; res(); } else waiting.push(res); });
const release = () => { const next = waiting.shift(); if (next) next(); else running--; };
async function scrypt(pw, salt, { N, r, p }) {
  await slot();
  try {
    return await new Promise((res, rej) => crypto.scrypt(pw, salt, 64, { N, r, p, maxmem: 256 * 1024 * 1024 }, (e, k) => (e ? rej(e) : res(k))));
  } finally { release(); }
}

export async function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const { N, r, p } = PARAMS;
  return `scrypt$${N}$${r}$${p}$${salt.toString('base64')}$${(await scrypt(pw, salt, PARAMS)).toString('base64')}`;
}

function parseHash(stored) {
  const parts = String(stored).split('$');
  if (parts[0] !== 'scrypt') return null;
  const [N, r, p, salt, hash] = parts.length === 4 ? [parts[1], LEGACY.r, LEGACY.p, parts[2], parts[3]] : parts.slice(1);
  const prm = { N: Number(N), r: Number(r), p: Number(p) };
  if (![prm.N, prm.r, prm.p].every(Number.isInteger) || prm.N < 2 || (prm.N & (prm.N - 1)) !== 0 || prm.N > MAX.N || prm.r < 1 || prm.r > MAX.r || prm.p < 1 || prm.p > MAX.p) return null;
  return { prm, salt: Buffer.from(salt || '', 'base64'), hash: Buffer.from(hash || '', 'base64') };
}
const isWeaker = (prm) => prm.N < PARAMS.N || prm.r < PARAMS.r || prm.p < PARAMS.p;

// Returns { ok, needsRehash }.
async function verifyPassword(pw, stored) {
  const h = parseHash(stored);
  if (!h || !h.hash.length) return { ok: false, needsRehash: false };
  const got = await scrypt(pw, h.salt, h.prm);
  return { ok: got.length === h.hash.length && crypto.timingSafeEqual(got, h.hash), needsRehash: isWeaker(h.prm) };
}
let dummyHash; // verified against when the user doesn't exist, so timing doesn't reveal which usernames exist
const dummy = async () => (dummyHash ||= await hashPassword(crypto.randomBytes(8).toString('hex')));

const validUsername = (u) => typeof u === 'string' && /^[A-Za-z0-9._@-]{3,40}$/.test(u);
const validPassword = (p, username = '') =>
  typeof p === 'string' && p.length >= 10 && p.length <= 200 &&
  p.toLowerCase() !== String(username).toLowerCase() && // not the username
  new Set(p).size > 3; // not "aaaaaaaaaa" or "abababababab"
const USERNAME_RULE = 'Username must be 3-40 characters: letters, numbers and . _ @ -';
const PASSWORD_RULE = 'Password must be 10-200 characters, must not be your username, and must not be a single repeated character.';

/* ---------- login throttling (in memory) ---------- */
// One source is cut off after 5 failures (and for longer each time). A username is only locked after 20 failures from
// ANY sources, for 5 minutes: enough to stop a distributed guesser, but too many for a stranger to lock you out cheaply.
const fails = new Map(); // key -> { n, until }
const LIMITS = { ip: { after: 5, lock: (n) => Math.min(15 * 60000, 30000 * 2 ** (n - 5)) }, user: { after: 20, lock: () => 5 * 60000 } };
const lockedFor = (keys) => Math.max(0, ...keys.map((k) => (fails.get(k)?.until || 0) - Date.now()));
function recordFail(keys) {
  for (const k of keys) {
    const lim = LIMITS[k.split(':')[0]];
    const f = fails.get(k) || { n: 0, until: 0 };
    f.n++;
    if (f.n >= lim.after) f.until = Date.now() + lim.lock(f.n);
    fails.set(k, f);
  }
}
setInterval(() => { for (const [k, f] of fails) if (f.until < Date.now() - 3600000) fails.delete(k); }, 600000).unref();
// Failed logins go to the log (journalctl) so tools like fail2ban can use them. Attacker-supplied text is sanitised.
const clean = (s) => JSON.stringify(String(s).replace(/[^\x20-\x7e]/g, '?').slice(0, 40));
const logFail = (req, username, what) => log.warn('auth', `${what} for user ${clean(username)} from ${clean(req.ip)}`);

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
  const row = db.prepare('SELECT s.user_id, s.last_seen, s.created_at, u.username FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?').get(hash, iso(Date.now()));
  if (!row) return null;
  if (Date.now() - Date.parse(row.created_at) > MAX_LIFETIME) { db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hash); return null; }
  if (Date.now() - Date.parse(row.last_seen) > 3600000) { // sliding expiry, written at most hourly
    db.prepare('UPDATE sessions SET last_seen = ?, expires_at = ? WHERE token_hash = ?').run(iso(Date.now()), iso(Date.now() + TTL), hash);
  }
  return { userId: row.user_id, username: row.username, hash };
}

const setCookie = (req, res, token, maxAgeSec) =>
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAgeSec}${req.secure ? '; Secure' : ''}`);
const userCount = () => db.prepare('SELECT COUNT(*) AS c FROM users').get().c;

// Sessions past either limit are dead weight: the sliding expiry has passed, or they are older than the absolute lifetime.
const sweep = () => db.prepare('DELETE FROM sessions WHERE expires_at < ? OR created_at < ?').run(iso(Date.now()), iso(Date.now() - MAX_LIFETIME));
setInterval(sweep, 3600000).unref();
sweep();

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
    if (!validPassword(password, username)) return res.status(400).json({ error: PASSWORD_RULE });
    const id = await createFirstUser(username, password);
    if (!id) return res.status(409).json({ error: 'An account already exists. Sign in instead.' });
    log.info('auth', 'first account created', { user: username, ip: req.ip });
    ok(req, res, id, username);
  });

  app.post('/api/auth/login', async (req, res) => {
    if (AUTH_DISABLED) return res.status(400).json({ error: 'Authentication is disabled' });
    const { username, password } = req.body || {};
    const keys = [`ip:${req.ip}`, `user:${String(username).toLowerCase()}`];
    const wait = lockedFor(keys);
    if (wait > 0) {
      logFail(req, username, 'login refused (locked out)');
      res.setHeader('Retry-After', Math.ceil(wait / 1000));
      return res.status(429).json({ error: `Too many failed attempts. Try again in ${Math.ceil(wait / 60000)} minute(s).` });
    }
    const user = typeof username === 'string' && typeof password === 'string'
      ? db.prepare('SELECT id, username, password_hash FROM users WHERE username = ?').get(username) : null;
    const check = await verifyPassword(String(password), user ? user.password_hash : await dummy());
    if (!check.ok || !user) { recordFail(keys); logFail(req, username, 'failed login'); return res.status(401).json({ error: 'Wrong username or password' }); }
    fails.delete(keys[0]); fails.delete(keys[1]);
    // The password was right, so this is the moment to move an older, weaker hash up to the current parameters.
    if (check.needsRehash) db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await hashPassword(String(password)), user.id);
    log.info('auth', 'signed in', { user: user.username, ip: req.ip });
    ok(req, res, user.id, user.username);
  });

  app.post('/api/auth/logout', (req, res) => {
    const s = sessionFor(req);
    if (s) { db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(s.hash); log.info('auth', 'signed out', { user: s.username }); }
    setCookie(req, res, '', 0);
    res.json({ ok: true });
  });

  app.post('/api/auth/password', requireAuth, async (req, res) => {
    if (AUTH_DISABLED) return res.status(400).json({ error: 'Authentication is disabled' });
    const { current, next } = req.body || {};
    const user = db.prepare('SELECT id, username, password_hash FROM users WHERE id = ?').get(req.user.userId);
    const keys = [`ip:${req.ip}`];
    if (lockedFor(keys) > 0) return res.status(429).json({ error: 'Too many failed attempts. Try again later.' });
    if (!(await verifyPassword(String(current), user.password_hash)).ok) { recordFail(keys); logFail(req, user.username, 'wrong current password on password change'); return res.status(401).json({ error: 'Current password is wrong' }); }
    if (!validPassword(next, user.username)) return res.status(400).json({ error: PASSWORD_RULE });
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await hashPassword(next), user.id);
    db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').run(user.id, req.user.hash); // sign out everywhere else
    log.info('auth', 'password changed, other sessions signed out', { user: user.username });
    res.json({ ok: true });
  });
}

// Atomic: the row is only inserted if no user exists at that instant, so two simultaneous first-run requests
// cannot both create an account (hashing is slow, so a separate "is there a user?" check would leave a window).
async function createFirstUser(username, password) {
  const hash = await hashPassword(password);
  const r = db.prepare('INSERT INTO users (username, password_hash, created_at) SELECT ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM users)').run(username, hash, iso(Date.now()));
  return r.changes === 1 ? r.lastInsertRowid : null;
}

// Create the first account from the environment, so a fresh container never sits on an open setup page.
export async function bootstrapAdmin() {
  const { MMM_ADMIN_USER: u, MMM_ADMIN_PASSWORD: p } = process.env;
  if (AUTH_DISABLED || userCount() > 0 || !u || !p) return;
  if (!validUsername(u) || !validPassword(p, u)) { log.error('auth', `MMM_ADMIN_USER / MMM_ADMIN_PASSWORD ignored. ${USERNAME_RULE} ${PASSWORD_RULE}`); return; }
  if (await createFirstUser(u, p)) log.info('auth', 'account created from environment variables', { user: u });
}
