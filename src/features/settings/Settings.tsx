// Settings: display preferences (per device), demo data controls, storage and build information.

import { useState } from 'react';
import type { FixtureName } from '../../demo/seed';
import { useApp, type Prefs } from '../../app/state';
import { formatBytes } from '../../device/photos';
import { Icon } from '../../ui/icons';
import { Explain, Notice, PageHead, Sheet, Spinner } from '../../ui/ui';

export function Settings() {
  const { prefs, setPrefs, backend, toast, setTourOpen, signOut } = useApp();
  const [confirm, setConfirm] = useState<FixtureName | null>(null);
  const [busy, setBusy] = useState(false);
  const counts = {
    pallets: Object.keys(backend.db.pallets).length,
    events: Object.values(backend.db.events).reduce((n, l) => n + l.length, 0),
    workspaces: Object.keys(backend.db.workspaces).length,
  };

  const reset = async (f: FixtureName) => {
    setBusy(true);
    await backend.reset(f);
    try {
      localStorage.removeItem('pl.tour.start');
      localStorage.removeItem('pl.tour.found');
    } catch {
      /* ignore */
    }
    setBusy(false);
    setConfirm(null);
    toast(f === 'scenario' ? 'Loaded the busy warehouse: 200 pallets and a second company' : 'Demo warehouse reset to its starting state');
  };

  return (
    <div className="stack">
      <PageHead title="Settings" sub="Display choices are saved on this device only." />

      <div className="panel stack" data-tour="settings-display">
        <div className="panel-title">Display</div>
        <Setting label="Theme">
          <Seg<Prefs['theme']> value={prefs.theme} options={[['system', 'Match device'], ['light', 'Light'], ['dark', 'Dark']]} onChange={(theme) => setPrefs({ theme })} />
        </Setting>
        <Setting label="Text size" hint="Larger text and buttons for gloves and bright sunlight.">
          <Seg<Prefs['text']> value={prefs.text} options={[['normal', 'Standard'], ['large', 'Large']]} onChange={(text) => setPrefs({ text })} />
        </Setting>
        <Setting label="Start on" hint="The screen that opens when you sign in.">
          <Seg<Prefs['startTab']> value={prefs.startTab} options={[['receive', 'Receive'], ['move', 'Move'], ['find', 'Find'], ['overview', 'Overview']]} onChange={(startTab) => setPrefs({ startTab })} />
        </Setting>
        <label className="toggle">
          <input type="checkbox" checked={prefs.explain} onChange={(e) => setPrefs({ explain: e.target.checked })} />
          <span>
            <strong>Show “How this works” explanations</strong> on every screen.
          </span>
        </label>
        <label className="toggle">
          <input type="checkbox" checked={prefs.haptics} onChange={(e) => setPrefs({ haptics: e.target.checked })} />
          <span>
            <strong>Vibrate on scans and results</strong> (on phones that support it).
          </span>
        </label>
        <div className="row">
          <button className="btn" onClick={() => setTourOpen(true)}>
            <Icon name="tour" /> Open the guided tour
          </button>
          <button className="btn" onClick={signOut}>
            <Icon name="user" /> Choose another demo account
          </button>
        </div>
      </div>

      <div className="panel stack">
        <div className="panel-title">Demo data</div>
        <p style={{ margin: 0 }}>
          This browser holds {counts.pallets} pallets, {counts.events} history entries and {counts.workspaces} {counts.workspaces === 1 ? 'company' : 'companies'} ({backend.meta.fixture === 'scenario' ? 'busy warehouse' : 'small warehouse'}).
        </p>
        <Explain title="What resetting does">
          <p>Resetting rebuilds the demo warehouse from a fixed seed, so it always starts the same. It clears this device's offline queue too. It only touches this app's own storage in this browser.</p>
          <p>The busy warehouse adds 200 pallets and a second company, Harborline Supply, that reuses some of the same job and rack codes. Switch to the Harborline Owner account to confirm the two companies never see each other's data.</p>
        </Explain>
        <div className="row">
          <button className="btn" onClick={() => setConfirm('tiny')}>
            <Icon name="refresh" /> Reset small warehouse
          </button>
          <button className="btn" onClick={() => setConfirm('scenario')}>
            <Icon name="database" /> Load busy warehouse
          </button>
        </div>
      </div>

      <div className="panel stack">
        <div className="panel-title">This device</div>
        <dl className="kv">
          <dt>Storage</dt>
          <dd>{backend.storageOk ? `Saved in this browser (about ${formatBytes(backend.approxSize())})` : `Not available: ${backend.storageError}. Changes last until you close the tab.`}</dd>
          <dt>Connection</dt>
          <dd>{backend.network === 'online' ? 'Online (simulated)' : 'Offline (simulated)'}</dd>
          <dt>Build</dt>
          <dd className="mono" style={{ fontSize: 13 }}>
            {__BUILD_COMMIT__} · {__BUILD_TIME__.slice(0, 16).replace('T', ' ')} UTC · {__BUILD_TARGET__ === 'artifact' ? 'hosted preview' : 'full app'}
          </dd>
        </dl>
        {!backend.storageOk && <Notice tone="warn">This browser blocked local storage (private mode can do this). Offline queuing is disabled, because a move can only be called queued once it is safely saved.</Notice>}
      </div>

      {confirm && (
        <Sheet title={confirm === 'scenario' ? 'Load the busy warehouse?' : 'Reset the demo warehouse?'} onClose={() => setConfirm(null)}>
          <div className="stack">
            <p style={{ margin: 0 }}>Everything you changed in this browser will be replaced. This cannot be undone.</p>
            <div className="row">
              <button className="btn danger big" onClick={() => void reset(confirm)} disabled={busy}>
                {busy ? <Spinner /> : <Icon name="refresh" />} {confirm === 'scenario' ? 'Load it' : 'Reset'}
              </button>
              <button className="btn big" onClick={() => setConfirm(null)} disabled={busy}>
                Cancel
              </button>
            </div>
          </div>
        </Sheet>
      )}
    </div>
  );
}

function Setting({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="stack" style={{ gap: 6 }}>
      <div>
        <strong>{label}</strong>
        {hint && <div className="muted" style={{ fontSize: 13.5 }}>{hint}</div>}
      </div>
      {children}
    </div>
  );
}

function Seg<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="seg" role="group">
      {options.map(([v, l]) => (
        <button key={v} aria-pressed={value === v} onClick={() => onChange(v)}>
          {l}
        </button>
      ))}
    </div>
  );
}
