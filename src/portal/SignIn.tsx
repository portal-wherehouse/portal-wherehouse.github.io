import { useEffect, useRef, useState } from 'react';
import { BRAND } from '../brand';
import { useApp } from '../app/state';
import { INDUSTRIES, industry, industryFromSearch, sampleSpots, type IndustryId, type IndustrySample } from '../demo/industries';
import { GROUPS } from '../site/for/groups';
import { BrandMark, Icon, type IconName } from '../ui/icons';
import { rememberKind } from './SampleSwitcher';
import './signin.css';
import './sample-door.css';

// The sample warehouse's front door. First "Try the sample warehouse for your…" with a pick of the kinds of business,
// then the three ways in (management, employee, practice setup), all filled with that business's sample data.

const ICON: Record<IndustryId, IconName> = Object.fromEntries(GROUPS.map((g) => [g.id, g.icon])) as Record<IndustryId, IconName>;

/** Each card gets its own accent, so the list reads as eight different businesses. */
const TONES = ['#1f5fd6', '#b4651a', '#c2410c', '#0f766e', '#7c3aed', '#be185d', '#475569', '#15803d'];

const FILLED = [0, 2, 5, 7, 10, 12, 13];

function reducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** One scan pair at a time on the hero's rack, with this business's items and spots. */
function scansFor(s: IndustrySample) {
  const at = sampleSpots(s);
  const short = (d: string) => d.split(',')[0];
  return [
    { item: 'P-000042', spot: at.a21, what: short(s.products[0].description), cell: 4 },
    { item: 'P-000118', spot: at.b11, what: short(s.stock[0]), cell: 9 },
    { item: 'P-000207', spot: at.a12, what: short(s.lot.description), cell: 1 },
    { item: 'P-000315', spot: at.c11, what: short(s.overflowStock[0]), cell: 14 },
  ];
}

function LiveRack({ sample }: { sample: IndustrySample }) {
  const scans = scansFor(sample);
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (reducedMotion()) return;
    const t = window.setInterval(() => setStep((s) => (s + 1) % scans.length), 2600);
    return () => window.clearInterval(t);
  }, [scans.length]);
  const scan = scans[step];
  return (
    <div className="sd-rack" aria-hidden="true">
      <div className="sd-rack-grid">
        {Array.from({ length: 16 }, (_, i) => {
          const landing = i === scan.cell;
          const filled = FILLED.includes(i) || scans.slice(0, step).some((s) => s.cell === i);
          return (
            <span key={i} className={`sd-cell${filled ? ' filled' : ''}${landing ? ' landing' : ''}`}>
              {landing && <span key={step} className="sd-box" />}
            </span>
          );
        })}
        <span key={`beam-${step}`} className="sd-beam" />
      </div>
      <div key={`log-${sample.id}-${step}`} className="sd-log">
        <span className="sd-log-ok">
          <Icon name="check" />
        </span>
        <span className="sd-log-text">
          <b>{scan.item}</b> {scan.what} <i>→</i> <b>{scan.spot}</b>
        </span>
      </div>
    </div>
  );
}

/** "for your lumberyard": types and erases each kind of business in turn until one is picked. */
const WORDS = INDUSTRIES.map((i) => i.your);

function TypedKind({ picked }: { picked: IndustrySample | null }) {
  const words = WORDS;
  const [t, setT] = useState({ i: 0, n: 0, back: false });
  const still = !!picked || reducedMotion();
  useEffect(() => {
    if (still) return;
    const word = words[t.i];
    const done = !t.back && t.n === word.length;
    const gone = t.back && t.n === 0;
    const wait = done ? 1500 : gone ? 260 : t.back ? 34 : 70;
    const timer = window.setTimeout(() => {
      setT((cur) => {
        if (!cur.back && cur.n === words[cur.i].length) return { ...cur, back: true };
        if (cur.back && cur.n === 0) return { i: (cur.i + 1) % words.length, n: 0, back: false };
        return { ...cur, n: cur.n + (cur.back ? -1 : 1) };
      });
    }, wait);
    return () => window.clearTimeout(timer);
  }, [t, still]);
  const shown = picked ? picked.your : still ? 'business' : words[t.i].slice(0, t.n);
  return (
    <p className="sd-for">
      <span className="sr-only">For your {picked ? picked.your : 'business'}</span>
      <span aria-hidden="true">
        <span>for your</span>
        <span className={`sd-typed${picked ? ' picked' : ''}`}>
          {shown}
          {!still && <span className="sd-caret" />}
        </span>
      </span>
    </p>
  );
}

