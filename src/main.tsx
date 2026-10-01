import { StrictMode, Suspense, lazy, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { isSiteRoute, parseHash, quietOpening, type Route } from "./app/state";
import { QuietLoading } from "./portal/WarehouseLoading";
import { SitePage } from "./site/SitePage";
import { SiteRouting } from "./site/routing";
import { ScanRouterProvider } from "./device/scanRouter";
import { setupInstallableShell } from "./device/pwa";
import {
  appLanding,
  crossHostFromHere,
  currentHost,
  redirectFor,
} from "./config/hosts";
import "./app/styles.css";
const WarehouseApp = lazy(() => import("./portal/WarehouseApp"));
setupInstallableShell();

/** On a custom domain, the address that belongs on the other host (website or portal), if any. */
function leaveFor(): string | null {
  return currentHost().kind === "single" ? null : redirectFor(location);
}
/** On the app host, an address without a page opens the portal. */
function settleAppLanding() {
  const landing = appLanding(location);
  if (landing)
    history.replaceState(
      history.state,
      "",
      `${location.pathname}${location.search}${landing}`,
    );
}

function Entry() {
  const [route, setRoute] = useState<Route>(
    () => parseHash(location.hash) ?? { name: "home" },
  );
  const [entered, setEntered] = useState(!isSiteRoute(route.name));
  const [message, setMessage] = useState("");
  useEffect(() => {
    const change = () => {
      const away = leaveFor();
      if (away) return location.replace(away);
      settleAppLanding();
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
          quietOpening() ? (
            <QuietLoading />
          ) : (
            <main className="auth-shell">
              <p role="status">Opening your warehouse…</p>
            </main>
          )
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
          const away = crossHostFromHere(
            typeof to === "string" ? { name: to } : to,
          );
          if (away) return location.assign(away);
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
// Redirect before anything renders, so the wrong host never flashes on screen.
const away = leaveFor();
if (away) location.replace(away);
else {
  settleAppLanding();
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <Entry />
    </StrictMode>,
  );
}
