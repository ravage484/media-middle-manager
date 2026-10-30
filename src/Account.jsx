import { useState } from 'react';
import { api } from './api.js';

export default function Account({ auth, onSignOut, showAdult, setShowAdult }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const content = (
    <section className="sgroup">
      <h3>Content</h3>
      <label className="check">
        <input type="checkbox" checked={showAdult} onChange={(e) => setShowAdult(e.target.checked)} /> Show adult content in Discover, search and Home
      </label>
      <small className="dim">Hidden by default. Covers titles TMDB marks as adult and nudity compilations that are not marked. Saved to your account; the page reloads.</small>
    </section>
  );

  if (auth.authDisabled) {
    return (
      <div>
        {content}
        <section className="sgroup">
          <h3>Account</h3>
          <div className="notice bad">Sign-in is turned off for this server (<code>MMM_AUTH_DISABLED=true</code>). Anyone who can reach it can manage your media stack and delete files, so only do this behind a proxy that authenticates users.</div>
        </section>
      </div>
    );
  }

  const submit = async (e) => {
    e.preventDefault();
    setMsg(null);
    if (next !== confirm) return setMsg({ ok: false, text: 'The new passwords do not match.' });
    setBusy(true);
    try {
      await api.changePassword(current, next);
      setCurrent(''); setNext(''); setConfirm('');
      setMsg({ ok: true, text: 'Password changed. Any other signed-in sessions were signed out.' });
    } catch (ex) { setMsg({ ok: false, text: ex.message }); }
    setBusy(false);
  };

  return (
    <div>
      {content}
      <section className="sgroup">
        <h3>Account</h3>
        <p className="dim">Signed in as <b>{auth.username}</b>.</p>
        <button onClick={onSignOut}>Sign out</button>
      </section>
      <section className="sgroup">
        <h3>Change password</h3>
        <form className="form narrow" onSubmit={submit}>
          {msg && <div className={`notice ${msg.ok ? '' : 'bad'}`}>{msg.text}</div>}
          <label>Current password<input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required /></label>
          <label>New password<input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" required /></label>
          <label>Confirm new password<input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required /></label>
          <small className="dim">At least 10 characters.</small>
          <div><button className="primary" disabled={busy}>{busy ? 'Saving…' : 'Change password'}</button></div>
        </form>
      </section>
    </div>
  );
}
