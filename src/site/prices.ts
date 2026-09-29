// Placeholder plan prices, shared by the home page teaser and the Pricing page so the two always agree.
// Per warehouse per month on monthly billing. Every place that shows them labels them as placeholders.
// Each is a multiple of 6, so annual billing (ten months for twelve) comes out to whole dollars a month.

export const PLACEHOLDER_MONTHLY = { starter: 48, team: 132, company: 300 } as const;
