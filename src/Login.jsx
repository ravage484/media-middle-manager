import { useState } from 'react';
import { api } from './api.js';
import Logo from './Logo.jsx';
import { loadAppearance } from './themes.js';

// mode "setup": first run, create the account. mode "login": sign in.
export default function Login({ mode, onDone }) {
  const setup = mode === 'setup';
  const a = loadAppearance();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    if (setup && password !== confirm) return setErr('Passwords do not match.');
    setBusy(true);
    try {
      const r = setup ? await api.setup(username, password) : await api.login(username, password);
      onDone(r.username);
    } catch (ex) { setErr(ex.message); setBusy(false); }
  };

  return (
    <div className="loginpage">
      <form className="logincard" onSubmit={submit}>
        <div className="loginbrand"><Logo style={a.logo} theme={a.theme} size={48} /><h1>Media Middle Manager</h1></div>
        <h2>{setup ? 'Create your account' : 'Sign in'}</h2>
        {setup && <p className="dim">First run. This account protects your whole media stack, including actions that remove files, so choose a strong password.</p>}
        <label>Username
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoFocus required />
        </label>
        <label>Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={setup ? 'new-password' : 'current-password'} required />
        </label>
        {setup && (
          <label>Confirm password
            <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
          </label>
        )}
        {setup && <small className="dim">At least 10 characters.</small>}
        {err && <div className="notice bad">{err}</div>}
        <button className="primary" disabled={busy}>{busy ? 'Please wait…' : setup ? 'Create account' : 'Sign in'}</button>
      </form>
    </div>
  );
}
