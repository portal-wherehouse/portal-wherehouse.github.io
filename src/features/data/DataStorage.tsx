// Data and storage: where records live today (this browser), backup and restore of the local store,
// the planned Firebase design as a diagram, and the project owner's Firebase setup checklist.

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { BRAND } from '../../brand';
import { useApp } from '../../app/state';
import { snapshotCounts, validateSnapshot, type Snapshot, type SnapshotCheck, type SnapshotCounts } from '../../data/backend';
import { IS_PREVIEW, canDownload, copyText, downloadText } from '../../device/output';
import { formatBytes } from '../../device/photos';
import { Icon, type IconName } from '../../ui/icons';
import { Explain, Field, Notice, PageHead, Sheet, Spinner, fmtAgo, fmtFull } from '../../ui/ui';
import { ArchitectureDiagram } from './Diagram';
import './data.css';


export function DataStorage() {
  const { go } = useApp();
  return (
    <div className="stack ds">
      <PageHead
        eyebrow="Manage"
        title="Data and storage"
        sub="Where your records live today, how to keep your own copy, and how storage will work once real accounts arrive."
        actions={
          <button className="btn" onClick={() => go('export')}>
            <Icon name="export" /> Export to spreadsheets
          </button>
        }
      />
      <Explain refs="pages 17, 24, 25 and 40">
        <p>
          Today the whole app runs in this browser. The same rules that will run on the server check every change here, and the records are saved in this browser’s own database
          (IndexedDB). Nothing is sent anywhere. Other tabs in this browser share the data; other phones and computers do not.
        </p>
        <p>
          A backup file is an exact copy of everything this browser holds. Restoring one replaces it all. For spreadsheets your company can open, use Export instead.
        </p>
        <p>
          The plan for launch is Firebase, from Google: real sign-in, records kept on shared servers, and every change still checked by the same rules. None of that is
          connected yet.
        </p>
      </Explain>

      <WhereNow />
      <BackupRestore />
      <WithAccounts />
      <SetupChecklist />

      <div className="panel ds-reset">
        <Icon name="refresh" />
        <div className="grow">
          <strong>Start the demo over</strong>
          <div className="muted">Reset the sample warehouse, or load the busy one with 200 pallets and a second company. It only touches this browser.</div>
        </div>
        <button className="btn" onClick={() => go('settings')}>
          <Icon name="settings" /> Open Settings
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ where the data lives now

interface StorageInfo {
  supported: boolean;
  usage: number | null;
  quota: number | null;
  persisted: boolean | null;
  canPersist: boolean;
}

function storageManager(): StorageManager | undefined {
  try {
    return (navigator as Navigator & { storage?: StorageManager }).storage;
  } catch {
    return undefined;
  }
}

function useStorageInfo(v: number) {
  const [info, setInfo] = useState<StorageInfo | null>(null);
  const refresh = useCallback(async () => {
    const s = storageManager();
    const out: StorageInfo = { supported: !!s, usage: null, quota: null, persisted: null, canPersist: !!s && typeof s.persist === 'function' };
    try {
      if (s && typeof s.estimate === 'function') {
        const e = await s.estimate();
        out.usage = e.usage ?? null;
        out.quota = e.quota ?? null;
      }
    } catch {
      /* some frames refuse the estimate */
    }
    try {
      if (s && typeof s.persisted === 'function') out.persisted = await s.persisted();
    } catch {
      /* unknown */
    }
    setInfo(out);
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh, v]);
  return [info, refresh] as const;
}

function WhereNow() {
  const { backend, v, toast } = useApp();
  const [info, refresh] = useStorageInfo(v);
  const [asked, setAsked] = useState<'granted' | 'denied' | 'error' | null>(null);
  const [asking, setAsking] = useState(false);
  const db = backend.db;
  const counts = useMemo(() => snapshotCounts(db), [db, v]); // eslint-disable-line react-hooks/exhaustive-deps
  const photoBytes = useMemo(
    () => Object.values(db.attachments).reduce((n, a) => (a.state === 'ready' ? n + a.data_url.length + a.thumb_url.length : n), 0),
    [db, v], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const unsent = backend.outbox.entries.filter((e) => !e.resolved_at && e.status !== 'acknowledged').length + backend.pending.length;
  const restored = backend.meta.restored_from;

  const keep = async () => {
    const s = storageManager();
    if (!s || typeof s.persist !== 'function') return;
    setAsking(true);
    try {
      const ok = await s.persist();
      setAsked(ok ? 'granted' : 'denied');
      toast(ok ? 'This browser will keep the data unless someone clears it' : 'The browser said no for now. See the note below.', ok ? 'ok' : 'info');
    } catch {
      setAsked('error');
      toast('This browser would not answer the request', 'error');
    }
    setAsking(false);
    void refresh();
  };

  const tiles: { icon: IconName; label: string; value: number; note?: string }[] = [
    { icon: 'pallet', label: 'Pallets', value: counts.pallets },
    { icon: 'history', label: 'History entries', value: counts.events },
    { icon: 'jobs', label: 'Jobs', value: counts.jobs },
    { icon: 'locations', label: 'Locations', value: counts.locations },
    { icon: 'camera', label: 'Photos', value: counts.photos, note: counts.photos ? formatBytes(photoBytes) : undefined },
    { icon: 'building', label: counts.workspaces === 1 ? 'Company' : 'Companies', value: counts.workspaces },
  ];
  const pct = info?.usage != null && info.quota ? Math.min(100, (info.usage / info.quota) * 100) : null;
  const persisted = info?.persisted ?? null;

  return (
    <section className="panel stack ds-now" aria-labelledby="ds-now" data-tour="data-where">
      <div className="panel-title" id="ds-now">
        <Icon name="database" /> Where your data lives right now
      </div>
      {backend.storageOk ? (
        <Notice tone="ok" title="Saved in this browser, on this device">
          Every accepted change is written to this browser’s database before the screen says it is done. Nothing leaves this device{IS_PREVIEW ? ', and in this hosted preview the data belongs to the preview frame' : ''}.
        </Notice>
      ) : (
        <Notice tone="warn" title="This browser is not saving anything">
          Storage is blocked here ({backend.storageError}). Private browsing often does this. The demo keeps working in memory, but every change is lost when this tab closes, and offline
          queuing is turned off because a move can only be called queued once it is saved.
        </Notice>
      )}

      <div className="ds-tiles">
        {tiles.map((t) => (
          <div key={t.label} className="ds-tile">
            <span className="ds-tile-label">
              <Icon name={t.icon} /> {t.label}
            </span>
            <span className="ds-tile-value num">{t.value.toLocaleString()}</span>
            {t.note && <span className="ds-tile-note">{t.note}</span>}
          </div>
        ))}
      </div>
      <p className="muted ds-small" style={{ margin: 0 }}>
        Totals for everything this browser holds, across {counts.workspaces === 1 ? 'the one demo company' : `all ${counts.workspaces} demo companies`}. Each company still sees only its own records.
      </p>

      <dl className="kv ds-kv">
        <dt>Browser storage</dt>
        <dd>
          {info === null ? (
            'Checking…'
          ) : info.usage != null ? (
            <div className="stack" style={{ gap: 6 }}>
              <span>
                {formatBytes(info.usage)} used{info.quota ? ` of about ${formatBytes(info.quota)} this browser allows this site` : ''}. A backup file of the same data is about {formatBytes(backend.approxSize())}.
              </span>
              {pct !== null && (
                <div className="progress" role="img" aria-label={`${pct < 1 ? 'Less than 1' : Math.round(pct)} percent of the allowance used`}>
                  <div style={{ width: `${Math.max(pct, 0.8)}%` }} />
                </div>
              )}
            </div>
          ) : (
            `This browser does not report its storage use. A backup file of the data is about ${formatBytes(backend.approxSize())}.`
          )}
        </dd>
        <dt>Kept by the browser</dt>
        <dd>
          <div className="stack" style={{ gap: 8 }}>
            {persisted === true ? (
              <span className="ds-state ok">
                <Icon name="lock" /> Yes. The browser will not clear this data on its own when space runs low. Clearing site data by hand still removes it.
              </span>
            ) : persisted === false ? (
              <span className="ds-state warn">
                <Icon name="alert" /> Not yet. If the device runs low on space, the browser may clear this data without asking.
              </span>
            ) : (
              <span className="ds-state">
                <Icon name="info" /> {info === null ? 'Checking…' : 'This browser does not say whether it will keep the data.'}
              </span>
            )}
            {persisted !== true && info?.canPersist && (
              <div>
                <button className="btn" onClick={() => void keep()} disabled={asking}>
                  {asking ? <Spinner /> : <Icon name="shield" />} Keep data on this device
                </button>
              </div>
            )}
            {info && !info.canPersist && info.supported && <span className="muted ds-small">This browser does not let a site ask to keep its data.</span>}
            {asked === 'denied' && (
              <span className="muted ds-small">
                Browsers decide this on their own, often by how much the site is used. Installing the app to the home screen or bookmarking it can help. Until then, download a backup
                now and then.
              </span>
            )}
          </div>
        </dd>
        <dt>Unsent on this device</dt>
        <dd>{unsent === 0 ? 'Nothing waiting.' : `${unsent} ${unsent === 1 ? 'change is' : 'changes are'} waiting to send. See Sync and offline.`}</dd>
        <dt>Sample data</dt>
        <dd>
          {backend.meta.fixture === 'scenario' ? 'Busy warehouse' : 'Small warehouse'}, started {fmtFull(backend.meta.created_at)}
          {restored ? `. Restored from a backup ${fmtAgo(restored.restored_at)}${restored.exported_at ? ` (backup made ${fmtFull(restored.exported_at)})` : ''}` : ''}.
        </dd>
      </dl>
    </section>
  );
}

// ------------------------------------------------------------------ backup and restore

const FILE_SLUG = BRAND.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
const MAX_FILE_BYTES = 64 * 1024 * 1024;

function makeBackup(snapshot: Snapshot) {
  const compact = JSON.stringify(snapshot);
  const json = compact.length < 1_500_000 ? JSON.stringify(snapshot, null, 2) : compact;
  const stamp = snapshot.exported_at.slice(0, 16).replace(/[:T]/g, '-');
  return { json, name: `${FILE_SLUG}-backup-${stamp}.json` };
}

type Loaded = { source: string; value: unknown; check: SnapshotCheck };

function BackupRestore() {
  const { backend, role, toast, actorId, go } = useApp();
  const admin = role === 'OWNER' || role === 'SUPERVISOR';
  const [shown, setShown] = useState<string | null>(null);
  const [paste, setPaste] = useState('');
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const { json, name } = makeBackup(backend.exportSnapshot());
    if (canDownload()) {
      downloadText(name, json, 'application/json');
      toast(`Saved ${name}`);
    } else if (await copyText(json)) {
      toast('Backup copied. Paste it into a text file and keep it somewhere safe.', 'info');
    } else {
      setShown(json);
      toast('Copying is blocked here, so the backup is shown below to select and copy', 'info');
    }
  };

  const inspect = (raw: string, source: string) => {
    const t = raw.replace(/^﻿/, '').trim();
    if (!t) {
      setLoaded({ source, value: null, check: { ok: false, problems: ['The file is empty.'] } });
      return;
    }
    let value: unknown;
    try {
      value = JSON.parse(t);
    } catch {
      setLoaded({ source, value: null, check: { ok: false, problems: ['This is not a backup file: it is not valid JSON text. Check that the whole file was copied.'] } });
      return;
    }
    setLoaded({ source, value, check: validateSnapshot(value) });
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > MAX_FILE_BYTES) {
      setLoaded({ source: f.name, value: null, check: { ok: false, problems: [`This file is ${formatBytes(f.size)}. A backup of this demo should be far smaller, so it is probably not one.`] } });
      return;
    }
    try {
      inspect(await f.text(), f.name);
    } catch {
      setLoaded({ source: f.name, value: null, check: { ok: false, problems: ['This browser could not read the file.'] } });
    }
  };

  const restore = async () => {
    if (!loaded?.check.ok) return;
    setBusy(true);
    const res = await backend.importSnapshot(loaded.value);
    setBusy(false);
    setConfirm(false);
    if (!res.ok) {
      setLoaded({ ...loaded, check: { ok: false, problems: res.problems } });
      toast('Nothing was restored', 'error');
      return;
    }
    setLoaded(null);
    setPaste('');
    setShown(null);
    toast(`Backup restored: ${res.counts.pallets.toLocaleString()} pallets and ${res.counts.events.toLocaleString()} history entries`);
    if (!res.persisted) toast('Storage is blocked in this browser, so the restored data lasts until this tab closes', 'info');
    if (actorId && !backend.db.memberships.some((m) => m.user_id === actorId && m.active)) go('signin');
  };

  return (
    <section className="panel stack" aria-labelledby="ds-backup" data-tour="data-backup">
      <div className="panel-title" id="ds-backup">
        <Icon name="download" /> Back up and restore
      </div>
      <p style={{ margin: 0 }}>
        A backup is one file holding everything this browser stores for the demo: every company, pallet, history entry, photo and request receipt. Restore it later, in this
        browser or another one, to pick up exactly where you left off.
      </p>
      {!admin ? (
        <Notice tone="info" icon="lock" title="Backups need Supervisor or Owner access">
          A backup holds every company in this browser, so only supervisors and owners can make or restore one. Use Switch role in the yellow strip to try it.
        </Notice>
      ) : (
        <>
          <div className="grid-2">
            <div className="ds-card stack">
              <h3 className="ds-h3">
                <Icon name="download" /> Make a backup
              </h3>
              <p className="muted ds-small" style={{ margin: 0 }}>
                The data is about {formatBytes(backend.approxSize())}. The file carries a fingerprint, so a damaged or edited copy is caught before it can replace anything.
              </p>
              {!canDownload() && (
                <p className="ds-small" style={{ margin: 0 }}>
                  This hosted preview cannot save files, so the button copies the backup to your clipboard instead.
                </p>
              )}
              <div className="row">
                <button className="btn primary" onClick={() => void save()}>
                  <Icon name={canDownload() ? 'download' : 'copy'} /> {canDownload() ? 'Download backup' : 'Copy backup'}
                </button>
                <button className="btn" onClick={() => setShown(shown ? null : makeBackup(backend.exportSnapshot()).json)} aria-expanded={!!shown}>
                  <Icon name="eye" /> {shown ? 'Hide' : 'View'}
                </button>
              </div>
            </div>

            <div className="ds-card stack">
              <h3 className="ds-h3">
                <Icon name="upload" /> Restore from a backup
              </h3>
              <p className="muted ds-small" style={{ margin: 0 }}>
                Choose a backup file. It is checked first, and nothing changes until you confirm.
              </p>
              <div className="row">
                <label className="btn ds-file">
                  <Icon name="upload" /> Choose a backup file
                  <input type="file" accept=".json,application/json" className="sr-only" onChange={(e) => (void onFile(e.target.files?.[0]), (e.target.value = ''))} />
                </label>
              </div>
            </div>
          </div>

          {shown && (
            <textarea
              readOnly
              className="textarea ds-json"
              value={shown}
              aria-label="Backup file contents"
              onFocus={(e) => e.currentTarget.select()}
            />
          )}

          <details className="ds-paste">
            <summary>
              <Icon name="text" /> Paste backup text instead
              <Icon name="chevronDown" className="chev" />
            </summary>
            <div className="stack" style={{ marginTop: 10 }}>
              <Field label="Backup text" htmlFor="ds-paste" hint="Paste the whole file, from the first { to the last }.">
                <textarea id="ds-paste" className="textarea mono ds-paste-box" value={paste} onChange={(e) => setPaste(e.target.value)} spellCheck={false} />
              </Field>
              <div className="row">
                <button className="btn" onClick={() => inspect(paste, 'Pasted text')} disabled={!paste.trim()}>
                  <Icon name="checkCircle" /> Check this backup
                </button>
              </div>
            </div>
          </details>

          {loaded && <CheckResult loaded={loaded} onRestore={() => setConfirm(true)} onClear={() => setLoaded(null)} />}
        </>
      )}

      {confirm && loaded?.check.ok && (
        <Sheet title="Replace everything with this backup?" onClose={() => !busy && setConfirm(false)}>
          <ConfirmRestore check={loaded.check} busy={busy} onRestore={() => void restore()} onCancel={() => setConfirm(false)} onSaveFirst={() => void save()} />
        </Sheet>
      )}
    </section>
  );
}

function CheckResult({ loaded, onRestore, onClear }: { loaded: Loaded; onRestore: () => void; onClear: () => void }) {
  const { actorId } = useApp();
  const c = loaded.check;
  if (!c.ok) {
    return (
      <Notice tone="error" title={`${loaded.source}: this cannot be restored`} actions={<button className="btn small" onClick={onClear}>Dismiss</button>}>
        <ul className="ds-problems">
          {c.problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
        <div>Nothing was changed.</div>
      </Notice>
    );
  }
  const s = c.snapshot;
  const mine = !!actorId && s.db.memberships.some((m) => m.user_id === actorId && m.active);
  return (
    <div className="ds-check stack" role="status">
      <div className="row nowrap" style={{ alignItems: 'flex-start' }}>
        <Icon name="checkCircle" className="ds-check-icon" />
        <div className="grow">
          <strong>{loaded.source}: a valid backup</strong>
          <div className="muted ds-small">
            {s.exported_at ? `Made ${fmtFull(s.exported_at)} (${fmtAgo(s.exported_at)}).` : 'No date recorded.'} {c.workspaces.length === 1 ? 'Company' : 'Companies'}: {c.workspaces.join(', ')}.
          </div>
        </div>
      </div>
      <CountLine counts={c.counts} />
      {c.warnings.map((w) => (
        <div key={w} className="ds-state warn ds-small">
          <Icon name="alert" /> {w}
        </div>
      ))}
      {!mine && (
        <div className="ds-state warn ds-small">
          <Icon name="user" /> The account you are using is not in this backup. After restoring, you will choose an account again.
        </div>
      )}
      <div className="row">
        <button className="btn danger" onClick={onRestore}>
          <Icon name="upload" /> Restore this backup
        </button>
        <button className="btn" onClick={onClear}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function CountLine({ counts }: { counts: SnapshotCounts }) {
  const parts: [string, number][] = [
    ['pallets', counts.pallets],
    ['history entries', counts.events],
    ['jobs', counts.jobs],
    ['locations', counts.locations],
    ['photos', counts.photos],
  ];
  return (
    <div className="ds-countline">
      {parts.map(([label, n]) => (
        <span key={label} className="chip static">
          <strong className="num">{n.toLocaleString()}</strong> {label}
        </span>
      ))}
    </div>
  );
}

function ConfirmRestore({ check, busy, onRestore, onCancel, onSaveFirst }: { check: Extract<SnapshotCheck, { ok: true }>; busy: boolean; onRestore: () => void; onCancel: () => void; onSaveFirst: () => void }) {
  const { backend } = useApp();
  const now = snapshotCounts(backend.db);
  const next = check.counts;
  const unsent = backend.outbox.entries.filter((e) => !e.resolved_at && e.status !== 'acknowledged').length + backend.pending.length;
  const rows: [string, keyof SnapshotCounts][] = [
    ['Companies', 'workspaces'],
    ['Pallets', 'pallets'],
    ['History entries', 'events'],
    ['Jobs', 'jobs'],
    ['Locations', 'locations'],
    ['Photos', 'photos'],
  ];
  return (
    <div className="stack">
      <p style={{ margin: 0 }}>Everything this browser holds is replaced, for every demo company. This cannot be undone.</p>
      <div className="table-wrap">
        <table className="t">
          <thead>
            <tr>
              <th scope="col">Records</th>
              <th scope="col" className="n">
                Now
              </th>
              <th scope="col" className="n">
                After restore
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, k]) => (
              <tr key={k}>
                <th scope="row" className="ds-rowhead">
                  {label}
                </th>
                <td className="n num">{now[k].toLocaleString()}</td>
                <td className="n num">{next[k].toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {unsent > 0 && (
        <Notice tone="warn" title={`${unsent} unsent ${unsent === 1 ? 'change' : 'changes'} will be discarded`}>
          They were made against the data being replaced, so they cannot be sent afterwards. Open Sync and offline first if you want to send them.
        </Notice>
      )}
      <div className="row">
        <button className="btn danger big" onClick={onRestore} disabled={busy}>
          {busy ? <Spinner /> : <Icon name="upload" />} Restore backup
        </button>
        <button className="btn big" onClick={onSaveFirst} disabled={busy}>
          <Icon name={canDownload() ? 'download' : 'copy'} /> Save current data first
        </button>
        <button className="btn big ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ the plan with accounts

const FLOW: { title: string; body: string }[] = [
  { title: 'Sign in', body: 'Each person signs in with Firebase Authentication, using an email link, a password, or their Google account. The app gets a short-lived pass that proves who they are.' },
  { title: 'Send a change', body: 'Every change, from receiving to fixing a mistake, goes to one server function along with that pass and the same request ID the app uses today.' },
  { title: 'Save it together', body: 'The function checks the person’s current role, the request ID, and that the pallet has not changed since they looked. Then it saves the pallet, its history entry and a receipt in one transaction: all of it or none of it.' },
  { title: 'Read your company only', body: 'Phones read records straight from Cloud Firestore. Security rules let people read only the companies they belong to. A copy stays on the phone, so search keeps working with no signal.' },
  { title: 'Photos stay private', body: 'Photos go to Cloud Storage in a folder for that company. Only its members can see them, and only operators and above can add them.' },
  { title: 'Backed up on a schedule', body: 'The database is backed up automatically and can be rolled back to an earlier point if something goes wrong.' },
];

const SAME = ['Request IDs and receipts', 'Version checks and conflicts', 'Roles and what each can do', 'History that is never erased', 'The offline move queue', 'Labels, CSV import and export'];

function WithAccounts() {
  return (
    <section className="panel stack" aria-labelledby="ds-plan" data-tour="data-plan">
      <div className="panel-title ds-title" id="ds-plan">
        <Icon name="cloud" />
        <span>How it will work with accounts</span>
        <span className="grow" />
        <span className="tag warn">Planned. Not connected</span>
      </div>
      <p style={{ margin: 0 }}>
        At launch, {BRAND.name} will run on Firebase, Google’s app platform. Accounts, records and photos move off this device onto shared servers, so the whole crew sees the same
        warehouse. The rules that check each change stay exactly the same.
      </p>
      <ArchitectureDiagram />
      <ol className="ds-flow">
        {FLOW.map((f, i) => (
          <li key={f.title}>
            <span className="ds-num" aria-hidden="true">
              {i + 1}
            </span>
            <div>
              <strong>{f.title}.</strong> {f.body}
            </div>
          </li>
        ))}
      </ol>
      <div className="grid-2">
        <div className="ds-card">
          <h3 className="ds-h3">
            <Icon name="check" /> Stays the same
          </h3>
          <ul className="ds-ticks">
            {SAME.map((s) => (
              <li key={s}>
                <Icon name="check" /> {s}
              </li>
            ))}
          </ul>
        </div>
        <div className="ds-card">
          <h3 className="ds-h3">
            <Icon name="swap" /> Changes
          </h3>
          <ul className="ds-ticks">
            <li>
              <Icon name="arrowRight" /> Real sign-in replaces the demo role picker
            </li>
            <li>
              <Icon name="arrowRight" /> Records live on shared servers; this device keeps a copy for offline use
            </li>
            <li>
              <Icon name="arrowRight" /> Photos move to private cloud storage
            </li>
            <li>
              <Icon name="arrowRight" /> Backups run on the server every day, not by hand
            </li>
            <li>
              <Icon name="arrowRight" /> Search runs on the device from that copy; a search service can be added for very large warehouses
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ setup checklist

interface Step {
  id: string;
  title: string;
  detail: ReactNode;
  later?: boolean;
}

const STEPS: Step[] = [
  { id: 'project', title: 'Create the Firebase project', detail: 'At console.firebase.google.com, signed in with the business Google account that should own it. Pick the project ID with care: it cannot be changed. Google Analytics can stay off.' },
  { id: 'blaze', title: 'Turn on the Blaze (pay as you go) plan', detail: 'Server functions and new storage buckets need it. Then set a monthly budget alert in Google Cloud Billing. Alerts send an email; they do not stop spending.' },
  { id: 'webapp', title: 'Register a web app', detail: 'Project settings, Your apps, the </> icon. Name it after the product and copy the firebaseConfig block it shows.' },
  { id: 'auth', title: 'Turn on sign-in methods', detail: 'Authentication, Sign-in method: Email/Password with Email link (passwordless) switched on, and Google. Set the support email Google asks for.' },
  { id: 'firestore', title: 'Create the Firestore database', detail: 'Start in production mode, so everything is locked until the real rules go in. Choose the location carefully: it is permanent. For customers in the US, nam5 (United States) is a sound default. If asked for an edition, choose Standard.' },
  { id: 'storage', title: 'Create the Cloud Storage bucket', detail: 'Storage, Get started, production mode, in the same location as Firestore where offered.' },
  { id: 'people', title: 'Decide who deploys', detail: 'Add the person who will deploy under Users and permissions, or plan to run the deploy command yourself. A second owner on the project is a good safety net.' },
  { id: 'domain', title: 'Add the app’s web address', detail: 'Authentication, Settings, Authorized domains. Add it once the domain is chosen. localhost is there already for testing.', later: true },
  { id: 'backups', title: 'Turn on backups before the pilot', detail: 'Firestore, Disaster recovery: point-in-time recovery and a daily backup schedule.', later: true },
];

const SEND_BACK: [string, string][] = [
  ['firebaseConfig', 'apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId. These name the project and are safe to share; the security rules do the protecting.'],
  ['Firestore location', 'The one you picked, for example nam5.'],
  ['Sign-in methods', 'Which ones are on, and the support email shown on sign-in emails.'],
  ['Web address', 'Where the app will live, if you know it yet.'],
  ['Budget alert', 'Confirm Blaze is on and the monthly amount you set.'],
  ['First owner', 'The email that should own the first company workspace, plus anyone else who needs access on day one.'],
];

const CHECK_KEY = 'pl.data.setup';

function readChecks(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(CHECK_KEY);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

function SetupChecklist() {
  const { toast } = useApp();
  const [done, setDone] = useState<Record<string, boolean>>(readChecks);
  const toggle = (id: string) =>
    setDone((cur) => {
      const next = { ...cur, [id]: !cur[id] };
      try {
        localStorage.setItem(CHECK_KEY, JSON.stringify(next));
      } catch {
        /* ticks are a per-device convenience */
      }
      return next;
    });
  const count = STEPS.filter((s) => done[s.id]).length;

  const asText = () =>
    [
      `${BRAND.name}: Firebase setup`,
      '',
      ...STEPS.map((s, i) => `${done[s.id] ? '[x]' : '[ ]'} ${i + 1}. ${s.title}${s.later ? ' (can wait)' : ''}`),
      '',
      'Send back:',
      ...SEND_BACK.map(([k, v]) => `- ${k}: ${v}`),
      '',
      'Never send: passwords, service account key files, or billing details.',
    ].join('\n');

  const copyList = async () => {
    if (await copyText(asText())) toast('Checklist copied', 'ok');
    else toast('Copying is blocked here. Select the steps on the page instead.', 'info');
  };

  return (
    <section className="panel stack" aria-labelledby="ds-setup" data-tour="data-setup">
      <div className="panel-title ds-title" id="ds-setup">
        <Icon name="checklist" />
        <span>Before accounts go live: Firebase setup</span>
        <span className="grow" />
        <span className="tag">
          {count} of {STEPS.length} ticked
        </span>
      </div>
      <p style={{ margin: 0 }}>
        Each step is a few clicks in the Firebase console. Ticking a box only marks it on this device, as a reminder. Nothing connects until the app is updated with the values below.
      </p>
      <div className="progress" role="img" aria-label={`${count} of ${STEPS.length} steps ticked`}>
        <div style={{ width: `${(count / STEPS.length) * 100}%` }} />
      </div>
      <ol className="ds-steps">
        {STEPS.map((s, i) => (
          <li key={s.id} className={done[s.id] ? 'done' : ''}>
            <label className="ds-step">
              <input type="checkbox" checked={!!done[s.id]} onChange={() => toggle(s.id)} />
              <span className="ds-step-text">
                <span className="ds-step-title">
                  {i + 1}. {s.title} {s.later && <span className="tag">Can wait</span>}
                </span>
                <span className="ds-step-detail">{s.detail}</span>
              </span>
            </label>
          </li>
        ))}
      </ol>
      <div className="ds-card stack">
        <h3 className="ds-h3">
          <Icon name="send" /> Values to send back
        </h3>
        <dl className="ds-send">
          {SEND_BACK.map(([k, val]) => (
            <div key={k}>
              <dt className="mono">{k}</dt>
              <dd>{val}</dd>
            </div>
          ))}
        </dl>
        <div className="ds-state bad ds-small">
          <Icon name="alertCircle" /> Never send passwords, service account key files, or billing details. None of them are needed.
        </div>
      </div>
      <div className="row">
        <button className="btn" onClick={() => void copyList()}>
          <Icon name="copy" /> Copy the checklist
        </button>
      </div>
    </section>
  );
}
