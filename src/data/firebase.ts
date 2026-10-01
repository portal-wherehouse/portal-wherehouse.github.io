import {
  barcodeMatchKey,
  productKey,
  type ExpectedShipment,
  type ProductMemory,
} from "../domain/receiving";
import { licenseAccess, RENEWAL_GRACE_MS } from "../domain/license";
import {
  OfflineStore,
  OFFLINE_ACCESS_MS,
  MAX_OFFLINE_MOVES,
} from "./offlineStore";
import {
  initializeAppCheck,
  getToken as getAppCheckToken,
  setTokenAutoRefreshEnabled,
  ReCaptchaEnterpriseProvider,
} from "firebase/app-check";
import { palletQuery, PAGE_SIZE, type LiveFilter } from "./liveQueries";
import { parseTransferNumber } from "../domain/transfers";
import {
  normalizeCode,
  parsePalletCode,
  parseLabelPayload,
} from "../domain/codes";
import { initializeApp } from "firebase/app";
import { firebaseConfig } from "./firebaseConfig";
import {
  getAuth,
  onAuthStateChanged,
  signOut,
  connectAuthEmulator,
  type Auth,
} from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getFirestore,
  onSnapshot,
  connectFirestoreEmulator,
  type Firestore,
  type Unsubscribe,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  documentId,
  type Query,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import {
  getFunctions,
  httpsCallable,
  connectFunctionsEmulator,
  type Functions,
} from "firebase/functions";
import {
  getStorage,
  ref,
  uploadString,
  getBlob,
  connectStorageEmulator,
  type FirebaseStorage,
} from "firebase/storage";
import { createStore, get, set } from "idb-keyval";
import { Backend, type Outcome, type PendingSend } from "./backend";
import { Outbox, eligibility, type OutboxEntry } from "./outbox";
import { Engine, emptyDb } from "../demo/engine";
import type { CommandEnvelope, CommandResult } from "../domain/types";

