import { FirebaseBackend } from '../../data/firebase';
// CSV import (page 27): template, paste or choose a file, preview with row errors, then one atomic batch.

import { useEffect, useMemo, useState } from 'react';
import { hashString } from '../../domain/codes';
import { IMPORT_TEMPLATES, applyMapping, detectImportKind, guessMapping, headerKey, parseCsv, prepareImport, templateCsv, type ColumnMap, type ImportKind, type SavedImportTemplate } from '../../domain/csv';
import { roleAllows } from '../../domain/transitions';
import { useApp } from '../../app/state';
import { canDownload, copyText, downloadText } from '../../device/output';
import { CommandFeedback } from '../../ui/CommandFeedback';
import { Icon } from '../../ui/icons';
import { useCommand } from '../../ui/useCommand';
import { Explain, Notice, PageHead, PermissionDenied, Spinner, fmtAgo } from '../../ui/ui';
import { LabelSheet } from '../labels/LabelSheet';

const KIND_LABEL: Record<ImportKind, string> = { locations: 'Locations', jobs: 'Jobs', pallets: 'Pallets', shipments: 'Expected shipments' };

// Saved column layouts live in this browser, per warehouse.
const templatesKey = (ws: string | null) => `wherehouse.importTemplates.${ws ?? 'none'}`;
function loadTemplates(ws: string | null): SavedImportTemplate[] {
  try { const v = JSON.parse(localStorage.getItem(templatesKey(ws)) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}
function storeTemplates(ws: string | null, list: SavedImportTemplate[]): boolean {
  try { localStorage.setItem(templatesKey(ws), JSON.stringify(list)); return true; } catch { return false; }
}

export function Import() {
  const { role, toast, backend, go, workspaceId, v } = useApp();
  const [kind, setKind] = useState<ImportKind>('locations');
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [labels, setLabels] = useState<string[] | null>(null);
  const cmd = useCommand();

  const [map, setMap] = useState<ColumnMap | null>(null);
  const [mapFor, setMapFor] = useState('');
  const [templates, setTemplates] = useState<SavedImportTemplate[]>(() => loadTemplates(workspaceId));
  const [tplName, setTplName] = useState('');
  useEffect(() => setTemplates(loadTemplates(workspaceId)), [workspaceId]);
  const fileHeader = useMemo(() => (text.trim() ? parseCsv(text).header : []), [text]);
  const fileKey = useMemo(() => (text.trim() ? headerKey(text) : ''), [text]);
  // A file whose columns don't match the template gets a column matcher instead of a wall of errors.
  const needsMap = useMemo(() => !!text.trim() && prepareImport(kind, text).headerErrors.length > 0, [kind, text]);
  useEffect(() => {
    if (!needsMap) return;
    const key = `${kind}|${fileKey}`;
    if (mapFor !== key) { setMap(guessMapping(kind, fileHeader)); setMapFor(key); }
  }, [needsMap, kind, fileKey, fileHeader, mapFor]);
  const effective = useMemo(() => (needsMap && map ? applyMapping(kind, text, map) : text), [needsMap, map, kind, text]);
  const parsed = useMemo(() => (effective.trim() ? prepareImport(kind, effective) : null), [kind, effective]);
  const checksum = useMemo(() => (effective.trim() ? hashString(effective.replace(/\r\n/g, '\n').trim()) : ''), [effective]);
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

  const kinds = (Object.keys(IMPORT_TEMPLATES) as ImportKind[]).filter(k=>k!=='shipments'||!(backend instanceof FirebaseBackend)||backend.summary?.receiving_version===1);
  // A file whose header fits another template switches to it, instead of failing against the selected one.
  const adopt = (csv: string) => {
    const found = detectImportKind(csv, kinds);
    const saved = found ? undefined : templates.find((tp) => tp.headerKey === headerKey(csv) && kinds.includes(tp.kind));
    if (saved) {
      setKind(saved.kind);
      setMap(saved.map);
      setMapFor(`${saved.kind}|${saved.headerKey}`);
      toast(`Using your saved template “${saved.name}”. Check the preview, then import.`, 'info');
      return;
    }
    if (found && found !== kind) {
      setKind(found);
      toast(`This looks like a ${KIND_LABEL[found].toLowerCase()} file, so Import switched to ${KIND_LABEL[found]}.`, 'info');
    }
  };
  const t = IMPORT_TEMPLATES[kind];
  const cols = [...t.required, ...t.optional];
  const tooMany = (parsed?.rows.length ?? 0) > 200;
  const ready = parsed && !parsed.headerErrors.length && parsed.rows.length > 0 && !tooMany;
  const errors = cmd.state.rejected?.errors ?? [];
  const errorRows = new Set(errors.map((e) => e.row));

  const saveTemplate = () => {
    const name = tplName.trim();
    if (!name || !map) return;
    const next = [...templates.filter((tp) => !(tp.headerKey === fileKey && tp.kind === kind)), { id: Date.now().toString(36), name, kind, map, headerKey: fileKey }];
    if (!storeTemplates(workspaceId, next)) return toast('This browser would not save the template. Private browsing can do this.', 'error');
    setTemplates(next);
    setTplName('');
    toast(`Saved “${name}”. Files with these columns will use it automatically.`);
  };
  const removeTemplate = (id: string) => {
    const next = templates.filter((tp) => tp.id !== id);
    storeTemplates(workspaceId, next);
    setTemplates(next);
  };
  const reset = () => {
    setMap(null);
    setMapFor('');
    setText('');
    setFileName(null);
    cmd.reset();
  };
  const onFile = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 1_000_000) return toast('That file is larger than 1 MB. Split it into smaller files.', 'error');
    cmd.reset();
    setFileName(f.name);
    const csv = await f.text();
    adopt(csv);
    setText(csv);
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
        {kinds.map((k) => (
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
            onChange={(e) => (adopt(e.target.value), setText(e.target.value), setFileName(null), cmd.state.phase !== 'idle' && !cmd.locked && cmd.reset())}
            style={{ minHeight: 140, fontFamily: 'var(--font-mono)', fontSize: 13 }}
            disabled={cmd.locked || !!done}
          />
          {fileName && <span className="muted">Loaded {fileName}</span>}
        </div>
      </div>

      {needsMap && map && !done && (
        <div className="panel stack" data-testid="column-matcher">
          <div className="panel-title">Match your columns</div>
          <p style={{ margin: 0 }}>
            This file's columns don't match the {KIND_LABEL[kind].toLowerCase()} template, so pick which of your columns fills each field. We guessed where we could. Columns you don't pick are ignored.
          </p>
          <div className="stack" style={{ gap: 8 }}>
            {cols.map((field) => (
              <label key={field} className="row nowrap" style={{ gap: 10 }}>
                <span className="mono" style={{ minWidth: 150 }}>{field}{t.required.includes(field) ? ' *' : ''}</span>
                <select className="input" aria-label={`Column for ${field}`} value={map[field] ?? ''} onChange={(e) => setMap({ ...map, [field]: e.target.value })} style={{ maxWidth: 320 }}>
                  <option value="">Not in my file</option>
                  {fileHeader.filter(Boolean).map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </label>
            ))}
          </div>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <input className="input" aria-label="Template name" placeholder="Name it, e.g. Timber Creek packing list" value={tplName} onChange={(e) => setTplName(e.target.value)} maxLength={60} style={{ maxWidth: 320 }} />
            <button className="btn" disabled={!tplName.trim()} onClick={saveTemplate}>
              <Icon name="download" /> Save as template
            </button>
          </div>
          <span className="muted" style={{ fontSize: 13 }}>A saved template is used automatically the next time a file with these columns is added in this browser.</span>
        </div>
      )}

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
                  <button className="btn small" onClick={() => go(kind === 'pallets' ? 'reconcile' : kind === 'shipments' ? 'receive' : kind)}>
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

      {templates.length > 0 && (
        <div className="panel stack">
          <div className="panel-title">Your saved templates</div>
          {templates.map((tp) => (
            <div key={tp.id} className="row" style={{ fontSize: 14 }}>
              <span className="tag">{KIND_LABEL[tp.kind]}</span>
              <span className="grow">{tp.name}</span>
              <button className="btn small ghost" onClick={() => removeTemplate(tp.id)}>Delete</button>
            </div>
          ))}
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
