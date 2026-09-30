// "What do you store?": picks the words the app uses for tracked things and for grouping work,
// and whether grouping (jobs) shows at all. Lives in Warehouse settings; managers can change it any time.

import { useState } from 'react';
import { useApp } from '../../app/state';
import { useSetup } from '../../app/words';
import { uuid } from '../../domain/codes';
import { PRESETS, pluralize, type SetupPreset } from '../../domain/terms';
import { Icon } from '../../ui/icons';
import { Notice, Spinner } from '../../ui/ui';
import { SetupSurvey } from '../setup/SetupSurvey';

export function SetupSetting({ onSaved }: { onSaved?: () => void }) {
  const { send, role, backend } = useApp();
  const current = useSetup();
  const [preset, setPreset] = useState<SetupPreset | null>((current.preset as SetupPreset) ?? null);
  const [w, setW] = useState({ thing: current.thing, things: current.things, job: current.job, jobs: current.jobs, jobs_on: current.jobs_on });
  const [busy, setBusy] = useState(false);
  const [survey, setSurvey] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const canChange = role === 'OWNER' || role === 'SUPERVISOR';
  const pick = (id: SetupPreset) => {
    setPreset(id);
    const p = PRESETS.find((x) => x.id === id)!;
    if (id !== 'custom') setW({ ...p.setup });
    setMsg(null);
  };
  const changed = preset !== current.preset || w.thing !== current.thing || w.things !== current.things || w.job !== current.job || w.jobs !== current.jobs || w.jobs_on !== current.jobs_on;
  const save = async () => {
    setBusy(true);
    setMsg(null);
    const o = await send('set_setup', { preset, ...w }, null, { commandId: uuid() });
    setBusy(false);
    if (o.status === 'result' && o.result.ok) {
      setMsg({ tone: 'ok', text: `Saved. The app now says "${w.thing}" and "${w.things}"${w.jobs_on ? ` and groups work by ${w.jobs.toLowerCase()}` : ''}.` });
      onSaved?.();
    } else setMsg({ tone: 'error', text: o.status === 'result' && !o.result.ok ? o.result.message : o.status === 'offline' ? o.message : 'No answer from the server. Reload to check.' });
  };
  const dis = !canChange || busy || backend.network === 'offline';
  return (
    // The choices name the app's own words on purpose, so they are not swapped on screen.
    <div className="panel stack" data-testid="setup-setting" data-keep-words>
      <div>
        <div className="panel-title">What do you store?</div>
        <p className="hint" style={{ margin: 0 }}>This sets the words the app uses and hides what you don't need. You can change it any time; nothing already recorded changes.</p>
      </div>
      {canChange && (
        <div className="row">
          <button type="button" className="btn" disabled={dis} onClick={() => setSurvey(true)}>
            <Icon name="sparkle" /> {current.preset ? 'Retake the setup survey' : 'Take the setup survey'}
          </button>
        </div>
      )}
      {survey && <SetupSurvey mode="portal" onClose={() => setSurvey(false)} onApplied={(r) => {
            const { preset: p, ...words } = r.setup;
            setPreset(p);
            setW(words);
            setMsg({ tone: 'ok', text: `Saved. The app now says "${words.thing}" and "${words.things}".` });
          }} />}
      <div className="preset-grid" role="radiogroup" aria-label="What do you store?">
        {PRESETS.map((p) => (
          <button key={p.id} type="button" role="radio" aria-checked={preset === p.id} className={`preset${preset === p.id ? ' on' : ''}`} disabled={dis} onClick={() => pick(p.id)}>
            <strong>{p.title}</strong>
            <small>{p.examples}</small>
          </button>
        ))}
      </div>
      <div className="grid-2">
        <label className="field">
          <span className="label">One is called</span>
          <input className="input" value={w.thing} maxLength={24} disabled={dis} onChange={(e) => setW({ ...w, thing: e.target.value, things: pluralize(e.target.value) })} />
        </label>
        <label className="field">
          <span className="label">More than one</span>
          <input className="input" value={w.things} maxLength={24} disabled={dis} onChange={(e) => setW({ ...w, things: e.target.value })} />
        </label>
      </div>
      <label className="toggle">
        <input type="checkbox" checked={w.jobs_on} disabled={dis} onChange={(e) => setW({ ...w, jobs_on: e.target.checked })} />
        <span>Group {w.things.toLowerCase() || 'them'} by customer, order, project or event</span>
      </label>
      {w.jobs_on && (
        <div className="grid-2">
          <label className="field">
            <span className="label">One group is called</span>
            <input className="input" value={w.job} maxLength={24} disabled={dis} onChange={(e) => setW({ ...w, job: e.target.value, jobs: pluralize(e.target.value) })} />
          </label>
          <label className="field">
            <span className="label">More than one</span>
            <input className="input" value={w.jobs} maxLength={24} disabled={dis} onChange={(e) => setW({ ...w, jobs: e.target.value })} />
          </label>
        </div>
      )}
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      {canChange ? (
        <div className="row">
          <button type="button" className="btn primary" disabled={dis || !changed || !w.thing.trim() || !w.things.trim()} onClick={() => void save()}>
            {busy ? <Spinner /> : <Icon name="check" />} Save setup
          </button>
        </div>
      ) : (
        <p className="hint" style={{ margin: 0 }}>A manager can change this.</p>
      )}
    </div>
  );
}
