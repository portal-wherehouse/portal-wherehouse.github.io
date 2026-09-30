// Scan station side panel: the "type a code" box, the tray of pretend test labels, and the session log.

import { useMemo, useRef, useState, type MouseEvent } from 'react';
import { useApp } from '../../app/state';
import { makeLabelPayload } from '../../domain/codes';
import type { Location, Pallet } from '../../domain/types';
import { commandPayload, SCAN_COMMANDS, type ScanCommand } from '../../device/scanCommands';
import { stripScanPrefix, useScanRouter, type ScanSource } from '../../device/scanRouter';
import { createTypingMeter } from '../../device/wedge';
import { Icon, type IconName } from '../../ui/icons';
import type { LogEntry, StationMode, StationState, Tone } from './logic';

// ------------------------------------------------------------------ type a code

/** A scanner that ends each code with CR and LF presses Enter twice; the second lands on the box the first one emptied. */
const SECOND_ENTER_MS = 300;

export function TypeCode({ onEmptyEnter }: { onEmptyEnter: () => void }) {
  const { emit, settings } = useScanRouter();
  const [code, setCode] = useState('');
  const meter = useRef(createTypingMeter());
  const lastSubmit = useRef(0);
  return (
    <form
      className="panel st-type"
      data-tour="station-type"
      onSubmit={(e) => {
        e.preventDefault();
        const text = code.trim();
        if (!text) {
          if (Date.now() - lastSubmit.current >= SECOND_ENTER_MS) onEmptyEnter();
          return;
        }
        lastSubmit.current = Date.now();
        // A scanner typing into this box still counts as a scanner, and its prefix comes off as it does for any scan.
        const m = meter.current.result(text, settings);
        meter.current.reset();
        setCode('');
        emit(m.fromScanner ? stripScanPrefix(text, settings.prefix) : text, m.fromScanner ? 'wedge' : 'typed', { durationMs: m.durationMs });
      }}
    >
      <label htmlFor="st-code" className="st-type-label">
        <Icon name="keyboard" /> Type a code
      </label>
      <div className="row nowrap">
        <input
          id="st-code"
          className="input code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => {
            if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) meter.current.key(e.timeStamp, e.currentTarget.value === '');
          }}
          placeholder="P-000042"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          enterKeyHint="go"
        />
        <button className="btn primary" type="submit">
          Enter
        </button>
      </div>
      <p className="st-hint">Works exactly like a scan. Enter on an empty box confirms.</p>
    </form>
  );
}

// ------------------------------------------------------------------ test labels

interface TestLabel {
  key: string;
  code: string;
  sub?: string;
  text: string;
  kind: 'rack' | 'pallet' | 'command' | 'other';
}

const TRAY_KEY = 'wh.station.tray';

function readTray(): boolean {
  try {
    return localStorage.getItem(TRAY_KEY) !== 'closed';
  } catch {
    return true;
  }
}

function writeTray(open: boolean) {
  try {
    localStorage.setItem(TRAY_KEY, open ? 'open' : 'closed');
  } catch {
    /* per-viewer convenience only */
  }
}

export function TestLabels({ s, onTapped }: { s: StationState; onTapped?: (e: MouseEvent) => void }) {
  const { backend, workspaceId, v } = useApp();
  const { emit } = useScanRouter();
  const [open, setOpen] = useState(readTray);
  const mode = s.mode;
  const rackId = mode === 'count' ? s.count.rack?.id : mode === 'putaway' ? s.putaway.rack?.id : null;

  const groups = useMemo(() => {
    const e = backend.reader;
    if (!workspaceId) return null;
    const label = (target: Pallet | Location, kind: 'P' | 'L', code: string) => {
      const token = e.activeLabel(target.id)?.token;
      return token ? makeLabelPayload(kind, token) : code;
    };
    const codeOf = (id: string | null) => (id ? (e.db.locations[id]?.code ?? '?') : '?');
    const racks: TestLabel[] = Object.values(e.db.locations)
      .filter((l) => l.workspace_id === workspaceId && l.active)
      .sort((a, b) => (a.kind === 'RACK' ? 0 : 1) - (b.kind === 'RACK' ? 0 : 1) || a.code.localeCompare(b.code))
      .map((l) => ({ key: l.id, code: l.code, sub: l.kind === 'RACK' ? undefined : l.kind.toLowerCase(), text: label(l, 'L', l.code), kind: 'rack' }));

    const all = Object.values(e.db.pallets)
      .filter((p) => p.workspace_id === workspaceId && !p.archived_at)
      .sort((a, b) => a.code.localeCompare(b.code));
    const stored = all.filter((p) => p.state === 'STORED');
    const received = all.filter((p) => p.state === 'RECEIVED');
    const asLabel = (p: Pallet, sub: string): TestLabel => ({ key: p.id, code: p.code, sub, text: label(p, 'P', p.code), kind: 'pallet' });
    const where = (p: Pallet) => (p.state === 'STORED' ? `at ${codeOf(p.current_location_id)}` : p.state === 'RECEIVED' ? 'not placed' : p.state.toLowerCase());

    let pallets: TestLabel[];
    let title = 'Pallets';
    if (mode === 'count' && rackId) {
      const here = stored.filter((p) => p.current_location_id === rackId);
      const others = stored.filter((p) => p.current_location_id !== rackId).slice(0, 2);
      pallets = [...here.map((p) => asLabel(p, 'on record here')), ...others.map((p) => asLabel(p, where(p))), ...received.slice(0, 1).map((p) => asLabel(p, 'not placed'))];
      title = `Pallets (${here.length} on record at ${codeOf(rackId)})`;
    } else if (mode === 'putaway') {
      pallets = [...received.slice(0, 4), ...stored.filter((p) => p.current_location_id !== rackId).slice(0, 4)].map((p) => asLabel(p, where(p)));
    } else if (mode === 'lookup') {
      const odd = all.filter((p) => p.state === 'MISSING' || p.state === 'DISPATCHED').slice(0, 2);
      pallets = [...stored.slice(0, 4), ...received.slice(0, 2), ...odd].map((p) => asLabel(p, where(p)));
    } else {
      pallets = [...received.slice(0, 3), ...stored.slice(0, 5)].map((p) => asLabel(p, where(p)));
    }

    const cmdList: ScanCommand[] = ['CONFIRM', 'CANCEL', 'FINISH', 'MODE_LOOKUP', 'MODE_MOVE', 'MODE_PUTAWAY', 'MODE_COUNT'];
    const commands: TestLabel[] = cmdList.map((c) => ({ key: c, code: SCAN_COMMANDS.find((x) => x.id === c)!.label, sub: commandPayload(c), text: commandPayload(c), kind: 'command' }));
    const other: TestLabel[] = [{ key: 'unknown', code: 'P-999999', sub: 'not on record', text: 'P-999999', kind: 'other' }];
    return { racks, pallets, title, commands, other };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backend, workspaceId, v, backend.network, mode, rackId]);

  if (!groups) return null;
  const tap = (l: TestLabel, e: MouseEvent) => {
    emit(l.text, 'demo');
    onTapped?.(e);
  };

  return (
    <details
      className="panel st-tray"
      open={open}
      onToggle={(e) => {
        const next = e.currentTarget.open;
        setOpen(next);
        writeTray(next);
      }}
      data-tour="station-labels"
    >
      <summary>
        <Icon name="qr" />
        <span className="st-tray-title">Test labels</span>
        <span className="st-tray-note">Tap to scan</span>
        <Icon name="chevronDown" className="chev" />
      </summary>
      <div className="st-tray-body">
        <p className="st-hint">Pretend labels for real racks and pallets in this warehouse. A tap sends the label’s code exactly as a scanner would.</p>
        <TrayGroup title="Racks and areas" items={groups.racks} cols="narrow" onTap={tap} />
        <TrayGroup title={groups.title} items={groups.pallets} onTap={tap} />
        <TrayGroup title="Command barcodes" items={groups.commands} cols="single" onTap={tap} />
        <TrayGroup title="Unknown codes" items={groups.other} onTap={tap} />
      </div>
    </details>
  );
}

