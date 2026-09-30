import { StrictMode, Suspense, lazy, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { isSiteRoute, parseHash, type Route } from "./app/state";
import { SitePage } from "./site/SitePage";
import { SiteRouting } from "./site/routing";
import { ScanRouterProvider } from "./device/scanRouter";
import { setupInstallableShell } from "./device/pwa";
import "./app/styles.css";
const WarehouseApp = lazy(() => import("./portal/WarehouseApp"));
setupInstallableShell();
function Entry() {
  const [route, setRoute] = useState<Route>(
    () => parseHash(location.hash) ?? { name: "home" },
  );
  const [entered, setEntered] = useState(!isSiteRoute(route.name));
  const [message, setMessage] = useState("");
  useEffect(() => {
    const change = () => {
      const next = parseHash(location.hash) ?? { name: "home" };
      setRoute(next);
      if (!isSiteRoute(next.name)) setEntered(true);
    };
    window.addEventListener("hashchange", change);
    window.addEventListener("popstate", change);
    return () => {
      window.removeEventListener("hashchange", change);
      window.removeEventListener("popstate", change);
    };
  }, []);
  if (entered)
    return (
      <Suspense
        fallback={
          <main className="auth-shell">
            <p role="status">Opening your warehouse…</p>
          </main>
        }
      >
        <WarehouseApp />
      </Suspense>
    );
  return (
    <SiteRouting
      value={{
        route,
        go: (to) => {
          location.hash = typeof to === "string" ? to : to.name;
          window.scrollTo(0, 0);
        },
        toast: (text) => {
          setMessage(text);
          setTimeout(() => setMessage(""), 4500);
        },
      }}
    >
      <ScanRouterProvider>
        <SitePage route={isSiteRoute(route.name) ? route.name : "home"} />
      </ScanRouterProvider>
      {message && (
        <div className="toasts" role="status">
          {message}
        </div>
      )}
    </SiteRouting>
  );
}
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Entry />
  </StrictMode>,
);
