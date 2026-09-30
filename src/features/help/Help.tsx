// Help: quick actions, a search across everything below, the video walkthrough placeholder with its
// planned chapters, step-by-step tutorials, the FAQ, tips, and a contact form for support.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { BRAND } from '../../brand';
import { useApp } from '../../app/state';
import { ROLE_RANK } from '../../domain/transitions';
import { Icon, type IconName } from '../../ui/icons';
import { Explain, PageHead } from '../../ui/ui';
import { ContactSection, type ContactPrefill } from './Contact';
import { FAQ, FAQ_COUNT } from './faq';
import { FaqSection, faqText } from './Faq';
import { matchesAll, plain, scrollToId, termsOf, useRunTarget } from './helpers';
import { TUTORIALS } from './tutorials';
import { TutorialsSection, type TutorialFilter } from './Tutorials';
import { VideoSection } from './Video';
import { VIDEO_CHAPTERS, VIDEO_LENGTH_LABEL } from './videoChapters';
import { InstallGuide, installHelpShown } from '../install/Install';
import { usePwa } from '../../device/pwa';
import './help.css';

const SECTIONS = [
  { id: 'start', label: 'Start here', icon: 'rocket' },
  { id: 'install', label: 'Install app', icon: 'phone' },
  { id: 'video', label: 'Video', icon: 'video' },
  { id: 'tutorials', label: 'Tutorials', icon: 'checklist' },
  { id: 'faq', label: 'Questions', icon: 'question' },
  { id: 'tips', label: 'Tips', icon: 'keyboard' },
  { id: 'contact', label: 'Contact', icon: 'mail' },
] as const satisfies readonly { id: string; label: string; icon: IconName }[];
type SectionId = (typeof SECTIONS)[number]['id'];

type Hit = { kind: 'tutorial' | 'chapter' | 'faq'; id: string; title: string; detail: string; score: number };

