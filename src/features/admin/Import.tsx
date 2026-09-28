// CSV import (page 27): template, paste or choose a file, preview with row errors, then one atomic batch.

import { useMemo, useState } from 'react';
import { hashString } from '../../domain/codes';
import { IMPORT_TEMPLATES, prepareImport, templateCsv, type ImportKind } from '../../domain/csv';
import { roleAllows } from '../../domain/transitions';
import { useApp } from '../../app/state';
import { canDownload, copyText, downloadText } from '../../device/output';
import { CommandFeedback } from '../../ui/CommandFeedback';
import { Icon } from '../../ui/icons';
import { useCommand } from '../../ui/useCommand';
import { Explain, Notice, PageHead, PermissionDenied, Spinner, fmtAgo } from '../../ui/ui';
import { LabelSheet } from '../labels/LabelSheet';

const KIND_LABEL: Record<ImportKind, string> = { locations: 'Locations', jobs: 'Jobs', pallets: 'Pallets' };

export function Import() {
  const { role, toast, backend, go, workspaceId, v } = useApp();
  const [kind, setKind] = useState<ImportKind>('locations');
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [labels, setLabels] = useState<string[] | null>(null);
  const cmd = useCommand();

  const parsed = useMemo(() => (text.trim() ? prepareImport(kind, text) : null), [kind, text]);
  const checksum = useMemo(() => (text.trim() ? hashString(text.replace(/\r\n/g, '\n').trim()) : ''), [text]);
  const earlier = useMemo(
    () => Object.values(backend.db.imports).filter((b) => b.workspace_id === workspaceId).sort((a, b) => b.created_at.localeCompare(a.created_at)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [v, workspaceId],
  );
  const same = earlier.find((b) => b.checksum === checksum && b.kind === kind);

  if (!roleAllows(role, 'import_batch')) {
    return (
      <div className="stack">
        <PageHead title="Import" />
        <PermissionDenied what="Importing" need="Supervisor" />
      </div>
    );
  }

  const t = IMPORT_TEMPLATES[kind];
  const cols = [...t.required, ...t.optional];
  const tooMany = (parsed?.rows.length ?? 0) > 200;
  const ready = parsed && !parsed.headerErrors.length && parsed.rows.length > 0 && !tooMany;
  const errors = cmd.state.rejected?.errors ?? [];
  const errorRows = new Set(errors.map((e) => e.row));

  const reset = () => {
    setText('');
    setFileName(null);
    cmd.reset();
  };
  const onFile = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 1_000_000) return toast('That file is larger than 1 MB. Split it into smaller files.', 'error');
    cmd.reset();
    setFileName(f.name);
    setText(await f.text());
  };
  const template = async () => {
    const csv = templateCsv(kind);
    if (canDownload()) downloadText(`wherehouse-${kind}-template.csv`, csv);
    else if (await copyText(csv)) toast('Template copied. Paste it into a spreadsheet, or straight into the box below.', 'info');
  };
  const commit = async () => {
    if (!parsed) return;
    const r = await cmd.run('import_batch', { import_kind: kind, checksum, rows: parsed.rows });
    if (r.phase === 'done') {
      toast(`Import committed: ${r.accepted?.created_ids?.length ?? 0} created`);
      if (kind === 'pallets' && r.accepted?.created_ids?.length) setLabels(r.accepted.created_ids);
    }
  };

  const done = cmd.state.phase === 'done' && cmd.state.accepted;

  return (
    <div className="stack">
      <PageHead title="Import" sub="Bring in locations, jobs or already-received pallets from a spreadsheet saved as CSV." />
      <Explain refs="page 27">
        <p>An import is one batch: every row goes in, or none do. Problems are reported by row and column so you can fix the file and try again. The batch has its own ID, so pressing Import twice, or losing the connection, never creates duplicates.</p>
        <p>Imported pallets start as received with no location. The app never invents a rack for them. Staff confirm each one by placing it with a scan.</p>
      </Explain>

      <div className="seg" role="group" aria-label="What to import" data-tour="import-kind">
        {(Object.keys(IMPORT_TEMPLATES) as ImportKind[]).map((k) => (
          <button key={k} aria-pressed={kind === k} onClick={() => (setKind(k), cmd.reset())}>
            {KIND_LABEL[k]}
          </button>
        ))}
      </div>

      <div className="grid-2" style={{ alignItems: 'start' }} data-tour="import-steps">
        <div className="panel stack">
          <div className="panel-title">1 · Get the template</div>
          <p style={{ margin: 0 }}>{t.policy}</p>
          <div className="code-block">{templateCsv(kind)}</div>
          <div className="muted" style={{ fontSize: 13.5 }}>
            Required: {t.required.map((c) => <span key={c} className="mono">{c} </span>)}
            {t.optional.length > 0 && (
              <>
                · Optional: {t.optional.map((c) => <span key={c} className="mono">{c} </span>)}
              </>
            )}
            · Up to 200 rows per batch.
          </div>
          <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => void template()}>
            <Icon name={canDownload() ? 'download' : 'copy'} /> {canDownload() ? 'Download template' : 'Copy template'}
          </button>
        </div>
        <div className="panel stack">
          <div className="panel-title">2 · Add your file</div>
          <label className="btn" style={{ alignSelf: 'flex-start' }}>
            <Icon name="upload" /> Choose CSV file
            <input type="file" accept=".csv,text/csv,text/plain" className="sr-only" onChange={(e) => void onFile(e.target.files?.[0])} />
          </label>
          <textarea
            className="textarea code"
            aria-label="CSV text"
            placeholder={`…or paste CSV here, starting with the header row:\n${cols.join(',')}`}
            value={text}
            onChange={(e) => (setText(e.target.value), setFileName(null), cmd.state.phase !== 'idle' && !cmd.locked && cmd.reset())}
            style={{ minHeight: 140, fontFamily: 'var(--font-mono)', fontSize: 13 }}
            disabled={cmd.locked || !!done}
          />
          {fileName && <span className="muted">Loaded {fileName}</span>}
        </div>
      </div>

      {parsed && (
        <div className="panel stack">
          <div className="panel-title">
            3 · Check and import <span className="grow" />
            <span className="mono faint" style={{ fontSize: 12, textTransform: 'none', letterSpacing: 0 }}>
              checksum {checksum}
            </span>
          </div>
          {parsed.headerErrors.map((e) => (
            <Notice key={e} tone="error">
              {e} Expected columns: {cols.join(', ')}.
            </Notice>
          ))}
          {tooMany && <Notice tone="error">This file has {parsed.rows.length} rows. A batch is limited to 200. Split the file.</Notice>}
          {same && !done && (
            <Notice tone="warn" title="This exact file was already imported">
              {fmtAgo(same.created_at)}: {same.summary}. Importing it again is a separate batch. For pallets that would create a second set.
            </Notice>
          )}
          {parsed.rows.length > 0 && (
            <div className="table-wrap" style={{ maxHeight: 360, overflow: 'auto' }}>
              <table className="t" style={{ fontSize: 13 }}>
                <thead>
                  <tr>
                    <th className="n">Row</th>
                    {cols.map((c) => (
                      <th key={c}>{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {parsed.rows.slice(0, 200).map((r, i) => (
                    <tr key={i} style={errorRows.has(i + 2) ? { background: 'var(--bad-soft)' } : undefined}>
                      <td className="n faint">{i + 2}</td>
                      {cols.map((c) => (
                        <td key={c}>{r[c] ?? ''}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="muted" style={{ fontSize: 13.5 }}>
            {parsed.rows.length} data {parsed.rows.length === 1 ? 'row' : 'rows'}. Row numbers match your spreadsheet, where row 1 is the header.
          </div>
          <CommandFeedback state={cmd.state} onRecover={() => void cmd.recover()} />
          {done ? (
            <Notice
              tone="ok"
              title={`Batch committed: ${cmd.state.accepted?.created_ids?.length ?? 0} ${kind} created`}
              actions={
                <>
                  {kind === 'pallets' && (
                    <button className="btn small primary" onClick={() => setLabels(cmd.state.accepted?.created_ids ?? [])}>
                      <Icon name="print" /> Print labels
                    </button>
                  )}
                  <button className="btn small" onClick={() => go(kind === 'pallets' ? 'reconcile' : kind)}>
                    Open {kind === 'pallets' ? 'reconcile' : KIND_LABEL[kind].toLowerCase()}
                  </button>
                  <button className="btn small" onClick={reset}>
                    Import another
                  </button>
                </>
              }
            >
              Batch ID <span className="mono">{cmd.state.accepted?.command_id.slice(0, 8)}</span>. It is recorded in the admin audit log.
            </Notice>
          ) : (
            !cmd.locked && (
              <div className="row">
                <button className="btn primary big" disabled={!ready || cmd.busy || backend.network === 'offline'} onClick={() => void commit()}>
                  {cmd.busy ? <Spinner /> : <Icon name="import" />} Import {parsed.rows.length} rows
                </button>
                <button className="btn big" onClick={reset} disabled={cmd.busy}>
                  Clear
                </button>
                {backend.network === 'offline' && <span className="muted">Imports need a connection.</span>}
              </div>
            )
          )}
        </div>
      )}

      {earlier.length > 0 && (
        <div className="panel stack">
          <div className="panel-title">Earlier imports</div>
          {earlier.slice(0, 8).map((b) => (
            <div key={b.id} className="row" style={{ fontSize: 14 }}>
              <span className="tag">{KIND_LABEL[b.kind]}</span>
              <span className="grow">{b.summary}</span>
              <span className="muted">
                {backend.db.users[b.actor_id]?.name} · {fmtAgo(b.created_at)}
              </span>
            </div>
          ))}
        </div>
      )}
      {labels && <LabelSheet palletIds={labels} onClose={() => setLabels(null)} />}
    </div>
  );
}
