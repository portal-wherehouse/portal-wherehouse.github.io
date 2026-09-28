// Code 128 barcode encoder (ISO/IEC 15417): code set B for text, code set C for long runs of digits.
// Returns bar and space widths in modules, ready to draw; Barcode128.tsx draws them as SVG.

/** Bar/space widths for symbol values 0-105 (6 elements, 11 modules each) and the stop pattern (7 elements, 13 modules). */
export const CODE128_PATTERNS: readonly string[] = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213', // 0-9
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132', // 10-19
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211', // 20-29
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313', // 30-39
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331', // 40-49
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111', // 50-59
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214', // 60-69
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111', // 70-79
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141', // 80-89
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141', // 90-99
  '114131', '311141', '411131', '211412', '211214', '211232', // 100-105
  '2331112', // 106: stop
];

export const CODE_C = 99;
export const CODE_B = 100;
export const START_A = 103;
export const START_B = 104;
export const START_C = 105;
export const STOP = 106;

/** Modules of clear space each side; the standard asks for at least 10. */
export const QUIET_ZONE = 10;

export interface Code128 {
  /** Symbol values: start code, data (with any code set switches), checksum. The stop pattern is implied. */
  values: number[];
  /** Widths in modules, alternating bar, space, bar... from the start code through the stop pattern. */
  widths: number[];
  /** Total width in modules, not counting quiet zones. */
  modules: number;
}

/** Code set B covers printable ASCII (space to DEL). Anything else cannot be encoded here. */
export function canEncodeCode128(text: string): boolean {
  if (!text) return false;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c < 32 || c > 127) return false;
  }
  return true;
}

function digitRun(s: string, from: number): number {
  let i = from;
  while (i < s.length && s.charCodeAt(i) >= 48 && s.charCodeAt(i) <= 57) i++;
  return i - from;
}

/** Weighted modulo-103 check: the start value, plus each following value times its position. */
export function code128Checksum(values: readonly number[]): number {
  let sum = values[0] ?? 0;
  for (let i = 1; i < values.length; i++) sum += values[i] * i;
  return sum % 103;
}

/**
 * Symbol values for `text`, including the start code and the checksum.
 * Digits go into code set C two at a time when that is shorter: 4 or more at the start or end, 6 or more in the middle.
 */
export function code128Values(text: string): number[] {
  if (!canEncodeCode128(text)) throw new RangeError('Code 128 set B only encodes printable ASCII characters.');
  const n = text.length;
  const lead = digitRun(text, 0);
  let set: 'B' | 'C' = lead >= 4 || (lead === 2 && n === 2) ? 'C' : 'B';
  const out: number[] = [set === 'C' ? START_C : START_B];
  let i = 0;
  while (i < n) {
    const run = digitRun(text, i);
    if (set === 'C') {
      if (run >= 2) {
        out.push(Number(text.slice(i, i + 2)));
        i += 2;
      } else {
        out.push(CODE_B);
        set = 'B';
      }
      continue;
    }
    if (run >= 6 || (run >= 4 && i + run === n)) {
      // An odd run leaves its first digit in set B so the rest pairs up evenly.
      if (run % 2 === 1) {
        out.push(text.charCodeAt(i) - 32);
        i++;
      }
      out.push(CODE_C);
      set = 'C';
      continue;
    }
    out.push(text.charCodeAt(i) - 32);
    i++;
  }
  out.push(code128Checksum(out));
  return out;
}

export function encodeCode128(text: string): Code128 {
  const values = code128Values(text);
  const widths: number[] = [];
  for (const v of [...values, STOP]) for (const ch of CODE128_PATTERNS[v]) widths.push(Number(ch));
  return { values, widths, modules: widths.reduce((a, b) => a + b, 0) };
}
