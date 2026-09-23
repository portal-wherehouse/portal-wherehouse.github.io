// Welcome: what the app is, in three verbs, and a choice of demo account.

import { useState } from 'react';
import { fixtureInfo } from '../../demo/seed';
import type { Role } from '../../domain/types';
import { useApp } from '../../app/state';
import { IS_PREVIEW } from '../../device/output';
import { Icon } from '../../ui/icons';
import { ROLE_DESC, ROLE_LABEL } from '../../ui/ui';
import { CREATOR } from '../about/About';

export function Welcome() {
  const { backend, signIn, setTourOpen, actorId, go } = useApp();
  const info = fixtureInfo(backend.db, backend.meta.fixture);
  const [pick, setPick] = useState<{ id: string; ws: string } | null>(null);
  const people = backend.db.memberships
    .filter((m) => m.active)
    .map((m) => ({ id: m.user_id, ws: m.workspace_id, name: backend.db.users[m.user_id]?.name ?? m.user_id, role: m.role as Role, company: backend.db.workspaces[m.workspace_id]?.name ?? '' }));
  const priya = people.find((p) => p.id === 'user-priya');

  const start = (withTour: boolean) => {
    const who = withTour ? priya ?? pick : pick;
    if (!who) return;
    signIn(who.id, who.ws);
    if (withTour) setTourOpen(true);
  };

  return (
    <div className="welcome">
      <div className="welcome-hero">
        <div className="eyebrow">Construction material warehouse</div>
        <h1>
          Find any pallet.
          <br />
          Trust the answer.
        </h1>
        <p className="lede">
          Pallet Locator records where every pallet of construction material is, who put it there and when, from a phone on the warehouse floor. Two scans move a pallet. One search finds it.
        </p>
        <div className="row">
          <button className="btn primary big" onClick={() => start(true)} disabled={!priya}>
            <Icon name="tour" /> Take the guided tour
          </button>
          {actorId && (
            <button className="btn big" onClick={() => go('find')}>
              Back to the app
            </button>
          )}
        </div>
      </div>

      <div className="verbs">
        <div className="verb">
          <Icon name="receive" />
          <h3>Receive</h3>
          <p className="muted" style={{ margin: 0 }}>A delivery arrives. Record it against its job and get a labeled pallet code.</p>
        </div>
        <div className="verb">
          <Icon name="move" />
          <h3>Move</h3>
          <p className="muted" style={{ margin: 0 }}>Scan the pallet, then the rack. The record changes only when the server confirms it.</p>
        </div>
        <div className="verb">
          <Icon name="find" />
          <h3>Find</h3>
          <p className="muted" style={{ margin: 0 }}>Search by job, code, rack or description. Results lead with where it is and how sure we are.</p>
        </div>
      </div>

      <div className="stack">
        <div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 28, textTransform: 'uppercase' }}>Choose who you are</h2>
          <p className="muted" style={{ margin: '4px 0 0' }}>Each demo account has a different role, so you can see what each person is allowed to do. No password needed.</p>
        </div>
        <div className="people">
          {people.map((p) => (
            <button key={`${p.ws}:${p.id}`} className="person" aria-pressed={pick?.id === p.id && pick.ws === p.ws} onClick={() => setPick({ id: p.id, ws: p.ws })} onDoubleClick={() => signIn(p.id, p.ws)}>
              <span className="p-role">{ROLE_LABEL[p.role]}</span>
              <span className="p-name">{p.name}</span>
              {info.workspaces.length > 1 && <span className="tag">{p.company}</span>}
              <span className="p-desc">{ROLE_DESC[p.role]}</span>
            </button>
          ))}
        </div>
        <div className="row">
          <button className="btn primary big" disabled={!pick} onClick={() => start(false)}>
            Continue as {pick ? people.find((p) => p.id === pick.id && p.ws === pick.ws)?.name : '…'} <Icon name="chevronRight" />
          </button>
        </div>
      </div>

      <div className="notice info">
        <Icon name="info" />
        <div className="n-body">
          <div className="n-title">This is a working demo, not a mock-up</div>
          <div>
            Every rule from the blueprint runs for real in your browser, and your changes are saved here. The network, sign-in and server are simulated.{IS_PREVIEW ? ' Printing, camera and downloads need the app to be run from its source folder; scanning from a photo works here.' : ''}
          </div>
        </div>
      </div>

      <p className="muted" style={{ textAlign: 'center', fontSize: 14 }}>
        Created by{' '}
        <button className="btn ghost small" style={{ padding: '0 4px', minHeight: 0, fontWeight: 700 }} onClick={() => go('about')}>
          {CREATOR.name}
        </button>{' '}
        ·{' '}
        <a href={CREATOR.linkedin} target="_blank" rel="noopener noreferrer">
          LinkedIn
        </a>{' '}
        · <span style={{ userSelect: 'all' }}>{CREATOR.email}</span>
      </p>
    </div>
  );
}
