// "A day at a lumberyard": a short click-through of one item's day, on example phone screens with sample data.
// Built on the home page's "See it work" (same phone, steps and timing rules): it plays only while on
// screen, can be paused, and waits for a tap when the visitor prefers reduced motion. Every animated
// element rests in its final state, so with animations off each step still reads correctly.

import { useEffect, useRef, useState } from 'react';
import { Icon, type IconName } from '../../ui/icons';
import { prefersReducedMotion } from '../SeeItWork';
import type { DayStep, Group, Shot } from './groupPages';
import '../see-it.css';

const MS: Record<Shot['kind'], number> = { scan: 4600, putaway: 5200, find: 5000, picklist: 5200, out: 4600 };

export function GroupShowcase({ g }: { g: Group }) {
  const [step, setStep] = useState(0);
  // Bumps on every step change so each step's animations start over.
  const [run, setRun] = useState(0);
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
    setStep(i);
    setRun((n) => n + 1);
  };
  const next = () => goTo((step + 1) % g.steps.length);
  const playing = !paused && inView;
  const current = g.steps[step];

  return (
    <div className="fg-show-wrap">
      <div ref={ref} className={`si fg-show ${playing ? 'is-playing' : 'is-paused'}`} data-shot={current.shot.kind} data-testid="group-showcase">
        <div className="si-stage">
          <div className="fg-stage" role="img" aria-label={`Example, step ${step + 1} of ${g.steps.length}: ${current.title}. ${current.body}`}>
            <Record g={g} step={current} key={`r${run}`} />
            <div className="si-phone">
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
                  <Screen key={`${step}-${run}`} g={g} shot={current.shot} />
                  <div className="si-tabs">
                    {(['receive', 'move', 'find', 'more'] as const).map((n) => (
                      <span key={n} className={n === tabFor(current.shot) ? 'on' : undefined}>
                        <Icon name={n} />
                        {n[0].toUpperCase() + n.slice(1)}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
          {!reduced && (
            <button type="button" className="si-pause" onClick={() => setPaused((p) => !p)} aria-label={paused ? 'Play the example' : 'Pause the example'}>
              {paused ? <Icon name="play" /> : <span className="si-pause-bars" aria-hidden="true" />}
            </button>
          )}
        </div>

        <ol className="si-steps">
          {g.steps.map((s, i) => (
            <li key={s.title} className={i === step ? 'on' : i < step ? 'done' : undefined}>
              <button type="button" onClick={() => goTo(i)} aria-current={i === step ? 'step' : undefined}>
                <span className="si-n">{i + 1}</span>
                <span className="si-step-text">
                  <small className="fg-verb">{s.verb}</small>
                  <strong>{s.title}</strong>
                  <span>{s.body}</span>
                </span>
                <span className="si-progress" aria-hidden="true">
                  {i === step && !reduced && <i key={run} style={{ animationDuration: `${MS[s.shot.kind]}ms` }} onAnimationEnd={next} />}
                </span>
              </button>
            </li>
          ))}
        </ol>
      </div>
      <p className="fg-show-note">
        <Icon name="info" />
        Example screens with sample data. Not a real customer.
      </p>
    </div>
  );
}

const tabFor = (shot: Shot): IconName => (shot.kind === 'scan' ? 'receive' : shot.kind === 'putaway' ? 'move' : 'find');

/** The item's record beside the phone: its label, and where it is after this step. */
function Record({ g, step }: { g: Group; step: DayStep }) {
  const { item } = g;
  const shot = step.shot;
  const at =
    shot.kind === 'scan'
      ? { tag: shot.tag, tone: 'new', where: shot.note, spot: false, line: `${shot.screen === 'Return' ? 'Checked in' : 'Received'} by Alex, just now` }
      : shot.kind === 'out'
        ? { tag: 'Sent out', tone: 'out', where: shot.to, spot: false, line: shot.by }
        : {
            tag: shot.kind === 'picklist' ? 'Picking' : 'Stored',
            tone: 'ok',
            where: item.spotName,
            spot: true,
            line: shot.kind === 'putaway' ? 'Moved by Alex, just now' : shot.kind === 'picklist' ? `On the pick list for ${item.job}` : 'Moved 2 hr ago by Alex',
          };
  return (
    <div className="fg-rec" aria-hidden="true">
      <Label g={g} />
      <div className="fg-rec-now">
        <div className="fg-rec-top">
          <span className="fg-rec-h">Where it is now</span>
          <span className={`fg-chip ${at.tone}`}>{at.tag}</span>
        </div>
        <div className="fg-rec-where">
          {at.spot ? (
            <span className="fg-spot">{item.spot}</span>
          ) : (
            <span className="fg-rec-icon">
              <Icon name={shot.kind === 'out' ? 'send' : 'receive'} />
            </span>
          )}
          <span>
            <b>{at.where}</b>
            <small>{at.line}</small>
          </span>
        </div>
      </div>
    </div>
  );
}

/** A label like the ones Wherehouse prints: the item word, its code, what it is and who it's for. */
export function Label({ g }: { g: Group }) {
  const { item } = g;
  return (
    <div className="fg-label" aria-hidden="true">
      <span className="fg-label-stripe" />
      <small>{item.thing}</small>
      <b>{item.code}</b>
      <span className="fg-label-desc">{item.desc}</span>
      <span className="fg-label-job">{item.job}</span>
      <span className="fg-label-bars" />
    </div>
  );
}

function Who({ sam }: { sam?: boolean }) {
  return sam ? (
    <span className="si-who sam">
      <i>S</i>Sam
    </span>
  ) : (
    <span className="si-who">
      <i>A</i>Alex
    </span>
  );
}

function Viewfinder({ text, got }: { text: string; got: string }) {
  return (
    <div className="si-viewfinder">
      <i className="tl" />
      <i className="tr" />
      <i className="bl" />
      <i className="br" />
      <span className="si-vf-line" />
      <span className="si-vf-text">{text}</span>
      <span className="si-vf-got">
        <Icon name="check" />
        {got}
      </span>
    </div>
  );
}

/** What the phone shows for one step. Remounted per step, so the entrance animations replay. */
function Screen({ g, shot }: { g: Group; shot: Shot }) {
  const { item } = g;
  switch (shot.kind) {
    case 'scan':
      return (
        <div className="si-screen">
          <div className="si-top">
            <span className="si-title">{shot.screen}</span>
            <Who />
          </div>
          <Viewfinder text="Scan the label" got={item.code} />
          <div className="si-card si-a-item">
            <div className="si-card-top">
              <span className="si-code">{item.code}</span>
              <span className="si-tag">{shot.tag}</span>
            </div>
            <div className="si-desc">{item.desc}</div>
            <div className="fg-ph-note">{shot.note}</div>
            <div className="si-hint">{shot.hint}</div>
          </div>
        </div>
      );
    case 'putaway':
      return (
        <div className="si-screen">
          <div className="si-top">
            <span className="si-title">Move</span>
            <Who />
          </div>
          <div className="si-card si-mini">
            <span className="si-code">{item.code}</span>
            <span className="si-desc">{item.desc}</span>
          </div>
          <Viewfinder text="Scan the spot" got={item.spot} />
          <div className="si-moveto si-a-to">
            <span className="si-code">{item.code}</span>
            <Icon name="arrowRight" />
            <span className="si-spot">{item.spot}</span>
          </div>
          <div className="si-confirm">
            <span className="si-btn">Confirm move</span>
            <span className="si-saved">
              <Icon name="check" />
              Saved to {item.spot}
            </span>
          </div>
        </div>
      );
    case 'find':
      return (
        <div className="si-screen">
          <div className="si-top">
            <span className="si-title">Find</span>
            <Who sam />
          </div>
          <div className="si-search">
            <Icon name="find" />
            <span className="si-typed" style={{ width: `${shot.query.length}ch`, animationTimingFunction: `steps(${shot.query.length}, end)` }}>
              {shot.query}
            </span>
            <span className="si-caret" />
          </div>
          <div className="si-card si-a-result">
            <div className="si-card-top">
              <span className="si-code">{item.code}</span>
              <span className="si-tag ok">Stored</span>
            </div>
            <div className="si-desc">{item.desc}</div>
            <div className="si-where">
              <span className="si-spot">{item.spot}</span>
              <span>
                <b>{item.spotName}</b>
                <br />
                Moved 2 hr ago by Alex
              </span>
            </div>
          </div>
          <div className="si-history si-a-hist">
            {shot.history.map((h, i) => (
              <div key={h} className="si-row">
                <i className={i === 0 ? 'on' : undefined} />
                {h}
              </div>
            ))}
          </div>
        </div>
      );
    case 'picklist':
      return (
        <div className="si-screen">
          <div className="si-top">
            <span className="si-title">Pick</span>
            <Who sam />
          </div>
          <div className="fg-pl-head">
            <b>{item.job}</b>
            <small>Pick list · sorted by spot</small>
          </div>
          <ul className="fg-pl">
            {shot.rows.map(([code, desc, spot], i) => (
              <li key={code} style={{ ['--i' as string]: i }}>
                <span className="fg-pl-check">
                  <Icon name="check" />
                </span>
                <span className="fg-pl-text">
                  <b>{code}</b>
                  <small>{desc}</small>
                </span>
                <span className="fg-pl-spot">{spot}</span>
              </li>
            ))}
          </ul>
          <div className="fg-pl-done">
            <Icon name="check" />
            All {shot.rows.length} picked
          </div>
        </div>
      );
    case 'out':
      return (
        <div className="si-screen">
          <div className="si-top">
            <span className="si-title">Send out</span>
            <Who sam />
          </div>
          <Viewfinder text="Scan the label" got={item.code} />
          <div className="si-card si-a-item">
            <div className="si-card-top">
              <span className="si-code">{item.code}</span>
              <span className="si-tag ok">Sent out</span>
            </div>
            <div className="si-desc">{item.desc}</div>
            <div className="fg-ph-to">
              <Icon name="send" />
              {shot.to}
            </div>
          </div>
          <div className="fg-ph-cleared">
            <Icon name="check" />
            {item.spot} is clear
          </div>
        </div>
      );
  }
}
