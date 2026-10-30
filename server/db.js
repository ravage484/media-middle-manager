import Database from 'better-sqlite3';
import { log } from './log.js';
import fs from 'node:fs';
import path from 'node:path';
import { initKey, keySource, encryptSecret, decryptSecret, decryptSecretWith, deriveKey, isEncrypted, canDecrypt, aadFor } from './secrets.js';

// Everything the app writes (database, keys, backups) is for its own account only: no group or world access.
try { process.umask(0o077); } catch { /* not supported on this platform */ }
export const DATA = process.env.DATA_DIR || path.resolve('data');
fs.mkdirSync(DATA, { recursive: true, mode: 0o700 });
try { fs.chmodSync(DATA, 0o700); } catch { /* not ours to change */ }
initKey(DATA);
export const securityInfo = () => ({ encryption: 'AES-256-GCM', keySource });

export const db = new Database(path.join(DATA, 'mmm.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('secure_delete = ON'); // overwrite deleted data with zeros instead of leaving it in free pages
// Files from earlier versions were created with the default permissions: tighten them.
for (const f of ['mmm.db', 'mmm.db-wal', 'mmm.db-shm', 'secret.key']) { try { fs.chmodSync(path.join(DATA, f), 0o600); } catch { /* missing, or not ours */ } }

// Schema changes go at the end of this list; PRAGMA user_version records how many have run.
const MIGRATIONS = [
  `
  CREATE TABLE services (
    id        TEXT PRIMARY KEY,
    position  INTEGER NOT NULL,
    type      TEXT NOT NULL,
    name      TEXT NOT NULL,
    url       TEXT NOT NULL,
    api_key   TEXT NOT NULL DEFAULT '',
    username  TEXT NOT NULL DEFAULT '',
    password  TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE history (
    id          TEXT PRIMARY KEY,
    at          TEXT NOT NULL,
    key         TEXT,
    title       TEXT,
    year        INTEGER,
    type        TEXT,
    ok          INTEGER NOT NULL DEFAULT 0,
    freed_bytes INTEGER NOT NULL DEFAULT 0,
    data        TEXT NOT NULL
  );
  CREATE INDEX history_at ON history (at);
  CREATE TABLE users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL
  );
  CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    last_seen  TEXT NOT NULL
  );
  CREATE INDEX sessions_user ON sessions (user_id);
  `,
  // v2: a cache of what Overseerr (TMDB) says about each title, so the library can be filtered by keyword without asking again.
  `
  CREATE TABLE title_meta (
    key        TEXT PRIMARY KEY,
    keywords   TEXT NOT NULL DEFAULT '[]',
    fetched_at TEXT NOT NULL
  );
  `,
  // v3: app-wide settings that are not tied to a service or a user (JSON values), such as how keywords are kept up to date.
  `
  CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  `,
  // v4: what Plex says about each library title (found, watched, collections, playlists), kept so the library can filter by it
  // and the title menu opens instantly.
  `
  CREATE TABLE plex_meta (
    key        TEXT PRIMARY KEY,
    data       TEXT NOT NULL,
    fetched_at TEXT NOT NULL
  );
  `,
  // v5: titles marked "Keep": left out of the Stale list until the mark is removed. This is the user's own choice, so unlike the
  // caches above it travels with backups and exports.
  `
  CREATE TABLE keep (
    key TEXT PRIMARY KEY,
    at  TEXT NOT NULL
  );
  `,
];

for (let v = db.pragma('user_version', { simple: true }); v < MIGRATIONS.length; v++) {
  db.transaction(() => {
    db.exec(MIGRATIONS[v]);
    db.pragma(`user_version = ${v + 1}`);
  })();
}

/* ---------- services (api_key and password are stored encrypted) ---------- */
export const getServices = () =>
  db.prepare('SELECT * FROM services ORDER BY position').all().map((r) => ({
    id: r.id, type: r.type, name: r.name, url: r.url, username: r.username,
    apiKey: decryptSecret(r.api_key, aadFor(r.id, 'api_key')),
    password: decryptSecret(r.password, aadFor(r.id, 'password')),
  }));

export const saveServices = db.transaction((list) => {
  db.prepare('DELETE FROM services').run();
  const ins = db.prepare('INSERT INTO services (id, position, type, name, url, api_key, username, password) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  list.forEach((s, i) => ins.run(
    s.id, i, s.type, s.name, s.url,
    encryptSecret(s.apiKey || '', aadFor(s.id, 'api_key')), s.username || '', encryptSecret(s.password || '', aadFor(s.id, 'password')),
  ));
});

// At startup: refuse to run with the wrong key (instead of silently breaking every service),
// and encrypt anything still stored in plain text (older versions, hand-edited rows, old backups).
function protectSecrets() {
  const rows = db.prepare('SELECT id, api_key, password FROM services').all();
  const bad = rows.filter((r) => [['api_key', r.api_key], ['password', r.password]].some(([c, v]) => isEncrypted(v) && !canDecrypt(v, aadFor(r.id, c))));
  if (bad.length) {
    throw new Error(
      `Cannot decrypt the stored API keys for ${bad.length} service(s). The encryption key does not match the one they were saved with. ` +
      'Restore the original data/secret.key, or set MMM_SECRET_KEY to the original key. (Currently using the key from: ' + keySource + '.)',
    );
  }
  const upd = db.prepare('UPDATE services SET api_key = ?, password = ? WHERE id = ?');
  let n = 0;
  db.transaction(() => {
    for (const r of rows) {
      if ((r.api_key && !isEncrypted(r.api_key)) || (r.password && !isEncrypted(r.password))) {
        upd.run(encryptSecret(decryptSecret(r.api_key, ''), aadFor(r.id, 'api_key')), encryptSecret(decryptSecret(r.password, ''), aadFor(r.id, 'password')), r.id);
        n++;
      }
    }
  })();
  if (n) {
    // The old plain text is still in the file's free space and write-ahead log: compact both so it is really gone.
    db.exec('VACUUM');
    db.pragma('wal_checkpoint(TRUNCATE)');
    log.info('db', `encrypted the stored credentials of ${n} service(s)`);
  }
}
protectSecrets();

/* ---------- history (one row per deletion; the full entry is kept as JSON in `data`) ---------- */
const putHistory = db.prepare(
  'INSERT OR REPLACE INTO history (id, at, key, title, year, type, ok, freed_bytes, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
);
const insertEntry = (e) => putHistory.run(e.id, e.at, e.key ?? null, e.title ?? null, e.year ?? null, e.type ?? null, e.ok ? 1 : 0, Number(e.freedBytes) || 0, JSON.stringify(e));

export const getHistory = () => db.prepare('SELECT data FROM history ORDER BY at DESC, rowid DESC').all().map((r) => JSON.parse(r.data));
export const addHistory = insertEntry;
export const replaceHistory = db.transaction((list) => {
  db.prepare('DELETE FROM history').run();
  list.forEach(insertEntry);
});

/* ---------- keyword cache (what Overseerr/TMDB says about each title) ---------- */
export const getKeywordMap = () => {
  const out = {};
  for (const r of db.prepare('SELECT key, keywords FROM title_meta').all()) { try { out[r.key] = JSON.parse(r.keywords); } catch { out[r.key] = []; } }
  return out;
};
export const cachedKeywordKeys = () => new Set(db.prepare('SELECT key FROM title_meta').all().map((r) => r.key));
export const setKeywords = (key, list) =>
  db.prepare('INSERT OR REPLACE INTO title_meta (key, keywords, fetched_at) VALUES (?, ?, ?)').run(key, JSON.stringify(list), new Date().toISOString());

/* ---------- Plex cache (one JSON entry per library title) ---------- */
export const getPlexMap = () => {
  const out = {};
  for (const r of db.prepare('SELECT key, data FROM plex_meta').all()) { try { out[r.key] = JSON.parse(r.data); } catch { /* skip a damaged row */ } }
  return out;
};
export const plexMetaKeys = () => new Set(db.prepare('SELECT key FROM plex_meta').all().map((r) => r.key));
export const setPlexMeta = (key, entry) =>
  db.prepare('INSERT OR REPLACE INTO plex_meta (key, data, fetched_at) VALUES (?, ?, ?)').run(key, JSON.stringify(entry), new Date().toISOString());
// A full sync replaces everything, which also drops titles that have left the library.
export const replacePlexMeta = db.transaction((entries) => {
  db.exec('DELETE FROM plex_meta');
  const ins = db.prepare('INSERT INTO plex_meta (key, data, fetched_at) VALUES (?, ?, ?)');
  const at = new Date().toISOString();
  for (const [key, entry] of Object.entries(entries)) ins.run(key, JSON.stringify(entry), at);
});

/* ---------- Keep list ---------- */
export const getKeepMap = () => Object.fromEntries(db.prepare('SELECT key, at FROM keep').all().map((r) => [r.key, r.at]));
export const setKeepMany = db.transaction((keys, on) => {
  const at = new Date().toISOString();
  const add = db.prepare('INSERT OR IGNORE INTO keep (key, at) VALUES (?, ?)'); // keeping again leaves the original date
  const del = db.prepare('DELETE FROM keep WHERE key = ?');
  for (const k of keys) on ? add.run(k, at) : del.run(k);
});
// Entries that come with their own dates (an import file); one that is already kept stays as it is.
export const addKeepEntries = db.transaction((entries) => {
  const add = db.prepare('INSERT OR IGNORE INTO keep (key, at) VALUES (?, ?)');
  for (const [k, at] of entries) add.run(k, at);
});
export const replaceKeep = db.transaction((entries) => {
  db.exec('DELETE FROM keep');
  const add = db.prepare('INSERT OR IGNORE INTO keep (key, at) VALUES (?, ?)');
  for (const [k, at] of entries) add.run(k, at);
});

/* ---------- app settings (JSON values by key) ---------- */
export const getSetting = (key, fallback) => {
  const r = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  if (!r) return fallback;
  try { return JSON.parse(r.value); } catch { return fallback; }
};
export const setSetting = (key, value) => db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, JSON.stringify(value));

