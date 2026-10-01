// Scan station logic: what a scan means in each mode, put-away line planning and count classification.
// Pure functions over plain records (no React, no storage), so every rule here is unit-tested.

import { parseScanCommand, type ScanCommand } from '../../device/scanCommands';
import type { ScanSource } from '../../device/scanRouter';
import type { Outcome } from '../../data/backend';
import type { Db } from '../../demo/engine';
import { moveBlocker, roleAllows } from '../../domain/transitions';
import type { CommandKind, Location, Pallet, Role } from '../../domain/types';

// ------------------------------------------------------------------ modes and roles

export type StationMode = 'lookup' | 'move' | 'putaway' | 'count';
export const STATION_MODES: StationMode[] = ['lookup', 'move', 'putaway', 'count'];

export const MODE_LABEL: Record<StationMode, string> = { lookup: 'Look up', move: 'Move', putaway: 'Put-away', count: 'Count' };

const MODE_COMMAND: Record<StationMode, ScanCommand> = { lookup: 'MODE_LOOKUP', move: 'MODE_MOVE', putaway: 'MODE_PUTAWAY', count: 'MODE_COUNT' };

export function commandForMode(mode: StationMode): ScanCommand {
  return MODE_COMMAND[mode];
}

export function modeForCommand(c: ScanCommand): StationMode | null {
  return STATION_MODES.find((m) => MODE_COMMAND[m] === c) ?? null;
}

/** Reads a mode from a route parameter such as `station?q=count`. */
export function modeFromQuery(q: string | null | undefined): StationMode | null {
  const t = (q ?? '').toLowerCase().replace(/[^a-z]/g, '');
  if (t === 'lookup' || t === 'find') return 'lookup';
  if (t === 'move') return 'move';
  if (t === 'putaway') return 'putaway';
  if (t === 'count' || t === 'cyclecount') return 'count';
  return null;
}

/** The commands each mode can send. A mode is open only when the role may send all of them. */
const MODE_NEEDS: Record<StationMode, CommandKind[]> = {
  lookup: [],
  move: ['place', 'move', 'verify_location'],
  putaway: ['place', 'move', 'verify_location'],
  count: ['verify_location'],
};

export function modeAccess(role: Role | null | undefined, mode: StationMode): { ok: true } | { ok: false; reason: string } {
  if (!role) return { ok: false, reason: 'Choose an account first.' };
  if (MODE_NEEDS[mode].every((k) => roleAllows(role, k))) return { ok: true };
  return { ok: false, reason: `${MODE_LABEL[mode]} changes records, so it needs Operator access or higher. Viewers can look up pallets but not change anything.` };
}

/** Marking a pallet missing follows the same rule as the pallet record: operators and up, always with a reason. */
export function canMarkMissing(role: Role | null | undefined): boolean {
  return !!role && roleAllows(role, 'mark_missing');
}

/** Recording a missing pallet as found needs a supervisor (the `locate` command). */
export function canRecordFound(role: Role | null | undefined): boolean {
  return roleAllows(role, 'locate');
}

// ------------------------------------------------------------------ reading scans

export type Scanned = { type: 'pallet'; pallet: Pallet } | { type: 'location'; location: Location } | { type: 'command'; command: ScanCommand } | { type: 'unknown'; message: string };

/** Command barcodes first, then labels and typed codes through the engine's resolver. */
export function readScan(text: string, resolve: (text: string) => { type: 'pallet'; pallet: Pallet } | { type: 'location'; location: Location }): Scanned {
  const command = parseScanCommand(text);
  if (command) return { type: 'command', command };
  if (/^CMD:/i.test(text.trim())) return { type: 'unknown', message: 'That command barcode is not one this station knows.' };
  try {
    return resolve(text);
  } catch (e) {
    return { type: 'unknown', message: e instanceof Error && e.message ? e.message : 'Could not read that code.' };
  }
}

/** Repeated reads of the same code this close together are one scan (scanner double reads, camera frames). */
export const DOUBLE_READ_MS = 600;
export const CAMERA_REPEAT_MS = 2500;

export function isDoubleRead(last: { raw: string; at: number } | null, raw: string, at: number, source: ScanSource): boolean {
  if (!last || last.raw !== raw) return false;
  const window = source === 'camera' || source === 'photo' ? CAMERA_REPEAT_MS : DOUBLE_READ_MS;
  return at - last.at >= 0 && at - last.at < window;
}

// ------------------------------------------------------------------ wording

/** Text someone typed (a hold reason), ended with a full stop when it has none, so the next sentence can follow it. */
export function asSentence(text: string): string {
  const t = text.trim();
  return !t || /[.!?]$/.test(t) ? t : `${t}.`;
}

export function agoLong(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return 'never';
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 45) return 'just now';
  const m = Math.max(1, Math.round(s / 60));
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'} ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? '' : 's'} ago`;
}

export type CodeOf = (locationId: string | null) => string | null;

/** Where a pallet is, worded honestly: the records say where it was last confirmed, not where it "is". */
export function whereLine(p: Pallet, codeOf: CodeOf, now = Date.now()): string {
  switch (p.state) {
    case 'STORED':
      return `Last confirmed at ${codeOf(p.current_location_id) ?? 'an unknown location'}, ${agoLong(p.last_confirmed_at, now)}`;
    case 'RECEIVED':
      return `Not placed yet. Received ${agoLong(p.received_at, now)}`;
    case 'MISSING': {
      const last = codeOf(p.last_confirmed_location_id);
      return last ? `Marked missing. It was last confirmed at ${last}` : 'Marked missing. It was never placed';
    }
    case 'IN_TRANSIT':
      return `In transit to ${p.transfer?.to_name ?? 'another warehouse'}${p.transfer ? ` on ${p.transfer.number}` : ''}`;
    case 'DISPATCHED':
      return 'Dispatched. It has left the warehouse';
    case 'RETIRED':
      return 'Retired. No longer an active pallet';
  }
}

/** A few words for the session log. */
export function whereShort(p: Pallet, codeOf: CodeOf): string {
  switch (p.state) {
    case 'STORED':
      return `At ${codeOf(p.current_location_id) ?? '?'}`;
    case 'RECEIVED':
      return 'Not placed yet';
    case 'MISSING':
      return 'Marked missing';
    case 'IN_TRANSIT':
      return 'In transit';
    case 'DISPATCHED':
      return 'Dispatched';
    case 'RETIRED':
      return 'Retired';
  }
}

// ------------------------------------------------------------------ move intent (same rules as the Move screen)

export type Intent = 'place' | 'move' | 'verify_location';

