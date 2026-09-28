// Scanner setup: live status, a test pad, scanner settings, serial scanners, setup guides, troubleshooting,
// and a printable sheet of command barcodes. Hardware scanners work everywhere in the portal; this is where you tune them.

import { useEffect, useState } from 'react';
import { BRAND } from '../../brand';
import { DEFAULT_SCANNER_SETTINGS, useScanRouter, type ScannerSettings } from '../../device/scanRouter';
import { useSerialStatus } from '../../device/serial';
import { playScanSound, soundsSupported } from '../../device/sounds';
import { Icon, type IconName } from '../../ui/icons';
import { Explain, Field, PageHead, fmtAgo } from '../../ui/ui';
import { CommandSheet } from './CommandSheet';
import { RecommendedSettings, SetupGuides, Troubleshooting } from './ScannerGuides';
import { SerialPanel } from './SerialPanel';
import { SOURCE_LABEL, TestPad } from './TestPad';
import './scanners.css';

export function Scanners() {
  return (
    <div className="stack scn-page">
      <PageHead
        eyebrow="Hardware"
        title="Scanners"
        sub="Use USB and Bluetooth barcode scanners anywhere in the portal. Scan a label and the right screen opens."
        actions={
          <button type="button" className="btn" onClick={() => document.getElementById('command-sheet')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
            <Icon name="barcode" /> Command barcodes
          </button>
        }
      />

      <Explain>
        <p>
          Most barcode scanners act as a keyboard: they type what they read, then press Enter. {BRAND.name} listens for that everywhere in the portal and tells a scanner from a person by speed.
          A scanner types a whole code in a few milliseconds; people type far slower, so your typing is never mistaken for a scan.
        </p>
        <ul>
          <li>
            <strong>A screen that is waiting for a scan gets it first.</strong> On Move, a scan fills in the pallet, then the rack. On the Scan station, it follows the station’s mode.
          </li>
          <li>
            <strong>Anywhere else, Scan anywhere opens what you scanned:</strong> a pallet, a rack, a job’s pallets, or the Scan station for a mode barcode.
          </li>
          <li>
            <strong>A text box with the cursor gets the characters</strong>, like normal typing. Click an empty part of the page to send scans to the portal instead.
          </li>
          <li>Scanners in serial mode, the phone camera, photos and typed codes all end up in the same place, so every screen treats them alike.</li>
        </ul>
      </Explain>

      <StatusStrip />
      <TestPad />

      <div className="grid-2 scn-cols">
        <SettingsPanel />
        <div className="stack">
          <SerialPanel />
          <SoundPanel />
        </div>
      </div>

      <div className="grid-2 scn-cols">
        <SetupGuides />
        <div className="stack">
          <RecommendedSettings />
          <Troubleshooting />
        </div>
      </div>

      <CommandSheet />
    </div>
  );
}

// ------------------------------------------------------------------ status

function useTick(ms: number) {
  const [, setN] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setN((n) => n + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
}

function Tile({ label, icon, value, note, tone }: { label: string; icon: IconName; value: React.ReactNode; note?: React.ReactNode; tone?: 'ok' | 'off' }) {
  return (
    <div className={`scn-stat ${tone ? `is-${tone}` : ''}`}>
      <span className="scn-stat-label">
        <Icon name={icon} width={16} height={16} /> {label}
      </span>
      <span className="scn-stat-value">{value}</span>
      {note && <span className="scn-stat-note">{note}</span>}
    </div>
  );
}

function StatusStrip() {
  const { settings, recent, sessionCount } = useScanRouter();
  const serial = useSerialStatus();
  useTick(15000);
  const last = recent[0];
  return (
    <div className="scn-stats" role="group" aria-label="Scanner status">
      <Tile
        label="Keyboard scanners"
        icon="scanner"
        tone={settings.wedge ? 'ok' : 'off'}
        value={
          <>
            <span className="scn-dot" aria-hidden="true" /> {settings.wedge ? 'Listening' : 'Off'}
          </>
        }
        note={settings.wedge ? 'USB and Bluetooth, on every screen' : 'Turn on in Scanner settings'}
      />
      <Tile
        label="Last scan"
        icon="history"
        value={last ? <span className="scn-stat-code">{last.text}</span> : 'None yet'}
        note={last ? `${SOURCE_LABEL[last.source]}, ${fmtAgo(new Date(last.at).toISOString())}` : 'Scan something to see it here'}
      />
      <Tile label="Scans this session" icon="stack" value={<span className="num">{sessionCount}</span>} note="Since this tab opened the portal" />
      <Tile
        label="Serial scanner"
        icon="plug"
        tone={serial.state === 'connected' ? 'ok' : undefined}
        value={serial.state === 'connected' ? 'Connected' : serial.state === 'unsupported' ? 'Not available' : 'Not connected'}
        note={serial.state === 'connected' ? `${serial.lines} ${serial.lines === 1 ? 'code' : 'codes'} read` : 'Optional'}
      />
    </div>
  );
}

// ------------------------------------------------------------------ settings

const SUFFIXES: [ScannerSettings['suffix'], string][] = [
  ['enter', 'Enter'],
  ['tab', 'Tab'],
  ['either', 'Enter or Tab'],
  ['none', 'Nothing'],
];

function NumberField({ id, label, hint, value, min, max, step, unit, onCommit }: { id: string; label: string; hint: React.ReactNode; value: number; min: number; max: number; step: number; unit: string; onCommit: (n: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const n = Number(draft);
  const invalid = draft.trim() === '' || !Number.isFinite(n) || n < min || n > max;
  return (
    <Field label={label} htmlFor={id} hint={invalid ? <span className="scn-invalid">Enter a number from {min} to {max}.</span> : hint}>
      <div className="row nowrap scn-num">
        <input
          id={id}
          className="input"
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          step={step}
          value={draft}
          aria-invalid={invalid}
          onChange={(e) => {
            setDraft(e.target.value);
            const v = Number(e.target.value);
            if (e.target.value.trim() !== '' && Number.isFinite(v) && v >= min && v <= max) onCommit(Math.round(v));
          }}
          onBlur={() => invalid && setDraft(String(value))}
        />
        <span className="muted">{unit}</span>
      </div>
    </Field>
  );
}

function SettingsPanel() {
  const { settings, setSettings } = useScanRouter();
  const changed = (Object.keys(DEFAULT_SCANNER_SETTINGS) as (keyof ScannerSettings)[]).some((k) => settings[k] !== DEFAULT_SCANNER_SETTINGS[k]);
  return (
    <section className="panel stack" aria-labelledby="scn-settings-title" data-tour="scanner-settings">
      <div className="panel-title" id="scn-settings-title" style={{ marginBottom: 0 }}>
        <Icon name="settings" width={16} height={16} /> Scanner settings
        <span className="grow" />
        <span className="faint scn-saved">Saved on this device</span>
      </div>

      <label className="toggle">
        <input type="checkbox" checked={settings.wedge} onChange={(e) => setSettings({ wedge: e.target.checked })} />
        <span>
          <strong>Listen for keyboard scanners</strong>
          <span className="scn-toggle-hint">USB and Bluetooth scanners that type what they read.</span>
        </span>
      </label>
      <label className="toggle">
        <input type="checkbox" checked={settings.scanAnywhere} onChange={(e) => setSettings({ scanAnywhere: e.target.checked })} />
        <span>
          <strong>Scan anywhere</strong>
          <span className="scn-toggle-hint">When no screen is waiting for a scan, open what was scanned: a pallet, a rack, a job, or the Scan station.</span>
        </span>
      </label>
      <label className="toggle">
        <input type="checkbox" checked={settings.confirmByRescan} onChange={(e) => setSettings({ confirmByRescan: e.target.checked })} />
        <span>
          <strong>Confirm moves by scanning the rack again</strong>
          <span className="scn-toggle-hint">On Move and the Scan station, after the pallet and the rack, scan the same rack label once more to save the move, so hands stay on the scanner.</span>
        </span>
      </label>

      <div className="stack" style={{ gap: 6 }}>
        <strong id="scn-suffix-label">After each code, the scanner sends</strong>
        <div className="seg" role="group" aria-labelledby="scn-suffix-label">
          {SUFFIXES.map(([v, l]) => (
            <button key={v} type="button" aria-pressed={settings.suffix === v} onClick={() => setSettings({ suffix: v })}>
              {l}
            </button>
          ))}
        </div>
        <span className="muted scn-hint">
          {settings.suffix === 'none'
            ? 'A code ends when the characters stop. This works, but Enter is faster and more reliable.'
            : 'Most scanners send Enter. “Enter or Tab” accepts either.'}
        </span>
      </div>

      <Field label="Prefix" htmlFor="scn-prefix" hint="Leave empty unless the scanner is set to add characters before every code. They are removed before reading.">
        <input
          id="scn-prefix"
          className="input scn-prefix"
          value={settings.prefix}
          maxLength={8}
          autoComplete="off"
          spellCheck={false}
          placeholder="No prefix"
          onChange={(e) => setSettings({ prefix: e.target.value })}
        />
      </Field>

      <div className="scn-num-grid">
        <NumberField
          id="scn-gap"
          label="Longest pause between characters"
          unit="ms"
          min={10}
          max={300}
          step={5}
          value={settings.maxGapMs}
          onCommit={(maxGapMs) => setSettings({ maxGapMs })}
          hint="Scanners type a character every few milliseconds. People take 100 ms or more. 50 suits most scanners; try 80 to 100 for slow Bluetooth ones. Lower it if typing is ever taken for a scan."
        />
        <NumberField
          id="scn-min"
          label="Shortest code"
          unit="characters"
          min={1}
          max={40}
          step={1}
          value={settings.minLength}
          onCommit={(minLength) => setSettings({ minLength })}
          hint={`Shorter bursts are ignored. ${BRAND.name} labels are all longer than 4 characters.`}
        />
      </div>

      <div className="row">
        <button type="button" className="btn" onClick={() => setSettings({ ...DEFAULT_SCANNER_SETTINGS, sounds: settings.sounds })} disabled={!changed}>
          <Icon name="refresh" /> Restore recommended settings
        </button>
      </div>
    </section>
  );
}

function SoundPanel() {
  const { settings, setSettings } = useScanRouter();
  const ok = soundsSupported();
  return (
    <section className="panel stack" aria-labelledby="scn-sound-title">
      <div className="panel-title" id="scn-sound-title" style={{ marginBottom: 0 }}>
        <Icon name="volume" width={16} height={16} /> Sounds
      </div>
      <label className="toggle">
        <input type="checkbox" checked={settings.sounds} onChange={(e) => setSettings({ sounds: e.target.checked })} />
        <span>
          <strong>Beep on every scan</strong>
          <span className="scn-toggle-hint">A short high beep when a scan is used. A low double beep when it is not recognized or nothing was waiting for it.</span>
        </span>
      </label>
      <div className="row">
        <button type="button" className="btn small" onClick={() => playScanSound('good')} disabled={!ok}>
          <Icon name="play" /> Test good scan
        </button>
        <button type="button" className="btn small" onClick={() => playScanSound('bad')} disabled={!ok}>
          <Icon name="play" /> Test bad scan
        </button>
      </div>
      {!ok && <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>This browser cannot play sounds.</p>}
      <p className="faint" style={{ margin: 0, fontSize: 13 }}>
        The test buttons play even when beeps are off. The device’s volume and silent switch still apply.
      </p>
    </section>
  );
}
