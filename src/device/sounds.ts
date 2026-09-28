// Scan beeps made with WebAudio (no sound files): a short high beep for a good scan, a low double beep for a bad one.

export type ScanSound = 'good' | 'bad';

type AudioCtor = typeof AudioContext;

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  try {
    if (!ctx) {
      if (typeof window === 'undefined') return null;
      const Ctor: AudioCtor | undefined = window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
    }
    // Browsers start audio suspended until the page has had a click or key press.
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
    return ctx;
  } catch {
    return null;
  }
}

export function soundsSupported(): boolean {
  return typeof window !== 'undefined' && !!(window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext);
}

function tone(c: AudioContext, freq: number, start: number, length: number, type: OscillatorType, volume: number) {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  // Short ramps at both ends so the beep does not click.
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.006);
  gain.gain.setValueAtTime(volume, start + length - 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
  osc.connect(gain).connect(c.destination);
  osc.start(start);
  osc.stop(start + length + 0.02);
}

/** Play a scan beep. Silently does nothing where audio is unavailable. */
export function playScanSound(kind: ScanSound) {
  const c = audio();
  if (!c) return;
  try {
    const t = c.currentTime + 0.01;
    if (kind === 'good') tone(c, 2400, t, 0.075, 'square', 0.05);
    else {
      tone(c, 196, t, 0.13, 'square', 0.09);
      tone(c, 196, t + 0.19, 0.13, 'square', 0.09);
    }
  } catch {
    /* audio is a nicety */
  }
}
