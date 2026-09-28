// Frequently asked questions: a search box that filters and highlights, and a details/summary item
// per question, grouped by category.

import { useMemo } from 'react';
import { Icon } from '../../ui/icons';
import { FAQ, FAQ_COUNT, type FaqItem } from './faq';
import { highlight, matchesAll, scrollToId, termsOf } from './helpers';
import type { HelpTarget } from './types';

/** Everything a search looks at: the group's name, the question and the answer. */
export function faqText(item: FaqItem, group: string): string {
  return `${group} ${item.q} ${item.a.join(' ')}`;
}

export function FaqSection({
  query,
  setQuery,
  open,
  setOpen,
  flash,
  onGo,
  onAsk,
}: {
  query: string;
  setQuery: (q: string) => void;
  open: Set<string>;
  setOpen: (next: Set<string>) => void;
  flash: string | null;
  onGo: (t: HelpTarget) => void;
  /** Hand the unanswered question to the contact form. */
  onAsk: (question: string) => void;
}) {
  const terms = useMemo(() => termsOf(query), [query]);
  const groups = useMemo(() => FAQ.map((c) => ({ ...c, items: terms.length ? c.items.filter((i) => matchesAll(faqText(i, c.title), terms)) : c.items })).filter((c) => c.items.length > 0), [terms]);
  const count = groups.reduce((n, c) => n + c.items.length, 0);
  const searching = terms.length > 0;

  const toggle = (id: string, isOpen: boolean) => {
    if (isOpen === open.has(id)) return;
    const next = new Set(open);
    if (isOpen) next.add(id);
    else next.delete(id);
    setOpen(next);
  };

  return (
    <div className="stack">
      <div className="help-faq-search">
        <div className="search-bar">
          <Icon name="find" />
          <label htmlFor="help-faq-q" className="sr-only">
            Search the questions
          </label>
          <input
            id="help-faq-q"
            className="input"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the questions, e.g. offline, label, scanner"
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="search"
          />
        </div>
        <p className="help-faq-count muted" aria-live="polite">
          {searching ? (count === 0 ? `No answers match “${query.trim()}”.` : `${count} of ${FAQ_COUNT} answers match “${query.trim()}”.`) : `${FAQ_COUNT} answers in ${FAQ.length} groups.`}
          {searching && (
            <button type="button" className="btn ghost small" onClick={() => setQuery('')}>
              <Icon name="x" /> Clear
            </button>
          )}
        </p>
      </div>

      {!searching && (
        <nav className="help-faq-jump" aria-label="Question groups">
          {FAQ.map((c) => (
            <button key={c.id} type="button" className="pill-toggle" onClick={() => scrollToId(`help-faq-${c.id}`, `help-faq-${c.id}-h`)}>
              <Icon name={c.icon} /> {c.title} <span className="help-count">{c.items.length}</span>
            </button>
          ))}
        </nav>
      )}

      {count === 0 ? (
        <div className="panel help-faq-empty">
          <Icon name="question" />
          <div className="stack" style={{ gap: 6 }}>
            <strong>Nothing here answers that yet.</strong>
            <span className="muted">Try fewer or different words, look through the tutorials above, or ask support directly.</span>
            <div className="row">
              <button type="button" className="btn primary small" onClick={() => onAsk(query.trim())}>
                <Icon name="mail" /> Ask support about this
              </button>
              <button type="button" className="btn small" onClick={() => setQuery('')}>
                Show all questions
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="help-faq-groups">
          {groups.map((c) => (
            <section key={c.id} className="help-faq-group" id={`help-faq-${c.id}`} aria-labelledby={`help-faq-${c.id}-h`}>
              <h3 className="help-faq-cat" id={`help-faq-${c.id}-h`} tabIndex={-1}>
                <Icon name={c.icon} /> {c.title}
              </h3>
              <div className="help-faq-list">
                {c.items.map((item) => {
                  const key = `${c.id}.${item.id}`;
                  return (
                    <details key={key} id={`help-q-${c.id}-${item.id}`} className={`help-q ${flash === `help-q-${c.id}-${item.id}` ? 'help-flash' : ''}`} open={open.has(key)} onToggle={(e) => toggle(key, e.currentTarget.open)}>
                      <summary>
                        <span className="help-q-text">{highlight(item.q, terms)}</span>
                        <Icon name="chevronDown" className="help-q-chev" />
                      </summary>
                      <div className="help-q-body">
                        {item.a.map((p, i) => (
                          <p key={i}>{highlight(p, terms)}</p>
                        ))}
                        {item.links && (
                          <div className="row help-q-links">
                            {item.links.map((l) => (
                              <button key={l.label} type="button" className="btn small" onClick={() => onGo(l.to)}>
                                {l.label} <Icon name="arrowRight" />
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </details>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
