// Setup guides (USB, Bluetooth, rugged Android handhelds, phone camera, typing) and troubleshooting, as accordions.

import type { ReactNode } from 'react';
import { BRAND } from '../../brand';
import { Icon, type IconName } from '../../ui/icons';

function Acc({ icon, title, sub, children, open }: { icon: IconName; title: string; sub?: string; children: ReactNode; open?: boolean }) {
  return (
    <details className="scn-acc" open={open}>
      <summary>
        <span className="scn-acc-icon" aria-hidden="true">
          <Icon name={icon} width={18} height={18} />
        </span>
        <span className="scn-acc-title">
          <strong>{title}</strong>
          {sub && <span className="muted">{sub}</span>}
        </span>
        <Icon name="chevronDown" className="chev" width={18} height={18} />
      </summary>
      <div className="scn-acc-body">{children}</div>
    </details>
  );
}

export function RecommendedSettings() {
  const rows: [string, string][] = [
    ['Mode', 'Keyboard (often called HID or keyboard wedge)'],
    ['After each code', 'Enter (sometimes called CR or carriage return)'],
    ['Keyboard layout', 'The same as the computer, usually US English'],
    ['Before each code', 'Nothing (no prefix)'],
    ['Case', 'Unchanged (no forced upper or lower case)'],
  ];
  return (
    <section className="scn-reco" aria-labelledby="scn-reco-title">
      <div className="scn-reco-head">
        <Icon name="checklist" width={18} height={18} />
        <strong id="scn-reco-title">Recommended scanner settings</strong>
      </div>
      <dl className="kv scn-reco-kv">
        {rows.map(([k, v]) => (
          <div key={k} className="scn-kv-row">
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <p className="faint" style={{ margin: 0, fontSize: 13 }}>
        Most USB and Bluetooth scanners can be set this way by scanning the setup barcodes in their own manual. {BRAND.name} works with any scanner that types like a keyboard.
      </p>
    </section>
  );
}

export function SetupGuides() {
  return (
    <section className="panel stack" aria-labelledby="scn-guides-title">
      <div className="panel-title" id="scn-guides-title" style={{ marginBottom: 0 }}>
        <Icon name="guide" width={16} height={16} /> Set up a scanner
      </div>
      <div className="scn-accs">
        <Acc icon="usb" title="USB scanner" sub="Plug in and scan. Usually nothing to install.">
          <ol>
            <li>Plug the scanner into the computer or tablet. Most beep when they are ready.</li>
            <li>Most USB scanners start in keyboard mode. If yours does not, find the “USB keyboard” or “HID keyboard” setup barcode in its manual and scan it.</li>
            <li>Set it to add Enter after each code. That is usually the factory setting.</li>
            <li>Click an empty part of this page and scan a label. It appears on the test pad above.</li>
          </ol>
        </Acc>
        <Acc icon="bluetooth" title="Bluetooth scanner" sub="Pairs like a wireless keyboard.">
          <ol>
            <li>Put the scanner in Bluetooth keyboard (HID) pairing mode. This is usually a setup barcode in its manual or a long press on a button.</li>
            <li>Open the Bluetooth settings on the phone, tablet or computer and pair it like any keyboard. If it asks for a PIN, scan the number barcodes from the scanner’s manual, then Enter.</li>
            <li>On phones and tablets, a connected scanner can hide the on-screen keyboard. Most devices have a setting to keep showing it, or disconnect the scanner to type.</li>
            <li>Bluetooth can deliver a code in small bunches. If scans are missed or split in two, raise “Longest pause between characters” to 80 to 100 ms.</li>
            <li>Keep it charged. Many scanners sleep when idle and reconnect on the next trigger pull.</li>
          </ol>
        </Acc>
        <Acc icon="phone" title="Rugged Android handheld" sub="Devices with a built-in scanner and trigger.">
          <ol>
            <li>Open the device’s scanner settings. The name of that app differs by maker.</li>
            <li>Set the output to keystrokes (sometimes called keyboard output or keystroke output), not intent, broadcast or clipboard.</li>
            <li>Turn on sending Enter after each scan.</li>
            <li>Open the portal in the device’s browser and add it to the home screen, so it opens full screen like an app.</li>
            <li>Test on this page: pull the trigger at a label and check the test pad.</li>
          </ol>
        </Acc>
        <Acc icon="camera" title="Phone camera" sub="No scanner needed.">
          <ol>
            <li>Scan screens, such as Move, have a “Scan with camera” button. Allow camera access when the browser asks.</li>
            <li>Hold the phone a hand’s width or two from the label, flat on, in good light.</li>
            <li>The camera reads the QR codes on {BRAND.name} labels. If the page cannot use the live camera, “Scan from a photo” opens the phone’s camera app instead.</li>
          </ol>
        </Acc>
        <Acc icon="keyboard" title="Typing codes" sub="For torn labels, or no scanner at all.">
          <ol>
            <li>Every label has its code printed large, like P-000042 or A-03-02. Type it into any scan box and press Enter.</li>
            <li>Upper or lower case both work, and P42 finds P-000042.</li>
            <li>Typing is slower than a scanner, so it never gets mistaken for a scan.</li>
          </ol>
        </Acc>
      </div>
    </section>
  );
}

export function Troubleshooting() {
  return (
    <section className="panel stack" aria-labelledby="scn-trouble-title">
      <div className="panel-title" id="scn-trouble-title" style={{ marginBottom: 0 }}>
        <Icon name="alert" width={16} height={16} /> Troubleshooting
      </div>
      <div className="scn-accs">
        <Acc icon="text" title="Wrong characters come through" sub="Colons turn into semicolons, or letters change.">
          <ul>
            <li>
              The scanner’s keyboard layout does not match the computer’s. A label that should start <span className="mono">PL1:P:</span> arrives as <span className="mono">PL1;P;</span> instead. Set
              the scanner to the same layout as the computer, usually US English, using its manual.
            </li>
            <li>Caps Lock swaps upper and lower case on many scanners. Turn Caps Lock off.</li>
            <li>If the scanner adds characters before each code, enter them under Prefix in Scanner settings, or turn that off on the scanner.</li>
          </ul>
        </Acc>
        <Acc icon="copy" title="Each scan shows up twice" sub="Or a code is split in two.">
          <ul>
            <li>The scanner may be in continuous or presentation mode and read the label again. Switch it to trigger mode, or set a longer delay before it rereads the same code.</li>
            <li>A scanner connected by cable and Bluetooth at the same time types everything twice. Use one.</li>
            <li>A code split in two means the characters arrived too slowly. Raise “Longest pause between characters” a little.</li>
          </ul>
        </Acc>
        <Acc icon="question" title="Nothing happens when I scan" sub="The scanner beeps, but the portal does not react.">
          <ul>
            <li>Watch the test pad above while you scan. If nothing appears, the scan is not reaching this page.</li>
            <li>Click an empty part of the page. Another window or app may have the keyboard.</li>
            <li>Check that “Listen for keyboard scanners” is on, and that “After each code” matches what the scanner sends. When unsure, choose Enter or Tab.</li>
            <li>A prefix set here that the scanner does not send stops every scan. Clear it.</li>
            <li>If the scanner is in serial or USB COM mode, it is not typing. Scan its “USB keyboard” setup barcode, or connect it under Serial scanners.</li>
          </ul>
        </Acc>
        <Acc icon="keyboard" title="A text box ate my scan" sub="The code typed into a field instead.">
          <ul>
            <li>When a text box has the cursor, a scanner types into it like a keyboard. That is on purpose, so you can scan into any field.</li>
            <li>Scan boxes, like the code box on Move, read the code as soon as the scanner presses Enter.</li>
            <li>To send scans to the portal instead, click an empty part of the page first, so no box has the cursor.</li>
          </ul>
        </Acc>
        <Acc icon="alertCircle" title="The portal says “not recognized”" sub="The scanner read something we do not know.">
          <ul>
            <li>Product barcodes and supplier labels are not {BRAND.name} codes. Scan the {BRAND.name} label on the pallet or rack.</li>
            <li>Labels only work in the company that printed them. A replaced label stops working; use the new one or type the printed code.</li>
          </ul>
        </Acc>
      </div>
    </section>
  );
}
