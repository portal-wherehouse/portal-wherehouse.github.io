import { describe, expect, it } from 'vitest';
import { Harness } from '../../src/lab/harness';
import { SPOT_BATCH, createSpots, zoneCodes } from '../../src/features/onboarding/spots';
import type { Outcome } from '../../src/data/backend';
import type { CommandKind } from '../../src/domain/types';

const ok = (kind: CommandKind): Outcome => ({ status: 'result', result: { ok: true, command_id: 'c', kind, correlation_id: 'c' } as never });

describe('setup spot builder', () => {
  it('makes rack codes by aisle, bay and level, and floor codes by lane', () => {
    const codes = zoneCodes('A', true, 3, 15, 5);
    expect(codes).toHaveLength(225);
    expect(codes[0]).toBe('A-01-01-1');
    expect(codes.at(-1)).toBe('A-03-15-5');
    expect(new Set(codes).size).toBe(225);
    expect(zoneCodes('B', false, 1, 12, 1)).toEqual(Array.from({ length: 12 }, (_, i) => `B-${String(i + 1).padStart(2, '0')}`));
    // Ten or more levels keep the codes sortable.
    expect(zoneCodes('C', true, 1, 1, 12).at(-1)).toBe('C-01-01-12');
  });

  it('sends 175 new spots in batches the server accepts', async () => {
    const sizes: number[] = [];
    const r = await createSpots(
      async (kind, payload) => {
        sizes.push((payload.rows as unknown[]).length);
        return ok(kind);
      },
      'WH1',
      zoneCodes('A', true, 3, 15, 5).slice(50),
      'RACK',
      'Setup: zone A',
    );
    expect(r).toEqual({ made: 175, error: '' });
    expect(sizes).toEqual([80, 80, 15]);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(SPOT_BATCH);
  });

  it('says how far it got when the server refuses, instead of failing silently', async () => {
    let n = 0;
    const r = await createSpots(
      async (kind) => (++n === 2 ? { status: 'result', result: { ok: false, command_id: 'c', kind, code: 'INVALID_INPUT', message: 'Import up to 80 rows at a time.', correlation_id: 'c' } } : ok(kind)),
      'WH1',
      zoneCodes('A', true, 3, 15, 5).slice(50),
      'RACK',
      'Setup: zone A',
    );
    expect(r.made).toBe(80);
    expect(r.error).toContain('80 of 175 spots were created.');
    expect(r.error).toContain('Import up to 80 rows at a time.');
    expect(r.error).toContain('Press Create again');
    const lost = await createSpots(async (kind, _p, _x, o) => ({ status: 'unknown', command_id: o.commandId, message: `${kind} lost` }), 'WH1', ['A-01'], 'FLOOR', 'x');
    expect(lost.error).toMatch(/^No spots were created\. The server refused the rest: The server did not answer/);
  });

  it('builds 225 spots on a zone that already has 50 through the command engine', async () => {
    const h = new Harness();
    const wh = Object.values(h.db.warehouses).find((w) => w.workspace_id === h.ws && w.active)!;
    const all = zoneCodes('Q', true, 3, 15, 5);
    const send = async (kind: CommandKind, payload: Record<string, unknown>, _p: null, o: { commandId: string }): Promise<Outcome> => ({ status: 'result', result: h.cmd(h.users.supervisor, kind, payload, null, { commandId: o.commandId }) });
    expect((await createSpots(send, wh.code, all.slice(0, 50), 'RACK', 'first')).error).toBe('');
    // The builder sends the 175 it does not know about; codes that exist already would be skipped anyway.
    const r = await createSpots(send, wh.code, all.slice(50), 'RACK', 'more');
    expect(r).toEqual({ made: 175, error: '' });
    const made = Object.values(h.db.locations).filter((l) => l.warehouse_id === wh.id && l.code.startsWith('Q-'));
    expect(made).toHaveLength(225);
    // Pressing Create again with every code is safe: existing spots are skipped, nothing is duplicated.
    expect((await createSpots(send, wh.code, all, 'RACK', 'again')).error).toBe('');
    expect(Object.values(h.db.locations).filter((l) => l.warehouse_id === wh.id && l.code.startsWith('Q-'))).toHaveLength(225);
  });
});
