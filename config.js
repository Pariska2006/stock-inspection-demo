/* Production: real LINE and n8n reads; only STK_04 registration writes permitted.
   Do not put Power Automate signed URLs, tokens, or secrets in public GitHub.
   STK_08/STK_06 inspection writes remain disabled until the server supports
   criterion-level partial updates and confirmed saved versions. */
window.STOCK_CONFIG = Object.freeze({
  mode: 'live',
  liffId: '2012530584-4TCAHUlC',
  usersReadUrl: 'https://n8n-hook.siamkubota.co.th/webhook/stk-liff-users-v1',
  jobsReadUrl: 'https://n8n-hook.siamkubota.co.th/webhook/stk-liff-jobs-v1',
  registrationWriteUrl: 'https://n8n-hook.siamkubota.co.th/webhook/stk-liff-users-v1',
  registrationEnabled: true,
  writeGatewayUrl: 'https://n8n-hook.siamkubota.co.th/webhook/stk-liff-write-v1',
  photoGatewayUrl: '',
  writesEnabled: false,
  integrationVerified: false
});
