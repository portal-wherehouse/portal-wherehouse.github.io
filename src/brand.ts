// Product name and creator credit in one place, so a rename is a one-line change.

export const BRAND = {
  /** The product name. */
  name: 'Wherehouse',
  /** The signed-in app, as the website's buttons call it. */
  portal: 'Wherehouse Portal',
  /** One line under the name. */
  tagline: 'Know where everything is.',
  /** Where the Help page's contact form and the website's contact page send people. */
  supportEmail: 'support@wherehousetracking.com',
} as const;

export const CREATOR = {
  name: 'John Henry Mims',
  email: 'support@wherehousetracking.com',
  linkedin: 'https://www.linkedin.com/in/john-henry-mims-3161a9237/',
} as const;
