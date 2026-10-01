import { where } from 'firebase/firestore';
import { FirebaseBackend } from '../../data/firebase';
// Reconciliation (page 15): the short lists a supervisor works through to keep records matching the floor.

import { useEffect, useMemo, useState } from 'react';
import type { SearchRow } from '../../domain/search';
import type { Pallet } from '../../domain/types';
import { roleAllows } from '../../domain/transitions';
import { useCommand } from '../../ui/useCommand';
import { useApp } from '../../app/state';
import { Icon, type IconName } from '../../ui/icons';
import { Empty, Explain, PageHead, Spinner, fmtAgo } from '../../ui/ui';
import { ResultRow } from '../find/Find';
import { LabelSheet } from '../labels/LabelSheet';
import { BulkBar, SelectButton, SelectRow, pinnedRows, useBulk } from '../bulk/Bulk';
import { RunningLow } from '../stock/RunningLow';
import { useLowStock } from '../stock/useStock';
import { ReviewAdjust } from '../stock/Adjust';
import { warehouseDate } from '../../domain/receiving';
import { EXPIRY_WINDOW_DAYS, addDays, expiringPallets, expiryText } from '../../domain/work';

type ListId = 'unplaced' | 'missing' | 'holds' | 'reprint' | 'stale' | 'approvals' | 'low' | 'expiring';

const LISTS: { id: ListId; title: string; icon: IconName; what: string; fix: string }[] = [
  { id: 'unplaced', title: 'Needs placement', icon: 'receive', what: 'Received but never put on a rack.', fix: 'Walk to the pallet, then use Move: scan it, scan its rack.' },
  { id: 'missing', title: 'Missing', icon: 'question', what: 'Someone looked and could not find it.', fix: 'When it turns up, a supervisor opens it, presses “Found pallet” and picks the rack where it is.' },
  { id: 'holds', title: 'On hold', icon: 'hold', what: 'Flagged as damaged, wrong or disputed.', fix: 'Inspect it. A supervisor clears the hold with a reason.' },
  { id: 'reprint', title: 'Labels to reprint', icon: 'print', what: 'The label was replaced, or details changed after printing.', fix: 'Print new labels and stick them over the old ones.' },
  { id: 'stale', title: 'Not verified 3+ days', icon: 'check', what: 'Stored, but nobody has confirmed the rack recently.', fix: 'During a walk, open Move, scan the pallet and the rack it is on, and press “Confirm still here”, or use Confirm still here on the pallet record.' },
  { id: 'approvals', title: 'Quantity changes', icon: 'edit', what: 'Quantity changes waiting for a manager to approve.', fix: 'Check the pallet if you need to, then approve the change or turn it down. Both are recorded in its history.' },
  { id: 'expiring', title: 'Expiring soon', icon: 'clock', what: 'Expires in the next 30 days, or already expired. Soonest first.', fix: 'Use or ship the oldest first: Find and order picking already offer it first. Put expired stock on hold, or queue a move to quarantine, so nobody picks it.' },
  { id: 'low', title: 'Running low', icon: 'alert', what: 'Products below the minimum set on Products and barcodes.', fix: 'Bring more from another warehouse on a transfer, or note that more is on order. A reorder note clears itself when the product is received.' },
];

