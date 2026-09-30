// Settings: display preferences (per device), demo data controls, storage and build information.

import { useState } from "react";
import type { FixtureName } from "../../demo/seed";
import { useApp, type Prefs } from "../../app/state";
import { formatBytes } from "../../device/photos";
import { Icon } from "../../ui/icons";
import { uuid } from "../../domain/codes";
import {
  Explain,
  Notice,
  PageHead,
  Sheet,
  Spinner,
  ROLE_LABEL,
} from "../../ui/ui";

export function Settings() {
  const { backend } = useApp();
  return backend.mode === "firebase" ? <LiveSettings /> : <DemoSettings />;
}
function DemoSettings() {
  const {
    prefs,
    setPrefs,
    backend,
    toast,
    setTourOpen,
    setAccountsOpen,
    go,
    role,
    startGuide,
  } = useApp();
  const [confirm, setConfirm] = useState<FixtureName | null>(null);
  const [busy, setBusy] = useState(false);
  const counts = {
    pallets: Object.keys(backend.db.pallets).length,
    events: Object.values(backend.db.events).reduce((n, l) => n + l.length, 0),
    workspaces: Object.keys(backend.db.workspaces).length,
  };

  const reset = async (f: FixtureName) => {
    setBusy(true);
    await backend.reset(f);
    try {
      localStorage.removeItem("pl.tour.start");
      localStorage.removeItem("pl.tour.found");
    } catch {
      /* ignore */
    }
    setBusy(false);
    setConfirm(null);
    toast(
      f === "scenario"
        ? "Loaded the busy warehouse: 200 pallets and a second company"
        : "Demo warehouse reset to its starting state",
    );
  };

  return (
    <div className="stack">
      <PageHead
        title="Settings"
        sub="Display choices are saved on this device only."
      />

      <div className="panel stack" data-tour="settings-display">
        <div className="panel-title">Display</div>
        <Setting label="Theme">
          <Seg<Prefs["theme"]>
            value={prefs.theme}
            options={[
              ["system", "Match device"],
              ["light", "Light"],
              ["dark", "Dark"],
            ]}
            onChange={(theme) => setPrefs({ theme })}
          />
        </Setting>
        <Setting
          label="Text size"
          hint="Larger text and buttons for gloves and bright sunlight."
        >
          <Seg<Prefs["text"]>
            value={prefs.text}
            options={[
              ["normal", "Standard"],
              ["large", "Large"],
            ]}
            onChange={(text) => setPrefs({ text })}
          />
        </Setting>
        <Setting
          label="Start page"
          hint="Dashboard opens when you sign in, or when you come back after 2 hours away. A quick refresh keeps your place."
        >
          <span>Dashboard</span>
        </Setting>
        <label className="toggle">
          <input
            type="checkbox"
            checked={prefs.explain}
            onChange={(e) => setPrefs({ explain: e.target.checked })}
          />
          <span>
            <strong>Show “How this works” explanations</strong> on every screen.
          </span>
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={prefs.haptics}
            onChange={(e) => setPrefs({ haptics: e.target.checked })}
          />
          <span>
            <strong>Vibrate on scans and results</strong> (on phones that
            support it).
          </span>
        </label>
        <div className="row">
          <button className="btn" onClick={() => setTourOpen(true)}>
            <Icon name="tour" /> Start the practice shift
          </button>
          <button className="btn" onClick={() => setAccountsOpen(true)}>
            <Icon name="user" /> Choose another demo account
          </button>
        </div>
      </div>

      <div className="panel stack">
        <div className="panel-title">Tools</div>
        <div className="row">
          <button className="btn" onClick={() => go("scanners")}>
            Scanner setup
          </button>
          {(role === "OWNER" || role === "SUPERVISOR") && (
            <button className="btn" onClick={() => go("data")}>
              Data and storage
            </button>
          )}
        </div>
        <label className="toggle">
          <input
            type="checkbox"
            checked={prefs.advancedTools}
            onChange={(e) => setPrefs({ advancedTools: e.target.checked })}
          />
          <span>Show advanced demo tools and technical details</span>
        </label>
        <p className="muted">
          For testing only: simulate conflicts, network failures and offline
          recovery. These controls are hidden from the everyday workflow.
        </p>
        {prefs.advancedTools && (
          <div className="row">
            <button className="btn" onClick={() => go("sync")}>
              Sync and offline
            </button>
            <button className="btn" onClick={() => go("lab")}>
              Integrity lab
            </button>
            <button className="btn" onClick={() => startGuide(0)}>
              Full portal walkthrough
            </button>
          </div>
        )}
      </div>

      <div className="panel stack">
        <div className="panel-title">Demo data</div>
        <p style={{ margin: 0 }}>
          This browser holds {counts.pallets} pallets, {counts.events} history
          entries and {counts.workspaces}{" "}
          {counts.workspaces === 1 ? "company" : "companies"} (
          {backend.meta.fixture === "scenario"
            ? "busy warehouse"
            : "small warehouse"}
          ).
        </p>
        <Explain title="What resetting does">
          <p>
            Resetting rebuilds the demo warehouse from a fixed seed, so it
            always starts the same. It clears this device's offline queue too.
            It only touches this app's own storage in this browser.
          </p>
          <p>
            The busy warehouse adds 200 pallets and a second company, Second
            sample warehouse, that reuses some of the same job and rack codes.
            Switch to the Second warehouse owner account to confirm the two
            companies never see each other's data.
          </p>
        </Explain>
        <div className="row">
          <button className="btn" onClick={() => setConfirm("tiny")}>
            <Icon name="refresh" /> Reset small warehouse
          </button>
          <button className="btn" onClick={() => setConfirm("scenario")}>
            <Icon name="database" /> Load busy warehouse
          </button>
        </div>
      </div>

      <div className="panel stack">
        <div className="panel-title">This device</div>
        <dl className="kv">
          <dt>Storage</dt>
          <dd>
            {backend.storageOk
              ? `Saved in this browser (about ${formatBytes(backend.approxSize())})`
              : `Not available: ${backend.storageError}. New changes are blocked until storage is available.`}
          </dd>
          <dt>Connection</dt>
          <dd>
            {backend.network === "online"
              ? "Online (simulated)"
              : "Offline (simulated)"}
          </dd>
          <dt>Build</dt>
          <dd className="mono" style={{ fontSize: 13 }}>
            {__BUILD_COMMIT__} · {__BUILD_TIME__.slice(0, 16).replace("T", " ")}{" "}
            UTC ·{" "}
            {__BUILD_TARGET__ === "artifact" ? "hosted preview" : "full app"}
          </dd>
        </dl>
        {!backend.storageOk && (
          <Notice tone="warn">
            This browser blocked local storage (private mode can do this).
            Offline queuing is disabled, because a move can only be called
            queued once it is safely saved.
          </Notice>
        )}
      </div>

      {confirm && (
        <Sheet
          title={
            confirm === "scenario"
              ? "Load the busy warehouse?"
              : "Reset the demo warehouse?"
          }
          onClose={() => setConfirm(null)}
        >
          <div className="stack">
            <p style={{ margin: 0 }}>
              Everything you changed in this browser will be replaced. This
              cannot be undone.
            </p>
            <div className="row">
              <button
                className="btn danger big"
                onClick={() => void reset(confirm)}
                disabled={busy}
              >
                {busy ? <Spinner /> : <Icon name="refresh" />}{" "}
                {confirm === "scenario" ? "Load it" : "Reset"}
              </button>
              <button
                className="btn big"
                onClick={() => setConfirm(null)}
                disabled={busy}
              >
                Cancel
              </button>
            </div>
          </div>
        </Sheet>
      )}
    </div>
  );
}

