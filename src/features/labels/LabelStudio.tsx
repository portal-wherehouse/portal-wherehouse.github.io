import { where } from 'firebase/firestore';
import { useJobsOn } from '../../app/words';
import { FirebaseBackend } from '../../data/firebase';
// Label studio: build a print run of pallet or rack labels, check calibration, and learn what a label carries (page 16).

import { useEffect, useMemo, useState } from 'react';
import { makeLabelPayload } from '../../domain/codes';
import { useApp } from '../../app/state';
import { Icon } from '../../ui/icons';
import { Explain, PageHead } from '../../ui/ui';
import { Qr } from './LabelCard';
import { LabelSheet } from './LabelSheet';

type Source = 'reprint' | 'job' | 'received' | 'racks' | 'pick';

export function LabelStudio() {
  const { read, backend, v } = useApp();
  const jobsOn = useJobsOn();
  const [chosen, setSource] = useState<Source | null>(null);
  const [jobId, setJobId] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  useEffect(()=>{if(!(backend instanceof FirebaseBackend))return;const filters=[where('archived_at','==',null)];
  if(chosen==='job'&&jobId)filters.push(where('job_id','==',jobId));else if(chosen==='reprint')filters.push(where('label_needs_reprint','==',true));else if(!chosen||chosen==='received')filters.push(where('state','==','RECEIVED'));
  void backend.filteredList('records',filters);},[backend,chosen,jobId]);

  const data = useMemo(
    () =>
      read((e, a, ws) => {
        const ctx = e.context(a, ws);
        const pallets = Object.values(e.db.pallets)
          .filter((p) => p.workspace_id === ws && p.state !== 'RETIRED' && !p.archived_at)
          .sort((x, y) => x.code.localeCompare(y.code));
        return { ctx, pallets, sample: pallets[0] ? e.activeLabel(pallets[0].id)?.token ?? null : null };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [v, backend.network],
  );
  if (!data) return null;

  const reprintCount = data.pallets.filter((p) => p.label_needs_reprint).length;
  const receivedCount = data.pallets.filter((p) => p.state === 'RECEIVED').length;
  // Open on a list that has something in it, rather than on an empty one with a disabled button.
  const source: Source = chosen ?? (reprintCount === 0 && receivedCount > 0 ? 'received' : 'reprint');
  const palletIds =
    source === 'reprint'
      ? data.pallets.filter((p) => p.label_needs_reprint).map((p) => p.id)
      : source === 'job'
        ? data.pallets.filter((p) => p.job_id === jobId && p.state !== 'DISPATCHED').map((p) => p.id)
        : source === 'received'
          ? data.pallets.filter((p) => p.state === 'RECEIVED').map((p) => p.id)
          : source === 'pick'
            ? picked
            : [];
  const locationIds = source === 'racks' ? data.ctx.locations.filter((l) => l.active).map((l) => l.id) : [];
  const count = palletIds.length + locationIds.length;
  const toggle = (id: string) => setPicked((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const samplePayload = data.sample ? makeLabelPayload('P', data.sample) : 'PL1:P:ABCDEFGHIJKLMNOP';

  const SOURCES: { id: Source; label: string }[] = [
    { id: 'reprint', label: `Needs reprint (${reprintCount})` },
    { id: 'received', label: `Waiting for placement (${receivedCount})` },
    ...(jobsOn ? [{ id: 'job' as Source, label: 'Pallets for a job' }] : []),
    { id: 'pick', label: 'Pick pallets' },
    { id: 'racks', label: 'Loaded rack labels' },
  ];

  return (
    <div className="stack">
      <PageHead title="Labels" sub="Print pallet and rack labels in batches, at the right size, with a calibration check." />
      <div className="grid-2" style={{ alignItems: 'start' }}>
        <div className="panel stack" data-tour="labels-source">
          <div className="panel-title">1 · What to print</div>
          <div className="stack" style={{ gap: 6 }}>
            {SOURCES.map((s) => (
              <label key={s.id} className="toggle">
                <input type="radio" name="label-source" checked={source === s.id} onChange={() => setSource(s.id)} />
                <span>{s.label}</span>
              </label>
            ))}
          </div>
          {source === 'job' && (
            <select className="select" value={jobId} onChange={(e) => setJobId(e.target.value)} aria-label="Job">
              <option value="">Choose a job…</option>
              {data.ctx.jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.code} · {j.name}
                </option>
              ))}
            </select>
          )}
          {source === 'pick' && (
            <div style={{ maxHeight: 280, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 8, padding: 8 }}>
              {data.pallets.map((p) => (
                <label key={p.id} className="toggle" style={{ padding: '4px 0' }}>
                  <input type="checkbox" checked={picked.includes(p.id)} onChange={() => toggle(p.id)} />
                  <span>
                    <span className="pcode">{p.code}</span> {p.description}
                  </span>
                </label>
              ))}
            </div>
          )}
          <div className="panel-title" style={{ marginTop: 6 }}>
            2 · Preview and print
          </div>
          <button className="btn primary big" disabled={count === 0} onClick={() => setOpen(true)}>
            <Icon name="print" /> Preview {count} {count === 1 ? 'label' : 'labels'}
          </button>
          {count === 0 && (
            <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>
              {source === 'job' && !jobId ? 'Choose a job first.' : source === 'pick' ? 'Tick the pallets to print.' : 'Nothing to print in this list right now. Choose another one above.'}
            </p>
          )}
        </div>
        <div className="panel stack" data-tour="labels-anatomy">
          <div className="panel-title">What is on a label</div>
          <div className="row nowrap" style={{ alignItems: 'flex-start', gap: 16 }}>
            <div style={{ width: 120, flex: 'none', background: '#fff', padding: 6, borderRadius: 6, border: '1px solid var(--line)' }}>
              <Qr payload={samplePayload} />
            </div>
            <div className="stack" style={{ gap: 6, fontSize: 14 }}>
              <div>
                The QR code holds <span className="mono" style={{ fontSize: 12.5 }}>PL1:P:</span> followed by a 16-character random token. It holds no job, description or location.
              </div>
              <div className="muted">
                That means a label never goes stale when a pallet moves, and the QR itself reveals nothing beyond the printed text. Only someone with access to this company can look the token up.
              </div>
            </div>
          </div>
          <table className="t" style={{ fontSize: 13.5 }}>
            <tbody>
              <tr>
                <td>
                  <span className="mono">PL1</span>
                </td>
                <td>Format version, so labels can evolve without breaking old ones.</td>
              </tr>
              <tr>
                <td>
                  <span className="mono">P</span> or <span className="mono">L</span>
                </td>
                <td>Pallet or location label.</td>
              </tr>
              <tr>
                <td>
                  <span className="mono">16 chars</span>
                </td>
                <td>Random token (A–Z, 2–7). 80 bits, so it cannot be guessed.</td>
              </tr>
              <tr>
                <td>
                  <span className="mono">Barcode</span>
                </td>
                <td>
                  A Code 128 barcode of the printed code (like <span className="code-nw">P-000042</span> or <span className="code-nw">A-03-02</span>), for laser scanners that cannot read QR codes. It
                  works just like typing the code.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <Explain title="Printing tips" refs="pages 16, 26">
        <ul>
          <li>Use 4 × 6 inch thermal labels for pallets, or letter paper at six per page. Rack labels print one per 4 × 6 label.</li>
          <li>Always print at 100% (“actual size”). The calibration square must measure exactly 1 inch. If it does not, fix the printer scaling before printing a batch.</li>
          <li>Reprinting a label uses the same token, so an older copy keeps working. Use “Replace label” on a pallet only when a label was copied or misused.</li>
          <li>The large printed code is always the fallback: a damaged label can be typed in on Move or Find.</li>
        </ul>
      </Explain>
      {open && <LabelSheet palletIds={palletIds} locationIds={locationIds} onClose={() => setOpen(false)} />}
    </div>
  );
}
