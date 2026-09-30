// Plans, the on-site setup fee and the area a tech can drive to. Beta prices: change them here and the
// website, survey and pricing page all follow.

import { surveyNumbers, type SurveyAnswers } from './survey';

export type PlanId = 'starter' | 'plus' | 'business';
export interface Plan {
  id: PlanId;
  name: string;
  monthly: number;
  people: number;
  warehouses: number;
  blurb: string;
  features: string[];
}

export const PLANS: Plan[] = [
  { id: 'starter', name: 'Starter', monthly: 29, people: 5, warehouses: 1, blurb: 'For a small crew in one building.', features: ['Up to 5 people', 'Every tracking feature', 'Paper records included'] },
  { id: 'plus', name: 'Plus', monthly: 49, people: 15, warehouses: 1, blurb: 'For a full crew on more than one shift.', features: ['Up to 15 people', 'Every tracking feature', 'Paper records included'] },
  { id: 'business', name: 'Business', monthly: 99, people: 50, warehouses: 5, blurb: 'Bigger crews and more than one building.', features: ['Up to 50 people', 'Up to 5 warehouses', 'Paper records included'] },
];

/** Optional add-on on any plan: photos and documents on every record, backed up online. */
export const CLOUD_ADDON = { name: 'Cloud document backup', monthly: 5.99 } as const;
export const money = (n: number) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;

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
  /** Plan plus the cloud add-on when it was picked. */
  monthly: number;
  cloud: boolean;
  setupFee: number;
  /** Estimated hours to set it up yourself, from the survey's zones, spots and labels. */
  hours: number;
  techAvailable: boolean;
}

/** A tech visit is the small fee when the setup is about a day's work or less. */
const SMALL_SETUP_HOURS = 6;

export function recommendPlan(a: SurveyAnswers): PlanPick {
  const plan = a.people === 'large' ? PLANS[2] : a.people === 'medium' ? PLANS[1] : PLANS[0];
  const why = plan.id === 'business' ? 'More than 15 people will use it.' : plan.id === 'plus' ? 'Your crew is more than 5 people.' : 'Up to 5 people in one building.';
  const cloud = a.files === 'cloud';
  const hours = surveyNumbers(a).hours;
  return { plan, why, monthly: Math.round((plan.monthly + (cloud ? CLOUD_ADDON.monthly : 0)) * 100) / 100, cloud, setupFee: hours > SMALL_SETUP_HOURS ? SETUP_FEE.large : SETUP_FEE.small, hours, techAvailable: inSetupArea(a.zip) };
}
