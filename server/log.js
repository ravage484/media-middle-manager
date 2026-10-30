import fs from 'node:fs';
import path from 'node:path';

/*
 * The server's log: one line per event, to the console and to a rotating file in the data folder.
 *   LOG_LEVEL        error | warn | info (default) | debug
 *   MMM_LOG_FORMAT   "json" for one JSON object per line instead of text
 *   MMM_LOG_FILE     "false" for the console only (the file is DATA_DIR/logs/mmm.log, 5 files of up to 5 MB)
 * Nothing secret goes through here: callers pass paths, ids and outcomes, never request bodies, query strings or keys. Whatever they do
 * pass is stripped of control characters, so no one can forge a line of the log.
 * (The data folder is worked out here, not taken from db.js, because the database code logs too.)
 */
const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const level = LEVELS[String(process.env.LOG_LEVEL || 'info').toLowerCase()] ?? LEVELS.info;
const json = String(process.env.MMM_LOG_FORMAT).toLowerCase() === 'json';
const dir = path.join(process.env.DATA_DIR || path.resolve('data'), 'logs');
export const LOG_FILE = path.join(dir, 'mmm.log');
const MAX_BYTES = 5 * 1024 * 1024;
const KEEP = 5; // mmm.log plus mmm.log.1 ... mmm.log.5

let fileOn = process.env.MMM_LOG_FILE !== 'false';
let size = 0;
if (fileOn) {
  try { fs.mkdirSync(dir, { recursive: true }); size = fs.existsSync(LOG_FILE) ? fs.statSync(LOG_FILE).size : 0; } catch { fileOn = false; }
}

const clean = (v) => String(v).replace(/[\u0000-\u001f\u007f]+/g, ' ');
const field = (k, v) => {
  const s = clean(v instanceof Error ? v.message : v);
  return `${k}=${/[\s="]/.test(s) || !s ? JSON.stringify(s.slice(0, 500)) : s}`;
};

function rotate() {
  try {
    fs.rmSync(`${LOG_FILE}.${KEEP}`, { force: true });
    for (let i = KEEP - 1; i >= 1; i--) if (fs.existsSync(`${LOG_FILE}.${i}`)) fs.renameSync(`${LOG_FILE}.${i}`, `${LOG_FILE}.${i + 1}`);
    fs.renameSync(LOG_FILE, `${LOG_FILE}.1`);
    size = 0;
  } catch { /* keep writing to the same file rather than lose lines */ }
}

function write(lvl, area, msg, fields = {}) {
  if (LEVELS[lvl] > level) return;
  const at = new Date().toISOString();
  const err = fields.err instanceof Error ? fields.err : null;
  const rest = Object.entries(fields).filter(([k, v]) => k !== 'err' && v !== undefined && v !== null && v !== '');
  const line = json
    ? JSON.stringify({ at, level: lvl, area, msg: clean(msg), ...Object.fromEntries(rest.map(([k, v]) => [k, typeof v === 'string' ? clean(v) : v])), ...(err ? { err: clean(err.message), stack: clean(err.stack || '') } : {}) })
    : `${at} ${lvl.toUpperCase().padEnd(5)} [${area}] ${clean(msg)}${rest.map(([k, v]) => ` ${field(k, v)}`).join('')}${err ? ` ${field('err', err)} stack=${JSON.stringify(clean(err.stack || '').slice(0, 2000))}` : ''}`;
  (lvl === 'error' ? console.error : lvl === 'warn' ? console.warn : console.log)(line);
  if (fileOn) {
    try {
      if (size > MAX_BYTES) rotate();
      fs.appendFileSync(LOG_FILE, `${line}\n`);
      size += Buffer.byteLength(line) + 1;
    } catch { fileOn = false; console.warn(`${at} WARN  [log] cannot write ${LOG_FILE}; logging to the console only`); }
  }
}

export const log = {
  error: (area, msg, fields) => write('error', area, msg, fields),
  warn: (area, msg, fields) => write('warn', area, msg, fields),
  info: (area, msg, fields) => write('info', area, msg, fields),
  debug: (area, msg, fields) => write('debug', area, msg, fields),
  settings: () => ({ level: Object.keys(LEVELS).find((k) => LEVELS[k] === level), format: json ? 'json' : 'text', file: fileOn ? LOG_FILE : null }),
};

// A route says what it did in words ("queue.retry 3b0e…"); the request line carries it.
export const note = (res, text) => { res.locals.note = String(text).slice(0, 200); };

// One line per API request: method, path (never the query string), status, how long, who. Changes and failures show at the default
// level; plain reads (the dashboard polls every few seconds) only with LOG_LEVEL=debug.
export function requestLog(req, res, next) {
  if (!req.path.startsWith('/api/')) return next();
  const t0 = process.hrtime.bigint();
  const where = req.originalUrl.split('?')[0]; // the whole path, without the query; req.path loses its mount point once a router answers
  res.on('finish', () => {
    const status = res.statusCode;
    const lvl = status >= 500 ? 'error' : status >= 400 ? 'warn' : req.method === 'GET' || req.method === 'HEAD' ? 'debug' : 'info';
    write(lvl, 'http', `${req.method} ${where}`, { status, ms: Math.round(Number(process.hrtime.bigint() - t0) / 1e6), user: req.user?.username, note: res.locals.note, error: res.locals.error, ip: status === 401 || status === 403 ? req.ip : undefined });
  });
  next();
}