export function intentFor(pallet: Pallet, rack: Location): { ok: true; intent: Intent } | { ok: false; message: string } {
  const b = moveBlocker(pallet);
  if (b) return { ok: false, message: b.message };
  if (!rack.active) return { ok: false, message: `${rack.code} is inactive. Choose an active location.` };
  if (pallet.state === 'RECEIVED') return { ok: true, intent: 'place' };
  if (pallet.current_location_id === rack.id) return { ok: true, intent: 'verify_location' };
  return { ok: true, intent: 'move' };
}

export function intentText(intent: Intent, pallet: Pallet, rack: Location, codeOf: CodeOf): string {
  if (intent === 'place') return `Place ${pallet.code} at ${rack.code}`;
  if (intent === 'verify_location') return `Confirm ${pallet.code} is still at ${rack.code}`;
  return `Move ${pallet.code} from ${codeOf(pallet.current_location_id) ?? '?'} to ${rack.code}`;
}

// ------------------------------------------------------------------ results of a save

export type LineResult =
  | { status: 'pending' }
  | { status: 'saving' }
  | { status: 'saved'; version: number | null; replayed: boolean }
  | { status: 'queued' }
  | { status: 'conflict'; message: string; current: Pallet | null }
  | { status: 'failed'; message: string }
  | { status: 'unknown'; commandId: string; message: string }
  | { status: 'blocked'; message: string }
  | { status: 'skipped' };

export const PENDING: LineResult = { status: 'pending' };

/** Turn a backend outcome into a line result. A lost response keeps its command ID for recovery. */
export function outcomeToResult(o: Outcome, commandId: string): LineResult {
  switch (o.status) {
    case 'result':
      if (o.result.ok) return { status: 'saved', version: o.result.new_version, replayed: !!o.result.replayed };
      if (o.result.code === 'VERSION_CONFLICT') return { status: 'conflict', message: o.result.message, current: o.result.current ?? null };
      return { status: 'failed', message: o.result.message };
    case 'unknown':
      return { status: 'unknown', commandId, message: o.message };
    case 'queued':
      return { status: 'queued' };
    case 'offline':
      return { status: 'failed', message: o.message };
  }
}

/** Lines that Save all (or Confirm all) should send: never sent, or sent and refused for a reason that may pass now. */
export function isSendable(r: LineResult): boolean {
  return r.status === 'pending' || r.status === 'failed';
}

export function isFinal(r: LineResult): boolean {
  return r.status === 'saved' || r.status === 'queued' || r.status === 'skipped' || r.status === 'blocked';
}

// ------------------------------------------------------------------ commands

export type Fix = Intent | 'locate' | 'mark_missing';

export interface CommandSpec {
  kind: Fix;
  payload: Record<string, unknown>;
  pallet: Pallet;
  /** The version seen when the pallet was scanned. A newer record on the server is a conflict, never an overwrite. */
  expectedVersion: number;
  locationId: string | null;
}

export function commandFor(fix: Fix, pallet: Pallet, rack: Location | null, reason?: string): CommandSpec {
  const base = { pallet, expectedVersion: pallet.version };
  if (fix === 'mark_missing') return { ...base, kind: fix, payload: { reason: (reason ?? '').trim() }, locationId: null };
  if (!rack) throw new Error(`${fix} needs a location`);
  if (fix === 'locate') return { ...base, kind: fix, payload: { location_id: rack.id, reason: (reason ?? '').trim() }, locationId: rack.id };
  return { ...base, kind: fix, payload: { location_id: rack.id }, locationId: rack.id };
}

// ------------------------------------------------------------------ put-away

export interface PlanLine {
  key: string;
  /** The pallet as scanned. */
  pallet: Pallet;
  fromCode: string | null;
  intent: Intent | null;
  /** What will happen, in a few words. */
  what: string;
  detail: string | null;
  result: LineResult;
}

export function planLine(pallet: Pallet, rack: Location, codeOf: CodeOf): PlanLine {
  const fromCode = codeOf(pallet.current_location_id);
  const chk = intentFor(pallet, rack);
  const hold = pallet.hold ? `On hold: ${asSentence(pallet.hold.reason)} The hold stays on.` : null;
  if (!chk.ok) return { key: pallet.id, pallet, fromCode, intent: null, what: 'Cannot go here', detail: chk.message, result: { status: 'blocked', message: chk.message } };
  const what = chk.intent === 'place' ? 'Place here' : chk.intent === 'move' ? `Move from ${fromCode ?? '?'}` : 'Already here';
  const base = chk.intent === 'place' ? 'Not placed yet.' : chk.intent === 'verify_location' ? 'Saving confirms it is still here.' : null;
  const detail = [base, hold].filter(Boolean).join(' ') || null;
  return { key: pallet.id, pallet, fromCode, intent: chk.intent, what, detail, result: PENDING };
}

// ------------------------------------------------------------------ count

export interface UnknownCode {
  raw: string;
  message: string;
}

export interface CountRow {
  key: string;
  /** Scanned pallets as scanned; missing pallets as recorded when the count finished. */
  pallet: Pallet;
  fromCode: string | null;
  fix: Fix | null;
  note: string;
  result: LineResult;
}

export interface CountReport {
  rackId: string;
  matched: CountRow[];
  missing: CountRow[];
  unexpected: CountRow[];
  unknown: UnknownCode[];
}

/** How a pallet scanned during a count compares with the records for that rack. */
export function countRowFor(p: Pallet, rack: Location, codeOf: CodeOf): { list: 'matched' | 'unexpected'; row: CountRow } {
  const fromCode = codeOf(p.current_location_id);
  const row = (fix: Fix | null, note: string): CountRow => ({ key: p.id, pallet: p, fromCode, fix, note, result: PENDING });
  if (p.state === 'STORED' && p.current_location_id === rack.id) return { list: 'matched', row: row('verify_location', 'On record here') };
  switch (p.state) {
    case 'STORED':
      return { list: 'unexpected', row: row('move', `Recorded at ${fromCode ?? 'another location'}`) };
    case 'RECEIVED':
      return { list: 'unexpected', row: row('place', 'Not placed yet in the records') };
    case 'MISSING': {
      const last = codeOf(p.last_confirmed_location_id);
      return { list: 'unexpected', row: row('locate', `Marked missing${last ? `, last confirmed at ${last}` : ''}`) };
    }
    case 'IN_TRANSIT':
      return { list: 'unexpected', row: row(null, `In transit on ${p.transfer?.number ?? 'a transfer'}. Receive it at ${p.transfer?.to_name ?? 'its destination'}, or ask a manager to cancel the transfer.`) };
    case 'DISPATCHED':
      return { list: 'unexpected', row: row(null, 'Recorded as dispatched. Record the return from its record first.') };
    case 'RETIRED':
      return { list: 'unexpected', row: row(null, 'Retired in the records. Tell a supervisor.') };
  }
}

