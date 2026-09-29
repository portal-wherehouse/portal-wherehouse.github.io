import { SampleHints } from '../portal/SampleHints';
import { LiveView } from '../data/LiveView';
// App shell. Website pages get the site header and footer; everything else is the portal:
// demo strip, top bar with "Take the tour", navigation, the current screen, and the sheets above it.

import { useEffect, useRef, useState } from 'react';
import { BRAND } from '../brand';
import { isSiteRoute, useApp, type RouteName, type SiteRouteName } from './state';
import { IS_PREVIEW } from '../device/output';
import { BrandMark, Icon } from '../ui/icons';
import { Avatar, Empty, Notice, ROLE_DESC, ROLE_LABEL, ROLE_SHORT, Sheet, Toasts, fmtTime } from '../ui/ui';
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
import { More, visibleNavGroups } from '../features/more/More';
import { Move } from '../features/move/Move';
import { Overview } from '../features/overview/Overview';
import { PalletRecord } from '../features/pallet/PalletRecord';
import { Receive } from '../features/receive/Receive';
import { Settings } from '../features/settings/Settings';
import { Sync } from '../features/sync/Sync';
import { Tour } from '../features/tour/Tour';
import { PortalTour } from '../features/tour/PortalTour';
import { ScanAnywhere } from '../features/scanners/ScanAnywhere';
import { Help } from '../features/help/Help';
import { Scanners } from '../features/scanners/Scanners';
import { Station } from '../features/station/Station';
import { DataStorage } from '../features/data/DataStorage';
import { LiveSignIn } from '../portal/LiveSignIn';
import { SignIn } from '../portal/SignIn';
import { SiteShell } from '../site/SiteShell';
import { MissionPage } from '../site/pages/Mission';
import './customer.css';
import { Home } from '../site/Home';
import { ShowcasePage } from '../site/pages/Showcase';
import { SimplePage } from '../site/pages/Simple';
import { ProductPage } from '../site/pages/Product';
import { HardwarePage } from '../site/pages/Hardware';
import { IndustriesPage } from '../site/pages/Industries';
import { CustomersPage } from '../site/pages/Customers';
import { PricingPage } from '../site/pages/Pricing';
import { FounderPage } from '../site/pages/Founder';
import { ContactPage } from '../site/pages/Contact';
import { SecurityPage } from '../site/pages/Security';

const SITE_PAGES: Record<SiteRouteName, () => React.ReactNode> = {
  home: Home,
  mission: MissionPage,
  product: ProductPage,
  showcase: ShowcasePage,
  simple: SimplePage,
  why: SimplePage,
  hardware: HardwarePage,
  industries: IndustriesPage,
  customers: CustomersPage,
  pricing: PricingPage,
  founder: FounderPage,
  contact: ContactPage,
  security: SecurityPage,
};

const SCREENS: Record<Exclude<RouteName, SiteRouteName | 'signin'>, () => React.ReactNode> = {
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
  help: Help,
  scanners: Scanners,
  station: Station,
  data: DataStorage,
};

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
  const { route, actorId, backend, workspaceId } = useApp();
  if (isSiteRoute(route.name)) {
    const Page = SITE_PAGES[route.name];
    return (
      <>
        <SiteShell>
          <Page key={route.name} />
        </SiteShell>
        <Toasts />
        <div className="print-root" id="print-root" />
      </>
    );
  }
  if (backend.mode === 'firebase' && (route.name === 'signin' || !actorId || !workspaceId || backend.loading || backend.cloudError)) return <LiveSignIn />;
  if (route.name === 'signin' || !actorId) {
    return (
      <>
        <SignIn />
        <Toasts />
      </>
    );
  }
  return <Portal />;
}

