// Ready to scan: the Dashboard panel with a status light, scanner status, a camera button and the last scan, plus
// the small status dot in the top bar. Scans on the Dashboard go to Scan anywhere (src/features/scanners/ScanAnywhere),
// which opens what was scanned and writes the summary shown here, so there is one handler, not two.

import { useEffect, useRef } from 'react';
import { useApp } from '../../app/state';
import { modalOpen, useScanRouter, type ScanEvent } from '../../device/scanRouter';
import { SCAN_CATCHER_ATTR, isEditableTarget } from '../../device/wedge';
import { Icon } from '../../ui/icons';
import { fmtAgo, fmtTime } from '../../ui/ui';
import { shortScan } from '../scanners/interpret';
import { InlineCamera } from './InlineCamera';
import { useScanReadiness } from './readiness';
import './scan-ready.css';

/**
 * A hidden field that holds the keyboard focus while the Dashboard is idle. Android scanner phones (Zebra DataWedge
 * and others) may only deliver keystrokes to a focused field; this one never shows a keyboard, and the wedge reads
 * whatever lands in it as a scan. It takes focus on arrival and when the page comes back, never from a person
 * typing elsewhere, and never while a window is open.
 */
export function ScanCatcher() {
  const ref = useRef<HTMLInputElement>(null);
  const { recent } = useScanRouter();
  const idle = () => {
    const a = document.activeElement;
    return !a || a === document.body || a === document.documentElement;
  };
  const grab = (force = false) => {
    const el = ref.current;
    if (!el || !el.isConnected || modalOpen() || document.visibilityState === 'hidden') return;
    const a = document.activeElement;
    if (a === el) return;
    if (idle() || (force && !isEditableTarget(a) && !a?.closest('[role="dialog"]'))) el.focus({ preventScroll: true });
  };
  const grabRef = useRef(grab);
  grabRef.current = grab;

  useEffect(() => {
    // On arrival, take the keyboard from a button (such as the Dashboard tab just pressed), but not from a text box.
    grabRef.current(true);
    const soon = () => setTimeout(() => grabRef.current(), 0);
    window.addEventListener('focus', soon);
    document.addEventListener('visibilitychange', soon);
    // A tap on an empty part of the page leaves the keyboard with nothing; hand it back to the catcher.
    document.addEventListener('pointerup', soon);
    return () => {
      window.removeEventListener('focus', soon);
      document.removeEventListener('visibilitychange', soon);
      document.removeEventListener('pointerup', soon);
    };
  }, []);

  // After each scan, be ready for the next one.
  const latest = recent[0]?.id;
  useEffect(() => {
    if (latest !== undefined) grabRef.current();
  }, [latest]);

  return (
    <input
      ref={ref}
      {...{ [SCAN_CATCHER_ATTR]: '' }}
      className="scan-catcher"
      aria-label="Scanner input"
      inputMode="none"
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="off"
      spellCheck={false}
      enterKeyHint="go"
      tabIndex={-1}
      data-testid="scan-catcher"
    />
  );
}

function scanResult(e: ScanEvent): { tone: 'ok' | 'bad' | 'wait'; text: string } {
  if (!e.outcome) return { tone: 'wait', text: 'Checking…' };
  if (e.summary) return { tone: e.outcome === 'handled' ? 'ok' : 'bad', text: e.summary };
  if (e.outcome === 'handled') return { tone: 'ok', text: 'Used on the screen that was open.' };
  if (e.outcome === 'error') return { tone: 'bad', text: 'Not used on the screen that was open.' };
  return { tone: 'bad', text: 'Nothing was waiting for this scan.' };
}

const SOURCE_SHORT: Record<ScanEvent['source'], string> = {
  wedge: 'Scanner',
  serial: 'Serial scanner',
  camera: 'Camera',
  photo: 'Photo',
  typed: 'Typed',
  demo: 'Sample',
};

