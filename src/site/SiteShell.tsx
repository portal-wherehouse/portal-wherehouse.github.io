// Website shell: header, navigation and footer around every public page. PLACEHOLDER: being built.

import type { ReactNode } from 'react';
import { PortalCTA } from './kit';

export function SiteShell({ children }: { children: ReactNode }) {
  return (
    <div className="site">
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: 12 }}>
        <PortalCTA variant="nav" />
      </div>
      <main id="main">{children}</main>
    </div>
  );
}
