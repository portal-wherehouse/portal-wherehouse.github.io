// App shell: demo strip, top bar, navigation, the current screen, and the sheets that sit above it.

import { useEffect, useRef, useState } from 'react';
import { useApp, type RouteName } from './state';
import { IS_PREVIEW } from '../device/output';
import { BrandMark, Icon } from '../ui/icons';
import { Avatar, Empty, ROLE_DESC, ROLE_LABEL, Sheet, Toasts, fmtTime } from '../ui/ui';
import { About } from '../features/about/About';
import { Activity } from '../features/activity/Activity';
import { Export } from '../features/admin/Export';
import { Import } from '../features/admin/Import';
import { JobDetail, Jobs } from '../features/admin/Jobs';
import { LocationDetail, Locations } from '../features/admin/Locations';
import { People } from '../features/admin/People';
import { Reconcile } from '../features/admin/Reconcile';
import { Find } from '../features/find/Find';
import { Guide } from '../features/guide/Guide';
import { Lab } from '../features/lab/Lab';
import { LabelStudio } from '../features/labels/LabelStudio';
import { WarehouseMap } from '../features/map/WarehouseMap';
import { More, NAV_GROUPS } from '../features/more/More';
import { Move } from '../features/move/Move';
import { Overview } from '../features/overview/Overview';
import { PalletRecord } from '../features/pallet/PalletRecord';
import { Receive } from '../features/receive/Receive';
import { Settings } from '../features/settings/Settings';
import { Sync } from '../features/sync/Sync';
import { Tour } from '../features/tour/Tour';
import { Welcome } from '../features/welcome/Welcome';

const SCREENS: Record<RouteName, () => React.ReactNode> = {
  welcome: Welcome,
  receive: Receive,
  move: Move,
  find: Find,
  pallet: PalletRecord,
  overview: Overview,
  map: WarehouseMap,
  activity: Activity,
  reconcile: Reconcile,
  jobs: Jobs,
  job: JobDetail,
  locations: Locations,
  location: LocationDetail,
  labels: LabelStudio,
  import: Import,
  export: Export,
  people: People,
  sync: Sync,
  lab: Lab,
  guide: Guide,
  settings: Settings,
  about: About,
  more: More,
};

/** Screens that make sense before choosing an account. */
const PUBLIC: RouteName[] = ['welcome', 'about', 'guide'];

const TABS: { route: RouteName; label: string; icon: 'receive' | 'move' | 'find' | 'more' }[] = [
  { route: 'receive', label: 'Receive', icon: 'receive' },
  { route: 'move', label: 'Move', icon: 'move' },
  { route: 'find', label: 'Find', icon: 'find' },
  { route: 'more', label: 'More', icon: 'more' },
];

/** Which top-level tab a detail screen belongs to, for highlighting. */
function tabFor(name: RouteName): RouteName {
  if (name === 'pallet') return 'find';
  if (['receive', 'move', 'find'].includes(name)) return name;
  return 'more';
}

