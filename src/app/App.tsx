import { WarehouseMenu } from '../features/warehouse/WarehouseMenu';
import { FirebaseBackend } from '../data/firebase';
import { QuietLoading, WarehouseLoading } from '../portal/WarehouseLoading';
import { SampleHints } from '../portal/SampleHints';
import { LiveView } from '../data/LiveView';
// App shell. Website pages get the site header and footer; everything else is the portal:
// demo strip, top bar with "Take the tour", navigation, the current screen, and the sheets above it.

import { useEffect, useRef, useState } from 'react';
import { BRAND } from '../brand';
import { isSiteRoute, quietOpening, useApp, type RouteName, type SiteRouteName } from './state';
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
import { useSetup, useWordSwap } from './words';
import { Move } from '../features/move/Move';
import { Overview } from '../features/overview/Overview';
import { PalletRecord } from '../features/pallet/PalletRecord';
import { Receive } from '../features/receive/Receive';
import { Incoming } from '../features/receive/Incoming';
import { Products } from '../features/receive/Products';
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
import { SETUP_ROUTES, SetupPending } from '../features/onboarding/SetupWizard';
import { ChecklistNav, SetupChecklist, SetupOops, useChecklistStatus } from '../features/setup/SetupChecklist';
import { useApplySavedSurvey } from '../features/setup/GettingStarted';
import { SignIn } from '../portal/SignIn';
import { SitePage } from '../site/SitePage';
import { SiteRouting } from '../site/routing';
import './customer.css';
import { InstallBanner, InstallGuide, installHelpShown } from '../features/install/Install';
import { scrollToId } from '../features/help/helpers';
import { usePwa } from '../device/pwa';
import { ScanStatusChip } from '../features/scan/ScanReady';

const SCREENS: Record<Exclude<RouteName, SiteRouteName | 'signin'>, () => React.ReactNode> = {
  checklist: SetupChecklist,
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
  incoming: Incoming,
  products: Products,
};

const TABS: { route: RouteName; label: string; icon: 'receive' | 'move' | 'find' | 'more' | 'overview' }[] = [
  { route: 'overview', label: 'Dashboard', icon: 'overview' },
  { route: 'receive', label: 'Receive', icon: 'receive' },
  { route: 'move', label: 'Move', icon: 'move' },
  { route: 'find', label: 'Find', icon: 'find' },
  { route: 'more', label: 'More', icon: 'more' },
];

/** Which top-level tab a detail screen belongs to, for highlighting. */
function tabFor(name: RouteName): RouteName {
  if (name === 'pallet') return 'find';
  if (['overview', 'receive', 'move', 'find'].includes(name)) return name;
  return 'more';
}