export function Help() {
  const { route, role, backend } = useApp();
  const pwa = usePwa();
  // Install steps are only offered where they work, and not inside the installed app.
  const sections = installHelpShown(pwa) ? SECTIONS : SECTIONS.filter((s) => s.id !== 'install');
  const [current, setCurrent] = useState<SectionId>('start');
  const [chaptersOpen, setChaptersOpen] = useState(false);
  const [tutFilter, setTutFilter] = useState<TutorialFilter>('all');
  const [tutOpen, setTutOpen] = useState<Set<string>>(() => new Set());
  const [faqQuery, setFaqQueryState] = useState('');
  const [faqOpen, setFaqOpen] = useState<Set<string>>(() => new Set());
  const [flash, setFlash] = useState<string | null>(null);
  const [prefill, setPrefill] = useState<ContactPrefill | null>(null);
  const [navTop, setNavTop] = useState(0);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toContact = useCallback(() => scrollToId('help-contact', 'help-contact-h'), []);
  const run = useRunTarget(toContact);

  // Searching the FAQ opens every matching answer, so the highlights are visible.
  const setFaqQuery = (q: string) => {
    setFaqQueryState(q);
    const terms = termsOf(q);
    if (!terms.length) return setFaqOpen(new Set());
    const hits = FAQ.flatMap((c) => c.items.filter((i) => matchesAll(faqText(i, c.title), terms)).map((i) => `${c.id}.${i.id}`));
    setFaqOpen(new Set(hits.length <= 12 ? hits : []));
  };

  const flashOn = (id: string) => {
    setFlash(id);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 2400);
  };
  useEffect(() => () => void (flashTimer.current && clearTimeout(flashTimer.current)), []);

  /** Open and scroll to one item anywhere on the page. */
  const reveal = (kind: Hit['kind'], id: string) => {
    let el = '';
    if (kind === 'chapter') {
      setChaptersOpen(true);
      el = `help-ch-${id}`;
    } else if (kind === 'tutorial') {
      setTutFilter('all');
      setTutOpen((s) => new Set(s).add(id));
      el = `help-tut-${id}`;
    } else {
      const [cat, item] = id.split('.');
      setFaqQueryState('');
      setFaqOpen((s) => new Set(s).add(id));
      el = `help-q-${cat}-${item}`;
    }
    // Wait for the list to render the item before measuring where it is.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        scrollToId(el);
        const target = document.getElementById(el);
        target?.querySelector<HTMLElement>('summary, button')?.focus({ preventScroll: true });
        flashOn(el);
      }),
    );
  };

  // The section nav sticks under the top bar; keep it there as the top bar changes size.
  useEffect(() => {
    const measure = () => setNavTop(Math.round(document.querySelector('.topbar')?.getBoundingClientRect().height ?? 0));
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  // Highlight the section being read.
  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const line = (document.querySelector('.topbar')?.getBoundingClientRect().height ?? 0) + (document.querySelector('.help-nav')?.getBoundingClientRect().height ?? 0) + 40;
        let active: SectionId = 'start';
        for (const s of SECTIONS) {
          const top = document.getElementById(`help-${s.id}`)?.getBoundingClientRect().top;
          if (top !== undefined && top <= line) active = s.id;
        }
        if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) active = SECTIONS[SECTIONS.length - 1].id;
        setCurrent(active);
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  // On a phone the nav scrolls sideways: keep the current section's button in view.
  useEffect(() => {
    const nav = document.querySelector<HTMLElement>('.help-nav');
    const btn = nav?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!nav || !btn || nav.scrollWidth <= nav.clientWidth) return;
    const left = btn.offsetLeft - (nav.clientWidth - btn.offsetWidth) / 2;
    nav.scrollTo({ left: Math.max(0, left) });
  }, [current]);

  // Deep links: go({ name: 'help', q: 'faq' }) opens the page at that section.
  useEffect(() => {
    const q = route.q as SectionId | undefined;
    if (q && SECTIONS.some((s) => s.id === q)) {
      const t = setTimeout(() => scrollToId(`help-${q}`, `help-${q}-h`), 60);
      return () => clearTimeout(t);
    }
  }, [route.q]);

  const ask = (question: string) => {
    setPrefill({ n: Date.now(), topic: 'Question', message: question ? `I could not find an answer to: ${question}\n\n` : '' });
    scrollToId('help-contact');
  };

  const cannotPractice = role !== null && ROLE_RANK[role] < ROLE_RANK.OPERATOR;

  return (
    <div className="stack help-page">
      <PageHead
        eyebrow="Learn"
        title="Help"
        sub={`Everything you need to learn the ${BRAND.portal}: a walkthrough video spot with every chapter described, step-by-step tutorials, answers to common questions, and a way to reach support.`}
      />
      <Explain title="How this page works">
        <p>
          Every button here opens the real screen it talks about, and the sample warehouse is safe to practice on. You can reset it from Settings any time. Tutorials and video chapters use the same codes you will see on screen, like job J-214 and rack A-03-02.
        </p>
        <ul>
          <li>The walkthrough video is not recorded yet. Its spot below describes what it will show, chapter by chapter, and never pretends to play.</li>
          <li>The search box at the top looks through the tutorials, the video chapters and all {FAQ_COUNT} answers at once. The Questions section has its own filter.</li>
          <li>The contact form keeps your request in this browser and gives you a ready-made email, because the support inbox is not connected in this preview yet.</li>
        </ul>
      </Explain>

      <nav className="help-nav" aria-label="Help sections" style={{ top: navTop }}>
        {sections.map((s) => (
          <button key={s.id} type="button" aria-current={current === s.id ? 'true' : undefined} onClick={() => scrollToId(`help-${s.id}`, `help-${s.id}-h`)}>
            <Icon name={s.icon} />
            {s.label}
          </button>
        ))}
      </nav>

      <HelpSection id="start" title="How can we help?" lede="Search everything on this page, or jump straight in.">
        <SearchAll onPick={reveal} />
        <div className="help-quick">
          <QuickAction icon="tour" title="Take the tour" body="A short walk through your warehouse screens, with tips on each one." cta="Start the tour" onClick={() => run({ action: 'tour' })} />
          <QuickAction
            icon="hardhat"
            title="Start the practice shift"
            body={backend.mode === 'firebase' ? 'Practice with example records in the separate sample warehouse. Your customer records stay unchanged.' : cannotPractice ? 'Walk one pallet from delivery to the job site and back. Needs an Operator account or higher: switch role first.' : 'Walk one pallet from delivery to the job site and back. Each step ticks off as you do it.'}
            cta={backend.mode === 'firebase' ? 'Open sample warehouse' : 'Start practicing'}
            onClick={() => run({ action: 'practice' })}
          />
          <QuickAction icon="scanner" title="Set up a scanner" body="Connect a USB or Bluetooth scanner in keyboard mode, test it, and print command barcodes." cta="Open Scanners" onClick={() => run({ route: 'scanners' })} />
          <QuickAction icon="mail" title="Contact support" body="Describe the problem or idea. You get a reference and a ready-made email." cta="Write to support" onClick={() => scrollToId('help-contact', 'help-name')} />
        </div>
      </HelpSection>

      {installHelpShown(pwa) && (
        <HelpSection id="install" title={`Install the ${BRAND.name} app`} lede="Add it to your home screen for one-tap access, full screen, with no app store needed.">
          <InstallGuide />
        </HelpSection>
      )}

      <HelpSection id="video" title="Video tutorial" lede={`One walkthrough of the whole portal, ${VIDEO_LENGTH_LABEL} long, in ${VIDEO_CHAPTERS.length} chapters. Coming soon.`}>
        <VideoSection expanded={chaptersOpen} setExpanded={setChaptersOpen} flash={flash} onGo={run} />
      </HelpSection>

      <HelpSection id="tutorials" title="Step-by-step tutorials" lede={`${TUTORIALS.length} short guides for real tasks. Open one, follow the numbered steps, and press Show me to do it for real.`}>
        <TutorialsSection filter={tutFilter} setFilter={setTutFilter} open={tutOpen} setOpen={setTutOpen} flash={flash} onGo={run} onChapter={(id) => reveal('chapter', id)} />
      </HelpSection>

      <HelpSection id="faq" title="Questions and answers" lede="Straight answers about scanning, records, offline work, roles, data and pricing.">
        <FaqSection query={faqQuery} setQuery={setFaqQuery} open={faqOpen} setOpen={setFaqOpen} flash={flash} onGo={run} onAsk={ask} />
      </HelpSection>

      <HelpSection id="tips" title="Tips, and where to look next" lede="Shortcuts for keyboards and scanners, and the other places with answers.">
        <div className="help-tips">
          <Tips />
          <StillStuck onGo={run} onContact={() => scrollToId('help-contact', 'help-name')} />
        </div>
      </HelpSection>

      <HelpSection id="contact" title="Contact support" lede="Tell us what happened or what you need. You get a reference to quote and a ready-made email.">
        <ContactSection prefill={prefill} />
      </HelpSection>
    </div>
  );
}

