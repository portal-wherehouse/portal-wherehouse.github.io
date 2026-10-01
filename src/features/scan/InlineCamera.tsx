// An inline camera scanner: the phone's own camera as the scanner, shown in the page rather than a sheet. Each new
// label goes through the scan router, exactly like a hardware scan, so the screen handles it the same way and logs it
// as a camera scan. It keeps scanning until it is stopped. Used by the Dashboard, and through ScanFlow's FlowCamera
// by every scan-first task screen. Pass `on` and `onChange` to control it (FlowCamera remembers the choice per device);
// the camera session lives as long as the component stays mounted and on, whatever the prompt says.

import { useEffect, useRef, useState } from 'react';
import { cameraSupported, startCamera, type CameraSession } from '../../device/scanner';
import { useScanRouter } from '../../device/scanRouter';
import { Icon } from '../../ui/icons';
import { Notice } from '../../ui/ui';
import './camera.css';

/** The same label in view again within this window is the same scan, not a new one. */
const REPEAT_MS = 2500;

export interface InlineCameraProps {
  /** What to scan, shown over the picture. */
  prompt: string;
  /** Test id of the wrapper; the start button gets `${testId}-start`. */
  testId?: string;
  /** The start button's title and the line under it. */
  title?: string;
  hint?: string;
  className?: string;
  /** Controlled on/off. Without it the camera starts off and keeps its own state. */
  on?: boolean;
  onChange?: (on: boolean) => void;
}

export function InlineCamera({ prompt, testId = 'inline-camera', title = 'Scan with camera', hint = 'Point your phone at a label. It keeps scanning until you stop it.', className, on: onProp, onChange }: InlineCameraProps) {
  const { emit } = useScanRouter();
  const [onOwn, setOnOwn] = useState(false);
  const on = onProp ?? onOwn;
  const setOn = (v: boolean) => {
    if (onProp === undefined) setOnOwn(v);
    onChange?.(v);
  };
  const setOnRef = useRef(setOn);
  setOnRef.current = setOn;
  const [error, setError] = useState<string | null>(null);
  const [torch, setTorch] = useState<'none' | 'off' | 'on'>('none');
  const video = useRef<HTMLVideoElement>(null);
  const session = useRef<CameraSession | null>(null);
  const seen = useRef<{ text: string; at: number } | null>(null);

  useEffect(() => {
    if (!on || !video.current) return;
    let cancelled = false;
    const abort = new AbortController();
    setError(null);
    void startCamera(
      video.current,
      (text) => {
        const now = Date.now();
        const last = seen.current;
        seen.current = { text, at: now };
        if (last && last.text === text && now - last.at < REPEAT_MS) return;
        emit(text, 'camera');
      },
      (_kind, message) => {
        if (!cancelled) {
          setError(message);
          setOnRef.current(false);
        }
      },
      abort.signal,
    ).then((s) => {
      if (cancelled) s?.stop();
      else {
        session.current = s;
        setTorch(s?.torchSupported ? 'off' : 'none');
      }
    });
    return () => {
      cancelled = true;
      abort.abort();
      session.current?.stop();
      session.current = null;
      setTorch('none');
    };
  }, [on, emit]);

  const switchCamera = async () => {
    const s = session.current;
    if (!s) return;
    await s.switchCamera();
    if (session.current === s) setTorch(s.torchSupported ? 'off' : 'none');
  };
  const toggleTorch = async () => {
    const s = session.current;
    if (s) setTorch((await s.setTorch(!s.torchOn)) ? 'on' : 'off');
  };

  if (!cameraSupported()) return null;

  return (
    <div className={`inline-camera${className ? ` ${className}` : ''}`} data-testid={testId}>
      {on ? (
        <div className="viewfinder inline-viewfinder">
          <video ref={video} playsInline muted />
          <div className="reticle" />
          <div className="vf-controls">
            {torch !== 'none' && (
              <button type="button" className="vf-light" aria-pressed={torch === 'on'} onClick={() => void toggleTorch()}>
                <Icon name="bolt" width={16} height={16} /> Light
              </button>
            )}
            <button type="button" onClick={() => void switchCamera()}>
              Switch
            </button>
            <button type="button" onClick={() => setOn(false)}>
              Stop camera
            </button>
          </div>
          <div className="vf-label">{prompt}</div>
        </div>
      ) : (
        <button type="button" className="btn primary inline-camera-start" onClick={() => setOn(true)} data-testid={`${testId}-start`}>
          <Icon name="camera" width={32} height={32} />
          <span>
            <strong>{title}</strong>
            <small>{hint}</small>
          </span>
        </button>
      )}
      {error && <Notice tone="warn">{error}</Notice>}
    </div>
  );
}
