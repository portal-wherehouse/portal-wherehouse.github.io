// Command barcodes: printed codes that tell the app what to do, so someone holding a scanner never has to
// touch the screen. A scanner reads them like any other label. Format: "CMD:" + the command name.

export type ScanCommand = 'CONFIRM' | 'CANCEL' | 'FINISH' | 'MODE_LOOKUP' | 'MODE_MOVE' | 'MODE_PUTAWAY' | 'MODE_COUNT';

export const COMMAND_PREFIX = 'CMD:';

export const SCAN_COMMANDS: { id: ScanCommand; label: string; hint: string }[] = [
  { id: 'CONFIRM', label: 'Confirm', hint: 'Save what is on screen, like pressing the Confirm button.' },
  { id: 'CANCEL', label: 'Cancel', hint: 'Start the current scan over. Nothing is saved.' },
  { id: 'FINISH', label: 'Finish', hint: 'End a put-away or a count and review the results.' },
  { id: 'MODE_LOOKUP', label: 'Look up mode', hint: 'Scan station: every scan shows where that pallet or rack is.' },
  { id: 'MODE_MOVE', label: 'Move mode', hint: 'Scan station: scan a pallet, then its new rack.' },
  { id: 'MODE_PUTAWAY', label: 'Put-away mode', hint: 'Scan station: scan one rack, then every pallet going onto it.' },
  { id: 'MODE_COUNT', label: 'Count mode', hint: 'Scan station: scan a rack, then everything on it, to check the records.' },
];

export function commandPayload(c: ScanCommand): string {
  return `${COMMAND_PREFIX}${c}`;
}

/** Returns the command a scan carries, or null when the scan is an ordinary label or code. */
export function parseScanCommand(text: string): ScanCommand | null {
  const t = text.trim().toUpperCase();
  if (!t.startsWith(COMMAND_PREFIX)) return null;
  const name = t.slice(COMMAND_PREFIX.length);
  return SCAN_COMMANDS.some((c) => c.id === name) ? (name as ScanCommand) : null;
}
