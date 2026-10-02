// An app newer than the deployed Cloud Functions: which errors mean "the server needs an update".
import { describe, expect, it } from 'vitest';
import { serverTooOld } from '../../src/config/serverVersion';
import { visibleNav } from '../../src/features/more/More';

describe('server older than the app', () => {
  it('spots a function that is not deployed and a command the server does not know', () => {
    expect(serverTooOld({ code: 'functions/not-found', message: 'NOT_FOUND' })).toBe(true);
    expect(serverTooOld({ code: 'functions/unimplemented' })).toBe(true);
    // Functions from before the version check send this exact message with no details.
    expect(serverTooOld({ code: 'functions/invalid-argument', message: 'The request is not valid. [400]' })).toBe(true);
    expect(serverTooOld({ code: 'functions/invalid-argument', message: 'The request is not valid.', details: { reason: 'invalid-command' } })).toBe(true);
  });

  it('leaves ordinary refusals alone', () => {
    expect(serverTooOld({ code: 'functions/invalid-argument', message: 'Import up to 80 rows at a time.' })).toBe(false);
    expect(serverTooOld({ code: 'functions/failed-precondition', message: 'Ask this person to create an account first.' })).toBe(false);
    expect(serverTooOld({ code: 'functions/permission-denied' })).toBe(false);
    expect(serverTooOld(new Error('offline'))).toBe(false);
    expect(serverTooOld(null)).toBe(false);
  });
});

describe('menu for a real warehouse', () => {
  const routes = (nav: ReturnType<typeof visibleNav>) => nav.groups.flatMap((g) => g.items.map((i) => i.route));
  it('offers Pick orders and Transfers to owners even when picking is off and there is one warehouse', () => {
    const owner = routes(visibleNav('OWNER', false, true, true, false, false));
    expect(owner).toContain('orders');
    expect(owner).toContain('transfers');
    expect(owner).toContain('station');
    expect(owner).toContain('map');
  });
  it('offers Pick orders to the crew when it is on, and never to viewers', () => {
    expect(routes(visibleNav('OPERATOR', false, true, true, false, true))).toContain('orders');
    expect(routes(visibleNav('OPERATOR', false, true, true, false, false))).not.toContain('orders');
    expect(routes(visibleNav('VIEWER', false, true, true, false, true))).not.toContain('orders');
  });
});
