import { SpotsTabs } from '../../ui/tabSets';
// Labels: the guided print flow (printer, then label style, then which spots or items), what a label carries,
// and printing tips (page 16).

import { useMemo } from 'react';
import { makeLabelPayload } from '../../domain/codes';
import { useApp } from '../../app/state';
import { Explain, PageHead } from '../../ui/ui';
import { Qr } from './LabelCard';
import { PrintFlow } from './PrintFlow';

export function LabelStudio() {
  const { read, backend, v, role } = useApp();
  const manager = role === 'OWNER' || role === 'SUPERVISOR';
  const sample = useMemo(
    () =>
      read((e, _a, ws) => {
        const p = Object.values(e.db.pallets).find((x) => x.workspace_id === ws && !x.archived_at);
        return p ? (e.activeLabel(p.id)?.token ?? null) : null;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [v, backend.network],
  );
  const samplePayload = sample ? makeLabelPayload('P', sample) : 'PL1:P:ABCDEFGHIJKLMNOP';

  return (
    <div className="stack">
      <SpotsTabs />
      <PageHead title="Labels" sub="Choose your printer, then what to print. Spot labels, shelf-edge labels, section signs and item labels, laid out at true size for your labels." />
      <div data-tour="labels-source">
        <PrintFlow styles={manager ? ['spot', 'shelf', 'poster', 'item'] : ['spot', 'shelf', 'item']} />
      </div>
      <div>
        <div className="panel stack" data-tour="labels-anatomy" style={{ maxWidth: 760 }}>
          <div className="panel-title">What is on a label</div>
          <div className="row nowrap" style={{ alignItems: 'flex-start', gap: 16 }}>
            <div style={{ width: 120, flex: 'none', background: '#fff', padding: 6, borderRadius: 6, border: '1px solid var(--line)' }}>
              <Qr payload={samplePayload} />
            </div>
            <div className="stack" style={{ gap: 6, fontSize: 14 }}>
              <div>
                The QR code holds <span className="mono" style={{ fontSize: 12.5 }}>PL1:P:</span> followed by a 16-character random token. It holds no job, description or location.
              </div>
              <div className="muted">
                That means a label never goes stale when a pallet moves, and the QR itself reveals nothing beyond the printed text. Only someone with access to this company can look the token up.
              </div>
            </div>
          </div>
          <table className="t" style={{ fontSize: 13.5 }}>
            <tbody>
              <tr>
                <td>
                  <span className="mono">PL1</span>
                </td>
                <td>Format version, so labels can evolve without breaking old ones.</td>
              </tr>
              <tr>
                <td>
                  <span className="mono">P</span> or <span className="mono">L</span>
                </td>
                <td>Pallet or location label.</td>
              </tr>
              <tr>
                <td>
                  <span className="mono">16 chars</span>
                </td>
                <td>Random token (A–Z, 2–7). 80 bits, so it cannot be guessed.</td>
              </tr>
              <tr>
                <td>
                  <span className="mono">Barcode</span>
                </td>
                <td>
                  A Code 128 barcode of the printed code (like <span className="code-nw">P-000042</span> or <span className="code-nw">A-03-02</span>), for laser scanners that cannot read QR codes. It
                  works just like typing the code.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <Explain title="Printing tips" refs="pages 16, 26">
        <ul>
          <li>Pick your printer first. Each printer only offers the label styles and sizes it can print, laid out to match the label sheet or roll.</li>
          <li>Shelves: shelf-edge labels on Avery 5160 sheets, 2 x 1 in thermal labels or shelf strips, one under each spot. Racks and floor spots: spot labels on 4 x 6 in thermal labels or Avery 5164 sheets.</li>
          <li>Always print at 100% (“actual size”). The calibration square must measure exactly 1 inch. If it does not, fix the printer scaling before printing a batch.</li>
          <li>Reprinting a label uses the same token, so an older copy keeps working. Use “Replace label” on a pallet only when a label was copied or misused.</li>
          <li>The large printed code is always the fallback: a damaged label can be typed in on Move or Find.</li>
        </ul>
      </Explain>
    </div>
  );
}
