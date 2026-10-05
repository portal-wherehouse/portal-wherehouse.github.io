// Tells owners and managers when the warehouse server (the Cloud Functions) is older than this app,
// so a feature that needs the update fails with a reason instead of quietly doing nothing.

import { useApp } from '../../app/state';
import { FirebaseBackend, SERVER_BEHIND_MESSAGE } from '../../data/firebase';
import { Notice } from '../../ui/ui';

export function ServerBehindNotice() {
  const { backend, role } = useApp();
  if (!(backend instanceof FirebaseBackend) || !backend.serverBehind) return null;
  if (role !== 'OWNER' && role !== 'SUPERVISOR') return null;
  return (
    <div data-testid="server-behind">
      <Notice tone="warn" title="The warehouse server needs an update">
        {SERVER_BEHIND_MESSAGE} Everything else keeps working.
      </Notice>
    </div>
  );
}
