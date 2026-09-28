// The Help page's video spot: a placeholder player that never pretends to play, a full description
// of what the walkthrough will cover, and its planned chapters with "Go there" buttons.

import { useState } from 'react';
import { BRAND } from '../../brand';
import { BrandMark, Icon } from '../../ui/icons';
import { Notice } from '../../ui/ui';
import { scrollToId } from './helpers';
import type { HelpTarget } from './types';
import { VIDEO_ABOUT, VIDEO_CHAPTERS, VIDEO_LENGTH_LABEL, type TimedChapter } from './videoChapters';

/** How many chapters show before "Show all". */
const FOLDED = 8;

export function VideoSection({
  expanded,
  setExpanded,
  flash,
  onGo,
}: {
  expanded: boolean;
  setExpanded: (v: boolean) => void;
  flash: string | null;
  onGo: (t: HelpTarget) => void;
}) {
  const [note, setNote] = useState(false);
  const shown = expanded ? VIDEO_CHAPTERS : VIDEO_CHAPTERS.slice(0, FOLDED);

  return (
    <div className="stack help-video">
      <div className="help-player">
        <div className="help-screen" role="group" aria-label={`Video placeholder: ${VIDEO_ABOUT.title}. Coming soon, planned length ${VIDEO_LENGTH_LABEL}.`}>
          <RackBackdrop />
          <div className="help-screen-top">
            <BrandMark className="help-screen-mark" />
            <div className="help-screen-names">
              <span className="help-screen-kicker">{BRAND.portal}</span>
              <span className="help-screen-title">The complete walkthrough</span>
            </div>
          </div>
          <div className="help-screen-center">
            <button type="button" className="help-play" onClick={() => setNote(true)} aria-label="Play the walkthrough video (not recorded yet)" aria-controls="help-video-note" aria-expanded={note}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" fill="currentColor" />
              </svg>
            </button>
            <span className="help-screen-soon">Video coming soon</span>
          </div>
          <div className="help-screen-bottom">
            <span>
              <Icon name="clock" /> Planned length {VIDEO_LENGTH_LABEL}
            </span>
            <span>
              <Icon name="list" /> {VIDEO_CHAPTERS.length} chapters
            </span>
            <span className="help-screen-cc">
              <Icon name="text" /> Captions and transcript with the video
            </span>
          </div>
        </div>
        <div id="help-video-note" aria-live="polite">
          {note && (
            <Notice
              tone="info"
              icon="video"
              title="This video is being recorded"
              actions={
                <>
                  <button
                    type="button"
                    className="btn small primary"
                    onClick={() => {
                      setNote(false);
                      scrollToId('help-chapters', 'help-chapters-h');
                    }}
                  >
                    <Icon name="list" /> See the chapters
                  </button>
                  <button type="button" className="btn small" onClick={() => setNote(false)}>
                    Close
                  </button>
                </>
              }
            >
              Nothing plays here yet. The chapters below describe exactly what the video will show, and each one has a Go there button so you can try that part of the portal yourself right now.
            </Notice>
          )}
        </div>
      </div>

      <div className="help-about">
        <div className="stack help-about-text">
          <h3 className="help-h3">What this video covers</h3>
          <p>{VIDEO_ABOUT.forWho}</p>
          <p>{VIDEO_ABOUT.story}</p>
          <p>{VIDEO_ABOUT.needs}</p>
          <p>{VIDEO_ABOUT.format}</p>
        </div>
        <aside className="help-about-side stack">
          <div className="panel stack help-outcomes">
            <div className="panel-title">
              <Icon name="checkCircle" /> After watching, you can
            </div>
            <ul className="help-checks">
              {VIDEO_ABOUT.outcomes.map((o) => (
                <li key={o}>
                  <Icon name="check" />
                  <span>{o}</span>
                </li>
              ))}
            </ul>
          </div>
          <dl className="help-facts">
            <div>
              <dt>Status</dt>
              <dd>Being recorded</dd>
            </div>
            <div>
              <dt>Planned length</dt>
              <dd>{VIDEO_LENGTH_LABEL.replace('about ', 'About ')}</dd>
            </div>
            <div>
              <dt>Chapters</dt>
              <dd>{VIDEO_CHAPTERS.length}, covering every screen</dd>
            </div>
            <div>
              <dt>Shown on</dt>
              <dd>A phone and a desktop</dd>
            </div>
            <div>
              <dt>Captions</dt>
              <dd>Captions and a full transcript will come with the video</dd>
            </div>
          </dl>
        </aside>
      </div>

      <div className="stack" id="help-chapters" style={{ gap: 10 }}>
        <div className="help-subhead">
          <h3 className="help-h3" id="help-chapters-h" tabIndex={-1}>
            Planned chapters
          </h3>
          <span className="muted">Timestamps are planned and may shift slightly when the video is edited.</span>
        </div>
        <ol className="help-chapters" aria-label="Planned video chapters">
          {shown.map((c) => (
            <ChapterRow key={c.id} c={c} flash={flash === `help-ch-${c.id}`} onGo={onGo} />
          ))}
        </ol>
        {VIDEO_CHAPTERS.length > FOLDED && (
          <button
            type="button"
            className="btn help-more"
            aria-expanded={expanded}
            aria-controls="help-chapters"
            onClick={() => {
              setExpanded(!expanded);
              if (expanded) scrollToId('help-chapters');
            }}
          >
            <Icon name="chevronDown" className={expanded ? 'help-flip' : undefined} />
            {expanded ? 'Show fewer chapters' : `Show all ${VIDEO_CHAPTERS.length} chapters`}
          </button>
        )}
      </div>
    </div>
  );
}

function ChapterRow({ c, flash, onGo }: { c: TimedChapter; flash: boolean; onGo: (t: HelpTarget) => void }) {
  return (
    <li className={`help-chapter ${flash ? 'help-flash' : ''}`} id={`help-ch-${c.id}`}>
      <span className="help-stamp mono" aria-label={`Starts at ${c.stamp}`}>
        {c.stamp}
      </span>
      <div className="help-chapter-title">
        <Icon name={c.icon} />
        <strong>{c.title}</strong>
      </div>
      <p>{c.shows}</p>
      <button type="button" className="btn small help-go" onClick={() => onGo(c.target)} aria-label={`Go there: open ${c.where}`}>
        Go there <Icon name="arrowRight" />
      </button>
    </li>
  );
}

/** A faint rack elevation behind the placeholder, drawn in SVG so it scales with the frame. */
function RackBackdrop() {
  const bays = [0, 1, 2, 3, 4, 5];
  const levels = [0, 1, 2];
  return (
    <svg className="help-screen-bg" viewBox="0 0 640 360" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <g stroke="currentColor" strokeWidth="3" fill="none">
        {bays.map((b) => (
          <line key={`u${b}`} x1={40 + b * 100} y1={40} x2={40 + b * 100} y2={330} />
        ))}
        <line x1={640} y1={40} x2={640} y2={330} />
        {levels.map((l) => (
          <line key={`b${l}`} x1={30} y1={120 + l * 100} x2={650} y2={120 + l * 100} />
        ))}
      </g>
      <g fill="currentColor" opacity="0.55">
        {bays.flatMap((b) =>
          levels.map((l) => ((b * 3 + l) % 4 === 1 ? null : <rect key={`p${b}-${l}`} x={52 + b * 100} y={70 + l * 100} width={76} height={46} rx={3} />)),
        )}
      </g>
    </svg>
  );
}