export { firebaseConfig };
export class FirebaseBackend extends Backend {
  override mode = "firebase" as const;
  auth: Auth | null = null;
  firestore: Firestore | null = null;
  functions: Functions | null = null;
  storage: FirebaseStorage | null = null;
  prepareSignup: () => Promise<void> = async () => {
    throw new Error("Account registration is not configured.");
  };
  workspaceIds: string[] = [];
  invitations: { email: string; name: string; role: string }[] = [];
  multiWarehouse = false;
  licenseBlocked = false;
  readOnly = false;
  graceEndsAt = 0;
  private offlineStore: OfflineStore | null = null;
  private verifiedAt = 0;
  private licenseExpiresAt = 0;
  private cacheTimer: ReturnType<typeof setTimeout> | null = null;
  private syncing: Promise<Awaited<ReturnType<Backend["sync"]>>> | null = null;
  private expiryTimer: ReturnType<typeof setTimeout> | null = null;
  activeWorkspace: string | null = null;
  private unsubscribe: Unsubscribe[] = [];
  private profileStop: Unsubscribe | null = null;
  private generation = 0;
  private photoUrls = new Map<string, string>();
  private photoPending = new Map<string, Promise<string>>();
  private liveStore = createStore("wherehouse-cloud-requests", "kv");
  private scope = "";
  constructor() {
    super();
    this.db = emptyDb();
    this.engine = new Engine(this.db);
    this.meta = { fixture: "tiny", created_at: new Date().toISOString() };
    this.outbox = new Outbox({
      load: async () => [],
      save: async () => {
        throw new Error("Reconnect before making changes.");
      },
    });
  }
  static async connect() {
    const b = new FirebaseBackend();
    const config = firebaseConfig();
    if (!config) return b;
    b.network = navigator.onLine ? "online" : "offline";
    if (
      (import.meta.env.DEV || import.meta.env.MODE === "emulator") &&
      import.meta.env.VITE_FIREBASE_EMULATORS === "true" &&
      (config.projectId !== "demo-wherehouse" ||
        config.storageBucket !== "demo-wherehouse.appspot.com" ||
        import.meta.env.VITE_FIREBASE_APPCHECK_SITE_KEY)
    )
      throw Error(
        "Local testing requires demo-wherehouse, its emulator bucket and no live App Check key.",
      );
    b.configured = true;
    b.loading = true;
    const app = initializeApp(config);
    const appCheckKey = import.meta.env.VITE_FIREBASE_APPCHECK_SITE_KEY;
    let appCheck: ReturnType<typeof initializeAppCheck> | null = null;
    b.auth = getAuth(app);
    b.firestore = getFirestore(app);
    b.functions = getFunctions(app, "us-east1");
    b.storage = getStorage(app);
    if (
      (import.meta.env.DEV || import.meta.env.MODE === "emulator") &&
      import.meta.env.VITE_FIREBASE_EMULATORS === "true"
    ) {
      connectAuthEmulator(b.auth, "http://127.0.0.1:9099", {
        disableWarnings: true,
      });
      connectFirestoreEmulator(b.firestore, "127.0.0.1", 8080);
      connectFunctionsEmulator(b.functions, "127.0.0.1", 5001);
      connectStorageEmulator(b.storage, "127.0.0.1", 9199);
    }
    b.prepareSignup = async () => {
      if (
        (import.meta.env.DEV || import.meta.env.MODE === "emulator") &&
        import.meta.env.VITE_FIREBASE_EMULATORS === "true"
      )
        return;
      if (!appCheckKey)
        throw new Error(
          "Account verification is not configured. Contact support.",
        );
      if (!appCheck)
        appCheck = initializeAppCheck(app, {
          provider: new ReCaptchaEnterpriseProvider(appCheckKey),
          isTokenAutoRefreshEnabled: true,
        });
      try {
        await getAppCheckToken(appCheck);
      } catch {
        throw new Error(
          "Could not verify this browser. Refresh the page and try again.",
        );
      }
    };
    b.scope = config.projectId!;
    onAuthStateChanged(b.auth, async (user) => {
      b.profileStop?.();
      b.profileStop = null;
      b.clear();
      b.authUid = user?.uid ?? null;
      b.workspaceIds = [];
      b.pending = [];
      b.outbox = new Outbox({
        load: async () => [],
        save: async () => {
          throw Error("Sign in first.");
        },
      });
      b.offlineStore = null;
      b.loading = !!user;
      b.cloudError = "";
      b.bump(false);
      if (!user || !user.emailVerified) {
        if (appCheck) setTokenAutoRefreshEnabled(appCheck, false);
        b.loading = false;
        b.bump(false);
        return;
      }
      if (appCheckKey && !appCheck)
        appCheck = initializeAppCheck(app, {
          provider: new ReCaptchaEnterpriseProvider(appCheckKey),
          isTokenAutoRefreshEnabled: true,
        });
      else if (appCheck) setTokenAutoRefreshEnabled(appCheck, true);
      const uid = user.uid;
      b.offlineStore = new OfflineStore(b.scope, uid);
      const offlineStore = b.offlineStore;
      b.outbox = new Outbox(
        {
          load: () => offlineStore.loadQueue(),
          save: (entries) => offlineStore.saveQueue(entries),
        },
        true,
      );
      b.outbox.subscribe(() => b.bump(false));
      try {
        await b.outbox.init(true);
        b.pending =
          (await get<PendingSend[]>(`${b.scope}:${uid}`, b.liveStore)) ?? [];
      } catch {
        b.cloudError =
          "This browser cannot read saved requests. Enable browser storage and reload before making changes.";
        b.loading = false;
        b.bump(false);
        return;
      }
      if (b.authUid !== uid) return;
      if (b.network === "offline") {
        b.workspaceIds = await offlineStore.workspaces();
        await b.chooseWorkspace(b.workspaceIds[0] ?? "");
        return;
      }
      // Adding warehouses a manager authorized for this email is a server call that can be slow to
      // start. It runs beside opening the warehouse this account already has, not before it.
      b.joining = httpsCallable(b.functions!, "joinAuthorizedWarehouses")({})
        .then(() => {})
        .catch(() => {
          if (b.authUid === uid && !b.workspaceIds.length) {
            b.cloudError =
              "Could not check authorized warehouse access. Try Refresh access.";
            b.bump(false);
          }
        })
        .finally(async () => {
          if (b.authUid !== uid) return;
          // Read the profile once more, so a warehouse the check just added opens without a detour.
          const profile = await getDoc(doc(b.firestore!, "users", uid)).catch(() => null);
          if (b.authUid !== uid) return;
          b.joining = null;
          if (profile) b.workspaceIds = profile.data()?.workspaces ?? b.workspaceIds;
          if (!b.activeWorkspace || !b.workspaceIds.includes(b.activeWorkspace))
            void b.chooseWorkspace(b.workspaceIds[0] ?? "");
        });
      b.watchProfile();
    });
    const online = () => {
      const wasOffline = b.network === "offline";
      b.network = navigator.onLine ? "online" : "offline";
      if (b.network === "offline")
        void b.useOfflineCache().catch(() => {
          b.storageError =
            "Offline records could not be saved. Keep this page open and reconnect.";
          b.bump(false);
        });
      else if (wasOffline && b.authUid) {
        b.watchProfile();
        // Re-establish membership, license and listeners before sending any saved move.
        void b
          .chooseWorkspace(b.activeWorkspace || b.workspaceIds[0] || "")
          .then(() => {
            if (!b.cloudError && b.authUid && b.activeWorkspace)
              void b.sync(b.authUid, b.activeWorkspace).catch((e) => {
                b.storageError = cloudMessage(e);
                b.bump(false);
              });
          });
      }
      b.bump(false);
    };
    window.addEventListener("online", online);
    window.addEventListener("offline", online);
    online();
    return b;
  }
  private watchProfile() {
    const uid = this.authUid;
    if (!uid || !this.firestore || !this.offlineStore || this.profileStop)
      return;
    this.profileStop = onSnapshot(
      doc(this.firestore!, "users", uid),
      (snapshot) => {
        this.metrics.reads++;
        if (this.authUid !== uid) return;
        this.workspaceIds = snapshot.data()?.workspaces ?? [];
        void this.offlineStore!.rememberWorkspaces(this.workspaceIds).catch(
          () => {},
        );
        // No warehouse yet while the authorization check runs: keep loading until it finishes.
        if (!this.workspaceIds.length && this.joining) return;
        if (
          !this.activeWorkspace ||
          !this.workspaceIds.includes(this.activeWorkspace)
        )
          void this.chooseWorkspace(this.workspaceIds[0] ?? "");
        else this.bump(false);
      },
      () =>
        this.fail(
          "Could not load your account. Check your connection and try signing in again.",
        ),
    );
  }
  private clear() {
    this.summary = null;
    this.cache = null;
    this.verifiedAt = 0;
    this.readOnly = false;
    this.multiWarehouse = false;
    if (this.cacheTimer) clearTimeout(this.cacheTimer);
    this.cacheTimer = null;
    if (this.expiryTimer) clearTimeout(this.expiryTimer);
    this.expiryTimer = null;
    this.invitations = [];
    this.viewGeneration++;
    this.viewKey = "";
    this.viewStops.forEach((f) => f());
    this.viewStops = [];
    this.pages.clear();
    this.generation++;
    this.unsubscribe.forEach((f) => f());
    this.unsubscribe = [];
    for (const url of this.photoUrls.values()) URL.revokeObjectURL(url);
    this.photoUrls.clear();
    this.photoPending.clear();
    this.db = emptyDb();
    this.engine = new Engine(this.db);
    this.activeWorkspace = null;
  }
  private fail(message: string) {
    if (this.activeWorkspace)
      void this.offlineStore?.forget(this.activeWorkspace);
    this.clear();
    this.cloudError = message;
    this.loading = false;
    this.bump(false);
  }
  override async logout() {
    const offlineStore = this.offlineStore;
    await Promise.allSettled(
      this.workspaceIds.map((ws) => offlineStore?.forget(ws)),
    );
    this.profileStop?.();
    this.profileStop = null;
    this.clear();
    this.authUid = null;
    this.pending = [];
    this.workspaceIds = [];
    this.outbox = new Outbox({
      load: async () => [],
      save: async () => {
        throw Error("Sign in first.");
      },
    });
    this.bump(false);
    if (this.auth) await signOut(this.auth);
  }
  override async chooseWorkspace(ws: string) {
    this.clear();
    this.cloudError = "";
    this.licenseBlocked = false;
    if (!ws || !this.authUid || !this.firestore) {
      this.loading = false;
      this.bump(false);
      return;
    }
    this.activeWorkspace = ws;
    this.loading = true;
    this.bump(false);
    if (this.network === "offline") {
      if (!(await this.useOfflineCache()))
        this.fail(
          "Open this warehouse while connected before using it offline. Cached access lasts 24 hours; saved moves are kept until you reconnect.",
        );
      this.loading = false;
      this.bump(false);
      return;
    }
    const gen = this.generation;
    try {
      const licenseRef = doc(this.firestore, "licenses", ws);
      const checkLicense = (data: any) => {
        if (gen !== this.generation) return false;
        if (this.expiryTimer) clearTimeout(this.expiryTimer);
        const expiresAt = data?.expires_at?.toMillis() || 0;
        const access = licenseAccess(data?.active === true, expiresAt);
        if (access === "blocked") {
          this.licenseBlocked = true;
          this.fail(
            "Warehouse access is paused. Contact the account owner to renew. Existing records have not been deleted.",
          );
          return false;
        }
        this.readOnly = access === "read-only";
        this.multiWarehouse = data?.features?.multiWarehouse === true;
        this.licenseExpiresAt = expiresAt;
        this.graceEndsAt = expiresAt + RENEWAL_GRACE_MS;
        const remaining =
          (this.readOnly ? this.graceEndsAt : expiresAt) - Date.now();
        this.expiryTimer = setTimeout(
          () => {
            checkLicense(data);
            this.bump(false);
          },
          Math.min(remaining, 2147483647),
        );
        this.bump(false);
        return true;
      };
      // The three opening reads go out together; each result is still checked in order.
      const membershipRef = doc(this.firestore, "workspaces", ws, "members", this.authUid);
      const [license, membership, root] = await Promise.all([
        getDoc(licenseRef),
        getDoc(membershipRef),
        getDoc(doc(this.firestore, "workspaces", ws)).catch(() => null),
      ]);
      if (!checkLicense(license.data())) return;
      this.unsubscribe.push(
        onSnapshot(
          licenseRef,
          (snap) => {
            this.metrics.reads++;
            checkLicense(snap.data());
          },
          () => {
            if (gen === this.generation)
              this.fail("Could not verify warehouse access. Sign in again.");
          },
        ),
      );
      if (gen !== this.generation) return;
      if (!membership.data()?.active) {
        this.fail("Your access to this warehouse was removed.");
        return;
      }
      const manager = ["OWNER", "SUPERVISOR"].includes(membership.data()?.role);
      if (!root) throw Error("Warehouse could not load.");
      this.metrics.reads += 3;
      if (gen !== this.generation) return;
      this.ingest("workspaces", [root.data()]);
      this.ingest("members", [membership.data()]);
      this.unsubscribe.push(
        onSnapshot(
          doc(this.firestore, "workspaces", ws, "members", this.authUid),
          (s) => {
            this.metrics.reads++;
            if (gen !== this.generation) return;
            if (!s.get("active")) {
              this.fail("Your warehouse access was removed.");
              return;
            }
            this.ingest("members", [s.data()]);
            if (["OWNER", "SUPERVISOR"].includes(s.get("role")) !== manager) {
              void this.chooseWorkspace(ws);
              return;
            }
            this.bump(false);
          },
        ),
      );
      await Promise.all(
        ["warehouses", "members", "jobs", "locations"].map((table) =>
          this.page(
            "directory:" + table,
            table,
            query(
              this.col(table),
              orderBy(
                table === "jobs" || table === "locations"
                  ? "code"
                  : documentId(),
              ),
              limit(PAGE_SIZE),
            ),
            true,
          ),
        ),
      );
      if (gen !== this.generation) return;
      // Two metadata documents, not a subscription to operational collections.
      const facility = this.engine.activeWarehouse(ws);
      if (facility)
        for (const [table, ref] of [
          ["workspaces", doc(this.firestore, "workspaces", ws)],
          ["warehouses", doc(this.col("warehouses"), facility.id)],
        ] as const)
          this.unsubscribe.push(
            onSnapshot(
              ref,
              (snap) => {
                this.metrics.reads++;
                if (gen !== this.generation || !snap.exists()) return;
                this.ingest(table, [snap.data()]);
                this.bump(false);
              },
              () => {
                if (gen === this.generation) {
                  this.cloudError =
                    "Could not refresh warehouse details. Reconnect and try again.";
                  this.bump(false);
                }
              },
            ),
          );
      this.verifiedAt = Date.now();
      this.loading = false;
      this.cloudError = "";
      await this.saveOfflineCache();
      this.bump(false);
      if (
        this.outbox
          .pending(this.authUid!, ws)
          .some((e) => e.status === "queued")
      )
        void this.sync(this.authUid!, ws).catch((e) => {
          this.storageError = cloudMessage(e);
          this.bump(false);
        });
    } catch {
      if (gen === this.generation)
        this.fail(
          "Could not load your warehouse. Check your connection and try again.",
        );
    }
  }
  /** The authorization check that runs at sign-in, while it is still running. */
  joining: Promise<void> | null = null;
  summary: any = null;
  viewLoading = false;
  viewError = "";
  viewKey = "";
  private viewGeneration = 0;
  private viewStops: Unsubscribe[] = [];
  private pages = new Map<
    string,
    {
      q: Query;
      cursor: QueryDocumentSnapshot | undefined;
      more: boolean;
      table: string;
    }
  >();
  private viewRoute: { name: string; id?: string } = { name: "find" };
  private metrics = { reads: 0, photoBytes: 0 };
  usage() {
    return { ...this.metrics };
  }
  private ingest(table: string, values: any[]) {
    for (const v of values) {
      if (table === "invites") continue;
      if (table === "members") {
        const old = this.db.memberships.findIndex(
          (m) => m.user_id === v.user_id,
        );
        if (old >= 0) this.db.memberships.splice(old, 1);
        this.db.memberships.push(v);
        this.db.users[v.user_id] = v.user;
      } else if (table === "events") {
        const list = (this.db.events[v.pallet_id] ??= []);
        const at = list.findIndex((e) => e.id === v.id);
        if (at >= 0) list[at] = v;
        else list.push(v);
        list.sort((a, b) => a.revision - b.revision);
      } else if (table === "audit" || table === "lineage") {
        const list = this.db[table] as any[];
        const at = list.findIndex((x) =>
          table === "lineage" ? x.child_id === v.child_id : x.id === v.id,
        );
        if (at >= 0) list[at] = v;
        else list.push(v);
        if (table === "audit")
          list.sort((a, b) => a.accepted_at.localeCompare(b.accepted_at));
      } else {
        const id = v.id ?? v.token;
        (this.db as any)[table][id] = { ...(this.db as any)[table][id], ...v };
      }
    }
  }
  private async docs(q: Query) {
    const snap = await getDocs(q);
    this.metrics.reads += Math.max(1, snap.size);
    return snap;
  }
  private async one(table: string, id: string, refresh = false) {
    if (!id || id.includes("/") || !this.firestore || !this.activeWorkspace)
      return;
    if (!refresh && (this.db as any)[table]?.[id]) return;
    const gen = this.generation,
      s = await getDoc(
        doc(this.firestore, "workspaces", this.activeWorkspace, table, id),
      );
    this.metrics.reads++;
    if (gen === this.generation) {
      if (s.exists()) this.ingest(table, [s.data()]);
      else if (
        (this.db as any)[table] &&
        !Array.isArray((this.db as any)[table])
      )
        delete (this.db as any)[table][id];
    }
  }
  private col(table: string) {
    return collection(
      this.firestore!,
      "workspaces",
      this.activeWorkspace!,
      table,
    );
  }
  private async hydrate(pallets: any[]) {
    await Promise.all(
      [...new Set(pallets.map((p) => p.job_id).filter(Boolean))].map((id) =>
        this.one("jobs", id),
      ),
    );
    await Promise.all(
      [
        ...new Set(
          pallets
            .flatMap((p) => [
              p.current_location_id,
              p.last_confirmed_location_id,
            ])
            .filter(Boolean),
        ),
      ].map((id) => this.one("locations", id)),
    );
  }
  private async related(table: string, values: any[]) {
    if (table === "pallets") await this.hydrate(values);
    if (table === "events") {
      await Promise.all(
        [...new Set(values.map((e) => e.pallet_id))].map((id) =>
          this.one("pallets", id),
        ),
      );
      await this.hydrate(
        values.map((e) => this.db.pallets[e.pallet_id]).filter(Boolean),
      );
      await Promise.all(
        [...new Set(values.map((e) => e.actor_id))].map((id) =>
          this.db.users[id] ? Promise.resolve() : this.one("members", id, true),
        ),
      );
    }
  }
  async page(key: string, table: string, q: Query, listen = false) {
    const gen = this.generation,
      viewGen = this.viewGeneration;
    const accept = async (s: any) => {
      if (
        gen !== this.generation ||
        (!key.startsWith("directory:") && viewGen !== this.viewGeneration)
      )
        return;
      const removed =
        typeof s.docChanges === "function"
          ? s.docChanges().filter((c: any) => c.type === "removed")
          : [];
      if (table === "pallets")
        await Promise.all(
          removed.map((c: any) => this.one(table, c.doc.id, true)),
        );
      const values = s.docs.map((d: any) => d.data());
      this.ingest(table, values);
      if (table === "invites") this.invitations = values;
      await this.related(table, values);
      if (gen !== this.generation) return;
      // A live first-page refresh never rewinds a cursor the user has already advanced.
      if (!this.pages.has(key))
        this.pages.set(key, {
          q,
          cursor: s.docs.at(-1),
          more: s.size === PAGE_SIZE,
          table,
        });
      this.lastSync = new Date().toISOString();
      this.bump(false);
    };
    if (listen) {
      await new Promise<void>((resolve, reject) => {
        let first = true;
        const stop = onSnapshot(
          q,
          (s) => {
            this.metrics.reads += Math.max(1, s.docChanges().length);
            void accept(s)
              .then(() => {
                if (first) {
                  first = false;
                  resolve();
                }
              })
              .catch(reject);
          },
          (e) => {
            if (first) reject(e);
            else {
              this.viewError = cloudMessage(e);
              this.bump(false);
            }
          },
        );
        (key.startsWith("directory:") ? this.unsubscribe : this.viewStops).push(
          stop,
        );
      });
    } else await accept(await this.docs(q));
  }
  pageMore(key: string) {
    return !!this.pages.get(key)?.more;
  }
  async more(key: string) {
    const p = this.pages.get(key);
    if (!p?.more || !p.cursor) return;
    const gen = this.generation;
    const s = await this.docs(query(p.q, startAfter(p.cursor)));
    if (gen !== this.generation) return;
    const values = s.docs.map((d) => d.data());
    this.ingest(p.table, values);
    await this.related(p.table, values);
    p.cursor = s.docs.at(-1);
    p.more = s.size === PAGE_SIZE;
    if (key === "directory:jobs" || key === "directory:locations")
      await this.loadCounts(p.table as "jobs" | "locations");
    this.bump(false);
  }
  directoryMore() {
    return ["jobs", "locations"].filter((t) => this.pageMore("directory:" + t));
  }
  async warehouseNames(
    offset = 0,
  ): Promise<{ id: string; name: string; available: boolean }[]> {
    if (this.network === "offline" || !this.firestore)
      throw Error("Reconnect to list your warehouses.");
    const uid = this.authUid;
    const rows = await Promise.all(
      this.workspaceIds
        .filter((id) => id !== this.activeWorkspace)
        .slice(offset, offset + 20)
        .map(async (id) => {
          try {
            const snap = await getDoc(doc(this.firestore!, "workspaces", id));
            this.metrics.reads++;
            return {
              id,
              name: snap.get("name") || "Warehouse",
              available: snap.exists(),
            };
          } catch {
            return { id, name: "Warehouse unavailable", available: false };
          }
        }),
    );
    if (uid !== this.authUid)
      throw Error("Account changed. Open the menu again.");
    return rows;
  }
  /** The person's other warehouses in this account (same license owner): where a transfer can go. */
  async transferTargets(): Promise<{ workspace_id: string; name: string }[]> {
    if (this.network === "offline" || !this.firestore || !this.activeWorkspace)
      throw Error("Reconnect to choose where the pallets go.");
    const owner = async (id: string): Promise<string | null> => {
      try {
        const snap = await getDoc(doc(this.firestore!, "licenses", id));
        this.metrics.reads++;
        return snap.get("owner_uid") ?? null;
      } catch {
        return null;
      }
    };
    const mine = await owner(this.activeWorkspace);
    if (!mine) return [];
    const out: { workspace_id: string; name: string }[] = [];
    const others = this.workspaceIds.filter((id) => id !== this.activeWorkspace).length;
    for (let offset = 0; offset < Math.min(others, 100); offset += 20)
      for (const row of await this.warehouseNames(offset))
        if (row.available && (await owner(row.id)) === mine)
          out.push({ workspace_id: row.id, name: row.name });
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }
  async switchWarehouse(id: string) {
    if (!this.multiWarehouse)
      throw Error(
        "Your current plan does not include this feature. Please contact us to upgrade.",
      );
    if (!this.workspaceIds.includes(id))
      throw Error("You do not have access to this warehouse.");
    await this.chooseWorkspace(id);
  }
  async receivingLookup(
    code: string,
  ): Promise<{ product: ProductMemory | null; shipments: ExpectedShipment[] }> {
    if (this.network === "offline")
      throw Error(
        "Reconnect to look up expected shipments and product defaults.",
      );
    const ws = this.activeWorkspace!,
      gen = this.generation;
    const [product, shipments] = await Promise.all([
      getDoc(doc(this.col("products"), productKey(ws, code))),
      this.docs(
        query(
          this.col("shipments"),
          where("pending_barcode", "==", barcodeMatchKey(code)),
          limit(21),
        ),
      ),
    ]);
    this.metrics.reads++;
    if (gen !== this.generation) throw Error("Warehouse changed. Scan again.");
    if (shipments.size > 20)
      throw Error(
        "More than 20 expected deliveries match this product. Import unique pallet barcodes or enter this receipt manually.",
      );
    const rows = shipments.docs.map((d) => d.data() as ExpectedShipment);
    await Promise.all(
      [...new Set(rows.map((r) => r.job_id))].map((id) =>
        this.one("jobs", id, true),
      ),
    );
    if (gen !== this.generation) throw Error("Warehouse changed. Scan again.");
    this.bump(false);
    return {
      product: product.exists() ? (product.data() as ProductMemory) : null,
      shipments: rows,
    };
  }
  async refreshSummary() {
    if (this.network === "offline" || !this.activeWorkspace) return;
    const gen = this.generation;
    const data = (
      await httpsCallable(
        this.functions!,
        "getWarehouseSummary",
      )({ workspaceId: this.activeWorkspace })
    ).data;
    if (gen === this.generation) {
      this.summary = data;
      this.bump(false);
    }
  }

