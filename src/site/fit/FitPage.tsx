// "Does it work for my business?": type a business or browse the list, and see honestly what Wherehouse
// would track there, what the labels would say, and what it won't do.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../../ui/icons';
import { BRAND } from '../../brand';
import { useSite } from '../routing';
import { BUSINESSES, CATEGORIES, FIT_LABEL, matchBusiness, type Business, type Category } from './businesses';
import './fit.css';

const FIT_PCT = { great: 100, good: 80, partial: 55 } as const;
/** The two marquee rows: every other business, so each appears once across both rows. */
const ROWS = [0, 1].map((row) => BUSINESSES.filter((_, i) => i % 2 === row));
/** "All" starts with a few from each kind, so the list isn't a wall of tiles; one tap shows the rest. */
const PREVIEW = CATEGORIES.flatMap((c) => BUSINESSES.filter((b) => b.cat === c.id).slice(0, 3));
const QUICK = ['Do you have physical things that get moved around?', 'Are they kept in more than one spot, room or shelf?', 'Do several people need to find them?'];

export function FitPage() {
  const { go } = useSite();
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState<Category | 'all'>('all');
  const [picked, setPicked] = useState<Business | null>(null);
  const [asked, setAsked] = useState('');
  const [all, setAll] = useState(false);
  const detail = useRef<HTMLDivElement>(null);
  // Shuffled once per visit and kept stable, so the typewriter never restarts mid-word.
  const [words] = useState(() => shuffle(BUSINESSES.map((b) => b.say)));
  const typed = useTypewriter(words);
  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return BUSINESSES.filter((b) => b.name.toLowerCase().includes(q) || b.say.toLowerCase().includes(q) || b.also.some((a) => a.includes(q))).slice(0, 5);
  }, [query]);
  const shown = cat !== 'all' ? BUSINESSES.filter((b) => b.cat === cat) : all ? BUSINESSES : PREVIEW;

  const choose = (b: Business | null, text = '') => {
    setPicked(b);
    setAsked(b ? '' : text);
    setQuery('');
    requestAnimationFrame(() => detail.current?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }));
  };
  const submit = () => {
    const q = query.trim();
    if (!q) return;
    choose(matchBusiness(q), q);
  };

  return (
    <div className="fit">
      <section className="fit-hero">
        <div className="fit-glow" aria-hidden="true">
          <span />
          <span />
        </div>
        <div className="site-inner fit-hero-inner">
          <p className="site-eyebrow">Who it’s for</p>
          <h1 className="fit-title">
            Does {BRAND.name} work for
            <span className="fit-typed-line">
              <span className="fit-typed" aria-hidden="true" data-testid="fit-typed">
                {typed}
                <i />
              </span>
              <span className="sr-only">your business</span>?
            </span>
          </h1>
          <form
            className="fit-search"
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <Icon name="find" />
            <input aria-label="Your kind of business" placeholder="Type your business, like “tire shop” or “church”" value={query} onChange={(e) => setQuery(e.target.value)} autoComplete="off" />
            <button className="site-btn primary" type="submit" disabled={!query.trim()}>
              Check
            </button>
            {suggestions.length > 0 && (
              <ul className="fit-suggest" role="listbox" aria-label="Suggestions">
                {suggestions.map((b) => (
                  <li key={b.id}>
                    <button type="button" role="option" aria-selected="false" onClick={() => choose(b)}>
                      <Icon name={b.icon} /> {b.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </form>
          <p className="fit-rule">
            <Icon name="sparkle" /> Rule of thumb: if you can put a label on it, and a label where it goes, {BRAND.name} can track it.
          </p>
        </div>
        <div className="fit-marquee" role="group" aria-label="Businesses people ask about">
          {ROWS.map((items, row) => (
            <div key={row} className={`fit-marquee-row${row ? ' reverse' : ''}`} style={{ ['--dur' as string]: `${items.length * 3}s` }}>
              {/* The second copy makes the loop seamless; it is hidden from screen readers and the tab order. */}
              {[0, 1].map((copy) =>
                items.map((b) => (
                  <button key={`${copy}-${b.id}`} type="button" className="fit-chip" onClick={() => choose(b)} {...(copy ? { tabIndex: -1, 'aria-hidden': true } : {})}>
                    <Icon name={b.icon} /> {b.name}
                  </button>
                )),
              )}
            </div>
          ))}
        </div>
      </section>

      <div ref={detail} className="site-inner fit-detail-wrap">
        {picked ? <Detail b={picked} onPlan={() => go('start')} onTalk={() => go('contact')} /> : asked ? <Unknown text={asked} onPlan={() => go('start')} /> : null}
      </div>

      <section className="site-inner fit-browse">
        <h2 className="site-h2">Or pick one that’s close</h2>
        <div className="fit-cats" role="tablist" aria-label="Kinds of business">
          <button role="tab" aria-selected={cat === 'all'} className={cat === 'all' ? 'on' : ''} onClick={() => setCat('all')}>
            <Icon name="grid" /> All
          </button>
          {CATEGORIES.map((c) => (
            <button key={c.id} role="tab" aria-selected={cat === c.id} className={cat === c.id ? 'on' : ''} onClick={() => setCat(c.id)}>
              <Icon name={c.icon} /> {c.label}
            </button>
          ))}
        </div>
        <div className="fit-grid" key={cat}>
          {shown.map((b, n) => (
            <button key={b.id} className={`fit-tile${picked?.id === b.id ? ' on' : ''}`} style={{ ['--n' as string]: n }} onClick={() => choose(b)}>
              <span className="fit-bubble">
                <Icon name={b.icon} />
              </span>
              <strong>{b.name}</strong>
            </button>
          ))}
        </div>
        {cat === 'all' && !all && (
          <button className="site-btn ghost fit-more" onClick={() => setAll(true)}>
            Show all {BUSINESSES.length} kinds of business <Icon name="chevronDown" />
          </button>
        )}
      </section>

      <section className="fit-band">
        <div className="site-inner fit-band-inner">
          <div>
            <h2 className="site-h2">See what your setup would look like.</h2>
            <p className="site-lede">The 2-minute survey plans your zones, labels and printer, and recommends a plan.</p>
          </div>
          <button className="site-btn primary" onClick={() => go('start')}>
            Find your plan <Icon name="arrowRight" />
          </button>
        </div>
      </section>
    </div>
  );
}

function Detail({ b, onPlan, onTalk }: { b: Business; onPlan: () => void; onTalk: () => void }) {
  return (
    <article key={b.id} className={`fit-detail fit-${b.fit}`} data-testid="fit-detail" aria-live="polite">
      <header>
        <span className="fit-bubble big">
          <Icon name={b.icon} />
        </span>
        <div>
          <p className="site-eyebrow">{b.name}</p>
          <h2>{b.fit === 'partial' ? `Yes, with some limits.` : `Yes. It’s a ${FIT_LABEL[b.fit].toLowerCase()}.`}</h2>
          <div className="fit-meter" aria-label={`${FIT_LABEL[b.fit]}`}>
            <i style={{ ['--pct' as string]: `${FIT_PCT[b.fit]}%` }} />
          </div>
        </div>
      </header>
      <div className="fit-detail-body">
        <div className="fit-facts">
          <div>
            <h3>
              <Icon name="box" /> What you’d track
            </h3>
            <p>{b.track}</p>
          </div>
          <div>
            <h3>
              <Icon name="locations" /> Where it lives
            </h3>
            <p>{b.spot}, each with its own label.</p>
          </div>
          <div>
            <h3>
              <Icon name="text" /> Your words
            </h3>
            <p>
              The app would say “Receive {a(b.thing)}” and “Find {a(b.thing)}”.
            </p>
          </div>
          {b.limit && (
            <div className="fit-limit">
              <h3>
                <Icon name="alertCircle" /> What it won’t do
              </h3>
              <p>{b.limit}</p>
            </div>
          )}
        </div>
        <div className="fit-mock" aria-label={`Example label: ${b.thing} at spot ${b.code}`}>
          <div className="fit-label">
            <span className="fit-label-stripe" />
            <b>{b.thing.toUpperCase()} 000042</b>
            <span className="fit-qr" aria-hidden="true">
              {Array.from({ length: 49 }, (_, i) => (
                <i key={i} className={(i * 7 + b.id.length * 3) % 5 < 2 || [0, 1, 7, 8, 5, 6, 12, 13, 35, 36, 42, 43].includes(i) ? 'on' : ''} />
              ))}
            </span>
          </div>
          <Icon name="arrowRight" />
          <div className="fit-spot">
            <small>Spot</small>
            <b>{b.code}</b>
          </div>
        </div>
      </div>
      <div className="fit-actions">
        <button className="site-btn primary" onClick={onPlan}>
          Find your plan
        </button>
        <button className="site-btn ghost" onClick={onTalk}>
          Ask us about it
        </button>
      </div>
    </article>
  );
}

function Unknown({ text, onPlan }: { text: string; onPlan: () => void }) {
  const [yes, setYes] = useState<(boolean | null)[]>([null, null, null]);
  const score = yes.filter(Boolean).length;
  const done = yes.every((y) => y !== null);
  return (
    <article className="fit-detail fit-unknown" data-testid="fit-unknown">
      <header>
        <span className="fit-bubble big">
          <Icon name="question" />
        </span>
        <div>
          <p className="site-eyebrow">{text}</p>
          <h2>We don’t have that one listed yet. Three quick questions:</h2>
        </div>
      </header>
      <div className="fit-quick">
        {QUICK.map((q, i) => (
          <div key={q} className="fit-q" style={{ ['--n' as string]: i }}>
            <span>{q}</span>
            <span className="fit-yn" role="radiogroup" aria-label={q}>
              {[true, false].map((v) => (
                <button key={String(v)} role="radio" aria-checked={yes[i] === v} className={yes[i] === v ? 'on' : ''} onClick={() => setYes(yes.map((y, k) => (k === i ? v : y)))}>
                  {v ? 'Yes' : 'No'}
                </button>
              ))}
            </span>
          </div>
        ))}
      </div>
      {done && (
        <div className="fit-verdict" role="status">
          <div className="fit-meter">
            <i style={{ ['--pct' as string]: `${[20, 45, 75, 100][score]}%` }} />
          </div>
          <p>
            {score === 3
              ? 'Sounds like a great fit. That’s exactly the problem Wherehouse solves.'
              : score === 2
                ? 'Probably a good fit. Take the survey and we’ll recommend a setup.'
                : score === 1
                  ? 'Maybe. Tell us more and we’ll give you an honest answer.'
                  : 'Probably not a fit. Wherehouse is for finding physical things that move around.'}
          </p>
          <div className="fit-actions">
            {score >= 2 && (
              <button className="site-btn primary" onClick={onPlan}>
                Find your plan
              </button>
            )}
            <a className={`site-btn${score >= 2 ? ' ghost' : ' primary'}`} href={`mailto:${BRAND.supportEmail}?subject=${encodeURIComponent(`Would Wherehouse work for ${text}?`)}`}>
              Ask us about {text.length > 30 ? 'it' : text}
            </a>
          </div>
        </div>
      )}
    </article>
  );
}

/** “a pallet”, “an item”. */
function a(thing: string): string {
  const w = thing.toLowerCase();
  return `${/^[aeiou]/.test(w) ? 'an' : 'a'} ${w}`;
}

function shuffle<T>(list: T[]): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const HOLD_MS = 1800; // how long a finished word stays up
const ERASE_MS = 240; // the whole word is gone in about this long
const TYPE_MS = 60; // per letter, plus a little jitter

/** Shows a word, erases all of it quickly, types the next one, pauses, and repeats through the list.
 *  `words` must be a stable array (not rebuilt each render), or the cycle restarts on every letter. */
function useTypewriter(words: string[]): string {
  const [text, setText] = useState(words[0]);
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let w = 0,
      shown = words[0].length,
      erasing = true,
      t = 0;
    const step = () => {
      const word = words[w];
      if (erasing) {
        // Take several letters per frame so long and short words both vanish in about ERASE_MS.
        shown = Math.max(0, shown - Math.ceil(word.length / 8));
        setText(word.slice(0, shown));
        if (shown > 0) return (t = window.setTimeout(step, ERASE_MS / 8));
        erasing = false;
        w = (w + 1) % words.length;
        return (t = window.setTimeout(step, 200));
      }
      shown++;
      setText(word.slice(0, shown));
      if (shown < word.length) return (t = window.setTimeout(step, TYPE_MS + Math.random() * 40));
      erasing = true;
      t = window.setTimeout(step, HOLD_MS);
    };
    t = window.setTimeout(step, HOLD_MS);
    return () => window.clearTimeout(t);
  }, [words]);
  return text;
}
