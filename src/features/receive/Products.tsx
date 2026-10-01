// Products: what a barcode means in this warehouse. Scanning a saved type's barcode on Receive fills in
// its name, unit, category and size; each pallet received still gets its own record and its own P-code.
// A pallet that arrives without a label gets a generated barcode here, printed on a product sticker.

import { useMemo, useState } from 'react';
import { useApp } from '../../app/state';
import type { ProductMemory } from '../../domain/receiving';
import { roleAllows } from '../../domain/transitions';
import { canPrint, IS_PREVIEW, printNow } from '../../device/output';
import { CommandFeedback } from '../../ui/CommandFeedback';
import { Icon } from '../../ui/icons';
import { useCommand } from '../../ui/useCommand';
import { Explain, Field, Notice, PageHead, Sheet, Spinner } from '../../ui/ui';
import { Barcode128 } from '../labels/Barcode128';
import { Qr } from '../labels/LabelCard';
import { PrintPortal } from '../labels/LabelSheet';
import { fmtQty, hasMinimum, isLow, measure, measureWord, type Stock } from '../../domain/stock';
import { useLowStock, useProductStock } from '../stock/useStock';
import '../stock/stock.css';

/** A short code for a product that has none: PT- plus six characters that are hard to misread. */
export function newProductCode(taken: (code: string) => boolean): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (;;) {
    const bytes = crypto.getRandomValues(new Uint8Array(6));
    const code = 'PT-' + [...bytes].map((b) => alphabet[b % alphabet.length]).join('');
    if (!taken(code)) return code;
  }
}

