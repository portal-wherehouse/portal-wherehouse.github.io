// Step-by-step tutorials: accordion cards with numbered steps, a tip, and buttons that open the
// real screen or the matching video chapter.

import { useApp } from '../../app/state';
import { ROLE_RANK } from '../../domain/transitions';
import { Icon } from '../../ui/icons';
import { ROLE_LABEL } from '../../ui/ui';
import { rich } from './helpers';
import { TUTORIAL_GROUPS, TUTORIALS, type Tutorial, type TutorialGroup } from './tutorials';
import type { HelpTarget } from './types';
import { VIDEO_CHAPTERS } from './videoChapters';

export type TutorialFilter = TutorialGroup | 'all';

export function TutorialsSection({
  filter,
  setFilter,
  open,
  setOpen,
  flash,
  onGo,
  onChapter,
}: {
  filter: TutorialFilter;
  setFilter: (f: TutorialFilter) => void;
  open: Set<string>;
  setOpen: (next: Set<string>) => void;
  flash: string | null;
  onGo: (t: HelpTarget) => void;
  onChapter: (id: string) => void;
}) {
  const list = TUTORIALS.filter((t) => filter === 'all' || t.group === filter);
  const allOpen = list.length > 0 && list.every((t) => open.has(t.id));
  const toggle = (id: string, isOpen: boolean) => {
    if (isOpen === open.has(id)) return;
    const next = new Set(open);
    if (isOpen) next.add(id);
    else next.delete(id);
    setOpen(next);
  };

  return (
    <div className="stack">
      <div className="help-toolbar">
        <div className="help-filter" role="group" aria-label="Show tutorials for">
          <button type="button" className="pill-toggle" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
            All <span className="help-count">{TUTORIALS.length}</span>
          </button>
          {TUTORIAL_GROUPS.map((g) => (
            <button key={g.id} type="button" className="pill-toggle" aria-pressed={filter === g.id} onClick={() => setFilter(g.id)} title={g.hint}>
              {g.label} <span className="help-count">{TUTORIALS.filter((t) => t.group === g.id).length}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          className="btn ghost small"
          onClick={() => {
            const next = new Set(open);
            for (const t of list) {
              if (allOpen) next.delete(t.id);
              else next.add(t.id);
            }
            setOpen(next);
          }}
        >
          <Icon name="chevronDown" className={allOpen ? 'help-flip' : undefined} />
          {allOpen ? 'Collapse all' : 'Expand all'}
        </button>
      </div>
      <div className="help-tutorials">
        {list.map((t) => (
          <TutorialCard key={t.id} t={t} number={TUTORIALS.indexOf(t) + 1} open={open.has(t.id)} flash={flash === `help-tut-${t.id}`} onToggle={(o) => toggle(t.id, o)} onGo={onGo} onChapter={onChapter} />
        ))}
      </div>
    </div>
  );
}

function TutorialCard({
  t,
  number,
  open,
  flash,
  onToggle,
  onGo,
  onChapter,
}: {
  t: Tutorial;
  number: number;
  open: boolean;
  flash: boolean;
  onToggle: (open: boolean) => void;
  onGo: (target: HelpTarget) => void;
  onChapter: (id: string) => void;
}) {
  const { role } = useApp();
  const short = role && ROLE_RANK[role] < ROLE_RANK[t.role];
  const chapter = t.chapter ? VIDEO_CHAPTERS.find((c) => c.id === t.chapter) : undefined;
  const who = t.role === 'VIEWER' ? 'Any role' : t.role === 'OWNER' ? 'Owner' : `${ROLE_LABEL[t.role]} and up`;
  return (
    <details className={`help-tut ${flash ? 'help-flash' : ''}`} id={`help-tut-${t.id}`} open={open} onToggle={(e) => onToggle(e.currentTarget.open)}>
      <summary>
        <span className="help-tut-icon" aria-hidden="true">
          <Icon name={t.icon} />
        </span>
        <span className="help-tut-head">
          <span className="help-tut-title">
            <span className="help-tut-num">{number}.</span> {t.title}
          </span>
          <span className="help-tut-outcome">{t.outcome}</span>
          <span className="help-tut-meta">
            <span className="tag">{t.steps.length} steps</span>
            <span className="tag">
              <Icon name="clock" width={12} height={12} /> About {t.minutes} min
            </span>
            <span className={`tag ${short ? 'warn' : ''}`}>
              <Icon name={short ? 'lock' : 'user'} width={12} height={12} /> {who}
            </span>
          </span>
        </span>
        <Icon name="chevronDown" className="help-tut-chev" />
      </summary>
      <div className="help-tut-body">
        {short && role && (
          <p className="help-tut-role">
            <Icon name="lock" />
            <span>
              You are using the {ROLE_LABEL[role]} account, which can read along but not do every step. Switch role from the yellow strip at the top to follow it all the way.
            </span>
          </p>
        )}
        <ol className="help-steps">
          {t.steps.map((s, i) => (
            <li key={i}>
              <span className="help-step-n" aria-hidden="true">
                {i + 1}
              </span>
              <span>{rich(s)}</span>
            </li>
          ))}
        </ol>
        {t.tip && (
          <p className="help-tip">
            <Icon name="bolt" />
            <span>
              <strong>Tip.</strong> {rich(t.tip)}
            </span>
          </p>
        )}
        <div className="row">
          <button type="button" className="btn primary" onClick={() => onGo(t.target)} aria-label={`Show me: open ${t.where}`}>
            Show me <Icon name="arrowRight" />
          </button>
          {chapter && (
            <button type="button" className="btn ghost" onClick={() => onChapter(chapter.id)}>
              <Icon name="video" /> In the video at {chapter.stamp}
            </button>
          )}
          <span className="faint help-opens">Opens {t.where}</span>
        </div>
      </div>
    </details>
  );
}
