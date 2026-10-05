// The guided print flow: 1. choose your printer, 2. choose what to print (only what that printer can make),
// 3. choose which spots, check the true-size preview, and print. Used by the setup checklist and by the
// Spots and labels page. The chosen printer is remembered for each warehouse on this computer.

import { useEffect, useMemo, useState } from 'react';
import { where } from 'firebase/firestore';
import { useApp } from '../../app/state';
import { useJobsOn } from '../../app/words';
import { FirebaseBackend } from '../../data/firebase';
import { canPrint, IS_PREVIEW } from '../../device/output';
import type { Location, Pallet } from '../../domain/types';
import { Icon } from '../../ui/icons';
import { Notice, Spinner } from '../../ui/ui';
import { Calibration } from './LabelCard';
import { PrintPortal } from './LabelSheet';
import { Pages, type PrintItem, type Section } from './PrintLabels';
import { aisleOf, loadPrinterChoice, loadPrinted, markPrinted, pageCss, paginate, perPage, PRINTERS, printableName, printerById, savePrinterChoice, sizeText, STYLES, styleById, zoneOf, type PrinterDef, type PrinterId, type StyleId } from './printers';
import './print.css';

type SpotScope = 'all' | 'zone' | 'aisle' | 'unprinted';
type PalletSource = 'reprint' | 'received' | 'job';

