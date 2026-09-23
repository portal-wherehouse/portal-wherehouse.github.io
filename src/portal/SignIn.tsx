// Portal front door. PLACEHOLDER: being built (portal entry). Sign-in is off for testing.

import { useApp } from '../app/state';

export function SignIn() {
  const { backend, signIn } = useApp();
  const owner = backend.db.memberships.find((m) => m.active && m.role === 'OWNER');
  return (
    <div style={{ padding: 32 }}>
      <button className="btn primary" onClick={() => owner && signIn(owner.user_id, owner.workspace_id)}>
        Continue to the portal
      </button>
    </div>
  );
}
