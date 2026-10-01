// Stock reports, a tab beside the map under Stock: on hand by product, by warehouse and by zone, aging, transfers,
// and counts and adjustments. Each one downloads as a CSV file with exactly the rows on screen.

import { useMemo, useState, type ReactNode } from 'react';
import { useApp } from '../../app/state';
import { FirebaseBackend, cloudMessage } from '../../data/firebase';
import { toCsv } from '../../domain/csv';
import {
  AGE_BANDS,
  REPORTS,
  REPORT_TITLE,
  REPORT_WHAT,
  adjustmentCsv,
  adjustmentReport,
  agingCsv,
  agingReport,
  productCsv,
  productReport,
  reportFile,
  totalUnits,
  transferCsv,
  transferReport,
  warehouseCsv,
  zoneCsv,
  zoneReport,
  type ReportId,
  type WarehouseRow,
} from '../../domain/reports';
import { fmtQty } from '../../domain/stock';
import { TRANSFER_STATUS_LABEL } from '../../domain/transfers';
import { canDownload, copyText, downloadText } from '../../device/output';
import { Icon } from '../../ui/icons';
import { StockTabs } from '../../ui/tabSets';
import './stock.css';
import { Empty, Notice, PageHead, Spinner, fmtTime } from '../../ui/ui';

/** At most this many rows on screen; the CSV always has them all. */
const SHOW = 300;

interface Col<R> {
  label: string;
  cell: (r: R) => ReactNode;
  n?: boolean;
  lead?: boolean;
}

interface Built {
  summary: string;
  csv: Record<string, unknown>[];
  table: ReactNode;
  empty: string;
}

export function Reports() {
  const { backend, route } = useApp();
  const cloud = backend instanceof FirebaseBackend ? backend : null;
  const [id, setId] = useState<ReportId>(REPORTS.includes(route.q as ReportId) ? (route.q as ReportId) : 'product');
  // A live warehouse reads the records a report needs when asked, in pages; the sample has them all already.
  const [ready, setReady] = useState<Partial<Record<ReportId, string>>>({});
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [warehouses, setWarehouses] = useState<WarehouseRow[] | null>(null);

  const prepare = async () => {
    if (!cloud) return;
    setError('');
    setProgress(0);
    try {
      if (id === 'warehouse') setWarehouses(await cloud.warehouseRows());
      else await cloud.prepareReport(id, setProgress);
      setReady((r) => ({ ...r, [id]: new Date().toISOString() }));
    } catch (e) {
      setError(cloudMessage(e));
    } finally {
      setProgress(null);
    }
  };

  const isReady = !cloud || !!ready[id];
  return (
    <div className="stack">
      <StockTabs />
      <PageHead title="Stock reports" sub="What is on hand, where, for how long, and what changed. Download any report as a CSV file." />
      <div className="report-picker" role="tablist" aria-label="Reports">
        {REPORTS.map((r) => (
          <button key={r} role="tab" aria-selected={id === r} onClick={() => (setId(r), setError(''))}>
            {REPORT_TITLE[r]}
          </button>
        ))}
      </div>
      <p className="muted report-what">{REPORT_WHAT[id]}</p>
      {!isReady ? (
        <div className="panel stack">
          <p>This report reads every record it needs from your warehouse, in pages. Large warehouses take a moment.</p>
          <div className="row">
            <button className="btn primary" onClick={() => void prepare()} disabled={progress !== null}>
              {progress === null ? (
                <>
                  <Icon name="list" /> Prepare report
                </>
              ) : (
                <>
                  <Spinner /> Reading {progress.toLocaleString()} records…
                </>
              )}
            </button>
          </div>
          {error && <Notice tone="error">{error}</Notice>}
        </div>
      ) : (
        <ReportBody id={id} warehouses={warehouses} preparedAt={ready[id] ?? null} onRefresh={cloud ? () => void prepare() : null} busy={progress !== null} />
      )}
    </div>
  );
}

