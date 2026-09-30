// "Skip the checklist", with a confirm. Shared by the setup wizard and the plain setup checklist.

import { useState } from 'react';
import { Icon } from '../../ui/icons';
import { Sheet, Spinner } from '../../ui/ui';

export function SkipChecklist({ onSkip, busy }: { onSkip: () => void; busy?: boolean }) {
  const [asking, setAsking] = useState(false);
  return (
    <>
      <button type="button" className="btn ck-skip" disabled={busy} onClick={() => setAsking(true)} data-testid="skip-checklist">
        <Icon name="arrowRight" /> Skip the checklist
      </button>
      {asking && (
        <Sheet title="Skip the setup checklist?" onClose={() => setAsking(false)}>
          <div className="stack ck-confirm">
            <p>The rest of the app opens now. You can come back to it any time from the sidebar.</p>
            <div className="row">
              <button className="btn primary" disabled={busy} onClick={() => (setAsking(false), onSkip())}>
                {busy ? <Spinner /> : <Icon name="arrowRight" />} Skip for now
              </button>
              <button className="btn" onClick={() => setAsking(false)}>
                Keep setting up
              </button>
            </div>
          </div>
        </Sheet>
      )}
    </>
  );
}
