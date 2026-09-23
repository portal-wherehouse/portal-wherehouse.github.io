// Runs every Integrity Lab scenario (the blueprint's test matrix) under Vitest.
import { describe, expect, it } from 'vitest';
import { runScenario } from '../../src/lab/harness';
import { SCENARIOS } from '../../src/lab/scenarios';

describe('Integrity Lab scenarios', () => {
  for (const s of SCENARIOS) {
    it(`${s.id} ${s.title}`, async () => {
      const r = await runScenario(s);
      if (!r.pass) {
        const trail = r.lines.map((l) => `${l.ok === false ? '✗' : l.ok ? '✓' : '·'} ${l.label} ${l.detail}`).join('\n');
        throw new Error(`${r.error}\n${trail}`);
      }
      expect(r.pass).toBe(true);
    });
  }
});
