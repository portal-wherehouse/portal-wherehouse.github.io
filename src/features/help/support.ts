// Support requests from the Help page's contact form. The support inbox is not connected yet, so a
// request is kept in this browser and handed back as an email the person sends themselves.

import { BRAND } from '../../brand';

export const TOPICS = ['Question', 'Problem', 'Idea', 'Scanner help', 'Billing'] as const;
export type Topic = (typeof TOPICS)[number];

export const TOPIC_HINT: Record<Topic, string> = {
  Question: 'How do I, where is, what does it mean',
  Problem: 'Something is wrong or not working',
  Idea: 'A feature or change you would like',
  'Scanner help': 'Connecting or testing a scanner',
  Billing: 'Plans, prices and invoices',
};

export const URGENCIES = [
  { id: 'low', label: 'Whenever you can', short: 'Low' },
  { id: 'normal', label: 'Soon', short: 'Normal' },
  { id: 'high', label: 'Blocking work', short: 'Urgent' },
] as const;
export type Urgency = (typeof URGENCIES)[number]['id'];

export const MESSAGE_MAX = 2000;

export interface HelpTicket {
  ref: string;
  at: string;
  name: string;
  email: string;
  topic: Topic;
  urgency: Urgency;
  message: string;
  /** Technical details appended when the box was ticked. */
  details: string | null;
}

const TICKETS_KEY = 'wh.help.tickets';
const DRAFT_KEY = 'wh.help.draft';

function isTicket(v: unknown): v is HelpTicket {
  if (!v || typeof v !== 'object') return false;
  const t = v as Record<string, unknown>;
  return typeof t.ref === 'string' && typeof t.at === 'string' && typeof t.message === 'string' && (TOPICS as readonly string[]).includes(String(t.topic)) && URGENCIES.some((u) => u.id === t.urgency);
}

/** Requests saved on this device, newest first. */
export function loadTickets(): HelpTicket[] {
  try {
    const raw = localStorage.getItem(TICKETS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(isTicket).sort((a, b) => b.at.localeCompare(a.at)) : [];
  } catch {
    return [];
  }
}

function writeTickets(list: HelpTicket[]): boolean {
  try {
    localStorage.setItem(TICKETS_KEY, JSON.stringify(list.slice(0, 50)));
    return true;
  } catch {
    return false;
  }
}

/** Saves a request on this device. Returns false when the browser refused (private mode, full storage). */
export function saveTicket(t: HelpTicket): boolean {
  return writeTickets([t, ...loadTickets().filter((x) => x.ref !== t.ref)]);
}

export function removeTicket(ref: string): boolean {
  return writeTickets(loadTickets().filter((x) => x.ref !== ref));
}

export interface Draft {
  name: string;
  email: string;
  topic: Topic;
  urgency: Urgency;
  message: string;
  includeDetails: boolean;
}

export const EMPTY_DRAFT: Draft = { name: '', email: '', topic: 'Question', urgency: 'normal', message: '', includeDetails: true };

/** The unsent form, kept on this device so a half-written message survives leaving the page. */
export function loadDraft(): Draft {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return EMPTY_DRAFT;
    const d = { ...EMPTY_DRAFT, ...(JSON.parse(raw) as Partial<Draft>) };
    return {
      name: String(d.name).slice(0, 120),
      email: String(d.email).slice(0, 200),
      topic: (TOPICS as readonly string[]).includes(d.topic) ? d.topic : 'Question',
      urgency: URGENCIES.some((u) => u.id === d.urgency) ? d.urgency : 'normal',
      message: String(d.message).slice(0, MESSAGE_MAX + 200),
      includeDetails: d.includeDetails !== false,
    };
  } catch {
    return EMPTY_DRAFT;
  }
}

export function saveDraft(d: Draft | null) {
  try {
    if (!d) localStorage.removeItem(DRAFT_KEY);
    else localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
  } catch {
    /* a lost draft is an inconvenience, not an error */
  }
}

/** A short reference people can quote back, like HELP-260923-K7QF. */
export function makeRef(now = new Date()): string {
  const d = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let tail = '';
  for (let i = 0; i < 4; i++) tail += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `HELP-${d}-${tail}`;
}

export function validEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.trim());
}

export function urgencyLabel(u: Urgency): string {
  return URGENCIES.find((x) => x.id === u)?.label ?? u;
}

export function subjectFor(t: HelpTicket): string {
  const flag = t.urgency === 'high' ? 'URGENT: ' : '';
  return `${flag}${BRAND.name} ${t.topic.toLowerCase()} (${t.ref})`;
}

/** The full message, as it goes into the email and onto the clipboard. */
export function bodyFor(t: HelpTicket): string {
  const from = [t.name.trim(), t.email.trim() ? `<${t.email.trim()}>` : ''].filter(Boolean).join(' ');
  const lines = [
    `Hello ${BRAND.name} support,`,
    '',
    t.message.trim(),
    '',
    '---',
    `Reference: ${t.ref}`,
    `Topic: ${t.topic}`,
    `Urgency: ${urgencyLabel(t.urgency)}`,
    ...(from ? [`From: ${from}`] : []),
    `Written: ${new Date(t.at).toLocaleString()}`,
  ];
  if (t.details) lines.push('', 'Technical details', t.details);
  return lines.join('\n');
}

export function mailtoFor(t: HelpTicket): string {
  return `mailto:${BRAND.supportEmail}?subject=${encodeURIComponent(subjectFor(t))}&body=${encodeURIComponent(bodyFor(t))}`;
}
