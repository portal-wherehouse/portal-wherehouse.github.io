import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useScanRouter, useScanTarget, type ScanEvent, type ScanSource } from '../../device/scanRouter';
import { SCAN_COMMANDS, commandPayload, parseScanCommand } from '../../device/scanCommands';
import { normalizeCode, parseLabelPayload, parsePalletCode, rackFields } from '../../domain/codes';
import { Icon, type IconName } from '../../ui/icons';
import { FeatureCards, PageHero, Section, SiteLink } from '../kit';
import { BRAND } from '../../brand';
import { QrCode, Code128, SAMPLE_PALLET_PAYLOAD } from './c-mocks';
import './pages-c.css';
export function HardwarePage() { return <>
<PageHero eyebrow="Printing & scanning" title="Start with a printer and a phone." lede="You don’t need a warehouse full of special equipment." />
<Section><FeatureCards items={[
{icon:'print',title:'At receiving',body:'Print pallet labels from a computer. Use an ordinary Letter printer to start, or a USB 4 × 6 thermal label printer.'},
{icon:'camera',title:'On the floor',body:'A phone camera reads the QR labels. A 2D USB or Bluetooth keyboard scanner is optional for faster scanning.'},
{icon:'locations',title:'On the racks',body:'Print a location label for each rack. Keep it visible from the aisle and use the same names your crew already uses.'}
]} /></Section>
<Section tone="surface" title="Buying a low-cost printer?"><div className="site-inner narrow"><p>Look for a USB 4 × 6 model with a driver for your computer. MUNBYN’s ITPP941 USB family is one example to evaluate; we haven’t physically tested it with Wherehouse.</p><p><a href="https://support.munbyn.com/hc/en-us/articles/6092502480787-Printer-Drivers-SDK-Download" target="_blank" rel="noreferrer">Check the manufacturer’s drivers →</a></p><p>Install the driver, print one label at 100% size, and scan it before buying several printers. Bluetooth-only models may require a separate app, so a USB receiving station is the simpler starting point.</p></div></Section>
<Section title="Make the labels survive the work." lede="Stick them to a clean, dry surface. Keep the code flat and clear. For outdoor storage or rough handling, use a protective pouch or labels rated for those conditions."><p>Print at actual size, with browser headers and footers off. Confirm the paper size in the print dialog. Reprint damaged labels from the pallet record.</p></Section>
<Section id="setup" tone="surface" title="Three scanner settings."><p>Keyboard (HID) mode. QR and Code 128 enabled. Enter after each scan.</p><p>Open Move, scan the pallet, then scan the rack. Check the saved confirmation before moving on.</p></Section>
<Section id="try" title="Try your scanner"><details><summary>Open scanner test</summary><ScannerTest /></details></Section>
<Section narrow><SiteLink to="contact" className="site-btn primary">Get remote setup help</SiteLink><p>Printer, label and scanner setup are included in remote support.</p></Section>
</>; }
type Tone = 'ok' | 'warn' | 'bad' | 'neutral';

interface Verdict {
  tone: Tone;
  title: string;
  detail: string;
}

function classify(text: string): Verdict {
  const cmd = parseScanCommand(text);
  if (cmd) {
    const c = SCAN_COMMANDS.find((x) => x.id === cmd);
    return { tone: 'ok', title: `Command barcode: ${c?.label ?? cmd}`, detail: c?.hint ?? 'A printed command for the Scan station.' };
  }
  const label = parseLabelPayload(text);
  if (label) {
    return label.kind === 'P'
      ? { tone: 'ok', title: `${BRAND.name} pallet label`, detail: 'Read correctly. In the portal, this opens the pallet it belongs to.' }
      : { tone: 'ok', title: `${BRAND.name} rack label`, detail: 'Read correctly. In the portal, this picks the rack, for example as the destination of a move.' };
  }
  if (parseLabelPayload(text.toUpperCase())) {
    return { tone: 'warn', title: 'A label, but the letters changed case', detail: 'Caps Lock may be on, or the scanner is set to change case. Turn Caps Lock off and scan again.' };
  }
  if (/^pl1[^:]/i.test(text) || /^cmd[^:]/i.test(text)) {
    return {
      tone: 'warn',
      title: 'A label, but some characters came through wrong',
      detail: 'The colons turned into other characters. This usually means the scanner’s keyboard layout does not match the computer. Set the scanner to US English.',
    };
  }
  const pallet = parsePalletCode(text);
  if (pallet) {
    return { tone: 'ok', title: `Pallet code ${pallet}`, detail: 'The code printed large on a label. The portal accepts it scanned or typed.' };
  }
  const code = normalizeCode(text);
  if (rackFields(code).zone) {
    return { tone: 'ok', title: `Rack code ${code}`, detail: 'A rack name like the ones on rack labels. The portal accepts it scanned or typed.' };
  }
  if (/^https?:\/\//i.test(text) || /^www\./i.test(text)) {
    return { tone: 'bad', title: 'A web address', detail: 'Your scanner works, but the portal never opens scanned web addresses. Only its own labels are accepted.' };
  }
  return { tone: 'neutral', title: `Not a ${BRAND.name} code`, detail: 'Your scanner is sending text, which is the main thing. This just is not one of our labels, like a product barcode.' };
}

