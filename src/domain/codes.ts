// Code normalization, label payloads, and hashing (pages 9, 13, 16, 23).

/** Codes are unique after trimming and case normalization. Display spelling is preserved elsewhere. */
export function normalizeCode(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').toUpperCase();
}

export function formatPalletCode(n: number): string {
  return `P-${String(n).padStart(6, '0')}`;
}

/** Accepts P-000042, p-42, P42, "  p 000042 " and returns the canonical code, or null. */
export function parsePalletCode(raw: string): string | null {
  const m = /^P[\s-]?0*(\d{1,9})$/i.exec(raw.trim());
  if (!m) return null;
  return formatPalletCode(Number(m[1]));
}

export const LABEL_PREFIX = 'PL1';
const TOKEN_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const TOKEN_LENGTH = 16;
export const MAX_SCAN_LENGTH = 128;

export type LabelKind = 'P' | 'L';

export function makeLabelPayload(kind: LabelKind, token: string): string {
  return `${LABEL_PREFIX}:${kind}:${token}`;
}

/**
 * Parse a scanned QR payload. Only our exact typed format is accepted, with a length limit.
 * A scanned URL is never navigated to; we only extract a fragment in our format from it.
 */
export function parseLabelPayload(raw: string): { kind: LabelKind; token: string } | null {
  if (!raw || raw.length > MAX_SCAN_LENGTH) return null;
  const text = raw.trim();
  const m = /(?:^|#)PL1:([PL]):([A-Z2-7]{16})$/.exec(text);
  if (!m) return null;
  return { kind: m[1] as LabelKind, token: m[2] };
}

/** Unpredictable token. Uses crypto when available; `rand` makes seeded fixtures deterministic. */
export function generateToken(rand?: () => number): string {
  let out = '';
  if (!rand && typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = new Uint8Array(TOKEN_LENGTH);
    crypto.getRandomValues(bytes);
    for (const b of bytes) out += TOKEN_ALPHABET[b & 31];
    return out;
  }
  const r = rand ?? Math.random;
  for (let i = 0; i < TOKEN_LENGTH; i++) out += TOKEN_ALPHABET[Math.floor(r() * 32)];
  return out;
}

export function uuid(rand?: () => number): string {
  if (!rand && typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  const r = rand ?? Math.random;
  const hex = [...Array(32)].map(() => Math.floor(r() * 16).toString(16));
  hex[12] = '4';
  hex[16] = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  const s = hex.join('');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}

/** Deterministic PRNG for fixtures (seed 214 by default). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Canonical JSON: sorted keys, trimmed strings, so equivalent payloads hash equally. */
export function canonicalJson(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(typeof value === 'string' ? value.trim() : value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(',')}}`;
}

/** 64-bit (two 32-bit lanes) string hash. Sufficient to detect key reuse in the local demo. */
export function hashString(str: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
}

/** Split a rack code like A-03-02 into flexible zone/aisle/bay fields; other codes stay free text. */
export function rackFields(code: string): { zone: string | null; aisle: string | null; bay: string | null; level: string | null } {
  const m = /^([A-Z]+)-(\d+)-(\d+)(?:-(\d+))?$/.exec(normalizeCode(code));
  if (!m) return { zone: null, aisle: null, bay: null, level: null };
  return { zone: m[1], aisle: m[2], bay: m[3], level: m[4] ?? null };
}

export function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[b.length];
}
