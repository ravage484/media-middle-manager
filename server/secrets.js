import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/*
 * Encryption of stored API keys and passwords (AES-256-GCM).
 *
 * Key source, in order:
 *   1. MMM_SECRET_KEY: base64 of 32 random bytes, or any passphrase (stretched with scrypt).
 *   2. DATA_DIR/secret.key: generated on first start (mode 600) and reused.
 *
 * Stored form: "enc:v1:" + base64(iv | tag | ciphertext). The row id and column are bound in as
 * authenticated data, so an encrypted value cannot be moved to a different row or column.
 */
const PREFIX = 'enc:v1:';
let key = null;
export let keySource = null; // 'env' | 'file'

export const isEncrypted = (v) => typeof v === 'string' && v.startsWith(PREFIX);

export function initKey(dataDir) {
  const env = process.env.MMM_SECRET_KEY;
  if (env) {
    const raw = Buffer.from(env.trim(), 'base64');
    key = raw.length === 32 && raw.toString('base64') === env.trim() ? raw : crypto.scryptSync(env, 'media-middle-manager/v1', 32);
    keySource = 'env';
    return;
  }
  const file = path.join(dataDir, 'secret.key');
  if (!fs.existsSync(file)) {
    try { fs.writeFileSync(file, crypto.randomBytes(32).toString('base64'), { mode: 0o600, flag: 'wx' }); } catch (e) { if (e.code !== 'EEXIST') throw e; }
  }
  key = Buffer.from(fs.readFileSync(file, 'utf8').trim(), 'base64');
  if (key.length !== 32) throw new Error(`${file} is not a valid key (expected 32 bytes, base64). Restore the original file, or set MMM_SECRET_KEY.`);
  keySource = 'file';
}

export function encryptSecret(plain, aad) {
  if (!plain) return ''; // nothing to protect
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  c.setAAD(Buffer.from(aad));
  const body = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return PREFIX + Buffer.concat([iv, c.getAuthTag(), body]).toString('base64');
}

export function decryptSecret(stored, aad) {
  if (!isEncrypted(stored)) return stored || ''; // legacy plaintext, encrypted on the next startup
  const buf = Buffer.from(stored.slice(PREFIX.length), 'base64');
  const d = crypto.createDecipheriv('aes-256-gcm', key, buf.subarray(0, 12));
  d.setAuthTag(buf.subarray(12, 28));
  d.setAAD(Buffer.from(aad));
  return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString('utf8');
}

export function canDecrypt(stored, aad) {
  try { decryptSecret(stored, aad); return true; } catch { return false; }
}

export const aadFor = (id, column) => `service:${id}:${column}`;
