# White Minimal upgrade — 17 November 2026

This revision supersedes the Dark Navy design. Earlier audit and integration documents describe the historical baseline; the v2 contract below takes precedence. No production deployment, schema mutation or merge has been performed.

## Implemented
White/grey surfaces, Kubota green, bundled Lucide icons; mobile navigation and logo/name throughout. Dashboard separates jobs, target vehicles, inspected vehicles and mutually exclusive OK/NG/Pending/NA totals. Search includes Serial; filters include all affected products/models. Vehicles group by model. Six products supported: M, MU, L, B, RX, FGL.

Up to 20 stable-ID criteria, independent notes and NG detail, last inspector/date, resume on the same record, changed-only criterion patches and versioned audit history. Blank means Pending; explicit NA counts as answered. Any NG takes precedence even when incomplete; all NA is NA, never OK. Legacy NA is shown as Pending until reviewed because the old system used NA for unchecked results.

PIN parsing prefers explicitly labelled PIN over SN; Engine S/N and Material Number cannot be substituted. Model is read only from an explicit Model field or entered/selected by the inspector. QR results require confirmation; native BarcodeDetector and bundled jsQR remain supported. Parsing rules are provisional until authorized real label samples are available.

Job OK/NG/method references are shared across vehicles. Per-vehicle evidence is label/PIN only. Image compression, preview, request journaling and Pending/Uploaded/Failed states are implemented. Only matching request identity plus HTTPS URL readback confirms storage. Failed replacement retains the previous URL. MOCK saves the inspection but explicitly reports photo upload Failed because it stores no real file.

Job, serial and monthly A4 Thai reports support open jobs, generation time, completeness/status and MOCK labels. Browser Print provides Save as PDF where supported. Actual LINE/mobile printing is NOT TESTED.

## Proposed Microsoft Lists mapping — not applied
Existing schemas and internal column names remain UNVERIFIED. Review existing columns before adding anything; reuse STK_Jobs and STK_Inspections. No new list is prescribed.

| List | Proposed fields / contract | Mapping |
|---|---|---|
| STK_Jobs | JobKey, DocNo2, ClaimCategory, Product, Model, Title, Description, TargetUnits, Status | Stable key distinct from SharePoint numeric item ID |
| STK_Jobs | AffectedProducts, AffectedModels | JSON arrays; reuse existing multi-value columns via adapter if present |
| STK_Jobs | CriteriaJSON | Array of `{id,slot,label}`, unique stable IDs/slots, maximum 20; never reorder IDs after results exist |
| STK_Jobs | CheckingMethod, OKPictureURL, NGPictureURL, MethodPictureURL | Shared reference URLs and matching per-slot request IDs |
| STK_Inspections | JobKey, SerialNumber/PIN, Model, Product, InspectionDate, Location, Inspector, LotNo, Remarks | Job-scoped normalized PIN uniqueness; inspector from validated identity |
| STK_Inspections | CriterionResultsJSON | `{criterionId,result,note,ngDetail,updatedAt,inspector}` array |
| STK_Inspections | OverallResult, IsComplete, SchemaVersion | Server computed; schemaVersion 2 uses explicit NA |
| STK_Inspections | AuditHistoryJSON or existing approved audit storage | Append-only server history, actor/time/request/version, before/after and changed criteria |
| Both | Version / ETag, ClientRequestID, Modified | Atomic compare-and-set, idempotent request status, readback identity |
| STK_Inspections | PhotoURL1, photoUrl1RequestId | Label image only; stored files through Power Automate |

Use existing Model Master if supplied. Reader returns `modelMaster:[{product,model}]` and `modelMasterSource`. Demo fixtures are explicitly not company master data. Manual model requires confirmation when outside job options; never infer model from PIN.

## n8n and Power Automate contract
n8n is READ ONLY against Microsoft Graph/Lists. `status`, `jobs`, `requestStatus`, `modelMaster` are reads, even if browser transport uses POST. Every endpoint validates LINE ID token issuer/audience/expiry and approved membership server-side. Never trust client actor/role. Signed Power Automate URLs and credentials stay server-side.

Reader returns `{status:'OK',jobs,partial,nextCursor,capabilities,modelMaster,modelMasterSource}`. Cursor pagination merges stable IDs and rejects conflicting versions/records and cycles; reads retry once, authentication failures do not retry. Partial data disables writes. Approved cursor resolution belongs to the server, not arbitrary URLs supplied by the browser.

Writer gateway forwards only to approved Power Automate flows. Supported actions: createJob, updateJob, selectJob, saveInspection, finishJob. Request envelope includes `clientRequestId`, `payload`, `idToken`. Save payload includes expectedJobVersion, expectedVersion, numeric item IDs, changes by criterionId and aggregate fields. Server validates scope and computes totals independently, rejects duplicates atomically, retains unchanged criterion metadata, and appends audit history in the same protected update. Reject stale versions before mutation. Idempotency must be durable and keyed by identity/action/request with payload conflict detection. Responses: WRITE_REQUEST_ACCEPTED or definitive WRITE_REJECTED. Timeout remains unresolved; query original request ID and read back, never blindly resubmit.

Enable writes only after capabilities `inspectionV2`, `atomicVersions`, `requestStatus`, `auditHistory` are all true and public configuration writesEnabled/integrationVerified are enabled. Photo upload additionally requires photoReadback. These frontend gates do not replace server authorization.

STK_04, STK_07, STK_08, STK_10, STK_06 and STK_09 definitions were not provided/accessible. Their actual trigger schemas and mapping are NOT VERIFIED. No workflow was modified. SharePoint discovery found an available connector but no active connection; n8n/Power Automate access and real Model Master were unavailable.

## Integration acceptance checklist
- [ ] Export/redact existing workflows and inspect real internal List column names and choices.
- [ ] Map each workflow action to the approved gateway; confirm n8n cannot mutate Microsoft data.
- [ ] Test approved/pending/blocked/expired identities and cross-job authorization in a staging tenant.
- [ ] Verify duplicate racing requests, durable request IDs, ETag conflicts, atomic audit append and replay.
- [ ] Verify paginated reads, partial failures, throttling and readback after lost acknowledgements.
- [ ] Verify old NA migration through explicit human review; never mass-convert unchecked NA to completed NA.
- [ ] Upload/replace each reference and label slot; verify file exists, URL binding/request ID, access controls and retention of old URL after failure.
- [ ] Compare all three reports to Lists totals and Thai PDF output.
- [ ] Test actual Kubota QR labels for all products and real iOS/Android LINE WebView camera/print flows.

## Deployment guide
Run `npm ci --ignore-scripts`, `npm run check`, `npm test`, `npm run test:browser`, `npm run test:a11y`. Serve with `npm start`. Default config remains MOCK with blank URLs and writes disabled. Publish static files to a staging HTTPS origin only after review; configure LIFF allowed origin and approved gateway CORS there. Complete the checklist before changing mode to live or enabling writes. Preserve previous deployment/config for rollback; do not roll back schema semantics without a migration review. Production deployment and main merge require a separate explicit instruction.
