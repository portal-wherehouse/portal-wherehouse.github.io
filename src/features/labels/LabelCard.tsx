// Printable labels (blueprint page 16). Pallet labels: big code, job, short description, QR.
// Rack labels: the readable rack code first. Job and description stay outside the QR, so edits
// never change the identity token.

import { useEffect, useState } from 'react';
import { makeLabelPayload } from '../../domain/codes';
import type { Job, Location, Pallet } from '../../domain/types';
import { qrSvg } from '../../device/output';

export type LabelFormat = '4x6' | 'sheet';

export function Qr({ payload, className }: { payload: string; className?: string }) {
  const [svg, setSvg] = useState('');
  useEffect(() => {
    let live = true;
    void qrSvg(payload).then((s) => live && setSvg(s));
    return () => {
      live = false;
    };
  }, [payload]);
  return <div className={className} dangerouslySetInnerHTML={{ __html: svg }} role="img" aria-label={`QR code ${payload}`} />;
}

export function PalletLabel({ pallet, job, token, format, warehouse }: { pallet: Pallet; job: Job; token: string; format: LabelFormat; warehouse: string }) {
  const payload = makeLabelPayload('P', token);
  if (format === 'sheet') {
    return (
      <div className="label-card label-sheet">
        <FitCode text={pallet.code} className="l-code" maxHeight="0.56in" />
        <div className="l-row">
          <Qr payload={payload} className="l-qr" />
          <div style={{ minWidth: 0 }}>
            <div className="l-job">{job.code}</div>
            <div className="l-desc">{pallet.description}</div>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="label-card label-4x6">
      <FitCode text={pallet.code} className="l-code" maxHeight="0.95in" />
      <div className="l-job">JOB {job.code}</div>
      <div className="l-desc">{pallet.description}</div>
      <div className="l-desc" style={{ fontWeight: 400, fontSize: '0.14in' }}>
        {job.name}
      </div>
      <Qr payload={payload} className="l-qr" />
      <div className="l-foot">
        <span>{warehouse}</span>
        <span>If the QR is damaged, type {pallet.code}</span>
      </div>
    </div>
  );
}

export function RackLabel({ location, token, warehouse }: { location: Location; token: string; warehouse: string }) {
  return (
    <div className="label-card label-rack">
      <Qr payload={makeLabelPayload('L', token)} className="l-qr" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.08in', minWidth: 0 }}>
        <div className="l-kind">{location.kind === 'RACK' ? 'Rack location' : location.kind.toLowerCase()}</div>
        <FitCode text={location.code} className="l-code" maxHeight="1.1in" />
        <div className="l-foot" style={{ gap: '0.2in' }}>
          <span>{warehouse}</span>
          <span>Scan the pallet first, then this label</span>
        </div>
      </div>
    </div>
  );
}

/**
 * The big printed code, drawn as SVG text squeezed to a fixed width per character, so it never
 * wraps mid-code or spills off the label, whichever font the printer's browser ends up using.
 */
function FitCode({ text, className, maxHeight }: { text: string; className?: string; maxHeight: string }) {
  const w = Math.max(1, text.length) * 52;
  return (
    <svg className={className} viewBox={`0 0 ${w} 100`} preserveAspectRatio="xMinYMid meet" role="img" aria-label={text} style={{ width: '100%', maxHeight, display: 'block' }}>
      <text x="0" y="86" textLength={w} lengthAdjust="spacingAndGlyphs" fontSize="100" fontWeight="700" fill="currentColor" style={{ fontFamily: 'var(--font-display)' }}>
        {text}
      </text>
    </svg>
  );
}

export function Calibration() {
  return (
    <div className="row nowrap" style={{ alignItems: 'center', gap: 12 }}>
      <div className="calibration">
        1 in
        <br />
        25.4 mm
      </div>
      <p className="muted" style={{ fontSize: 13, maxWidth: '46ch' }}>
        Calibration box. Measure it on paper: it should be exactly one inch. If not, turn off “fit to page” and print at 100% (actual size).
      </p>
    </div>
  );
}
