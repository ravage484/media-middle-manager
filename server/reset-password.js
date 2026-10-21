// Recovery for a forgotten password: node server/reset-password.js <username> <new password>
// Needs access to the server's files (and DATA_DIR if you changed it). Creates the account if it does not exist.
import { db } from './db.js';
import { hashPassword } from './auth.js';

const [username, password] = process.argv.slice(2);
if (!username || !password || password.length < 10) {
  console.error('Usage: node server/reset-password.js <username> <new password, at least 10 characters>');
  process.exit(1);
}

const hash = await hashPassword(password);
const user = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
if (user) {
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, user.id);
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id); // sign out everywhere
  console.log(`Password for "${username}" updated. All sessions were signed out.`);
} else {
  db.prepare('INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)').run(username, hash, new Date().toISOString());
  console.log(`Account "${username}" created.`);
}
process.exit(0);
