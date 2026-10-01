// Public checkbox key. App Check uses a separate score-based key supplied at build time.
export const SIGNUP_CHECKBOX_KEY = '6Le8Q9YtAAAAAB1suUpQIMhi4T71drOz4fd7eI1A';

/**
 * Hosts where new accounts may be created: createAccount (firebase/functions/src/registration.ts)
 * rejects a sign-up checkbox token whose attested hostname is not listed here.
 * On the custom domain every account flow runs on the app host (src/config/hosts.ts sends it there);
 * the apex is listed as well. www. never creates accounts, so it is not listed.
 * For another domain: add its apex and app hosts here, then deploy the functions.
 */
export const SIGNUP_HOSTNAMES: readonly string[] = [
  'portal-wherehouse.github.io',
  // Custom domain (Cloudflare Pages).
  'wherehousetracking.com',
  'app.wherehousetracking.com',
];
