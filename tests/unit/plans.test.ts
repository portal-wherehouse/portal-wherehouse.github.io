import { describe, expect, it } from 'vitest';
import { CLOUD_ADDON, inSetupArea, recommendPlan, SETUP_FEE } from '../../src/domain/plans';
import { BLANK_ANSWERS, type SurveyAnswers } from '../../src/domain/survey';

describe('plans and tech setup', () => {
  it('covers about an hour around Charleston and nothing far away', () => {
    for (const z of ['29403', '29464', '29485', '29461', '29440']) expect(inSetupArea(z)).toBe(true);
    for (const z of ['29201', '29902', '90210', '', '2940']) expect(inSetupArea(z)).toBe(false);
  });
  it('picks a plan from crew size and adds cloud backup on top', () => {
    expect(recommendPlan({ ...BLANK_ANSWERS, people: 'solo', files: 'paper' })).toMatchObject({ monthly: 29, cloud: false });
    expect(recommendPlan({ ...BLANK_ANSWERS, people: 'small', files: 'cloud' })).toMatchObject({ monthly: 29 + CLOUD_ADDON.monthly, cloud: true });
    expect(recommendPlan({ ...BLANK_ANSWERS, people: 'medium' }).plan.id).toBe('plus');
    expect(recommendPlan({ ...BLANK_ANSWERS, people: 'large' }).plan.id).toBe('business');
  });
  it('charges the larger setup fee when setup is more than a day’s work', () => {
    const small: SurveyAnswers = { ...BLANK_ANSWERS, profile: 'furniture', groups: ['sofas'], layout: { sofas: { place: 'floor', areas: 1, qty: 0, kept: 'own' } } };
    const big: SurveyAnswers = { ...BLANK_ANSWERS, profile: 'pallets', groups: ['full', 'cases'], layout: { full: { place: 'racks', areas: 6, qty: 3, kept: 'own' }, cases: { place: 'shelves', areas: 2, qty: 3, kept: 'own' } } };
    expect(recommendPlan(small).setupFee).toBe(SETUP_FEE.small);
    expect(recommendPlan(big).setupFee).toBe(SETUP_FEE.large);
  });
});
