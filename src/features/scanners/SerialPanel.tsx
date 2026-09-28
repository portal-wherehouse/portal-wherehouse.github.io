// Connect a scanner that is set to serial (virtual COM port) mode, through Web Serial in Chrome or Edge on a computer.

import { useState } from 'react';
import { BAUD_RATES, serialScanner, useSerialStatus } from '../../device/serial';
import { Icon } from '../../ui/icons';
import { Field, Notice, Spinner } from '../../ui/ui';

export function SerialPanel() {
  const status = useSerialStatus();
  const [baud, setBaud] = useState<number>(9600);
  const connected = status.state === 'connected';

  return (
    <section className="panel stack" aria-labelledby="scn-serial-title">
      <div className="panel-title" id="scn-serial-title" style={{ marginBottom: 0 }}>
        <Icon name="plug" width={16} height={16} /> Serial scanners
        <span className="tag">Advanced</span>
      </div>
      <p style={{ margin: 0 }}>
        Most scanners work in keyboard mode and need nothing here. Some fixed-mount and older scanners send codes over a serial (COM) port instead. Chrome and Edge on a computer can read
        those directly.
      </p>

      {status.state === 'unsupported' ? (
        <Notice tone="info" title="Not available in this browser">
          {status.reason}
        </Notice>
      ) : (
        <>
          <Field label="Speed (baud rate)" htmlFor="scn-baud" hint="Must match the scanner's setting. 9600 is the most common.">
            <select id="scn-baud" className="select" value={baud} onChange={(e) => setBaud(Number(e.target.value))} disabled={connected || status.state === 'connecting'}>
              {BAUD_RATES.map((b) => (
                <option key={b} value={b}>
                  {b.toLocaleString()} baud
                </option>
              ))}
            </select>
          </Field>

          <div className={`scn-serial-state ${connected ? 'on' : ''}`} role="status">
            <span className="scn-dot" aria-hidden="true" />
            {status.state === 'connected' && (
              <span>
                <strong>Connected</strong> to {status.device} at {status.baudRate.toLocaleString()} baud. {status.lines} {status.lines === 1 ? 'code' : 'codes'} read.
              </span>
            )}
            {status.state === 'connecting' && <span>Choose the scanner in the browser's list…</span>}
            {status.state === 'idle' && <span>Not connected.{status.note ? ` ${status.note}` : ''}</span>}
            {status.state === 'error' && <span className="scn-serial-err">{status.message}</span>}
          </div>

          <div className="row">
            {connected ? (
              <button type="button" className="btn" onClick={() => void serialScanner.disconnect()}>
                <Icon name="x" /> Disconnect
              </button>
            ) : (
              <button type="button" className="btn" onClick={() => void serialScanner.connect(baud)} disabled={status.state === 'connecting'}>
                {status.state === 'connecting' ? <Spinner /> : <Icon name="usb" />} Connect a serial scanner
              </button>
            )}
          </div>
          <p className="faint" style={{ margin: 0, fontSize: 13 }}>
            The connection lasts while this tab is open. Each line the scanner sends counts as one scan, and works everywhere a keyboard scan does.
          </p>
        </>
      )}
    </section>
  );
}
