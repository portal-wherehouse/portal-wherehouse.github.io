// "Setup checklist": its own page, first in the sidebar until setup is finished. A new self-serve warehouse
// gets the setup wizard here and the rest of the app stays locked until a manager finishes or skips it; any
// other warehouse gets the plain checklist. See also features/onboarding.

import { useApp } from '../../app/state';
import { Icon } from '../../ui/icons';
import { Empty, Sheet } from '../../ui/ui';
import { SetupNav, SetupPending, SetupWizard, WIZARD_STEPS, useOnboarding } from '../onboarding/SetupWizard';
import { GettingStarted, useChecklistSteps } from './GettingStarted';
import './checklist.css';

export interface ChecklistStatus {
  /** This warehouse started in the setup wizard. */
  wizard: boolean;
  /** Everything but the checklist is locked until it is finished or skipped. */
  locked: boolean;
  skipped: boolean;
  /** Whether "Setup checklist" is in this person's sidebar: managers, until every step is done. */
  show: boolean;
  done: number;
  total: number;
}

export function useChecklistStatus(): ChecklistStatus {
  const { role } = useApp();
  const { ob } = useOnboarding();
  const list = useChecklistSteps();
  const manager = role === 'OWNER' || role === 'SUPERVISOR';
  if (ob) {
    const done = ob.done.filter((d) => WIZARD_STEPS.some((s) => s.id === d)).length;
    return { wizard: true, locked: ob.state === 'pending', skipped: ob.state === 'skipped', show: manager && ob.state !== 'done', done, total: WIZARD_STEPS.length };
  }
  const done = list.steps.filter((s) => s.done).length;
  return { wizard: false, locked: false, skipped: list.skipped, show: manager && done < list.steps.length, done, total: list.steps.length };
}

/** The page itself. */
export function SetupChecklist() {
  const { role } = useApp();
  const { ob } = useOnboarding();
  if (role !== 'OWNER' && role !== 'SUPERVISOR') {
    if (ob?.state === 'pending') return <SetupPending />;
    return (
      <div className="panel">
        <Empty icon="checklist" title="Managers set up the warehouse">
          <p>Zones, spots and labels are set up by an owner or manager.</p>
        </Empty>
      </div>
    );
  }
  return ob ? <SetupWizard /> : <GettingStarted />;
}

/** "Setup checklist" at the top of the sidebar, with the wizard's steps under it while it is open. */
export function ChecklistNav({ status, here }: { status: ChecklistStatus; here: boolean }) {
  const { go } = useApp();
  return (
    <>
      <button className={`nav-item checklist-nav${status.skipped ? ' quiet' : ''}`} aria-current={here ? 'page' : undefined} onClick={() => go('checklist')} data-testid="checklist-nav" data-tour="nav-checklist">
        <Icon name="checklist" />
        Setup checklist
        <span className="count" aria-label={`${status.done} of ${status.total} done`}>
          {status.done}/{status.total}
        </span>
      </button>
      {status.wizard && here && <SetupNav here={here} />}
    </>
  );
}

/** What a greyed-out button says while the checklist is still locking the app. */
export function SetupOops({ manager, onClose }: { manager: boolean; onClose: () => void }) {
  const { go } = useApp();
  return (
    <Sheet title="Oops!" onClose={onClose}>
      <div className="stack setup-oops" data-testid="setup-oops">
        <div className="oops-head">
          <span className="oops-bubble">
            <Icon name="checklist" />
          </span>
          <p>{manager ? 'You must complete or skip your warehouse checklist first.' : 'Your warehouse is still being set up. A manager must complete or skip the setup checklist first.'}</p>
        </div>
        <div className="row">
          {manager && (
            <button className="btn primary" onClick={() => (onClose(), go('checklist'))}>
              <Icon name="checklist" /> Go to setup checklist
            </button>
          )}
          <button className="btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </Sheet>
  );
}