function HelpSection({ id, title, lede, children }: { id: SectionId; title: string; lede?: string; children: ReactNode }) {
  return (
    <section className="help-section" id={`help-${id}`} aria-labelledby={`help-${id}-h`}>
      <header className="help-section-head">
        <h2 className="help-h2" id={`help-${id}-h`} tabIndex={-1}>
          {title}
        </h2>
        {lede && <p className="help-lede">{lede}</p>}
      </header>
      {children}
    </section>
  );
}

function QuickAction({ icon, title, body, cta, onClick }: { icon: IconName; title: string; body: string; cta: string; onClick: () => void }) {
  return (
    <button type="button" className="help-qa" onClick={onClick}>
      <span className="help-qa-icon" aria-hidden="true">
        <Icon name={icon} />
      </span>
      <span className="help-qa-text">
        <span className="help-qa-title">{title}</span>
        <span className="help-qa-body">{body}</span>
        <span className="help-qa-cta">
          {cta} <Icon name="arrowRight" />
        </span>
      </span>
    </button>
  );
}

const KIND_LABEL: Record<Hit['kind'], string> = { tutorial: 'Tutorial', chapter: 'Video chapter', faq: 'Question' };
const KIND_ICON: Record<Hit['kind'], IconName> = { tutorial: 'checklist', chapter: 'video', faq: 'question' };

/** Every tutorial, chapter and answer as one searchable list. */
const INDEX: Omit<Hit, 'score'>[] = [
  ...TUTORIALS.map((t) => ({ kind: 'tutorial' as const, id: t.id, title: t.title, detail: `${t.outcome} ${t.steps.map(plain).join(' ')} ${plain(t.tip ?? '')}` })),
  ...VIDEO_CHAPTERS.map((c) => ({ kind: 'chapter' as const, id: c.id, title: `${c.stamp} ${c.title}`, detail: c.shows })),
  ...FAQ.flatMap((c) => c.items.map((i) => ({ kind: 'faq' as const, id: `${c.id}.${i.id}`, title: i.q, detail: `${c.title} ${i.a.join(' ')}` }))),
];

