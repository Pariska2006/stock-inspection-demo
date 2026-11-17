/* Copy values into config.js only after company sandbox integration verification.
 * This file is not loaded. URLs are PUBLIC authenticated gateway URLs, never
 * signed Power Automate trigger URLs, bearer tokens, secrets or Microsoft tokens.
 */
window.STOCK_CONFIG = Object.freeze({
  mode: 'live',
  liffId: 'YOUR_LIFF_ID',
  usersReadUrl: 'https://YOUR-APPROVED-READ-GATEWAY/users',
  jobsReadUrl: 'https://YOUR-APPROVED-READ-GATEWAY/jobs',
  registrationWriteUrl: 'https://YOUR-APPROVED-WRITE-GATEWAY/register',
  writeGatewayUrl: 'https://YOUR-APPROVED-WRITE-GATEWAY/write',
  photoGatewayUrl: 'https://YOUR-APPROVED-WRITE-GATEWAY/photos',
  writesEnabled: false,
  integrationVerified: false
});
