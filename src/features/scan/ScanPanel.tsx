import { FirebaseBackend } from '../../data/firebase';
// Every way to identify a label: a hardware scanner (keyboard or serial mode), live camera, a photo of the label,
// typing the printed code, or (in the demo) tapping a pretend label. Manual entry is always available (page 16).

import { useEffect, useRef, useState } from 'react';
import type { Location, Pallet } from '../../domain/types';
import { ReadError } from '../../demo/engine';
import { cameraSupported, decodeImageFile, startCamera, type CameraSession } from '../../device/scanner';
import { parseScanCommand } from '../../device/scanCommands';
import { stripScanPrefix, useScanRouter, useScanTarget, type ScanSource } from '../../device/scanRouter';
import { useSerialStatus } from '../../device/serial';
import { createTypingMeter } from '../../device/wedge';
import { useApp } from '../../app/state';
import { Icon } from '../../ui/icons';
import { Notice } from '../../ui/ui';
import '../scanners/scanners.css';

const SOURCE_VIA: Record<ScanSource, string> = {
  wedge: 'by scanner',
  serial: 'by serial scanner',
  camera: 'by camera',
  photo: 'from a photo',
  typed: 'typed in',
  demo: 'sample label',
};

interface LastScan {
  scope?: string;
  text: string;
  source: ScanSource;
  ok: boolean;
  at: number;
}

// Shared by every panel, so the next step's panel (Move's rack step) still shows the scan that got you there.
let lastPanelScan: LastScan | null = null;
const LAST_SCAN_SHOWN_MS = 5 * 60_000;

export type Resolved = { type: 'pallet'; pallet: Pallet } | { type: 'location'; location: Location };

export interface DemoTarget {
  label: string;
  sub?: string;
  text: string;
}

