// Products: what a barcode means in this warehouse. Scanning a saved product's code on Receive fills in
// its name, unit and category. Your own products can get a code here, printed on a product label.

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

/** A short code for a product that has none: PR- plus six characters that are hard to misread. */
export function newProductCode(taken: (code: string) => boolean): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (;;) {
    const bytes = crypto.getRandomValues(new Uint8Array(6));
    const code = 'PR-' + [...bytes].map((b) => alphabet[b % alphabet.length]).join('');
    if (!taken(code)) return code;
  }
}

export function Products() {
  const { backend, workspaceId, role, route, v } = useApp();
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
  const canEdit = roleAllows(role, 'save_product');

  return (
    <div className="stack">
      <PageHead eyebrow="Warehouse" title="Products" sub="What each barcode means here. Scan a saved product's code on Receive and its details fill in." />
      <Explain title="Products and your own labels">
        <p>A product is something you receive again and again, like a bundle size or a type of wood. Wherehouse remembers it by its barcode: the UPC on the box, a supplier's code, or a code Wherehouse makes for you.</p>
        <p>Selling or storing your own products? Tap New product, let Wherehouse make a code, and print product labels to put on them. Product labels look different from pallet labels on purpose: a pallet label names one pallet, and a product label names what's inside.</p>
      </Explain>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <div className="search-bar" style={{ flex: '1 1 280px' }}>
          <Icon name="find" />
          <label htmlFor="products-q" className="sr-only">
            Search products
          </label>
          <input id="products-q" className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, code or category" autoComplete="off" />
        </div>
        {canEdit && (
          <button className="btn primary" onClick={() => setEditing('new')}>
            <Icon name="plus" /> New product
          </button>
        )}
      </div>
      {products.length === 0 ? (
        <p className="muted">No saved products yet. They're added when someone receives a new barcode with "Save as a product" checked, or here with New product.</p>
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
              </span>
              <span className="muted mono">{p.code}</span>
              <button className="btn small" onClick={() => setPrinting(p)} aria-label={`Print labels for ${p.description}`}>
                <Icon name="print" /> Labels
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
          onSaved={(p) => {
            setEditing(null);
            setPrinting(p);
          }}
        />
      )}
      {printing && <ProductLabelSheet product={printing} onClose={() => setPrinting(null)} />}
    </div>
  );
}

function ProductForm({ product, onClose, onSaved }: { product: ProductMemory | null; onClose: () => void; onSaved: (p: ProductMemory) => void }) {
  const { backend, workspaceId } = useApp();
  const taken = (code: string) => Object.values(backend.db.products).some((p) => p.workspace_id === workspaceId && p.code.toUpperCase() === code.toUpperCase());
  const [code, setCode] = useState(product?.code ?? '');
  const [description, setDescription] = useState(product?.description ?? '');
  const [unit, setUnit] = useState(product?.unit ?? '');
  const [category, setCategory] = useState(product?.category ?? '');
  const cmd = useCommand();
  const categories = [...new Set(Object.values(backend.db.products).map((p) => p.category ?? '').filter(Boolean))].sort();
  const save = async () => {
    const r = await cmd.run('save_product', { code: code.trim(), description: description.trim(), unit: unit.trim(), category: category.trim(), ...(product ? {} : { create: true }) });
    if (r.phase === 'done') {
      const id = r.accepted?.target_id ?? '';
      onSaved(backend.db.products[id] ?? { id, workspace_id: workspaceId!, warehouse_id: '', code: code.trim(), description: description.trim(), unit: unit.trim(), category: category.trim(), field_names: [], updated_at: new Date().toISOString() });
    }
  };
  return (
    <Sheet title={product ? `Edit ${product.description}` : 'New product'} onClose={onClose}>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Field label="Product name" htmlFor="prod-name" count={description.length} max={160}>
          <input id="prod-name" className="input" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={160} placeholder="e.g. Campfire bundle, 0.75 cu ft" autoFocus />
        </Field>
        <Field label="Barcode or code" htmlFor="prod-code" hint={product ? "The code is how Wherehouse recognizes this product, so it can't change. Make a new product for a new code." : 'Type or scan the UPC or supplier code, or let Wherehouse make one for your own products.'}>
          <div className="row nowrap">
            <input id="prod-code" className="input mono" value={code} onChange={(e) => setCode(e.target.value)} maxLength={80} disabled={!!product} placeholder="012345678905 or PR-…" />
            {!product && (
              <button type="button" className="btn" onClick={() => setCode(newProductCode(taken))}>
                Make a code
              </button>
            )}
          </div>
        </Field>
        <div className="grid-2">
          <Field label="Unit (optional)" htmlFor="prod-unit">
            <input id="prod-unit" className="input" value={unit} onChange={(e) => setUnit(e.target.value)} maxLength={40} placeholder="bundles, bags, cases…" />
          </Field>
          <Field label="Category (optional)" htmlFor="prod-category">
            <input id="prod-category" className="input" value={category} onChange={(e) => setCategory(e.target.value)} maxLength={60} placeholder="Hardwood, Kindling…" list="prod-category-suggest" />
            <datalist id="prod-category-suggest">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
        </div>
        <CommandFeedback state={cmd.state} onRecover={() => void cmd.recover()} />
        <button className="btn primary big" disabled={!code.trim() || !description.trim() || cmd.busy || backend.network === 'offline'}>
          {cmd.busy ? <Spinner /> : <Icon name="check" />} {product ? 'Save changes' : 'Save and print labels'}
        </button>
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
    <Sheet title={`Product label: ${product.description}`} onClose={onClose} wide>
      <div className="stack">
        <div className="seg" role="group" aria-label="Label size">
          <button aria-pressed={format === '4x2'} onClick={() => setFormat('4x2')}>
            4 × 2 in label
          </button>
          <button aria-pressed={format === 'sheet'} onClick={() => setFormat('sheet')}>
            Letter sheet, 10 per page
          </button>
        </div>
        <Field label="How many" htmlFor="prod-copies" hint="One label per box, bag or bundle.">
          <input id="prod-copies" className="input" type="number" min={1} max={100} value={copies} onChange={(e) => setCopies(Number(e.target.value))} style={{ maxWidth: 120 }} />
        </Field>
        <div className="product-label-grid">
          <ProductLabel product={product} />
        </div>
        <p className="muted" style={{ fontSize: 13.5, margin: 0 }}>
          Both codes hold {product.code}. Scanning either one on Receive fills in this product. Product labels name what's inside, so they never replace a pallet's own Wherehouse label.
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

/** Deliberately unlike a pallet label: landscape, a dark "PRODUCT" band, the name first and no P-code. */
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
          {product.unit && <div className="pl-unit">Sold by: {product.unit}</div>}
          <Barcode128 value={product.code} className="pl-bc" height="0.42in" />
          <div className="pl-code">{product.code}</div>
        </div>
        <Qr payload={product.code} className="pl-qr" />
      </div>
    </div>
  );
}