function Setting({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="stack" style={{ gap: 6 }}>
      <div>
        <strong>{label}</strong>
        {hint && (
          <div className="muted" style={{ fontSize: 13.5 }}>
            {hint}
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

function Seg<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
}) {
  return (
    <div className="seg" role="group">
      {options.map(([v, l]) => (
        <button key={v} aria-pressed={value === v} onClick={() => onChange(v)}>
          {l}
        </button>
      ))}
    </div>
  );
}

function LiveSettings() {
  const { prefs, setPrefs, go, signOut, backend, actorId, role } = useApp();
  const me = actorId ? backend.db.users[actorId] : null;
  return (
    <div className="stack">
      <PageHead
        title="Account settings"
        sub="Your account and preferences for this device."
      />
      <div className="panel stack">
        <strong>{me?.name}</strong>
        <span>{me?.email}</span>
        <span>{role ? ROLE_LABEL[role] : "Team member"}</span>
      </div>
      <div className="panel stack">
        <Setting label="Theme">
          <Seg<Prefs["theme"]>
            value={prefs.theme}
            options={[
              ["system", "Match device"],
              ["light", "Light"],
              ["dark", "Dark"],
            ]}
            onChange={(theme) => setPrefs({ theme })}
          />
        </Setting>
        <Setting label="Text size">
          <Seg<Prefs["text"]>
            value={prefs.text}
            options={[
              ["normal", "Standard"],
              ["large", "Large"],
            ]}
            onChange={(text) => setPrefs({ text })}
          />
        </Setting>
        <button className="btn" onClick={() => go("scanners")}>
          Scanner setup
        </button>
        <button className="btn" onClick={() => go("contact")}>
          Remote support
        </button>
        <button className="btn" onClick={signOut}>
          Log out
        </button>
      </div>
    </div>
  );
}

/** Warehouse-wide: weight and size limits on locations, and weight and size on every pallet headed for one. */
export function MeasurementsSetting() {
  const { backend, workspaceId, role, send } = useApp();
  const wh = Object.values(backend.db.warehouses).find(
    (w) => w.workspace_id === workspaceId && w.active,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!wh) return null;
  const on = !!wh.advanced_measurements;
  const canChange = role === "OWNER" || role === "SUPERVISOR";
  const toggle = async () => {
    setBusy(true);
    setError("");
    const o = await send("set_measurements", { advanced: !on }, null, {
      commandId: uuid(),
    });
    setBusy(false);
    if (!(o.status === "result" && o.result.ok))
      setError(
        o.status === "result" && !o.result.ok
          ? o.result.message
          : o.status === "offline"
            ? o.message
            : "No answer from the server. Reload to check.",
      );
  };
  return (
    <div className="panel stack" data-testid="measurements-setting">
      <div className="panel-title">Weight and size tracking</div>
      <label className="toggle">
        <input
          type="checkbox"
          checked={on}
          disabled={!canChange || busy || backend.network === "offline"}
          onChange={() => void toggle()}
        />
        <span>Advanced weight and dimensions logging</span>
      </label>
      <p className="hint" style={{ margin: 0 }}>
        Turning this on lets locations have a weight limit and a space size, and
        requires a measured weight (and, for sized spaces, length, width and
        height) for every pallet moved to a location with one of those limits.
        Off, locations count standard pallet spaces only. The setting applies
        to everyone in this warehouse.
        {!canChange && " A supervisor or owner can change it."}
      </p>
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  );
}
