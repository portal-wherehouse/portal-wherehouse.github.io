// Every import this warehouse has made: searchable, named, and each one opens to its full spreadsheet.

import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../../app/state';
import { FirebaseBackend } from '../../data/firebase';
import { IMPORT_TEMPLATES, toCsv, type ImportKind } from '../../domain/csv';
import type { ImportBatch } from '../../domain/types';
import { canDownload, downloadText } from '../../device/output';
import { CommandFeedback } from '../../ui/CommandFeedback';
import { Icon } from '../../ui/icons';
import { useCommand } from '../../ui/useCommand';
import { Notice, Sheet, Spinner, fmtAgo, fmtFull } from '../../ui/ui';
import { LabelSheet } from '../labels/LabelSheet';

export const KIND_LABEL: Record<ImportKind, string> = { locations: 'Locations', jobs: 'Jobs', pallets: 'Pallets on hand', shipments: 'Incoming', orders: 'Orders' };

export const batchName = (b: ImportBatch) => b.name || `${KIND_LABEL[b.kind]} import`;

/** The columns an import's rows use, in the template's order, then anything else. */
function columnsOf(b: ImportBatch): string[] {
  const t = IMPORT_TEMPLATES[b.kind];
  const seen = new Set<string>();
  for (const r of b.rows ?? []) for (const k of Object.keys(r)) seen.add(k);
  const ordered = [...t.required, ...t.optional].filter((c) => seen.has(c));
  return [...ordered, ...[...seen].filter((c) => !ordered.includes(c))];
}

export function ImportHistory({ batches }: { batches: ImportBatch[] }) {
  const { backend } = useApp();
  const [q, setQ] = useState('');
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const needle = q.trim().toLowerCase();
  const hits = useMemo(() => {
    if (!needle) return batches;
    return batches.filter((b) => {
      const codes = b.kind === 'pallets' ? b.created_ids.map((id) => backend.db.pallets[id]?.code ?? '') : [];
      const hay = [batchName(b), b.file_name ?? '', b.summary, KIND_LABEL[b.kind], fmtFull(b.created_at), ...codes, ...(b.rows ?? []).flatMap((r) => Object.values(r))].join('\n').toLowerCase();
      return needle.split(/\s+/).every((w) => hay.includes(w));
    });
  }, [batches, needle, backend]);
  const shown = all || needle ? hits : hits.slice(0, 10);
  const current = open ? batches.find((b) => b.id === open) : undefined;

  if (!batches.length) return null;
  return (
    <div className="panel stack" data-testid="import-history">
      <div className="panel-title">Your imports</div>
      <div className="search-bar">
        <Icon name="find" />
        <label htmlFor="import-q" className="sr-only">
          Search imports
        </label>
        <input id="import-q" className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search imports, pallet codes or cells" autoComplete="off" />
      </div>
      {shown.length === 0 && <p className="muted" style={{ margin: 0 }}>No import matches “{q.trim()}”.</p>}
      <div className="stack" style={{ gap: 6 }}>
        {shown.map((b) => (
          <button key={b.id} className="import-row" onClick={() => setOpen(b.id)}>
            <span className="tag">{KIND_LABEL[b.kind]}</span>
            <span className="grow">
              <strong>{batchName(b)}</strong>
              <span className="muted"> · {b.summary}</span>
            </span>
            <span className="muted">
              {backend.db.users[b.actor_id]?.name ? `${backend.db.users[b.actor_id]?.name} · ` : ''}
              {fmtAgo(b.created_at)}
            </span>
            <Icon name="chevronRight" />
          </button>
        ))}
      </div>
      {!all && !needle && hits.length > 10 && (
        <button className="btn small" style={{ alignSelf: 'flex-start' }} onClick={() => setAll(true)}>
          Show all {hits.length}
        </button>
      )}
      {current && <ImportDetail batch={current} onClose={() => setOpen(null)} />}
    </div>
  );
}

