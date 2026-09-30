import { FirebaseBackend } from "../data/firebase";
import { useEffect, useState } from "react";
import { App } from "../app/App";
import { AppProvider } from "../app/state";
import { ScanRouterProvider } from "../device/scanRouter";
import { Backend } from "../data/backend";
let opening: Promise<Backend> | undefined;
function open() {
  return (opening ??=
    new URLSearchParams(location.search).get("demo") === "1" ||
    import.meta.env.VITE_APP_MODE === "demo"
      ? Backend.open(new URLSearchParams(location.search).get("demo") === "1")
      : FirebaseBackend.connect());
}
export default function WarehouseApp() {
  const [backend, setBackend] = useState<Backend | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void open()
      .then((b) => {
        if (
          import.meta.env.VITE_FIREBASE_EMULATORS === "true" &&
          b.mode === "firebase" &&
          (import.meta.env.DEV || import.meta.env.MODE === "emulator")
        )
          (window as any).__wherehouseBackend = b;
        if (active) setBackend(b);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  if (!backend)
    return (
      <main className="auth-shell">
        <p role="status">{error || "Opening your warehouse…"}</p>
      </main>
    );
  const prepareScan =
    backend.mode === "firebase"
      ? (text: string) =>
          (backend as import("../data/firebase").FirebaseBackend).preloadScan(
            text,
          )
      : undefined;
  return (
    <AppProvider backend={backend}>
      <ScanRouterProvider prepareScan={prepareScan}>
        <App />
      </ScanRouterProvider>
    </AppProvider>
  );
}