/**
 * Compare what was scanned on a rack with what the records say is there.
 * Matched: stored here and scanned. Missing: stored here, not scanned. Unexpected: scanned, recorded elsewhere or not placed.
 */
export function classifyCount(rack: Location, scanned: Pallet[], unknown: UnknownCode[], recordedHere: Pallet[], codeOf: CodeOf): CountReport {
  const seen = new Set(scanned.map((p) => p.id));
  const report: CountReport = { rackId: rack.id, matched: [], missing: [], unexpected: [], unknown: [...unknown] };
  for (const p of scanned) {
    const { list, row } = countRowFor(p, rack, codeOf);
    report[list].push(row);
  }
  for (const p of recordedHere) {
    if (seen.has(p.id) || p.state !== 'STORED' || p.current_location_id !== rack.id) continue;
    report.missing.push({ key: p.id, pallet: p, fromCode: rack.code, fix: 'mark_missing', note: `On record here, last confirmed ${agoLong(p.last_confirmed_at)}`, result: PENDING });
  }
  const byCode = (a: CountRow, b: CountRow) => a.pallet.code.localeCompare(b.pallet.code);
  report.matched.sort(byCode);
  report.missing.sort(byCode);
  return report;
}

export type CountList = 'matched' | 'missing' | 'unexpected';

// ------------------------------------------------------------------ station state

export type Tone = 'ok' | 'info' | 'warn' | 'error';

export interface Note {
  tone: Tone;
  text: string;
}

export interface LogEntry {
  id: number;
  at: number;
  kind: 'scan' | 'save';
  source: ScanSource | null;
  raw: string;
  label: string;
  text: string;
  tone: Tone;
}

export interface MoveWork {
  phase: 'pallet' | 'rack' | 'confirm' | 'saving' | 'done' | 'unknown' | 'queued';
  pallet: Pallet | null;
  rack: Location | null;
  intent: Intent | null;
  /** Kept while a result is unknown, so recovery asks about the same decision. */
  commandId: string | null;
  note: Note | null;
}

export interface PutawayWork {
  phase: 'rack' | 'scanning' | 'review' | 'saving' | 'done';
  rack: Location | null;
  lines: PlanLine[];
}

export interface CountWork {
  phase: 'rack' | 'scanning' | 'review';
  rack: Location | null;
  scanned: Pallet[];
  unknown: UnknownCode[];
  report: CountReport | null;
  busy: boolean;
}

export type LookTarget = { type: 'pallet'; id: string } | { type: 'location'; id: string } | { type: 'unknown'; raw: string; message: string };

export interface StationState {
  mode: StationMode;
  lookup: LookTarget | null;
  move: MoveWork;
  putaway: PutawayWork;
  count: CountWork;
  /** Feedback on the latest scan or action, shown under the big prompt. */
  flash: Note | null;
  log: LogEntry[];
  last: { raw: string; at: number } | null;
  seq: number;
}

export const EMPTY_MOVE: MoveWork = { phase: 'pallet', pallet: null, rack: null, intent: null, commandId: null, note: null };
export const EMPTY_PUTAWAY: PutawayWork = { phase: 'rack', rack: null, lines: [] };
export const EMPTY_COUNT: CountWork = { phase: 'rack', rack: null, scanned: [], unknown: [], report: null, busy: false };

export function initialStation(mode: StationMode = 'lookup'): StationState {
  return { mode, lookup: null, move: EMPTY_MOVE, putaway: EMPTY_PUTAWAY, count: EMPTY_COUNT, flash: null, log: [], last: null, seq: 0 };
}

/** What the reducer needs to know about the world. Built from the live records by `makeCtx`. */
export interface StationCtx {
  role: Role | null;
  confirmByRescan: boolean;
  codeOf: CodeOf;
  /** Pallets recorded as stored at a location right now. */
  palletsAt(locationId: string): Pallet[];
}

export function makeCtx(db: Db, workspaceId: string, role: Role | null, confirmByRescan: boolean): StationCtx {
  return {
    role,
    confirmByRescan,
    codeOf: (id) => (id ? (db.locations[id]?.code ?? null) : null),
    palletsAt: (locationId) =>
      Object.values(db.pallets)
        .filter((p) => p.workspace_id === workspaceId && p.state === 'STORED' && p.current_location_id === locationId)
        .sort((a, b) => a.code.localeCompare(b.code)),
  };
}

export type Effect = { kind: 'save-move' } | { kind: 'recover-move' } | { kind: 'save-putaway' } | { kind: 'confirm-count' };

export type StationAction =
  | { type: 'SCAN'; raw: string; source: ScanSource; at: number; scanned: Scanned }
  | { type: 'MODE'; mode: StationMode }
  | { type: 'CONFIRM' }
  | { type: 'CANCEL' }
  | { type: 'FINISH' }
  | { type: 'START_MOVE'; pallet: Pallet }
  | { type: 'START_RACK'; mode: 'putaway' | 'count'; rack: Location }
  | { type: 'MOVE_SAVING'; commandId: string }
  /** `pallet` is the record as it is after a save, so the card stops showing the scan-time state. */
  | { type: 'MOVE_RESULT'; result: LineResult; pallet?: Pallet }
  | { type: 'PUTAWAY_PHASE'; phase: 'saving' | 'done' }
  | { type: 'REMOVE_LINE'; key: string }
  | { type: 'REPLAN_LINE'; key: string; pallet: Pallet }
  | { type: 'LINE_RESULT'; list: 'putaway' | CountList; key: string; result: LineResult }
  | { type: 'COUNT_BUSY'; busy: boolean }
  | { type: 'SKIP'; key: string }
  | { type: 'RESET_MODE' }
  | { type: 'FLASH'; tone: Tone; text: string }
  | { type: 'CLEAR_LOG' };

export interface Step {
  state: StationState;
  effect: Effect | null;
  /** How a scan went, for the scanner's beep: true (used), or 'error' (meant for us, but refused). */
  verdict: true | 'error';
}

const LOG_MAX = 40;

function describe(sc: Scanned, raw: string): string {
  switch (sc.type) {
    case 'pallet':
      return `${sc.pallet.code} · ${sc.pallet.description}`;
    case 'location':
      return sc.location.code;
    case 'command':
      return `Command: ${sc.command.replace('MODE_', '').toLowerCase().replace('putaway', 'put-away').replace('lookup', 'look up')}`;
    case 'unknown':
      return raw;
  }
}

