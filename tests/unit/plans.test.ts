import { describe, expect, it } from 'vitest';
import { inSetupArea, recommendPlan, SETUP_FEE } from '../../src/domain/plans';
import { BLANK_ANSWERS } from '../../src/domain/survey';

describe('plans and tech setup', () => {
  it('covers about an hour around Charleston and nothing far away', () => {
    for (const z of ['29403', '29464', '29485', '29461', '29440']) expect(inSetupArea(z)).toBe(true);
    for (const z of ['29201', '29902', '90210', '', '2940']) expect(inSetupArea(z)).toBe(false);
  });
  it('picks a plan from crew size and file storage', () => {
    expect(recommendPlan({ ...BLANK_ANSWERS, people: 'solo', files: 'paper' }).plan.id).toBe('starter');
    expect(recommendPlan({ ...BLANK_ANSWERS, people: 'small', files: 'cloud' }).plan.id).toBe('plus');
    expect(recommendPlan({ ...BLANK_ANSWERS, people: 'medium' }).plan.id).toBe('plus');
    expect(recommendPlan({ ...BLANK_ANSWERS, people: 'large' }).plan.id).toBe('business');
  });
  it('charges the larger setup fee for big buildings', () => {
    expect(recommendPlan({ ...BLANK_ANSWERS, count: 'under100' }).setupFee).toBe(SETUP_FEE.small);
    expect(recommendPlan({ ...BLANK_ANSWERS, count: 'over10000' }).setupFee).toBe(SETUP_FEE.large);
  });
});
