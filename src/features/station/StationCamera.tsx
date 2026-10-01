// The Scan station's camera: the phone's own camera as the scanner. Each new label goes through the scan router,
// exactly like a hardware scan, so the station handles it the same way and logs it as a camera scan.

import { useEffect, useRef, useState } from 'react';
import { cameraSupported, startCamera, type CameraSession } from '../../device/scanner';
import { useScanRouter } from '../../device/scanRouter';
import { Icon } from '../../ui/icons';
import { Notice } from '../../ui/ui';
import '../scanners/scanners.css';

/** The same label in view again within this window is the same scan, not a new one. */
const REPEAT_MS = 2500;

export function StationCamera({ prompt }: { prompt: string }) {
  const { emit } = useScanRouter();
  const [on, setOn] = useState(false);
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
          setOn(false);
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
    <div className="st-camera" data-testid="station-camera">
      {on ? (
        <div className="viewfinder st-viewfinder">
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
        <button type="button" className="btn primary st-camera-start" onClick={() => setOn(true)} data-testid="station-camera-start">
          <Icon name="camera" />
          <span>
            <strong>Scan with camera</strong>
            <small>Point your phone at a label. It keeps scanning until you stop it.</small>
          </span>
        </button>
      )}
      {error && <Notice tone="warn">{error}</Notice>}
    </div>
  );
}