/** Append a log entry and set the flash. */
function say(s: StationState, tone: Tone, text: string, scan?: { raw: string; source: ScanSource; at: number; label: string }, kind: LogEntry['kind'] = 'scan'): StationState {
  if (!scan) return { ...s, flash: { tone, text } };
  const seq = s.seq + 1;
  const entry: LogEntry = { id: seq, at: scan.at, kind, source: kind === 'scan' ? scan.source : null, raw: scan.raw, label: scan.label, text, tone };
  return { ...s, seq, flash: { tone, text }, log: [entry, ...s.log].slice(0, LOG_MAX) };
}

function logSave(s: StationState, tone: Tone, label: string, text: string): StationState {
  const seq = s.seq + 1;
  const entry: LogEntry = { id: seq, at: Date.now(), kind: 'save', source: null, raw: '', label, text, tone };
  return { ...s, seq, log: [entry, ...s.log].slice(0, LOG_MAX) };
}

const done = (state: StationState, verdict: true | 'error' = true, effect: Effect | null = null): Step => ({ state, effect, verdict });

type ScanInfo = { raw: string; source: ScanSource; at: number; label: string };

export function stationReducer(s: StationState, a: StationAction, ctx: StationCtx): Step {
  switch (a.type) {
    case 'SCAN': {
      if (isDoubleRead(s.last, a.raw, a.at, a.source)) return done(s);
      const base: StationState = { ...s, last: { raw: a.raw, at: a.at } };
      const info: ScanInfo = { raw: a.raw, source: a.source, at: a.at, label: describe(a.scanned, a.raw) };
      if (a.scanned.type === 'command') return onCommand(base, a.scanned.command, ctx, info);
      switch (base.mode) {
        case 'lookup':
          return scanLookup(base, a.scanned, ctx, info);
        case 'move':
          return scanMove(base, a.scanned, ctx, info);
        case 'putaway':
          return scanPutaway(base, a.scanned, ctx, info);
        case 'count':
          return scanCount(base, a.scanned, ctx, info);
      }
      return done(base);
    }
    case 'MODE':
      return switchMode(s, a.mode, ctx);
    case 'CONFIRM':
      return confirm(s, ctx);
    case 'CANCEL':
      return cancel(s);
    case 'FINISH':
      return finish(s, ctx);
    case 'START_MOVE': {
      const sw = switchMode(s, 'move', ctx);
      if (sw.verdict === 'error') return sw;
      // A move that is saving, or whose result is unknown, is never replaced (the same rule as Cancel).
      if (s.move.phase === 'saving') return done(say(sw.state, 'error', 'Wait for the save to finish.'), 'error');
      if (s.move.phase === 'unknown') return done(say(sw.state, 'error', 'Check the result first. The move may already be saved.'), 'error');
      return startMove({ ...sw.state, move: EMPTY_MOVE }, a.pallet);
    }
    case 'START_RACK': {
      const sw = switchMode(s, a.mode, ctx);
      if (sw.verdict === 'error') return sw;
      if (a.mode === 'putaway' ? s.putaway.phase === 'saving' : s.count.busy) return done(say(sw.state, 'error', 'Wait for the save to finish.'), 'error');
      return a.mode === 'putaway' ? startPutaway(sw.state, a.rack) : startCount(sw.state, a.rack);
    }
    case 'MOVE_SAVING':
      return done({ ...s, move: { ...s.move, phase: 'saving', commandId: a.commandId, note: null }, flash: { tone: 'info', text: 'Saving…' } });
    case 'MOVE_RESULT':
      return moveResult(s, a.result, a.pallet);
    case 'PUTAWAY_PHASE': {
      const next = { ...s, putaway: { ...s.putaway, phase: a.phase } };
      if (a.phase === 'saving') return done({ ...next, flash: { tone: 'info', text: 'Saving each pallet in turn…' } });
      const lines = s.putaway.lines;
      const saved = lines.filter((l) => l.result.status === 'saved').length;
      const queued = lines.filter((l) => l.result.status === 'queued').length;
      const problems = lines.filter((l) => !isFinal(l.result)).length;
      const parts = [saved ? `${saved} saved` : '', queued ? `${queued} queued on this device, not confirmed` : '', problems ? `${problems} need${problems === 1 ? 's' : ''} attention` : ''].filter(
        Boolean,
      );
      return done({ ...next, flash: { tone: problems || queued ? 'warn' : 'ok', text: `${parts.join('. ') || 'Nothing to save'}.` } });
    }
    case 'REMOVE_LINE': {
      if (s.putaway.phase === 'saving') return done(s, 'error');
      const lines = s.putaway.lines.filter((l) => l.key !== a.key || l.result.status === 'saved' || l.result.status === 'queued');
      return done({ ...s, putaway: { ...s.putaway, lines, phase: lines.length || s.putaway.phase !== 'review' ? s.putaway.phase : 'scanning' } });
    }
    case 'REPLAN_LINE': {
      const rack = s.putaway.rack;
      if (!rack) return done(s, 'error');
      const lines = s.putaway.lines.map((l) => (l.key === a.key ? planLine(a.pallet, rack, ctx.codeOf) : l));
      return done({ ...s, putaway: { ...s.putaway, lines }, flash: { tone: 'info', text: `${a.pallet.code} refreshed. Check what will happen, then save again.` } });
    }
    case 'LINE_RESULT':
      return lineResult(s, a.list, a.key, a.result);
    case 'COUNT_BUSY':
      return done({ ...s, count: { ...s.count, busy: a.busy } });
    case 'SKIP':
      return lineResult(s, 'missing', a.key, { status: 'skipped' });
    case 'RESET_MODE':
      return done(resetMode(s, s.mode));
    case 'FLASH':
      return done({ ...s, flash: { tone: a.tone, text: a.text } });
    case 'CLEAR_LOG':
      return done({ ...s, log: [] });
  }
}

function resetMode(s: StationState, mode: StationMode): StationState {
  if (mode === 'move') return { ...s, move: EMPTY_MOVE, flash: null };
  if (mode === 'putaway') return { ...s, putaway: EMPTY_PUTAWAY, flash: null };
  if (mode === 'count') return { ...s, count: EMPTY_COUNT, flash: null };
  return { ...s, lookup: null, flash: null };
}

function switchMode(s: StationState, mode: StationMode, ctx: StationCtx, info?: ScanInfo): Step {
  const access = modeAccess(ctx.role, mode);
  if (!access.ok) return done(say(s, 'error', access.reason, info), 'error');
  if (s.mode === mode) return done(say(s, 'info', `Already in ${MODE_LABEL[mode]} mode.`, info));
  return done(say({ ...s, mode }, 'ok', `${MODE_LABEL[mode]} mode.`, info));
}

function onCommand(s: StationState, c: ScanCommand, ctx: StationCtx, info: ScanInfo): Step {
  const mode = modeForCommand(c);
  if (mode) return switchMode(s, mode, ctx, info);
  if (c === 'CONFIRM') return confirm(s, ctx, info);
  if (c === 'CANCEL') return cancel(s, info);
  return finish(s, ctx, info);
}

