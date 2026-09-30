import { useEffect, useRef, useState } from "react";
import {
  cameraSupported,
  decodeImageFile,
  startCamera,
  type CameraSession,
} from "../../device/scanner";
import {
  stripScanPrefix,
  useScanRouter,
  useScanTarget,
} from "../../device/scanRouter";
import { Sheet, Notice } from "../../ui/ui";
import { Icon } from "../../ui/icons";
import "../scanners/scanners.css";

/** Capture raw labels without assuming they already exist in this warehouse. */
export function BarcodeSheet({
  title,
  onScan,
  onClose,
}: {
  title: string;
  onScan: (text: string) => void | Promise<void>;
  onClose: () => void;
}) {
  const [camera, setCamera] = useState(cameraSupported);
  const [error, setError] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const session = useRef<CameraSession | null>(null);
  const pending = useRef(false);
  const alive = useRef(true);
  const last = useRef({ text: "", at: 0 });
  const { beep, settings } = useScanRouter();
  const accept = useRef<(text: string) => Promise<void>>(async () => {});
  accept.current = (text) => {
    if (!text.trim() || pending.current || !alive.current)
      return Promise.resolve();
    if (last.current.text === text && Date.now() - last.current.at < 2500)
      return Promise.resolve();
    last.current = { text, at: Date.now() };
    pending.current = true;
    setBusy(true);
    setError("");
    return Promise.resolve()
      .then(() => {
        if (alive.current) return onScan(text);
      })
      .then(() => {
        if (alive.current) {
          beep("good");
          session.current?.stop();
          onClose();
        }
      })
      .catch((e: unknown) => {
        if (alive.current) {
          beep("bad");
          setError(
            e instanceof Error
              ? e.message
              : "Could not read this barcode. Try again.",
          );
        }
      })
      .finally(() => {
        pending.current = false;
        if (alive.current) setBusy(false);
      });
  };
  useScanTarget(
    "barcode-sheet",
    (event) => {
      accept.current(event.text);
      return true;
    },
    true,
    100,
    { whileModal: true },
  );
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    if (!camera || !video.current) return;
    let cancelled = false;
    void startCamera(
      video.current,
      (text) => {
        if (!cancelled) accept.current(text);
      },
      (_kind, message) => {
        if (!cancelled) {
          setError(message);
          setCamera(false);
        }
      },
    ).then((value) => {
      if (cancelled) value?.stop();
      else session.current = value;
    });
    return () => {
      cancelled = true;
      session.current?.stop();
      session.current = null;
    };
  }, [camera]);
  const photo = async (file?: File) => {
    if (!file || pending.current) return;
    setBusy(true);
    setError("");
    pending.current = true;
    try {
      const text = await decodeImageFile(file);
      if (!alive.current) return;
      if (!text)
        throw Error(
          "No barcode found. Include the whole label in a clear, well-lit photo, or type its code.",
        );
      pending.current = false;
      await accept.current(text);
    } catch (e) {
      if (alive.current)
        setError(e instanceof Error ? e.message : "Could not read this photo.");
    } finally {
      pending.current = false;
      if (alive.current) setBusy(false);
    }
  };
  return (
    <Sheet title={title} onClose={onClose}>
      <div className="stack scanner">
        <p className="muted">
          Scan the full barcode or QR code. You can also use a photo,
          USB/Bluetooth scanner, or the printed number.
        </p>
        {camera && (
          <div className="viewfinder">
            <video ref={video} playsInline muted />
            <div className="reticle" />
            <div className="vf-controls">
              <button
                type="button"
                onClick={() => void session.current?.switchCamera()}
              >
                Switch
              </button>
              <button type="button" onClick={() => setCamera(false)}>
                Stop camera
              </button>
            </div>
            <div className="vf-label">
              Keep the entire barcode inside the camera view
            </div>
          </div>
        )}
        <div className="row">
          {!camera && cameraSupported() && (
            <button
              className="btn"
              onClick={() => {
                setError("");
                setCamera(true);
              }}
            >
              <Icon name="camera" />
              Start camera
            </button>
          )}
          <label className="btn">
            <Icon name="image" />
            Scan from a photo
            <input
              className="sr-only"
              aria-label="Barcode photo"
              type="file"
              accept="image/*"
              capture="environment"
              disabled={busy}
              onChange={(e) => {
                void photo(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
        </div>
        {error && (
          <Notice tone="warn" title="Check the scan">
            {error}
          </Notice>
        )}
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            accept.current(stripScanPrefix(code.trim(), settings.prefix));
          }}
        >
          <label htmlFor="supplier-scan-code">Printed barcode number</label>
          <input
            id="supplier-scan-code"
            className="input code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            maxLength={1024}
            autoComplete="off"
            spellCheck={false}
          />
          <button className="btn primary" disabled={busy || !code.trim()}>
            {busy ? "Reading…" : "Use barcode"}
          </button>
        </form>
      </div>
    </Sheet>
  );
}
