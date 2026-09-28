// Home tour, step 2: the real 4x6 pallet label, scaled to fit its frame, with numbered callouts
// in the margin. Callout positions are measured from the label itself, so layout changes follow.

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { PalletLabel } from '../../features/labels/LabelCard';
import type { Job, Pallet } from '../../domain/types';

/** A 4x6 inch label at 96 CSS pixels per inch. */
const LABEL_W = 384;
const LABEL_H = 576;
/** Room on the left for the numbered markers. */
const GUTTER = 30;

export interface Callout {
  /** CSS selector of the part of the label this callout points at. */
  selector: string;
  title: string;
  body: ReactNode;
}

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

export function LabelFrame({
  pallet,
  job,
  token,
  warehouse,
  callouts,
  active,
  onActive,
  maxWidth = 270,
}: {
  pallet: Pallet;
  job: Job;
  token: string;
  warehouse: string;
  /** Keep this array stable (a module constant): it drives measuring. */
  callouts: Callout[];
  active: number;
  onActive: (i: number) => void;
  maxWidth?: number;
}) {
  const stage = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const labelBox = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(maxWidth);
  const [boxes, setBoxes] = useState<(Box | null)[]>([]);

  // Fit the label to the space available.
  useLayoutEffect(() => {
    const el = stage.current;
    if (!el) return;
    const fit = () => setWidth(Math.max(150, Math.min(maxWidth, el.clientWidth - GUTTER)));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [maxWidth]);

  const measure = useCallback(() => {
    const host = inner.current;
    const label = labelBox.current;
    if (!host || !label) return;
    const origin = host.getBoundingClientRect();
    const next = callouts.map((c) => {
      const el = label.querySelector(c.selector);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { top: Math.round(r.top - origin.top), left: Math.round(r.left - origin.left), width: Math.round(r.width), height: Math.round(r.height) };
    });
    setBoxes((cur) => (JSON.stringify(cur) === JSON.stringify(next) ? cur : next));
  }, [callouts]);

  useLayoutEffect(measure, [measure, width, pallet, job]);
  useEffect(() => {
    let live = true;
    void document.fonts?.ready.then(() => live && measure());
    const t = window.setTimeout(measure, 300);
    return () => {
      live = false;
      window.clearTimeout(t);
    };
  }, [measure]);

  const scale = width / LABEL_W;
  const hi = boxes[active];
  // Only explain parts this label actually has; number them in reading order.
  const shown = callouts.map((c, i) => ({ c, i, box: boxes[i] ?? null })).filter((x) => boxes.length === 0 || x.box);

  return (
    <div className="tt-labelwrap">
      <div className="tt-label-stage" ref={stage}>
        <div className="tt-label-inner" ref={inner} style={{ paddingLeft: GUTTER, width: width + GUTTER }}>
          <div className="tt-label-box" ref={labelBox} style={{ width, height: LABEL_H * scale }}>
            <div className="tt-label-scale" style={{ width: LABEL_W, height: LABEL_H, transform: `scale(${scale})` }}>
              <PalletLabel pallet={pallet} job={job} token={token} format="4x6" warehouse={warehouse} />
            </div>
          </div>
          {hi && <div className="tt-label-hi" aria-hidden="true" style={{ top: hi.top - 4, left: hi.left - 4, width: hi.width + 8, height: hi.height + 8 }} />}
          {shown.map(({ i, box }, n) =>
            box ? (
              <button
                key={i}
                type="button"
                className="tt-marker"
                tabIndex={-1}
                aria-hidden="true"
                aria-pressed={i === active}
                style={{ top: box.top + box.height / 2 - 12 }}
                onClick={() => onActive(i)}
              >
                {n + 1}
              </button>
            ) : null,
          )}
        </div>
      </div>
      <ol className="tt-legend">
        {shown.map(({ c, i }, n) => (
          <li key={c.selector}>
            <button type="button" className="tt-legend-item" aria-pressed={i === active} onClick={() => onActive(i)} onMouseEnter={() => onActive(i)} onFocus={() => onActive(i)}>
              <span className="tt-legend-num" aria-hidden="true">
                {n + 1}
              </span>
              <span className="tt-legend-text">
                <strong>{c.title}</strong>
                <span>{c.body}</span>
              </span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