// ------------------------------------------------------------------ CONFIRM, CANCEL, FINISH

function confirm(s: StationState, ctx: StationCtx, info?: ScanInfo): Step {
  switch (s.mode) {
    case 'lookup':
      return done(say(s, 'info', 'Nothing to confirm in Look up mode.', info));
    case 'move': {
      const m = s.move;
      if (m.phase === 'confirm') return done(say(s, 'info', 'Saving…', info), true, { kind: 'save-move' });
      if (m.phase === 'unknown') return done(say(s, 'info', 'Checking the result…', info), true, { kind: 'recover-move' });
      if (m.phase === 'saving') return done(say(s, 'info', 'Already saving. One moment.', info));
      if (m.phase === 'rack') return done(say(s, 'error', `Scan the rack for ${m.pallet?.code} first.`, info), 'error');
      return done(say(s, 'error', 'Scan a pallet first, then its rack.', info), 'error');
    }
    case 'putaway': {
      const p = s.putaway;
      if (p.phase === 'rack') return done(say(s, 'error', 'Scan the rack first, then the pallets going onto it.', info), 'error');
      if (p.phase === 'saving') return done(say(s, 'info', 'Already saving. One moment.', info));
      if (p.phase === 'scanning') return finish(s, ctx, info);
      if (!p.lines.some((l) => l.intent && isSendable(l.result))) return done(say(s, 'info', 'Nothing left to save. Scan a rack to start the next put-away.', info));
      return done(say(s, 'info', 'Saving each pallet in turn…', info), true, { kind: 'save-putaway' });
    }
    case 'count': {
      const c = s.count;
      if (c.phase === 'rack') return done(say(s, 'error', 'Scan the rack you are counting first.', info), 'error');
      if (c.phase === 'scanning') return finish(s, ctx, info);
      if (c.busy) return done(say(s, 'info', 'Already saving. One moment.', info));
      const todo = c.report?.matched.filter((r) => isSendable(r.result)).length ?? 0;
      if (!todo) return done(say(s, 'info', 'No matched pallets left to confirm.', info));
      return done(say(s, 'info', `Confirming ${todo} matched pallet${todo === 1 ? '' : 's'}…`, info), true, { kind: 'confirm-count' });
    }
  }
}

function cancel(s: StationState, info?: ScanInfo): Step {
  switch (s.mode) {
    case 'lookup':
      return done(say({ ...s, lookup: null }, 'info', 'Cleared.', info));
    case 'move':
      if (s.move.phase === 'saving') return done(say(s, 'error', 'Wait for the save to finish.', info), 'error');
      if (s.move.phase === 'unknown') return done(say(s, 'error', 'Check the result first. The move may already be saved.', info), 'error');
      return done(say({ ...s, move: EMPTY_MOVE }, 'info', s.move.phase === 'pallet' ? 'Nothing to cancel.' : 'Cancelled. Nothing was saved.', info));
    case 'putaway': {
      const p = s.putaway;
      if (p.phase === 'saving') return done(say(s, 'error', 'Wait for the save to finish.', info), 'error');
      if (p.phase === 'review' && !p.lines.some((l) => l.result.status !== 'pending' && l.result.status !== 'blocked')) {
        return done(say({ ...s, putaway: { ...p, phase: 'scanning' } }, 'info', 'Back to scanning. The list is kept.', info));
      }
      const unsaved = p.lines.filter((l) => l.intent && isSendable(l.result)).length;
      return done(say({ ...s, putaway: EMPTY_PUTAWAY }, 'info', unsaved ? `Cancelled. ${unsaved} pallet${unsaved === 1 ? ' was' : 's were'} not saved.` : 'Ready for the next put-away.', info));
    }
    case 'count': {
      const c = s.count;
      if (c.busy) return done(say(s, 'error', 'Wait for the save to finish.', info), 'error');
      const touched = c.report && [...c.report.matched, ...c.report.missing, ...c.report.unexpected].some((r) => r.result.status !== 'pending');
      if (c.phase === 'review' && !touched) return done(say({ ...s, count: { ...c, phase: 'scanning', report: null } }, 'info', 'Back to scanning. Your scans are kept.', info));
      return done(say({ ...s, count: EMPTY_COUNT }, 'info', c.phase === 'rack' ? 'Nothing to cancel.' : 'Count closed.', info));
    }
  }
}

function finish(s: StationState, ctx: StationCtx, info?: ScanInfo): Step {
  if (s.mode === 'putaway') {
    const p = s.putaway;
    if (p.phase === 'rack') return done(say(s, 'error', 'Scan the rack first, then the pallets going onto it.', info), 'error');
    if (p.phase === 'review') return done(say(s, 'info', 'Scan Confirm or tap Save all to save this list.', info));
    if (p.phase !== 'scanning') return done(say(s, 'info', 'This put-away is already saved.', info));
    if (!p.lines.length) return done(say(s, 'error', `Scan at least one pallet for ${p.rack?.code} first.`, info), 'error');
    const n = p.lines.filter((l) => l.intent).length;
    return done(say({ ...s, putaway: { ...p, phase: 'review' } }, 'ok', `Review ${n} pallet${n === 1 ? '' : 's'}. Scan Confirm or tap Save all.`, info));
  }
  if (s.mode === 'count') {
    const c = s.count;
    if (c.phase === 'rack' || !c.rack) return done(say(s, 'error', 'Scan the rack you are counting first.', info), 'error');
    if (c.phase === 'review') return done(say(s, 'info', 'This count is already finished.', info));
    const report = classifyCount(c.rack, c.scanned, c.unknown, ctx.palletsAt(c.rack.id), ctx.codeOf);
    const tone: Tone = report.missing.length || report.unexpected.length || report.unknown.length ? 'warn' : 'ok';
    return done(say({ ...s, count: { ...c, phase: 'review', report } }, tone, countSummary(report), info));
  }
  return done(say(s, 'info', 'Finish is for Put-away and Count.', info));
}

export function countSummary(r: CountReport): string {
  const parts = [`${r.matched.length} matched`, `${r.missing.length} missing`, `${r.unexpected.length} unexpected`];
  if (r.unknown.length) parts.push(`${r.unknown.length} unknown`);
  return parts.join(', ');
}

// ------------------------------------------------------------------ Look up

