// The planned Firebase design as an inline SVG: a wide layout for desktop and a tall one for phones,
// with numbered arrows that match the numbered list beside it. Colors come from the theme tokens.

import { BRAND } from '../../brand';

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  lines: string[];
  kind?: 'device' | 'engine' | 'service' | 'small';
}

function Node({ b }: { b: Box }) {
  const cls = `dg-box ${b.kind ?? 'service'}`;
  const small = b.kind === 'small';
  const top = b.y + (small ? b.h / 2 + 5 : 28);
  return (
    <g>
      <rect className={cls} x={b.x} y={b.y} width={b.w} height={b.h} rx={10} />
      <text className={small ? 'dg-small' : 'dg-title'} x={b.x + 14} y={top}>
        {b.title}
      </text>
      {b.lines.map((l, i) => (
        <text key={i} className="dg-line" x={b.x + 14} y={top + 20 + i * 17}>
          {l}
        </text>
      ))}
    </g>
  );
}

function Badge({ x, y, n }: { x: number; y: number; n: number }) {
  return (
    <g>
      <circle className="dg-badge" cx={x} cy={y} r={11} />
      <text className="dg-badge-text" x={x} y={y + 4.5} textAnchor="middle">
        {n}
      </text>
    </g>
  );
}

function Markers({ id }: { id: string }) {
  return (
    <defs>
      <marker id={`${id}-end`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path className="dg-head" d="M0,0 L10,5 L0,10 z" />
      </marker>
    </defs>
  );
}

function Arrow({ d, id, both }: { d: string; id: string; both?: boolean }) {
  return <path className="dg-arrow" d={d} markerEnd={`url(#${id}-end)`} markerStart={both ? `url(#${id}-end)` : undefined} />;
}

const DEVICE_LINES = [`The ${BRAND.name} app`, 'Keeps a copy for search', 'and the offline queue'];
const DEVICE_LINES_WIDE = ['Phones, tablets, computers', `running ${BRAND.name}, with`, 'a copy for search and', 'the offline queue'];

/** A phone and a laptop in outline, drawn at (x, y). */
function Devices({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  return (
    <g className="dg-glyph" transform={`translate(${x} ${y}) scale(${scale})`} aria-hidden="true">
      <rect x={0} y={0} width={42} height={76} rx={8} />
      <line x1={15} y1={68} x2={27} y2={68} />
      <rect x={60} y={10} width={104} height={62} rx={5} />
      <path d="M50,80 H174 L166,72 H58 Z" />
    </g>
  );
}

function Wide() {
  const id = 'dgw';
  const boxes: Box[] = [
    { x: 16, y: 120, w: 222, h: 210, title: 'Your devices', lines: DEVICE_LINES_WIDE, kind: 'device' },
    { x: 320, y: 44, w: 262, h: 74, title: 'Firebase Authentication', lines: ['Sign in with email or Google'] },
    { x: 320, y: 186, w: 262, h: 100, title: 'Command function', lines: ['Cloud Functions', 'Same rules as today, one', 'transaction per change'], kind: 'engine' },
    { x: 320, y: 344, w: 262, h: 74, title: 'Cloud Storage', lines: ['Photos, private per company'] },
    { x: 680, y: 166, w: 256, h: 140, title: 'Cloud Firestore', lines: ['Pallets, history, jobs,', 'racks, people, receipts', 'Rules: members read only', 'their own company'] },
    { x: 680, y: 344, w: 256, h: 56, title: 'Scheduled backups', lines: [], kind: 'small' },
  ];
  return (
    <svg className="dg dg-wide" viewBox="0 0 960 440" role="img" aria-labelledby={`${id}-t ${id}-d`}>
      <title id={`${id}-t`}>Planned design with Firebase</title>
      <desc id={`${id}-d`}>
        Phones sign in with Firebase Authentication, send every change to one command function that saves to Cloud Firestore in a transaction, read their own company from
        Firestore, and keep photos in Cloud Storage. Firestore is backed up on a schedule.
      </desc>
      <Markers id={id} />
      <rect className="dg-group" x={292} y={8} width={660} height={424} rx={16} />
      <text className="dg-group-label" x={312} y={31}>
        FIREBASE · PLANNED, NOT CONNECTED
      </text>
      <Arrow id={id} d="M127,120 V81 H316" />
      <Arrow id={id} d="M238,236 H316" />
      <Arrow id={id} d="M582,236 H676" />
      <Arrow id={id} d="M680,190 H640 V152 H242" />
      <Arrow id={id} both d="M238,300 H266 V381 H316" />
      <Arrow id={id} d="M808,306 V340" />
      {boxes.map((b) => (
        <Node key={b.title} b={b} />
      ))}
      <Devices x={36} y={238} />
      <Badge x={200} y={81} n={1} />
      <Badge x={277} y={236} n={2} />
      <Badge x={629} y={236} n={3} />
      <Badge x={450} y={152} n={4} />
      <Badge x={266} y={342} n={5} />
      <Badge x={838} y={323} n={6} />
    </svg>
  );
}

function Tall() {
  const id = 'dgt';
  const boxes: Box[] = [
    { x: 28, y: 10, w: 224, h: 96, title: 'Your devices', lines: DEVICE_LINES, kind: 'device' },
    { x: 28, y: 150, w: 152, h: 70, title: 'Authentication', lines: ['Email or Google'] },
    { x: 28, y: 262, w: 224, h: 88, title: 'Command function', lines: ['Same rules as today,', 'one transaction per change'], kind: 'engine' },
    { x: 28, y: 394, w: 224, h: 88, title: 'Cloud Firestore', lines: ['Pallets, history, jobs, racks', 'Read by members only'] },
    { x: 28, y: 516, w: 224, h: 44, title: 'Scheduled backups', lines: [], kind: 'small' },
    { x: 28, y: 600, w: 224, h: 70, title: 'Cloud Storage', lines: ['Photos, private per company'] },
  ];
  return (
    <svg className="dg dg-tall" viewBox="0 0 280 684" role="img" aria-labelledby={`${id}-t ${id}-d`}>
      <title id={`${id}-t`}>Planned design with Firebase</title>
      <desc id={`${id}-d`}>
        Phones sign in with Firebase Authentication, send every change to one command function that saves to Cloud Firestore in a transaction, read their own company from
        Firestore, and keep photos in Cloud Storage. Firestore is backed up on a schedule.
      </desc>
      <Markers id={id} />
      <Arrow id={id} d="M104,106 V146" />
      <Arrow id={id} d="M216,106 V258" />
      <Arrow id={id} d="M140,350 V390" />
      <Arrow id={id} d="M28,438 H12 V58 H24" />
      <Arrow id={id} both d="M252,58 H268 V635 H256" />
      <Arrow id={id} d="M140,482 V512" />
      {boxes.map((b) => (
        <Node key={b.title} b={b} />
      ))}
      <Devices x={192} y={16} scale={0.3} />
      <Badge x={104} y={127} n={1} />
      <Badge x={216} y={200} n={2} />
      <Badge x={140} y={371} n={3} />
      <Badge x={12} y={250} n={4} />
      <Badge x={268} y={440} n={5} />
      <Badge x={166} y={498} n={6} />
    </svg>
  );
}

export function ArchitectureDiagram() {
  return (
    <figure className="dg-figure">
      <Wide />
      <Tall />
      <figcaption className="muted">Planned design. None of these services are connected yet; today everything runs in this browser.</figcaption>
    </figure>
  );
}
