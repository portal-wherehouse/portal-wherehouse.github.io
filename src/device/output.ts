// Printing, downloads, and clipboard, with honest fallbacks for the hosted preview
// (where the frame blocks print dialogs and downloads).

import QRCode from 'qrcode';

export const IS_PREVIEW = __BUILD_TARGET__ === 'artifact';

const qrCache = new Map<string, string>();

/** QR code as an SVG string. Error correction M keeps modules large enough for worn labels. */
export async function qrSvg(payload: string): Promise<string> {
  const hit = qrCache.get(payload);
  if (hit) return hit;
  const svg = await QRCode.toString(payload, { type: 'svg', errorCorrectionLevel: 'M', margin: 0, color: { dark: '#000000', light: '#ffffff' } });
  qrCache.set(payload, svg);
  return svg;
}

export function canPrint(): boolean {
  return !IS_PREVIEW && typeof window !== 'undefined' && typeof window.print === 'function';
}

export function printNow() {
  if (canPrint()) window.print();
}

export function canDownload(): boolean {
  return !IS_PREVIEW;
}

export function downloadText(filename: string, text: string, type = 'text/csv;charset=utf-8') {
  // Spreadsheets need the byte-order mark to read UTF-8 CSV; JSON parsers reject it.
  const blob = new Blob(type.startsWith('text/csv') ? ['﻿', text] : [text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