function scanLookup(s: StationState, sc: Scanned, ctx: StationCtx, info: ScanInfo): Step {
  if (sc.type === 'pallet') {
    const p = sc.pallet;
    return done(say({ ...s, lookup: { type: 'pallet', id: p.id } }, p.hold || p.state === 'MISSING' ? 'warn' : 'ok', `${whereShort(p, ctx.codeOf)}${p.hold ? '. On hold' : ''}`, info));
  }
  if (sc.type === 'location') {
    const n = ctx.palletsAt(sc.location.id).length;
    return done(say({ ...s, lookup: { type: 'location', id: sc.location.id } }, 'ok', `${n} pallet${n === 1 ? '' : 's'} recorded here`, info));
  }
  if (sc.type === 'unknown') return done(say({ ...s, lookup: { type: 'unknown', raw: info.raw, message: sc.message } }, 'error', sc.message, info), 'error');
  return done(s);
}

// ------------------------------------------------------------------ Move

function holdNote(p: Pallet): Note | null {
  return p.hold ? { tone: 'warn', text: `On hold: ${asSentence(p.hold.reason)} Moving keeps the hold.` } : null;
}

function startMove(s: StationState, pallet: Pallet, info?: ScanInfo): Step {
  const b = moveBlocker(pallet);
  if (b) return done(say({ ...s, move: { ...EMPTY_MOVE, note: { tone: 'error', text: b.message } } }, 'error', b.message, info), 'error');
  const note = holdNote(pallet);
  return done(say({ ...s, move: { ...EMPTY_MOVE, phase: 'rack', pallet, note } }, note ? 'warn' : 'ok', note ? `${pallet.code} is on hold. Now scan the rack.` : 'Now scan the rack.', info));
}

function scanMove(s: StationState, sc: Scanned, ctx: StationCtx, info: ScanInfo): Step {
  const m = s.move;
  if (m.phase === 'saving') return done(say(s, 'error', 'Wait: saving the last move.', info), 'error');
  if (m.phase === 'unknown') return done(say(s, 'error', 'Check the result of the last move first. Scan Confirm or tap Check result.', info), 'error');
  if (sc.type === 'unknown') return done(say({ ...s, move: { ...m, note: { tone: 'error', text: sc.message } } }, 'error', sc.message, info), 'error');
  if (sc.type === 'command') return done(s);
  const fresh = m.phase === 'pallet' || m.phase === 'done' || m.phase === 'queued';

  if (sc.type === 'pallet') {
    if (fresh) return startMove(s, sc.pallet, info);
    if (m.pallet && sc.pallet.id === m.pallet.id) return done(say(s, 'info', `${sc.pallet.code} is already scanned. Now scan the rack.`, info));
    const next = m.phase === 'confirm' && m.rack ? `Scan ${m.rack.code} again to confirm, or Cancel to start over.` : `Scan the rack for ${m.pallet?.code}, or Cancel to start over.`;
    return done(say(s, 'error', `That is another pallet (${sc.pallet.code}). ${next}`, info), 'error');
  }

  // A location label.
  const loc = sc.location;
  if (fresh || !m.pallet) return done(say(s, 'error', 'Scan the pallet first. Then scan the rack.', info), 'error');
  if (m.phase === 'confirm' && m.rack && loc.id === m.rack.id) {
    if (ctx.confirmByRescan) return done(say(s, 'info', 'Confirmed by scanning the rack again. Saving…', info), true, { kind: 'save-move' });
    return done(say(s, 'info', 'Scan Confirm, press Enter or tap Confirm to save.', info));
  }
  const chk = intentFor(m.pallet, loc);
  if (!chk.ok) return done(say({ ...s, move: { ...m, note: { tone: 'error', text: chk.message } } }, 'error', chk.message, info), 'error');
  const changed = m.phase === 'confirm' && m.rack ? `Changed to ${loc.code}. ` : '';
  return done(say({ ...s, move: { ...m, phase: 'confirm', rack: loc, intent: chk.intent, note: holdNote(m.pallet) } }, 'ok', `${changed}${intentText(chk.intent, m.pallet, loc, ctx.codeOf)}.`, info));
}

function moveResult(s: StationState, r: LineResult, saved?: Pallet): Step {
  const m = s.move;
  const p = m.pallet;
  const rack = m.rack;
  if (!p || !rack || !m.intent) return done(s);
  const label = `${p.code} · ${rack.code}`;
  switch (r.status) {
    case 'saved': {
      const text = m.intent === 'place' ? `Placed at ${rack.code}` : m.intent === 'move' ? `Moved to ${rack.code}` : `Confirmed at ${rack.code}`;
      const note: Note = { tone: 'ok', text: `${text}${r.replayed ? ' (recovered from the saved receipt)' : ''}.` };
      const pallet = saved && saved.id === p.id ? saved : p;
      return done(logSave({ ...s, move: { ...m, phase: 'done', pallet, commandId: null, note }, flash: { tone: 'ok', text: `${p.code}: ${text}.` } }, 'ok', label, text));
    }
    case 'queued': {
      const note: Note = { tone: 'warn', text: `Queued on this device, not confirmed. It is sent when you reconnect. Until then the records keep ${p.code} where it was last confirmed.` };
      return done(
        logSave(
          { ...s, move: { ...m, phase: 'queued', commandId: null, note }, flash: { tone: 'warn', text: 'Queued, not confirmed. Scan the next pallet.' } },
          'warn',
          label,
          'Queued offline, not confirmed',
        ),
      );
    }
    case 'conflict': {
      const cur = r.current ?? p;
      const text = `Someone else changed ${p.code} first (now version ${cur.version}). Nothing was saved. Scan the rack again to decide with the newer record.`;
      return done(
        logSave({ ...s, move: { ...EMPTY_MOVE, phase: 'rack', pallet: cur, note: { tone: 'warn', text } }, flash: { tone: 'warn', text } }, 'warn', label, 'Conflict: changed by someone else'),
      );
    }
    case 'unknown':
      return done(
        logSave(
          {
            ...s,
            move: { ...m, phase: 'unknown', commandId: r.commandId, note: { tone: 'warn', text: `${r.message} The move may or may not be saved. Check the result before doing anything else.` } },
            flash: { tone: 'warn', text: 'No answer from the server. Check the result.' },
          },
          'warn',
          label,
          'No answer yet',
        ),
      );
    case 'failed':
    case 'blocked':
      return done(
        logSave(
          { ...s, move: { ...m, phase: 'confirm', commandId: null, note: { tone: 'error', text: r.message } }, flash: { tone: 'error', text: r.message } },
          'error',
          label,
          `Not saved: ${r.message}`,
        ),
      );
    default:
      return done(s);
  }
}

// ------------------------------------------------------------------ Put-away

function startPutaway(s: StationState, rack: Location, info?: ScanInfo): Step {
  if (!rack.active) return done(say(s, 'error', `${rack.code} is inactive. Choose an active location.`, info), 'error');
  return done(say({ ...s, putaway: { phase: 'scanning', rack, lines: [] } }, 'ok', `Put-away to ${rack.code}. Now scan each pallet going onto it.`, info));
}