const SOURCE_TEXT: Record<ScanSource, string> = {
  wedge: 'Scanner in keyboard mode',
  serial: 'Serial scanner',
  camera: 'Camera',
  photo: 'Photo',
  typed: 'Entered in the box below',
  demo: 'Sample button',
};

function speed(e: ScanEvent, maxGapMs: number): { value: string; note: string; tone: Tone } {
  if (e.source === 'demo') return { value: 'Not timed', note: 'Samples arrive all at once.', tone: 'neutral' };
  if (e.durationMs == null) return { value: 'Not measured', note: 'Pasted text has no typing speed.', tone: 'neutral' };
  const gaps = Math.max(1, e.text.length - 1);
  const per = e.durationMs / gaps;
  const perText = per < 10 ? per.toFixed(1) : Math.round(per).toString();
  if (per <= maxGapMs) return { value: `${Math.round(e.durationMs)} ms total, ${perText} ms per character`, note: 'Scanner speed. The portal will treat this as a scan.', tone: 'ok' };
  return { value: `${Math.round(e.durationMs)} ms total, ${perText} ms per character`, note: `Typing speed. A scan needs characters less than ${maxGapMs} ms apart.`, tone: 'neutral' };
}

const SAMPLES: { label: string; text: string; icon: IconName }[] = [
  { label: 'Pallet label', text: SAMPLE_PALLET_PAYLOAD, icon: 'qr' },
  { label: 'Rack code', text: 'A-03-02', icon: 'locations' },
  { label: 'Confirm command', text: commandPayload('CONFIRM'), icon: 'barcode' },
  { label: 'Wrong keyboard layout', text: SAMPLE_PALLET_PAYLOAD.replace(/:/g, ';'), icon: 'keyboard' },
];

