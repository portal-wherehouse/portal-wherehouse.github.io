// Move scanner state machine (blueprint pages 12, 34 ticket A05).
// EXPECT_PALLET -> EXPECT_LOCATION -> REVIEW -> SUBMITTING -> RESULT, with explicit
// CONFLICT, UNKNOWN (lost response), and BLOCKED outcomes. Pure, so it is unit-tested directly.

import { moveBlocker } from '../../domain/transitions';
import type { CommandResult, Location, Pallet } from '../../domain/types';
import { asSentence } from '../station/logic';

export type MoveStage = 'EXPECT_PALLET' | 'EXPECT_LOCATION' | 'REVIEW' | 'SUBMITTING' | 'RESULT' | 'CONFLICT' | 'UNKNOWN' | 'QUEUED';

export type MoveIntent = 'place' | 'move' | 'verify_location';

export interface MoveState {
  stage: MoveStage;
  pallet: Pallet | null;
  destination: Location | null;
  intent: MoveIntent | null;
  /** Generated once per decision and reused for every retry of that decision. */
  commandId: string | null;
  message: { tone: 'info' | 'warn' | 'error' | 'ok'; text: string } | null;
  blockedRoute: 'return' | 'locate' | 'transfer' | null;
  result: CommandResult | null;
  /** The last raw scan, to ignore repeated frames of the same label. */
  lastScan: { text: string; at: number } | null;
}

export const initialMove: MoveState = {
  stage: 'EXPECT_PALLET',
  pallet: null,
  destination: null,
  intent: null,
  commandId: null,
  message: null,
  blockedRoute: null,
  result: null,
  lastScan: null,
};

export type MoveEvent =
  | { type: 'SCAN_PALLET'; pallet: Pallet; raw: string; at: number }
  | { type: 'SCAN_LOCATION'; location: Location; raw: string; at: number }
  | { type: 'UPDATE_PALLET'; pallet: Pallet }
  | { type: 'SCAN_ERROR'; text: string; raw?: string; at?: number }
  | { type: 'CONFIRM'; commandId: string }
  | { type: 'ACCEPTED'; result: CommandResult }
  | { type: 'REJECTED'; result: CommandResult }
  | { type: 'LOST' }
  | { type: 'QUEUED' }
  | { type: 'CANCEL_REVIEW' }
  | { type: 'RESET' }
  | { type: 'REFRESH_PALLET'; pallet: Pallet };

/** Repeated frames of the same label within this window are ignored. */
export const REPEAT_WINDOW_MS = 2500;

function isRepeat(s: MoveState, raw: string, at: number): boolean {
  return !!s.lastScan && s.lastScan.text === raw && at - s.lastScan.at < REPEAT_WINDOW_MS;
}

export function moveReducer(s: MoveState, e: MoveEvent): MoveState {
  switch (e.type) {
    case 'SCAN_PALLET': {
      if (isRepeat(s, e.raw, e.at)) return s;
      const scanned = { text: e.raw, at: e.at };
      if (s.stage === 'EXPECT_PALLET') {
        const b = moveBlocker(e.pallet);
        if (b) return { ...s, lastScan: scanned, message: { tone: 'error', text: b.message }, blockedRoute: b.route ?? null, pallet: e.pallet };
        return {
          ...s,
          stage: 'EXPECT_LOCATION',
          pallet: e.pallet,
          blockedRoute: null,
          lastScan: scanned,
          message: e.pallet.hold ? { tone: 'warn', text: `On hold: ${asSentence(e.pallet.hold.reason)} Moving keeps the hold.` } : null,
        };
      }
      if (s.stage === 'EXPECT_LOCATION') {
        if (s.pallet && e.pallet.id === s.pallet.id) return { ...s, lastScan: scanned };
        return { ...s, lastScan: scanned, message: { tone: 'error', text: `That is a pallet label (${e.pallet.code}). Scan the rack or location label for ${s.pallet?.code}.` } };
      }
      return { ...s, lastScan: scanned };
    }
    case 'SCAN_LOCATION': {
      if (isRepeat(s, e.raw, e.at)) return s;
      const scanned = { text: e.raw, at: e.at };
      if (s.stage === 'EXPECT_PALLET') return { ...s, lastScan: scanned, message: { tone: 'error', text: 'Scan the pallet first. Then scan the rack.' } };
      if (s.stage !== 'EXPECT_LOCATION' || !s.pallet) return { ...s, lastScan: scanned };
      if (!e.location.active) return { ...s, lastScan: scanned, message: { tone: 'error', text: `${e.location.code} is inactive. Choose an active location.` } };
      const p = s.pallet;
      let intent: MoveIntent = p.state === 'RECEIVED' ? 'place' : 'move';
      if (p.state === 'STORED' && p.current_location_id === e.location.id) intent = 'verify_location';
      return { ...s, stage: 'REVIEW', destination: e.location, intent, lastScan: scanned, message: null };
    }
    case 'SCAN_ERROR':
      if (e.raw && e.at !== undefined && isRepeat(s, e.raw, e.at)) return s;
      return { ...s, message: { tone: 'error', text: e.text }, lastScan: e.raw && e.at !== undefined ? { text: e.raw, at: e.at } : s.lastScan };
    case 'CONFIRM':
      if (s.stage !== 'REVIEW' && s.stage !== 'UNKNOWN') return s;
      // A retry after a lost response keeps the original command ID.
      return { ...s, stage: 'SUBMITTING', commandId: s.commandId ?? e.commandId, message: null };
    case 'ACCEPTED':
      return { ...s, stage: 'RESULT', result: e.result, pallet: e.result.ok ? e.result.current_state : s.pallet, message: null };
    case 'REJECTED': {
      const r = e.result;
      if (r.ok) return s;
      if (r.code === 'VERSION_CONFLICT') {
        return {
          ...s,
          stage: 'CONFLICT',
          result: r,
          pallet: r.current ?? s.pallet,
          commandId: null,
          message: { tone: 'warn', text: r.message },
        };
      }
      return { ...s, stage: 'REVIEW', result: r, commandId: null, message: { tone: 'error', text: r.message } };
    }
    case 'LOST':
      return { ...s, stage: 'UNKNOWN', message: { tone: 'warn', text: 'No answer from the server. The move may or may not be saved. Check the result before trying anything else.' } };
    case 'QUEUED':
      return { ...s, stage: 'QUEUED', message: null };
    case 'CANCEL_REVIEW':
      return { ...s, stage: s.pallet ? 'EXPECT_LOCATION' : 'EXPECT_PALLET', destination: null, intent: null, commandId: null, message: null, lastScan: null };
    case 'REFRESH_PALLET':
      // After a conflict the user makes a fresh decision against the newer state.
      return { ...initialMove, stage: 'EXPECT_LOCATION', pallet: e.pallet, message: { tone: 'info', text: `Refreshed ${e.pallet.code}. Scan the destination again to decide.` } };
    case 'UPDATE_PALLET':
      // The same pallet with new details (a weight added mid-move); the move itself carries on.
      return s.pallet && s.pallet.id === e.pallet.id ? { ...s, pallet: e.pallet, message: null } : s;
    case 'RESET':
      return { ...initialMove };
  }
}