function scanPutaway(s: StationState, sc: Scanned, ctx: StationCtx, info: ScanInfo): Step {
  const p = s.putaway;
  if (p.phase === 'saving') return done(say(s, 'error', 'Wait: saving the list.', info), 'error');
  if (sc.type === 'unknown') return done(say(s, 'error', sc.message, info), 'error');
  if (sc.type === 'location') {
    const loc = sc.location;
    if (p.phase === 'rack' || p.phase === 'done' || (p.phase === 'scanning' && p.lines.length === 0 && p.rack?.id !== loc.id)) return startPutaway(s, loc, info);
    if (p.rack && loc.id === p.rack.id) return done(say(s, 'info', `Already putting away to ${loc.code}. Keep scanning pallets, then scan Finish.`, info));
    const way = p.phase === 'review' ? 'Scan Confirm to save it' : 'Scan Finish to review it';
    return done(say(s, 'error', `This put-away is going to ${p.rack?.code}. ${way}, or Cancel to start over.`, info), 'error');
  }
  if (sc.type !== 'pallet') return done(s);
  if (p.phase === 'rack' || !p.rack) return done(say(s, 'error', 'Scan the rack first, then the pallets going onto it.', info), 'error');
  if (p.phase === 'done') return done(say(s, 'error', 'This put-away is saved. Scan a rack to start the next one.', info), 'error');
  if (p.lines.some((l) => l.key === sc.pallet.id)) return done(say(s, 'info', `${sc.pallet.code} is already on the list.`, info));
  const line = planLine(sc.pallet, p.rack, ctx.codeOf);
  const next: StationState = { ...s, putaway: { ...p, phase: 'scanning', lines: [...p.lines, line] } };
  if (!line.intent) return done(say(next, 'error', line.detail ?? 'Cannot go here.', info), 'error');
  return done(say(next, line.pallet.hold ? 'warn' : 'ok', `${line.what}.${line.pallet.hold ? ' It is on hold, and the hold stays on.' : ''}`, info));
}

function lineResult(s: StationState, list: 'putaway' | CountList, key: string, result: LineResult): Step {
  if (list === 'putaway') {
    const line = s.putaway.lines.find((l) => l.key === key);
    const lines = s.putaway.lines.map((l) => (l.key === key ? { ...l, result } : l));
    let next: StationState = { ...s, putaway: { ...s.putaway, lines } };
    if (line && result.status !== 'saving') {
      const text = resultText(result, line.intent);
      next = logSave({ ...next, flash: { tone: toneOf(result), text: `${line.pallet.code}: ${text}` } }, toneOf(result), `${line.pallet.code} · ${s.putaway.rack?.code ?? ''}`, text);
    }
    return done(next);
  }
  const report = s.count.report;
  if (!report) return done(s);
  const row = report[list].find((r) => r.key === key);
  const updated: CountReport = { ...report, [list]: report[list].map((r) => (r.key === key ? { ...r, result } : r)) };
  let next: StationState = { ...s, count: { ...s.count, report: updated } };
  if (row && result.status !== 'saving') {
    const text = resultText(result, result.status === 'skipped' ? null : row.fix);
    next = { ...next, flash: { tone: result.status === 'skipped' ? 'info' : toneOf(result), text: `${row.pallet.code}: ${text}` } };
    if (result.status !== 'skipped') next = logSave(next, toneOf(result), `${row.pallet.code} · ${s.count.rack?.code ?? ''}`, text);
  }
  return done(next);
}

export function toneOf(r: LineResult): Tone {
  switch (r.status) {
    case 'saved':
      return 'ok';
    case 'queued':
    case 'conflict':
    case 'unknown':
      return 'warn';
    case 'failed':
    case 'blocked':
      return 'error';
    default:
      return 'info';
  }
}

const FIX_DONE: Record<Fix, string> = { place: 'Placed', move: 'Moved', verify_location: 'Confirmed here', locate: 'Recorded as found', mark_missing: 'Marked missing' };

export function resultText(r: LineResult, fix: Fix | null): string {
  switch (r.status) {
    case 'pending':
      return 'Not saved yet';
    case 'saving':
      return 'Saving…';
    case 'saved':
      return `${fix ? FIX_DONE[fix] : 'Saved'}${r.version ? `, version ${r.version}` : ''}`;
    case 'queued':
      return 'Queued on this device, not confirmed';
    case 'conflict':
      return 'Changed by someone else first';
    case 'failed':
      return `Not saved: ${r.message}`;
    case 'unknown':
      return 'No answer yet. Check the result';
    case 'blocked':
      return r.message;
    case 'skipped':
      return 'Skipped';
  }
}

// ------------------------------------------------------------------ Count

function startCount(s: StationState, rack: Location, info?: ScanInfo): Step {
  if (!rack.active) return done(say(s, 'error', `${rack.code} is inactive. Choose an active location.`, info), 'error');
  return done(say({ ...s, count: { ...EMPTY_COUNT, phase: 'scanning', rack } }, 'ok', `Counting ${rack.code}. Scan every pallet on it, then scan Finish.`, info));
}

function scanCount(s: StationState, sc: Scanned, ctx: StationCtx, info: ScanInfo): Step {
  const c = s.count;
  if (c.busy) return done(say(s, 'error', 'Wait: saving.', info), 'error');
  const touched = !!c.report && [...c.report.matched, ...c.report.missing, ...c.report.unexpected].some((r) => r.result.status !== 'pending');

  if (sc.type === 'location') {
    const loc = sc.location;
    if (c.phase === 'rack') return startCount(s, loc, info);
    if (c.rack && loc.id === c.rack.id) return done(say(s, 'info', c.phase === 'review' ? `This count of ${loc.code} is finished.` : `Already counting ${loc.code}. Scan the pallets on it.`, info));
    if (c.phase === 'scanning') {
      if (!c.scanned.length && !c.unknown.length) return startCount(s, loc, info);
      return done(say(s, 'error', `You are counting ${c.rack?.code}. Scan Finish to compare, or Cancel to start over.`, info), 'error');
    }
    const todo = c.report?.matched.filter((r) => isSendable(r.result)).length ?? 0;
    if (todo) return done(say(s, 'error', `Confirm the ${todo} matched pallet${todo === 1 ? '' : 's'} on ${c.rack?.code} first (scan Confirm), or scan Cancel.`, info), 'error');
    return startCount(s, loc, info);
  }

  if (c.phase === 'rack' || !c.rack) {
    if (sc.type === 'unknown') return done(say(s, 'error', sc.message, info), 'error');
    return done(say(s, 'error', 'Scan the rack you are counting first, then every pallet on it.', info), 'error');
  }
  if (c.phase === 'review' && touched) return done(say(s, 'error', 'This count is finished. Scan a rack to start the next one.', info), 'error');
  const back: CountWork = c.phase === 'review' ? { ...c, phase: 'scanning', report: null } : c;

  if (sc.type === 'unknown') {
    if (back.unknown.some((u) => u.raw === info.raw)) return done(say({ ...s, count: back }, 'info', 'That unknown code is already noted.', info), 'error');
    return done(say({ ...s, count: { ...back, unknown: [...back.unknown, { raw: info.raw, message: sc.message }] } }, 'error', sc.message, info), 'error');
  }
  if (sc.type !== 'pallet') return done(s);
  if (back.scanned.some((p) => p.id === sc.pallet.id)) return done(say({ ...s, count: back }, 'info', `${sc.pallet.code} is already counted.`, info));
  const { list, row } = countRowFor(sc.pallet, c.rack, ctx.codeOf);
  const next: StationState = { ...s, count: { ...back, scanned: [...back.scanned, sc.pallet] } };
  return done(say(next, list === 'matched' ? 'ok' : 'warn', row.note, info));
}