function ScannerTest() {
  const { settings, setSettings, emit } = useScanRouter();
  const [scans, setScans] = useState<ScanEvent[]>([]);
  const [draft, setDraft] = useState('');
  const keys = useRef<{ first: number; last: number; pasted: boolean } | null>(null);
  const last = useRef<{ text: string; at: number } | null>(null);

  useScanTarget('site-scanner-test', (e) => {
    const prev = last.current;
    // A scanner typing into the box can arrive twice: once from the scanner listener, once from the form.
    if (prev && prev.text === e.text && e.at - prev.at < 1500) return true;
    last.current = { text: e.text, at: e.at };
    // If the scanner also typed into the box, clear it so the same scan is not checked twice.
    if (e.source !== 'typed') setDraft((d) => (d.trim() === e.text ? '' : d));
    setScans((s) => [e, ...s].slice(0, 5));
    return true;
  });

  const onKeyDown = (ev: KeyboardEvent<HTMLInputElement>) => {
    if (ev.key.length !== 1) return;
    const now = performance.now();
    if (!keys.current || draft === '') keys.current = { first: now, last: now, pasted: false };
    else keys.current.last = now;
  };

  const submit = (ev: FormEvent) => {
    ev.preventDefault();
    const text = draft.trim();
    if (!text) return;
    const k = keys.current;
    const durationMs = k && !k.pasted && k.last > k.first ? k.last - k.first : undefined;
    emit(text, 'typed', { durationMs });
    setDraft('');
    keys.current = null;
  };

  const latest = scans[0];
  const verdict = latest ? classify(latest.text) : null;
  const sp = latest ? speed(latest, settings.maxGapMs) : null;

  return (
    <div className="hw-test">
      <div className="hw-test-side">
        <ol className="hw-test-steps">
          <li>Click anywhere on this page so it has focus.</li>
          <li>Scan the sample below, one of your own labels, or any barcode.</li>
          <li>Read what arrived, how fast, and whether it looks like one of our labels.</li>
        </ol>
        <figure className="hw-sample-card">
          <div className="hw-sample-top">
            <QrCode payload={SAMPLE_PALLET_PAYLOAD} className="hw-sample-qr" />
            <figcaption>
              <strong>Sample pallet label</strong>
              <span>Scan the QR or the barcode. The QR holds a random token, and the barcode holds the printed code, P-000042.</span>
            </figcaption>
          </div>
          <Code128 text="P-000042" caption={false} className="hw-sample-bar" />
        </figure>
        <p className="hw-test-tip">Most 2D imagers can read the sample straight off the screen. Laser scanners usually cannot, so try a printed label or the typing box instead.</p>
      </div>

      <div className="hw-panel">
        <div className="hw-panel-head">
          {settings.wedge ? (
            <span className="hw-listen">
              <span className="cm-dot" aria-hidden="true" />
              Listening for scans
            </span>
          ) : (
            <span className="hw-listen off">
              <Icon name="alert" />
              Keyboard-mode scanning is off in this browser
            </span>
          )}
          {!settings.wedge && (
            <button type="button" className="hw-mini-btn" onClick={() => setSettings({ wedge: true })}>
              Turn it on
            </button>
          )}
        </div>

        <div className={`hw-result ${verdict ? verdict.tone : 'empty'}`} aria-live="polite" aria-atomic="true">
          {latest && verdict && sp ? (
            <>
              <div className="hw-verdict">
                <span className="hw-verdict-icon" aria-hidden="true">
                  <Icon name={verdict.tone === 'ok' ? 'checkCircle' : verdict.tone === 'warn' ? 'alert' : verdict.tone === 'bad' ? 'alertCircle' : 'info'} />
                </span>
                <span>
                  <strong>{verdict.title}</strong>
                  <span>{verdict.detail}</span>
                </span>
              </div>
              <dl className="hw-facts">
                <div className="wide">
                  <dt>Text received</dt>
                  <dd>
                    <code className="hw-received">{latest.text}</code>
                  </dd>
                </div>
                <div>
                  <dt>Characters</dt>
                  <dd>{latest.text.length}</dd>
                </div>
                <div>
                  <dt>Came from</dt>
                  <dd>{SOURCE_TEXT[latest.source]}</dd>
                </div>
                <div className="wide">
                  <dt>Speed</dt>
                  <dd>
                    {sp.value}
                    <span className={`hw-speed-note ${sp.tone}`}>{sp.note}</span>
                  </dd>
                </div>
              </dl>
            </>
          ) : (
            <div className="hw-waiting">
              <Icon name="scanner" />
              <strong>Waiting for a scan</strong>
              <span>Scan a label, type in the box below, or send a sample.</span>
            </div>
          )}
        </div>

        <form className="hw-type" onSubmit={submit}>
          <label htmlFor="hw-type-input">Type or paste a code</label>
          <div className="hw-type-row">
            <input
              id="hw-type-input"
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                if (!e.target.value) keys.current = null;
              }}
              onKeyDown={onKeyDown}
              onPaste={() => {
                keys.current = { first: 0, last: 0, pasted: true };
              }}
              placeholder="P-000042"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              enterKeyHint="go"
            />
            <button type="submit" className="hw-mini-btn primary" disabled={!draft.trim()}>
              Check
            </button>
          </div>
        </form>

        <div className="hw-samples">
          <span className="hw-samples-label">No scanner handy? Send a sample</span>
          <div className="hw-samples-row">
            {SAMPLES.map((x) => (
              <button key={x.label} type="button" className="hw-sample" onClick={() => emit(x.text, 'demo')}>
                <Icon name={x.icon} />
                {x.label}
              </button>
            ))}
          </div>
        </div>

        {scans.length > 1 && (
          <div className="hw-history">
            <span className="hw-history-label">Earlier</span>
            <ul>
              {scans.slice(1).map((s) => {
                const v = classify(s.text);
                return (
                  <li key={s.id}>
                    <span className={`hw-history-dot ${v.tone}`} aria-hidden="true" />
                    <code>{s.text}</code>
                    <span className="hw-history-t">{v.title}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
