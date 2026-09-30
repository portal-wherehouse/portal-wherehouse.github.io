// Plans, the on-site setup fee and the area a tech can drive to. Beta prices: change them here and the
// website, survey and pricing page all follow.

import type { SurveyAnswers } from './survey';

export type PlanId = 'starter' | 'plus' | 'business';
export interface Plan {
  id: PlanId;
  name: string;
  monthly: number;
  people: number;
  warehouses: number;
  files: 'paper' | 'cloud';
  blurb: string;
  features: string[];
}

export const PLANS: Plan[] = [
  { id: 'starter', name: 'Starter', monthly: 29, people: 5, warehouses: 1, files: 'paper', blurb: 'Find anything, with paper records.', features: ['Up to 5 people', 'Every tracking feature', 'Printed paperwork; nothing extra saved online'] },
  { id: 'plus', name: 'Plus', monthly: 49, people: 15, warehouses: 1, files: 'cloud', blurb: 'Photos and paperwork saved online.', features: ['Up to 15 people', 'Every tracking feature', 'Photos and documents saved online'] },
  { id: 'business', name: 'Business', monthly: 99, people: 50, warehouses: 5, files: 'cloud', blurb: 'Bigger crews and more than one building.', features: ['Up to 50 people', 'Up to 5 warehouses', 'Photos and documents saved online'] },
];

/** One-time price for a tech to come set everything up: zones, spots, labels hung, items loaded, crew trained. */
export const SETUP_FEE = { small: 299, large: 499 } as const;

export const TECH_HOME_ZIP = '29403';
/** South Carolina zip codes within about an hour's drive of Charleston (29403), from zip centroids within 45 miles, leaving out the Beaufort side where the roads run long, plus Georgetown. */
export const SETUP_ZIPS = new Set([
  '29401', '29402', '29403', '29404', '29405', '29406', '29407', '29409', '29410', '29412', '29413', '29414', '29415', '29416', '29417', '29418', '29419', '29420', '29422', '29423', '29424', '29425', '29426',
  '29429', '29430', '29431', '29433', '29434', '29435', '29436', '29437', '29438', '29439', '29440', '29445', '29446', '29447', '29448', '29449', '29450', '29451', '29452', '29453', '29455', '29456', '29457',
  '29458', '29461', '29464', '29465', '29466', '29468', '29469', '29470', '29472', '29474', '29476', '29477', '29479', '29482', '29483', '29484', '29485', '29486', '29487', '29488', '29492',
]);

export const cleanZip = (zip: string) => zip.replace(/\D/g, '').slice(0, 5);
export const inSetupArea = (zip: string) => SETUP_ZIPS.has(cleanZip(zip));

export interface PlanPick {
  plan: Plan;
  why: string;
  setupFee: number;
  techAvailable: boolean;
}

export function recommendPlan(a: SurveyAnswers): PlanPick {
  const big = a.count === 'to10000' || a.count === 'over10000';
  const zones = Object.values(a.zones).some((z) => z === 'several' || z === 'many');
  const plan = a.people === 'large' || a.people === 'medium' ? (a.people === 'large' ? PLANS[2] : PLANS[1]) : a.files === 'cloud' ? PLANS[1] : PLANS[0];
  const why =
    plan.id === 'business'
      ? 'You have a big crew, so you need room for more people.'
      : plan.id === 'plus'
        ? a.people === 'medium'
          ? 'Your crew is more than 5 people.'
          : 'You want photos and paperwork saved online.'
        : 'A small crew with paper records keeps it simple and cheap.';
  return { plan, why, setupFee: big || zones ? SETUP_FEE.large : SETUP_FEE.small, techAvailable: inSetupArea(a.zip) };
}