function SearchAll({ onPick }: { onPick: (kind: Hit['kind'], id: string) => void }) {
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(8);
  const terms = useMemo(() => termsOf(q), [q]);
  const hits = useMemo<Hit[]>(() => {
    if (!terms.length) return [];
    return INDEX.filter((e) => matchesAll(`${e.title} ${e.detail}`, terms))
      .map((e) => ({ ...e, score: terms.reduce((n, t) => n + (e.title.toLowerCase().includes(t) ? 3 : 0) + (e.kind === 'tutorial' ? 1 : 0), 0) }))
      .sort((a, b) => b.score - a.score);
  }, [terms]);
  useEffect(() => setLimit(8), [q]);

  return (
    <div className="help-search">
      <div className="search-bar help-search-bar">
        <Icon name="find" />
        <label htmlFor="help-search" className="sr-only">
          Search all of Help
        </label>
        <input
          id="help-search"
          className="input"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search help: receive, torn label, offline, scanner…"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="search"
          aria-describedby="help-search-status"
        />
      </div>
      <p id="help-search-status" className="sr-only" aria-live="polite">
        {terms.length ? `${hits.length} results` : ''}
      </p>
      {terms.length > 0 && (
        <div className="help-hits">
          {hits.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>
              Nothing matches “{q.trim()}”. Try a single word, like <em>label</em> or <em>offline</em>, or write to support at the bottom of this page.
            </p>
          ) : (
            <>
              <ul>
                {hits.slice(0, limit).map((h) => (
                  <li key={`${h.kind}:${h.id}`}>
                    <button
                      type="button"
                      className="help-hit"
                      onClick={() => {
                        onPick(h.kind, h.id);
                      }}
                    >
                      <Icon name={KIND_ICON[h.kind]} />
                      <span className="help-hit-text">
                        <span className="help-hit-title">{h.title}</span>
                        <span className="help-hit-kind">{KIND_LABEL[h.kind]}</span>
                      </span>
                      <Icon name="chevronRight" className="help-hit-chev" />
                    </button>
                  </li>
                ))}
              </ul>
              <div className="help-hits-foot">
                <span className="muted">
                  {hits.length} {hits.length === 1 ? 'result' : 'results'}
                </span>
                {hits.length > limit && (
                  <button type="button" className="btn ghost small" onClick={() => setLimit(hits.length)}>
                    Show all {hits.length}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Tips() {
  return (
    <div className="panel stack help-tipbox">
      <div className="panel-title">
        <Icon name="keyboard" /> Keyboard and scanner tips
      </div>
      <div className="help-tip-cols">
        <div>
          <h3 className="help-tip-h">On a keyboard</h3>
          <ul className="help-keys">
            <li>
              <span className="kbd">/</span>
              <span>On Find, jump to the search box.</span>
            </li>
            <li>
              <span className="kbd">Enter</span>
              <span>After typing a printed code on Move, look it up. It works like a scan.</span>
            </li>
            <li>
              <span className="kbd">Esc</span>
              <span>Close the sheet or dialog that is open.</span>
            </li>
            <li>
              <span className="kbd">Tab</span>
              <span>
                Move to the next field or button, and <span className="kbd">Shift</span> + <span className="kbd">Tab</span> to go back. The focused one is always outlined.
              </span>
            </li>
            <li>
              <span className="kbd">Space</span>
              <span>Open or close a tutorial or question, like the ones on this page.</span>
            </li>
          </ul>
        </div>
        <div>
          <h3 className="help-tip-h">With a scanner</h3>
          <ul className="help-keys">
            <li>
              <Icon name="usb" />
              <span>Set it to keyboard mode (HID or keyboard-wedge) and to send Enter after each code. Test it on the Scanners page.</span>
            </li>
            <li>
              <Icon name="qr" />
              <span>Always the pallet first, then the rack. A rack scanned first just gets a reminder.</span>
            </li>
            <li>
              <Icon name="barcode" />
              <span>Scan the Confirm, Cancel and Finish command barcodes instead of reaching for the screen.</span>
            </li>
            <li>
              <Icon name="target" />
              <span>With Scan anywhere turned on in Scanners, scanning a label on a screen that is not waiting for one opens that pallet or rack.</span>
            </li>
            <li>
              <Icon name="text" />
              <span>A damaged label? Type the big printed code, like P-000042 or A-03-02.</span>
            </li>
            <li>
              <Icon name="hardhat" />
              <span>Working in gloves? Turn on Large text in Settings for bigger buttons.</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function StillStuck({ onGo, onContact }: { onGo: ReturnType<typeof useRunTarget>; onContact: () => void }) {
  const links: { icon: IconName; title: string; body: string; route: 'guide' | 'lab' | 'about' }[] = [
    { icon: 'guide', title: 'Guide handbook', body: 'The big ideas, the life of a pallet, roles, a glossary, and what is real or simulated in this build.', route: 'guide' },
    { icon: 'lab', title: 'Integrity lab', body: 'Watch the rules survive the bad days: lost signal, two phones, removed people.', route: 'lab' },
    { icon: 'about', title: 'About', body: `Who makes ${BRAND.name} and how to reach them.`, route: 'about' },
  ];
  return (
    <div className="panel stack help-stuck">
      <div className="panel-title">
        <Icon name="help" /> Still stuck?
      </div>
      <div className="help-stuck-links">
        {links.map((l) => (
          <button key={l.route} type="button" className="help-stuck-link" onClick={() => onGo({ route: l.route })}>
            <Icon name={l.icon} />
            <span>
              <strong>{l.title}</strong>
              <span className="muted">{l.body}</span>
            </span>
            <Icon name="chevronRight" className="help-hit-chev" />
          </button>
        ))}
      </div>
      <button type="button" className="btn" style={{ alignSelf: 'flex-start' }} onClick={onContact}>
        <Icon name="mail" /> Write to support
      </button>
    </div>
  );
}
