import { describe, expect, it } from 'vitest';
import { BLANK_ANSWERS, PROFILE_IDS, builderDefaults, groupsFor, hoursText, muchOrMany, planZones, plannedSpotsByZone, recommend, surveyNumbers, surveyWords, surveyZones, type SurveyAnswers } from '../../src/domain/survey';

const auto: SurveyAnswers = {
  ...BLANK_ANSWERS,
  profile: 'auto',
  groups: ['drivetrain', 'fluids', 'tires'],
  layout: {
    drivetrain: { place: 'racks', areas: 2, qty: 1, kept: 'own' },
    fluids: { place: 'cabinets', areas: 1, qty: 1, kept: 'shared' },
    tires: { place: 'tires', areas: 3, qty: 2, kept: 'shared' },
  },
};

describe('setup survey', () => {
  it('gives each kind of business its own inventory', () => {
    expect(groupsFor('auto').main.map((g) => g.id)).toContain('tires');
    expect(groupsFor('pallets').main.map((g) => g.id)).not.toContain('tires');
    expect(groupsFor('auto').more.length).toBeGreaterThan(0);
  });
  it('uses the business words and turns reserving on only when asked', () => {
    expect(recommend({ ...BLANK_ANSWERS, profile: 'auto', hold: 'none' }).setup).toMatchObject({ preset: 'shelves', thing: 'Part', things: 'Parts', jobs_on: false });
    expect(recommend({ ...BLANK_ANSWERS, profile: 'auto', hold: 'customer' }).setup).toMatchObject({ job: 'Customer', jobs: 'Customers', jobs_on: true });
  });
  it('takes custom words and cleans them', () => {
    const r = recommend({ ...BLANK_ANSWERS, profile: 'custom', word: ' tote!! ', hold: 'other', holdWord: 'rental' });
    expect(r.setup).toMatchObject({ thing: 'Tote', things: 'Totes', job: 'Rental', jobs: 'Rentals' });
  });
  it('turns the layout into lettered zones with spot counts', () => {
    const z = planZones(auto);
    expect(z.map((x) => x.letters.join(''))).toEqual(['AB', 'C', 'DEF']);
    // 30 transmissions, one each, with 25% room: 38 spots. 500 bottles of fluid in bins of 30: 17 bins, 22 spots.
    expect(z[0]).toMatchObject({ units: 30, labeled: 30, spots: 38 });
    expect(z[1]).toMatchObject({ units: 500, labeled: 17, spots: 22 });
    expect(surveyZones(auto).map((x) => x.name)).toEqual(['Engines and transmissions 1', 'Engines and transmissions 2', 'Fluids and chemicals', 'Tires and wheels 1', 'Tires and wheels 2', 'Tires and wheels 3']);
  });
  it('counts labels by size and estimates setup time', () => {
    const n = surveyNumbers(auto);
    expect(n.zones).toBe(6);
    expect(n.spots).toBe(38 + 22 + 94);
    expect(n.smallLabels + n.bigLabels).toBe(n.spots + n.unitLabels);
    expect(n.sheets).toBe(Math.ceil(n.smallLabels / 30));
    expect(n.hours).toBeGreaterThanOrEqual(1);
    expect(surveyNumbers({ ...auto, layout: { ...auto.layout, tires: { ...auto.layout.tires, qty: 3 } } }).hours).toBeGreaterThan(n.hours);
  });
  it('writes rules from the limits and the handling notes', () => {
    const r = recommend({ ...auto, limits: ['weight', 'count'] });
    expect(r.advanced).toBe(true);
    expect(r.rules.join(' ')).toMatch(/weight limit/);
    expect(r.rules.join(' ')).toMatch(/fluids and chemicals their own zone/);
    expect(recommend({ ...auto, limits: ['none'] }).advanced).toBe(false);
  });
  it('judges printers and suggests a thermal one for lots of big labels', () => {
    expect(recommend({ ...BLANK_ANSWERS, hasPrinter: 'yes', printer: 'thermal4' }).printer.verdict).toBe('works');
    expect(recommend({ ...BLANK_ANSWERS, hasPrinter: 'yes', printer: 'handheld' }).printer.verdict).toBe('no');
    expect(recommend({ ...BLANK_ANSWERS, hasPrinter: 'yes', printer: 'brother' }).printer.verdict).toBe('no');
    const pallets: SurveyAnswers = { ...BLANK_ANSWERS, profile: 'pallets', groups: ['full'], layout: { full: { place: 'racks', areas: 4, qty: 3, kept: 'own' } }, hasPrinter: 'no' };
    expect(recommend(pallets).printer.body).toMatch(/thermal/);
  });
  it('recommends import for big stock and crew for teams', () => {
    const r = recommend({ ...auto, people: 'small', layout: { ...auto.layout, tires: { place: 'tires', areas: 3, qty: 3, kept: 'own' } } });
    expect(r.steps.join(' ')).toMatch(/Import/);
    expect(r.steps.join(' ')).toMatch(/crew/);
  });
});

