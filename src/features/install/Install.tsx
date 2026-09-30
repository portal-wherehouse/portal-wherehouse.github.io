// Installing the portal as a home-screen app: the steps for each platform (Help), a dismissible banner on
// phones, and the "New version ready" prompt. All of it hides once the app is opened from the home screen.

import { useState, type ReactNode } from 'react';
import { BRAND } from '../../brand';
import { useApp } from '../../app/state';
import { applyUpdate, promptInstall, usePwa, type InstallPlatform, type PwaState } from '../../device/pwa';
import { Icon } from '../../ui/icons';
import './install.css';

type Tab = 'ios' | 'android' | 'desktop';

const TABS: { id: Tab; label: string }[] = [
  { id: 'ios', label: 'iPhone or iPad' },
  { id: 'android', label: 'Android' },
  { id: 'desktop', label: 'Computer' },
];

const tabFor = (p: InstallPlatform): Tab => (p === 'android' ? 'android' : p === 'desktop' ? 'desktop' : 'ios');

/** Installing only works in the full app, and there is nothing to show once it is installed. */
export function installHelpShown(pwa: Pick<PwaState, 'installed'>): boolean {
  return __BUILD_TARGET__ === 'app' && !pwa.installed;
}

function InstallButton({ small, onDone }: { small?: boolean; onDone?: (installed: boolean) => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className={`btn primary${small ? ' small' : ''}`}
      disabled={busy}
      onClick={() => {
        setBusy(true);
        void promptInstall().then((ok) => {
          setBusy(false);
          onDone?.(ok);
        });
      }}
    >
      <Icon name="download" /> Install {BRAND.name}
    </button>
  );
}

function Steps({ children }: { children: ReactNode }) {
  return <ol className="inst-steps">{children}</ol>;
}

/** Step-by-step install for each platform, opened at the one this device is on. */
export function InstallGuide() {
  const pwa = usePwa();
  const [tab, setTab] = useState<Tab>(() => tabFor(pwa.platform));
  if (pwa.installed)
    return (
      <p className="inst-done" role="status">
        <Icon name="checkCircle" /> {BRAND.name} is installed on this device. Open it from your home screen or app list.
      </p>
    );
  const here = tab === tabFor(pwa.platform);
  return (
    <div className="panel stack inst-guide">
      <div className="seg" role="group" aria-label="Your device">
        {TABS.map((t) => (
          <button key={t.id} type="button" aria-pressed={tab === t.id} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'ios' && (
        <>
          {here && pwa.platform === 'ios-inapp' && (
            <p className="inst-note">
              <Icon name="info" /> This page is open inside another app. Open it in Safari first: tap the menu and choose Open in Safari or Open in browser.
            </p>
          )}
          <Steps>
            <li>Open {BRAND.name} in Safari.</li>
            <li>
              Tap <strong>Share</strong>, the square with an arrow pointing up. If you do not see it, tap <strong>•••</strong> first.
            </li>
            <li>
              Scroll down and tap <strong>Add to Home Screen</strong>.
            </li>
            <li>
              Keep <strong>Open as Web App</strong> turned on if you see it, then tap <strong>Add</strong>.
            </li>
            <li>Open {BRAND.name} from your home screen and sign in once. It stays signed in after that.</li>
          </Steps>
        </>
      )}

      {tab === 'android' && (
        <>
          {here && pwa.canPrompt && (
            <div className="row">
              <InstallButton />
            </div>
          )}
          <Steps>
            <li>Open {BRAND.name} in Chrome.</li>
            <li>
              Tap <strong>Install</strong> when Chrome offers it. Or open the <strong>⋮</strong> menu and tap <strong>Add to home screen</strong>, then <strong>Install</strong>.
            </li>
            <li>Open {BRAND.name} from your home screen or app drawer. It stays signed in.</li>
          </Steps>
        </>
      )}

      {tab === 'desktop' && (
        <>
          {here && pwa.canPrompt && (
            <div className="row">
              <InstallButton />
            </div>
          )}
          <Steps>
            <li>Open {BRAND.name} in Google Chrome or Microsoft Edge.</li>
            <li>
              Click the install icon at the right end of the address bar. Or use the browser menu: in Chrome, <strong>Cast, save and share</strong>, then <strong>Install page as app</strong>. In Edge,{' '}
              <strong>Apps</strong>, then <strong>Install this site as an app</strong>.
            </li>
            <li>{BRAND.name} opens in its own window, with an icon in the Start menu, Dock or taskbar.</li>
          </Steps>
          <p className="muted inst-small">Safari on a Mac: choose File, then Add to Dock.</p>
        </>
      )}
    </div>
  );
}

const DISMISS_KEY = 'wh.installBanner.dismissedAt';
const DISMISS_MS = 30 * 24 * 60 * 60_000;

function dismissedRecently(): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY));
    return !!at && Date.now() - at < DISMISS_MS;
  } catch {
    return false;
  }
}

/** On a phone that has not installed the app: a short offer at the top of the portal. Not now hides it for 30 days. */
export function InstallBanner() {
  const pwa = usePwa();
  const { go, route } = useApp();
  const [hidden, setHidden] = useState(dismissedRecently);
  const phone = pwa.platform === 'ios' || pwa.platform === 'ios-inapp' || pwa.platform === 'android';
  if (hidden || !phone || !installHelpShown(pwa) || route.name === 'help') return null;
  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* hidden for this visit only */
    }
    setHidden(true);
  };
  return (
    <aside className="inst-banner" aria-label={`Install ${BRAND.name}`}>
      <span className="inst-banner-icon" aria-hidden="true">
        <Icon name="phone" />
      </span>
      <div className="inst-banner-text">
        <strong>Install {BRAND.name} on this phone</strong>
        <span>Open it from your home screen, full screen, like any other app.</span>
      </div>
      <div className="inst-banner-actions">
        {pwa.platform === 'android' && pwa.canPrompt ? (
          <InstallButton small onDone={(ok) => ok && setHidden(true)} />
        ) : (
          <button type="button" className="btn primary small" onClick={() => go({ name: 'help', q: 'install' })}>
            Show me how
          </button>
        )}
        <button type="button" className="btn ghost small" onClick={dismiss}>
          Not now
        </button>
      </div>
    </aside>
  );
}

/** A newer version was deployed while this page was open. Sits with the toasts. */
export function UpdatePrompt() {
  const { updateReady } = usePwa();
  const [busy, setBusy] = useState(false);
  if (!updateReady) return null;
  return (
    <div className="toast inst-update" role="status">
      <Icon name="refresh" />
      <span className="grow">New version ready</span>
      <button
        type="button"
        className="btn small"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          applyUpdate();
        }}
      >
        Reload
      </button>
    </div>
  );
}