export function Products() {
  const { backend, workspaceId, role, route, v, go } = useApp();
  const stockOf = useProductStock();
  const lowCount = useLowStock()?.length ?? 0;
  const manager = role === 'OWNER' || role === 'SUPERVISOR';
  const [q, setQ] = useState(route.q ?? '');
  const [editing, setEditing] = useState<ProductMemory | 'new' | null>(null);
  const [printing, setPrinting] = useState<ProductMemory | null>(null);
  const products = useMemo(
    () => Object.values(backend.db.products).filter((p) => p.workspace_id === workspaceId).sort((a, b) => a.description.localeCompare(b.description)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [v, workspaceId],
  );
  const needle = q.trim().toLowerCase();
  const hits = products.filter((p) => !needle || needle.split(/\s+/).every((w) => [p.description, p.code, p.category ?? '', p.unit].join('\n').toLowerCase().includes(w)));
  const [created, setCreated] = useState<ProductMemory | null>(null);
  const canEdit = roleAllows(role, 'save_product');

  return (
    <div className="stack">
      <PageHead eyebrow="Setup" title="Products" sub="Every saved product and its barcode. Print a sticker any time." />
      <Explain title="How products work">
        <p>A product is something you get again and again, like "Tire crate from Acme Supply" or "Birch wood, 1 face cord". It has one barcode. Every pallet of that product carries the same sticker, so scanning it on Receive fills in the name, size and details.</p>
        <p>Each pallet you receive still gets its own record and its own Wherehouse label, so three birch pallets are three pallets, even when they sit in the same spot.</p>
        <p>Pallet coming from somewhere that doesn't label it? Tap New product, generate a barcode, and print its sticker.</p>
      </Explain>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <div className="search-bar" style={{ flex: '1 1 280px' }}>
          <Icon name="find" />
          <label htmlFor="products-q" className="sr-only">
            Search products
          </label>
          <input id="products-q" className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, barcode or category" autoComplete="off" />
        </div>
        {canEdit && (
          <button className="btn primary" onClick={() => setEditing('new')}>
            <Icon name="plus" /> New product
          </button>
        )}
      </div>
      {manager && lowCount > 0 && (
        <Notice tone="warn" icon="alert" title={`${lowCount} ${lowCount === 1 ? 'product is' : 'products are'} running low`} actions={<button className="btn small" onClick={() => go({ name: 'reconcile', q: 'low' })}>Open Running low</button>}>
          Below the minimum you set. Bring more from another warehouse, or note a reorder.
        </Notice>
      )}
      {products.length === 0 ? (
        <p className="muted">No products yet. They're added here with New product, or when someone receives a new barcode with "Save as a product" checked.</p>
      ) : hits.length === 0 ? (
        <p className="muted">Nothing matches “{q.trim()}”.</p>
      ) : (
        <div className="stack" style={{ gap: 6 }} data-testid="product-list">
          {hits.map((p) => (
            <div key={p.id} className="import-row" style={{ cursor: 'default' }}>
              {p.category ? <span className="tag">{p.category}</span> : null}
              <span className="grow">
                <strong>{p.description}</strong>
                {p.unit && <span className="muted"> · {p.unit}</span>}
                {sizeLine(p) && <span className="muted"> · {sizeLine(p)}</span>}
              </span>
              <span className="muted mono">{p.code}</span>
              <StockChip product={p} stock={stockOf(p)} />
              <button className="btn small" onClick={() => setPrinting(p)} aria-label={`Print stickers for ${p.description}`}>
                <Icon name="print" /> Print
              </button>
              {canEdit && (
                <button className="btn small ghost" onClick={() => setEditing(p)} aria-label={`Edit ${p.description}`}>
                  <Icon name="edit" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {editing && (
        <ProductForm
          product={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(p, print) => {
            setEditing(null);
            if (print) setPrinting(p);
            else setCreated(p);
          }}
        />
      )}
      {created && (
        <Notice tone="ok" title={`Saved ${created.description}`} actions={<button className="btn small" onClick={() => (setPrinting(created), setCreated(null))}><Icon name="print" /> Print now</button>}>
          Barcode {created.code}. You can print its sticker from this list any time.
        </Notice>
      )}
      {printing && <ProductLabelSheet product={printing} onClose={() => setPrinting(null)} />}
    </div>
  );
}

/** On hand here for one product, and whether it is below its minimum. */
function StockChip({ product, stock }: { product: ProductMemory; stock: Stock | null }) {
  if (!stock) return <span className="tag stock-chip">Counting…</span>;
  const on = measure(product, stock);
  const word = measureWord(product, on);
  const low = isLow(product, stock);
  const text = !hasMinimum(product) ? `${fmtQty(on)} ${word} on hand` : low ? `${fmtQty(on)} of ${fmtQty(product.min_qty!)} ${measureWord(product, product.min_qty!)}` : `${fmtQty(on)} ${word} · min ${fmtQty(product.min_qty!)}`;
  return (
    <span className={`tag stock-chip ${low ? 'warn' : hasMinimum(product) ? 'ok' : ''}`} data-testid="stock-chip" title={stock.held ? `${stock.held} more on hold` : undefined}>
      {low ? `Low: ${text}` : text}
    </span>
  );
}

export function sizeLine(p: { length_in?: string; width_in?: string; height_in?: string; weight_lb?: string }): string {
  const dims = [p.length_in, p.width_in, p.height_in].every((x) => x && x.trim()) ? `${p.length_in} × ${p.width_in} × ${p.height_in} in` : '';
  const w = p.weight_lb?.trim() ? `about ${Number(p.weight_lb.replace(/,/g, '')).toLocaleString('en-US')} lb` : '';
  return [dims, w].filter(Boolean).join(', ');
}

/** New or edit a product. New ones must have a barcode: scan the supplier's, or generate one. */
export function ProductForm({ product, onClose, onSaved }: { product: ProductMemory | null; onClose: () => void; onSaved: (p: ProductMemory, print: boolean) => void }) {
  const { backend, workspaceId } = useApp();
  const taken = (code: string) => Object.values(backend.db.products).some((p) => p.workspace_id === workspaceId && p.code.toUpperCase() === code.toUpperCase());
  const [code, setCode] = useState(product?.code ?? '');
  const [description, setDescription] = useState(product?.description ?? '');
  const [unit, setUnit] = useState(product?.unit ?? '');
  const [category, setCategory] = useState(product?.category ?? '');
  const [size, setSize] = useState({ length_in: product?.length_in ?? '', width_in: product?.width_in ?? '', height_in: product?.height_in ?? '', weight_lb: product?.weight_lb ?? '' });
  const [home, setHome] = useState(product?.home_location_id ?? '');
  const [minQty, setMinQty] = useState(product?.min_qty ? String(product.min_qty) : '');
  const [reorderQty, setReorderQty] = useState(product?.reorder_qty ? String(product.reorder_qty) : '');
  const [countBy, setCountBy] = useState<'units' | 'quantity'>(product?.count_by ?? 'units');
  const num = (t: string): number | null | 'bad' => {
    const s = t.trim().replace(/,/g, '');
    if (!s) return null;
    const n = Number(s);
    return Number.isFinite(n) && n >= 0 && (countBy === 'quantity' || Number.isInteger(n)) ? n : 'bad';
  };
  const minN = num(minQty);
  const reorderN = num(reorderQty);
  const levelsBad = minN === 'bad' || reorderN === 'bad';
  const homes = Object.values(backend.db.locations).filter((l) => l.workspace_id === workspaceId && (l.active || l.id === home)).sort((a, b) => a.code.localeCompare(b.code));
  const [print, setPrint] = useState(false);
  const cmd = useCommand();
  const categories = [...new Set(Object.values(backend.db.products).map((p) => p.category ?? '').filter(Boolean))].sort();
  const save = async (andPrint: boolean) => {
    setPrint(andPrint);
    const fields = { code: code.trim(), description: description.trim(), unit: unit.trim(), category: category.trim(), length_in: size.length_in.trim(), width_in: size.width_in.trim(), height_in: size.height_in.trim(), weight_lb: size.weight_lb.trim() };
    if (levelsBad) return;
    const r = await cmd.run('save_product', { ...fields, home_location_id: home || null, min_qty: minN, reorder_qty: reorderN, count_by: countBy, ...(product ? {} : { create: true }) });
    if (r.phase === 'done') {
      const id = r.accepted?.target_id ?? '';
      onSaved(backend.db.products[id] ?? { id, workspace_id: workspaceId!, warehouse_id: '', ...fields, field_names: [], updated_at: new Date().toISOString() }, andPrint);
    }
  };
  const ready = !!code.trim() && !!description.trim() && !levelsBad && !cmd.busy && backend.network !== 'offline';
  return (
    <Sheet title={product ? `Edit ${product.description}` : 'New product'} onClose={onClose}>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          if (ready) void save(false);
        }}
      >
        <Field label="Product name" htmlFor="prod-name" count={description.length} max={160}>
          <input id="prod-name" className="input" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={160} placeholder="e.g. Tire crate from Acme Supply" autoFocus />
        </Field>
        <Field label="Barcode" htmlFor="prod-code" hint={product ? "The barcode is how Wherehouse recognizes this product, so it can't change. Make a new product for a new barcode." : "Scan or type the barcode it already has. No barcode? Tap Generate barcode, and every sticker you print for this type carries the same one."}>
          <div className="row nowrap">
            <input id="prod-code" className="input mono" value={code} onChange={(e) => setCode(e.target.value)} maxLength={80} disabled={!!product} placeholder="012345678905 or PT-…" />
            {!product && (
              <button type="button" className="btn" onClick={() => setCode(newProductCode(taken))}>
                <Icon name="barcode" /> Generate barcode
              </button>
            )}
          </div>
        </Field>
        <div className="field">
          <span className="label">General size (optional)</span>
          <div className="row nowrap">
            <input aria-label="Length (in)" className="input" inputMode="decimal" value={size.length_in} onChange={(e) => setSize({ ...size, length_in: e.target.value })} placeholder="L 48 in" maxLength={8} />
            <input aria-label="Width (in)" className="input" inputMode="decimal" value={size.width_in} onChange={(e) => setSize({ ...size, width_in: e.target.value })} placeholder="W 40 in" maxLength={8} />
            <input aria-label="Height (in)" className="input" inputMode="decimal" value={size.height_in} onChange={(e) => setSize({ ...size, height_in: e.target.value })} placeholder="H 50 in" maxLength={8} />
            <input aria-label="Estimated weight (lb)" className="input" inputMode="decimal" value={size.weight_lb} onChange={(e) => setSize({ ...size, weight_lb: e.target.value })} placeholder="lb" maxLength={12} />
          </div>
          <span className="hint">Printed on the sticker and filled in on each pallet received with this barcode, so locations with limits know whether it fits.</span>
        </div>
        <div className="grid-2">
          <Field label="Unit (optional)" htmlFor="prod-unit">
            <input id="prod-unit" className="input" value={unit} onChange={(e) => setUnit(e.target.value)} maxLength={40} placeholder="tires, bundles, cases…" />
          </Field>
          <Field label="Category (optional)" htmlFor="prod-category">
            <input id="prod-category" className="input" value={category} onChange={(e) => setCategory(e.target.value)} maxLength={60} placeholder="Tires, Hardwood…" list="prod-category-suggest" />
            <datalist id="prod-category-suggest">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
        </div>
        <Field label="Home spot (optional)" htmlFor="prod-home" hint="Where this type normally lives. Move offers it first, and it stays set even when none are in stock.">
          <select id="prod-home" className="select" value={home} onChange={(e) => setHome(e.target.value)}>
            <option value="">No home spot</option>
            {homes.map((l) => (
              <option key={l.id} value={l.id}>
                {l.code}
              </option>
            ))}
          </select>
        </Field>
        <fieldset className="field product-levels">
          <legend className="label">Minimum on hand (optional)</legend>
          <div className="row">
            <Field label={countBy === 'quantity' ? `Minimum (${unit.trim() || 'units'})` : 'Minimum (pallets)'} htmlFor="prod-min">
              <input id="prod-min" className="input" inputMode="decimal" value={minQty} onChange={(e) => setMinQty(e.target.value)} placeholder="e.g. 4" maxLength={12} style={{ maxWidth: 140 }} />
            </Field>
            <Field label="Reorder quantity" htmlFor="prod-reorder">
              <input id="prod-reorder" className="input" inputMode="decimal" value={reorderQty} onChange={(e) => setReorderQty(e.target.value)} placeholder="e.g. 10" maxLength={12} style={{ maxWidth: 140 }} />
            </Field>
          </div>
          <div className="seg" role="group" aria-label="What the minimum counts">
            <button type="button" aria-pressed={countBy === 'units'} onClick={() => setCountBy('units')}>
              Count pallets
            </button>
            <button type="button" aria-pressed={countBy === 'quantity'} onClick={() => setCountBy('quantity')}>
              Count the quantity on them
            </button>
          </div>
          <span className="hint">
            {levelsBad
              ? countBy === 'units'
                ? 'Use whole numbers when counting pallets, like 4.'
                : 'Use a number of 0 or more, like 2.5.'
              : 'Below the minimum, this product shows under Running low on the Dashboard. Pallets on hold are not counted. Leave it empty for no minimum.'}
          </span>
        </fieldset>
        <CommandFeedback state={cmd.state} onRecover={() => void cmd.recover()} />
        <div className="row">
          <button type="button" className="btn primary big" disabled={!ready} onClick={() => void save(true)}>
            {cmd.busy && print ? <Spinner /> : <Icon name="print" />} Save and print now
          </button>
          <button className="btn big" disabled={!ready}>
            {cmd.busy && !print ? <Spinner /> : <Icon name="check" />} {product ? 'Save changes' : 'Save'}
          </button>
        </div>
      </form>
    </Sheet>
  );
}

type ProductFormat = '4x2' | 'sheet';

export function ProductLabelSheet({ product, onClose }: { product: ProductMemory; onClose: () => void }) {
  const [format, setFormat] = useState<ProductFormat>('4x2');
  const [copies, setCopies] = useState(1);
  const n = Math.max(1, Math.min(100, copies || 1));
  const labels = Array.from({ length: n }, (_, i) => <ProductLabel key={i} product={product} />);
  return (
    <Sheet title={`Sticker: ${product.description}`} onClose={onClose} wide>
      <div className="stack">
        <div className="seg" role="group" aria-label="Label size">
          <button aria-pressed={format === '4x2'} onClick={() => setFormat('4x2')}>
            4 × 2 in label
          </button>
          <button aria-pressed={format === 'sheet'} onClick={() => setFormat('sheet')}>
            Letter sheet, 10 per page
          </button>
        </div>
        <Field label="How many" htmlFor="prod-copies" hint="One sticker per pallet of this type. They all carry the same barcode.">
          <input id="prod-copies" className="input" type="number" min={1} max={100} value={copies} onChange={(e) => setCopies(Number(e.target.value))} style={{ maxWidth: 120 }} />
        </Field>
        <div className="product-label-grid">
          <ProductLabel product={product} />
        </div>
        <p className="muted" style={{ fontSize: 13.5, margin: 0 }}>
          Both codes hold {product.code}. Scanning either one on Receive fills in this product. Receiving then prints the pallet's own Wherehouse label, which tracks that one pallet.
        </p>
      </div>
      <div className="sheet-foot">
        {IS_PREVIEW ? (
          <Notice tone="info" icon="print">
            This hosted preview cannot open a print dialog.
          </Notice>
        ) : (
          <div className="row">
            <button className="btn primary big" onClick={printNow} disabled={!canPrint()}>
              <Icon name="print" /> Print {n} label{n === 1 ? '' : 's'}
            </button>
            <span className="muted">Print at actual size.</span>
          </div>
        )}
      </div>
      <PrintPortal>
        <style>{`@media print { @page { size: ${format === '4x2' ? '4in 2in' : 'letter'}; margin: ${format === '4x2' ? '0' : '0.5in 0.19in'}; } .product-label-grid { display: ${format === '4x2' ? 'block' : 'grid'} !important; grid-template-columns: repeat(2, 4in); gap: 0 0.12in; } .product-label { break-after: ${format === '4x2' ? 'page' : 'auto'}; break-inside: avoid; } }`}</style>
        <div className="product-label-grid">{labels}</div>
      </PrintPortal>
    </Sheet>
  );
}

/** Deliberately unlike a pallet's own label: landscape, a dark "PRODUCT" band, the name first and no P-code. */
export function ProductLabel({ product }: { product: ProductMemory }) {
  return (
    <div className="product-label">
      <div className="pl-band">
        <span>PRODUCT</span>
        {product.category && <span className="pl-cat">{product.category}</span>}
      </div>
      <div className="pl-body">
        <div className="pl-text">
          <div className="pl-name">{product.description}</div>
          {(sizeLine(product) || product.unit) && <div className="pl-unit">{[sizeLine(product), product.unit].filter(Boolean).join(' · ')}</div>}
          <Barcode128 value={product.code} className="pl-bc" height="0.42in" />
          <div className="pl-code">{product.code}</div>
        </div>
        <Qr payload={product.code} className="pl-qr" />
      </div>
    </div>
  );
}