/* ---------- whole-database backup and restore ---------- */
// A consistent copy of the live database (taken in one read transaction, safe while the app runs).
export const snapshot = () => db.serialize();

const SQLITE_MAGIC = 'SQLite format 3\u0000';
const TABLES = ['services', 'history', 'users', 'sessions'];

// Replaces services, history and accounts with the contents of a backup file.
// Sessions are never restored, so tokens from an old backup cannot sign anyone in.
// sourceKey (optional): the key of the install that made the backup (its secret.key, or the MMM_SECRET_KEY value).
// It is used once to read the backup's API keys, which are re-encrypted under THIS install's key as they are copied in.
// It is never stored or logged.
export function restoreFrom(file, sourceKey) {
  const srcKey = sourceKey ? deriveKey(sourceKey) : null;
  const head = Buffer.alloc(16);
  const fd = fs.openSync(file, 'r');
  try { fs.readSync(fd, head, 0, 16, 0); } finally { fs.closeSync(fd); }
  if (head.toString('latin1') !== SQLITE_MAGIC) throw new Error('This is not a SQLite database file');

  let counts;
  let bk;
  try {
    bk = new Database(file, { fileMustExist: true });
    if (bk.pragma('integrity_check', { simple: true }) !== 'ok') throw new Error('The backup file is damaged (integrity check failed)');
    const v = bk.pragma('user_version', { simple: true });
    // Older backups are fine: the tables that are restored (services, history, users) have not changed since schema 1,
    // and anything added later is a cache that is rebuilt. A backup from a NEWER version is refused.
    if (v < 1 || v > MIGRATIONS.length) throw new Error(`The backup was made by a different version of the app (schema ${v}, this install uses ${MIGRATIONS.length})`);
    const have = bk.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name);
    for (const t of TABLES) if (!have.includes(t)) throw new Error(`The backup is missing the "${t}" table`);
    const n = (t) => bk.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get().c;
    counts = { services: n('services'), history: n('history'), users: n('users') };
    if (!counts.users) throw new Error('The backup has no user account, so you could not sign in after restoring it');
    // Stored keys are encrypted: only accept the backup if the supplied key (or, if none, this install's key) can read them.
    const cant = bk.prepare('SELECT id, api_key, password FROM services').all()
      .filter((r) => [['api_key', r.api_key], ['password', r.password]].some(([c, v]) => isEncrypted(v) && !canDecrypt(v, aadFor(r.id, c), srcKey || undefined)));
    if (cant.length && srcKey) {
      throw new Error('The key you entered does not match this backup. Use the secret.key (or the MMM_SECRET_KEY value) from the install that made it.');
    }
    if (cant.length) {
      throw new Error('The API keys in this backup were encrypted with a different key than this install uses. Enter the key of the install that made the backup (its secret.key file, or the MMM_SECRET_KEY value) in the "Key of the backup" field and try again.');
    }
  } catch (e) {
    // Only SQLite's own errors (damaged or non-database content) get this generic message; ours pass through.
    if (String(e.code).startsWith('SQLITE_')) throw new Error('This is not a valid Media Middle Manager database file');
    throw e;
  } finally { bk?.close(); }

  // Keep a copy of what is being replaced.
  const safety = `pre-restore-${new Date().toISOString().replace(/[:.]/g, '-')}.db`;
  fs.writeFileSync(path.join(DATA, safety), db.serialize());

  db.prepare('ATTACH DATABASE ? AS bk').run(file);
  try {
    db.transaction(() => {
      for (const t of ['sessions', 'users', 'history', 'services', 'keep']) db.exec(`DELETE FROM main.${t}`);
      db.exec('INSERT INTO main.users SELECT * FROM bk.users');
      if (srcKey) {
        // Read each key with the supplied key and store it under this install's own key.
        const ins = db.prepare('INSERT INTO main.services (id, position, type, name, url, api_key, username, password) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
        for (const r of db.prepare('SELECT id, position, type, name, url, api_key, username, password FROM bk.services ORDER BY position').all()) {
          ins.run(
            r.id, r.position, r.type, r.name, r.url,
            encryptSecret(decryptSecretWith(srcKey, r.api_key, aadFor(r.id, 'api_key')), aadFor(r.id, 'api_key')), r.username,
            encryptSecret(decryptSecretWith(srcKey, r.password, aadFor(r.id, 'password')), aadFor(r.id, 'password')),
          );
        }
      } else {
        db.exec('INSERT INTO main.services SELECT * FROM bk.services');
      }
      db.exec('INSERT INTO main.history SELECT * FROM bk.history');
      if (db.prepare("SELECT 1 FROM bk.sqlite_master WHERE type = 'table' AND name = 'keep'").get()) db.exec('INSERT INTO main.keep SELECT * FROM bk.keep');
    })();
  } finally { db.exec('DETACH DATABASE bk'); }
  protectSecrets(); // a backup from before encryption existed still holds plain text
  return { ...counts, safetyCopy: safety, rekeyed: !!srcKey };
}

/* ---------- one-time import of the old JSON files ---------- */
function importLegacy() {
  // Strip a UTF-8 byte-order mark, which Windows editors add when someone hand-edits a file.
  const readJson = (f) => { try { return JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8').replace(/^﻿/, '')); } catch { return null; } };
  const retire = (f) => { try { fs.renameSync(path.join(DATA, f), path.join(DATA, `${f}.migrated`)); } catch { /* ignore */ } };

  const services = readJson('config.json');
  if (Array.isArray(services) && !db.prepare('SELECT 1 FROM services LIMIT 1').get()) {
    saveServices(services);
    retire('config.json');
    log.info('db', `imported ${services.length} service(s) from config.json. The original was kept as config.json.migrated and still holds your API keys in PLAIN TEXT: delete it once you have checked everything works.`);
  }
  const history = readJson('history.json');
  if (Array.isArray(history) && !db.prepare('SELECT 1 FROM history LIMIT 1').get()) {
    replaceHistory(history.filter((h) => h && typeof h.id === 'string' && typeof h.at === 'string'));
    retire('history.json');
    log.info('db', `imported ${history.length} history entries from history.json (kept as history.json.migrated)`);
  }
}
importLegacy();
