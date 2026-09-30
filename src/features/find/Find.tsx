import { FirebaseBackend } from '../../data/firebase';
// Find: search by job, pallet code, rack, or description; location first (blueprint page 13).

import { useJobsOn } from '../../app/words';
import { useEffect, useMemo, useRef, useState } from 'react';
import { BarcodeSheet } from '../scan/BarcodeSheet';
import { readSupplierBarcode } from '../../domain/supplierBarcode';
import { levenshtein, normalizeCode, parseLabelPayload, parsePalletCode } from '../../domain/codes';
import { PALLET_STATES, type PalletState } from '../../domain/types';
import { STATE_LABEL } from '../../domain/transitions';
import type { RankedRow } from '../../domain/search';
import { useApp } from '../../app/state';
import { parseScanCommand } from '../../device/scanCommands';
import { modalOpen, useScanTarget } from '../../device/scanRouter';
import { Icon } from '../../ui/icons';
import { BulkBar, SelectButton, SelectRow, pinnedRows, useBulk } from '../bulk/Bulk';
import { Empty, Explain, HoldBadge, Notice, PageHead, StateBadge, WhereCell, fmtAgo, fmtTime } from '../../ui/ui';

export function Find() {
  const { read, route, go, backend, v, actorId, workspaceId, toast } = useApp();
  const jobsOn = useJobsOn();
  const [scanning, setScanning] = useState(false);
  const [q, setQ] = useState(route.q ?? '');
  const [states, setStates] = useState<PalletState[]>([]);
  const [jobId, setJobId] = useState('');
  const [locId, setLocId] = useState('');
  const [holdOnly, setHoldOnly] = useState(false);
  const [archived, setArchived] = useState(false);
  const [pages, setPages] = useState(1);
  const bulk = useBulk();
  const cloud=backend instanceof FirebaseBackend?backend:null;
  useEffect(()=>{if(!cloud)return;const timer=setTimeout(()=>void cloud.search({q,states,job_id:jobId||undefined,location_id:locId||undefined,include_archived:archived,hold:holdOnly}),300);return()=>clearTimeout(timer);},[cloud,q,states,jobId,locId,archived,holdOnly]);
  const input = useRef<HTMLInputElement>(null);
  const captureSearch = async (raw: string) => {
    let query: string;
    if (parseLabelPayload(raw)) {
      if (!actorId || !workspaceId) throw Error('Sign in to your warehouse first.');
      if (cloud) await cloud.preloadScan(raw);
      const record = backend.reader.resolve(actorId, workspaceId, raw);
      query = record.type === 'pallet' ? record.pallet.code : record.location.code;
    } else query = parsePalletCode(raw) ?? readSupplierBarcode(raw).reference;
    setQ(query); setStates([]); setJobId(''); setLocId(''); setHoldOnly(false); setArchived(true);
  };
  useScanTarget('find-materials', (event) => {
    // Keep existing hardware shortcuts for Wherehouse labels, racks, and commands.
    if (parseScanCommand(event.text) || parsePalletCode(event.text) || parseLabelPayload(event.text) || Object.values(backend.db.locations).some(location => location.workspace_id === workspaceId && normalizeCode(location.code) === normalizeCode(event.text))) return false;
    void captureSearch(event.text).catch((e: unknown) => toast(e instanceof Error ? e.message : 'Could not read this label.', 'error'));
    return true;
  }, !scanning);


  useEffect(() => {
    if (route.q !== undefined) setQ(route.q);
  }, [route.q]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && !modalOpen() && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        input.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => setPages(1), [q, states, jobId, locId, holdOnly, archived]);

  const ctx = read((e, a, ws) => e.context(a, ws));
  const result = useMemo(() => {
    return read((e, a, ws) => {
      const items: RankedRow[] = [];
      let cursor: string | null = null;
      let total = 0;
      for (let i = 0; i < (cloud ? Math.ceil(Object.keys(cloud.db.pallets).length/50)+1 : pages); i++) {
        const r: ReturnType<typeof e.search> = e.search(a, ws, { q, states, job_id: jobId || undefined, location_id: locId || undefined, include_archived: archived, cursor, limit: 50 });
        total = r.total;
        items.push(...r.items);
        cursor = r.next_cursor;
        if (!cursor) break;
      }
      const filtered = holdOnly ? items.filter((r) => r.pallet.hold) : items;
      return { items: filtered, more: cloud ? cloud.pageMore('search') : !!cursor, total: holdOnly ? filtered.length : total };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, states, jobId, locId, holdOnly, archived, pages, v, backend.network]);

  const quick = read((e, _a, ws) => {
    const ps = Object.values(e.db.pallets).filter((p) => p.workspace_id === ws && !p.archived_at);
    return {
      received: ps.filter((p) => p.state === 'RECEIVED').length,
      hold: ps.filter((p) => p.hold && p.state !== 'RETIRED').length,
      missing: ps.filter((p) => p.state === 'MISSING').length,
    };
  });

  const suggestions = useMemo(() => {
    if (!q.trim() || (result && result.items.length > 0) || !ctx) return [];
    const nq = normalizeCode(q);
    const codes = [...ctx.jobs.map((j) => j.code), ...ctx.locations.map((l) => l.code)];
    return codes
      .map((c) => ({ c, d: levenshtein(nq, c) }))
      .filter((x) => x.d <= 2)
      .sort((a, b) => a.d - b.d)
      .slice(0, 4)
      .map((x) => x.c);
  }, [q, result, ctx]);

  const offline = backend.network === 'offline';
  const toggleState = (s: PalletState) => setStates((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));

  return (
    <div className="stack">
      <PageHead eyebrow="Warehouse" title="Find materials" sub="Search a job, pallet code, rack, or description. Results show where each pallet was last confirmed." />
      {offline && backend.cache && (
        <Notice tone="warn" icon="wifiOff" title="Offline: searching cached records only">
          Showing what this device had at {fmtTime(backend.cache.at)} ({fmtAgo(backend.cache.at)}). Pallets moved since then will not show their new location until you reconnect.
        </Notice>
      )}
      <div className="find-search-tools">
      <div className="search-bar" data-tour="find-search">
        <Icon name="find" />
        <label htmlFor="find-q" className="sr-only">
          Search
        </label>
        <input
          id="find-q"
          ref={input}
          className="input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Job, pallet, rack or words"
          autoComplete="off"
          spellCheck={false}
          type="search"
          enterKeyHint="search"
        />
      </div>
      <button type="button" className="btn primary" onClick={() => setScanning(true)}><Icon name="scanner" />Scan barcode</button>
      </div>
      {scanning && <BarcodeSheet title="Scan to find materials" onScan={captureSearch} onClose={() => setScanning(false)} />}
      <div className="filter-row" role="group" aria-label="Filter by state" data-tour="find-filters">
        {PALLET_STATES.map((s) => (
          <button key={s} className="pill-toggle" aria-pressed={states.includes(s)} onClick={() => toggleState(s)}>
            {STATE_LABEL[s]}
          </button>
        ))}
        <button className="pill-toggle" aria-pressed={holdOnly} onClick={() => setHoldOnly(!holdOnly)}>
          On hold
        </button>
      </div>
      <div className="filter-row" data-tour="find-filters">
        <label className="sr-only" htmlFor="find-job" hidden={!jobsOn}>
          Job
        </label>
        <select id="find-job" hidden={!jobsOn} className="select" value={jobId} onChange={(e) => setJobId(e.target.value)}>
          <option value="">All jobs</option>
          {ctx?.jobs.map((j) => (
            <option key={j.id} value={j.id}>
              {j.code} · {j.name}
              {j.status === 'CLOSED' ? ' (closed)' : ''}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="find-loc">
          Location
        </label>
        <select id="find-loc" className="select" value={locId} onChange={(e) => setLocId(e.target.value)}>
          <option value="">All locations</option>
          {ctx?.locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.code}
              {l.active ? '' : ' (inactive)'}
            </option>
          ))}
        </select>
        <label className="toggle" style={{ fontSize: 13.5, minHeight: 36 }}>
          <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} /> Include archived
        </label>
      </div>

      {!q && states.length === 0 && !jobId && !locId && !holdOnly && quick && (
        <div className="row">
          <span className="muted" style={{ fontSize: 13.5 }}>
            Quick views:
          </span>
          <button className="btn small" onClick={() => setStates(['RECEIVED'])}>
            Needs placement{!cloud && <> · {quick.received}</>}
          </button>
          <button className="btn small" onClick={() => setHoldOnly(true)}>
            On hold{!cloud && <> · {quick.hold}</>}
          </button>
          <button className="btn small" onClick={() => setStates(['MISSING'])}>
            Missing{!cloud && <> · {quick.missing}</>}
          </button>
        </div>
      )}

      <Explain refs="pages 3, 13">
        <p>
          Results rank exact codes first (a pallet, job, or rack code), then codes that start with what you typed, then descriptions and what is on each pallet, then close misspellings. Case and extra spaces do not matter. Pages are stable, so
          “Show more” never repeats or skips a pallet.
        </p>
        <ul>
          <li>
            The location comes first because that is what you walk to. It reads <strong>last confirmed</strong>: the app knows where a pallet was recorded, and cannot see a move nobody scanned.
          </li>
          <li>Received pallets show as <em>Unassigned</em> so they are never mistaken for absent material. Missing pallets show their last rack as historical.</li>
          <li>Tip: press <span className="kbd">/</span> to jump to the search box on a keyboard.</li>
        </ul>
      </Explain>

      {result && (
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span className="muted num" style={{ fontSize: 13.5 }}>
            {cloud ? 'Showing ' : ''}{result.total} {result.total === 1 ? 'pallet' : 'pallets'}
            {q ? ` for “${q.trim()}”` : ''}
          </span>
          <span className="row" style={{ gap: 10 }}>
            <span className="faint" style={{ fontSize: 12.5 }}>
              Refreshed {fmtAgo(backend.lastSync)}
            </span>
            {result.items.length > 0 && <SelectButton bulk={bulk} />}
          </span>
        </div>
      )}
      <BulkBar bulk={bulk} visibleIds={result?.items.map((r) => r.pallet.id) ?? []} />

      {cloud?.viewLoading && <p role="status">Searching…</p>}
      {result && result.items.length === 0 && !cloud?.viewLoading ? (
        <div className="panel">
          <Empty icon="find" title={q ? `No pallets match “${q.trim()}”` : 'No pallets match these filters'}>
            <p>Check the spelling, or type the code printed on the label. Supplier codes are searchable after they have been saved on a receipt. Filters above may also be hiding results.</p>
          </Empty>
          {suggestions.length > 0 && (
            <div className="row" style={{ justifyContent: 'center', marginBottom: 12 }}>
              <span className="muted">Did you mean</span>
              {suggestions.map((s) => (
                <button key={s} className="btn small" onClick={() => setQ(s)}>
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="results">
          {[...(result?.items ?? []), ...pinnedRows(backend.db, bulk, result?.items.map((r) => r.pallet.id) ?? [])].map((r) => (
            <SelectRow key={r.pallet.id} bulk={bulk} id={r.pallet.id} code={r.pallet.code}>
              <ResultRow row={r} onOpen={() => go({ name: 'pallet', id: r.pallet.id })} />
            </SelectRow>
          ))}
        </div>
      )}
      {result?.more && (
        <button className="btn block" onClick={() => cloud ? void cloud.more('search') : setPages((p) => p + 1)}>
          Show more
        </button>
      )}
    </div>
  );
}

/** One pallet in a list. Compact rows leave out the location, for lists that are all at one location (the map). */
export function ResultRow({
  row,
  onOpen,
  compact,
}: {
  row: RankedRow | { pallet: RankedRow['pallet']; job: RankedRow['job']; location: RankedRow['location']; lastLocation: RankedRow['lastLocation'] };
  onOpen: () => void;
  compact?: boolean;
}) {
  const { read,backend } = useApp();
  const p = row.pallet;
  const thumb = backend.mode==='firebase'?null:read((e) => Object.values(e.db.attachments).find((a) => a.pallet_id === p.id && a.state === 'ready')?.thumb_url ?? null);
  return (
    <button className={`result ${compact ? 'compact' : ''}`} onClick={onOpen}>
      {!compact && (
        <div className="where">
          <WhereCell pallet={p} location={row.location} lastLocation={row.lastLocation} />
        </div>
      )}
      <div className="what">
        <span className="pcode">{p.code}</span>
        <span className="desc">{p.description}</span>
      </div>
      <div className="side">
        {thumb ? <img className="thumb" src={thumb} alt="" /> : null}
        <StateBadge state={p.state} />
      </div>
      <div className="meta">
        <span>
          <span className="jcode">{row.job?.code ?? 'No job'}</span> {row.job?.name}
        </span>
        {p.hold && <HoldBadge title={p.hold.reason} />}
        {p.label_needs_reprint && <span className="tag warn">Reprint label</span>}
      </div>
    </button>
  );
}
