// The sample's kind of business, at the top of every sample page. Switching loads that business's sample and keeps
// the same view (management or employee) and the same screen where it still exists.

import { useState } from 'react';
import { useApp, type Route, type RouteName } from '../app/state';
import { INDUSTRIES, industry, type IndustryId } from '../demo/industries';
import { Icon } from '../ui/icons';

/** Detail screens go back to their list: the record they showed is not in the other sample. */
const LIST_OF: Partial<Record<RouteName, RouteName>> = { pallet: 'find', job: 'jobs', location: 'locations', order: 'orders', transfer: 'transfers' };

export function sameScreen(route: Route): Route {
  const list = LIST_OF[route.name];
  if (list) return { name: list };
  return route.q ? { name: route.name, q: route.q } : { name: route.name };
}

/** Keep ?kind= in the address, so a refresh or a shared link opens the same business. */
export function rememberKind(kind: IndustryId) {
  try {
    const url = new URL(location.href);
    if (url.searchParams.get('kind') === kind) return;
    url.searchParams.set('kind', kind);
    history.replaceState(history.state, '', url);
  } catch {
    /* the sample still switched; only the address is unchanged */
  }
}

export function SampleSwitcher() {
  const { backend, actorId, workspaceId, route, signIn, go, toast } = useApp();
  const [busy, setBusy] = useState(false);
  if (!backend.sampleMode || backend.meta.fixture === 'fresh') return null;
  const current = backend.industry;

  const switchTo = async (kind: IndustryId) => {
    if (kind === current || busy) return;
    setBusy(true);
    // The same warehouse (main or second) and the same person, so the view stays the same.
    const whCode = Object.values(backend.db.warehouses).find((w) => w.workspace_id === workspaceId)?.code;
    const here = sameScreen(route);
    try {
      await backend.reset('tiny', kind);
      for (const key of ['pl.tour.start', 'pl.tour.found']) localStorage.removeItem(key);
    } catch {
      /* storage notes only */
    }
    rememberKind(kind);
    const db = backend.db;
    const mine = db.memberships.filter((m) => m.active && m.user_id === actorId);
    const codeOf = (ws: string) => Object.values(db.warehouses).find((w) => w.workspace_id === ws)?.code;
    const m = mine.find((x) => codeOf(x.workspace_id) === whCode) ?? mine[0];
    if (m) {
      signIn(m.user_id, m.workspace_id);
      go(here);
    }
    setBusy(false);
    toast(`Now showing the sample for a ${industry(kind).your}`, 'info');
  };

  return (
    <label className="demo-kind">
      <span className="demo-kind-label">Sample for</span>
      <span className="demo-kind-select">
        <select aria-label="Sample business" value={current} disabled={busy} onChange={(e) => void switchTo(e.target.value as IndustryId)} data-testid="sample-kind">
          {INDUSTRIES.map((i) => (
            <option key={i.id} value={i.id}>
              {i.title}
            </option>
          ))}
        </select>
        <Icon name="chevronDown" />
      </span>
    </label>
  );
}