  async refreshView() {
    this.viewKey = "";
    await this.openView(this.viewRoute);
  }
  async openView(route: { name: string; id?: string }) {
    if (!this.activeWorkspace || !this.firestore) return;
    const key = route.name + ":" + (route.id || "");
    if (this.viewKey === key) return;
    this.viewKey = key;
    this.viewRoute = route;
    if (this.network === "offline") {
      this.viewLoading = false;
      this.viewError =
        route.name === "pallet" && route.id && !this.db.pallets[route.id]
          ? "This pallet has not been saved on this device. Reconnect to look it up."
          : "";
      this.bump(false);
      return;
    }
    this.viewGeneration++;
    const gen = this.viewGeneration;
    this.viewStops.forEach((f) => f());
    this.viewStops = [];
    for (const key of this.pages.keys())
      if (!key.startsWith("directory:")) this.pages.delete(key);
    this.viewLoading = true;
    this.viewError = "";
    this.bump(false);
    this.db.pallets = {};
    this.db.events = {};
    this.db.attachments = {};
    this.db.labels = {};
    this.db.lineage = [];
    this.db.audit = [];
    this.db.imports = {};
    try {
      const name = route.name,
        id = route.id;
      if (name === "pallet" && id) {
        await this.one("pallets", id, true);
        const p = this.db.pallets[id];
        if (p) await this.hydrate([p]);
        if (gen !== this.viewGeneration) return;
        this.viewStops.push(
          onSnapshot(doc(this.col("pallets"), id), (s) => {
            this.metrics.reads++;
            if (gen === this.viewGeneration && s.exists()) {
              this.ingest("pallets", [s.data()]);
              void this.hydrate([s.data()]).then(() => this.bump(false));
            }
          }),
        );
        await Promise.all([
          this.page(
            "history",
            "events",
            query(
              this.col("events"),
              where("pallet_id", "==", id),
              orderBy("revision", "desc"),
              limit(PAGE_SIZE),
            ),
            true,
          ),
          this.page(
            "photos",
            "attachments",
            query(
              this.col("attachments"),
              where("pallet_id", "==", id),
              where("state", "==", "ready"),
              limit(3),
            ),
            true,
          ),
          this.loadLabels([id]),
          this.one("lineage", id),
          this.page(
            "children",
            "lineage",
            query(
              this.col("lineage"),
              where("parent_id", "==", id),
              limit(PAGE_SIZE),
            ),
          ),
        ]);
        for (const l of this.db.lineage)
          await Promise.all([
            this.one("pallets", l.parent_id),
            this.one("pallets", l.child_id),
          ]);
      } else if (name === "people")
        await Promise.all([
          this.page(
            "audit",
            "audit",
            query(
              this.col("audit"),
              orderBy("accepted_at", "desc"),
              orderBy(documentId(), "desc"),
              limit(PAGE_SIZE),
            ),
            true,
          ),
          this.page(
            "invites",
            "invites",
            query(this.col("invites"), limit(PAGE_SIZE)),
            true,
          ),
          this.isManager()
            ? this.page(
                "issues",
                "issues",
                query(
                  this.col("issues"),
                  orderBy("created_at", "desc"),
                  limit(PAGE_SIZE),
                ),
                true,
              )
            : Promise.resolve(),
        ]);
      else if (name === "incoming") {
        await this.page(
          "incoming",
          "shipments",
          query(
            this.col("shipments"),
            orderBy("created_at", "desc"),
            limit(PAGE_SIZE),
          ),
          true,
        );
        await Promise.all(
          [...new Set(Object.values(this.db.shipments).map((r) => r.job_id))].map((j) => this.one("jobs", j)),
        );
      } else if (name === "products")
        await this.page(
          "products",
          "products",
          query(
            this.col("products"),
            orderBy("updated_at", "desc"),
            limit(PAGE_SIZE),
          ),
          true,
        );
      else if (name === "receive" && id) {
        await this.one("shipments", id, true);
        const row = this.db.shipments[id];
        if (row?.job_id) await this.one("jobs", row.job_id);
      } else if (name === "import")
        await this.page(
          "imports",
          "imports",
          query(
            this.col("imports"),
            orderBy("created_at", "desc"),
            limit(PAGE_SIZE),
          ),
        );
      else if (name === "job" && id) {
        await this.one("jobs", id, true);
        await this.page(
          "records",
          "pallets",
          palletQuery(this.firestore, this.activeWorkspace, {
            job_id: id,
            include_archived: true,
          }),
          true,
        );
      } else if (name === "location" && id) {
        await this.one("locations", id, true);
        await this.page(
          "records",
          "pallets",
          palletQuery(this.firestore, this.activeWorkspace, {
            location_id: id,
            include_archived: true,
          }),
          true,
        );
        await this.loadLabels([id]);
      } else if (name === "transfers") {
        // Both warehouses keep a copy of each transfer, so this lists outgoing and incoming alike.
        this.db.transfers = {};
        await this.page(
          "transfers",
          "transfers",
          query(
            this.col("transfers"),
            orderBy("created_at", "desc"),
            limit(PAGE_SIZE),
          ),
          true,
        );
      } else if (name === "transfer" && id === "new") {
        // Pallets that can go on a transfer: stored, or received and waiting for a spot.
        await this.page(
          "candidates",
          "pallets",
          query(
            this.col("pallets"),
            where("archived_at", "==", null),
            where("state", "in", ["STORED", "RECEIVED"]),
            orderBy("code"),
            limit(PAGE_SIZE),
          ),
          true,
        );
      } else if (name === "transfer" && id) {
        await this.one("transfers", id, true);
        if (gen !== this.viewGeneration) return;
        this.viewStops.push(
          onSnapshot(doc(this.col("transfers"), id), (s) => {
            this.metrics.reads++;
            if (gen === this.viewGeneration && s.exists()) {
              this.ingest("transfers", [s.data()]);
              this.bump(false);
            }
          }),
        );
      } else if (name === "move") {
        if (id) {
          await this.one("pallets", id, true);
          if (this.db.pallets[id]) await this.hydrate([this.db.pallets[id]]);
        }
        // Received pallets waiting for a rack, for the list under the scanner.
        await this.page(
          "unplaced",
          "pallets",
          query(
            this.col("pallets"),
            where("archived_at", "==", null),
            where("state", "==", "RECEIVED"),
            orderBy("code"),
            limit(PAGE_SIZE),
          ),
          true,
        );
      }

      if (["locations", "map", "overview"].includes(name))
        await this.loadCounts("locations");
      if (["jobs", "job", "overview"].includes(name))
        await this.loadCounts("jobs");
      if (["receive", "import", "pallet"].includes(name))
        await this.refreshSummary();
      if (name === "overview") {
        await this.refreshSummary();
        await this.page(
          "activity",
          "events",
          query(
            this.col("events"),
            orderBy("accepted_at", "desc"),
            orderBy(documentId(), "desc"),
            limit(PAGE_SIZE),
          ),
          true,
        );
      }
      if (name === "locations" || name === "labels")
        await this.loadLabels(Object.keys(this.db.locations));
    } catch (e) {
      if (gen === this.viewGeneration) this.viewError = cloudMessage(e);
    } finally {
      if (gen === this.viewGeneration) {
        this.viewLoading = false;
        this.bump(false);
      }
    }
  }
  private searchGeneration = 0;
  async search(f: LiveFilter) {
    if (this.network === "offline") {
      this.viewLoading = false;
      this.viewError = "";
      this.bump(false);
      return;
    }
    const gen = ++this.searchGeneration,
      viewGen = ++this.viewGeneration;
    this.viewStops.forEach((s) => s());
    this.viewStops = [];
    this.pages.delete("search");
    this.db.pallets = {};
    this.viewError = "";
    this.viewLoading = true;
    this.bump(false);
    try {
      const text = normalizeCode(f.q || "");
      let jobs: string[] = [],
        locations: string[] = [];
      if (text) {
        const [j, l] = await Promise.all([
          this.docs(
            query(this.col("jobs"), where("code", "==", text), limit(1)),
          ),
          this.docs(
            query(this.col("locations"), where("code", "==", text), limit(1)),
          ),
        ]);
        this.ingest(
          "jobs",
          j.docs.map((d) => d.data()),
        );
        this.ingest(
          "locations",
          l.docs.map((d) => d.data()),
        );
        jobs = j.docs.map((d) => d.id);
        locations = l.docs.map((d) => d.id);
      }
      if (gen !== this.searchGeneration || viewGen !== this.viewGeneration)
        return;
      await this.page(
        "search",
        "pallets",
        palletQuery(this.firestore!, this.activeWorkspace!, f, jobs, locations),
        true,
      );
    } catch (e) {
      if (gen === this.searchGeneration) this.viewError = cloudMessage(e);
    } finally {
      if (gen === this.searchGeneration) {
        this.viewLoading = false;
        this.bump(false);
      }
    }
  }
  /** Everything a label preview draws: the pallets or locations, their jobs, and their active labels. */
  async loadForLabels(palletIds: string[], locationIds: string[]) {
    await Promise.all([
      ...palletIds.map((id) => this.one("pallets", id)),
      ...locationIds.map((id) => this.one("locations", id)),
    ]);
    await this.hydrate(palletIds.map((id) => this.db.pallets[id]).filter(Boolean));
    await this.loadLabels([...palletIds, ...locationIds]);
  }
  async loadLabels(ids: string[]) {
    for (let i = 0; i < ids.length; i += 25) {
      const s = await this.docs(
        query(
          this.col("labels"),
          where("target_id", "in", ids.slice(i, i + 25)),
          where("revoked_at", "==", null),
          limit(100),
        ),
      );
      this.ingest(
        "labels",
        s.docs.map((d) => d.data()),
      );
    }
    this.bump(false);
  }
  async preloadScan(raw: string) {
    if (this.network === "offline") return;
    if (!this.activeWorkspace || !this.firestore || raw.startsWith("CMD:"))
      return;
    const label = parseLabelPayload(raw);
    let id: string | undefined, kind: string | undefined;
    const slip = parseTransferNumber(raw);
    if (slip) {
      await this.loadTransfers(where("number", "==", slip));
      return;
    }
    if (label) {
      await this.one("labels", label.token, true);
      const l = this.db.labels[label.token];
      if (!l && label.kind === "P")
        await this.loadTransfers(where("keys", "array-contains", label.token));
      if (!l || l.revoked_at) return;
      id = l.target_id;
      kind = l.kind;
    } else {
      const code = parsePalletCode(raw);
      const table = code ? "pallets" : "locations";
      // Two, so a code this warehouse shares with a transferred pallet is noticed instead of guessed.
      const s = await this.docs(
        query(
          this.col(table),
          where("code", "==", code || normalizeCode(raw)),
          limit(code ? 2 : 1),
        ),
      );
      this.ingest(
        table,
        s.docs.map((d) => d.data()),
      );
      id = s.docs[0]?.id;
      kind = code ? "P" : "L";
      if (!id && code)
        await this.loadTransfers(where("keys", "array-contains", code));
    }
    if (!id) return;
    await this.one(kind === "P" ? "pallets" : "locations", id, true);
    if (kind === "P" && this.db.pallets[id])
      await this.hydrate([this.db.pallets[id]]);
    if (kind === "L" && this.viewRoute.name === "station") {
      // An explicit rack count needs that rack's complete contents, fetched in bounded pages.
      await this.page(
        "rack-scan",
        "pallets",
        palletQuery(this.firestore, this.activeWorkspace, {
          location_id: id,
          include_archived: true,
        }),
      );
      while (this.pageMore("rack-scan")) await this.more("rack-scan");
    }
    this.bump(false);
  }
  /** Transfers matching a scan (a slip number, or a pallet label or code on one), for the transfer hints. */
  private async loadTransfers(filter: ReturnType<typeof where>) {
    const s = await this.docs(
      query(this.col("transfers"), filter, limit(5)),
    );
    this.ingest(
      "transfers",
      s.docs.map((d) => d.data()),
    );
  }
  /** Look up a transfer from its scanned or typed slip number. */
  async findTransfer(raw: string): Promise<string | null> {
    const slip = parseTransferNumber(raw);
    if (!slip || this.network === "offline" || !this.activeWorkspace) return null;
    await this.loadTransfers(where("number", "==", slip));
    this.bump(false);
    return (
      Object.values(this.db.transfers).find((t) => t.number === slip)?.id ??
      null
    );
  }
  async loadCounts(table: "jobs" | "locations") {
    const ids = Object.keys(this.db[table]);
    for (let i = 0; i < ids.length; i += 50) {
      const result = (
        await httpsCallable(
          this.functions!,
          "getDirectoryCounts",
        )({
          workspaceId: this.activeWorkspace,
          table,
          ids: ids.slice(i, i + 50),
        })
      ).data as { values: Record<string, any> };
      for (const [id, counts] of Object.entries(result.values))
        if (this.db[table][id]) Object.assign(this.db[table][id], counts);
    }
    this.bump(false);
  }
  async filteredList(key: string, filters: any[]) {
    if (this.network === "offline") return;
    this.viewGeneration++;
    this.pages.delete(key);
    this.viewStops.forEach((s) => s());
    this.viewStops = [];
    this.db.pallets = {};
    try {
      await this.page(
        key,
        "pallets",
        query(
          this.col("pallets"),
          ...filters,
          orderBy("code"),
          limit(PAGE_SIZE),
        ),
        true,
      );
    } catch (e) {
      this.viewError = cloudMessage(e);
      this.bump(false);
    }
  }
  async loadActivity(types: string[], actor: string) {
    if (this.network === "offline") return;
    this.viewGeneration++;
    this.viewStops.forEach((s) => s());
    this.viewStops = [];
    this.pages.delete("activity");
    this.db.events = {};
    try {
      await this.page(
        "activity",
        "events",
        query(
          this.col("events"),
          ...(types.length ? [where("type", "in", types)] : []),
          ...(actor ? [where("actor_id", "==", actor)] : []),
          orderBy("accepted_at", "desc"),
          orderBy(documentId(), "desc"),
          limit(PAGE_SIZE),
        ),
        true,
      );
    } catch (e) {
      this.viewError = cloudMessage(e);
      this.bump(false);
    }
  }
  async prepareExport(progress: (rows: number) => void) {
    if (this.network === "offline")
      throw Error(
        "Reconnect to prepare a complete export. This device only holds previously opened records.",
      );
    const gen = this.generation;
    let n = 0;
    for (const table of ["jobs", "locations", "members", "pallets", "events"]) {
      let cursor: QueryDocumentSnapshot | undefined;
      do {
        const q = query(
          this.col(table),
          orderBy(documentId()),
          ...(cursor ? [startAfter(cursor)] : []),
          limit(100),
        );
        const s = await this.docs(q);
        if (gen !== this.generation) throw Error("Account changed.");
        this.ingest(
          table,
          s.docs.map((d) => d.data()),
        );
        n += s.size;
        progress(n);
        cursor = s.size === 100 ? s.docs.at(-1) : undefined;
      } while (cursor);
    }
    this.bump(false);
  }
  async loadRack(id: string) {
    if (this.network === "offline") return;
    this.viewGeneration++;
    this.viewStops.forEach((stop) => stop());
    this.viewStops = [];
    this.pages.delete("rack");
    this.db.pallets = {};
    await this.page(
      "rack",
      "pallets",
      palletQuery(this.firestore!, this.activeWorkspace!, {
        location_id: id,
        include_archived: true,
      }),
      true,
    );
  }
  isManager() {
    const m = this.db.memberships.find(
      (x) => x.user_id === this.authUid && x.workspace_id === this.activeWorkspace,
    );
    return !!m && ["OWNER", "SUPERVISOR"].includes(m.role);
  }
  /** Photos attached to issues are pallet photos; load their records so photoUrl can fetch them. */
  async loadAttachments(ids: string[]) {
    await Promise.all(ids.map((id) => this.one("attachments", id)));
    this.bump(false);
  }
  async photoUrl(id: string, thumbnail = true): Promise<string> {
    const a = this.db.attachments[id];
    if (!a || !this.storage) return "";
    const path = thumbnail ? a.thumb_url : a.data_url;
    if (!path.startsWith("storage://")) return path;
    if (this.photoUrls.has(path)) return this.photoUrls.get(path)!;
    if (this.photoPending.has(path)) return this.photoPending.get(path)!;
    const gen = this.generation;
    const pending = getBlob(
      ref(this.storage, path.slice(10)),
      thumbnail && a.thumb_url !== a.data_url ? 128 * 1024 : 5 * 1024 * 1024,
    )
      .then((blob) => {
        this.metrics.photoBytes += blob.size;
        if (gen !== this.generation) return "";
        const url = URL.createObjectURL(blob);
        this.photoUrls.set(path, url);
        while (this.photoUrls.size > 40) {
          const first = this.photoUrls.keys().next().value!;
          URL.revokeObjectURL(this.photoUrls.get(first)!);
          this.photoUrls.delete(first);
        }
        return url;
      })
      .finally(() => this.photoPending.delete(path));
    this.photoPending.set(path, pending);
    return pending;
  }
  override async send(
    actorId: string,
    input: CommandEnvelope,
  ): Promise<Outcome> {
    if (
      !this.functions ||
      !this.auth?.currentUser ||
      actorId !== this.auth.currentUser.uid
    )
      return { status: "offline", message: "Sign in again before saving." };
    if (
      this.readOnly &&
      !this.pending.some(
        (p) =>
          p.actor_id === actorId && p.command.command_id === input.command_id,
      )
    )
      return {
        status: "offline",
        message:
          "This warehouse is read-only until renewed. You can still find pallets, view history and export records.",
      };
    if (!navigator.onLine)
      return {
        status: "offline",
        message:
          "Use Move to save a cached pallet move on this device. This action needs a connection.",
      };
    let cmd = JSON.parse(JSON.stringify(input)) as CommandEnvelope;
    const previous = this.pending.find(
      (p) => p.command.command_id === cmd.command_id && p.actor_id === actorId,
    );
    if (previous) cmd = previous.command;
    try {
      if (
        cmd.kind === "add_photo" &&
        String(cmd.payload.data_url).startsWith("data:")
      ) {
        const bytesOf = (url: string) =>
          Math.floor(((url.split(",")[1] || "").length * 3) / 4) -
          (url.endsWith("==") ? 2 : url.endsWith("=") ? 1 : 0);
        const reservation = (
          await httpsCallable(
            this.functions,
            "reservePhotoUpload",
          )({
            workspaceId: cmd.workspace_id,
            uploadId: cmd.command_id,
            bytes: bytesOf(String(cmd.payload.data_url)),
            thumbBytes: bytesOf(String(cmd.payload.thumb_url)),
          })
        ).data as { full: string; thumb: string };
        const metadata = {
          contentType: "image/jpeg",
          customMetadata: { uploadedBy: actorId },
        };
        const [full] = await Promise.all([
          uploadString(
            ref(this.storage!, reservation.full),
            String(cmd.payload.data_url),
            "data_url",
            metadata,
          ),
          uploadString(
            ref(this.storage!, reservation.thumb),
            String(cmd.payload.thumb_url),
            "data_url",
            metadata,
          ),
        ]);
        cmd.payload = {
          ...cmd.payload,
          bytes: full.metadata.size,
          data_url: `storage://${reservation.full}`,
          thumb_url: `storage://${reservation.thumb}`,
        };
      }
      if (this.authUid !== actorId)
        return {
          status: "offline",
          message: "Your account changed. Sign in before saving.",
        };
      this.pending = [
        ...this.pending.filter((p) => p.command.command_id !== cmd.command_id),
        { actor_id: actorId, command: cmd, sent_at: new Date().toISOString() },
      ];
      await set(`${this.scope}:${actorId}`, this.pending, this.liveStore);
    } catch (err) {
      return { status: "offline", message: cloudMessage(err) };
    }
    this.bump(false);
    try {
      const response = await httpsCallable<CommandEnvelope, CommandResult>(
        this.functions,
        "command",
      )(cmd);
      if (this.authUid !== actorId)
        return { status: "result", result: response.data };
      this.pending = this.pending.filter(
        (p) => p.command.command_id !== cmd.command_id,
      );
      await set(`${this.scope}:${actorId}`, this.pending, this.liveStore).catch(
        () => {},
      );
      // The accepted result is authoritative immediately; collection listeners fill in related records.
      if (
        response.data.ok &&
        response.data.current_state &&
        this.authUid === actorId &&
        this.activeWorkspace === cmd.workspace_id
      )
        this.db.pallets[response.data.current_state.id] =
          response.data.current_state;
      if (response.data.ok) {
        const id = response.data.target_id;
        if (
          cmd.kind === "update_warehouse" &&
          id &&
          this.activeWorkspace === cmd.workspace_id
        ) {
          await this.one("warehouses", id, true);
          const root = await getDoc(
            doc(this.firestore!, "workspaces", cmd.workspace_id),
          );
          this.metrics.reads++;
          if (this.activeWorkspace === cmd.workspace_id && root.exists())
            this.ingest("workspaces", [root.data()]);
        }
        // The import list shows a new or renamed batch without reloading the page.
        if (["import_batch", "rename_import"].includes(cmd.kind) && id)
          await this.one("imports", id, true);
        if (cmd.kind === "save_product" && id) await this.one("products", id, true);
        if (cmd.kind === "update_issue" && id) await this.one("issues", id, true);
        if (["create_job", "close_job", "reopen_job"].includes(cmd.kind) && id)
          await this.one("jobs", id, true);
        if (
          [
            "create_location",
            "rename_location",
            "deactivate_location",
            "reactivate_location",
            "set_location_capacity",
          ].includes(cmd.kind) &&
          id
        )
          await this.one("locations", id, true);
        if (response.data.current_state)
          await this.hydrate([response.data.current_state]);
      }
      await this.saveOfflineCache().catch(() => {
        this.storageError =
          "Saved to the warehouse, but offline records could not be saved on this device.";
      });
      this.bump(false);
      return { status: "result", result: response.data };
    } catch (err) {
      if (this.authUid !== actorId)
        return {
          status: "unknown",
          command_id: cmd.command_id,
          message:
            "Your account changed. Sign in to the original account to check this request.",
        };
      const code = (err as { code?: string }).code;
      if (
        [
          "functions/permission-denied",
          "functions/unauthenticated",
          "functions/invalid-argument",
          "functions/failed-precondition",
          "functions/resource-exhausted",
        ].includes(code || "")
      ) {
        await this.discardPending(cmd.command_id);
        return {
          status: "result",
          result: {
            ok: false,
            command_id: cmd.command_id,
            kind: cmd.kind,
            code:
              code === "functions/permission-denied"
                ? "FORBIDDEN"
                : "INVALID_INPUT",
            message: cloudMessage(err),
            correlation_id: cmd.command_id,
          },
        };
      }
      return {
        status: "unknown",
        command_id: cmd.command_id,
        message:
          "The result could not be confirmed. Check this request before trying the action again.",
      };
    }
  }
  override async recover(
    actorId: string,
    _ws: string,
    id: string,
  ): Promise<Outcome> {
    const p = this.pending.find(
      (p) => p.actor_id === actorId && p.command.command_id === id,
    );
    return p
      ? this.send(actorId, p.command)
      : {
          status: "unknown",
          command_id: id,
          message:
            "This device no longer has the request. Check pallet history before repeating it.",
        };
  }
  override async discardPending(id: string) {
    this.pending = this.pending.filter((p) => p.command.command_id !== id);
    if (this.authUid)
      await set(
        `${this.scope}:${this.authUid}`,
        this.pending,
        this.liveStore,
      ).catch(() => {});
    this.bump(false);
  }
  override async queueOffline(
    entry: Omit<
      OutboxEntry,
      "status" | "attempts" | "last_error" | "server_state" | "resolved_at"
    >,
  ): Promise<Outcome> {
    const store = this.offlineStore;
    if (
      !store ||
      entry.actor_id !== this.authUid ||
      entry.workspace_id !== this.activeWorkspace
    )
      throw Error("Sign in to the original account and warehouse first.");
    if (
      this.readOnly ||
      licenseAccess(true, this.licenseExpiresAt) !== "active"
    )
      throw Error(
        "This warehouse must be renewed before recording more moves.",
      );
    if (Date.now() - this.verifiedAt >= OFFLINE_ACCESS_MS)
      throw Error(
        "Reconnect to verify your account. Offline access lasts 24 hours.",
      );
    const outbox = this.outbox;
    return store.lock(async () => {
      await outbox.init(true);
      if (store !== this.offlineStore || entry.actor_id !== this.authUid)
        throw Error("Your account changed. Nothing was queued.");
      if (
        outbox.pending(entry.actor_id, entry.workspace_id).length >=
        MAX_OFFLINE_MOVES
      )
        throw Error(
          "This device has 100 waiting moves. Reconnect and sync before recording more.",
        );
      const pallet = this.db.pallets[entry.pallet_id],
        location = this.db.locations[String(entry.command.payload.location_id)];
      const check = eligibility(
        entry.command.kind,
        pallet ?? null,
        !!location?.active,
        outbox.pending(entry.actor_id, entry.workspace_id),
      );
      if (!check.ok) throw Error(check.message);
      if (
        this.pendingFor(entry.actor_id, entry.workspace_id).some(
          (p) => p.command.pallet_id === entry.pallet_id,
        )
      )
        throw Error(
          "This pallet has an unconfirmed request. Reconnect and check its result first.",
        );
      const role = this.engine.membership(
        entry.actor_id,
        entry.workspace_id,
      )?.role;
      if (!role || role === "VIEWER")
        throw Error("Your account cannot move pallets.");
      await this.saveOfflineCache();
      const saved = await outbox.enqueue(entry);
      this.bump(false);
      return { status: "queued", entry: saved };
    });
  }

