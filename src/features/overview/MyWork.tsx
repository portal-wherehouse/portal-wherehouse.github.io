// Work assigned on the Dashboard: scheduled counts and moves for this person, and counts waiting for a manager.

import { useMemo } from 'react';
import { useApp } from '../../app/state';
import { warehouseDate } from '../../domain/receiving';
import { roleAllows } from '../../domain/transitions';
import { countDueState } from '../../domain/work';
import { Icon } from '../../ui/icons';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function MyWork() {
  const { read, v, go, role } = useApp();
  const data = useMemo(
    () =>
      read((e, a, ws) => {
        const ctx = e.context(a, ws);
        const today = warehouseDate(ctx.warehouse?.timezone || 'UTC');
        const counts = e.countTasks(a, ws);
        const tasks = e.moveTasks(a, ws).filter((t) => t.status === 'OPEN');
        return {
          today,
          mine: counts.filter((c) => c.status === 'OPEN' && c.assigned_to === a),
          review: counts.filter((c) => c.status === 'REVIEW'),
          moves: tasks.filter((t) => t.assigned_to === a || !t.assigned_to),
        };
      }),
    [v, read], // eslint-disable-line react-hooks/exhaustive-deps
  );
  if (!data) return null;
  const manager = role === 'OWNER' || role === 'SUPERVISOR';
  const canMove = roleAllows(role, 'move');
  const late = data.mine.filter((c) => countDueState(c, data.today) !== 'later').length;
  const cards = [];
  if (canMove && data.mine.length)
    cards.push(
      <button key="counts" type="button" className="panel attention-card work-card" onClick={() => go({ name: 'station', q: 'count' })} data-testid="my-counts-card">
        <span className="attention-count">{data.mine.length}</span>
        <span>
          <strong>{data.mine.length === 1 ? 'Count to do' : 'Counts to do'}</strong>
          <small>
            {data.mine
              .slice(0, 2)
              .map((c) => c.name)
              .join(', ')}
            {data.mine.length > 2 ? ` and ${data.mine.length - 2} more` : ''}. {late ? `${plural(late, 'count')} due today or late.` : 'Assigned to you.'}
          </small>
        </span>
        <Icon name="chevronRight" />
      </button>,
    );
  if (canMove && data.moves.length)
    cards.push(
      <button key="moves" type="button" className="panel attention-card work-card" onClick={() => go({ name: 'move', q: 'tasks' })} data-testid="my-moves-card">
        <span className="attention-count">{data.moves.length}</span>
        <span>
          <strong>{data.moves.length === 1 ? 'Move to do' : 'Moves to do'}</strong>
          <small>Scan each pallet, then the spot it goes to. Each save ticks one off.</small>
        </span>
        <Icon name="chevronRight" />
      </button>,
    );
  if (manager && data.review.length)
    cards.push(
      <button key="review" type="button" className="panel attention-card work-card" onClick={() => go({ name: 'station', q: 'count' })} data-testid="review-counts-card">
        <span className="attention-count">{data.review.length}</span>
        <span>
          <strong>{data.review.length === 1 ? 'Count to review' : 'Counts to review'}</strong>
          <small>Check the differences, then save them to the records or send the count back.</small>
        </span>
        <Icon name="chevronRight" />
      </button>,
    );
  if (!cards.length) return null;
  return (
    <section className="work-cards" aria-label="Your work">
      {cards}
    </section>
  );
}
