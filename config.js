/* Production: LINE + n8n reads and four-slot STK_08/STK_06 writes.
   Writes are enabled only after STK_07 confirms a complete four-slot read.
   No atomic concurrency guarantee. Never expose signed PA URLs or credentials. */
window.STOCK_CONFIG = Object.freeze({
  mode: 'live',
  liffId: '2012530584-4TCAHUlC',
  usersReadUrl: 'https://n8n-hook.siamkubota.co.th/webhook/stk-liff-users-v1',
  jobsReadUrl: 'https://n8n-hook.siamkubota.co.th/webhook/stk-liff-jobs-v1',
  registrationWriteUrl: 'https://n8n-hook.siamkubota.co.th/webhook/stk-liff-users-v1',
  registrationEnabled: true,
  writeGatewayUrl: 'https://n8n-hook.siamkubota.co.th/webhook/stk-liff-write-v1',
  photoGatewayUrl: '',
  writesEnabled: true,
  fourSlotBridgeEnabled: true,
  integrationVerified: false
});