  override async sync(actorId: string, ws: string) {
    if (
      this.network === "offline" ||
      this.loading ||
      this.readOnly ||
      this.cloudError ||
      !this.offlineStore ||
      actorId !== this.authUid ||
      ws !== this.activeWorkspace
    )
      return null;
    if (this.syncing) return this.syncing;
    const store = this.offlineStore,
      outbox = this.outbox;
    this.syncing = store
      .lock(async () => {
        await outbox.init(true);
        const stats = {
          sent: 0,
          acknowledged: 0,
          conflicts: 0,
          blocked: 0,
          unanswered: 0,
        };
        // Drain at most 100 commands per explicit/reconnect sync. Never loop on a failed send.
        for (let batch = 0; batch < MAX_OFFLINE_MOVES / 10; batch++) {
          const round = await outbox.replay(actorId, ws, async (cmd) => {
            if (
              actorId !== this.authUid ||
              ws !== this.activeWorkspace ||
              this.network === "offline"
            )
              throw Error("Account or connection changed.");
            const outcome = await this.send(actorId, cmd);
            if (outcome.status !== "result")
              throw Error("No confirmed response. Saved for another attempt.");
            if (
              actorId === this.authUid &&
              ws === this.activeWorkspace &&
              !outcome.result.ok &&
              outcome.result.current
            )
              this.db.pallets[outcome.result.current.id] =
                outcome.result.current;
            return outcome.result;
          });
          stats.sent += round.sent;
          stats.acknowledged += round.acknowledged;
          stats.conflicts += round.conflicts;
          stats.blocked += round.blocked;
          stats.unanswered += round.unanswered;
          if (
            round.unanswered ||
            round.sent > round.acknowledged + round.conflicts + round.blocked ||
            round.sent === 0 ||
            !outbox.pending(actorId, ws).some((e) => e.status === "queued")
          )
            break;
        }
        await this.saveOfflineCache();
        this.bump(false);
        return stats;
      })
      .finally(() => {
        this.syncing = null;
      });
    return this.syncing;
  }