export function ScanPanel({
  prompt,
  onResolved,
  onError,
  demoTargets,
  placeholder = 'Type the printed code, e.g. P-000042 or A-03-02',
  autoFocusInput,
}: {
  prompt: string;
  onResolved: (r: Resolved, raw: string) => void;
  onError: (message: string, raw: string) => void;
  demoTargets?: DemoTarget[];
  placeholder?: string;
  autoFocusInput?: boolean;
}) {
  const { backend, actorId, workspaceId, go } = useApp();
  const { settings, beep } = useScanRouter();
  const serial = useSerialStatus();
  const [camOn, setCamOn] = useState(false);
  const [camError, setCamError] = useState<string | null>(null);
  const [decoder, setDecoder] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [photoBusy, setPhotoBusy] = useState(false);
  const [last, setLastState] = useState<LastScan | null>(() => (lastPanelScan && lastPanelScan.scope === `${actorId}:${workspaceId}` && Date.now() - lastPanelScan.at < LAST_SCAN_SHOWN_MS ? lastPanelScan : null));
  const setLast = (l: LastScan) => {
    lastPanelScan = { ...l, scope: `${actorId}:${workspaceId}` };
    setLastState(l);
  };
  const video = useRef<HTMLVideoElement>(null);
  const session = useRef<CameraSession | null>(null);
  const handler = useRef<(t: string) => void>(() => {});
  const meter = useRef(createTypingMeter());

  /** Look the code up and report it. Returns false when it is not a label here. `quiet` skips the last-scan line. */
  const resolve = (raw: string, source: ScanSource = 'typed', quiet = false): boolean => {
    if (!actorId || !workspaceId) return false;
    const text = raw.trim();
    try {
      const r = backend.reader.resolve(actorId, workspaceId, raw);
      if (!quiet) setLast({ text, source, ok: true, at: Date.now() });
      onResolved(r, text);
      return true;
    } catch (e) {
      if (!quiet) setLast({ text, source, ok: false, at: Date.now() });
      onError(e instanceof ReadError ? e.message : 'Could not read that label.', text);
      return false;
    }
  };
  // Scans this panel reads itself (camera, photo, the box, sample labels) beep here; hardware scans beep in the router.
  const resolveOwn = (raw: string, source: ScanSource) => {if(backend instanceof FirebaseBackend)void backend.preloadScan(raw).then(()=>beep(resolve(raw,source)?'good':'bad')).catch(()=>{onError('Could not load this label. Check your connection.',raw);beep('bad');});else beep(resolve(raw,source)?'good':'bad');};
  // The camera reports the label in view several times a second. Only a new label (or the same one after a pause)
  // beeps and updates the last-scan line; repeats still pass through, and the screen ignores them as before.
  const camSeen = useRef<{ text: string; at: number } | null>(null);
  handler.current = (t) => {
    const now = Date.now();
    const seen = camSeen.current;
    camSeen.current = { text: t, at: now };
    if (seen && seen.text === t && now - seen.at < 2500) { if(backend.mode==='demo')resolve(t, 'camera', true); }
    else resolveOwn(t, 'camera');
  };

  // Hardware scanners reach this panel through the scan router while it is on screen.
  // Command barcodes pass through to whoever handles them (the Scan station, or Scan anywhere).
  useScanTarget('scan-panel', (e) => {
    if (parseScanCommand(e.text)) return false;
    return resolve(e.text, e.source) ? true : 'error';
  });

  useEffect(() => {
    if (!camOn || !video.current) return;
    let cancelled = false;
    setCamError(null);
    void startCamera(
      video.current,
      (t) => handler.current(t),
      (_kind, message) => {
        if (!cancelled) {
          setCamError(message);
          setCamOn(false);
        }
      },
    ).then((s) => {
      if (cancelled) s?.stop();
      else {
        session.current = s;
        setDecoder(s?.decoder ?? null);
      }
    });
    return () => {
      cancelled = true;
      session.current?.stop();
      session.current = null;
    };
  }, [camOn]);

  const onPhoto = async (file: File | undefined) => {
    if (!file) return;
    setPhotoBusy(true);
    try {
      const text = await decodeImageFile(file);
      if (text) resolveOwn(text, 'photo');
      else {
        beep('bad');
        onError('No barcode or QR code found in that photo. Hold the phone closer and keep the label flat, or type the printed code.', `photo:${file.name}:${file.size}`);
      }
    } catch {
      onError('That photo could not be read.', `photo:${file.name}`);
    } finally {
      setPhotoBusy(false);
    }
  };

  return (
    <div className="scanner">
      {camOn ? (
        <div className="viewfinder">
          <video ref={video} playsInline muted />
          <div className="reticle" />
          <div className="vf-controls">
            <button type="button" onClick={() => void session.current?.switchCamera()}>
              Switch
            </button>
            <button type="button" onClick={() => setCamOn(false)}>
              Stop
            </button>
          </div>
          <div className="vf-label">
            {prompt}
            {decoder && <span style={{ opacity: 0.7, fontWeight: 500 }}> · {decoder === 'native' ? 'built-in decoder' : 'browser decoder'}</span>}
          </div>
        </div>
      ) : (
        <div className="row">
          <button type="button" className="btn primary" onClick={() => setCamOn(true)} disabled={!cameraSupported()}>
            <Icon name="camera" /> Scan with camera
          </button>
          <label className="btn" style={{ cursor: 'pointer' }}>
            <Icon name="image" /> {photoBusy ? 'Reading photo…' : 'Scan from a photo'}
            <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => void onPhoto(e.target.files?.[0])} />
          </label>
        </div>
      )}
      {camError && <Notice tone="warn" icon="camera" title="Camera unavailable">{camError}</Notice>}
      {!cameraSupported() && !camError && <p className="hint muted" style={{ fontSize: 13 }}>Live camera is not available in this view. “Scan from a photo” opens your phone camera instead.</p>}
      <form
        className="row nowrap"
        onSubmit={(e) => {
          e.preventDefault();
          if (code.trim()) {
            // A scanner typing into this box (it had focus) still counts as a scanner, and its prefix comes off.
            const timing = meter.current.result(code, settings);
            if (timing.fromScanner) resolveOwn(stripScanPrefix(code.trim(), settings.prefix), 'wedge');
            else resolveOwn(code, 'typed');
            meter.current.reset();
            setCode('');
          }
        }}
      >
        <label htmlFor="manual-code" className="sr-only">
          Printed code
        </label>
        <input
          id="manual-code"
          className="input code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => {
            if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) meter.current.key(e.timeStamp || performance.now(), code === '');
          }}
          placeholder={placeholder}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          autoFocus={autoFocusInput}
          style={{ fontSize: 19 }}
        />
        <button className="btn" type="submit" aria-label="Look up code">
          <Icon name="keyboard" /> Enter
        </button>
      </form>
      <div className="scn-ready" role="status">
        {settings.wedge || serial.state === 'connected' ? (
          <span className="scn-ready-on">
            <span className="scn-dot" aria-hidden="true" />
            <Icon name="scanner" width={16} height={16} />
            <span>
              <strong>Scanner ready.</strong> {serial.state === 'connected' ? 'Scan with your serial or keyboard scanner.' : 'Scan a label with a USB or Bluetooth scanner.'}
            </span>
          </span>
        ) : (
          <span className="scn-ready-off">
            <Icon name="scanner" width={16} height={16} />
            <span>Hardware scanners are turned off.</span>
            <button type="button" className="btn ghost small" onClick={() => go('scanners')}>
              Scanners
            </button>
          </span>
        )}
        {last && (
          <span className={`scn-last ${last.ok ? 'ok' : 'bad'}`}>
            <Icon name={last.ok ? 'checkCircle' : 'alertCircle'} width={15} height={15} />
            <span>
              Last scan <span className="mono">{last.text.length > 28 ? `${last.text.slice(0, 27)}…` : last.text}</span>, {SOURCE_VIA[last.source]}
              {last.ok ? '' : ': not recognized'}
            </span>
          </span>
        )}
      </div>
      {backend.mode === 'demo' && demoTargets && demoTargets.length > 0 && (
        <div className="stack" style={{ gap: 6 }}>
          <div className="eyebrow" style={{ margin: 0 }}>
            No printed labels handy? Tap one to scan it
          </div>
          <div className="demo-labels">
            {demoTargets.map((t) => (
              <button key={t.text + t.label} type="button" className="demo-label" onClick={() => resolveOwn(t.text, 'demo')} title={`Simulated scan of ${t.text}`}>
                <Icon name="qr" width={16} height={16} />
                {t.label}
                {t.sub && <small>{t.sub}</small>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
