// The Scanner setup test pad: while it listens, every scan lands here (above every other screen) and shows
// what arrived, from where, how fast, and what it means in this company. Nothing is saved.

import { useRef, useState, type FormEvent } from 'react';
import { useApp } from '../../app/state';
import { makeLabelPayload } from '../../domain/codes';
import { STATE_LABEL } from '../../domain/transitions';
import { SCAN_COMMANDS, commandPayload } from '../../device/scanCommands';
import { stripScanPrefix, useScanRouter, useScanTarget, type ScanEvent, type ScanSource } from '../../device/scanRouter';
import { createTypingMeter } from '../../device/wedge';
import { Icon, type IconName } from '../../ui/icons';
import { fmtTime } from '../../ui/ui';
import { interpretScan, type ScanMeaning } from './interpret';

export const SOURCE_LABEL: Record<ScanSource, string> = {
  wedge: 'Scanner (keyboard mode)',
  serial: 'Scanner (serial port)',
  camera: 'Camera',
  photo: 'Photo',
  typed: 'Typed',
  demo: 'Sample button',
};

interface Hit {
  ev: ScanEvent;
  meaning: ScanMeaning | null;
}

function speedText(e: ScanEvent, maxGapMs: number): { text: string; note: string } {
  if (e.source === 'demo') return { text: 'Not timed', note: 'Samples arrive all at once.' };
  if (e.source === 'serial') return { text: 'One line', note: 'Serial scanners send the whole code at once.' };
  if (e.durationMs == null || e.text.length < 2) return { text: 'Not measured', note: e.source === 'typed' ? 'Pasted or edited text is not timed.' : '' };
  const per = e.durationMs / (e.text.length - 1);
  const perText = per < 10 ? per.toFixed(1) : String(Math.round(per));
  const fast = per <= maxGapMs;
  return { text: `${Math.round(e.durationMs)} ms, ${perText} ms per character`, note: fast ? 'Scanner speed.' : `Typing speed. Scans need less than ${maxGapMs} ms between characters.` };
}

function describe(m: ScanMeaning | null): { icon: IconName; tone: 'ok' | 'warn' | 'bad'; kind: string; title: string; detail: string; elsewhere: string } {
  if (!m) return { icon: 'info', tone: 'warn', kind: 'Unchecked', title: 'Sign in to check codes', detail: '', elsewhere: '' };
  switch (m.kind) {
    case 'pallet':
      return {
        icon: 'pallet',
        tone: 'ok',
        kind: 'Pallet',
        title: `Pallet ${m.pallet.code}`,
        detail: `${STATE_LABEL[m.pallet.state]}${m.location ? ` at ${m.location.code}` : ''}. ${m.pallet.description}`,
        elsewhere: 'Elsewhere in the portal, this scan opens the pallet.',
      };
    case 'location':
      return {
        icon: 'locations',
        tone: 'ok',
        kind: m.location.kind === 'RACK' ? 'Rack' : 'Area',
        title: `${m.location.kind === 'RACK' ? 'Rack' : 'Area'} ${m.location.code}`,
        detail: `${m.pallets} ${m.pallets === 1 ? 'pallet' : 'pallets'} recorded here.`,
        elsewhere: 'Elsewhere, this opens the location. On Move, it picks the destination.',
      };
    case 'job':
      return { icon: 'jobs', tone: 'ok', kind: 'Job', title: `Job ${m.job.code}`, detail: m.job.name, elsewhere: 'Elsewhere, this opens Find with the job’s pallets.' };
    case 'product':
      return {
        icon: 'barcode',
        tone: 'ok',
        kind: m.barcode === 'sscc' ? 'Supplier pallet label' : m.barcode === 'gtin' ? 'Product barcode' : 'Supplier code',
        title: m.product ? m.product.description : m.reference,
        detail: m.pallets === null ? 'Find searches your warehouse for pallets received with it.' : `${m.pallets} ${m.pallets === 1 ? 'pallet' : 'pallets'} received with this barcode.`,
        elsewhere: 'Elsewhere, this opens Find with those pallets. On Receive, it fills in the supplier code.',
      };
    case 'command': {
      const c = SCAN_COMMANDS.find((x) => x.id === m.command);
      return {
        icon: 'barcode',
        tone: 'ok',
        kind: 'Command',
        title: `Command: ${m.label}`,
        detail: c?.hint ?? '',
        elsewhere: m.command.startsWith('MODE_') ? 'Elsewhere, this opens the Scan station in that mode.' : 'Works on screens that are waiting for it, like the Scan station.',
      };
    }
    default:
      return { icon: 'alertCircle', tone: 'bad', kind: 'Unknown', title: 'Not recognized', detail: m.message, elsewhere: 'The scanner works; this just is not a code the portal knows.' };
  }
}

function PauseGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M9 5v14M15 5v14" />
    </svg>
  );
}

export function TestPad() {
  const { backend, actorId, workspaceId, go, read } = useApp();
  const { settings, emit } = useScanRouter();
  const [active, setActive] = useState(true);
  const [hits, setHits] = useState<Hit[]>([]);
  const [draft, setDraft] = useState('');
  const meter = useRef(createTypingMeter());

  useScanTarget(
    'scanner-test-pad',
    (e) => {
      const meaning = actorId && workspaceId ? interpretScan(backend.reader, actorId, workspaceId, e.text, { partial: backend.mode === 'firebase' }) : null;
      setHits((h) => [{ ev: e, meaning }, ...h].slice(0, 12));
      return meaning?.kind === 'unknown' ? 'error' : true;
    },
    active,
    100,
    // Nothing is saved here, so the pad keeps listening while a window (such as the portal tour) is open.
    { whileModal: true },
  );

  const samples = read((e, _a, ws) => {
    const p = Object.values(e.db.pallets).find((x) => x.workspace_id === ws && !x.archived_at && e.activeLabel(x.id));
    const l = Object.values(e.db.locations).find((x) => x.workspace_id === ws && x.kind === 'RACK' && x.active);
    const j = Object.values(e.db.jobs).find((x) => x.workspace_id === ws && x.status !== 'CLOSED');
    return { pallet: p ? makeLabelPayload('P', e.activeLabel(p.id)?.token ?? '') : null, palletCode: p?.code ?? null, rack: l?.code ?? null, job: j?.code ?? null };
  });

  const sampleButtons: { label: string; text: string; icon: IconName }[] = [
    ...(samples?.pallet ? [{ label: 'Pallet label (QR)', text: samples.pallet, icon: 'qr' as IconName }] : []),
    ...(samples?.palletCode ? [{ label: `Pallet code ${samples.palletCode}`, text: samples.palletCode, icon: 'barcode' as IconName }] : []),
    ...(samples?.rack ? [{ label: `Rack ${samples.rack}`, text: samples.rack, icon: 'locations' as IconName }] : []),
    ...(samples?.job ? [{ label: `Job ${samples.job}`, text: samples.job, icon: 'jobs' as IconName }] : []),
    { label: 'Confirm command', text: commandPayload('CONFIRM'), icon: 'checkCircle' },
    { label: 'A product barcode', text: '0012345678905', icon: 'box' },
  ];

  const submit = (ev: FormEvent) => {
    ev.preventDefault();
    const text = draft.trim();
    if (!text) return;
    const t = meter.current.result(draft, settings);
    // A scanner typing into the box loses its prefix, exactly as a scan outside the box does.
    emit(t.fromScanner ? stripScanPrefix(text, settings.prefix) : text, t.fromScanner ? 'wedge' : 'typed', { durationMs: t.durationMs });
    meter.current.reset();
    setDraft('');
  };

  const [latest, ...older] = hits;
  const d = latest ? describe(latest.meaning) : null;
  const sp = latest ? speedText(latest.ev, settings.maxGapMs) : null;

  const open = (m: ScanMeaning | null) => {
    if (!m) return;
    if (m.kind === 'pallet') go({ name: 'pallet', id: m.pallet.id });
    else if (m.kind === 'location') go({ name: 'location', id: m.location.id });
    else if (m.kind === 'job') go({ name: 'find', q: m.job.code });
    else if (m.kind === 'product') go({ name: 'find', q: m.reference });
  };
  const openable = (m: ScanMeaning | null) => !!m && (m.kind === 'pallet' || m.kind === 'location' || m.kind === 'job' || (m.kind === 'product' && m.pallets !== 0));

  return (
    <section className={`panel scn-pad ${active ? 'is-on' : 'is-off'}`} aria-labelledby="scn-pad-title" data-tour="scanner-test-pad">
      <div className="scn-pad-head">
        <div className="scn-pad-titles">
          <div className="panel-title" style={{ marginBottom: 2 }}>
            Test pad
          </div>
          <h2 id="scn-pad-title" className="scn-pad-title">
            Scan any barcode
          </h2>
          <p className="muted scn-pad-sub">
            {active
              ? 'While the pad is listening, scans land here instead of opening screens. Nothing is saved.'
              : 'Paused. Scans on this page now open what was scanned, like everywhere else in the portal.'}
          </p>
        </div>
        <div className="row scn-pad-actions">
          <span className={`scn-live ${active ? 'on' : ''}`} role="status">
            <span className="scn-dot" aria-hidden="true" />
            {active ? 'Listening' : 'Paused'}
          </span>
          <button type="button" className="btn small" onClick={() => setActive((a) => !a)} aria-pressed={!active}>
            {active ? <PauseGlyph /> : <Icon name="play" />} {active ? 'Pause' : 'Listen again'}
          </button>
          {hits.length > 0 && (
            <button type="button" className="btn small ghost" onClick={() => setHits([])}>
              <Icon name="trash" /> Clear
            </button>
          )}
        </div>
      </div>

      <div className="scn-pad-stage" aria-live="polite">
        {!latest || !d || !sp ? (
          <div className="scn-pad-empty">
            <span className="scn-pad-icon" aria-hidden="true">
              <Icon name="scanner" />
            </span>
            <strong>Pick up your scanner and scan any label or barcode.</strong>
            <span className="muted">
              {settings.wedge ? 'Click an empty part of the page first, so no text box has the cursor.' : 'Keyboard scanners are turned off below. Turn them on to test one.'}
            </span>
          </div>
        ) : (
          <div className={`scn-hit-hero tone-${d.tone}`} data-testid="scan-latest">
            <div className="scn-hit-top">
              <span className={`scn-kind tone-${d.tone}`}>
                <Icon name={d.icon} width={16} height={16} /> {d.kind}
              </span>
              <span className="faint scn-hit-time">{fmtTime(new Date(latest.ev.at).toISOString())}</span>
            </div>
            <div className="scn-hit-code" data-testid="scan-text">
              {latest.ev.text}
            </div>
            <div className="scn-hit-meaning">
              <strong>{d.title}</strong>
              {d.detail && <span className="muted"> {d.detail}</span>}
            </div>
            <dl className="scn-hit-meta">
              <div>
                <dt>Source</dt>
                <dd>{SOURCE_LABEL[latest.ev.source]}</dd>
              </div>
              <div>
                <dt>Speed</dt>
                <dd>
                  {sp.text}
                  {sp.note && <span className="faint"> {sp.note}</span>}
                </dd>
              </div>
              <div>
                <dt>Length</dt>
                <dd>{latest.ev.text.length} characters</dd>
              </div>
            </dl>
            <div className="row scn-hit-foot">
              <span className="muted scn-elsewhere">{d.elsewhere}</span>
              {openable(latest.meaning) && (
                <button type="button" className="btn small" onClick={() => open(latest.meaning)}>
                  Open <Icon name="arrowRight" />
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {older.length > 0 && (
        <ol className="scn-hit-list" aria-label="Earlier scans">
          {older.map((h) => {
            const x = describe(h.meaning);
            return (
              <li key={h.ev.id}>
                <span className={`scn-kind small tone-${x.tone}`}>
                  <Icon name={x.icon} width={14} height={14} /> {x.kind}
                </span>
                <span className="scn-hit-small">{h.ev.text}</span>
                <span className="faint scn-hit-src">{SOURCE_LABEL[h.ev.source]}</span>
              </li>
            );
          })}
        </ol>
      )}

      <div className="scn-pad-tools">
        <form className="row nowrap scn-type" onSubmit={submit}>
          <label htmlFor="scn-pad-input" className="sr-only">
            Type or scan a code to test
          </label>
          <input
            id="scn-pad-input"
            className="input code"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) meter.current.key(e.timeStamp || performance.now(), draft === '');
            }}
            placeholder="Type a code"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            disabled={!active}
          />
          <button className="btn" type="submit" disabled={!active || !draft.trim()}>
            <Icon name="keyboard" /> Test
          </button>
        </form>
        <div className="scn-samples">
          <span className="eyebrow" style={{ margin: 0 }}>
            No scanner handy? Try a sample
          </span>
          <div className="row" style={{ gap: 6 }}>
            {sampleButtons.map((s) => (
              <button key={s.label} type="button" className="chip scn-sample" onClick={() => emit(s.text, 'demo')} disabled={!active}>
                <Icon name={s.icon} width={15} height={15} /> {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