export function Reconcile() {
  const { read, go, backend, v, role, route } = useApp();
  const [tab, setTab] = useState<ListId>(LISTS.some((l) => l.id === route.q) ? (route.q as ListId) : 'unplaced');
  const low = useLowStock();
  const today = read((e, a, ws) => warehouseDate(e.context(a, ws).warehouse?.timezone || 'UTC')) ?? new Date().toISOString().slice(0, 10);
  const lotsOn = !!read((e, a, ws) => e.context(a, ws).warehouse?.lots);
  useEffect(()=>{if(!(backend instanceof FirebaseBackend))return;if(tab==='expiring'){void backend.expiringList(addDays(today,EXPIRY_WINDOW_DAYS));return;}const filters=[where('archived_at','==',null)];
  if(tab==='unplaced')filters.push(where('state','==','RECEIVED'));if(tab==='missing')filters.push(where('state','==','MISSING'));if(tab==='holds')filters.push(where('has_hold','==',true));if(tab==='reprint')filters.push(where('label_needs_reprint','==',true));if(tab==='stale')filters.push(where('state','==','STORED'),where('last_confirmed_at','<',new Date(Date.now()-3*86400000).toISOString()));if(tab==='approvals')filters.push(where('has_pending_adjust','==',true));if(tab==='low')return;
  void backend.filteredList('records',filters);},[backend,tab]); // eslint-disable-line react-hooks/exhaustive-deps
  const [printing, setPrinting] = useState<string[] | null>(null);
  const bulk = useBulk();
  // A new list starts a new selection.
  useEffect(() => bulk.stop(), [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const data = useMemo(
    () =>
      read((e, a, ws) => {
        const r = e.reconciliation(a, ws);
        const stale: SearchRow[] = Object.values(e.db.pallets)
          .filter((p) => p.workspace_id === ws && !p.archived_at && p.state === 'STORED' && p.last_confirmed_at && Date.now() - new Date(p.last_confirmed_at).getTime() > 3 * 86_400_000)
          .sort((a, b) => (a.last_confirmed_at ?? '').localeCompare(b.last_confirmed_at ?? ''))
          .map((pallet) => ({ pallet, job: e.db.jobs[pallet.job_id], location: pallet.current_location_id ? e.db.locations[pallet.current_location_id] : null, lastLocation: pallet.last_confirmed_location_id ? e.db.locations[pallet.last_confirmed_location_id] : null }));
        const expiring: SearchRow[] = expiringPallets(Object.values(e.db.pallets).filter((p) => p.workspace_id === ws), today).map((pallet) => ({ pallet, job: e.db.jobs[pallet.job_id], location: pallet.current_location_id ? e.db.locations[pallet.current_location_id] : null, lastLocation: pallet.last_confirmed_location_id ? e.db.locations[pallet.last_confirmed_location_id] : null }));
        return { ...r, stale, expiring, low: [] } as Record<ListId, SearchRow[]>;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [v, backend.network],
  );
  if (!data) return null;
  // Expiring soon shows while lots are tracked, or while something tracked earlier still expires.
  const lists = LISTS.filter((l) => l.id !== 'expiring' || lotsOn || data.expiring.length > 0 || tab === 'expiring');
  const meta = LISTS.find((l) => l.id === tab)!;
  const rows = [...data[tab], ...pinnedRows(backend.db, bulk, data[tab].map((r) => r.pallet.id))];
  const total = lists.reduce((n, l) => n + (l.id === 'low' ? (low?.length ?? 0) : data[l.id].length), 0);
  const tabCount = (id: ListId) => (id === 'low' ? (low?.length ?? 0) : data[id].length);

  return (
    <div className="stack">
      <PageHead title="Needs attention" sub={backend.mode==='firebase'?'Showing loaded records in this list. Use Show more records for the next page.':total === 0 ? 'Everything matches. Nothing needs attention.' : `${total} items across ${lists.filter((l) => data[l.id].length).length} lists. Oldest first.`} />
      <Explain refs="pages 6, 15">
        <p>These lists are how records stay honest. The app never guesses where a pallet is: it shows the last confirmed rack and when. Each list links to the one workflow that fixes it, and every fix is recorded in the pallet's history.</p>
      </Explain>
      <div className="tabs wrap" role="tablist" data-tour="reconcile-lists">
        {lists.map((l) => (
          <button key={l.id} role="tab" aria-selected={tab === l.id} onClick={() => setTab(l.id)}>
            <Icon name={l.icon} /> {l.title} {(backend.mode==='demo'||l.id==='low')&&<span className="tag">{tabCount(l.id)}</span>}
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
      {tab === 'low' ? (
        <RunningLow />
      ) : rows.length === 0 ? (
        <Empty icon="checkCircle" title={`Nothing in “${meta.title}”`}>
          This list is clear.
        </Empty>
      ) : (
        <>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            {tab === 'reprint' ? (
              <button className="btn primary" onClick={() => setPrinting(rows.map((r) => r.pallet.id))}>
                <Icon name="print" /> Print all {rows.length} labels
              </button>
            ) : (
              <span />
            )}
            <SelectButton bulk={bulk} />
          </div>
          <BulkBar bulk={bulk} visibleIds={data[tab].map((r) => r.pallet.id)} />
          <div className="results">
            {rows.map((r) => (
              <SelectRow key={r.pallet.id} bulk={bulk} id={r.pallet.id} code={r.pallet.code}>
              <div className="result-card">
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
                  {tab === 'approvals' && r.pallet.pending_adjust && <ReviewAdjust pallet={r.pallet} />}
                  {tab === 'expiring' && (
                    <span className="muted result-hint">
                      {r.pallet.receiving?.lot ? `Lot ${r.pallet.receiving.lot} · ` : ''}
                      {expiryText(r.pallet.receiving?.expires_on ?? today, today)}
                      {r.pallet.hold ? ' · on hold' : ''}
                    </span>
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
              </SelectRow>
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