/** `single` lays every label out full width in one column (command barcodes, whose names vary a lot in length). */
function TrayGroup({ title, items, cols, onTap }: { title: string; items: TestLabel[]; cols?: 'narrow' | 'single'; onTap: (l: TestLabel, e: MouseEvent) => void }) {
  if (!items.length) return null;
  return (
    <div className="st-tray-group">
      <h4>{title}</h4>
      <div className={`st-tray-items ${cols ?? ''}`}>
        {items.map((l) => (
          <button key={l.key} type="button" className={`st-tl ${l.kind} ${cols !== 'single' && l.code.length > 9 ? 'wide' : ''}`} onClick={(e) => onTap(l, e)} title={`Send ${l.text}`}>
            <span className="st-tl-code">{l.code}</span>
            {l.sub && <small>{l.sub}</small>}
          </button>
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ session log

const TONE_ICON: Record<Tone, IconName> = { ok: 'checkCircle', info: 'info', warn: 'alert', error: 'alertCircle' };
const SOURCE_LABEL: Record<ScanSource, string> = { wedge: 'Scanner', serial: 'Serial scanner', camera: 'Camera', photo: 'Photo', typed: 'Typed', demo: 'Test label' };
const MODE_SHORT: Record<StationMode, string> = { lookup: 'Look up', move: 'Move', putaway: 'Put-away', count: 'Count' };

function clock(at: number): string {
  return new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });
}

export function SessionLog({ log, mode, onClear }: { log: LogEntry[]; mode: StationMode; onClear: () => void }) {
  const [all, setAll] = useState(false);
  const shown = all ? log : log.slice(0, 10);
  const scans = log.filter((l) => l.kind === 'scan').length;
  return (
    <section className="panel st-log" data-tour="station-log" aria-label="Session log">
      <div className="st-log-head">
        <Icon name="history" />
        <h2>Session log</h2>
        <span className="st-log-count">
          {scans} scan{scans === 1 ? '' : 's'}
        </span>
        <span className="grow" />
        {log.length > 0 && (
          <button className="btn ghost small" onClick={onClear}>
            Clear
          </button>
        )}
      </div>
      {log.length === 0 ? (
        <p className="st-hint">Every scan and every save appears here with its result, newest first. Right now the station is in {MODE_SHORT[mode]} mode.</p>
      ) : (
        <ol className="st-log-list">
          {shown.map((en) => (
            <li key={en.id} className={`st-log-item ${en.tone} ${en.kind}`}>
              <span className="st-log-icon">
                <Icon name={en.kind === 'save' && en.tone === 'ok' ? 'check' : TONE_ICON[en.tone]} width={18} height={18} />
              </span>
              <div className="st-log-body">
                <div className="st-log-label">{en.label}</div>
                <div className="st-log-text">{en.text}</div>
              </div>
              <div className="st-log-meta">
                <time dateTime={new Date(en.at).toISOString()}>{clock(en.at)}</time>
                <span>{en.kind === 'save' ? 'Result' : en.source ? SOURCE_LABEL[en.source] : ''}</span>
              </div>
            </li>
          ))}
        </ol>
      )}
      {log.length > 10 && (
        <button className="btn ghost small" onClick={() => setAll((x) => !x)}>
          {all ? 'Show fewer' : `Show all ${log.length}`}
        </button>
      )}
    </section>
  );
}
