import { useEffect, useState } from 'react';
import { BRAND } from '../brand';
import { useApp } from '../app/state';
import { BrandMark, Icon } from '../ui/icons';
import './signin.css';
import './sample-door.css';

/** One scan pair at a time on the hero's rack: the item lands in its spot and the log line updates. */
const SCANS = [
  { item: 'P-000042', spot: 'A-02-01', what: 'Copper fittings', cell: 4 },
  { item: 'P-000118', spot: 'B-01-03', what: 'Work gloves', cell: 9 },
  { item: 'P-000207', spot: 'A-01-02', what: 'Hand sanitizer', cell: 1 },
  { item: 'P-000315', spot: 'C-03-01', what: 'Pump parts', cell: 14 },
] as const;

const FILLED = [0, 2, 5, 7, 10, 12, 13];

function reducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function LiveRack() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (reducedMotion()) return;
    const t = window.setInterval(() => setStep((s) => (s + 1) % SCANS.length), 2600);
    return () => window.clearInterval(t);
  }, []);
  const scan = SCANS[step];
  return (
    <div className="sd-rack" aria-hidden="true">
      <div className="sd-rack-grid">
        {Array.from({ length: 16 }, (_, i) => {
          const landing = i === scan.cell;
          const filled = FILLED.includes(i) || SCANS.slice(0, step).some((s) => s.cell === i);
          return (
            <span key={i} className={`sd-cell${filled ? ' filled' : ''}${landing ? ' landing' : ''}`}>
              {landing && <span key={step} className="sd-box" />}
            </span>
          );
        })}
        <span key={`beam-${step}`} className="sd-beam" />
      </div>
      <div key={`log-${step}`} className="sd-log">
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

export function SignIn() {
  const { backend, signIn, go, route } = useApp();
  const demo = backend as unknown as { meta?: { fixture: string }; reset?: (f: 'tiny' | 'fresh') => Promise<void> };
  const open = async (role: 'OWNER' | 'OPERATOR', fixture: 'tiny' | 'fresh' = 'tiny') => {
    if (demo.reset && (demo.meta?.fixture === 'fresh') !== (fixture === 'fresh')) await demo.reset(fixture);
    const member = backend.db.memberships.find((m) => m.active && m.role === role);
    if (!member) return;
    signIn(member.user_id, member.workspace_id);
    go(route.name !== 'signin' ? route : 'overview');
  };
  return (
    <div className="sample-door customer-app">
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
          <h1 className="sd-title sd-in" style={{ '--d': '120ms' } as React.CSSProperties}>
            Sample warehouse
          </h1>
          <p className="sd-lede sd-in" style={{ '--d': '180ms' } as React.CSSProperties}>
            A real Wherehouse with racks, products and a crew already in it. Click around, scan, move things. Nothing you do here can break anything.
          </p>
          <div className="sd-in" style={{ '--d': '240ms' } as React.CSSProperties}>
            <LiveRack />
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
        <div className="sd-main-inner">
          <h2 className="sd-in" style={{ '--d': '200ms' } as React.CSSProperties}>
            Pick a view to start
          </h2>
          <button className="sample-choice sd-choice sd-in tone-blue" style={{ '--d': '260ms' } as React.CSSProperties} onClick={() => void open('OWNER')}>
            <span className="sd-choice-icon">
              <Icon name="overview" />
            </span>
            <span className="sd-choice-text">
              <strong>View a management dashboard</strong>
              <small>See the whole warehouse, what's running low, reports, and your team.</small>
            </span>
            <span className="sd-choice-go">
              <Icon name="arrowRight" />
            </span>
          </button>
          <button className="sample-choice sd-choice sd-in tone-yellow" style={{ '--d': '330ms' } as React.CSSProperties} onClick={() => void open('OPERATOR')}>
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
          <button className="sample-choice sd-choice sd-in tone-green" style={{ '--d': '400ms' } as React.CSSProperties} data-testid="practice-setup" onClick={() => void open('OWNER', 'fresh')}>
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
          <p className="sd-note sd-in" style={{ '--d': '470ms' } as React.CSSProperties}>
            Practice data stays in this browser. Short notes explain each screen.
          </p>
          <div className="sd-foot sd-in" style={{ '--d': '520ms' } as React.CSSProperties}>
            <button className="sd-link" onClick={() => go('home')}>
              Back to the website
            </button>
            <a className="sd-link" href={`${location.pathname}#signin`}>
              Customer sign-in
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}
