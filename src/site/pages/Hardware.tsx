// Scanners: what hardware works, how a label is laid out, how to set a scanner up, the Scan station's
// command barcodes, and a live box that shows exactly what a scanner sends.

import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { BRAND } from '../../brand';
import { useScanRouter, useScanTarget, type ScanEvent, type ScanSource } from '../../device/scanRouter';
import { SCAN_COMMANDS, commandPayload, parseScanCommand } from '../../device/scanCommands';
import { normalizeCode, parseLabelPayload, parsePalletCode, rackFields } from '../../domain/codes';
import { Icon, type IconName } from '../../ui/icons';
import { CtaBand, FeatureCards, PageHero, Section, SiteLink } from '../kit';
import { Code128, CommandCard, PalletLabelMock, QrCode, RackLabelMock, SAMPLE_PALLET_PAYLOAD, WedgeFlow, keepCodes } from './c-mocks';
import './pages-c.css';

export function HardwarePage() {
  return (
    <>
      <div className="site-inner">
        <PageHero
          eyebrow="Scanners"
          title="Works with the scanners you already own"
          lede={`${BRAND.name} works with barcode scanners that act as a keyboard, a mode most USB and Bluetooth scanners can be set to. No scanner? The phone camera reads the QR on every label, and every code is printed large enough to type.`}
          art={<WedgeFlow />}
        >
          <SiteLink to="hardware" hash="try" className="site-btn primary">
            <Icon name="scanner" />
            Try your scanner
          </SiteLink>
          <SiteLink to="hardware" hash="setup" className="site-btn ghost">
            Set one up
          </SiteLink>
        </PageHero>
      </div>

      <Section id="works" eyebrow="What works" title="Six ways to read a label" lede="Use whatever the crew already carries. Every way ends in the same place: the right pallet or rack on screen.">
        <FeatureCards
          columns={3}
          items={[
            { icon: 'usb', title: 'USB scanners', body: 'Plug it in and set it to keyboard mode, often called HID. Each scan arrives as fast typing, followed by Enter.' },
            { icon: 'bluetooth', title: 'Bluetooth scanners', body: 'Pair it as a keyboard with the phone, tablet or computer the crew already uses. Handy when the phone stays in a pocket.' },
            { icon: 'phone', title: 'Rugged handhelds', body: 'Android handhelds with a built-in scanner work when their scan output is set to keystrokes, with Enter after each scan.' },
            { icon: 'camera', title: 'Phone camera', body: 'Tap Scan and point the camera at the QR code. The camera is on only while you are scanning.' },
            { icon: 'image', title: 'Photo of a label', body: 'Take or pick a photo and the QR is read from the picture. Useful for a label that is high up or hard to reach.' },
            { icon: 'keyboard', title: 'Typing the code', body: keepCodes('Every label has its code printed large. Type P-000042, P42 or p42 and it finds the same pallet.') },
          ]}
        />
        <p className="hw-honest">
          <Icon name="info" />
          <span>
            We have not certified or partnered with any scanner maker. If a scanner can type what it reads and press Enter, it should work. <SiteLink to="hardware" hash="try">Test yours below</SiteLink> before you buy more.
          </span>
        </p>
      </Section>

      <Section id="label" tone="surface" eyebrow="Label anatomy" title="What is on a pallet label" lede="One label, readable by people, phone cameras and scanners. Print it on a 4x6 label or a full sheet.">
        <div className="hw-anatomy">
          <div className="hw-anatomy-art">
            <PalletLabelMock marks className="marked" />
            <RackLabelMock />
          </div>
          <ol className="hw-parts">
            <li>
              <strong>The code, printed big.</strong> For people. When nothing scans, type it.
            </li>
            <li>
              <strong>QR code.</strong> Read by phone cameras and 2D scanners. It holds a random token, not the job or description, so editing a pallet never breaks its label.
            </li>
            <li>
              <strong>Code 128 barcode.</strong> The printed code (like P-000042), for laser scanners that only read straight-line barcodes. Scanning it works just like typing the code.
            </li>
            <li>
              <strong>The job line.</strong> The job number and name in heavy type, so the crew can sort by eye.
            </li>
            <li>
              <strong>The fallback line.</strong> The warehouse, and which code to type if both codes are damaged.
            </li>
          </ol>
        </div>
        <p className="hw-note">Rack labels, like the one shown here, carry the rack code, a QR and a Code 128 barcode of the rack code. To move a pallet, scan the pallet first, then the rack.</p>
      </Section>

      <Section id="setup" eyebrow="Setup" title="Three steps, once per scanner" lede="Most scanners change settings by scanning setup barcodes printed in their manual.">
        <ol className="hw-steps">
          <li>
            <span className="hw-step-n">1</span>
            <h3>Switch to keyboard mode</h3>
            <p>Look for USB HID, keyboard or keyboard wedge in the manual. Bluetooth scanners usually call it HID too. Then pair or plug in.</p>
          </li>
          <li>
            <span className="hw-step-n">2</span>
            <h3>Add Enter after each scan</h3>
            <p>Often called a suffix or terminator. Tab also works. It tells the portal where one scan ends.</p>
          </li>
          <li>
            <span className="hw-step-n">3</span>
            <h3>Test it</h3>
            <p>
              Scan the sample label on this page into the <SiteLink to="hardware" hash="try">test box</SiteLink>. It shows exactly what arrived and whether it looks right.
            </p>
          </li>
        </ol>

        <h3 className="hw-subhead">Recommended settings</h3>
        <div className="table-wrap hw-settings-wrap">
          <table className="hw-settings">
            <caption className="sr-only">Recommended scanner settings</caption>
            <thead>
              <tr>
                <th scope="col">Setting</th>
                <th scope="col">Use</th>
                <th scope="col">Why</th>
              </tr>
            </thead>
            <tbody>
              {SETTINGS.map((r) => (
                <tr key={r.name}>
                  <th scope="row">{r.name}</th>
                  <td data-label="Use">
                    <strong>{r.use}</strong>
                  </td>
                  <td data-label="Why">{r.why}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section id="station" tone="ink" eyebrow="Scan station" title="Hands on the scanner, not the screen" lede="The Scan station is a hands-free screen for a scanner on a cart or at a desk. Pick a mode once, then just scan. Printed command barcodes switch modes and confirm, so nobody has to reach for the keyboard.">
        <div className="hw-modes">
          {SCAN_COMMANDS.filter((c) => c.id.startsWith('MODE_')).map((c) => (
            <div key={c.id} className="hw-mode">
              <Icon name={MODE_ICON[c.id] ?? 'target'} />
              <strong>{c.label.replace(/ mode$/, '')}</strong>
              <span>{sentence(c.hint.replace(/^Scan station: /, ''))}</span>
            </div>
          ))}
        </div>
        <h3 className="hw-subhead">Command barcodes</h3>
        <p className="hw-sublede">Each one is a Code 128 barcode of the text CMD: and the command name, so any scanner that reads Code 128 can use them.</p>
        <div className="hw-cmds">
          {SCAN_COMMANDS.map((c) => (
            <CommandCard key={c.id} payload={commandPayload(c.id)} label={c.label} hint={c.hint} />
          ))}
        </div>
      </Section>

      <Section id="try" tone="surface" eyebrow="Try your scanner" title="See exactly what your scanner sends" lede="Nothing here is saved or sent anywhere. The test runs in this page only.">
        <ScannerTest />
      </Section>

      <Section id="faq" eyebrow="Questions" title="Scanner questions" narrow>
        <div className="hw-faq">
          {FAQ.map((f) => (
            <details key={f.q}>
              <summary>
                {f.q}
                <Icon name="chevronDown" />
              </summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </Section>

      <CtaBand title="Bring the scanner you have." body="Open the portal with demo data and scan the sample labels, or book a walkthrough and we will go through your scanners with you." />
    </>
  );
}

function sentence(t: string): string {
  return t.charAt(0).toUpperCase() + t.slice(1);
}

const MODE_ICON: Record<string, IconName> = { MODE_LOOKUP: 'find', MODE_MOVE: 'move', MODE_PUTAWAY: 'stack', MODE_COUNT: 'checklist' };

const SETTINGS: { name: string; use: string; why: string }[] = [
  { name: 'Output mode', use: 'Keyboard (HID)', why: 'The portal reads a scan as very fast typing, so no driver or app is needed.' },
  { name: 'Suffix', use: 'Enter (Tab also works)', why: 'Marks where one scan ends.' },
  { name: 'Keyboard layout', use: 'US English', why: 'Other layouts can turn the colons in a label into different characters, and the label is not recognized.' },
  { name: 'Prefix', use: 'None', why: 'If your scanner must add one, enter it in the portal’s scanner settings and it is removed before reading.' },
  { name: 'Barcode types', use: 'QR code and Code 128', why: 'Both are printed on every pallet label, and the command barcodes are Code 128.' },
  { name: 'Speed', use: 'The scanner’s default', why: `${BRAND.name} treats characters arriving less than 50 ms apart as a scan. People type slower than that.` },
];

const FAQ: { q: string; a: string }[] = [
  {
    q: 'Which scanner should we buy?',
    a: 'We do not recommend a brand. Look for keyboard (HID) mode, QR and Code 128 support, and a suffix setting. A 2D imager reads both the QR and the barcode, and usually reads from a phone screen too. Test one with the box above before buying several.',
  },
  {
    q: 'Do we need a scanner at all?',
    a: 'No. The phone camera reads the QR on every label, and every code can be typed. Scanners are faster for a crew that moves a lot of pallets.',
  },
  {
    q: 'Does it work with a scanner on a phone or tablet?',
    a: 'Yes, if the scanner pairs as a Bluetooth keyboard. On some phones the on-screen keyboard hides while a hardware keyboard is connected; that is normal.',
  },
  {
    q: 'What if I scan something that is not our label?',
    a: 'Nothing happens beyond a message saying it is not one of ours. The portal only reads its own labels, pallet codes and rack codes from a scan, and it never opens a scanned web address.',
  },
  {
    q: 'Scans come through with the wrong characters. Why?',
    a: 'Usually the scanner’s keyboard layout does not match. Set it to US English. If letters arrive in lower case, check that Caps Lock is off.',
  },
  {
    q: 'Can we print our own labels and command barcodes?',
    a: 'Yes. The portal prints pallet and rack labels on 4x6 labels or full sheets. The command barcodes are plain Code 128, so a printed copy of the ones on this page works too.',
  },
];

// ------------------------------------------------------------------ try your scanner

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