function Portal() {
  const app = useApp();
  const { route, actorId, workspaceId, role, backend, go, blockedNav, toast, read, accountsOpen: account, setAccountsOpen: setAccount } = app;
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

  const Screen = backend.mode === 'firebase' && ['lab','sync','data','guide','about','help'].includes(route.name) ? LiveHelp : SCREENS[route.name as keyof typeof SCREENS] ?? Find;
  const removed = signedIn && !role && !['about', 'guide', 'help'].includes(route.name);
  const me = actorId ? backend.db.users[actorId] : null;
  const myWorkspaces = actorId ? backend.db.memberships.filter((m) => m.user_id === actorId && m.active) : [];
  const multiCompany = Object.keys(backend.db.workspaces).length > 1;
  const companyName = workspaceId ? backend.db.workspaces[workspaceId]?.name : null;

  return (
    <div className="shell customer-app">
      {backend.mode === 'demo' && <div className="demo-strip" role="note">
        <strong>Sample warehouse</strong>
        <span className="grow">
          {IS_PREVIEW ? 'Hosted preview. ' : ''}Practice data stays in this browser{me && role ? `. You are using the ${ROLE_LABEL[role]} account${multiCompany && companyName ? ` at ${companyName}` : ''}` : ''}.
        </span>
        <a className="sample-signin" href={`${location.pathname}#signin`}>Customer sign in</a>
        {signedIn && (
          <button onClick={() => setAccount(true)} aria-label="Switch demo account">
            Switch role
          </button>
        )}
      </div>}

      <header className="topbar">
        <button className="brand" onClick={() => go(app.prefs.startTab)} aria-label={`${BRAND.portal} home`}>
          <BrandMark className="brand-mark" />
          <span className="brand-name">{BRAND.name}</span>
          <span className="brand-sub">{companyName || 'Warehouse'}</span>
        </button>
        <span className="spacer" />
        {signedIn && ctx && (
          <>
            {ctx.warehouse && (
              <span className="chip static wh-chip" title={`${ctx.workspace.name} · ${ctx.warehouse.name}`}>
                <Icon name="locations" /> {ctx.warehouse.code}
              </span>
            )}
            {backend.mode === 'demo' && (app.prefs.advancedTools || offline || pending > 0) ? <button
              className={`chip net-chip ${offline ? 'offline' : ''}`}
              onClick={() => go('sync')}
              title={offline ? `Offline. Showing what this device cached at ${fmtTime(backend.cache?.at)}` : 'Online'}
              aria-label={`${offline ? 'Offline' : 'Online'}${pending > 0 ? `, ${pending} waiting to be confirmed` : ''}. Open Sync and offline`}
            >
              {offline ? <Icon name="wifiOff" /> : <span className="dot" />}
              <span className="net-label">{offline ? 'Offline' : 'Online'}</span>
              {pending > 0 && <span className="tag warn" style={{ marginLeft: 2 }}>{pending}</span>}
            </button> : <span className="chip static" title="Records are saved to your warehouse account">{backend.mode === 'firebase' ? 'Shared warehouse' : 'Local demo'}</span>}
          </>
        )}
        {backend.mode === 'demo' && !backend.sampleMode && <button className="chip tour-chip" onClick={() => app.prefs.advancedTools ? app.startGuide(0) : app.setTourOpen(true)} data-tour="take-tour" aria-label={app.prefs.advancedTools ? 'Take the tour' : 'Practice shift'}>
          <Icon name="tour" />
          <span className="tour-chip-label">{app.prefs.advancedTools ? 'Take the tour' : 'Practice shift'}</span>
        </button>}
        {me && (
          <button className="chip acct-chip" onClick={() => setAccount(true)} aria-label={`Account: ${role ? `${ROLE_LABEL[role]}, ` : ''}${me.name}`} data-tour="account">
            <Avatar name={me.name} />
            {/* Phones have no room for the role's name, so a short role badge stands in for the initials. */}
            {role && (
              <span className="acct-role" aria-hidden="true">
                {ROLE_SHORT[role]}
              </span>
            )}
            <span className="acct-name">{role ? ROLE_LABEL[role] : me.name}</span>
          </button>
        )}
      </header>

      {offline && signedIn && backend.mode === 'demo' && (
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
            {visibleNavGroups(role, app.prefs.advancedTools, backend.mode === 'firebase').map((g) => (
              <div key={g.title} className="nav-group">
                <details open={g.title === 'Floor' || g.title === 'Warehouse' || g.title === 'Support'}>
                <summary>{g.title}</summary>
                {g.items.map((i) => {
                  const current = route.name === i.route || (i.route === 'find' && route.name === 'pallet') || (i.route === 'jobs' && route.name === 'job') || (i.route === 'locations' && route.name === 'location');
                  const count = i.route === 'reconcile' ? counts?.reconcile : i.route === 'sync' ? pending : undefined;
                  return (
                    <button key={i.route} className="nav-item" aria-current={current ? 'page' : undefined} onClick={() => go(i.route)} data-tour={`nav-${i.route}`}>
                      <Icon name={i.icon} />
                      {i.label}
                      {!!count && <span className={`count ${i.route === 'sync' && needsDecision ? 'alert' : ''}`}>{count}</span>}
                    </button>
                  );
                })}
                </details>
              </div>
            ))}
          </nav>
        )}
        <main className="main page-enter" id="main" style={signedIn ? undefined : { maxWidth: 980 }}>
          {!backend.storageOk && <Notice tone="error" title="Changes cannot be saved on this device">Local storage is unavailable. New changes are blocked until storage works again. Keep this tab open and export a backup from Settings → Data and storage if needed.</Notice>}
          {backend.mode === 'firebase' && <PendingCloudRequests />}
          {removed ? <RemovedAccess /> : signedIn ? <LiveView><Screen key={`${route.name}:${route.id ?? ''}`} /></LiveView> : <Screen />}
        </main>
      </div>

      {signedIn && (
        <nav className="bottom-nav" aria-label="Main">
          {TABS.filter(t => role !== 'VIEWER' || t.route === 'find' || t.route === 'more').map((t) => (
            <button key={t.route} aria-current={tabFor(route.name) === t.route ? 'page' : undefined} onClick={() => go(t.route)} data-tour={`tab-${t.route}`}>
              <Icon name={t.icon} />
              {t.label}
              {t.route === 'more' && needsDecision > 0 && <span className="badge-count">{needsDecision}</span>}
            </button>
          ))}
        </nav>
      )}

      {account && me && backend.mode === 'demo' && (
        <Sheet title={backend.sampleMode?"Sample views":"Demo accounts"} onClose={() => setAccount(false)}>
          <div className="stack">
            <p className="muted" style={{ margin: 0, fontSize: 14 }}>
              Switch between the management and employee views. These practice records stay in this browser. Customer accounts use their own warehouse.
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
                .filter((m) => m.active && (!backend.sampleMode || ['OWNER','OPERATOR'].includes(m.role)))
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
                      {multiCompany && <span className="p-where">at {backend.db.workspaces[m.workspace_id]?.name}</span>}
                      <span className="p-name">{u?.name}</span>
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
                <Icon name="chevronLeft" /> Leave the portal
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

      {account && backend.mode === 'firebase' && <Sheet title="Your account" onClose={()=>setAccount(false)}><p>{me?.name} · {me?.email}</p><button className="btn primary" onClick={()=>{setAccount(false);app.signOut();}}>Sign out</button></Sheet>}
      {backend.mode === 'firebase' && offline && <Notice tone="warn">You’re offline. Reconnect before making changes.</Notice>}
      {signedIn && backend.mode === 'demo' && !backend.sampleMode && <Tour />}
      {signedIn && backend.sampleMode && <SampleHints key={`${route.name}:${route.id||''}`} />}
      {backend.mode === 'demo' && !backend.sampleMode && <PortalTour />}
      <ScanAnywhere />
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
          {backend.db.users[actorId ?? '']?.name ?? 'This account'} is no longer a member. The server refuses every read and change from here on, even though this device still has the app open. That is how access is meant to work.
        </p>
        <button className="btn primary" onClick={signOut}>
          Back to the website
        </button>
      </Empty>
    </div>
  );
}

function LiveHelp() { const {go}=useApp();return <div className="panel stack"><h1>Setup & support</h1><p>Live records are saved to your shared warehouse. An internet connection is required.</p><p>Need help with labels, scanning or your crew?</p><button className="btn primary" onClick={()=>go('contact')}>Contact remote support</button></div>; }

function PendingCloudRequests() { const {backend,actorId,workspaceId,toast}=useApp();const [busy,setBusy]=useState(false);const requests=actorId&&workspaceId?backend.pendingFor(actorId,workspaceId):[];if(!requests.length)return null;return <Notice tone="warn" title="A save is waiting for confirmation"><p>Check its result before repeating the action.</p><button className="btn" disabled={busy} onClick={async()=>{setBusy(true);try{for(const p of requests){const r=await backend.recover(actorId!,workspaceId!,p.command.command_id);toast(r.status==='result'?(r.result.ok?'Change saved.':r.result.message):r.status==='unknown'||r.status==='offline'?r.message:'Still waiting.',r.status==='result'&&r.result.ok?'ok':'info');}}finally{setBusy(false);}}}>{busy?'Checking…':'Check saved result'}</button></Notice>; }