export function App() {
  const app = useApp();
  const { route, actorId, backend, workspaceId } = app;
  const [welcome, setWelcome] = useState('');
  useEffect(() => { if (backend.cloudError) setWelcome(''); }, [backend.cloudError]);
  if (isSiteRoute(route.name)) {
    return (
      <>
        <SiteRouting value={app}><SitePage route={route.name}/></SiteRouting>
        <Toasts />
        <div className="print-root" id="print-root" />
      </>
    );
  }
  if (welcome && !backend.cloudError) return <main className="auth-shell"><WarehouseLoading name={welcome} welcome ready={!backend.loading && !!workspaceId && route.name === 'overview'} onComplete={() => setWelcome('')} /></main>;
  if (backend.mode === 'firebase' && backend.loading && !backend.cloudError && route.name !== 'signin' && quietOpening()) return <QuietLoading />;
  if (backend.mode === 'firebase' && (route.name === 'signin' || !actorId || !workspaceId || backend.loading || backend.cloudError)) return <LiveSignIn onActivated={setWelcome} />;
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
  const [folded, setFolded] = useFoldedNav();
  const setup = useSetup();
  useWordSwap(setup);
  const app = useApp();
  const { route, actorId, workspaceId, role, backend, go, blockedNav, toast, read, accountsOpen: account, setAccountsOpen: setAccount } = app;
  const signedIn = !!actorId;
  const offline = backend.network === 'offline';

  // Replay the offline queue as soon as the connection comes back (page 24).
  const wasOffline = useRef(offline);
  useEffect(() => {
    if (backend.mode === 'demo' && wasOffline.current && !offline && actorId && workspaceId && backend.outbox.pending(actorId, workspaceId).some((e) => e.status === 'queued')) {
      void backend.sync(actorId, workspaceId).then((s) => {
        if (!s) return;
        if (s.conflicts || s.blocked) toast(`Back online: ${s.acknowledged} saved, ${s.conflicts + s.blocked} need your decision in Sync`, 'error');
        else if (s.acknowledged) toast(`Back online: ${s.acknowledged} queued ${s.acknowledged === 1 ? 'change' : 'changes'} saved`);
      });
    }
    wasOffline.current = offline;
  }, [offline, actorId, workspaceId, backend, toast]);

  const ctx = read((e, a, ws) => e.context(a, ws));
  // A new self-serve warehouse is locked to its setup checklist until a manager finishes or skips it. Every
  // other button is greyed out and says why; the checklist's own links still reach the tools it needs.
  const checklist = useChecklistStatus();
  // The wizard brings in the website survey itself; any other warehouse gets its answers applied here, once.
  useApplySavedSurvey(!!ctx?.warehouse && !ctx.warehouse.onboarding);
  const setupLocked = ctx?.warehouse?.onboarding?.state === 'pending';
  const manager = role === 'OWNER' || role === 'SUPERVISOR';
  const setupOpen = (r: string) => r === 'checklist' || (manager && SETUP_ROUTES.includes(r));
  const [oops, setOops] = useState(false);
  const open = (r: RouteName) => (setupLocked ? setOops(true) : go(r));
  const onChecklist = route.name === 'checklist' || (setupLocked && !setupOpen(route.name));
  const counts = read((e, a, ws) => {
    const r = e.reconciliation(a, ws);
    return { reconcile: r.unplaced.length + r.missing.length + r.holds.length + r.reprint.length };
  });
  const pending = actorId && workspaceId ? backend.outbox.pending(actorId, workspaceId).length + backend.pendingFor(actorId, workspaceId).length : 0;
  const needsDecision = actorId && workspaceId ? backend.outbox.pending(actorId, workspaceId).filter((e) => e.status === 'conflict' || e.status === 'blocked').length : 0;

  const Screen = backend.mode === 'firebase' && ['lab','data','guide','about','help'].includes(route.name) ? LiveHelp : SCREENS[route.name as keyof typeof SCREENS] ?? Find;
  const removed = signedIn && !role && !['about', 'guide', 'help'].includes(route.name);
  const me = actorId ? backend.db.users[actorId] : null;
  const myWorkspaces = actorId ? backend.db.memberships.filter((m) => m.user_id === actorId && m.active) : [];
  const multiCompany = Object.keys(backend.db.workspaces).length > 1;
  const companyName = workspaceId ? backend.db.workspaces[workspaceId]?.name : null;

  return (
    <div className="shell customer-app">
      {backend.mode === 'demo' && <div className="demo-strip" role="note">
        {!IS_PREVIEW && <a className="demo-exit" href={location.pathname} data-testid="exit-demo"><Icon name="x" />Exit demo</a>}
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
        <button className="brand" onClick={() => go('overview')} aria-label={`${BRAND.portal} home`}>
          <BrandMark className="brand-mark" />
          <span className="brand-name">{BRAND.name}</span>

        </button>
        <span className="spacer" />
        {signedIn && ctx && (
          <>
            <ScanStatusChip />
            {ctx.warehouse && (
              <WarehouseMenu key={workspaceId} warehouse={ctx.warehouse} />
            )}
            {(app.prefs.advancedTools || offline || pending > 0) ? <button
              className={`chip net-chip ${offline ? 'offline' : ''}`}
              onClick={() => go('sync')}
              title={offline ? `Offline. Showing what this device cached at ${fmtTime(backend.cache?.at)}` : 'Online'}
              aria-label={`${offline ? 'Offline' : 'Online'}${pending > 0 ? `, ${pending} waiting to be confirmed` : ''}. Open Sync and offline`}
            >
              {offline ? <Icon name="wifiOff" /> : <span className="dot" />}
              <span className="net-label">{offline ? 'Offline' : 'Online'}</span>
              {pending > 0 && <span className="tag warn" style={{ marginLeft: 2 }}>{pending}</span>}
            </button> : null}
          </>
        )}
        {backend.mode === 'demo' && !backend.sampleMode && <button className="chip tour-chip" onClick={() => app.prefs.advancedTools ? app.startGuide(0) : app.setTourOpen(true)} data-tour="take-tour" aria-label={app.prefs.advancedTools ? 'Take the tour' : 'Practice shift'}>
          <Icon name="tour" />
          <span className="tour-chip-label">{app.prefs.advancedTools ? 'Take the tour' : 'Practice shift'}</span>
        </button>}
        {me && (
          <button className="chip acct-chip" aria-expanded={account} aria-haspopup="dialog" onClick={() => setAccount(true)} aria-label={`Account: ${role ? `${ROLE_LABEL[role]}, ` : ''}${me.name}`} data-tour="account">
            <Avatar name={me.name} />
            {/* Phones have no room for the role's name, so a short role badge stands in for the initials. */}
            {role && (
              <span className="acct-role" aria-hidden="true">
                {ROLE_SHORT[role]}
              </span>
            )}
            <span className="acct-name"><strong>{me.name}</strong><small>{role ? ROLE_LABEL[role] : 'Account'}</small></span><Icon name="chevronDown" />
          </button>
        )}
      </header>

      {offline && signedIn && (
        <div className="notice warn" style={{ borderRadius: 0, borderLeft: 0, borderRight: 0, margin: 0 }} role="status">
          <Icon name="wifiOff" />
          <div className="n-body">
            <strong>Offline.</strong> Showing what this device last knew, cached at {fmtTime(backend.cache?.at)}. Moves and location checks will be queued; everything else waits for the connection.{' '}
            {backend.mode === 'demo' && <button className="btn ghost small" style={{ minHeight: 0, padding: '0 4px' }} onClick={() => backend.setNetwork('online')}>
              Reconnect
            </button>}
          </div>
        </div>
      )}

      <div className={signedIn ? 'body' : 'body no-side'}>
        {signedIn && (
          <nav className="sidebar" aria-label="Main">
            {checklist.show && <ChecklistNav status={checklist} here={onChecklist} />}
            <button className={`nav-item dashboard-nav${setupLocked ? ' locked' : ''}`} aria-disabled={setupLocked || undefined} aria-current={route.name === 'overview' && !setupLocked ? 'page' : undefined} onClick={() => open('overview')} data-tour="nav-overview"><Icon name="overview" />Dashboard</button>
            {visibleNavGroups(role, app.prefs.advancedTools, backend.mode === 'firebase', setup.jobs_on).map((g) => (
              <div key={g.title} className="nav-group">
                <details open={!folded.includes(g.title)}>
                {/* Handled on click (not the async toggle event) so the choice is saved before any refresh. */}
                <summary
                  onClick={(e) => {
                    e.preventDefault();
                    setFolded(g.title, !folded.includes(g.title));
                  }}
                >
                  {g.title}
                </summary>
                {g.items.filter(i => i.route !== 'overview').map((i) => {
                  const current = route.name === i.route || (i.route === 'find' && route.name === 'pallet') || (i.route === 'jobs' && route.name === 'job') || (i.route === 'locations' && route.name === 'location');
                  const count = i.route === 'reconcile' ? counts?.reconcile : i.route === 'sync' ? pending : undefined;
                  return (
                    <button key={i.route} className={`nav-item${setupLocked ? ' locked' : ''}`} aria-disabled={setupLocked || undefined} aria-current={current && !onChecklist ? 'page' : undefined} onClick={() => open(i.route)} data-tour={`nav-${i.route}`}>
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
        <main key={`${route.name}:${route.id ?? ''}`} className="main page-enter" id="main" style={signedIn ? undefined : { maxWidth: 980 }}>
          {signedIn && <InstallBanner />}
          {!backend.storageOk && <Notice tone="error" title="Changes cannot be saved on this device">Local storage is unavailable. New changes are blocked until storage works again. Keep this tab open and export a backup from Settings → Data and storage if needed.</Notice>}
          {backend.mode === 'firebase' && <>{backend.storageOk&&backend.storageError&&<Notice tone="warn" title="Offline saving needs attention">{backend.storageError}</Notice>}<RenewalNotice/><PendingCloudRequests /></>}
          {removed ? <RemovedAccess /> : signedIn && setupLocked && !setupOpen(route.name) ? (manager ? <SetupChecklist /> : route.name === 'help' ? <Screen /> : <SetupPending />) : signedIn ? <LiveView>{setupLocked && route.name !== 'checklist' && <div className="setup-back"><span>You’re setting up your warehouse.</span><button className="btn small primary" onClick={() => go('checklist')}><Icon name="chevronLeft" /> Back to setup</button></div>}<Screen key={`${route.name}:${route.id ?? ''}`} /></LiveView> : <Screen />}
        </main>
      </div>

      {signedIn && (
        <nav className="bottom-nav" aria-label="Main">
          {TABS.filter(t => role !== 'VIEWER' || t.route === 'overview' || t.route === 'find' || t.route === 'more').map((t) => (
            <button key={t.route} className={setupLocked ? 'locked' : undefined} aria-disabled={setupLocked || undefined} aria-current={tabFor(route.name) === t.route && !onChecklist ? 'page' : undefined} onClick={() => open(t.route)} data-tour={`tab-${t.route}`}>
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

      {oops && <SetupOops manager={manager} onClose={() => setOops(false)} />}

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

      {account && backend.mode === 'firebase' && <Sheet title="Your account" onClose={()=>setAccount(false)}><div className="stack account-menu"><div className="account-identity"><Avatar name={me?.name||'Account'}/><div><strong>{me?.name}</strong><p>{role?ROLE_LABEL[role]:'Team member'} · {companyName}</p><p>{me?.email}</p></div></div><button className="btn" onClick={()=>{setAccount(false);go('settings');}}><Icon name="settings"/>Account settings</button><button className="btn" onClick={()=>{setAccount(false);app.signOut();}}><Icon name="chevronLeft"/>Log out</button></div></Sheet>}

      {signedIn && backend.mode === 'demo' && <Tour />}
      {signedIn && backend.sampleMode && <SampleHints key={`${route.name}:${route.id||''}`} />}
      {signedIn && <PortalTour />}
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

function LiveHelp() {
  const {go,startGuide,route}=useApp();
  const pwa = usePwa();
  const installShown = installHelpShown(pwa) && route.name === 'help';
  // The phone banner's Show me how opens #help?q=install.
  useEffect(() => {
    if (!installShown || route.q !== 'install') return;
    const t = setTimeout(() => scrollToId('help-install', 'help-install-h'), 60);
    return () => clearTimeout(t);
  }, [installShown, route.q]);
  return <div className="stack">
  <div className="panel stack"><h1>Setup & support</h1>
    <p>Shared records sync across your crew. If the signal drops, cached pallet moves are saved on this device until you reconnect. Receiving, photos and dispatch need a connection.</p>
    <div className="row"><button className="btn" onClick={()=>startGuide(0)}>Take the tour</button><a className="btn" href={`${location.pathname}?demo=1#help`}>Open sample warehouse</a></div>
    <p>The tour explains your screens. Use the separate sample warehouse to practice with example records.</p>
    <p>Need help with labels, scanning or your crew?</p><button className="btn primary" onClick={()=>go('contact')}>Contact remote support</button>
  </div>
  {installShown && (
    <section className="stack live-install" id="help-install" aria-labelledby="help-install-h">
      <h2 id="help-install-h" tabIndex={-1}>Install the {BRAND.name} app</h2>
      <p className="muted" style={{ margin: 0 }}>Add it to your home screen for one-tap access, full screen, with no app store needed.</p>
      <InstallGuide />
    </section>
  )}
  </div>;
}

function PendingCloudRequests() { const {backend,actorId,workspaceId,toast}=useApp();const [busy,setBusy]=useState(false);const requests=actorId&&workspaceId?backend.pendingFor(actorId,workspaceId):[];if(!requests.length)return null;return <Notice tone="warn" title="A save is waiting for confirmation"><p>Check its result before repeating the action.</p><button className="btn" disabled={busy} onClick={async()=>{setBusy(true);try{for(const p of requests){const r=await backend.recover(actorId!,workspaceId!,p.command.command_id);toast(r.status==='result'?(r.result.ok?'Change saved.':r.result.message):r.status==='unknown'||r.status==='offline'?r.message:'Still waiting.',r.status==='result'&&r.result.ok?'ok':'info');}}finally{setBusy(false);}}}>{busy?'Checking…':'Check saved result'}</button></Notice>; }

function RenewalNotice(){
  const {backend,role,go}=useApp();
  if(!(backend instanceof FirebaseBackend)||!backend.readOnly)return null;
  return <Notice tone="warn" title="Renewal due · read-only access"><p>You can find pallets, view photos and read history until {new Date(backend.graceEndsAt).toLocaleDateString()}. New changes and uploads are paused. Your records are preserved.</p><div className="row">{(role==='OWNER'||role==='SUPERVISOR')&&<button className="btn" onClick={()=>go('export')}>Export records</button>}<button className="btn" onClick={()=>go('signin')}>Renew warehouse</button></div></Notice>;
}

/** Sidebar groups stay open unless you fold them; the choice is kept in this browser across refreshes. */
function useFoldedNav(): [string[], (title: string, fold: boolean) => void] {
  const [folded, set] = useState<string[]>(() => {
    try {
      const v = JSON.parse(localStorage.getItem('pl.navFolded') ?? '[]');
      return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
    } catch {
      return [];
    }
  });
  const update = (title: string, fold: boolean) =>
    set((cur) => {
      if (fold === cur.includes(title)) return cur;
      const next = fold ? [...cur, title] : cur.filter((t) => t !== title);
      try {
        localStorage.setItem('pl.navFolded', JSON.stringify(next));
      } catch {
        /* folding still works for this visit */
      }
      return next;
    });
  return [folded, update];
}