function ImportDetail({ batch, onClose }: { batch: ImportBatch; onClose: () => void }) {
  const { backend, go, v } = useApp();
  const [name, setName] = useState(batchName(batch));
  const [q, setQ] = useState('');
  const [labels, setLabels] = useState<string[] | null>(null);
  const cmd = useCommand();
  const pallets = batch.kind === 'pallets';
  // Live warehouses load an import's pallets on demand, so their codes and links can show.
  useEffect(() => {
    if (pallets && backend instanceof FirebaseBackend) void backend.loadForLabels(batch.created_ids, []).catch(() => {});
  }, [backend, batch.id, pallets, batch.created_ids]);
  const cols = columnsOf(batch);
  const rows = batch.rows ?? [];
  // Each row of a pallet import created one pallet, in order.
  const palletFor = (i: number) => (pallets && batch.created_ids.length === rows.length ? backend.db.pallets[batch.created_ids[i]] : undefined);
  const needle = q.trim().toLowerCase();
  const visible = rows
    .map((r, i) => ({ r, i, p: palletFor(i) }))
    .filter(({ r, p }) => !needle || needle.split(/\s+/).every((w) => [...Object.values(r), p?.code ?? ''].join('\n').toLowerCase().includes(w)));
  const olderPallets = pallets && !rows.length ? batch.created_ids.map((id) => backend.db.pallets[id]).filter(Boolean) : [];
  void v;

  const rename = async () => {
    const r = await cmd.run('rename_import', { import_id: batch.id, name: name.trim() });
    if (r.phase === 'done') cmd.reset();
  };
  const download = () => {
    const out = rows.map((r, i) => ({ row: String(i + 2), ...(pallets ? { pallet: palletFor(i)?.code ?? '' } : {}), ...r }));
    downloadText(`${batchName(batch).replace(/[^\w\- ]+/g, '').trim() || 'import'}.csv`, toCsv(out, ['row', ...(pallets ? ['pallet'] : []), ...cols]));
  };

  return (
    <Sheet title={batchName(batch)} onClose={onClose} wide>
      <div className="stack">
        <div className="muted" style={{ fontSize: 14 }}>
          <span className="tag">{KIND_LABEL[batch.kind]}</span> {batch.summary} · {fmtFull(batch.created_at)}
          {backend.db.users[batch.actor_id]?.name ? ` · by ${backend.db.users[batch.actor_id]?.name}` : ''}
          {batch.file_name ? ` · from ${batch.file_name}` : ''}
        </div>
        <form
          className="row"
          style={{ flexWrap: 'wrap' }}
          onSubmit={(e) => {
            e.preventDefault();
            void rename();
          }}
        >
          <label htmlFor="import-name" className="sr-only">
            Import name
          </label>
          <input id="import-name" className="input" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} style={{ maxWidth: 360 }} />
          <button className="btn" disabled={!name.trim() || name.trim() === batchName(batch) || cmd.busy}>
            {cmd.busy ? <Spinner /> : <Icon name="edit" />} Rename
          </button>
        </form>
        <CommandFeedback state={cmd.state} onRecover={() => void cmd.recover()} />
        <div className="row" style={{ flexWrap: 'wrap' }}>
          {pallets && batch.created_ids.length > 0 && (
            <button className="btn primary" onClick={() => setLabels(batch.created_ids)}>
              <Icon name="print" /> Print all {batch.created_ids.length} labels
            </button>
          )}
          {batch.kind === 'shipments' && (
            <button className="btn" onClick={() => go('incoming')}>
              <Icon name="import" /> Open Incoming
            </button>
          )}
          {rows.length > 0 && canDownload() && (
            <button className="btn" onClick={download}>
              <Icon name="download" /> Download spreadsheet
            </button>
          )}
        </div>

        {rows.length > 0 ? (
          <>
            <div className="search-bar">
              <Icon name="find" />
              <label htmlFor="import-rows-q" className="sr-only">
                Search this import
              </label>
              <input id="import-rows-q" className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search this spreadsheet" autoComplete="off" />
            </div>
            <div className="table-wrap" style={{ maxHeight: 420, overflow: 'auto' }}>
              <table className="t" style={{ fontSize: 13 }}>
                <thead>
                  <tr>
                    <th className="n">Row</th>
                    {pallets && <th>Pallet</th>}
                    {cols.map((c) => (
                      <th key={c}>{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visible.map(({ r, i, p }) => (
                    <tr key={i}>
                      <td className="n faint">{i + 2}</td>
                      {pallets && (
                        <td>
                          {p ? (
                            <button className="link mono" onClick={() => go({ name: 'pallet', id: p.id })}>
                              {p.code}
                            </button>
                          ) : (
                            <span className="faint">…</span>
                          )}
                        </td>
                      )}
                      {cols.map((c) => (
                        <td key={c}>{r[c] ?? ''}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="muted" style={{ fontSize: 13.5 }}>
              {needle ? `${visible.length} of ${rows.length} rows match.` : `${rows.length} rows. Row numbers match the original spreadsheet, where row 1 is the header.`}
            </div>
          </>
        ) : (
          <>
            <Notice tone="info" title="This import is from before spreadsheets were saved">
              Imports made from now on keep their full spreadsheet here.{olderPallets.length > 0 ? ' The pallets it created are below.' : ''}
            </Notice>
            {olderPallets.length > 0 && (
              <div className="table-wrap" style={{ maxHeight: 420, overflow: 'auto' }}>
                <table className="t" style={{ fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th>Pallet</th>
                      <th>Description</th>
                      <th>Job</th>
                      <th>Supplier ref</th>
                    </tr>
                  </thead>
                  <tbody>
                    {olderPallets.map((p) => (
                      <tr key={p!.id}>
                        <td>
                          <button className="link mono" onClick={() => go({ name: 'pallet', id: p!.id })}>
                            {p!.code}
                          </button>
                        </td>
                        <td>{p!.description}</td>
                        <td>{backend.db.jobs[p!.job_id]?.code ?? ''}</td>
                        <td>{p!.supplier_ref ?? ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
      {labels && <LabelSheet palletIds={labels} onClose={() => setLabels(null)} />}
    </Sheet>
  );
}
