import { FirebaseBackend } from '../../data/firebase';
// A label preview + print dialog used from Receive, pallet records, and the label studio.

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../../app/state';
import { useJobsOn } from '../../app/words';
import { canPrint, IS_PREVIEW, printNow } from '../../device/output';
import { Icon } from '../../ui/icons';
import { Notice, Sheet } from '../../ui/ui';
import { Calibration, PalletLabel, RackLabel, type LabelFormat } from './LabelCard';
import { printableName } from './printers';

export function LabelSheet({ palletIds = [], locationIds = [], onClose, closeHint }: { palletIds?: string[]; locationIds?: string[]; onClose: () => void; closeHint?: React.ReactNode }) {
  const {backend}=useApp();const [error,setError]=useState('');const [ready,setReady]=useState(backend.mode!=='firebase');
  const idsKey=[...palletIds,...locationIds].join(',');
  useEffect(()=>{let active=true;if(backend instanceof FirebaseBackend){setReady(false);void backend.loadForLabels(palletIds,locationIds).then(()=>{if(active)setReady(true);}).catch(()=>{if(active)setError('Labels could not load. Close and reopen this preview to retry.');});}return()=>{active=false;};},[backend,idsKey]);
  const [format, setFormat] = useState<LabelFormat>('4x6');
  return (
    <Sheet title={`Print ${palletIds.length + locationIds.length === 1 ? 'label' : `${palletIds.length + locationIds.length} labels`}`} onClose={onClose} wide closeHint={closeHint}>
      <div className="stack">
        {error&&<p role="alert">{error}</p>}
        {(
          <div className="seg" role="group" aria-label="Label size">
            <button aria-pressed={format === '4x6'} onClick={() => setFormat('4x6')}>
              4 × 6 in label
            </button>
            <button aria-pressed={format === 'sheet'} onClick={() => setFormat('sheet')}>
              Letter sheet, 6 per page
            </button>
            <button aria-pressed={format === 'avery5160'} onClick={() => setFormat('avery5160')}>
              Small: Avery 5160, 30 per page
            </button>
          </div>
        )}
        <LabelSet palletIds={palletIds} locationIds={locationIds} format={format} />
        <Calibration />
        <p className="muted" style={{ fontSize: 13.5 }}>
          Reprinting uses the same identity token, so an old copy keeps working. Replacing a compromised label is a separate supervisor action (“Replace label”).
        </p>
      </div>
      {/* Stays in view at the bottom of the sheet, however many labels are above it. */}
      <div className="sheet-foot">
        {IS_PREVIEW ? (
          <Notice tone="info" icon="print">
            This hosted preview cannot open a print dialog. Run the app from its source folder (see the Guide) to print on paper, or test scanning by pointing “Scan from a photo” at these labels on another screen.
          </Notice>
        ) : (
          <div className="row">
            <button className="btn primary big" onClick={printNow} disabled={!canPrint()||!ready}>
              <Icon name="print" /> Print
            </button>
            <span className="muted">Print at actual size. Cancelling the print dialog changes nothing.</span>
          </div>
        )}
      </div>
      <PrintPortal>
        <style>{format === 'avery5160'
          ? // Avery 5160 / 8160: 3 × 10 labels of 2⅝ × 1 in, 0.5 in top margin, 3/16 in sides, ⅛ in between columns.
            `@media print { @page { size: letter; margin: 0.5in 0.1875in; } .label-grid { display: grid !important; grid-template-columns: repeat(3, 2.625in) !important; column-gap: 0.125in !important; row-gap: 0 !important; } .label-5160 { break-inside: avoid; } }`
          : `@media print { @page { size: ${format === '4x6' ? '4in 6in' : 'letter'}; margin: ${format === '4x6' ? '0' : '.25in'}; } .label-grid { display: ${format === '4x6' ? 'block' : 'grid'} !important; ${format === 'sheet' ? 'grid-template-columns: repeat(2, 4in) !important;' : ''} } .label-rack { break-after: ${format === '4x6' ? 'page' : 'auto'}; } }`}</style>
        <LabelSet palletIds={palletIds} locationIds={locationIds} format={format} forPrint />
      </PrintPortal>
    </Sheet>
  );
}

export function LabelSet({ palletIds, locationIds, format, forPrint }: { palletIds: string[]; locationIds: string[]; format: LabelFormat; forPrint?: boolean }) {
  const { read } = useApp();
  const jobsOn = useJobsOn();
  const data = read((e, _a, ws) => {
    const wh = e.activeWarehouse(ws);
    return {
      wh: printableName(wh?.name),
      pallets: palletIds.map((id) => e.db.pallets[id]).filter((p) => p && p.workspace_id === ws).map((p) => ({ p, job: e.db.jobs[p.job_id], token: e.activeLabel(p.id)?.token ?? '' })),
      locs: locationIds.map((id) => e.db.locations[id]).filter((l) => l && l.workspace_id === ws).map((l) => ({ l, token: e.activeLabel(l.id)?.token ?? '' })),
    };
  });
  if (!data) return null;
  if (!forPrint && !data.pallets.length && !data.locs.length) return <Notice tone="info" icon="print">Loading labels…</Notice>;
  return (
    <div className="label-grid" style={forPrint ? { gap: 0 } : undefined}>
      {data.pallets.map(({ p, job, token }) => (
        <PalletLabel key={p.id} pallet={p} job={job} token={token} format={format} warehouse={data.wh} jobsOn={jobsOn} />
      ))}
      {data.locs.map(({ l, token }) => (
        <RackLabel key={l.id} location={l} token={token} warehouse={data.wh} format={format} />
      ))}
    </div>
  );
}

export function PrintPortal({ children }: { children: React.ReactNode }) {
  const el = typeof document !== 'undefined' ? document.getElementById('print-root') : null;
  return el ? createPortal(children, el) : null;
}
