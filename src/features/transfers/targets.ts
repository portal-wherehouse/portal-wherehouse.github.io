// Where pallets can be sent: the account's other warehouses this person belongs to.

import { useEffect, useState } from 'react';
import { useApp } from '../../app/state';
import { FirebaseBackend, cloudMessage } from '../../data/firebase';

export interface TransferTarget {
  workspace_id: string;
  name: string;
}

/** True when there is a second warehouse to send to, so Transfers belongs in the navigation. */
export function useHasTransferTargets(): boolean {
  const { backend, actorId, workspaceId, read } = useApp();
  if (!actorId || !workspaceId) return false;
  // Live accounts list the person's warehouses; the server checks they belong to the same account.
  if (backend instanceof FirebaseBackend) return backend.workspaceIds.filter((id) => id !== workspaceId).length > 0;
  return (read((e, a, ws) => e.transferTargets(a, ws).length) ?? 0) > 0;
}

/** The warehouses to offer as a destination, loaded once per warehouse. */
export function useTransferTargets(): { targets: TransferTarget[]; loading: boolean; error: string } {
  const { backend, actorId, workspaceId, read, v } = useApp();
  const cloud = backend instanceof FirebaseBackend ? backend : null;
  const [live, setLive] = useState<{ targets: TransferTarget[]; loading: boolean; error: string }>({ targets: [], loading: !!cloud, error: '' });
  useEffect(() => {
    if (!cloud || !workspaceId) return;
    let alive = true;
    setLive({ targets: [], loading: true, error: '' });
    cloud
      .transferTargets()
      .then((targets) => alive && setLive({ targets, loading: false, error: '' }))
      .catch((e) => alive && setLive({ targets: [], loading: false, error: cloudMessage(e) }));
    return () => {
      alive = false;
    };
  }, [cloud, workspaceId, actorId]);
  if (cloud) return live;
  void v;
  return { targets: read((e, a, ws) => e.transferTargets(a, ws)) ?? [], loading: false, error: '' };
}
