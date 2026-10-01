// Stock on hand and the "Running low" list, the same way in the sample (worked out from the records on this device)
// and in a live warehouse (counted on the server, so a large warehouse is never downloaded).

import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../../app/state';
import { FirebaseBackend, cloudMessage } from '../../data/firebase';
import type { ProductMemory } from '../../domain/receiving';
import { lowStock, stockByKey, stockOf, type LowRow, type Stock } from '../../domain/stock';

/** Stock per product here: a lookup by product, or null while a live warehouse is still counting. */
export function useProductStock(): ((p: ProductMemory) => Stock | null) {
  const { backend, read, v } = useApp();
  const byKey = useMemo(
    () => (backend instanceof FirebaseBackend ? null : read((e, _a, ws) => stockByKey(Object.values(e.db.pallets).filter((p) => p.workspace_id === ws)))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [v, backend],
  );
  if (backend instanceof FirebaseBackend) return (p) => backend.productStock[p.id] ?? null;
  return (p) => (byKey ? stockOf(p, byKey) : null);
}

/** Products below their minimum here, the emptiest first. Null while a live warehouse has not counted yet. */
export function useLowStock(): LowRow[] | null {
  const { backend, read, v, workspaceId } = useApp();
  return useMemo(
    () => {
      if (backend instanceof FirebaseBackend) return (backend.summary?.low_stock as LowRow[] | undefined) ?? null;
      return read((e, _a, ws) => {
        const products = Object.values(e.db.products).filter((p) => p.workspace_id === ws);
        return lowStock(products, stockByKey(Object.values(e.db.pallets).filter((p) => p.workspace_id === ws)));
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [v, backend, workspaceId, backend instanceof FirebaseBackend ? backend.summary : null],
  );
}

export interface Elsewhere {
  workspace_id: string;
  name: string;
  units: number;
  qty: number;
}

/** Where else a product is in stock: the person's other warehouses in this account. Loaded when asked for. */
export function useStockElsewhere(code: string | null): { rows: Elsewhere[]; loading: boolean; error: string } {
  const { backend, read, v } = useApp();
  const cloud = backend instanceof FirebaseBackend ? backend : null;
  const [live, setLive] = useState<{ rows: Elsewhere[]; loading: boolean; error: string }>({ rows: [], loading: !!cloud, error: '' });
  useEffect(() => {
    if (!cloud || !code) return;
    let alive = true;
    setLive({ rows: [], loading: true, error: '' });
    cloud
      .stockElsewhere(code)
      .then((rows) => alive && setLive({ rows, loading: false, error: '' }))
      .catch((e) => alive && setLive({ rows: [], loading: false, error: cloudMessage(e) }));
    return () => {
      alive = false;
    };
  }, [cloud, code]);
  const demo = useMemo(
    () => (cloud || !code ? null : read((e, a, ws) => e.stockElsewhere(a, ws, code))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [v, cloud, code],
  );
  if (cloud) return live;
  return { rows: demo ?? [], loading: false, error: '' };
}
