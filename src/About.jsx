import { useEffect, useState } from 'react';
import { api } from './api.js';
import { VERSION, REPO } from './version.js';

export default function About() {
  const [server, setServer] = useState(null);
  useEffect(() => { api.about().then(setServer).catch(() => setServer({ error: true })); }, []);
  const stale = server?.version && server.version !== VERSION; // a cached page from before the server was updated

  return (
    <div className="sgroup">
      <h3>Media Middle Manager</h3>
      <p className="dim">One place to browse and manage your whole media stack.</p>
      <dl className="about">
        <div><dt>Version</dt><dd>{VERSION}</dd></div>
        <div><dt>Server</dt><dd>{server?.version ? `${server.version} (Node ${server.node})` : server?.error ? 'unavailable' : 'Loading…'}</dd></div>
        <div><dt>Source</dt><dd><a href={REPO} target="_blank" rel="noopener noreferrer">github.com/ravage484/media-middle-manager</a></dd></div>
        <div><dt>Releases</dt><dd><a href={`${REPO}/releases`} target="_blank" rel="noopener noreferrer">Release notes and downloads</a></dd></div>
      </dl>
      {stale && <div className="notice bad">This page (version {VERSION}) is older than the server (version {server.version}). Reload the page to get the new interface.</div>}
    </div>
  );
}
