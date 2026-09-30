// People and access (pages 5, 9, 20): who can do what, invitations, role changes, removal, and the admin audit log.

import { useMemo, useState } from 'react';
import { COMMAND_LABEL, ROLE_RANK, roleAllows } from '../../domain/transitions';
import type { AdminAudit, Role } from '../../domain/types';
import { useApp } from '../../app/state';
import { Icon } from '../../ui/icons';
import { Avatar, Explain, Field, PageHead, ROLE_DESC, ROLE_LABEL, fmtAgo, fmtFull } from '../../ui/ui';
import { AuthorizedEmails } from './AuthorizedEmails';
import { AdminSheet } from './AdminSheet';

const ROLES: Role[] = ['OWNER', 'SUPERVISOR', 'OPERATOR', 'VIEWER'];

export function People() {
  const { read, role, actorId, signIn, backend, v, go } = useApp();
  const [invite, setInvite] = useState(false);
  const [change, setChange] = useState<{ userId: string; name: string; role: Role } | null>(null);
  const [remove, setRemove] = useState<{ userId: string; name: string } | null>(null);
  const data = useMemo(
    () =>
      read((e, a, ws) => {
        const ctx = e.context(a, ws);
        const audit = roleAllows(ctx.role, 'invite_member') ? e.auditLog(a, ws) : [];
        return { ctx, audit };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [v, backend.network],
  );
  if (!data) return null;
  const members = data.ctx.members.filter((m) => m.active).sort((a, b) => ROLE_RANK[b.role] - ROLE_RANK[a.role] || a.user.name.localeCompare(b.user.name));
  const removed = data.ctx.members.filter((m) => !m.active);
  const canAdmin = roleAllows(role, 'invite_member');
  const isOwner = role === 'OWNER';
  const offline = backend.network === 'offline';
  const manageable = (target: Role) => canAdmin && (isOwner || target !== 'OWNER');

  return (
    <div className="stack">
      <PageHead
        title="Manager dashboard"
        sub={`${members.length} ${members.length === 1 ? 'person has' : 'people have'} access to ${data.ctx.workspace.name}.`}
        actions={
          canAdmin && backend.mode === 'demo' && (
            <button className="btn primary" onClick={() => setInvite(true)} disabled={offline}>
              <Icon name="plus" /> Add teammate
            </button>
          )
        }
      />
      {canAdmin && <div className="manager-shortcuts"><button className="btn" onClick={()=>go('overview')}>Warehouse overview</button><button className="btn" onClick={()=>go('locations')}>Racks & locations</button><button className="btn" onClick={()=>go('labels')}>Print labels</button><button className="btn" onClick={()=>go('activity')}>Movement log</button></div>}
      {canAdmin && backend.mode === 'firebase' && <AuthorizedEmails />}
      <h2 className="panel-title">Your team</h2>
      <Explain refs="pages 5, 9, 20">
        <p>Access belongs to a membership in the company, and the server checks it on every read and every change. A removed person loses access on their very next request, even if their phone still shows the app. Only owners can grant or change owner access, and a company always keeps at least one owner.</p>
        <p>Each teammate needs their own account. Managers choose who can view or change warehouse records.</p>
      </Explain>

      <div className="stack" data-tour="people-list">
        {members.map((m) => (
          <div key={m.user_id} className="panel member">
            <Avatar name={m.user.name} />
            <div className="m-who">
              <div style={{ fontWeight: 700 }}>
                {m.user.name} {m.user_id === actorId && <span className="tag accent">you</span>}
              </div>
              <div className="muted m-email" style={{ fontSize: 13.5 }}>
                {m.user.email}
              </div>
            </div>
            <div className="m-role">
              <div style={{ fontWeight: 700 }}>{ROLE_LABEL[m.role]}</div>
              <div className="muted" style={{ fontSize: 12.5 }}>
                {ROLE_DESC[m.role]}
              </div>
            </div>
            <div className="row m-actions" style={{ gap: 6 }}>
              {backend.mode === 'demo' && m.user_id !== actorId && (
                <button className="btn small" onClick={() => signIn(m.user_id, data.ctx.workspace.id)} title="Demo only: switch to this account">
                  <Icon name="user" /> Sign in as
                </button>
              )}
              {manageable(m.role) && m.user_id !== actorId && (
                <>
                  <button className="btn small" onClick={() => setChange({ userId: m.user_id, name: m.user.name, role: m.role })} disabled={offline}>
                    <Icon name="swap" /> Role
                  </button>
                  <button className="btn small danger" onClick={() => setRemove({ userId: m.user_id, name: m.user.name })} disabled={offline}>
                    <Icon name="trash" /> Remove
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
      {removed.length > 0 && (
        <p className="muted" style={{ fontSize: 13.5 }}>
          Removed: {removed.map((m) => m.user.name).join(', ')}. Their past actions stay in history under their name.
        </p>
      )}

      <div className="panel flush">
        <div className="panel-title" style={{ padding: '14px 16px 6px' }}>
          What each role can do
        </div>
        <RoleMatrix />
      </div>

      {canAdmin && (
        <div className="panel stack">
          <div className="panel-title">Admin audit log</div>
          {data.audit.length === 0 ? <p className="muted">No admin changes yet.</p> : <AuditList entries={data.audit.slice(0, 40)} />}
        </div>
      )}

      {invite && <InviteSheet isOwner={isOwner} onClose={() => setInvite(false)} />}
      {change && <RoleSheet target={change} isOwner={isOwner} onClose={() => setChange(null)} />}
      {remove && (
        <AdminSheet
          title={`Remove ${remove.name}`}
          kind="remove_member"
          verb="Remove access"
          done={`${remove.name} no longer has access`}
          danger
          reason="optional"
          intro="They lose access on their next request. Their history stays. You can invite them again later."
          payload={() => ({ user_id: remove.userId })}
          onClose={() => setRemove(null)}
        />
      )}
    </div>
  );
}

function InviteSheet({ isOwner, onClose }: { isOwner: boolean; onClose: () => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [emailTouched, setEmailTouched] = useState(false);
  const [role, setRole] = useState<Role>('OPERATOR');
  const allowed = ROLES.filter((r) => isOwner || r !== 'OWNER');
  const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
  return (
    <AdminSheet
      title="Add teammate"
      kind="invite_member"
      verb="Add teammate"
      done={`${email.trim()} added as ${ROLE_LABEL[role]}`}
      intro="Ask your teammate to create an account and verify their email, then enter that email here. Adding them grants access; no invitation email is sent."
      valid={!!name.trim() && emailOk}
      payload={() => ({ name, email, role })}
      onClose={onClose}
    >
      <Field label="Name" htmlFor="inv-name">
        <input id="inv-name" className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Email" htmlFor="inv-email" hint={emailTouched && !emailOk ? <span className="field-err">Enter a full email address, like name@company.com.</span> : undefined}>
        <input
          id="inv-email"
          className="input"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onBlur={() => setEmailTouched(true)}
          aria-invalid={emailTouched && !emailOk}
          placeholder="name@company.example"
        />
      </Field>
      <Field label="Role" htmlFor="inv-role" hint={ROLE_DESC[role]}>
        <select id="inv-role" className="select" value={role} onChange={(e) => setRole(e.target.value as Role)}>
          {allowed.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </select>
      </Field>
      {!isOwner && <p className="muted" style={{ fontSize: 13 }}>Only an owner can grant owner access.</p>}
    </AdminSheet>
  );
}

function RoleSheet({ target, isOwner, onClose }: { target: { userId: string; name: string; role: Role }; isOwner: boolean; onClose: () => void }) {
  const allowed = ROLES.filter((r) => isOwner || r !== 'OWNER');
  const [role, setRole] = useState<Role>(allowed.find((r) => r !== target.role) ?? target.role);
  return (
    <AdminSheet
      title={`Change ${target.name}'s role`}
      kind="change_role"
      verb="Change role"
      done={`${target.name} is now ${ROLE_LABEL[role]}`}
      reason="optional"
      valid={role !== target.role}
      intro={`Currently ${ROLE_LABEL[target.role]}. The change applies on their next request.`}
      payload={() => ({ user_id: target.userId, role })}
      onClose={onClose}
    >
      <Field label="New role" htmlFor="role-new" hint={ROLE_DESC[role]}>
        <select id="role-new" className="select" value={role} onChange={(e) => setRole(e.target.value as Role)}>
          {allowed.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </select>
      </Field>
    </AdminSheet>
  );
}

const MATRIX: { what: string; min: Role }[] = [
  { what: 'Search, view pallets, history and the map', min: 'VIEWER' },
  { what: 'Receive, place, move, verify, dispatch, return', min: 'OPERATOR' },
  { what: 'Mark missing, apply a hold, edit details, add photos', min: 'OPERATOR' },
  { what: 'Clear holds, record where a missing pallet was found', min: 'SUPERVISOR' },
  { what: 'Correct history, change job, split, retire, replace labels', min: 'SUPERVISOR' },
  { what: 'Manage jobs and locations, import, export', min: 'SUPERVISOR' },
  { what: 'Authorize employees and managers', min: 'SUPERVISOR' },
  { what: 'Grant owner access', min: 'OWNER' },
];

export function RoleMatrix() {
  return (
    <div className="table-wrap" style={{ border: 0, borderRadius: 0 }}>
      <table className="t cards-sm role-matrix">
        <thead>
          <tr>
            <th>Action</th>
            {[...ROLES].reverse().map((r) => (
              <th key={r} style={{ textAlign: 'center' }}>
                {ROLE_LABEL[r]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {MATRIX.map((m) => (
            <tr key={m.what}>
              <td className="lead">{m.what}</td>
              {[...ROLES].reverse().map((r) => {
                const yes = ROLE_RANK[r] >= ROLE_RANK[m.min];
                return (
                  <td key={r} data-label={ROLE_LABEL[r]} style={{ textAlign: 'center', color: yes ? 'var(--ok)' : 'var(--ink-3)' }}>
                    {yes ? <Icon name="check" /> : '–'}
                    <span className="sr-only">{yes ? 'Yes' : 'No'}</span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AuditList({ entries }: { entries: AdminAudit[] }) {
  const { backend } = useApp();
  const users = backend.db.users;
  const target = (a: AdminAudit) => backend.db.jobs[a.target_id]?.code ?? backend.db.locations[a.target_id]?.code ?? users[a.target_id]?.name ?? (a.action === 'import_batch' || a.action === 'rename_import' ? (backend.db.imports[a.target_id]?.name ?? `batch ${a.target_id.slice(0, 8)}`) : '');
  const change = (a: AdminAudit) => {
    const b = a.before ?? {};
    const af = a.after ?? {};
    const keys = Object.keys(af).filter((k) => JSON.stringify(b[k]) !== JSON.stringify(af[k]));
    return keys.map((k) => (k in b ? `${k}: ${String(b[k])} → ${String(af[k])}` : `${k}: ${String(af[k])}`)).join(', ');
  };
  return (
    <div className="table-wrap">
      <table className="t cards-sm" style={{ fontSize: 13.5 }}>
        <thead>
          <tr>
            <th>When</th>
            <th>Who</th>
            <th>What</th>
            <th>Change</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((a) => (
            <tr key={a.id}>
              <td title={fmtFull(a.accepted_at)} style={{ whiteSpace: 'nowrap' }}>
                {fmtAgo(a.accepted_at)}
              </td>
              <td>{users[a.actor_id]?.name}</td>
              <td className="lead">
                <strong>{COMMAND_LABEL[a.action]}</strong> {target(a)}
              </td>
              <td className="muted lead">
                {change(a)}
                {a.reason ? ` · “${a.reason}”` : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
