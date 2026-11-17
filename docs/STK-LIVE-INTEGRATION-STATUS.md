# Stock Inspection — live integration staging audit (17 Nov 2026)

## Current deployed isolation
- Website root: White Minimal **MOCK**, writes disabled.
- `preview/white-minimal/`: White Minimal MOCK, writes disabled.
- `preview/live-read/`: White Minimal frontend configured for LINE LIFF and **read-only** STK_04 + STK_07. Writes and registration disabled. Actual live connectivity and LINE callback remain unverified.
- No n8n/Power Automate workflow, Microsoft List, permissions or actual business records changed by this staging commit.

## Reviewed exported workflows
- STK_04_LIFF_Users_TeamsBridge_V3_LIVE_REGISTRATION (16 Nov): POST /stk-liff-users-v1, action status/register, LINE token verification, STK_Users read, registration delegates to Power Automate. Staging uses only status (registration disabled).
- STK_07_Read_Jobs_Inspections_V2_SAFE (16 Nov): POST /stk-liff-jobs-v1 action jobs; Graph reads STK_Jobs and STK_Inspections; output jobs with records. Rows exceeding maxRows or Graph nextLink set partial. This legacy flow does not implement approved cursor pagination and may be incomplete.
- STK_08_Write_Stock_STK06_V2_SAFE (13 Nov): POST /stk-liff-write-v1; forwards approved LINE actor and job payload to PA. Its saveInspection accepts only four OK/NG/NA results, silently defaults blank to NA, computes NG/OK aggregate, requires NG detail and lacks the versioned, criterion-ID patch and durable clientRequestId contract required by current frontend. **Not safe to enable for White Minimal V2**.

## Blockers before enabling any write
1. Supply/review actual Power Automate STK_06 and STK_09 definitions and STK_10/photo webhook if currently in use. Verify no n8n direct Microsoft mutations.
2. Review internal names and types of STK_Jobs, STK_Inspections, STK_Users columns, including target, models, criteria, versions and photo URLs.
3. Upgrade writer to preserve blank Pending versus explicit NA; support >4 criteria if agreed; support patch-only saves, server authorization, job+serial uniqueness, ETag/version checks, durable clientRequestId, append-only audit and request status lookup.
4. Fix STK_07 pagination and verify complete joins, no lost/unmatched rows; normalize legacy NA with human-reviewed schema semantics.
5. Implement photo upload through approved Power Automate and require confirmed URL/request readback.
6. Verify LINE LIFF allowed endpoint, pending/approved/blocked account behavior, device camera and real QR PIN extraction, browser PDF printing and company access approval.
7. Test sandbox first and obtain sign-off. Never store signed PA trigger URLs, tokens or secrets in public GitHub.

## Testing
- Code staged, NOT verified against live endpoints. Production writes remain OFF.
- To test after Pages deployment: open preview/live-read/ with an approved LINE account; verify the login and that STK_Jobs totals/records match Microsoft Lists, ensuring partial reads are treated as incomplete. Do not treat the stage as available for editing.
- If Login fails, inspect LIFF endpoint allowlist, n8n workflow active status, network/CORS and approved membership — do not disable authentication.

## Rollback
- Previous site is saved in branch backup/main-before-white-minimal-20261117.
