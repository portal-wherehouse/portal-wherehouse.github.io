import { Suspense, lazy, useEffect } from "react";
import type { SiteRouteName } from "../app/state";
import { useSite } from "./routing";
import { BRAND } from "../brand";
import { SiteShell } from "./SiteShell";
import { MissionPage } from "./pages/Mission";
import { Home } from "./Home";
import { ShowcasePage } from "./pages/Showcase";
import { SimplePage } from "./pages/Simple";
import { ProductPage } from "./pages/Product";
const HardwarePage = lazy(() =>
  import("./pages/Hardware").then((m) => ({ default: m.HardwarePage })),
);
import { CustomersPage } from "./pages/Customers";
import { PricingPage } from "./pages/Pricing";
const FitPage = lazy(() =>
  import("./fit/FitPage").then((m) => ({ default: m.FitPage })),
);
const ForPage = lazy(() =>
  import("./for/ForPage").then((m) => ({ default: m.ForPage })),
);
const FounderPage = lazy(() =>
  import("./pages/Founder").then((m) => ({ default: m.FounderPage })),
);
import { ContactPage } from "./pages/Contact";
import { SecurityPage } from "./pages/Security";
import { firebaseConfig, sampleMode } from "../data/firebaseConfig";
import { crossHostFromHere } from "../config/hosts";

const SetupSurvey = lazy(() =>
  import("../features/setup/SetupSurvey").then((m) => ({
    default: m.SetupSurvey,
  })),
);
const AccountGate = lazy(() => import("./AccountGate"));

/** #start: the setup survey that leads into the free trial. Full screen, without the site's header.
 * On a live site the visitor creates an account (or signs in) and verifies their email first. */
function StartPage() {
  const { go } = useSite();
  useEffect(() => {
    document.title = `Set up your warehouse · ${BRAND.name}`;
  }, []);
  const survey = <SetupSurvey mode="site" onClose={() => go("home")} />;
  return (
    <Suspense fallback={<p role="status">Loading…</p>}>
      {/* Live sites need a verified account first. The sample and unconfigured builds do not. */}
      {sampleMode() || !firebaseConfig() ? (
        survey
      ) : (
        <AccountGate>{survey}</AccountGate>
      )}
    </Suspense>
  );
}

const SITE_PAGES: Record<SiteRouteName, React.ComponentType> = {
  home: Home,
  mission: MissionPage,
  product: ProductPage,
  showcase: ShowcasePage,
  simple: SimplePage,
  why: SimplePage,
  hardware: HardwarePage,
  // The old Applications page: its address now opens the #for overview.
  industries: ForPage,
  customers: CustomersPage,
  pricing: PricingPage,
  founder: FounderPage,
  contact: ContactPage,
  security: SecurityPage,
  start: StartPage,
  fit: FitPage,
  for: ForPage,
};

export function SitePage({ route }: { route: SiteRouteName }) {
  const { route: full } = useSite();
  // On a custom domain, a page that lives on the other host (a website page opened from the
  // portal on app., or #start on the website) is replaced by that host's address.
  const away = crossHostFromHere(full.name === route ? full : { name: route });
  useEffect(() => {
    if (away) location.replace(away);
  }, [away]);
  if (away) return null;
  const Page = SITE_PAGES[route];
  if (route === "start") return <StartPage />;
  return (
    <SiteShell>
      <Suspense fallback={<p role="status">Loading page…</p>}>
        <Page key={route} />
      </Suspense>
    </SiteShell>
  );
}