export function App() {
  const app = useApp();
  const { route, actorId, workspaceId, role, backend, go, blockedNav, tourOpen, setTourOpen, toast, read } = app;
  const [account, setAccount] = useState(false);
  const signedIn = !!actorId;
  const offline = backend.network === 'offline';

  // Replay the offline queue as soon as the connection comes back (page 24).
  const wasOffline = useRef(offline);
  useEffect(() => {
    if (wasOffline.current && !offline && actorId && workspaceId && backend.outbox.pending(actorId, workspaceId).some((e) => e.status === 'queued')) {
      void backend.sync(actorId, workspaceId).then((s) => {
        if (!s) return;
        if (s.conflicts || s.blocked) toast(`Back online: ${s.acknowledged} saved, ${s.conflicts + s.blocked} need your decision in Sync`, 'error');
        else if (s.acknowledged) toast(`Back online: ${s.acknowledged} queued ${s.acknowledged === 1 ? 'change' : 'changes'} saved`);
      });
    }
    wasOffline.current = offline;
  }, [offline, actorId, workspaceId, backend, toast]);

  const ctx = read((e, a, ws) => e.context(a, ws));
  const counts = read((e, a, ws) => {
    const r = e.reconciliation(a, ws);
    return { reconcile: r.unplaced.length + r.missing.length + r.holds.length + r.reprint.length };
  });
  const pending = actorId && workspaceId ? backend.outbox.pending(actorId, workspaceId).length + backend.pendingFor(actorId, workspaceId).length : 0;
  const needsDecision = actorId && workspaceId ? backend.outbox.pending(actorId, workspaceId).filter((e) => e.status === 'conflict' || e.status === 'blocked').length : 0;

  const name = signedIn ? route.name : PUBLIC.includes(route.name) ? route.name : 'welcome';
  const Screen = SCREENS[name];
  const removed = signedIn && !role && !PUBLIC.includes(route.name);
  const me = actorId ? backend.db.users[actorId] : null;
  const myWorkspaces = actorId ? backend.db.memberships.filter((m) => m.user_id === actorId && m.active) : [];

  return (
    <div className="shell">
      <div className="demo-strip" role="note">
        <strong>DEMO</strong>
        <span className="grow">
          {IS_PREVIEW ? 'Hosted preview. ' : ''}Server, sign-in and network are simulated in this browser{me && role ? `. You are ${me.name} (${ROLE_LABEL[role]})` : ''}.
        </span>
        {signedIn && (
          <button onClick={() => setAccount(true)} aria-label="Switch demo account">
            Switch
          </button>
        )}
        {signedIn && !tourOpen && <button onClick={() => setTourOpen(true)}>Tour</button>}
      </div>

      <header className="topbar">
        <button className="brand" onClick={() => go(signedIn ? app.prefs.startTab : 'welcome')} aria-label="Pallet Locator home">
          <BrandMark className="brand-mark" />
          <span className="brand-name">Pallet Locator</span>
        </button>
        <span className="spacer" />
        {signedIn && ctx && (
          <>
            {ctx.warehouse && (
              <span className="chip static wh-chip" title={`${ctx.workspace.name} · ${ctx.warehouse.name}`}>
                <Icon name="locations" /> {ctx.warehouse.code}
              </span>
            )}
            <button className={`chip ${offline ? 'offline' : ''}`} onClick={() => go('sync')} title={offline ? `Offline. Showing what this device cached at ${fmtTime(backend.cache?.at)}` : 'Online'}>
              {offline ? <Icon name="wifiOff" /> : <span className="dot" />}
              <span className="net-label">{offline ? 'Offline' : 'Online'}</span>
              {pending > 0 && <span className="tag warn" style={{ marginLeft: 2 }}>{pending}</span>}
            </button>
          </>
        )}
        {me ? (
          <button className="chip" onClick={() => setAccount(true)} aria-label={`Account: ${me.name}`}>
            <Avatar name={me.name} />
            <span className="acct-name">{me.name.split(' ')[0]}</span>
          </button>
        ) : (
          <button className="chip" onClick={() => go('welcome')}>
            <Icon name="user" /> Choose account
          </button>
        )}
      </header>

      {offline && signedIn && (
        <div className="notice warn" style={{ borderRadius: 0, borderLeft: 0, borderRight: 0, margin: 0 }} role="status">
          <Icon name="wifiOff" />
          <div className="n-body">
            <strong>Offline.</strong> Showing what this device last knew, cached at {fmtTime(backend.cache?.at)}. Moves and location checks will be queued; everything else waits for the connection.{' '}
            <button className="btn ghost small" style={{ minHeight: 0, padding: '0 4px' }} onClick={() => backend.setNetwork('online')}>
              Reconnect
            </button>
          </div>
        </div>
      )}

      <div className={signedIn ? 'body' : 'body no-side'}>
        {signedIn && (
          <nav className="sidebar" aria-label="Main">
            {NAV_GROUPS.map((g) => (
              <div key={g.title} className="nav-group">
                <h4>{g.title}</h4>
                {g.items.map((i) => {
                  const current = route.name === i.route || (i.route === 'find' && route.name === 'pallet') || (i.route === 'jobs' && route.name === 'job') || (i.route === 'locations' && route.name === 'location');
                  const count = i.route === 'reconcile' ? counts?.reconcile : i.route === 'sync' ? pending : undefined;
                  return (
                    <button key={i.route} className="nav-item" aria-current={current ? 'page' : undefined} onClick={() => go(i.route)}>
                      <Icon name={i.icon} />
                      {i.label}
                      {!!count && <span className={`count ${i.route === 'sync' && needsDecision ? 'alert' : ''}`}>{count}</span>}
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>
        )}
        <main className="main" id="main" style={signedIn ? undefined : { maxWidth: 980 }}>
          {removed ? <RemovedAccess /> : <Screen key={`${route.name}:${route.id ?? ''}`} />}
        </main>
      </div>

      {signedIn && (
        <nav className="bottom-nav" aria-label="Main">
          {TABS.map((t) => (
            <button key={t.route} aria-current={tabFor(route.name) === t.route ? 'page' : undefined} onClick={() => go(t.route)}>
              <Icon name={t.icon} />
              {t.label}
              {t.route === 'more' && needsDecision > 0 && <span className="badge-count">{needsDecision}</span>}
            </button>
          ))}
        </nav>
      )}

      {account && me && (
        <Sheet title="Demo accounts" onClose={() => setAccount(false)}>
          <div className="stack">
            <p className="muted" style={{ margin: 0, fontSize: 14 }}>
              Switch to see what another role can do. In the real app, each person signs in with their own email.
            </p>
            {myWorkspaces.length > 1 && (
              <div className="stack" style={{ gap: 6 }}>
                <strong>Your companies</strong>
                <div className="row">
                  {myWorkspaces.map((m) => (
                    <button key={m.workspace_id} className={`btn small ${m.workspace_id === workspaceId ? 'primary' : ''}`} onClick={() => (app.setWorkspace(m.workspace_id), setAccount(false))}>
                      {backend.db.workspaces[m.workspace_id]?.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="people">
              {backend.db.memberships
                .filter((m) => m.active)
                .map((m) => {
                  const u = backend.db.users[m.user_id];
                  const here = m.user_id === actorId && m.workspace_id === workspaceId;
                  return (
                    <button
                      key={`${m.workspace_id}:${m.user_id}`}
                      className="person"
                      aria-pressed={here}
                      onClick={() => {
                        app.signIn(m.user_id, m.workspace_id);
                        setAccount(false);
                        toast(`Now signed in as ${u?.name} (${ROLE_LABEL[m.role]})`, 'info');
                      }}
                    >
                      <span className="p-role">{ROLE_LABEL[m.role]}</span>
                      <span className="p-name">{u?.name}</span>
                      {Object.keys(backend.db.workspaces).length > 1 && <span className="tag">{backend.db.workspaces[m.workspace_id]?.name}</span>}
                      <span className="p-desc">{ROLE_DESC[m.role]}</span>
                    </button>
                  );
                })}
            </div>
            <div className="row">
              <button className="btn" onClick={() => (setAccount(false), go('settings'))}>
                <Icon name="settings" /> Settings
              </button>
              <button className="btn" onClick={() => (setAccount(false), app.signOut())}>
                <Icon name="chevronLeft" /> Back to welcome
              </button>
            </div>
          </div>
        </Sheet>
      )}

      {blockedNav && (
        <Sheet title="Leave this screen?" onClose={blockedNav.cancel}>
          <div className="stack">
            <p style={{ margin: 0 }}>{blockedNav.message}</p>
            <div className="row">
              <button className="btn primary big" onClick={blockedNav.cancel}>
                Stay here
              </button>
              <button className="btn big danger" onClick={blockedNav.proceed}>
                Leave and discard
              </button>
            </div>
          </div>
        </Sheet>
      )}

      {signedIn && <Tour />}
      <Toasts />
      <div className="print-root" id="print-root" />
    </div>
  );
}

function RemovedAccess() {
  const { signOut, backend, actorId } = useApp();
  return (
    <div className="panel">
      <Empty icon="lock" title="Your access to this company was removed">
        <p>
          {backend.db.users[actorId ?? '']?.name ?? 'This account'} is no longer a member. The server refuses every read and change from here on, even though this device still has the app open. That is the behavior the blueprint requires.
        </p>
        <button className="btn primary" onClick={signOut}>
          Choose another demo account
        </button>
      </Empty>
    </div>
  );
}
