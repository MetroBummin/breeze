/* What the toss build is allowed to ship.
   Web, iOS and Android do not read this file. */

export const TOSS_APP_NAME='breeze';

/* @apps-in-toss/web-framework 3.9 is SDK 3.1+. The FAQ names a different
   pair for 3.0.0–3.1.0. Register both pairs if a 3.0 bundle might still run. */
export const TOSS_CORS_ORIGINS=[
  `https://${TOSS_APP_NAME}.apps.tossmini.com`,
  `https://${TOSS_APP_NAME}.private-apps.tossmini.com`,
  `https://${TOSS_APP_NAME}.web.tossmini.com`,
  `https://${TOSS_APP_NAME}.private-web.tossmini.com`,
];

export const TOSS_FEATURES=['classics','word-lookup','vocabulary'];

const FORBIDDEN=new Set([
  'login','email-login','apple-login','google-login',
  'pdf-import','epub-import','txt-import','article-import',
  'external-link','install-prompt','website-share',
  'service-worker','dark-mode','remote-page','iframe',
]);

export function tossBuildAllows(feature){
  return TOSS_FEATURES.includes(feature);
}

export function tossBuildForbids(feature){
  return FORBIDDEN.has(feature);
}
