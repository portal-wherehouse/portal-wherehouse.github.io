// Guide: how the app thinks, in plain language, with the pallet lifecycle, roles, glossary, FAQ,
// and an honest list of what this build simulates.

import { useState } from 'react';
import { useApp } from '../../app/state';
import { Icon, type IconName } from '../../ui/icons';
import { PageHead } from '../../ui/ui';
import { RoleMatrix } from '../admin/People';

const SECTIONS = [
  { id: 'ideas', label: 'Big ideas' },
  { id: 'lifecycle', label: 'Pallet lifecycle' },
  { id: 'daily', label: 'Daily work' },
  { id: 'roles', label: 'Roles' },
  { id: 'glossary', label: 'Glossary' },
  { id: 'faq', label: 'Questions' },
  { id: 'real', label: 'Real vs simulated' },
  { id: 'run', label: 'Run it yourself' },
] as const;

export function Guide() {
  const { go, setTourOpen } = useApp();
  const [section, setSection] = useState<(typeof SECTIONS)[number]['id']>('ideas');
  return (
    <div className="stack">
      <PageHead
        title="Guide"
        sub="How Pallet Locator works, why it works that way, and what is real in this build."
        actions={
          <button className="btn primary" onClick={() => setTourOpen(true)}>
            <Icon name="tour" /> Start the tour
          </button>
        }
      />
      <div className="tabs" role="tablist" style={{ flexWrap: 'wrap' }}>
        {SECTIONS.map((s) => (
          <button key={s.id} role="tab" aria-selected={section === s.id} onClick={() => setSection(s.id)}>
            {s.label}
          </button>
        ))}
      </div>

      {section === 'ideas' && (
        <div className="grid-2">
          <Idea icon="target" title="One question, answered fast">
            The app exists to answer “where is this pallet?” in seconds, from a phone, with a record you can trust. Everything else supports that.
          </Idea>
          <Idea icon="check" title="Recorded, never guessed">
            A location is only ever a location someone confirmed with a scan. When the app is unsure, it says “last confirmed at A-02-01, 3 days ago” instead of pretending.
          </Idea>
          <Idea icon="qr" title="Scan the pallet, then the rack">
            Every move is two scans in that order. There is no dropdown of racks to mis-tap. Typing the printed code is the fallback for damaged labels.
          </Idea>
          <Idea icon="history" title="History is append-only">
            Every accepted change writes one history entry in the same transaction. Mistakes are fixed by a correction entry, so the original is never lost.
          </Idea>
          <Idea icon="shield" title="The server decides">
            Roles, states and versions are checked by the server on every change. Hiding a button is a convenience, never the protection.
          </Idea>
          <Idea icon="sync" title="Safe on bad signal">
            Every decision carries one request ID. Retrying after a dropped connection can never create a second move. Offline moves wait on the phone and are replayed in order.
          </Idea>
        </div>
      )}

      {section === 'lifecycle' && (
        <div className="panel stack">
          <div className="panel-title">Pallet lifecycle</div>
          <Lifecycle />
          <div className="grid-2" style={{ fontSize: 14.5 }}>
            <div>
              <p>
                <strong>Received</strong> means the pallet is in the building but no rack is recorded yet. <strong>Stored</strong> is the only state with a current rack. That rule is checked in the database: a stored pallet always has a rack, and nothing else ever does.
              </p>
              <p>
                <strong>Missing</strong> keeps the last confirmed rack so people know where to look. <strong>Dispatched</strong> has left for a job site. <strong>Retired</strong> is the end of the line, for example after a split. Codes are never reused.
              </p>
            </div>
            <div>
              <p>
                <strong>Hold</strong> is a flag, not a state. A held pallet keeps its rack and can still be moved (to quarantine, say), but it cannot be dispatched or split until a supervisor clears the hold.
              </p>
              <p>
                <strong>Version</strong>: every accepted change adds one to the pallet's version. A phone sends the version it saw, so a decision made on stale information is refused with a conflict instead of overwriting someone's newer change.
              </p>
            </div>
          </div>
        </div>
      )}

      {section === 'daily' && (
        <div className="stack">
          <Flow
            icon="receive"
            title="Receiving a delivery"
            steps={['Open Receive and pick the job.', 'Describe what is on the pallet, add a photo if it helps.', 'Save. A new code like P-000042 is issued.', 'Print the label and stick it on.', 'Tap “Place now” and scan the rack you put it on.']}
            onTry={() => go('receive')}
          />
          <Flow
            icon="move"
            title="Moving a pallet"
            steps={['Open Move.', 'Scan the pallet label.', 'Scan the rack label where you put it.', 'Check the review and confirm. The result says “Moved to B-01-01” only after the server saves it.']}
            onTry={() => go('move')}
          />
          <Flow
            icon="find"
            title="Finding something"
            steps={['Open Find and type a job, pallet code, rack or words from the description.', 'Results lead with where the pallet is.', 'Open one to see its history, photos and actions.']}
            onTry={() => go('find')}
          />
          <Flow
            icon="reconcile"
            title="Keeping records honest"
            steps={['Open Reconcile.', 'Work each list: place what is unplaced, look for what is missing, inspect holds, reprint labels.', 'Every fix is its own history entry.']}
            onTry={() => go('reconcile')}
          />
        </div>
      )}

      {section === 'roles' && (
        <div className="panel flush">
          <div className="panel-title" style={{ padding: '14px 16px 6px' }}>
            Who can do what
          </div>
          <RoleMatrix />
        </div>
      )}

      {section === 'glossary' && (
        <div className="panel">
          <dl className="kv" style={{ gridTemplateColumns: 'minmax(120px, 180px) 1fr' }}>
            {GLOSSARY.map(([t, d]) => (
              <Pair key={t} term={t} def={d} />
            ))}
          </dl>
        </div>
      )}

      {section === 'faq' && (
        <div className="stack">
          {FAQ.map(([q, a]) => (
            <details key={q} className="explain" style={{ background: 'var(--surface)' }}>
              <summary>
                <Icon name="help" />
                {q}
                <Icon name="chevronDown" className="chev" />
              </summary>
              <div className="explain-body">
                <p>{a}</p>
              </div>
            </details>
          ))}
        </div>
      )}

      {section === 'real' && (
        <div className="stack">
          <div className="table-wrap">
            <table className="t">
              <thead>
                <tr>
                  <th>Part</th>
                  <th>In this build</th>
                  <th>In production (per the blueprint)</th>
                </tr>
              </thead>
              <tbody>
                {REAL.map(([part, now, prod]) => (
                  <tr key={part}>
                    <td>
                      <strong>{part}</strong>
                    </td>
                    <td>{now}</td>
                    <td className="muted">{prod}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted" style={{ fontSize: 14 }}>
            The demo accounts, people and companies are fictional. Your changes are saved only in this browser and can be reset from Settings at any time.
          </p>
        </div>
      )}

      {section === 'run' && (
        <div className="panel stack">
          <div className="panel-title">Run it on your own computer</div>
          <p style={{ margin: 0 }}>You need Node.js 20 or newer. From the project folder:</p>
          <div className="code-block">{`npm install
npm run dev          # open http://localhost:5173
npm test             # the ${'38+'} integrity scenarios
npm run test:e2e     # browser walkthrough (Playwright)
npm run build        # production build in dist/`}</div>
          <p className="muted" style={{ margin: 0 }}>
            Running locally unlocks what the hosted preview cannot do: the camera scanner, the print dialog for labels and pick lists, and CSV downloads. For phones, serve it over HTTPS so the camera is allowed.
          </p>
        </div>
      )}
    </div>
  );
}

function Idea({ icon, title, children }: { icon: IconName; title: string; children: React.ReactNode }) {
  return (
    <div className="panel stack" style={{ gap: 6 }}>
      <div className="row nowrap" style={{ gap: 10 }}>
        <span className="tl-dot accent" style={{ position: 'static' }}>
          <Icon name={icon} />
        </span>
        <strong style={{ fontSize: 17 }}>{title}</strong>
      </div>
      <p style={{ margin: 0 }}>{children}</p>
    </div>
  );
}

function Flow({ icon, title, steps, onTry }: { icon: IconName; title: string; steps: string[]; onTry: () => void }) {
  return (
    <div className="panel stack">
      <div className="panel-title">
        <Icon name={icon} /> {title} <span className="grow" />
        <button className="btn small" onClick={onTry}>
          Try it <Icon name="chevronRight" />
        </button>
      </div>
      <ol style={{ margin: 0, paddingLeft: 22, display: 'grid', gap: 4 }}>
        {steps.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
    </div>
  );
}

function Pair({ term, def }: { term: string; def: string }) {
  return (
    <>
      <dt>{term}</dt>
      <dd>{def}</dd>
    </>
  );
}

function Lifecycle() {
  const box = (x: number, y: number, label: string, color: string, sub: string) => (
    <g>
      <rect x={x} y={y} width={150} height={58} rx={8} fill="var(--surface)" stroke={color} strokeWidth={2.5} />
      <text x={x + 75} y={y + 26} textAnchor="middle" fontSize="17" fontWeight="700" fill="var(--ink)" fontFamily="var(--font-display)">
        {label}
      </text>
      <text x={x + 75} y={y + 45} textAnchor="middle" fontSize="11.5" fill="var(--ink-2)">
        {sub}
      </text>
    </g>
  );
  const label = (x: number, y: number, t: string, anchor: 'start' | 'middle' | 'end' = 'middle') => (
    <text x={x} y={y} textAnchor={anchor} fontSize="12.5" fontWeight="600" fill="var(--ink-2)">
      {t}
    </text>
  );
  return (
    <div className="diagram" style={{ overflowX: 'auto' }}>
      <svg viewBox="0 0 760 330" role="img" aria-label="Pallet lifecycle: receive creates a Received pallet. Place makes it Stored. Move and verify keep it Stored. Dispatch makes it Dispatched; return brings it back to Received. Received or Stored can be marked Missing; found returns it to Stored. Retire or split ends at Retired." style={{ minWidth: 620, width: '100%' }}>
        <defs>
          <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="var(--ink-2)" />
          </marker>
        </defs>
        <g stroke="var(--ink-2)" strokeWidth={1.8} fill="none" markerEnd="url(#arr)">
          <path d="M40,30 L40,112" />
          <path d="M170,141 L286,141" />
          <path d="M436,141 L552,141" />
          <path d="M627,112 C627,8 95,8 95,110" />
          <path d="M95,170 C95,250 200,270 286,270" />
          <path d="M361,170 L361,240" />
          <path d="M386,240 L386,172" />
          <path d="M436,270 L552,270" />
          <path d="M340,112 C330,78 392,78 382,112" />
        </g>
        {label(46, 60, 'Receive (new code)', 'start')}
        {label(228, 132, 'Place')}
        {label(494, 132, 'Dispatch')}
        {label(361, 24, 'Return (back in the building, no rack yet)')}
        {label(361, 76, 'Move · Verify')}
        {label(150, 262, 'Mark missing', 'end')}
        {label(353, 212, 'Mark missing', 'end')}
        {label(394, 212, 'Found here', 'start')}
        {label(494, 262, 'Retire · Split')}
        {box(20, 112, 'RECEIVED', 'var(--warn)', 'in building, no rack')}
        {box(286, 112, 'STORED', 'var(--ok)', 'on a confirmed rack')}
        {box(552, 112, 'DISPATCHED', 'var(--slate)', 'left for the job site')}
        {box(286, 240, 'MISSING', 'var(--bad)', 'last seen kept')}
        {box(552, 240, 'RETIRED', 'var(--ink-3)', 'code never reused')}
        <circle cx={40} cy={24} r={6} fill="var(--ink)" />
        <g transform="translate(600, 318)">
          <rect x={-2} y={-11} width={14} height={12} fill="var(--hazard)" stroke="#14171a" />
          <text x={18} y={0} fontSize="12" fill="var(--ink-2)">
            Hold is a flag on any state
          </text>
        </g>
      </svg>
      <p className="muted" style={{ fontSize: 13, margin: '6px 0 0' }}>
        Any non-retired pallet can also be retired by a supervisor, and a correction can set the true state with a reason.
      </p>
    </div>
  );
}

const GLOSSARY: [string, string][] = [
  ['Pallet', 'One physical handling unit with its own code, like P-000042. Not a count of items.'],
  ['Job', 'The project that owns the material, like J-214. Every pallet belongs to one job.'],
  ['Location', 'A rack position or area in a warehouse, like A-02-01 or RECEIVING-01.'],
  ['Label token', 'The random 16-character value inside a QR label. It identifies the pallet or location without revealing anything about it.'],
  ['Command', 'One decision sent to the server, like “move P-000012 to B-01-01”. Accepted or rejected as a whole.'],
  ['Request ID', 'The unique ID a phone gives each decision. Resending the same ID returns the same result instead of repeating the change.'],
  ['Version', 'A counter on each pallet that goes up with every accepted change, used to detect conflicting edits.'],
  ['Event', 'One history entry, written with the change it records. Never edited or deleted.'],
  ['Correction', 'A new event that fixes the record, pointing at the entry it corrects.'],
  ['Hold', 'A flag for damage or inspection. Blocks dispatch and splits until a supervisor clears it.'],
  ['Last confirmed', 'The most recent rack a person proved with a scan, and when.'],
  ['Reconcile', 'Working through the lists of pallets whose records need attention.'],
  ['Outbox', 'The queue of moves saved on a phone while offline, sent in order when the connection returns.'],
  ['Workspace', 'One company’s private data. Nothing crosses between workspaces, not even whether a code exists.'],
];

const FAQ: [string, string][] = [
  ['Why do I have to scan the pallet before the rack?', 'A fixed order means a scan can never be misread as the wrong kind of thing. If you scan a rack first, the app tells you to scan the pallet instead.'],
  ['The label is torn. What now?', 'Type the big printed code (for example P-000042, or just 42) on Move or Find. Then print a new label from the pallet record.'],
  ['Why does it say “last confirmed” instead of just the rack?', 'Because racks are only as good as the last scan. Showing when someone last confirmed it tells you how much to trust it.'],
  ['What happens if I lose signal in the middle of a move?', 'If the answer does not come back, the app says the result is unknown and offers “Check result”. That asks the server for its receipt using the same request ID, so it can never create a second move.'],
  ['Someone else moved the pallet while I was offline. Who wins?', 'Nobody silently. The server refuses the older decision with a conflict, and the app shows you both versions so you can decide.'],
  ['Can I delete a wrong history entry?', 'No. Add a correction instead. The original stays visible with the correction pointing at it, which is what makes the history trustworthy.'],
  ['Why is there no “free space” on the map?', 'The app knows which pallets are recorded where, but not their size or rack load limits. Claiming space is free would be a guess, so it does not.'],
  ['Can a viewer change anything?', 'No. Viewers can search and look. The server refuses any change from a viewer, even if someone forges the request.'],
];

const REAL: [string, string, string][] = [
  ['Rules and history', 'Real: the full command engine with roles, versions, receipts and append-only history, running in your browser.', 'The same rules as Postgres functions with row-level security (Supabase).'],
  ['Data storage', 'Your browser (IndexedDB). Shared across tabs of this browser only.', 'Hosted Postgres, shared by the whole team.'],
  ['Sign-in', 'Pick a demo account. No passwords.', 'Email magic link or SSO, with workspace invitations.'],
  ['Network', 'Simulated, with switches for offline, lost responses and latency.', 'Real network, with the same retry and recovery behavior.'],
  ['Offline moves', 'Real queue stored on the device, replayed in order.', 'Same, plus background sync.'],
  ['Scanning', 'Camera where the browser allows it, “scan from a photo” everywhere, typed codes, and demo tap-labels.', 'Camera scanning on phones, plus hardware scanners that type.'],
  ['Photos', 'Resized and stored in the browser.', 'Private object storage with signed links.'],
  ['Labels and printing', 'Real QR labels. Printing works when run locally.', 'Same, on thermal label printers.'],
  ['Import and export', 'Real CSV parsing, validation and formula protection.', 'Same, with larger batches processed on the server.'],
];
