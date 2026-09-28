// Optional Web Serial support for scanners set to serial (virtual COM port) mode. Chrome and Edge on a computer only;
// keyboard mode needs none of this. One connection per tab, shared by every screen; each line read becomes a scan.

import { useSyncExternalStore } from 'react';
import { IS_PREVIEW } from './output';

// Web Serial is not in TypeScript's DOM types yet; these are the parts we use.
interface SerialPortInfo {
  usbVendorId?: number;
  usbProductId?: number;
}

interface SerialPortLike extends EventTarget {
  open(options: { baudRate: number; dataBits?: number; stopBits?: number; parity?: 'none' | 'even' | 'odd'; flowControl?: 'none' | 'hardware' }): Promise<void>;
  close(): Promise<void>;
  readonly readable: ReadableStream<Uint8Array> | null;
  getInfo?(): SerialPortInfo;
}

interface SerialLike extends EventTarget {
  requestPort(options?: { filters?: SerialPortInfo[] }): Promise<SerialPortLike>;
}

export const BAUD_RATES = [9600, 19200, 38400, 57600, 115200] as const;

export type SerialStatus =
  | { state: 'unsupported'; reason: string }
  | { state: 'idle'; note?: string }
  | { state: 'connecting' }
  | { state: 'connected'; baudRate: number; device: string; lines: number }
  | { state: 'error'; message: string };

function serialApi(): SerialLike | null {
  if (typeof navigator === 'undefined') return null;
  return (navigator as Navigator & { serial?: SerialLike }).serial ?? null;
}

/** Why serial scanners cannot be used here, or null when they can. */
export function serialUnavailableReason(): string | null {
  if (IS_PREVIEW) return 'This hosted preview runs inside a protected frame that blocks serial devices. Open the portal from its own web address in Chrome or Edge on a computer to connect one.';
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return 'Serial devices need a browser.';
  if (!window.isSecureContext) return 'Serial devices only work on a secure (https) address.';
  if (!serialApi()) return 'This browser does not offer Web Serial. Chrome and Edge on Windows, macOS, Linux and ChromeOS do. Safari and Firefox do not. Keyboard mode works in every browser, so use that instead.';
  const policy = (document as Document & { permissionsPolicy?: { allowsFeature(f: string): boolean } }).permissionsPolicy;
  try {
    if (policy && !policy.allowsFeature('serial')) return 'This page is shown inside a frame that blocks serial devices. Open the portal in its own tab.';
  } catch {
    /* older browsers: find out when connecting */
  }
  return null;
}

function hex(n: number | undefined): string {
  return n === undefined ? '?' : n.toString(16).padStart(4, '0').toUpperCase();
}

class SerialScanner {
  private status: SerialStatus;
  private port: SerialPortLike | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private statusListeners = new Set<() => void>();
  private lineListeners = new Set<(line: string) => void>();
  private flushTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    const reason = serialUnavailableReason();
    this.status = reason ? { state: 'unsupported', reason } : { state: 'idle' };
    serialApi()?.addEventListener('disconnect', (e) => {
      if (this.port && (e.target === this.port || (e as Event & { port?: unknown }).port === this.port)) {
        void this.teardown();
        this.set({ state: 'idle', note: 'The scanner was unplugged.' });
      }
    });
  }

  getStatus = (): SerialStatus => this.status;

  subscribe = (fn: () => void) => {
    this.statusListeners.add(fn);
    return () => {
      this.statusListeners.delete(fn);
    };
  };

  /** Receive every complete line the scanner sends. Returns an unsubscribe function. */
  onLine(fn: (line: string) => void) {
    this.lineListeners.add(fn);
    return () => {
      this.lineListeners.delete(fn);
    };
  }

  private set(s: SerialStatus) {
    this.status = s;
    for (const fn of this.statusListeners) fn();
  }

  /** Ask the browser for a port (it shows its own device picker) and start reading. Must run from a click. */
  async connect(baudRate: number) {
    const api = serialApi();
    const reason = serialUnavailableReason();
    if (!api || reason) {
      this.set({ state: 'unsupported', reason: reason ?? 'Web Serial is not available.' });
      return;
    }
    if (this.port) await this.disconnect();
    this.set({ state: 'connecting' });
    let port: SerialPortLike;
    try {
      port = await api.requestPort();
    } catch (e) {
      const name = e instanceof DOMException ? e.name : '';
      if (name === 'NotFoundError') this.set({ state: 'idle', note: 'No device was chosen.' });
      else if (name === 'SecurityError') this.set({ state: 'error', message: 'The browser blocked serial access on this page. Open the portal in its own tab.' });
      else this.set({ state: 'error', message: e instanceof Error ? e.message : 'Could not open the device picker.' });
      return;
    }
    try {
      await port.open({ baudRate, dataBits: 8, stopBits: 1, parity: 'none', flowControl: 'none' });
    } catch (e) {
      this.set({ state: 'error', message: `Could not open the port. It may be in use by another program or tab. ${e instanceof Error ? e.message : ''}`.trim() });
      return;
    }
    this.port = port;
    const info = port.getInfo?.() ?? {};
    const device = info.usbVendorId !== undefined ? `USB device ${hex(info.usbVendorId)}:${hex(info.usbProductId)}` : 'Serial port';
    this.set({ state: 'connected', baudRate, device, lines: 0 });
    void this.readLoop(port);
  }

  async disconnect() {
    await this.teardown();
    if (this.status.state !== 'unsupported') this.set({ state: 'idle' });
  }

  private async teardown() {
    clearTimeout(this.flushTimer);
    const port = this.port;
    this.port = null;
    try {
      await this.reader?.cancel();
    } catch {
      /* already closed */
    }
    this.reader = null;
    try {
      await port?.close();
    } catch {
      /* already closed */
    }
  }

  private emit(line: string) {
    const text = line.trim();
    if (!text) return;
    if (this.status.state === 'connected') this.set({ ...this.status, lines: this.status.lines + 1 });
    for (const fn of this.lineListeners) fn(text);
  }

  private async readLoop(port: SerialPortLike) {
    const decoder = new TextDecoder();
    let buffer = '';
    let closed = false;
    // A non-fatal error (a garbled byte, a buffer overrun) ends one stream and the port offers a fresh one.
    while (!closed && this.port === port && port.readable) {
      const reader = port.readable.getReader();
      this.reader = reader;
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) {
            closed = true;
            break;
          }
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split(/\r\n|\r|\n/);
          buffer = parts.pop() ?? '';
          for (const p of parts) this.emit(p);
          // Some scanners send no line ending at all: a pause means the code is complete.
          clearTimeout(this.flushTimer);
          if (buffer) {
            this.flushTimer = setTimeout(() => {
              const rest = buffer;
              buffer = '';
              this.emit(rest);
            }, 150);
          }
        }
      } catch (e) {
        if (this.port === port) this.set({ state: 'error', message: `Lost the connection to the scanner. ${e instanceof Error ? e.message : ''}`.trim() });
      } finally {
        reader.releaseLock();
      }
      if (this.status.state !== 'connected') break;
    }
    if (closed && this.port === port) {
      await this.teardown();
      this.set({ state: 'idle', note: 'The scanner stopped sending. Connect it again.' });
    }
  }
}

/** The one serial connection for this tab. */
export const serialScanner = new SerialScanner();

export function useSerialStatus(): SerialStatus {
  return useSyncExternalStore(serialScanner.subscribe, serialScanner.getStatus, serialScanner.getStatus);
}
