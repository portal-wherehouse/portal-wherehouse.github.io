import { createContext, useContext, type ReactNode } from "react";
import type { Route, RouteName } from "../app/state";

interface SiteNavigation {
  route: Route;
  go(route: Route | RouteName): void;
  toast(message: string, tone?: "ok" | "error" | "info"): void;
}
const Context = createContext<SiteNavigation | null>(null);
export function SiteRouting({
  value,
  children,
}: {
  value: SiteNavigation;
  children: ReactNode;
}) {
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useSite() {
  const navigation = useContext(Context);
  if (!navigation) throw new Error("Website navigation is unavailable.");
  return navigation;
}
