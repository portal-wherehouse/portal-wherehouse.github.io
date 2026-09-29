// Reconciliation (page 15): the short lists a supervisor works through to keep records matching the floor.

import { useMemo, useState } from 'react';
import type { SearchRow } from '../../domain/search';
import type { Pallet } from '../../domain/types';
import { roleAllows } from '../../domain/transitions';
import { useCommand } from '../../ui/useCommand';
import { useApp } from '../../app/state';
import { Icon, type IconName } from '../../ui/icons';
import { Empty, Explain, PageHead, Spinner, fmtAgo } from '../../ui/ui';
import { ResultRow } from '../find/Find';
import { LabelSheet } from '../labels/LabelSheet';

type ListId = 'unplaced' | 'missing' | 'holds' | 'reprint' | 'stale';

const LISTS: { id: ListId; title: string; icon: IconName; what: string; fix: string }[] = [
  { id: 'unplaced', title: 'Needs placement', icon: 'receive', what: 'Received but never put on a rack.', fix: 'Walk to the pallet, then use Move: scan it, scan its rack.' },
  { id: 'missing', title: 'Missing', icon: 'question', what: 'Someone looked and could not find it.', fix: 'When it turns up, a supervisor opens it, presses “Found pallet” and picks the rack where it is.' },
  { id: 'holds', title: 'On hold', icon: 'hold', what: 'Flagged as damaged, wrong or disputed.', fix: 'Inspect it. A supervisor clears the hold with a reason.' },
  { id: 'reprint', title: 'Labels to reprint', icon: 'print', what: 'The label was replaced, or details changed after printing.', fix: 'Print new labels and stick them over the old ones.' },
  { id: 'stale', title: 'Not verified 3+ days', icon: 'check', what: 'Stored, but nobody has confirmed the rack recently.', fix: 'During a walk, open Move, scan the pallet and the rack it is on, and press “Confirm still here”, or use Confirm still here on the pallet record.' },
];

export function Reconcile() {
  const { read, go, backend, v, role } = useApp();
  const [tab, setTab] = useState<ListId>('unplaced');
  const [printing, setPrinting] = useState<string[] | null>(null);

  const data = useMemo(
    () =>
      read((e, a, ws) => {
        const r = e.reconciliation(a, ws);
        const stale: SearchRow[] = Object.values(e.db.pallets)
          .filter((p) => p.workspace_id === ws && !p.archived_at && p.state === 'STORED' && p.last_confirmed_at && Date.now() - new Date(p.last_confirmed_at).getTime() > 3 * 86_400_000)
          .sort((a, b) => (a.last_confirmed_at ?? '').localeCompare(b.last_confirmed_at ?? ''))
          .map((pallet) => ({ pallet, job: e.db.jobs[pallet.job_id], location: pallet.current_location_id ? e.db.locations[pallet.current_location_id] : null, lastLocation: pallet.last_confirmed_location_id ? e.db.locations[pallet.last_confirmed_location_id] : null }));
        return { ...r, stale } as Record<ListId, SearchRow[]>;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [v, backend.network],
  );
  if (!data) return null;
  const meta = LISTS.find((l) => l.id === tab)!;
  const rows = data[tab];
  const total = LISTS.reduce((n, l) => n + data[l.id].length, 0);

  return (
    <div className="stack">
      <PageHead title="Needs attention" sub={total === 0 ? 'Everything matches. Nothing needs attention.' : `${total} items across ${LISTS.filter((l) => data[l.id].length).length} lists. Oldest first.`} />
      <Explain refs="pages 6, 15">
        <p>These lists are how records stay honest. The app never guesses where a pallet is: it shows the last confirmed rack and when. Each list links to the one workflow that fixes it, and every fix is recorded in the pallet's history.</p>
      </Explain>
      <div className="tabs wrap" role="tablist" data-tour="reconcile-lists">
        {LISTS.map((l) => (
          <button key={l.id} role="tab" aria-selected={tab === l.id} onClick={() => setTab(l.id)}>
            <Icon name={l.icon} /> {l.title} <span className="tag">{data[l.id].length}</span>
          </button>
        ))}
      </div>
      <div className="notice info" data-tour="reconcile-fix">
        <Icon name={meta.icon} />
        <div>
          <div className="n-title">{meta.what}</div>
          <div className="n-body">{meta.fix}</div>
        </div>
      </div>
      {rows.length === 0 ? (
        <Empty icon="checkCircle" title={`Nothing in “${meta.title}”`}>
          This list is clear.
        </Empty>
      ) : (
        <>
          {tab === 'reprint' && (
            <button className="btn primary" style={{ alignSelf: 'flex-start' }} onClick={() => setPrinting(rows.map((r) => r.pallet.id))}>
              <Icon name="print" /> Print all {rows.length} labels
            </button>
          )}
          <div className="results">
            {rows.map((r) => (
              <div key={r.pallet.id} className="result-card">
                <ResultRow row={r} onOpen={() => go({ name: 'pallet', id: r.pallet.id })} />
                <div className="row result-actions">
                  {/* Each fix is offered only to roles that can make it; the others see who can. */}
                  {tab === 'unplaced' &&
                    (roleAllows(role, 'place') ? (
                      <button className="btn small primary" onClick={() => go({ name: 'move', id: r.pallet.id })}>
                        <Icon name="move" /> Place now
                      </button>
                    ) : (
                      <span className="muted result-hint">An operator can place this pallet.</span>
                    ))}
                  {tab === 'missing' &&
                    (roleAllows(role, 'locate') ? (
                      <button className="btn small" onClick={() => go({ name: 'pallet', id: r.pallet.id })}>
                        <Icon name="target" /> Record where it was found
                      </button>
                    ) : (
                      <span className="muted result-hint">A supervisor records where it was found.</span>
                    ))}
                  {tab === 'holds' && r.pallet.hold && (
                    <span className="muted" style={{ fontSize: 13.5 }}>
                      “{r.pallet.hold.reason}” · {fmtAgo(r.pallet.hold.applied_at)}
                    </span>
                  )}
                  {tab === 'reprint' && (
                    <>
                      <button className="btn small" onClick={() => setPrinting([r.pallet.id])}>
                        <Icon name="print" /> Print label
                      </button>
                      <AppliedButton pallet={r.pallet} />
                    </>
                  )}
                  {tab === 'stale' &&
                    (roleAllows(role, 'verify_location') ? (
                      <button className="btn small" onClick={() => go({ name: 'move', id: r.pallet.id })}>
                        <Icon name="check" /> Verify with a scan
                      </button>
                    ) : (
                      <span className="muted result-hint">An operator can confirm it with a scan.</span>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      {printing && <LabelSheet palletIds={printing} onClose={() => setPrinting(null)} />}
    </div>
  );
}

function AppliedButton({ pallet }: { pallet: Pallet }) {
  const { role, toast } = useApp();
  const cmd = useCommand();
  if (!roleAllows(role, 'label_applied')) return null;
  const run = async () => {
    const r = await cmd.run('label_applied', {}, pallet);
    if (r.phase === 'done') toast(`${pallet.code}: new label recorded as applied`);
    else if (r.phase === 'rejected') toast(r.message ?? 'Not saved', 'error');
    else if (r.phase === 'unknown') toast('No answer from the server. Open the pallet and check its history.', 'error');
  };
  return (
    <button className="btn small" onClick={() => void run()} disabled={cmd.busy}>
      {cmd.busy ? <Spinner /> : <Icon name="check" />} New label is on
    </button>
  );
}