describe('zone letters', () => {
  it('never repeats a letter, even past Z', async () => {
    const { zoneLetter } = await import('../../src/domain/survey');
    const all = Array.from({ length: 60 }, (_, n) => zoneLetter(n));
    expect(new Set(all).size).toBe(60);
    expect(all[22]).toBe('Z');
    expect(all[23]).toBe('AA');
    expect(all.some((l) => /[IOQ]/.test(l))).toBe(false);
  });
  it('does not offer "Small parts" to a business that already has "Small parts and hardware"', async () => {
    const { groupsFor } = await import('../../src/domain/survey');
    const more = groupsFor('auto').more.map((x) => x.id);
    expect(more).not.toContain('small');
    expect(more).not.toContain('liquids');
  });
});

describe('survey wording', () => {
  it('asks "how many" for nouns counted one by one and "how much" for the rest', () => {
    expect(muchOrMany('parts')).toBe('many');
    expect(muchOrMany('pallets')).toBe('many');
    expect(muchOrMany('Totes')).toBe('many');
    expect(muchOrMany('equipment')).toBe('much');
    expect(muchOrMany('inventory')).toBe('much');
    const byProfile = Object.fromEntries(PROFILE_IDS.map((id) => [id, muchOrMany(surveyWords({ ...BLANK_ANSWERS, profile: id }).noun)]));
    expect(byProfile).toMatchObject({ auto: 'many', pallets: 'many', equipment: 'much', custom: 'much' });
  });
  it('says "1 hour" but "1.5 hours"', () => {
    expect(hoursText(1)).toBe('1 hour');
    expect(hoursText(1.5)).toBe('1.5 hours');
    expect(hoursText(12)).toBe('12 hours');
  });
});

describe('spot builder defaults from the survey', () => {
  it('splits each group over its zones', () => {
    const planned = plannedSpotsByZone(auto);
    const zones = planZones(auto);
    expect(Object.keys(planned)).toEqual(surveyZones(auto).map((z) => z.letter));
    for (const z of zones) for (const l of z.letters) expect(planned[l]).toBe(Math.ceil(z.spots / z.letters.length));
  });
  it('starts the builder at the planned count, not a fixed 15', () => {
    expect(builderDefaults('FLOOR', 8)).toEqual({ aisles: 1, bays: 8, levels: 1 });
    expect(builderDefaults('RACK', 8)).toEqual({ aisles: 1, bays: 2, levels: 4 });
    expect(builderDefaults('RACK', 1)).toEqual({ aisles: 1, bays: 1, levels: 1 });
    for (const n of [1, 2, 3, 5, 7, 8, 13, 40, 75, 160, 750]) {
      const d = builderDefaults('RACK', n);
      const total = d.aisles * d.bays * d.levels;
      expect(total).toBeGreaterThanOrEqual(n);
      expect(total - n).toBeLessThanOrEqual(Math.max(2, Math.ceil(n * 0.1)));
      expect(d.bays).toBeLessThanOrEqual(60);
    }
  });
});
