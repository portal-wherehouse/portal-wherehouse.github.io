// The tab rows for pages that share one menu item. Each tab is still its own page and link.

import { useApp } from '../app/state';
import { roleAllows } from '../domain/transitions';
import { PageTabs } from './ui';

/** Receive and Incoming (the deliveries you are expecting). */
export function ReceiveTabs() {
  const { backend, workspaceId } = useApp();
  const waiting = Object.values(backend.db.shipments).filter((r) => r.workspace_id === workspaceId && !r.pallet_id).length;
  return (
    <PageTabs
      label="Receiving"
      tabs={[
        { route: 'receive', label: 'Receive' },
        { route: 'incoming', label: 'Incoming', count: waiting },
      ]}
    />
  );
}

/** Spots (locations) and their labels. */
export function SpotsTabs() {
  const { role } = useApp();
  return (
    <PageTabs
      label="Spots and labels"
      tabs={[
        { route: 'locations', label: 'Spots' },
        { route: 'labels', label: 'Labels', hidden: role === 'VIEWER' },
      ]}
    />
  );
}

/** Spreadsheets in and out. */
export function ImportExportTabs() {
  const { role } = useApp();
  return (
    <PageTabs
      label="Import and export"
      tabs={[
        { route: 'import', label: 'Import', hidden: !roleAllows(role, 'import_batch') },
        { route: 'export', label: 'Export', hidden: !roleAllows(role, 'close_job') },
      ]}
    />
  );
}

/** This device's settings, and (for managers in the sample) where the records live. */
export function SettingsTabs() {
  const { role, backend } = useApp();
  const manager = role === 'OWNER' || role === 'SUPERVISOR';
  return (
    <PageTabs
      label="Settings"
      tabs={[
        { route: 'settings', label: 'Settings' },
        { route: 'data', label: 'Data and storage', hidden: !manager || backend.mode === 'firebase' },
      ]}
    />
  );
}
