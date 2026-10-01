// Home page "See it work": a looping three-step animation of the core routine.
// A box is scanned, put on a shelf and its spot scanned, then someone else finds it.
// It only plays while on screen, can be paused, and waits for a tap when the visitor
// prefers reduced motion. Every animated element's resting style is its final state,
// so with animations off each step still reads correctly.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from '../ui/icons';
import './see-it.css';

const STEPS: { title: string; body: string; ms: number; scene: string }[] = [
  {
    title: 'Scan the item',
    body: 'Use the barcode it already has, or stick on a Wherehouse label.',
    ms: 4200,
    scene: 'A box on a cart is scanned with a phone. The phone shows P-000118, stainless hinges, 12 cases.',
  },
  {
    title: 'Scan the spot',
    body: 'Put it away, then scan the shelf, rack or floor spot. One tap saves the move.',
    ms: 4600,
    scene: 'The box goes onto shelf spot B-03 and the shelf label is scanned. The phone saves the move to B-03.',
  },
  {
    title: 'Anyone finds it',
    body: 'Search a name or code to see where it is, who moved it and when.',
    ms: 5200,
    scene: 'A teammate searches “hinges” on their own phone and sees P-000118 at B-03, moved 2 minutes ago by Alex.',
  },
];

export function prefersReducedMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export function SeeItWork() {
  const [step, setStep] = useState(0);
  // Bumps on every step change so each step's animations start over.
  const [run, setRun] = useState(0);
  // Bumps when the loop wraps, so the box arrives fresh instead of flying back down.
  const [loop, setLoop] = useState(0);
  const [reduced] = useState(prefersReducedMotion);
  const [paused, setPaused] = useState(reduced);
  const [inView, setInView] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const goTo = (i: number) => {
    if (i === 0 && step !== 0) setLoop((n) => n + 1);
    setStep(i);
    setRun((n) => n + 1);
  };
  const next = () => goTo((step + 1) % STEPS.length);

  const playing = !paused && inView;

  return (
    <div ref={ref} className={`si ${playing ? 'is-playing' : 'is-paused'}`} data-step={step} data-testid="see-it-work">
      <div className="si-stage">
        <div className="si-scene" role="img" aria-label={`Step ${step + 1} of 3. ${STEPS[step].scene}`}>
          <Scene run={run} loop={loop} />
        </div>
        <div className="si-phone" aria-hidden="true">
          <div className="si-phone-frame">
          <div className="si-phone-screen">
            <div className="si-status">
              <span>9:42</span>
              <span className="si-island" />
              <span className="si-bars">
                <i />
                <i />
                <i />
              </span>
            </div>
            <PhoneScreen key={`${step}-${run}`} step={step} />
            <div className="si-tabs">
              {(['receive', 'move', 'find', 'more'] as const).map((n) => (
                <span key={n} className={(step === 2 ? n === 'find' : n === 'move') ? 'on' : undefined}>
                  <Icon name={n} />
                  {n[0].toUpperCase() + n.slice(1)}
                </span>
              ))}
            </div>
          </div>
          </div>
        </div>
        {!reduced && (
          <button type="button" className="si-pause" onClick={() => setPaused((p) => !p)} aria-label={paused ? 'Play the animation' : 'Pause the animation'}>
            {paused ? <Icon name="play" /> : <span className="si-pause-bars" aria-hidden="true" />}
          </button>
        )}
      </div>

      <ol className="si-steps">
        {STEPS.map((s, i) => (
          <li key={s.title} className={i === step ? 'on' : i < step ? 'done' : undefined}>
            <button type="button" onClick={() => goTo(i)} aria-current={i === step ? 'step' : undefined}>
              <span className="si-n">{i + 1}</span>
              <span className="si-step-text">
                <strong>{s.title}</strong>
                <span>{s.body}</span>
              </span>
              <span className="si-progress" aria-hidden="true">
                {i === step && !reduced && <i key={run} style={{ animationDuration: `${s.ms}ms` }} onAnimationEnd={next} />}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** The rack, the box, the scanner reticle and the found-it outline. Positions come from data-step in CSS. */
function Scene({ run, loop }: { run: number; loop: number }) {
  return (
    <>
      <div className="si-floor" />
      <div className="si-rack">
        <span className="si-up l" />
        <span className="si-up r" />
        <span className="si-beam top" />
        <span className="si-beam low" />
        {/* Top shelf: A-01 to A-03, full. */}
        <span className="si-crate" style={{ left: '11cqw', width: '15cqw', height: '17cqw', top: '17cqw' }} />
        <span className="si-crate tall" style={{ left: '29.5cqw', width: '15cqw', height: '21cqw', top: '13cqw' }} />
        <span className="si-crate tote" style={{ left: '48cqw', width: '16cqw', height: '10cqw', top: '24cqw' }} />
        {/* Lower shelf: B-01 and B-02 full, B-03 open. */}
        <span className="si-crate" style={{ left: '11cqw', width: '15cqw', height: '13cqw', top: '49cqw' }} />
        <span className="si-crate tote" style={{ left: '29.5cqw', width: '15cqw', height: '9cqw', top: '53cqw' }} />
        {(['A-01', 'A-02', 'A-03'] as const).map((c, i) => (
          <span key={c} className="si-plate" style={{ left: `${10.5 + i * 19}cqw`, top: '37.4cqw' }}>
            {c}
          </span>
        ))}
        {(['B-01', 'B-02', 'B-03'] as const).map((c, i) => (
          <span key={c} className={`si-plate${c === 'B-03' ? ' target' : ''}`} style={{ left: `${10.5 + i * 19}cqw`, top: '65.4cqw' }}>
            {c}
          </span>
        ))}
      </div>

      <div className="si-cart">
        <span className="si-cart-deck" />
        <i />
        <i />
      </div>

      <div key={loop} className={`si-box${loop > 0 ? ' arrive' : ''}`}>
        <span className="si-box-tape" />
        <span className="si-box-label">
          <b>P-000118</b>
          <span className="si-box-bars" />
        </span>
      </div>

      <div key={`r${run}`} className="si-reticle">
        <i className="tl" />
        <i className="tr" />
        <i className="bl" />
        <i className="br" />
        <span className="si-beam-line" />
        <span className="si-hit">
          <Icon name="check" />
        </span>
      </div>

      <div key={`f${run}`} className="si-found">
        <span className="si-found-chip">
          <Icon name="pin" />
          B-03
        </span>
      </div>
    </>
  );
}

function Row({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`si-row ${className}`}>{children}</div>;
}

/** What the phone shows for each step. Remounted per step, so the entrance animations replay. */
function PhoneScreen({ step }: { step: number }) {
  if (step === 2)
    return (
      <div className="si-screen">
        <div className="si-top">
          <span className="si-title">Find</span>
          <span className="si-who sam">
            <i>S</i>Sam
          </span>
        </div>
        <div className="si-search">
          <Icon name="find" />
          <span className="si-typed">hinges</span>
          <span className="si-caret" />
        </div>
        <div className="si-card si-a-result">
          <div className="si-card-top">
            <span className="si-code">P-000118</span>
            <span className="si-tag ok">Stored</span>
          </div>
          <div className="si-desc">Stainless hinges, 12 cases</div>
          <div className="si-where">
            <span className="si-spot">B-03</span>
            <span>
              <b>Shelf B-03</b>
              <br />
              Moved 2 min ago by Alex
            </span>
          </div>
        </div>
        <div className="si-history si-a-hist">
          <Row>
            <i className="on" />
            Moved to B-03 by Alex
          </Row>
          <Row>
            <i />
            Received by Alex
          </Row>
        </div>
      </div>
    );
  return (
    <div className="si-screen">
      <div className="si-top">
        <span className="si-title">Move</span>
        <span className="si-who">
          <i>A</i>Alex
        </span>
      </div>
      {step === 1 && (
        <div className="si-card si-mini">
          <span className="si-code">P-000118</span>
          <span className="si-desc">Stainless hinges</span>
        </div>
      )}
      <div className="si-viewfinder">
        <i className="tl" />
        <i className="tr" />
        <i className="bl" />
        <i className="br" />
        <span className="si-vf-line" />
        <span className="si-vf-text">{step === 0 ? 'Scan the item' : 'Scan the spot'}</span>
        <span className="si-vf-got">
          <Icon name="check" />
          {step === 0 ? 'P-000118' : 'B-03'}
        </span>
      </div>
      {step === 0 ? (
        <div className="si-card si-a-item">
          <div className="si-card-top">
            <span className="si-code">P-000118</span>
            <span className="si-tag">Scanned</span>
          </div>
          <div className="si-desc">Stainless hinges, 12 cases</div>
          <div className="si-hint">Next: scan where it goes</div>
        </div>
      ) : (
        <>
          <div className="si-moveto si-a-to">
            <span className="si-code">P-000118</span>
            <Icon name="arrowRight" />
            <span className="si-spot">B-03</span>
          </div>
          <div className="si-confirm">
            <span className="si-btn">Confirm move</span>
            <span className="si-saved">
              <Icon name="check" />
              Saved to B-03
            </span>
          </div>
        </>
      )}
    </div>
  );
}
