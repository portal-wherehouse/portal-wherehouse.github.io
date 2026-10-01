// The scan-first task pattern, shared by every screen where someone scans one label after another: Move and Stage,
// Ship, Receive's put-away step, receiving a transfer and the Scan station.
//
// - One big prompt says what to scan now ("Scan the pallet", "Scan the spot"). It changes the moment a good scan
//   lands, with a beep, a short buzz and a green flash. A wrong scan shows a red line and does not advance.
// - The camera stays on across every step of the task. It is mounted once and only its prompt changes, so the
//   session is never stopped and restarted between scans. Whether it is on is remembered on this device.
// - Hardware scanners, the camera, typed codes and the sample labels all arrive through the scan router, so the
//   screen has one scan handler (useScanTarget) and the router plays the good or bad sound for it.

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useApp } from '../../app/state';
import { buzz, cameraSupported, decodeImageFile } from '../../device/scanner';
import { stripScanPrefix, useScanRouter, type ScanSource } from '../../device/scanRouter';
import { useSerialStatus } from '../../device/serial';
import { createTypingMeter } from '../../device/wedge';
import { Icon } from '../../ui/icons';
import { InlineCamera } from './InlineCamera';
import { ScanCatcher } from './ScanReady';
import type { DemoTarget } from './ScanPanel';
import './scan-flow.css';

const CAMERA_KEY = 'wh.flowCamera';

function readCameraChoice(): boolean {
  try {
    return localStorage.getItem(CAMERA_KEY) === 'on';
  } catch {
    return false;
  }
}

/** Whether the task screens' camera is on, remembered on this device. */
export function useRememberedCamera(): [boolean, (on: boolean) => void] {
  const [on, setOnState] = useState(readCameraChoice);
  const setOn = useCallback((next: boolean) => {
    setOnState(next);
    try {
      localStorage.setItem(CAMERA_KEY, next ? 'on' : 'off');
    } catch {
      /* the choice still holds for this visit */
    }
  }, []);
  return [on, setOn];
}

/** The task screens' camera: the inline camera with its on/off choice remembered on this device. */
export function FlowCamera({ prompt, testId = 'flow-camera', className }: { prompt: string; testId?: string; className?: string }) {
  const [on, setOn] = useRememberedCamera();
  return (
    <InlineCamera
      prompt={prompt}
      testId={testId}
      className={`flow-camera${className ? ` ${className}` : ''}`}
      on={on}
      onChange={setOn}
      title="Scan with camera"
      hint="The camera stays on between scans. Turn it off any time."
    />
  );
}

export type FlowTone = 'ok' | 'error' | 'warn' | 'info';

export interface FlowFlash {
  tone: FlowTone;
  text: string;
  /** Grows with every flash, so the same text twice still flashes twice. */
  seq: number;
}

/** The line under the prompt: green after a good scan, red after a wrong one. Buzzes when haptics are on. */
export function useFlowFlash() {
  const { prefs } = useApp();
  const [flash, setFlash] = useState<FlowFlash | null>(null);
  const seq = useRef(0);
  const haptics = useRef(prefs.haptics);
  haptics.current = prefs.haptics;
  const show = useCallback((tone: FlowTone, text: string) => {
    setFlash({ tone, text, seq: ++seq.current });
    if (haptics.current) buzz(tone === 'ok' ? 30 : tone === 'error' ? [40, 60, 40] : 15);
  }, []);
  return {
    flash,
    ok: useCallback((text: string) => show('ok', text), [show]),
    bad: useCallback((text: string) => show('error', text), [show]),
    note: useCallback((text: string, tone: FlowTone = 'info') => show(tone, text), [show]),
    clear: useCallback(() => setFlash(null), []),
  };
}

const FLASH_ICON = { ok: 'checkCircle', error: 'alertCircle', warn: 'alert', info: 'info' } as const;

export interface ScanFlowProps {
  /** What to scan now, in a few words. */
  prompt: string;
  /** One short line under the prompt, such as the pallet already scanned. */
  sub?: ReactNode;
  /** The prompt's color: waiting, done, or needs a look. */
  tone?: 'idle' | 'ok' | 'warn' | 'busy';
  flash?: FlowFlash | null;
  /** Shown over the camera picture; defaults to the prompt. */
  cameraPrompt?: string;
  /** Sample labels to tap in the demo. */
  demoTargets?: DemoTarget[];
  /** Placeholder of the typed-code box. */
  placeholder?: string;
  testId?: string;
  /** The current step's details, between the prompt and the typed-code box. */
  children?: ReactNode;
}

