// A small hand-drawn stroke icon set (24px grid, 2px strokes, currentColor).

import type { SVGProps } from 'react';

const P: Record<string, string> = {
  receive: 'M3 9l9-5 9 5v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9z M12 11v6 M9 14l3 3 3-3',
  move: 'M5 12h14 M15 8l4 4-4 4 M9 16l-4-4 4-4',
  find: 'M11 4a7 7 0 1 0 0 14a7 7 0 0 0 0-14z M20 20l-4-4',
  more: 'M4 6h16 M4 12h16 M4 18h16',
  overview: 'M4 20V10 M10 20V4 M16 20v-7 M22 20H2',
  map: 'M3 5h7v14H3z M14 5h7v6h-7z M14 15h7v4h-7z',
  activity: 'M3 12h4l3-8 4 16 3-8h4',
  reconcile: 'M12 3l9 16H3L12 3z M12 10v4 M12 17v.5',
  jobs: 'M4 7h16v12H4z M9 7V5h6v2 M4 12h16',
  locations: 'M4 3v18 M20 3v18 M4 8h16 M4 14h16 M4 20h16',
  labels: 'M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M14 14h2v2h-2z M18 14h2 M14 18h2 M18 18h2v2',
  import: 'M12 3v12 M8 11l4 4 4-4 M4 17v3h16v-3',
  export: 'M12 15V3 M8 7l4-4 4 4 M4 17v3h16v-3',
  people: 'M9 11a4 4 0 1 0 0-8a4 4 0 0 0 0 8z M2 21c0-4 3-6 7-6s7 2 7 6 M17 11a3 3 0 0 0 0-6 M22 21c0-3-2-5-5-5.5',
  lab: 'M9 3h6 M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3 M7 15h10',
  guide: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5z M4 19a2 2 0 0 1 2-2h13',
  tour: 'M5 21V4 M5 4h12l-2 4 2 4H5',
  settings: 'M12 9a3 3 0 1 0 0 6a3 3 0 0 0 0-6z M19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4.9a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.5a7 7 0 0 0-2 1.2l-2.4-.9-2 3.4 2 1.6A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.6 2 3.4 2.4-.9a7 7 0 0 0 2 1.2L10 21h4l.5-2.5a7 7 0 0 0 2-1.2l2.4.9 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z',
  about: 'M12 21a9 9 0 1 0 0-18a9 9 0 0 0 0 18z M12 11v6 M12 7.5v.5',
  sync: 'M20 12a8 8 0 0 1-14 5.3 M4 12A8 8 0 0 1 18 6.7 M18 3v4h-4 M6 21v-4h4',
  wifi: 'M2 9a15 15 0 0 1 20 0 M5 12.5a10 10 0 0 1 14 0 M8.5 16a5 5 0 0 1 7 0 M12 19.5v.5',
  wifiOff: 'M2 9a15 15 0 0 1 7-3.5 M22 9a15 15 0 0 0-8-3.7 M5 12.5a10 10 0 0 1 4-2.3 M19 12.5a10 10 0 0 0-2.5-1.7 M8.5 16a5 5 0 0 1 7 0 M12 19.5v.5 M3 3l18 18',
  check: 'M4 12l5 5L20 6',
  checkCircle: 'M12 21a9 9 0 1 0 0-18a9 9 0 0 0 0 18z M8 12l3 3 5-6',
  x: 'M6 6l12 12 M18 6L6 18',
  alert: 'M12 3l9 16H3L12 3z M12 10v4 M12 17v.5',
  alertCircle: 'M12 21a9 9 0 1 0 0-18a9 9 0 0 0 0 18z M12 8v5 M12 16v.5',
  info: 'M12 21a9 9 0 1 0 0-18a9 9 0 0 0 0 18z M12 11v6 M12 7.5v.5',
  help: 'M12 21a9 9 0 1 0 0-18a9 9 0 0 0 0 18z M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6 M12 17v.5',
  camera: 'M4 8h3l2-3h6l2 3h3v11H4z M12 17a4 4 0 1 0 0-8a4 4 0 0 0 0 8z',
  image: 'M4 5h16v14H4z M4 16l5-5 4 4 3-3 4 4 M15.5 9a1.5 1.5 0 1 0 0-.1',
  keyboard: 'M3 7h18v10H3z M7 11h.5 M10.5 11h.5 M14 11h.5 M17.5 11h.5 M8 14.5h8',
  qr: 'M4 4h6v6H4z M14 4h6v6h-6z M4 14h6v6H4z M14 14h2v2h-2z M18 18h2v2h-2z M14 18h2 M18 14h2',
  print: 'M7 9V3h10v6 M7 17H4v-7h16v7h-3 M7 14h10v7H7z',
  copy: 'M9 9h11v11H9z M5 15H4V4h11v1',
  download: 'M12 4v11 M8 11l4 4 4-4 M5 20h14',
  upload: 'M12 20V9 M8 13l4-4 4 4 M5 4h14',
  pallet: 'M3 17h18 M3 20h18 M5 17v3 M12 17v3 M19 17v3 M5 7h14v10H5z M5 11h14',
  box: 'M3 8l9-4 9 4v9l-9 4-9-4V8z M3 8l9 4 9-4 M12 12v9',
  truck: 'M3 6h11v10H3z M14 10h4l3 3v3h-7 M7 19a2 2 0 1 0 0-4a2 2 0 0 0 0 4z M17 19a2 2 0 1 0 0-4a2 2 0 0 0 0 4z',
  returnIcon: 'M9 14L4 9l5-5 M4 9h11a5 5 0 0 1 0 10h-3',
  pin: 'M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11z M12 12a2 2 0 1 0 0-4a2 2 0 0 0 0 4z',
  question: 'M12 21a9 9 0 1 0 0-18a9 9 0 0 0 0 18z M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6 M12 17v.5',
  hold: 'M8 5v14 M16 5v14',
  unlock: 'M6 11h12v10H6z M9 11V7a3 3 0 0 1 6 0',
  lock: 'M6 11h12v10H6z M9 11V7a3 3 0 0 1 6 0v4',
  edit: 'M4 20h4L19 9l-4-4L4 16v4z M13 7l4 4',
  split: 'M6 3v6a4 4 0 0 0 4 4h4a4 4 0 0 1 4 4v4 M18 3v6a4 4 0 0 1-4 4 M6 21v-4',
  archive: 'M3 4h18v5H3z M5 9v11h14V9 M10 13h4',
  retire: 'M12 21a9 9 0 1 0 0-18a9 9 0 0 0 0 18z M5.6 5.6l12.8 12.8',
  history: 'M3 12a9 9 0 1 0 3-6.7 M3 4v5h5 M12 7v5l3 3',
  user: 'M12 11a4 4 0 1 0 0-8a4 4 0 0 0 0 8z M4 21c0-4 4-6 8-6s8 2 8 6',
  swap: 'M7 4v14 M4 15l3 3 3-3 M17 20V6 M14 9l3-3 3 3',
  chevronDown: 'M6 9l6 6 6-6',
  chevronRight: 'M9 6l6 6-6 6',
  chevronLeft: 'M15 6l-6 6 6 6',
  plus: 'M12 5v14 M5 12h14',
  refresh: 'M20 12a8 8 0 1 1-2.3-5.7 M20 4v5h-5',
  play: 'M7 4l13 8-13 8z',
  mail: 'M3 6h18v12H3z M3 7l9 6 9-6',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1 M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  linkedin: 'M4 9h3v11H4z M5.5 4a1.5 1.5 0 1 0 0 3a1.5 1.5 0 0 0 0-3z M10 9h3v1.5c.6-1 1.8-1.7 3.2-1.7 2.5 0 3.8 1.5 3.8 4.4V20h-3v-6.3c0-1.5-.6-2.3-1.8-2.3-1.3 0-2.2.9-2.2 2.5V20h-3z',
  trash: 'M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z M12 15a3 3 0 1 0 0-6a3 3 0 0 0 0 6z',
  bolt: 'M13 2L4 14h7l-1 8 9-12h-7l1-8z',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z M9 12l2 2 4-4',
  database: 'M12 3c4.4 0 8 1.3 8 3s-3.6 3-8 3-8-1.3-8-3 3.6-3 8-3z M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6 M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z M19 16l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z',
  stack: 'M12 3l9 5-9 5-9-5 9-5z M3 13l9 5 9-5 M3 17l9 5 9-5',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z',
  sun: 'M12 16a4 4 0 1 0 0-8a4 4 0 0 0 0 8z M12 2v2 M12 20v2 M4.9 4.9l1.4 1.4 M17.7 17.7l1.4 1.4 M2 12h2 M20 12h2 M4.9 19.1l1.4-1.4 M17.7 6.3l1.4-1.4',
  text: 'M4 7V5h16v2 M12 5v14 M9 19h6',
  flag: 'M5 21V4 M5 4h12l-2 4 2 4H5',
  target: 'M12 21a9 9 0 1 0 0-18a9 9 0 0 0 0 18z M12 17a5 5 0 1 0 0-10a5 5 0 0 0 0 10z M12 13a1 1 0 1 0 0-2a1 1 0 0 0 0 2z',
  barcode: 'M4 5v14 M7 5v14 M10 5v14 M14 5v14 M16 5v14 M20 5v14',
  scanner: 'M4 6h11l3 3v3l-3 1H9l-2 7H4l1-7H4z M18 8h3 M18 11h3',
  bluetooth: 'M7 7l10 10-5 4V3l5 4L7 17',
  usb: 'M12 3v14 M9 6l3-3 3 3 M7 10v3l5 3 5-3v-4 M6 8h2v2H6z M16 7h2v2h-2z M12 17a2 2 0 1 0 0 4a2 2 0 0 0 0-4z',
  volume: 'M4 9h4l5-4v14l-5-4H4z M16 9a4 4 0 0 1 0 6 M19 6a8 8 0 0 1 0 12',
  video: 'M3 6h13v12H3z M16 10l5-3v10l-5-3',
  phone: 'M7 2h10v20H7z M11 18h2',
  building: 'M4 21V5l8-3 8 3v16 M9 21v-4h6v4 M8 8h2 M14 8h2 M8 12h2 M14 12h2',
  dollar: 'M12 2v20 M17 6H9.5a3 3 0 0 0 0 6h5a3 3 0 0 1 0 6H6',
  star: 'M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z',
  quote: 'M5 11h5v7H4v-5c0-3 1-5 4-6 M15 11h5v7h-6v-5c0-3 1-5 4-6',
  calendar: 'M4 5h16v16H4z M4 10h16 M8 3v4 M16 3v4',
  clock: 'M12 21a9 9 0 1 0 0-18a9 9 0 0 0 0 18z M12 7v5l3 2',
  send: 'M3 11l18-8-8 18-2-8z M11 13l10-10',
  chat: 'M4 5h16v11H9l-5 4z',
  cloud: 'M7 18h11a4 4 0 0 0 .5-8A6 6 0 0 0 7 9a4.5 4.5 0 0 0 0 9z',
  key: 'M8 14a4 4 0 1 0 0-8a4 4 0 0 0 0 8z M11 11l9 9 M16 16l2-2 M18 18l2-2',
  layers: 'M12 3l9 5-9 5-9-5z M3 12l9 5 9-5',
  grid: 'M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z',
  list: 'M9 6h11 M9 12h11 M9 18h11 M4 6h1 M4 12h1 M4 18h1',
  checklist: 'M4 6l1.5 1.5L8 5 M11 6h9 M4 12l1.5 1.5L8 11 M11 12h9 M4 18l1.5 1.5L8 17 M11 18h9',
  hardhat: 'M3 18h18 M5 18v-3a7 7 0 0 1 14 0v3 M10 8V5h4v3 M9 18v-2 M15 18v-2',
  arrowRight: 'M5 12h14 M13 6l6 6-6 6',
  external: 'M14 4h6v6 M20 4l-9 9 M18 14v6H4V6h6',
  plug: 'M9 3v5 M15 3v5 M6 8h12v3a6 6 0 0 1-12 0z M12 17v4',
  rocket: 'M5 15c-1.5 1.5-2 5-2 5s3.5-.5 5-2 M9 18l-3-3 M9 18c5-2 10-7 10-15-8 0-13 5-15 10z M15 9a1 1 0 1 0 0-2a1 1 0 0 0 0 2z',
  menu: 'M4 7h16 M4 12h16 M4 17h16',
};

export type IconName = keyof typeof P;

export function Icon({ name, ...rest }: { name: IconName } & SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      <path d={P[name]} />
    </svg>
  );
}

/** Brand mark: a pallet under a location pin. */
export function BrandMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" {...props}>
      <rect x="1" y="1" width="30" height="30" rx="6" fill="var(--ink)" />
      <path d="M16 5.5c-3.3 0-6 2.6-6 5.9 0 4.1 6 9.1 6 9.1s6-5 6-9.1c0-3.3-2.7-5.9-6-5.9z" fill="var(--hazard)" />
      <circle cx="16" cy="11.4" r="2.2" fill="var(--ink)" />
      <path d="M6 23.5h20M6 26.5h20M8 23.5v3M16 23.5v3M24 23.5v3" stroke="var(--surface)" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
