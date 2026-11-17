# QA results — 16 November 2026

Tests run locally against isolated fixtures. No production endpoint or Microsoft 365 write was performed. Node 24.22.1, Playwright 1.62.1, headless Chromium 156.0.8078.79 on Linux. Thai UI, Bangkok business dates.

## Results

| Check | Result | Evidence / scope |
|---|---|---|
| JavaScript syntax | PASS | `npm run check` |
| Domain + mock | PASS — 34/34 | `npm test`: partial NG, NA, aggregation, legacy aggregate, QR validation, dates, Lists aliases, duplicate/idempotency, edit, job lifecycle |
| Browser scenarios | PASS — 24/24 | `npm run test:browser`; `evidence/browser-results.json` |
| Responsive layout | PASS — 72 combinations | 12 screens × 320/375/390/428/768/1440px; document width never exceeds viewport |
| Accessibility automation | PASS — 11 screens | axe-core 4.11.0 WCAG 2 A/AA + 2.1 AA tags; 0 violations on tested mock states; not a conformance certification |
| jsQR fallback | PASS | Actual generated raster QR decoded by vendored jsQR, then parsed to Serial |
| A4 PDF | PASS | Chromium-generated PDF, A4 594.96 × 841.92 pts, 2 pages; Thai text extractable; see `evidence/mock-report-a4.pdf` |
| Production dependency audit | PASS | `npm audit --omit=dev`: 0 reported vulnerabilities; this is not a full security audit |
| Static asset references / whitespace | PASS | All locally referenced assets exist, `git diff --check` |
| Real LINE login / registration approval | NOT TESTED | Only isolated LIFF/API fixtures were used |
| n8n STK_04/07/08/10 and Power Automate STK_06/09 | NOT TESTED | No workflow definitions or sandbox connection available |
| Real Lists joins/counts/permissions | NOT TESTED | No Microsoft tenant data queried or changed |
| Real OneDrive upload and protected photos | NOT TESTED | Failure UI tested locally; no upload success is simulated |
| Physical camera and actual manufacturer QR | NOT TESTED | Browser media stubs + real QR decoder fixture, no physical Android/iPhone camera |
| Safari / LINE WebView / physical printer | NOT TESTED | Headless Chromium only; target-device acceptance remains required |
| Atomic concurrency / cross-device uniqueness | NOT TESTED | Frontend preflight and mock idempotency tested; real server contract must enforce |

## Browser coverage

- Dashboard totals, independent filters, pinning; incomplete NG is counted as NG
- Partial save and double-submit suppression; continue/edit without increasing row count; latest first
- Duplicate Serial, empty criteria results, one criterion, zero-criteria setup
- Create/edit target/title/start/save/finish lifecycle
- Draft reload and tab close/reopen; NA reset; stale criteria draft rejection; no token storage
- Ambiguous timeout journal blocks resend after reload; lost acknowledgement reconciles by client request ID
- Slow network, partial data, stale read state and concurrent record edits
- Camera denied, malformed QR, Serial confirmation, track stopping and late permission completion after dialog closes
- Empty/protected image URL hints; mock photo upload blocked without success
- Per-job/month report counts, HTML escaping, Preview and A4 PDF
- Missing Serial retained in totals; invalid dates shown missing; summary incomplete counts include NG
- Registration double submit, approved/pending/blocked/unregistered/expired user states through isolated fixtures

## Review and limitations

Reviewed screenshots of desktop dashboard and mobile inspection; checked PDF metadata and extracted Thai report text. Screenshots and PDF show mock data clearly. Print export invokes the browser print dialog (Save as PDF), not a backend PDF generator; authenticated evidence thumbnails are visible in preview when authorized and omitted from printed table cells.

An initial browser run found an expired-session gate being overwritten by a generic error; fixed and covered by regression. Test selectors were corrected to expand optional notes before typing. A later local navigation exceeded the original 10-second harness timeout; the navigation timeout was increased to 30 seconds and the suite rerun. These do not constitute testing against production services.

The final browser/accessibility JSON evidence is in `docs/evidence/`. CI is configured to rerun the same mock checks on PRs; a local PASS does not assert a remote CI result. See [manual checklist](MANUAL-TESTING.md) and [integration blockers](INTEGRATION.md) before enabling real writes.
