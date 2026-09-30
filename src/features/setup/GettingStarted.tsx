// The setup checklist for a warehouse that did not start in the setup wizard: survey, spots, labels, first
// items, crew, first move. Each step checks itself off from the warehouse's own records, so it stays right on
// every device. It has its own page, opened from "Setup checklist" at the top of the sidebar.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp, type RouteName } from '../../app/state';
import { useSetup } from '../../app/words';
import { loadSavedSurvey, recommend, saveSurvey } from '../../domain/survey';
import { FirebaseBackend } from '../../data/firebase';
import { Icon } from '../../ui/icons';
import { RackBuilder } from '../admin/RackBuilder';
import { SetupSurvey, applyRecommendation } from './SetupSurvey';
import { SkipChecklist } from './SkipChecklist';
import './checklist.css';

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

type Opener = 'survey' | 'builder';
export interface ChecklistStep {
  id: string;
  title: string;
  hint: string;
  done: boolean;
  action: string;
  run: (open: (o: Opener) => void) => void;
}

/** The checklist's steps, and whether it was skipped on this device. The sidebar reads it as well as the page. */
export function useChecklistSteps(): { steps: ChecklistStep[]; skipped: boolean; skip: () => void } {
  const { backend, workspaceId, go, read, v } = useApp();
  const setup = useSetup();
  const [, bump] = useState(0);
  const ws = workspaceId ?? '';
  const skipKey = `pl.gs.hide.${ws}`;
  const labelsKey = `pl.gs.labels.${ws}`;
  const facts = useMemo(
    () =>
      read((e, _a, w) => ({
        spots: Object.values(e.db.locations).filter((l) => l.workspace_id === w && l.active !== false && (l.kind === 'RACK' || l.kind === 'FLOOR')).length,
        crew: e.db.memberships.filter((m) => m.workspace_id === w && m.active !== false).length,
        pallets: Object.values(e.db.pallets).filter((p) => p.workspace_id === w && !p.archived_at).length,
        moved: Object.values(e.db.events).some((list) => list.some((ev) => ev.workspace_id === w && (ev.type === 'move' || ev.type === 'place'))),
      })),
    [read, v, backend.network],
  ) ?? { spots: 0, crew: 0, pallets: 0, moved: false };
  // The live app counts from the server's summary; its local copy holds only what this device has opened.
  const counts = backend instanceof FirebaseBackend ? (backend.summary?.counts as Record<string, number> | undefined) : undefined;
  const total = counts ? Object.values(counts).reduce((sum, n) => sum + n, 0) : facts.pallets;
  const things = setup.things.toLowerCase();
  const steps: ChecklistStep[] = [
    { id: 'survey', title: 'Answer the setup survey', hint: 'Questions about your space work out your zones, spots, labels and printer.', done: setup.preset !== null, action: 'Start', run: (open) => open('survey') },
    { id: 'spots', title: 'Create your zones and spots', hint: facts.spots ? `${facts.spots} spot${facts.spots === 1 ? '' : 's'} so far.` : 'Build a whole rack or shelf unit at once.', done: facts.spots > 0, action: 'Build a rack', run: (open) => open('builder') },
    { id: 'labels', title: 'Print and hang spot labels', hint: 'One QR label on every spot.', done: flag(labelsKey) || total > 0, action: 'Print labels', run: () => (setFlag(labelsKey), go('labels' as RouteName)) },
    { id: 'items', title: `Add your first ${things}`, hint: 'Receive one, or import a spreadsheet.', done: total > 0, action: 'Receive', run: () => go('receive') },
    { id: 'crew', title: 'Add your crew', hint: 'They sign in with the email you add.', done: facts.crew > 1, action: 'Add people', run: () => go('people') },
    { id: 'move', title: 'Try a move', hint: 'Scan something, then scan the spot you put it in.', done: facts.moved, action: 'Move', run: () => go('move') },
  ];
  return { steps, skipped: flag(skipKey), skip: () => (setFlag(skipKey), bump((n) => n + 1)) };
}

/** Answers given on the website before the account existed are applied once, to a warehouse still on defaults. */
export function useApplySavedSurvey(enabled: boolean) {
  const { backend, send, role } = useApp();
  const setup = useSetup();
  const applying = useRef(false);
  const manager = role === 'OWNER' || role === 'SUPERVISOR';
  useEffect(() => {
    const saved = loadSavedSurvey();
    if (!enabled || !manager || setup.preset !== null || !saved || applying.current || backend.network === 'offline') return;
    applying.current = true;
    void applyRecommendation(send, recommend(saved)).then((err) => {
      if (!err) saveSurvey(null);
    });
  }, [enabled, manager, setup.preset, send, backend.network]);
}

export function GettingStarted() {
  const { go } = useApp();
  const { steps, skipped, skip } = useChecklistSteps();
  const [open, setOpen] = useState<Opener | null>(null);
  const done = steps.filter((s) => s.done).length;
  const next = steps.find((s) => !s.done);
  return (
    <section className="panel checklist-page" data-testid="getting-started">
      <div className="ck-head">
        <div>
          <p className="eyebrow">Setup checklist</p>
          <h1>{next ? `${done} of ${steps.length} done` : 'Your warehouse is set up'}</h1>
        </div>
        {next && !skipped && <SkipChecklist onSkip={() => (skip(), go('overview'))} />}
      </div>
      {next && skipped && <p className="ck-note">You skipped the checklist. Pick it back up whenever you like; it stays in the sidebar until every step is done.</p>}
      <div className="ck-bar" aria-hidden="true">
        <i style={{ transform: `scaleX(${done / steps.length})` }} />
      </div>
      <ol className="ck-steps">
        {steps.map((s, n) => (
          <li key={s.id} className={`ck-step${s.done ? ' done' : ''}${s === next ? ' next' : ''}`} data-testid={`gs-${s.id}`} data-done={s.done}>
            <span className="ck-dot">{s.done ? <Icon name="check" /> : n + 1}</span>
            <span className="ck-text">
              <strong>{s.title}</strong>
              <small>{s.hint}</small>
            </span>
            {!s.done && (
              <button type="button" className={`btn${s === next ? ' primary' : ''} small`} onClick={() => s.run(setOpen)}>
                {s.action}
              </button>
            )}
          </li>
        ))}
      </ol>
      {open === 'survey' && <SetupSurvey mode="portal" onClose={() => setOpen(null)} />}
      {open === 'builder' && <RackBuilder onClose={() => setOpen(null)} />}
    </section>
  );
}
