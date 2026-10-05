// "Settings and setup": one page that lists the setup tools, so the sidebar keeps its room for daily work.

import { useApp } from '../../app/state';
import { useJobsOn, useOrdersOn } from '../../app/words';
import { Icon } from '../../ui/icons';
import { PageHead } from '../../ui/ui';
import { useChecklistStatus } from '../setup/SetupChecklist';
import { useHasTransferTargets } from '../transfers/targets';
import { SETUP_TOOLS, navTarget, visibleNav } from './More';

export function SetupHub() {
  const { go, role, prefs, backend } = useApp();
  const checklist = useChecklistStatus();
  const nav = visibleNav(role, prefs.advancedTools, backend.mode === 'firebase', useJobsOn(), useHasTransferTargets(), useOrdersOn());
  const tools = SETUP_TOOLS.filter((t) => nav.allowed.has(t.route));
  return (
    <div className="stack" data-testid="setup-hub">
      <PageHead title="Settings and setup" sub="The tools for setting up your warehouse and changing how it works. Daily work stays in the menu." />
      <div className="more-menu setup-hub">
        {checklist.show && (
          <button className="checklist-more" onClick={() => go('checklist')} data-testid="hub-checklist">
            <Icon name="checklist" />
            Setup checklist
            <small>
              {checklist.done} of {checklist.total} done. Zones, spots, labels and your crew.
            </small>
          </button>
        )}
        {tools.map((t) => (
          <button key={t.route} onClick={() => go(navTarget(t))} data-testid={`hub-${t.route}`}>
            <Icon name={t.icon} />
            {t.label}
            <small>{t.hint}</small>
          </button>
        ))}
        {!checklist.show && (
          <button onClick={() => go('checklist')} data-testid="hub-checklist">
            <Icon name="checklist" />
            Setup checklist
            <small>Review the setup steps any time.</small>
          </button>
        )}
      </div>
    </div>
  );
}
