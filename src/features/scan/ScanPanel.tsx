// Every way to identify a label: live camera, a photo of the label, typing the printed code,
// or (in the demo) tapping a pretend label. Manual entry is always available (page 16).

import { useEffect, useRef, useState } from 'react';
import type { Location, Pallet } from '../../domain/types';
import { ReadError } from '../../demo/engine';
import { cameraSupported, decodeImageFile, startCamera, type CameraSession } from '../../device/scanner';
import { useApp } from '../../app/state';
import { Icon } from '../../ui/icons';
import { Notice } from '../../ui/ui';

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
  const { backend, actorId, workspaceId } = useApp();
  const [camOn, setCamOn] = useState(false);
  const [camError, setCamError] = useState<string | null>(null);
  const [decoder, setDecoder] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [photoBusy, setPhotoBusy] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const session = useRef<CameraSession | null>(null);
  const handler = useRef<(t: string) => void>(() => {});

  const resolve = (raw: string) => {
    if (!actorId || !workspaceId) return;
    try {
      const r = backend.reader.resolve(actorId, workspaceId, raw);
      onResolved(r, raw.trim());
    } catch (e) {
      onError(e instanceof ReadError ? e.message : 'Could not read that label.', raw.trim());
    }
  };
  handler.current = resolve;

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
      if (text) resolve(text);
      else onError('No QR code found in that photo. Hold the phone closer and keep the label flat, or type the printed code.', `photo:${file.name}:${file.size}`);
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
            resolve(code);
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
      {demoTargets && demoTargets.length > 0 && (
        <div className="stack" style={{ gap: 6 }}>
          <div className="eyebrow" style={{ margin: 0 }}>
            No printed labels handy? Tap one to scan it
          </div>
          <div className="demo-labels">
            {demoTargets.map((t) => (
              <button key={t.text + t.label} type="button" className="demo-label" onClick={() => resolve(t.text)} title={`Simulated scan of ${t.text}`}>
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
