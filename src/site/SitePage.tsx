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
import { IndustriesPage } from "./pages/Industries";
import { CustomersPage } from "./pages/Customers";
import { PricingPage } from "./pages/Pricing";
import { FounderPage } from "./pages/Founder";
import { ContactPage } from "./pages/Contact";
import { SecurityPage } from "./pages/Security";

const SetupSurvey = lazy(() =>
  import("../features/setup/SetupSurvey").then((m) => ({
    default: m.SetupSurvey,
  })),
);

/** #start: the setup survey that leads into the free trial. Full screen, without the site's header. */
function StartPage() {
  const { go } = useSite();
  useEffect(() => {
    document.title = `Set up your warehouse · ${BRAND.name}`;
  }, []);
  return (
    <Suspense fallback={<p role="status">Loading…</p>}>
      <SetupSurvey mode="site" onClose={() => go("home")} />
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
  industries: IndustriesPage,
  customers: CustomersPage,
  pricing: PricingPage,
  founder: FounderPage,
  contact: ContactPage,
  security: SecurityPage,
  start: StartPage,
};

export function SitePage({ route }: { route: SiteRouteName }) {
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