export function PrintFlow({ styles = ['spot', 'shelf', 'poster', 'item'], onPrinted, intro }: { styles?: StyleId[]; onPrinted?: (count: number) => void; intro?: React.ReactNode }) {
  const { backend, workspaceId, read, v } = useApp();
  const jobsOn = useJobsOn();
  const wh = useMemo(() => Object.values(backend.db.warehouses).find((w) => w.workspace_id === workspaceId && w.active) ?? null, [backend, workspaceId, v]);
  const saved = useMemo(() => loadPrinterChoice(wh?.id), [wh?.id]);
  const [printerId, setPrinterId] = useState<PrinterId | null>(saved.printer);
  const [styleId, setStyleId] = useState<StyleId | null>(saved.style && styles.includes(saved.style) ? saved.style : null);
  const [editing, setEditing] = useState<1 | 2 | null>(null);
  const [scope, setScope] = useState<SpotScope>('all');
  const [zone, setZone] = useState('');
  const [aisle, setAisle] = useState('');
  const [signs, setSigns] = useState<'zone' | 'aisle'>('zone');
  const [source, setSource] = useState<PalletSource>('received');
  const [jobId, setJobId] = useState('');
  const [page, setPage] = useState(0);
  const [loadingSpots, setLoadingSpots] = useState(true);
  const [tokensReady, setTokensReady] = useState(backend.mode !== 'firebase');
  const [error, setError] = useState('');
  const [printedNow, setPrintedNow] = useState(0);

  const printer = printerById(printerId);
  const style = styleById(styleId);
  const layout = printer && styleId ? printer.styles[styleId] ?? null : null;
  const choosePrinter = (p: PrinterDef) => {
    setPrinterId(p.id);
    // Keep the style when the new printer makes it; otherwise ask again.
    const keep = styleId && p.styles[styleId] && styles.includes(styleId) ? styleId : null;
    const only = (Object.keys(p.styles) as StyleId[]).filter((s) => styles.includes(s));
    const next = keep ?? (only.length === 1 ? only[0] : null);
    setStyleId(next);
    setEditing(null);
    setPage(0);
    savePrinterChoice(wh?.id, p.id, next);
  };
  const chooseStyle = (s: StyleId) => {
    setStyleId(s);
    setEditing(null);
    setPage(0);
    savePrinterChoice(wh?.id, printerId, s);
  };

  // Every spot in the warehouse, not just the first page the live directory loads.
  useEffect(() => {
    let live = true;
    setLoadingSpots(true);
    void backend
      .loadAllLocations()
      .catch(() => live && setError('Some spots could not load. Check your connection and try again.'))
      .finally(() => live && setLoadingSpots(false));
    return () => {
      live = false;
    };
  }, [backend, workspaceId]);

  // Pallets for item labels, read the same way the Labels page always has.
  useEffect(() => {
    if (styleId !== 'item' || !(backend instanceof FirebaseBackend)) return;
    const filters = [where('archived_at', '==', null)];
    if (source === 'job' && jobId) filters.push(where('job_id', '==', jobId));
    else if (source === 'reprint') filters.push(where('label_needs_reprint', '==', true));
    else filters.push(where('state', '==', 'RECEIVED'));
    void backend.filteredList('records', filters);
  }, [backend, styleId, source, jobId]);

  const data = read((e, _a, ws) => {
    const w = e.activeWarehouse(ws);
    const spots = Object.values(e.db.locations)
      .filter((l) => l.workspace_id === ws && l.active && (!w || l.warehouse_id === w.id))
      .sort((a, b) => a.code.localeCompare(b.code, 'en', { numeric: true }));
    const pallets = Object.values(e.db.pallets)
      .filter((p) => p.workspace_id === ws && p.state !== 'RETIRED' && !p.archived_at)
      .sort((a, b) => a.code.localeCompare(b.code));
    const jobs = Object.values(e.db.jobs).filter((j) => j.workspace_id === ws && j.status === 'OPEN');
    return { name: printableName(w?.name), spots, pallets, jobs, e };
  });
  const zoneNames = useMemo(() => Object.fromEntries((wh?.onboarding?.zones ?? []).map((z) => [z.letter, z.name])), [wh]);
  const spots = data?.spots ?? [];
  const zones = useMemo(() => [...new Set(spots.map((l) => zoneOf(l.code)))], [spots]);
  const aisles = useMemo(() => [...new Set(spots.map((l) => aisleOf(l.code)).filter((a): a is string => !!a))], [spots]);
  const printed = useMemo(() => loadPrinted(wh?.id), [wh?.id, printedNow]);

  const chosenSpots: Location[] =
    scope === 'zone' && zone ? spots.filter((l) => zoneOf(l.code) === zone) : scope === 'aisle' && aisle ? spots.filter((l) => aisleOf(l.code) === aisle) : scope === 'unprinted' ? spots.filter((l) => !printed.has(l.id)) : scope === 'all' ? spots : [];
  const sections: Section[] = useMemo(() => {
    const groups = new Map<string, Location[]>();
    for (const l of spots) {
      const key = signs === 'zone' ? zoneOf(l.code) : aisleOf(l.code);
      if (!key) continue;
      groups.set(key, [...(groups.get(key) ?? []), l]);
    }
    return [...groups].map(([code, list]) => ({ code, kind: signs, name: zoneNames[zoneOf(code)] ?? '', first: list[0].code, last: list[list.length - 1].code, count: list.length }));
  }, [spots, signs, zoneNames]);
  const pallets: Pallet[] = (data?.pallets ?? []).filter((p) => (source === 'reprint' ? p.label_needs_reprint : source === 'job' ? !!jobId && p.job_id === jobId && p.state !== 'DISPATCHED' : p.state === 'RECEIVED'));

  const items: PrintItem[] = !data
    ? []
    : style?.of === 'sections'
      ? sections.map((section) => ({ kind: 'section', section }))
      : style?.of === 'pallets'
        ? pallets.map((p) => ({ kind: 'pallet', pallet: p, job: data.e.db.jobs[p.job_id], token: data.e.activeLabel(p.id)?.token ?? '' }))
        : chosenSpots.map((l) => ({ kind: 'spot', location: l, token: data.e.activeLabel(l.id)?.token ?? '' }));

  // Live warehouses read the label tokens for what is about to print.
  const ids = style?.of === 'pallets' ? pallets.map((p) => p.id) : style?.of === 'spots' ? chosenSpots.map((l) => l.id) : [];
  const idsKey = `${style?.of}:${ids.join(',')}`;
  useEffect(() => {
    if (!(backend instanceof FirebaseBackend) || !ids.length) return void setTokensReady(true);
    let live = true;
    setTokensReady(false);
    void backend
      .loadForLabels(style?.of === 'pallets' ? ids : [], style?.of === 'spots' ? ids : [])
      .then(() => live && setTokensReady(true))
      .catch(() => live && setError('Labels could not load. Check your connection and try again.'));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backend, idsKey]);

  const pages = layout ? paginate(items, layout) : [];
  const shown = Math.min(page, Math.max(0, pages.length - 1));
  const sheetWord = printer?.kind === 'thermal' ? (items.length === 1 ? 'label' : 'labels') : pages.length === 1 ? 'sheet' : 'sheets';
  const stylesHere = printer ? STYLES.filter((s) => styles.includes(s.id) && printer.styles[s.id]) : [];
  const step = !printer || editing === 1 ? 1 : !style || !layout || editing === 2 ? 2 : 3;

  const print = () => {
    if (style?.of === 'spots') {
      markPrinted(wh?.id, chosenSpots.map((l) => l.id));
      setPrintedNow((n) => n + 1);
    }
    onPrinted?.(items.length);
    if (canPrint()) window.print();
  };

  return (
    <div className="print-flow" data-testid="print-flow">
      {intro}
      {error && <Notice tone="error">{error}</Notice>}

      <section className={`pf-step${step === 1 ? ' open' : ' done'}`} aria-label="Step 1: choose your printer">
        <header className="pf-head">
          <span className="pf-num">{step > 1 ? <Icon name="check" /> : 1}</span>
          <div className="pf-title">
            <h2>Choose your printer</h2>
            {step > 1 && printer ? (
              <p className="pf-summary" data-testid="pf-printer-summary">
                {printer.title} · {printer.size}
              </p>
            ) : (
              <p className="pf-hint">What will the labels come out of? We only show label styles your printer can make.</p>
            )}
          </div>
          {step > 1 && (
            <button type="button" className="btn small" onClick={() => setEditing(1)}>
              Change
            </button>
          )}
        </header>
        {step === 1 && (
          <div className="pf-body">
            {(['paper', 'thermal'] as const).map((kind) => (
              <div key={kind} className="pf-group">
                <p className="eyebrow">{kind === 'paper' ? 'Regular printer, letter-size sheets' : 'Label printer, one label at a time'}</p>
                <div className="pf-cards" role="radiogroup" aria-label={kind === 'paper' ? 'Regular printers' : 'Label printers'}>
                  {PRINTERS.filter((p) => p.kind === kind && STYLES.some((s) => styles.includes(s.id) && p.styles[s.id])).map((p) => (
                    <button key={p.id} type="button" role="radio" aria-checked={printerId === p.id} className={`pf-card${printerId === p.id ? ' on' : ''}`} onClick={() => choosePrinter(p)} data-testid={`printer-${p.id}`}>
                      <PrinterArt printer={p} />
                      <span className="pf-card-text">
                        <strong>{p.title}</strong>
                        <small className="pf-size">{p.size}</small>
                        <small>{p.examples}</small>
                        <small className="pf-makes">Prints: {STYLES.filter((s) => styles.includes(s.id) && p.styles[s.id]).map((s) => s.title.replace(/ label(s)?$/, '').toLowerCase()).join(', ')}</small>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className={`pf-step${step === 2 ? ' open' : step > 2 ? ' done' : ' later'}`} aria-label="Step 2: choose what to print">
        <header className="pf-head">
          <span className="pf-num">{step > 2 ? <Icon name="check" /> : 2}</span>
          <div className="pf-title">
            <h2>Choose what to print</h2>
            {step > 2 && style && layout ? (
              <p className="pf-summary" data-testid="pf-style-summary">
                {style.title} · {sizeText(layout)}
                {printer?.kind === 'paper' ? `, ${perPage(layout)} per sheet` : ''}
              </p>
            ) : (
              <p className="pf-hint">{printer ? `These are the labels a ${printer.title.toLowerCase().replace(/^an? /, '')} can print.` : 'Pick a printer first.'}</p>
            )}
          </div>
          {step > 2 && stylesHere.length > 1 && (
            <button type="button" className="btn small" onClick={() => setEditing(2)}>
              Change
            </button>
          )}
        </header>
        {step === 2 && printer && (
          <div className="pf-body">
            <div className="pf-cards styles" role="radiogroup" aria-label="Label style">
              {stylesHere.map((s) => {
                const l = printer.styles[s.id]!;
                return (
                  <button key={s.id} type="button" role="radio" aria-checked={styleId === s.id} className={`pf-card pf-style${styleId === s.id ? ' on' : ''}`} onClick={() => chooseStyle(s.id)} data-testid={`style-${s.id}`}>
                    <StyleArt style={s.id} />
                    <span className="pf-card-text">
                      <strong>{s.title}</strong>
                      <small className="pf-size">
                        {sizeText(l)}
                        {printer.kind === 'paper' ? `, ${perPage(l)} per sheet` : ''}
                      </small>
                      <small>{s.sub}</small>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </section>

      <section className={`pf-step${step === 3 ? ' open' : ' later'}`} aria-label="Step 3: choose which to print, then print">
        <header className="pf-head">
          <span className="pf-num">3</span>
          <div className="pf-title">
            <h2>{style?.of === 'pallets' ? 'Choose which items, then print' : style?.of === 'sections' ? 'Choose which signs, then print' : 'Choose which spots, then print'}</h2>
            <p className="pf-hint">The preview below is actual size. Hold a label sheet up to the screen to compare.</p>
          </div>
        </header>
        {step === 3 && style && layout && printer && (
          <div className="pf-body stack">
            <div className="pf-scope" role="radiogroup" aria-label="Which to print">
              {style.of === 'spots' && (
                <>
                  <Radio on={scope === 'all'} onPick={() => setScope('all')} label={`All spots (${spots.length})`} testid="scope-all" />
                  {zones.length > 1 && <Radio on={scope === 'zone'} onPick={() => (setScope('zone'), setZone(zone || zones[0]))} label="One zone" testid="scope-zone" />}
                  {aisles.length > 1 && <Radio on={scope === 'aisle'} onPick={() => (setScope('aisle'), setAisle(aisle || aisles[0]))} label="One aisle" testid="scope-aisle" />}
                  <Radio on={scope === 'unprinted'} onPick={() => setScope('unprinted')} label={`Not printed from this computer yet (${spots.filter((l) => !printed.has(l.id)).length})`} testid="scope-unprinted" />
                </>
              )}
              {style.of === 'sections' && (
                <>
                  <Radio on={signs === 'zone'} onPick={() => setSigns('zone')} label={`One sign per zone (${zones.length})`} testid="signs-zone" />
                  {aisles.length > 0 && <Radio on={signs === 'aisle'} onPick={() => setSigns('aisle')} label={`One sign per aisle (${aisles.length})`} testid="signs-aisle" />}
                </>
              )}
              {style.of === 'pallets' && (
                <>
                  <Radio on={source === 'received'} onPick={() => setSource('received')} label="Waiting for placement" testid="source-received" />
                  <Radio on={source === 'reprint'} onPick={() => setSource('reprint')} label="Needs a new label" testid="source-reprint" />
                  {jobsOn && <Radio on={source === 'job'} onPick={() => setSource('job')} label="Everything for one job" testid="source-job" />}
                </>
              )}
            </div>
            {style.of === 'spots' && scope === 'zone' && (
              <select className="select pf-select" aria-label="Zone" value={zone} onChange={(e) => setZone(e.target.value)}>
                {zones.map((z) => (
                  <option key={z} value={z}>
                    Zone {z}
                    {zoneNames[z] ? `, ${zoneNames[z]}` : ''}
                  </option>
                ))}
              </select>
            )}
            {style.of === 'spots' && scope === 'aisle' && (
              <select className="select pf-select" aria-label="Aisle" value={aisle} onChange={(e) => setAisle(e.target.value)}>
                {aisles.map((a) => (
                  <option key={a} value={a}>
                    Aisle {a}
                  </option>
                ))}
              </select>
            )}
            {style.of === 'pallets' && source === 'job' && (
              <select className="select pf-select" aria-label="Job" value={jobId} onChange={(e) => setJobId(e.target.value)}>
                <option value="">Choose a job</option>
                {(data?.jobs ?? []).map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.code} · {j.name}
                  </option>
                ))}
              </select>
            )}
            {style.id === 'shelf' && <p className="pf-tip"><Icon name="info" /> Put one shelf label on the shelf edge under each spot, about every 12 inches, with the barcode facing out.</p>}
            {style.id === 'poster' && <p className="pf-tip"><Icon name="info" /> Hang each sign at the end of its row, at eye level, so people can find the section from the aisle.</p>}
            {style.id === 'spot' && <p className="pf-tip"><Icon name="info" /> Stick each label on the beam or floor just below its spot, where a phone or scanner can reach it.</p>}

            {loadingSpots && style.of !== 'pallets' ? (
              <p className="muted" role="status">
                <Spinner /> Counting every spot in this warehouse…
              </p>
            ) : items.length === 0 ? (
              <Notice tone="info" icon="print">
                {style.of === 'pallets' ? (source === 'job' && !jobId ? 'Choose a job first.' : 'Nothing in this list right now. Choose another one above.') : scope === 'unprinted' ? 'Every spot has been printed from this computer. Pick All spots to print them again.' : 'There are no spots to print yet. Create spots first.'}
              </Notice>
            ) : (
              <>
                <div className="pf-preview-head">
                  <strong data-testid="print-count">
                    {items.length} {items.length === 1 ? 'label' : 'labels'}
                    {printer.kind === 'paper' ? ` on ${pages.length} ${sheetWord}` : ''}
                  </strong>
                  <span className="muted">Actual size{pages.length > 1 ? ` · ${printer.kind === 'thermal' ? 'Label' : 'Sheet'} ${shown + 1} of ${pages.length}` : ''}</span>
                  {pages.length > 1 && (
                    <span className="pf-pager">
                      <button type="button" className="btn small" aria-label="Previous page" disabled={shown === 0} onClick={() => setPage(shown - 1)}>
                        <Icon name="chevronLeft" />
                      </button>
                      <button type="button" className="btn small" aria-label="Next page" disabled={shown >= pages.length - 1} onClick={() => setPage(shown + 1)}>
                        <Icon name="chevronRight" />
                      </button>
                    </span>
                  )}
                </div>
                <div className={`pf-preview ${printer.kind}`} data-testid="print-preview" data-printer={printer.id} data-style={style.id}>
                  <Pages pages={[pages[shown]]} layout={layout} style={style.id} warehouse={data?.name ?? ''} jobsOn={jobsOn} />
                </div>
                <PrintAdvice printer={printer} size={sizeText(layout)} />
                <Calibration />
                {IS_PREVIEW ? (
                  <Notice tone="info" icon="print">
                    This hosted preview cannot open a print dialog. Run the app from its own address to print on paper.
                  </Notice>
                ) : (
                  <div className="row pf-go">
                    <button type="button" className="btn primary big" disabled={!tokensReady || !canPrint()} onClick={print} data-testid="print-go">
                      {tokensReady ? <Icon name="print" /> : <Spinner />} Print {items.length} {items.length === 1 ? 'label' : 'labels'}
                    </button>
                    <span className="muted">Cancelling the print dialog changes nothing.</span>
                  </div>
                )}
                <PrintPortal>
                  <style>{pageCss(layout)}</style>
                  <div className={`pp-print ${printer.kind}`}>
                    <Pages pages={pages} layout={layout} style={style.id} warehouse={data?.name ?? ''} jobsOn={jobsOn} />
                  </div>
                </PrintPortal>
              </>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function Radio({ on, onPick, label, testid }: { on: boolean; onPick: () => void; label: string; testid?: string }) {
  return (
    <button type="button" role="radio" aria-checked={on} className={`pf-radio${on ? ' on' : ''}`} onClick={onPick} data-testid={testid}>
      <span className="pf-dot" aria-hidden="true" />
      {label}
    </button>
  );
}

function PrintAdvice({ printer, size }: { printer: PrinterDef; size: string }) {
  return (
    <div className="pf-advice">
      <Icon name="settings" />
      <div>
        <strong>In the print dialog</strong>
        {printer.kind === 'paper' ? (
          <p>
            Choose your printer, letter paper, and <b>Actual size</b> or <b>Scale 100%</b>. Turn off “Fit to page” and set margins to <b>None</b>.{printer.id.startsWith('avery') ? ' Load the label sheet so the printer feeds it from the top.' : ''} Print one test sheet on plain paper first and hold it over a label sheet to check the lineup.
          </p>
        ) : (
          <p>
            Choose your label printer and the <b>{size}</b> paper size, with <b>Scale 100%</b> and margins set to <b>None</b>. Each label prints on its own page.
          </p>
        )}
      </div>
    </div>
  );
}

/** A small drawing of each printer: a sheet with its grid, or a roll of labels. */
function PrinterArt({ printer }: { printer: PrinterDef }) {
  const layout = Object.values(printer.styles)[0]!;
  if (printer.kind === 'thermal') {
    const [w, h] = layout.label;
    const s = 26 / Math.max(w, h);
    return (
      <svg className="pf-art" viewBox="0 0 44 44" aria-hidden="true">
        <rect x="4" y="30" width="36" height="10" rx="3" className="pf-art-body" />
        <rect x={22 - (w * s) / 2} y={30 - h * s} width={w * s} height={h * s} rx="1.5" className="pf-art-label" />
      </svg>
    );
  }
  const [pw, ph] = layout.page;
  const k = 40 / ph;
  const cells = [];
  for (let r = 0; r < Math.min(layout.rows, 12); r++)
    for (let c = 0; c < layout.cols; c++)
      cells.push(<rect key={`${r}-${c}`} x={2 + (layout.margin[1] + c * (layout.label[0] + layout.gap[0])) * k + 6} y={2 + (layout.margin[0] + r * (layout.label[1] + layout.gap[1])) * k} width={layout.label[0] * k} height={layout.label[1] * k} rx="0.6" className="pf-art-cell" />);
  return (
    <svg className="pf-art" viewBox="0 0 44 44" aria-hidden="true">
      <rect x={8} y={2} width={pw * k} height={ph * k} rx="1.5" className="pf-art-page" />
      {printer.id === 'office' ? <rect x={11} y={7} width={pw * k - 6} height={ph * k - 10} rx="1" className="pf-art-cell" /> : cells}
    </svg>
  );
}

/** A small drawing of each label style. */
function StyleArt({ style }: { style: StyleId }) {
  return (
    <svg className="pf-art" viewBox="0 0 44 44" aria-hidden="true">
      {style === 'spot' && (
        <>
          <rect x="3" y="11" width="38" height="22" rx="2" className="pf-art-label" />
          <rect x="6" y="14" width="13" height="13" className="pf-art-ink" />
          <rect x="22" y="15" width="16" height="4" className="pf-art-ink" />
          <path d="M22 23h1v6h-1zM24.5 23h.6v6h-.6zM26 23h1.4v6H26zM28.6 23h.6v6h-.6zM30.4 23h1v6h-1zM32.6 23h.6v6h-.6zM34 23h1.4v6H34zM36.4 23h.8v6h-.8z" className="pf-art-ink" />
        </>
      )}
      {style === 'shelf' && (
        <>
          <rect x="2" y="26" width="40" height="4" className="pf-art-shelf" />
          <rect x="10" y="17" width="24" height="10" rx="1" className="pf-art-label" />
          <path d="M13 19h.8v4H13zM15 19h.5v4H15zM16.3 19h1.2v4h-1.2zM18.4 19h.5v4h-.5zM19.8 19h.9v4h-.9zM21.6 19h.5v4h-.5zM23 19h1.2v4H23zM25 19h.6v4H25zM26.5 19h.9v4h-.9zM28.3 19h.5v4h-.5zM29.6 19h1.1v4h-1.1z" className="pf-art-ink" />
          <rect x="15" y="24" width="14" height="1.6" className="pf-art-ink" />
        </>
      )}
      {style === 'poster' && (
        <>
          <rect x="9" y="3" width="26" height="38" rx="1.5" className="pf-art-label" />
          <text x="22" y="24" textAnchor="middle" className="pf-art-letter">A</text>
          <path d="M13 29h1v6h-1zM15 29h.6v6H15zM16.4 29h1.4v6h-1.4zM18.6 29h.6v6h-.6zM20 29h1v6h-1zM22 29h.6v6H22zM23.5 29h1.4v6h-1.4zM25.8 29h.6v6h-.6zM27.2 29h1v6h-1zM29.2 29h.6v6h-.6zM30 29h1v6h-1z" className="pf-art-ink" />
        </>
      )}
      {style === 'item' && (
        <>
          <rect x="7" y="20" width="30" height="20" rx="1" className="pf-art-box" />
          <rect x="13" y="8" width="18" height="24" rx="1.5" className="pf-art-label" />
          <rect x="16" y="11" width="12" height="3" className="pf-art-ink" />
          <rect x="17" y="17" width="10" height="10" className="pf-art-ink" />
        </>
      )}
    </svg>
  );
}
