import { useState } from 'react';
import Services from './Services.jsx';
import Appearance from './Appearance.jsx';
import DeleteDefaults from './DeleteDefaults.jsx';
import ImportExport from './ImportExport.jsx';
import Account from './Account.jsx';
import LibrarySync from './LibrarySync.jsx';
import About from './About.jsx';

const TABS = [['services', 'Services'], ['sync', 'Library sync'], ['appearance', 'Appearance'], ['delete', 'Delete defaults'], ['backup', 'Import / Export'], ['account', 'Account'], ['about', 'About']];

export default function Settings({ appearance, setAppearance, auth, onSignOut }) {
  const [tab, setTab] = useState('services');
  return (
    <div className="settings">
      <h2 className="ptitle2">Settings</h2>
      <div className="stabs" role="tablist">
        {TABS.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>
      {tab === 'services' && <Services />}
      {tab === 'sync' && <LibrarySync />}
      {tab === 'appearance' && <Appearance appearance={appearance} setAppearance={setAppearance} />}
      {tab === 'delete' && <DeleteDefaults />}
      {tab === 'backup' && <ImportExport />}
      {tab === 'about' && <About />}
      {tab === 'account' && <Account auth={auth} onSignOut={onSignOut} />}
    </div>
  );
}