function KindPicker({ current, onPick }: { current: IndustryId | null; onPick: (id: IndustryId) => void }) {
  return (
    <ul className="sd-kinds" aria-label="Kinds of business">
      {INDUSTRIES.map((s, i) => (
        <li key={s.id} className="sd-in" style={{ '--d': `${200 + i * 55}ms` } as React.CSSProperties}>
          <button className="sd-kind" data-kind={s.id} aria-pressed={current === s.id} style={{ '--tone': TONES[i] } as React.CSSProperties} onClick={() => onPick(s.id)}>
            <span className="sd-kind-icon">
              <Icon name={ICON[s.id]} />
            </span>
            <span className="sd-kind-text">
              <strong>{s.title}</strong>
              <small>{s.blurb}</small>
            </span>
            <span className="sd-kind-go" aria-hidden="true">
              <Icon name="arrowRight" />
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function SignIn() {
  const { backend, signIn, go, route } = useApp();
  const sample = backend.sampleMode;
  const [picked, setPicked] = useState<IndustryId | null>(() => (sample && typeof location !== 'undefined' ? industryFromSearch(location.search) : null));
  const chosen = picked ? industry(picked) : null;
  const shown = chosen ?? (sample ? null : industry(backend.industry));
  const viewsHead = useRef<HTMLHeadingElement>(null);
  const pickHead = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);
  useEffect(() => {
    if (!moved.current) return;
    (picked ? viewsHead : pickHead).current?.focus();
  }, [picked]);

  const pick = (id: IndustryId) => {
    moved.current = true;
    setPicked(id);
    rememberKind(id);
    try {
      window.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' });
    } catch {
      /* stays where it is */
    }
  };
  const change = () => {
    moved.current = true;
    setPicked(null);
  };
  const open = async (role: 'OWNER' | 'OPERATOR', fixture: 'tiny' | 'fresh' = 'tiny') => {
    const kind = picked ?? backend.industry;
    const fresh = backend.meta?.fixture === 'fresh';
    const stale = fresh !== (fixture === 'fresh') || (sample && backend.industry !== kind);
    if (stale) await backend.reset(fixture, kind);
    const member = backend.db.memberships.find((m) => m.active && m.role === role);
    if (!member) return;
    signIn(member.user_id, member.workspace_id);
    go(route.name !== 'signin' ? route : 'overview');
  };
  const place = shown && sample ? shown.your : 'warehouse';

  return (
    <div className={`sample-door customer-app${shown ? '' : ' picking'}`}>
      <section className="sd-hero">
        <div className="sd-stripe" />
        <div className="sd-hero-inner">
          <button className="sd-brand" onClick={() => go('home')}>
            <BrandMark className="sd-brand-mark" />
            <span>{BRAND.name}</span>
          </button>
          <p className="sd-eyebrow sd-in" style={{ '--d': '60ms' } as React.CSSProperties}>
            <span className="sd-live" /> Live demo · no account needed
          </p>
          <div className="sd-heading sd-in" style={{ '--d': '120ms' } as React.CSSProperties}>
            <h1 className="sd-title">Sample warehouse</h1>
            {sample && <TypedKind picked={chosen} />}
          </div>
          <p className="sd-lede sd-in" style={{ '--d': '180ms' } as React.CSSProperties}>
            {chosen ? `${chosen.blurb} ` : 'Racks, products, orders and a crew already in it, set up like your kind of business. '}
            Click around, scan and move stock. Nothing you do here can break anything.
          </p>
          <div className="sd-in" style={{ '--d': '240ms' } as React.CSSProperties}>
            <LiveRack key={(chosen ?? industry(null)).id} sample={chosen ?? industry(null)} />
          </div>
          <ol className="sd-steps sd-in" style={{ '--d': '300ms' } as React.CSSProperties}>
            <li>
              <span>1</span>Scan the item
            </li>
            <li>
              <span>2</span>Scan the spot
            </li>
            <li>
              <span>3</span>Everyone can find it
            </li>
          </ol>
        </div>
      </section>

      <main className="sd-main" id="main">
        {!shown ? (
          <div className="sd-main-inner" key="pick">
            <h2 ref={pickHead} tabIndex={-1} className="sd-in" style={{ '--d': '120ms' } as React.CSSProperties}>
              Try the sample warehouse for your…
            </h2>
            <p className="sd-sub sd-in" style={{ '--d': '160ms' } as React.CSSProperties}>
              Pick the closest match. Products, spots, orders and people in the sample are set up for it, and you can switch at any time.
            </p>
            <KindPicker current={picked} onPick={pick} />
            <Foot delay={720} />
          </div>
        ) : (
          <div className="sd-main-inner" key={`views-${shown.id}`}>
            {sample && (
              <div className="sd-picked sd-in" style={{ '--d': '60ms' } as React.CSSProperties}>
                <span className="sd-picked-icon" style={{ '--tone': TONES[INDUSTRIES.indexOf(shown)] } as React.CSSProperties}>
                  <Icon name={ICON[shown.id]} />
                </span>
                <span className="sd-picked-text">
                  <small>Sample for a</small>
                  <strong>{shown.your}</strong>
                </span>
                <button className="sd-change" onClick={change}>
                  Change
                </button>
              </div>
            )}
            <h2 ref={viewsHead} tabIndex={-1} className="sd-in" style={{ '--d': '140ms' } as React.CSSProperties}>
              Pick a view to start
            </h2>
            <button className="sample-choice sd-choice sd-in tone-blue" style={{ '--d': '200ms' } as React.CSSProperties} onClick={() => void open('OWNER')}>
              <span className="sd-choice-icon">
                <Icon name="overview" />
              </span>
              <span className="sd-choice-text">
                <strong>View a management dashboard</strong>
                <small>See the whole {place}, what's running low, orders, reports and your team.</small>
              </span>
              <span className="sd-choice-go">
                <Icon name="arrowRight" />
              </span>
            </button>
            <button className="sample-choice sd-choice sd-in tone-yellow" style={{ '--d': '270ms' } as React.CSSProperties} onClick={() => void open('OPERATOR')}>
              <span className="sd-choice-icon">
                <Icon name="scanner" />
              </span>
              <span className="sd-choice-text">
                <strong>View an employee dashboard</strong>
                <small>Receive a delivery, move an item and pick an order, the way your crew would.</small>
              </span>
              <span className="sd-choice-go">
                <Icon name="arrowRight" />
              </span>
            </button>
            <button className="sample-choice sd-choice sd-in tone-green" style={{ '--d': '340ms' } as React.CSSProperties} data-testid="practice-setup" onClick={() => void open('OWNER', 'fresh')}>
              <span className="sd-choice-icon">
                <Icon name="hardhat" />
              </span>
              <span className="sd-choice-text">
                <strong>Practice setting up a new warehouse</strong>
                <small>Start empty and build zones, spots and labels with the setup wizard.</small>
              </span>
              <span className="sd-choice-go">
                <Icon name="arrowRight" />
              </span>
            </button>
            <p className="sd-note sd-in" style={{ '--d': '410ms' } as React.CSSProperties}>
              Practice data stays in this browser. Short notes explain each screen.
            </p>
            <Foot delay={460} />
          </div>
        )}
      </main>
    </div>
  );
}

function Foot({ delay }: { delay: number }) {
  const { go } = useApp();
  return (
    <div className="sd-foot sd-in" style={{ '--d': `${delay}ms` } as React.CSSProperties}>
      <button className="sd-link" onClick={() => go('home')}>
        Back to the website
      </button>
      <a className="sd-link" href={`${location.pathname}#signin`}>
        Customer sign-in
      </a>
    </div>
  );
}
