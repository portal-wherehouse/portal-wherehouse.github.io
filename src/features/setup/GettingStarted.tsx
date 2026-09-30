// The setup walkthrough on the dashboard: survey, spots, labels, first items, crew, first move. Each step
// checks itself off from the warehouse's own records, so it stays right on every device.

import { useEffect, useRef, useState } from 'react';
import { useApp, type RouteName } from '../../app/state';
import { useSetup } from '../../app/words';
import { loadSavedSurvey, recommend, saveSurvey } from '../../domain/survey';
import { Icon } from '../../ui/icons';
import { RackBuilder } from '../admin/RackBuilder';
import { SetupSurvey, applyRecommendation } from './SetupSurvey';

const flag = (k: string) => {
  try {
    return localStorage.getItem(k) === '1';
  } catch {
    return false;
  }
};
const setFlag = (k: string) => {
  try {
    localStorage.setItem(k, '1');
  } catch {
    /* this visit only */
  }
};

export function GettingStarted({ total, moved }: { total: number; moved: boolean }) {
  const { backend, workspaceId, go, send, role } = useApp();
  const setup = useSetup();
  const [survey, setSurvey] = useState(false);
  const [builder, setBuilder] = useState(false);
  const [, bump] = useState(0);
  const applying = useRef(false);
  const ws = workspaceId ?? '';
  const hideKey = `pl.gs.hide.${ws}`;
  const labelsKey = `pl.gs.labels.${ws}`;
  const manager = role === 'OWNER' || role === 'SUPERVISOR';

  // Answers given on the website before the account existed are applied once, to a warehouse still on defaults.
  useEffect(() => {
    const saved = loadSavedSurvey();
    if (!manager || setup.preset !== null || !saved || applying.current || backend.network === 'offline') return;
    applying.current = true;
    void applyRecommendation(send, recommend(saved)).then((err) => {
      if (!err) saveSurvey(null);
    });
  }, [manager, setup.preset, send, backend.network]);

  const spots = Object.values(backend.db.locations).filter((l) => l.workspace_id === ws && l.active !== false && (l.kind === 'RACK' || l.kind === 'FLOOR')).length;
  const crew = backend.db.memberships.filter((m) => m.workspace_id === ws && m.active !== false).length;
  const things = setup.things.toLowerCase();
  const steps: { id: string; title: string; hint: string; done: boolean; action: string; run: () => void }[] = [
    { id: 'survey', title: 'Answer the setup survey', hint: 'A minute of questions picks your words, labels and printer.', done: setup.preset !== null, action: 'Start', run: () => setSurvey(true) },
    { id: 'spots', title: 'Create your zones and spots', hint: spots ? `${spots} spot${spots === 1 ? '' : 's'} so far.` : 'Build a whole rack or shelf unit at once.', done: spots > 0, action: 'Build a rack', run: () => setBuilder(true) },
    { id: 'labels', title: 'Print and hang spot labels', hint: 'One QR label on every spot.', done: flag(labelsKey) || total > 0, action: 'Print labels', run: () => (setFlag(labelsKey), go('labels' as RouteName)) },
    { id: 'items', title: `Add your first ${things}`, hint: 'Receive one, or import a spreadsheet.', done: total > 0, action: 'Receive', run: () => go('receive') },
    { id: 'crew', title: 'Add your crew', hint: 'They sign in with the email you add.', done: crew > 1, action: 'Add people', run: () => go('people') },
    { id: 'move', title: 'Try a move', hint: 'Scan something, then scan the spot you put it in.', done: moved, action: 'Move', run: () => go('move') },
  ];
  const done = steps.filter((s) => s.done).length;
  const next = steps.find((s) => !s.done);
  if (!manager || !next || flag(hideKey)) return null;
  return (
    <section className="panel getting-started" data-testid="getting-started">
      <div className="gs-head">
        <div>
          <p className="eyebrow">Setup checklist</p>
          <h2>
            {done} of {steps.length} done
          </h2>
        </div>
        <button type="button" className="btn ghost small" onClick={() => (setFlag(hideKey), bump((n) => n + 1))}>
          Hide checklist
        </button>
      </div>
      <div className="gs-bar" aria-hidden="true">
        <i style={{ transform: `scaleX(${done / steps.length})` }} />
      </div>
      <ol className="gs-steps">
        {steps.map((s, n) => (
          <li key={s.id} className={`gs-step${s.done ? ' done' : ''}${s === next ? ' next' : ''}`} data-testid={`gs-${s.id}`} data-done={s.done}>
            <span className="gs-dot">{s.done ? <Icon name="check" /> : n + 1}</span>
            <span>
              <strong>{s.title}</strong>
              <small>{s.hint}</small>
            </span>
            {!s.done && (
              <button type="button" className={`btn${s === next ? ' primary' : ''} small`} onClick={s.run}>
                {s.action}
              </button>
            )}
          </li>
        ))}
      </ol>
      {survey && <SetupSurvey mode="portal" onClose={() => setSurvey(false)} />}
      {builder && <RackBuilder onClose={() => setBuilder(false)} />}
    </section>
  );
}
