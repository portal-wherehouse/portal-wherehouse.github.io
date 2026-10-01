import { createPortal } from "react-dom";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { useApp } from "../../app/state";
import { FirebaseBackend, cloudMessage } from "../../data/firebase";
import { roleAllows } from "../../domain/transitions";
import { BRAND } from "../../brand";
import { Icon } from "../../ui/icons";
import { Field, Notice, Sheet } from "../../ui/ui";
import { AdminSheet } from "../admin/AdminSheet";
import { MeasurementsSetting } from "../settings/Settings";
import { SetupSetting } from "../settings/SetupSetting";
import type { Warehouse } from "../../domain/types";

export function WarehouseMenu({ warehouse }: { warehouse: Warehouse }) {
  const app = useApp(),
    { backend, actorId, workspaceId, go, toast } = app;
  const cloud = backend instanceof FirebaseBackend ? backend : null;
  const multi = cloud ? cloud.multiWarehouse : false;
  // The sample's warehouses can always be switched; adding one stays a plan feature.
  const canSwitch = cloud ? cloud.multiWarehouse : true;
  const canEdit = roleAllows(app.role, "update_warehouse");
  const [open, setOpen] = useState(false),
    [settings, setSettings] = useState(false),
    [upgrade, setUpgrade] = useState(false),
    [adding, setAdding] = useState(false);
  const [others, setOthers] = useState<
      { id: string; name: string; available: boolean }[]
    >([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const container = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 12, width: 320 });
  useLayoutEffect(() => {
    if (!open || !container.current) return;
    const rect = container.current.getBoundingClientRect(),
      width = Math.min(320, window.innerWidth - 24);
    setPosition({
      top: rect.bottom + 8,
      left: Math.max(
        12,
        Math.min(rect.right - width, window.innerWidth - width - 12),
      ),
      width,
    });
    const resize = () => setOpen(false);
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [open]);
  const ids =
    cloud?.workspaceIds ??
    backend.db.memberships
      .filter((m) => m.user_id === actorId && m.active)
      .map((m) => m.workspace_id);
  const otherCount = ids.filter((id) => id !== workspaceId).length;
  const load = async (offset = 0) => {
    setBusy(true);
    setError("");
    try {
      const rows = cloud
        ? await cloud.warehouseNames(offset)
        : ids
            .filter((id) => id !== workspaceId)
            .slice(offset, offset + 20)
            .map((id) => ({
              id,
              name: backend.db.workspaces[id]?.name || "Warehouse",
              available: true,
            }));
      setOthers((old) => (offset ? [...old, ...rows] : rows));
    } catch (e) {
      setError(cloudMessage(e));
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (open && otherCount) void load();
  }, [open, workspaceId]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  const close = () => setOpen(false);
  const switchTo = async (id: string) => {
    if (!canSwitch) {
      close();
      setUpgrade(true);
      return;
    }
    close();
    setBusy(true);
    try {
      if (cloud) await cloud.switchWarehouse(id);
      else app.setWorkspace(id);
      go("overview");
    } catch (e) {
      toast(cloudMessage(e), "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <div
        className="warehouse-switcher"
        ref={container}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            close();
            trigger.current?.focus();
          }
          if (open && ["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
            const items = Array.from(
              container.current?.querySelectorAll<HTMLButtonElement>(
                "[role=menuitem]:not(:disabled)",
              ) ?? [],
            );
            if (!items.length) return;
            e.preventDefault();
            const i = items.indexOf(
              document.activeElement as HTMLButtonElement,
            );
            const next =
              e.key === "Home"
                ? 0
                : e.key === "End"
                  ? items.length - 1
                  : e.key === "ArrowDown"
                    ? (i + 1) % items.length
                    : (i - 1 + items.length) % items.length;
            items[next].focus();
          }
        }}
      >
        <button
          ref={trigger}
          type="button"
          className="chip warehouse-name-button"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={`Warehouse: ${warehouse.name}`}
          onClick={() => setOpen((v) => !v)}
        >
          <Icon name="locations" />
          <span>{warehouse.name}</span>
          <Icon name="chevronDown" />
        </button>
        <button
          type="button"
          className="warehouse-settings-button"
          aria-label="Warehouse settings"
          title={
            canEdit
              ? "Warehouse settings"
              : "Only managers can edit warehouse settings"
          }
          disabled={!canEdit}
          onClick={() => {
            close();
            setSettings(true);
          }}
        >
          <Icon name="settings" />
        </button>
        {open && (
          <div
            className="warehouse-dropdown"
            style={position}
            role="menu"
            aria-label="Warehouse menu"
          >
            <div className="warehouse-menu-heading">
              <strong>{warehouse.name}</strong>
              <small>Current warehouse</small>
            </div>
            <button
              role="menuitem"
              className="warehouse-menu-item"
              disabled={!canEdit}
              onClick={() => {
                close();
                setSettings(true);
              }}
            >
              <Icon name="settings" />
              Settings
            </button>
            {!!otherCount && (
              <>
                <div className="warehouse-menu-label">
                  Switch warehouse{!canSwitch && <small>Contact to upgrade</small>}
                </div>
                {others.map((row) => (
                  <button
                    role="menuitem"
                    key={row.id}
                    className="warehouse-menu-item"
                    disabled={busy || !row.available}
                    onClick={() => void switchTo(row.id)}
                  >
                    <Icon name="locations" />
                    <span>{row.name}</span>
                    {!canSwitch && <Icon name="lock" />}
                  </button>
                ))}
                {busy && <p role="status">Loading warehouses…</p>}
                {error && <p role="alert">{error}</p>}
                {others.length < otherCount && !busy && (
                  <button
                    role="menuitem"
                    className="warehouse-menu-item"
                    onClick={() => void load(others.length)}
                  >
                    {error ? "Retry" : "More warehouses"}
                  </button>
                )}
              </>
            )}
            <button
              role="menuitem"
              className="warehouse-menu-item warehouse-add"
              onClick={() => {
                close();
                if (!multi) setUpgrade(true);
                else setAdding(true);
              }}
            >
              <Icon name="plus" />
              <span>
                Add warehouse{!multi && <small>Contact to upgrade</small>}
              </span>
            </button>
          </div>
        )}
      </div>
      {createPortal(<div className="customer-app">
      {settings && (
        <WarehouseSettings
          warehouse={warehouse}
          onClose={() => setSettings(false)}
        />
      )}
      {upgrade && (
        <Sheet title="Oops!" onClose={() => setUpgrade(false)}>
          <div className="stack">
            <p>
              Your current plan does not include this feature. Please contact us
              to upgrade.
            </p>
            <a
              className="btn primary"
              href={`mailto:${BRAND.supportEmail}?subject=${encodeURIComponent("Wherehouse upgrade: " + warehouse.name)}`}
            >
              Contact to upgrade
            </a>
            <button className="btn" onClick={() => setUpgrade(false)}>
              Back to warehouse
            </button>
          </div>
        </Sheet>
      )}
      {adding && <AddWarehouse onClose={() => setAdding(false)} />}
      </div>, document.body)}
    </>
  );
}

function WarehouseSettings({
  warehouse: wh,
  onClose,
}: {
  warehouse: Warehouse;
  onClose: () => void;
}) {
  const { backend } = useApp();
  const [name, setName] = useState(wh.name),
    [code, setCode] = useState(wh.code),
    [address, setAddress] = useState(wh.address || ""),
    [timezone, setTimezone] = useState(wh.timezone),
    [phone, setPhone] = useState(wh.phone || ""),
    [email, setEmail] = useState(wh.contact_email || ""),
    [notes, setNotes] = useState(wh.receiving_notes || "");
  const ready =
    !(backend instanceof FirebaseBackend) ||
    backend.summary?.warehouse_settings_version === 1;
  return (
    <AdminSheet
      title="Warehouse settings"
      kind="update_warehouse"
      verb="Save warehouse"
      done="Warehouse details saved"
      expectedVersion={wh.version ?? 1}
      valid={
        ready &&
        backend.network !== "offline" &&
        name.trim().length >= 2 &&
        !!code.trim() &&
        !!timezone.trim()
      }
      payload={() => ({
        name,
        code,
        address,
        timezone,
        phone,
        contact_email: email,
        receiving_notes: notes,
      })}
      onClose={onClose}
    >
      {!ready && (
        <Notice tone="info">
          Editing warehouse details needs the warehouse server update.
        </Notice>
      )}
      <Field label="Warehouse name" htmlFor="wh-name">
        <input
          id="wh-name"
          className="input"
          value={name}
          maxLength={100}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <Field
        label="Label code"
        htmlFor="wh-code"
        hint="A short warehouse name for printed labels, such as CHS."
      >
        <input
          id="wh-code"
          className="input"
          value={code}
          maxLength={20}
          onChange={(e) => setCode(e.target.value)}
        />
      </Field>
      <Field label="Warehouse address" htmlFor="wh-address">
        <textarea
          id="wh-address"
          className="textarea"
          value={address}
          maxLength={250}
          onChange={(e) => setAddress(e.target.value)}
        />
      </Field>
      <Field
        label="Time zone"
        htmlFor="wh-timezone"
        hint="For example, America/New_York. Used for reminder dates."
      >
        <input
          id="wh-timezone"
          className="input"
          value={timezone}
          maxLength={100}
          onChange={(e) => setTimezone(e.target.value)}
        />
      </Field>
      <Field label="Phone (optional)" htmlFor="wh-phone">
        <input
          id="wh-phone"
          className="input"
          value={phone}
          maxLength={40}
          onChange={(e) => setPhone(e.target.value)}
        />
      </Field>
      <Field label="Contact email (optional)" htmlFor="wh-email">
        <input
          id="wh-email"
          className="input"
          type="email"
          value={email}
          maxLength={120}
          onChange={(e) => setEmail(e.target.value)}
        />
      </Field>
      <Field label="Receiving instructions (optional)" htmlFor="wh-notes">
        <textarea
          id="wh-notes"
          className="textarea"
          value={notes}
          maxLength={500}
          onChange={(e) => setNotes(e.target.value)}
        />
      </Field>
      <p className="hint">
        Name and label code update future prints. Existing QR labels keep
        working.
      </p>
      <SetupSetting />
      <MeasurementsSetting />
    </AdminSheet>
  );
}
function AddWarehouse({ onClose }: { onClose: () => void }) {
  const { backend, role, go } = useApp();
  const b = backend as FirebaseBackend;
  const [name, setName] = useState(""),
    [key, setKey] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Sheet title="Add warehouse" onClose={onClose}>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          setError("");
          void (async () => {
            try {
              const result = await httpsCallable(
                b.functions!,
                "createWarehouse",
              )({
                name,
                warehouseName: name,
                usageKey: key,
                sourceWorkspaceId: b.activeWorkspace,
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              });
              await b.chooseWorkspace(
                (result.data as { workspaceId: string }).workspaceId,
              );
              onClose();
              go("overview");
            } catch (e) {
              setError(cloudMessage(e));
            } finally {
              setBusy(false);
            }
          })();
        }}
      >
        {role !== "OWNER" ? (
          <Notice tone="info">Ask the account owner to add a warehouse.</Notice>
        ) : (
          <>
            <p>
              Each additional warehouse needs its own usage key. Contact us to
              arrange access.
            </p>
            <Field label="Warehouse name" htmlFor="new-wh-name">
              <input
                id="new-wh-name"
                className="input"
                required
                minLength={2}
                maxLength={100}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
            <Field label="Usage key" htmlFor="new-wh-key">
              <input
                id="new-wh-key"
                className="input"
                required
                type="password"
                autoComplete="off"
                value={key}
                onChange={(e) => setKey(e.target.value)}
              />
            </Field>
            <button type="submit" className="btn primary" disabled={busy}>
              {busy ? "Creating warehouse…" : "Create warehouse"}
            </button>
          </>
        )}
        {error && <p role="alert">{error}</p>}
      </form>
    </Sheet>
  );
}
