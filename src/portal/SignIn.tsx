// Portal front door: a short "taking you to the portal" moment, then the sign-in card (off while
// we test) and a role picker that lets anyone continue straight in with a demo account.

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { BRAND } from '../brand';
import { useApp } from '../app/state';
import type { Role } from '../domain/types';
import { NAV_GROUPS } from '../features/more/More';
import { BrandMark, Icon, type IconName } from '../ui/icons';
import { ROLE_DESC, ROLE_LABEL } from '../ui/ui';
import './signin.css';

const ROLE_ORDER: Role[] = ['OWNER', 'SUPERVISOR', 'OPERATOR', 'VIEWER'];
const ROLE_ICON: Record<Role, IconName> = { OWNER: 'key', SUPERVISOR: 'checklist', OPERATOR: 'scanner', VIEWER: 'eye' };

interface Choice {
  key: string;
  userId: string;
  workspaceId: string;
  role: Role;
  /** A second company, shown apart from the main role list. */
  second?: string;
}

export function SignIn() { return <FrontDoor />; }

function FrontDoor() {
  const { backend, v, route, go, signIn, actorId, workspaceId, role } = useApp();
  const heading = useRef<HTMLHeadingElement>(null);

  const choices = useMemo(() => {
    const active = backend.db.memberships.filter((m) => m.active);
    const main = active.find((m) => m.user_id === 'user-owner')?.workspace_id ?? active.find((m) => m.role === 'OWNER')?.workspace_id ?? active[0]?.workspace_id;
    const list: Choice[] = [];
    for (const r of ROLE_ORDER) {
      const m = active.find((x) => x.workspace_id === main && x.role === r);
      if (m) list.push({ key: `${m.workspace_id}:${m.user_id}`, userId: m.user_id, workspaceId: m.workspace_id, role: r });
    }
    // The busy sample data adds a second company (Second sample warehouse) to show that companies stay apart.
    const other = active.find((m) => m.workspace_id !== main && m.role === 'OWNER');
    if (other) {
      list.push({ key: `${other.workspace_id}:${other.user_id}`, userId: other.user_id, workspaceId: other.workspace_id, role: 'OWNER', second: backend.db.workspaces[other.workspace_id]?.name ?? 'Second company' });
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backend, v]);

  const [picked, setPicked] = useState<string>(() => choices.find((c) => c.role === 'OPERATOR' && !c.second)?.key ?? choices[0]?.key ?? '');
  const mainChoices = choices.filter((c) => !c.second);
  const secondChoices = choices.filter((c) => c.second);
  const mainName = mainChoices[0] ? backend.db.workspaces[mainChoices[0].workspaceId]?.name : null;

  // A portal link opened without an account lands here; after choosing a role, carry on to it.
  const target = route.name === 'signin' ? null : route;
  const targetLabel = target ? NAV_GROUPS.flatMap((g) => g.items).find((i) => i.route === target.name)?.label : null;

  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, []);

  const enter = (userId: string, ws: string) => {
    signIn(userId, ws);
    if (target) go(target);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const c = choices.find((x) => x.key === picked);
    if (c) enter(c.userId, c.workspaceId);
  };

  const signedIn = !!(actorId && workspaceId && role);
  const signedInCompany = signedIn ? backend.db.workspaces[workspaceId!]?.name : null;

  return (
    <div className="door customer-app">
      <aside className="door-side">
        <div className="door-side-top">
          <button className="door-brand" onClick={() => go('home')} aria-label={`${BRAND.name} website home`}>
            <BrandMark className="door-brand-mark" />
            <span className="door-brand-name">{BRAND.name}</span>
            <span className="door-brand-sub">Sample</span>
          </button>
          <button className="door-back door-back-top" onClick={() => go('home')} aria-label="Back to the website">
            <Icon name="chevronLeft" />
            <span className="door-back-full">Back to the website</span>
            <span className="door-back-short">Website</span>
          </button>
        </div>
        <div className="door-side-body">
          <a href={`${location.pathname}#signin`} className="site-link">Already a customer? Sign in to your warehouse →</a>
          <h1 className="door-title" ref={heading} tabIndex={-1}>
            Sample warehouse
          </h1>
          <p className="door-lede">Receive deliveries, move pallets with two scans, and find anything by job, code or rack.</p>
          <ul className="door-facts">
            <li>
              <Icon name="database" />
              <span>A sample yard with jobs, racks and pallets is ready to use.</span>
            </li>
            <li>
              <Icon name="lock" />
              <span>The sample data lives in this browser only. Changes here touch nothing real.</span>
            </li>
            <li>
              <Icon name="refresh" />
              <span>Reset the sample data any time from Settings.</span>
            </li>
          </ul>
        </div>
        <div className="door-stripe" aria-hidden="true" />
      </aside>

      <main className="door-main" id="main">
        <div className="door-main-inner">
          {signedIn && (
            <section className="door-card door-resume" aria-labelledby="door-resume-h">
              <div className="door-resume-text">
                <h2 id="door-resume-h">You are already in</h2>
                <p>
                  Using the {ROLE_LABEL[role!]} account{signedInCompany ? ` at ${signedInCompany}` : ''}.
                </p>
              </div>
              <button className="btn primary" onClick={() => enter(actorId!, workspaceId!)}>
                Continue as {ROLE_LABEL[role!]}
                <Icon name="arrowRight" />
              </button>
            </section>
          )}

          <section className="door-card door-test" aria-labelledby="door-test-h">
            <div className="door-test-head">
              <span className="door-test-icon">
                <Icon name="unlock" />
              </span>
              <h2 id="door-test-h">Explore the sample warehouse</h2>
              <p>
                Pick a role to see what it can do{mainName ? ` at ${mainName}, the sample company` : ''}. These are simulated roles, not real accounts. Switch roles any time from the top bar.
              </p>
            </div>

            <form onSubmit={submit}>
              <fieldset className="door-roles">
                <legend>Choose a role</legend>
                {mainChoices.map((c) => (
                  <RoleCard key={c.key} choice={c} checked={picked === c.key} onPick={setPicked} />
                ))}
              </fieldset>

              {secondChoices.length > 0 && (
                <fieldset className="door-roles door-roles-second">
                  <legend>Or try the second company</legend>
                  {secondChoices.map((c) => (
                    <RoleCard key={c.key} choice={c} checked={picked === c.key} onPick={setPicked} />
                  ))}
                </fieldset>
              )}

              <button type="submit" className="btn primary big block door-go" disabled={!picked}>
                Continue to the portal
                <Icon name="arrowRight" />
              </button>
              {targetLabel && <p className="door-then">Then we will open {targetLabel}, the page you asked for.</p>}
            </form>
          </section>

          <p className="door-note">This sample is separate from customer accounts. Its practice records stay in this browser.</p>

          <nav className="door-links" aria-label="Leave the portal">
            <button className="door-back" onClick={() => go('home')}>
              <Icon name="chevronLeft" />
              Back to the website
            </button>
            <span className="door-new">
              New to {BRAND.name}?{' '}
              <button className="door-link" onClick={() => go('pricing')}>
                See pricing
              </button>
            </span>
          </nav>
        </div>
      </main>
    </div>
  );
}

function RoleCard({ choice, checked, onPick }: { choice: Choice; checked: boolean; onPick: (key: string) => void }) {
  const id = `door-role-${choice.key.replace(/[^a-z0-9-]/gi, '-')}`;
  return (
    <label className="door-role" htmlFor={id} data-checked={checked || undefined}>
      <input id={id} className="door-role-input" type="radio" name="door-role" value={choice.key} checked={checked} onChange={() => onPick(choice.key)} />
      <span className="door-role-icon" aria-hidden="true">
        <Icon name={choice.second ? 'building' : ROLE_ICON[choice.role]} />
      </span>
      <span className="door-role-text">
        {choice.second ? (
          <>
            <span className="door-role-name">
              {choice.second} <span className="door-role-tag">Second company, {ROLE_LABEL[choice.role]}</span>
            </span>
            <span className="door-role-desc">A separate company with its own jobs and racks. It never sees the main yard’s records.</span>
          </>
        ) : (
          <>
            <span className="door-role-name">{ROLE_LABEL[choice.role]}</span>
            <span className="door-role-desc">{ROLE_DESC[choice.role]}</span>
          </>
        )}
      </span>
      <span className="door-role-check" aria-hidden="true">
        <Icon name="check" />
      </span>
    </label>
  );
}