/** The scan-first layout: big prompt, camera, the step's details, then typing and sample labels. */
export function ScanFlow({ prompt, sub, tone = 'idle', flash, cameraPrompt, demoTargets, placeholder, testId = 'scan-flow', children }: ScanFlowProps) {
  const { settings } = useScanRouter();
  return (
    <section className="scan-flow" data-testid={testId} data-tour={testId} aria-labelledby={`${testId}-prompt`}>
      {settings.wedge && <ScanCatcher />}
      <div className={`flow-prompt tone-${tone}${flash?.tone === 'ok' ? ' flashed' : ''}`} key={flash?.tone === 'ok' ? `ok-${flash.seq}` : 'prompt'}>
        <div aria-live="polite" aria-atomic="true">
          <h2 className="flow-prompt-text" id={`${testId}-prompt`}>
            {prompt}
          </h2>
          {sub && <div className="flow-prompt-sub">{sub}</div>}
        </div>
        <div aria-live="polite">
          {flash && (
            <div key={flash.seq} className={`flow-flash is-${flash.tone}`} role={flash.tone === 'error' ? 'alert' : undefined} data-testid={`${testId}-flash`}>
              <Icon name={FLASH_ICON[flash.tone]} width={20} height={20} />
              <span>{flash.text}</span>
            </div>
          )}
        </div>
      </div>
      <FlowCamera prompt={cameraPrompt ?? prompt} testId={`${testId}-camera`} />
      {children}
      <FlowManual placeholder={placeholder} demoTargets={demoTargets} />
    </section>
  );
}

const SOURCE_VIA: Record<ScanSource, string> = {
  wedge: 'scanner',
  serial: 'serial scanner',
  camera: 'camera',
  photo: 'photo',
  typed: 'typed',
  demo: 'sample label',
};

/**
 * Typing a code (a damaged label, no scanner), the scanner status, and the demo's sample labels. A scanner typing
 * into this box still counts as a scanner. Everything goes through the scan router, like any other scan.
 */
export function FlowManual({ placeholder = 'Type a code, e.g. P-000042 or A-03-02', demoTargets }: { placeholder?: string; demoTargets?: DemoTarget[] }) {
  const { backend, go } = useApp();
  const { settings, emit, recent, beep } = useScanRouter();
  const serial = useSerialStatus();
  const [code, setCode] = useState('');
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const meter = useRef(createTypingMeter());
  const last = recent[0];
  const listening = settings.wedge || serial.state === 'connected';
  // The camera is the usual way on a phone; a photo of the label is offered only where live camera is not.
  const photoOnly = !cameraSupported();

  useEffect(() => setPhotoError(''), [last?.id]);

  const onPhoto = async (file: File | undefined) => {
    if (!file) return;
    setPhotoBusy(true);
    setPhotoError('');
    try {
      const text = await decodeImageFile(file);
      if (text) emit(text, 'photo');
      else {
        beep('bad');
        setPhotoError('No barcode or QR code found in that photo. Hold the phone closer and keep the label flat, or type the printed code.');
      }
    } catch {
      beep('bad');
      setPhotoError('That photo could not be read.');
    } finally {
      setPhotoBusy(false);
    }
  };

  return (
    <div className="flow-manual">
      <form
        className="row nowrap"
        onSubmit={(e) => {
          e.preventDefault();
          const text = code.trim();
          if (!text) return;
          const timing = meter.current.result(code, settings);
          if (timing.fromScanner) emit(stripScanPrefix(text, settings.prefix), 'wedge');
          else emit(text, 'typed');
          meter.current.reset();
          setCode('');
        }}
      >
        <label htmlFor="manual-code" className="sr-only">
          Printed code
        </label>
        <input
          id="manual-code"
          className="input code"
          data-scan-field
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => {
            if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) meter.current.key(e.timeStamp || performance.now(), code === '');
          }}
          placeholder={placeholder}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
        />
        <button className="btn" type="submit" aria-label="Look up code">
          <Icon name="keyboard" /> Enter
        </button>
      </form>
      {photoOnly && (
        <label className="btn small flow-photo">
          <Icon name="image" /> {photoBusy ? 'Reading photo…' : 'Scan from a photo'}
          <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => void onPhoto(e.target.files?.[0])} />
        </label>
      )}
      {photoError && <p className="flow-photo-error" role="alert">{photoError}</p>}
      <div className="flow-status" role="status">
        <span className={`flow-listen ${listening ? 'on' : 'off'}`}>
          <span className="dot" aria-hidden="true" />
          {listening ? 'Scanner ready' : 'Keyboard scanners are off'}
        </span>
        {!listening && (
          <button type="button" className="btn ghost small" onClick={() => go('scanners')}>
            Scanners
          </button>
        )}
        {last && (
          <span className={`flow-last ${last.outcome === 'handled' ? 'ok' : last.outcome ? 'bad' : ''}`}>
            Last scan <span className="mono" data-keep-words>{last.text.length > 24 ? `${last.text.slice(0, 23)}…` : last.text}</span>, {SOURCE_VIA[last.source]}
          </span>
        )}
      </div>
      {backend.mode === 'demo' && demoTargets && demoTargets.length > 0 && (
        <details className="flow-demo" open>
          <summary>No labels handy? Tap a sample label</summary>
          <div className="demo-labels">
            {demoTargets.map((t) => (
              <button key={t.text + t.label} type="button" className="demo-label" onClick={() => emit(t.text, 'demo')} title={`Simulated scan of ${t.text}`}>
                <Icon name="qr" width={16} height={16} />
                {t.label}
                {t.sub && <small>{t.sub}</small>}
              </button>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
