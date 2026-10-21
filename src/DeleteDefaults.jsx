import { useState } from 'react';
import { getDeleteDefaults, setDeleteDefaults } from './prefs.js';

export default function DeleteDefaults() {
  const [d, setD] = useState(getDeleteDefaults);
  const set = (k, v) => { const n = { ...d, [k]: v }; setD(n); setDeleteDefaults(n); };
  return (
    <div className="sgroup">
      <h3>Delete defaults</h3>
      <p className="dim">What is pre-selected in the delete window. You can still change these each time. Saved in this browser.</p>
      <div className="form narrow">
        <label>Overseerr request
          <select value={d.overseerr} onChange={(e) => set('overseerr', e.target.value)}>
            <option value="delete">Delete request and reset media</option>
            <option value="decline">Mark as declined</option>
            <option value="none">Leave alone</option>
          </select>
        </label>
        <label className="check"><input type="checkbox" checked disabled /> Unmonitor in Radarr/Sonarr (always on; history is kept)</label>
        <label className="check"><input type="checkbox" checked={d.files} onChange={(e) => set('files', e.target.checked)} /> Delete media files</label>
        <label className="check"><input type="checkbox" checked={d.torrents} onChange={(e) => set('torrents', e.target.checked)} /> Remove matching torrents and data from qBittorrent</label>
        <label className="check"><input type="checkbox" checked={d.plex} onChange={(e) => set('plex', e.target.checked)} /> Rescan Plex libraries afterwards (when Plex is configured)</label>
      </div>
    </div>
  );
}
