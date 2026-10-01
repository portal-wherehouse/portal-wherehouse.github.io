// Transfers between warehouses of one account: numbering, which pallets can go, and how a transfer's status
// follows its lines. Pure, so the engine, the screens and the tests share one set of rules.

import { STATE_LABEL } from './display';
import type { Pallet, Transfer, TransferLine, TransferLineStatus, TransferStatus } from './types';

/** Most pallets on one transfer, and on a "Transfer now" that sends and receives in one step. */
export const MAX_TRANSFER_LINES = 50;
export const MAX_TRANSFER_NOW_LINES = 20;

export function formatTransferNumber(n: number): string {
  return `TR-${String(n).padStart(4, '0')}`;
}

/** TR-0001 as printed, typed (tr1, TR 0001) or scanned from the slip; null when it is not a transfer number. */
export function parseTransferNumber(text: string): string | null {
  const m = /^\s*TR[\s-]?0*(\d{1,9})\s*$/i.exec(text);
  return m ? formatTransferNumber(Number(m[1])) : null;
}

/** Why a pallet cannot go on a transfer, or null when it can. */
export function transferBlocker(pallet: Pallet): string | null {
  if (pallet.archived_at) return `${pallet.code} is archived.`;
  if (pallet.state === 'IN_TRANSIT') return `${pallet.code} is already on ${pallet.transfer?.number ?? 'another transfer'}.`;
  if (pallet.state !== 'STORED' && pallet.state !== 'RECEIVED') return `${pallet.code} is ${STATE_LABEL[pallet.state].toLowerCase()}. Only stored pallets and pallets awaiting placement can be transferred.`;
  if (pallet.hold) return `${pallet.code} is on hold (${pallet.hold.reason}). Clear the hold before sending it.`;
  return null;
}

/** The status a sent transfer has, given its lines. */
export function statusFromLines(lines: TransferLine[], current: TransferStatus): TransferStatus {
  if (current === 'DRAFT' || current === 'CANCELLED') return current;
  const live = lines.filter((l) => l.status !== 'RETURNED');
  const received = live.filter((l) => l.status === 'RECEIVED').length;
  if (live.length && received === live.length) return 'RECEIVED';
  return received ? 'PARTLY_RECEIVED' : 'IN_TRANSIT';
}

export function isOpenTransfer(t: Pick<Transfer, 'status'>): boolean {
  return t.status === 'DRAFT' || t.status === 'IN_TRANSIT' || t.status === 'PARTLY_RECEIVED';
}

/** Sent and still waiting for at least one pallet at the destination. */
export function isOnTheWay(t: Pick<Transfer, 'status'>): boolean {
  return t.status === 'IN_TRANSIT' || t.status === 'PARTLY_RECEIVED';
}

export const TRANSFER_STATUS_LABEL: Record<TransferStatus, string> = {
  DRAFT: 'Draft',
  IN_TRANSIT: 'In transit',
  PARTLY_RECEIVED: 'Partly received',
  RECEIVED: 'Received',
  CANCELLED: 'Cancelled',
};

export const LINE_STATUS_LABEL: Record<TransferLineStatus, string> = {
  WAITING: 'Not sent yet',
  IN_TRANSIT: 'In transit',
  RECEIVED: 'Received',
  RETURNED: 'Back at origin',
};

/** Label tokens and codes of the lines: what a scan in either warehouse is matched against. */
export function transferKeys(lines: TransferLine[]): string[] {
  const keys = new Set<string>();
  for (const l of lines) {
    keys.add(l.code);
    if (l.label_token) keys.add(l.label_token);
  }
  return [...keys];
}

/** The line a scanned label token or typed pallet code points at, if any. */
export function lineForScan(t: Transfer, token: string | null, code: string | null): TransferLine | null {
  return t.lines.find((l) => (token && l.label_token === token) || (code && l.code === code)) ?? null;
}