  async changeOfflineQueue(action: "discard" | "clear", id?: string) {
    if (!this.offlineStore || !this.authUid || !this.activeWorkspace) return;
    const outbox = this.outbox,
      actor = this.authUid,
      ws = this.activeWorkspace;
    await this.offlineStore.lock(async () => {
      await outbox.init(true);
      if (action === "clear") await outbox.clearAcknowledged(actor, ws);
      else if (
        id &&
        outbox.forUser(actor, ws).some((e) => e.command.command_id === id)
      )
        await outbox.discard(id, new Date().toISOString());
    });
  }

  private async saveOfflineCache() {
    if (
      !this.offlineStore ||
      !this.activeWorkspace ||
      !this.verifiedAt ||
      this.viewRoute.name === "export"
    )
      return;
    await this.offlineStore.save(this.activeWorkspace, {
      db: structuredClone(this.db),
      at: this.lastSync,
      verifiedAt: this.verifiedAt,
      expiresAt: this.licenseExpiresAt,
      summary: this.summary,
    });
    this.storageError = null;
  }
  private async useOfflineCache() {
    const store = this.offlineStore,
      ws = this.activeWorkspace,
      uid = this.authUid;
    if (!store || !ws || !uid) return false;
    // Persist the records just scanned before switching the UI to its bounded snapshot.
    if (this.verifiedAt) await this.saveOfflineCache();
    const saved = await store.load(ws);
    if (
      store !== this.offlineStore ||
      ws !== this.activeWorkspace ||
      !saved ||
      Date.now() - saved.verifiedAt >= OFFLINE_ACCESS_MS
    )
      return false;
    const access = licenseAccess(true, saved.expiresAt);
    if (
      access === "blocked" ||
      !saved.db.memberships.some(
        (m) => m.user_id === uid && m.workspace_id === ws && m.active,
      )
    )
      return false;
    this.db = saved.db;
    this.engine = new Engine(this.db);
    this.summary = saved.summary;
    this.verifiedAt = saved.verifiedAt;
    this.licenseExpiresAt = saved.expiresAt;
    this.graceEndsAt = saved.expiresAt + RENEWAL_GRACE_MS;
    this.readOnly = access === "read-only";
    this.cache = { db: this.db, engine: this.engine, at: saved.at };
    this.loading = false;
    this.cloudError = "";
    this.bump(false);
    return true;
  }
  override bump(broadcast = false) {
    super.bump(broadcast);
    if (
      this.network === "online" &&
      this.verifiedAt &&
      this.activeWorkspace &&
      !this.cacheTimer
    ) {
      this.cacheTimer = setTimeout(() => {
        this.cacheTimer = null;
        void this.saveOfflineCache().catch(() => {
          this.storageError =
            "Offline records could not be saved on this device. Reconnect before leaving this page.";
        });
      }, 150);
    }
  }
  override setNetwork() {} // Browser connectivity controls live status.
  override setFaults() {}
  override async reset(): Promise<void> {
    throw new Error("Sample-data reset is disabled for live warehouses.");
  }
  override async seed(): Promise<void> {
    throw new Error("Sample data cannot be added to a live warehouse.");
  }
  override async importSnapshot() {
    return {
      ok: false as const,
      problems: [
        "Local backups cannot replace a live warehouse. Use the CSV import.",
      ],
    };
  }
  override async reload() {
    const ws = this.activeWorkspace || this.workspaceIds[0];
    if (ws) await this.chooseWorkspace(ws);
  }
}
export function cloudMessage(err: unknown): string {
  const code = (err as { code?: string }).code || "";
  if (
    code.includes("invalid-credential") ||
    code.includes("wrong-password") ||
    code.includes("user-not-found")
  )
    return "Email or password is incorrect.";
  if (code.includes("email-already-in-use"))
    return "This email already has an account. Sign in or reset the password.";
  if (code.includes("too-many-requests"))
    return "Too many attempts. Wait a little before trying again.";
  if (code.includes("weak-password"))
    return "Use a stronger password with at least 8 characters.";
  if (code.includes("network-request-failed"))
    return "Could not connect. Check your internet connection.";
  return err instanceof Error
    ? err.message
        .replace(/^Firebase:\s*/, "")
        .replace(/\s*\(auth\/[^)]+\)\.?$/, "")
    : "Something went wrong. Please try again.";
}