/** The Dashboard's Ready to scan panel. */
export function ScanReadyPanel() {
  const { go } = useApp();
  const { settings, recent } = useScanRouter();
  const r = useScanReadiness();
  const last = recent[0];
  const result = last ? scanResult(last) : null;
  return (
    <section className={`panel scan-ready ${r.ready ? 'is-ready' : 'is-paused'}`} aria-labelledby="scan-ready-title" data-testid="scan-ready">
      {settings.wedge && <ScanCatcher />}
      <div className="scan-ready-info">
        <div className="scan-ready-status" role="status">
          <span className="scan-light" aria-hidden="true" />
          <div className="scan-ready-words">
            <h2 id="scan-ready-title">{r.ready ? 'Ready to scan' : 'Scanning paused'}</h2>
            <p>{r.ready ? 'Scan a pallet or rack label to open it, or a product barcode to find it.' : r.reason}</p>
          </div>
        </div>
        <div className={`scan-ready-scanner ${r.scanner.connected ? 'is-connected' : ''}`} data-testid="scan-ready-scanner">
          <Icon name={r.scanner.connected ? 'checkCircle' : 'scanner'} width={18} height={18} />
          <span>
            <strong>{r.scanner.text}</strong>
            {r.scanner.connected && r.scanner.lastAt !== null ? (
              <small>Last scan {fmtAgo(new Date(r.scanner.lastAt).toISOString())}</small>
            ) : !r.scanner.connected ? (
              <small>Scanners that type like a keyboard show up here after their first scan.</small>
            ) : null}
          </span>
        </div>
        <div className="scan-ready-links">
          {r.fixInScanners && (
            <button type="button" className="btn small scan-ready-fix" onClick={() => go('scanners')}>
              <Icon name="settings" width={16} height={16} /> Open Scanners
            </button>
          )}
          <button type="button" className="btn small ghost" onClick={() => go('station')} data-testid="open-station">
            <Icon name="target" width={16} height={16} /> Scan station
          </button>
        </div>
        <div className={`scan-ready-last${last ? '' : ' is-empty'}`} aria-live="polite" data-testid="scan-ready-last">
          {last && result ? (
            <>
              <span className="scan-ready-last-label">Last scan</span>
              <span className={`scan-ready-result is-${result.tone}`}>
                <Icon name={result.tone === 'ok' ? 'checkCircle' : result.tone === 'bad' ? 'alertCircle' : 'clock'} width={16} height={16} />
                <code className="scan-ready-code" data-keep-words>{shortScan(last.text, 40)}</code>
              </span>
              <span className="scan-ready-result-text">{result.text}</span>
              <small className="scan-ready-when">
                {SOURCE_SHORT[last.source]}, {fmtTime(new Date(last.at).toISOString())}
              </small>
            </>
          ) : (
            <span className="muted">No scans yet. The result of each scan shows here.</span>
          )}
        </div>
      </div>
      <InlineCamera
        className="scan-ready-camera"
        testId="dashboard-camera"
        prompt="Point at a label or barcode"
        hint="Use the phone’s camera. It keeps scanning until you stop it."
      />
    </section>
  );
}

/** The top bar's status dot: green when a scan would be read, amber when paused. Opens Scanners. */
export function ScanStatusChip() {
  const { go } = useApp();
  const r = useScanReadiness();
  const label = r.ready ? 'Ready to scan' : 'Scanning paused';
  const detail = [`${label}.`, r.reason, r.scanner.connected ? `${r.scanner.text}.` : r.scanner.text].filter(Boolean).join(' ');
  return (
    <button
      type="button"
      className={`chip scan-chip ${r.ready ? 'is-ready' : 'is-paused'}`}
      onClick={() => go('scanners')}
      title={detail}
      aria-label={`${label}. Open Scanners`}
      data-testid="scan-chip"
    >
      <span className="scan-dot" aria-hidden="true" />
      <span className="scan-chip-label">{r.ready ? 'Ready to scan' : 'Paused'}</span>
    </button>
  );
}
