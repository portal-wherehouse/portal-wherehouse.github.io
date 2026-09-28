// Printable command barcodes: each SCAN_COMMANDS entry as a Code 128 barcode (for laser scanners) and a QR code
// (for cameras and 2D scanners), so someone holding a scanner can confirm, cancel or switch modes without the screen.

import { useEffect, useState } from 'react';
import { BRAND } from '../../brand';
import { SCAN_COMMANDS, commandPayload } from '../../device/scanCommands';
import { IS_PREVIEW, canPrint, printNow } from '../../device/output';
import { Icon } from '../../ui/icons';
import { Notice } from '../../ui/ui';
import { Barcode128 } from '../labels/Barcode128';
import { Qr } from '../labels/LabelCard';
import { PrintPortal } from '../labels/LabelSheet';

function CommandCards({ forPrint }: { forPrint?: boolean }) {
  return (
    <div className={forPrint ? 'scn-cmd-print' : 'scn-cmd-grid'}>
      {forPrint && (
        <div className="scn-cmd-print-head">
          <strong>{BRAND.name} command barcodes</strong>
          <span>Scan one of these instead of tapping the screen. Keep this sheet at the scan station or on the cart.</span>
        </div>
      )}
      {SCAN_COMMANDS.map((c) => (
        <div key={c.id} className="scn-cmd-card">
          <div className="scn-cmd-top">
            <div className="scn-cmd-words">
              <div className="scn-cmd-label">{c.label}</div>
              <div className="scn-cmd-hint">{c.hint}</div>
            </div>
            <Qr payload={commandPayload(c.id)} className="scn-cmd-qr" />
          </div>
          <Barcode128 value={commandPayload(c.id)} className="scn-cmd-bc" height={forPrint ? '0.62in' : 58} showText />
        </div>
      ))}
    </div>
  );
}

export function CommandSheet() {
  // The print copy lives in the page's print area. It is mounted after the first render (when that area exists)
  // and stays mounted, so its QR codes are drawn before anyone presses Print.
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  return (
    <section className="panel stack" id="command-sheet" aria-labelledby="scn-cmd-title">
      <div className="scn-section-head">
        <div>
          <div className="panel-title" id="scn-cmd-title" style={{ marginBottom: 4 }}>
            <Icon name="barcode" width={16} height={16} /> Command barcodes
          </div>
          <p className="muted" style={{ margin: 0, maxWidth: '68ch' }}>
            Print this sheet and keep it where people scan. Each code does what its name says on screens that are waiting for it, like the Scan station. The mode codes
            open the Scan station from anywhere in the portal.
          </p>
        </div>
        {!IS_PREVIEW && (
          <button type="button" className="btn primary" onClick={printNow} disabled={!canPrint()}>
            <Icon name="print" /> Print command sheet
          </button>
        )}
      </div>
      {IS_PREVIEW && (
        <Notice tone="info" icon="print">
          This hosted preview cannot open a print dialog, so the sheet is shown here instead. A phone camera, or a scanner that reads screens, can scan these codes straight from it. Run
          the full app to print it on paper.
        </Notice>
      )}
      <CommandCards />
      {!IS_PREVIEW && <p className="faint" style={{ margin: 0, fontSize: 13 }}>Prints on one letter or A4 page. Print at actual size (100%) so the barcodes keep their proportions.</p>}
      {ready && !IS_PREVIEW && (
        <PrintPortal>
          <CommandCards forPrint />
        </PrintPortal>
      )}
    </section>
  );
}
