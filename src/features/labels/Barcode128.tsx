// A Code 128 barcode drawn as SVG: black bars on white with quiet zones, so any laser or camera scanner can read it.
// It stretches to its container's width; every module stretches equally, so the code stays valid.

import { useMemo } from 'react';
import { QUIET_ZONE, encodeCode128 } from '../../device/code128';
import './barcode.css';

export function Barcode128({ value, height = 64, showText = false, className }: { value: string; height?: number | string; showText?: boolean; className?: string }) {
  const code = useMemo(() => {
    try {
      return encodeCode128(value);
    } catch {
      return null;
    }
  }, [value]);

  if (!code) {
    return (
      <div className={`bc128 bc128-bad ${className ?? ''}`} role="note">
        This code has characters a barcode cannot hold: {value}
      </div>
    );
  }

  const total = code.modules + QUIET_ZONE * 2;
  let x = QUIET_ZONE;
  let d = '';
  code.widths.forEach((w, i) => {
    if (i % 2 === 0) d += `M${x} 0h${w}v100h${-w}z`;
    x += w;
  });

  return (
    <div className={`bc128 ${className ?? ''}`}>
      <svg viewBox={`0 0 ${total} 100`} preserveAspectRatio="none" shapeRendering="crispEdges" role="img" aria-label={`Barcode ${value}`} style={{ height }}>
        <rect width={total} height="100" fill="#fff" />
        <path d={d} fill="#000" />
      </svg>
      {showText && (
        <div className="bc128-text" aria-hidden="true">
          {value}
        </div>
      )}
    </div>
  );
}