// ------------------------------------------------------------------ the big prompt

export interface Prompt {
  text: string;
  sub: string;
  tone: Tone | 'idle';
}

export function promptFor(s: StationState, ctx: Pick<StationCtx, 'confirmByRescan'>): Prompt {
  switch (s.mode) {
    case 'lookup':
      return { text: 'Scan any pallet or rack', sub: 'Every scan shows where it was last confirmed and what is on record.', tone: 'idle' };
    case 'move': {
      const m = s.move;
      if (m.phase === 'pallet') return { text: 'Scan a pallet', sub: 'Then scan the rack it is going to.', tone: 'idle' };
      if (m.phase === 'rack') return { text: 'Now scan the rack', sub: `${m.pallet?.code} · ${m.pallet?.description}`, tone: 'idle' };
      if (m.phase === 'confirm') {
        const again = m.intent === 'verify_location' ? `Scan ${m.rack?.code} again to confirm it is still here` : `Scan ${m.rack?.code} again to confirm`;
        return ctx.confirmByRescan
          ? { text: again, sub: 'Or scan Confirm, press Enter, or tap Confirm.', tone: 'idle' }
          : { text: 'Scan Confirm to save', sub: 'Or press Enter, or tap Confirm.', tone: 'idle' };
      }
      if (m.phase === 'saving') return { text: 'Saving…', sub: 'Waiting for the server to confirm.', tone: 'info' };
      if (m.phase === 'unknown') return { text: 'Check the result', sub: 'No answer from the server. Scan Confirm or tap Check result.', tone: 'warn' };
      if (m.phase === 'queued') return { text: 'Queued. Scan the next pallet', sub: 'Saved on this device only, not confirmed yet.', tone: 'warn' };
      // The result itself is in the flash and on the card; saying it a third time here only adds noise.
      return { text: 'Saved. Scan the next pallet', sub: '', tone: 'ok' };
    }
    case 'putaway': {
      const p = s.putaway;
      const n = p.lines.length;
      if (p.phase === 'rack') return { text: 'Scan the rack first', sub: 'Then scan every pallet going onto it.', tone: 'idle' };
      if (p.phase === 'scanning') return { text: n ? 'Scan the next pallet' : 'Now scan the pallets', sub: `${n} on the list for ${p.rack?.code}. Scan Finish when done.`, tone: 'idle' };
      if (p.phase === 'review') return { text: `Save ${p.lines.filter((l) => l.intent).length} to ${p.rack?.code}?`, sub: 'Scan Confirm or tap Save all. Cancel goes back to scanning.', tone: 'idle' };
      if (p.phase === 'saving') {
        const doneN = p.lines.filter((l) => l.result.status !== 'pending' && l.result.status !== 'saving').length;
        return { text: `Saving ${Math.min(doneN + 1, n)} of ${n}`, sub: 'Each pallet is saved in turn with the version you scanned.', tone: 'info' };
      }
      const problems = p.lines.filter((l) => !isFinal(l.result)).length;
      if (problems) return { text: `${problems} need${problems === 1 ? 's' : ''} attention`, sub: 'See the list. Scan a rack to start the next put-away.', tone: 'warn' };
      if (p.lines.some((l) => l.result.status === 'queued')) return { text: 'Put-away queued', sub: 'Saved on this device only, not confirmed. It is sent when you reconnect.', tone: 'warn' };
      return { text: 'Put-away saved', sub: 'Scan a rack to start the next one.', tone: 'ok' };
    }
    case 'count': {
      const c = s.count;
      if (c.phase === 'rack') return { text: 'Scan the rack to count', sub: 'Then scan every pallet physically on it.', tone: 'idle' };
      if (c.phase === 'scanning') {
        const n = c.scanned.length + c.unknown.length;
        return { text: n ? 'Scan the next pallet' : `Scan every pallet on ${c.rack?.code}`, sub: `${n} scanned on ${c.rack?.code}. Scan Finish to compare with the records.`, tone: 'idle' };
      }
      const r = c.report!;
      const todo = r.matched.filter((x) => isSendable(x.result)).length;
      if (c.busy) return { text: 'Saving…', sub: 'Each pallet is saved in turn with the version you scanned.', tone: 'info' };
      if (todo) return { text: `Confirm ${todo} matched`, sub: 'Scan Confirm or tap Confirm all to record a location check for each.', tone: 'idle' };
      const clean = !r.missing.length && !r.unexpected.length && !r.unknown.length;
      return { text: clean ? 'Count matches the records' : `Count of ${c.rack?.code} done`, sub: `${countSummary(r)}. Scan a rack to count the next one.`, tone: clean ? 'ok' : 'warn' };
    }
  }
}

/** Work that would be lost by leaving the screen, for the leave warning. */
export function unsavedWork(s: StationState): string | null {
  const put = s.putaway.lines.filter((l) => l.intent && isSendable(l.result)).length;
  if (put && s.putaway.phase !== 'done') return `${put} pallet${put === 1 ? '' : 's'} in the put-away to ${s.putaway.rack?.code} ${put === 1 ? 'is' : 'are'} not saved.`;
  if (s.count.phase === 'scanning' && s.count.scanned.length) return `Your count of ${s.count.rack?.code} is not finished.`;
  const todo = s.count.report?.matched.filter((r) => isSendable(r.result)).length ?? 0;
  if (todo) return `${todo} matched pallet${todo === 1 ? '' : 's'} from the count of ${s.count.rack?.code} ${todo === 1 ? 'is' : 'are'} not confirmed.`;
  if (s.move.phase === 'confirm') return `The move of ${s.move.pallet?.code} is not confirmed.`;
  return null;
}