function ReportBody({ id, warehouses, preparedAt, onRefresh, busy }: { id: ReportId; warehouses: WarehouseRow[] | null; preparedAt: string | null; onRefresh: (() => void) | null; busy: boolean }) {
  const { read, backend, v, toast, go } = useApp();
  const [shown, setShown] = useState<string | null>(null);
  const built = useMemo(
    () =>
      read((e, a, ws): Built => {
        const pallets = Object.values(e.db.pallets).filter((p) => p.workspace_id === ws);
        const open = (pid: string) => go({ name: 'pallet', id: pid });
        if (id === 'product') {
          const rows = productReport(pallets, Object.values(e.db.products).filter((p) => p.workspace_id === ws));
          const low = rows.filter((r) => r.status === 'low').length;
          const linked = rows.filter((r) => r.linked).length;
          return {
            summary: `${linked} ${linked === 1 ? 'product' : 'products'}, ${totalUnits(rows)} pallets on hand${low ? `, ${low} running low` : ''}.`,
            csv: productCsv(rows),
            empty: 'No pallets on hand and no products with a minimum yet.',
            table: table(rows, [
              { label: 'Product', lead: true, cell: (r) => (<><strong data-keep-words>{r.name}</strong>{r.code && <span className="muted mono"> {r.code}</span>}{!r.linked && <span className="muted"> (no product code)</span>}</>) },
              { label: 'On hand', n: true, cell: (r) => r.units },
              { label: 'On hold', n: true, cell: (r) => r.held || '' },
              { label: 'Quantity', n: true, cell: (r) => (r.qty === null ? '' : <span data-keep-words>{`${fmtQty(r.qty)}${r.unit ? ` ${r.unit}` : ''}`}</span>) },
              { label: 'Minimum', n: true, cell: (r) => (r.min === null ? '' : `${fmtQty(r.min)}${r.count_by === 'quantity' ? ` ${r.unit || 'units'}` : ''}`) },
              { label: 'Status', cell: (r) => (r.status === 'low' ? <span className="tag warn">Running low</span> : r.status === 'ok' ? <span className="tag ok">OK</span> : '') },
            ]),
          };
        }
        if (id === 'warehouse') {
          const rows = warehouses ?? e.warehouseRows(a, ws);
          const here = (r: WarehouseRow) => (r.counts.STORED ?? 0) + (r.counts.RECEIVED ?? 0);
          return {
            summary: `${rows.length} ${rows.length === 1 ? 'warehouse' : 'warehouses'}, ${rows.reduce((n, r) => n + here(r), 0)} pallets on hand in all.`,
            csv: warehouseCsv(rows),
            empty: 'No warehouses to show.',
            table: table(rows, [
              { label: 'Warehouse', lead: true, cell: (r) => (<><strong data-keep-words>{r.name}</strong>{r.current && <span className="tag">This one</span>}</>) },
              { label: 'On hand', n: true, cell: here },
              { label: 'Waiting for a spot', n: true, cell: (r) => r.counts.RECEIVED ?? 0 },
              { label: 'On hold', n: true, cell: (r) => r.holds ?? '' },
              { label: 'In transit', n: true, cell: (r) => r.counts.IN_TRANSIT ?? 0 },
              { label: 'Missing', n: true, cell: (r) => r.counts.MISSING ?? 0 },
              { label: 'Dispatched', n: true, cell: (r) => r.counts.DISPATCHED ?? 0 },
            ]),
          };
        }
        if (id === 'zone') {
          const rows = zoneReport(pallets, Object.values(e.db.locations).filter((l) => l.workspace_id === ws));
          return {
            summary: `${totalUnits(rows)} pallets on hand across ${rows.length} ${rows.length === 1 ? 'zone or area' : 'zones and areas'}.`,
            csv: zoneCsv(rows),
            empty: 'No spots or pallets yet.',
            table: table(rows, [
              { label: 'Zone or area', lead: true, cell: (r) => <strong>{r.zone}</strong> },
              { label: 'On hand', n: true, cell: (r) => r.units },
              { label: 'On hold', n: true, cell: (r) => r.held || '' },
              { label: 'Spots in use', n: true, cell: (r) => (r.spots ? `${r.spots_used} of ${r.spots}` : '') },
            ]),
          };
        }
        if (id === 'aging') {
          const { rows, bands } = agingReport(pallets, e.db.locations, Date.now());
          return {
            summary: bands.map((b) => `${b.label}: ${b.units}`).join(' · '),
            csv: agingCsv(rows),
            empty: 'No pallets on hand.',
            table: (
              <>
                <div className="age-bands" aria-label="Pallets by age">
                  {bands.map((b, i) => (
                    <div key={b.label} className={`age-band band-${i}`}>
                      <strong>{b.units}</strong>
                      <span>{b.label}</span>
                    </div>
                  ))}
                </div>
                {table(rows, [
                  { label: 'Pallet', lead: true, cell: (r) => (<button className="link-btn" onClick={() => open(r.pallet.id)}><span className="pcode">{r.pallet.code}</span> <span data-keep-words>{r.pallet.description}</span></button>) },
                  { label: 'Days here', n: true, cell: (r) => r.days },
                  { label: 'Spot', cell: (r) => r.spot || 'Waiting for a spot' },
                  { label: 'Received', cell: (r) => new Date(r.pallet.received_at).toLocaleDateString() },
                  { label: 'Age', cell: (r) => AGE_BANDS[r.band]?.label ?? '' },
                ])}
              </>
            ),
          };
        }
        if (id === 'transfers') {
          const rows = transferReport(Object.values(e.db.transfers), ws);
          return {
            summary: `${rows.filter((r) => r.direction === 'out').length} sent, ${rows.filter((r) => r.direction === 'in').length} received or on the way here.`,
            csv: transferCsv(rows),
            empty: 'No transfers to or from this warehouse yet.',
            table: table(rows, [
              { label: 'Transfer', lead: true, cell: (r) => (<button className="link-btn" onClick={() => go({ name: 'transfer', id: r.t.id })}><span className="mono">{r.t.number}</span> <span data-keep-words>{r.direction === 'out' ? `to ${r.t.to_name}` : `from ${r.t.from_name}`}</span></button>) },
              { label: 'Status', cell: (r) => TRANSFER_STATUS_LABEL[r.t.status] },
              { label: 'Pallets', n: true, cell: (r) => r.units },
              { label: 'Received', n: true, cell: (r) => r.received },
              { label: 'Created', cell: (r) => fmtTime(r.t.created_at) },
            ]),
          };
        }
        const events = Object.values(e.db.events).flat();
        const rows = adjustmentReport(events, e.db.pallets, e.db.users, ws);
        return {
          summary: `${rows.length} ${rows.length === 1 ? 'entry' : 'entries'}, newest first.`,
          csv: adjustmentCsv(rows),
          empty: 'No counts or adjustments recorded yet.',
          table: table(rows, [
            { label: 'When', lead: true, cell: (r) => (<><strong>{fmtTime(r.e.accepted_at)}</strong> <button className="link-btn" onClick={() => open(r.e.pallet_id)}><span className="pcode">{r.code}</span></button></>) },
            { label: 'What', cell: (r) => r.kind },
            { label: 'Detail', cell: (r) => <span data-keep-words>{[r.detail, r.e.reason].filter(Boolean).join('. ')}</span> },
            { label: 'By', cell: (r) => <span data-keep-words>{r.person}</span> },
          ]),
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id, v, warehouses, backend.network],
  );
  if (!built) return null;
  const at = new Date().toISOString();
  const csv = () => toCsv(built.csv);
  const save = async () => {
    if (canDownload()) downloadText(reportFile(id, at), csv());
    else if (await copyText(csv())) toast(`${REPORT_TITLE[id]} copied to the clipboard`, 'info');
    else setShown(csv());
  };
  return (
    <div className="stack" data-testid={`report-${id}`}>
      <div className="row report-bar">
        <p className="grow report-summary">
          <strong>{built.summary}</strong>
          {preparedAt && <span className="muted"> Prepared {fmtTime(preparedAt)}.</span>}
        </p>
        {onRefresh && (
          <button className="btn small" onClick={onRefresh} disabled={busy}>
            {busy ? <Spinner /> : <Icon name="refresh" />} Refresh
          </button>
        )}
        <button className="btn primary small" onClick={() => void save()} disabled={!built.csv.length}>
          <Icon name="download" /> {canDownload() ? 'Download CSV' : 'Copy CSV'}
        </button>
      </div>
      {!canDownload() && shown && <textarea className="textarea mono" readOnly value={shown} style={{ minHeight: 160 }} aria-label="CSV" />}
      {built.csv.length === 0 ? (
        <Empty icon="list" title="Nothing to report">
          {built.empty}
        </Empty>
      ) : (
        <>
          {built.table}
          {built.csv.length > SHOW && <p className="muted">Showing the first {SHOW} of {built.csv.length.toLocaleString()} rows. The CSV file has them all.</p>}
        </>
      )}
    </div>
  );
}

function table<R>(rows: R[], cols: Col<R>[]): ReactNode {
  return (
    <div className="table-wrap report-table">
      <table className="t cards-sm">
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={c.label} className={c.n ? 'n' : undefined}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, SHOW).map((r, i) => (
            <tr key={i}>
              {cols.map((c) => (
                <td key={c.label} className={c.lead ? 'lead' : c.n ? 'n' : undefined} data-label={c.lead ? undefined : c.label}>
                  {c.cell(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

