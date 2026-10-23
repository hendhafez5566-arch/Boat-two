## AI browser fallback/recovery acceptance — 2026-10-23 UTC

Previous diagnostics checkpoint 82b4c69 pushed/remote-verified. New fixture-ai-api runs the real compiled API in an isolated child in test mode with only OpenAI chat mocked before bootstrap; all requests remain local, the child external gate is false and the main API is unchanged. Browser calls are forwarded to that real isolated API. Actual settings save, forced provider failure, custom fallback, human escalation signal, sanitized failure audit and successful independent request are verified; exactly two run rows prevent hidden paid-call retries. Arabic/mobile screenshots saved. Fixture contains only fake provider credentials.

AI-05 now CLOSED; frozen scope 25 CLOSED / 16 OPEN local requirements + 7 external/owner dependencies. All browser regression, final 132-view survey, fresh migrations 001–077/repeat and final evidence consolidation are running. Earlier AI harness failures were selector ambiguity (textarea label/value; duplicate fallback in editor/result), not relaxed runtime assertions; corrected to textbox/result-article scope. Do not claim live external acceptance, full code completion or production readiness.

## Automation execution context and recovery — 2026-10-23 UTC

Previous upload checkpoint 06718ba pushed/remote-verified. Migration 077 records failure path/type/original rule revision for nested actions, including delayed follow-ups which previously lacked the same durable failure attribution. Retry/success resolves matching records; HTTP effect keys and idempotency semantics are preserved. UI shows event/contact/revision/path context, opens current rule explicitly for review and warns to compare saved revisions rather than pretending it loaded the failed historical definition.

New backend debug smoke and actual browser pass: real worker exhausts gated HTTP attempts, shows root.0.then.0/revision 1, owner edits current rule, safe retry produces one note and resolves the failure. Delayed nested path root.0.actions.0.then.0 is independently verified through rollback/recovery without exporting action bodies/URLs. Nested automation/auth/merge regressions pass; complete backend run 52/52 and unit run 64/64 passed. API/web TypeScript, lint and Next build passed. AI recovery browser fixture is still under validation and not counted passed yet.

Scope audit preserves previously mentioned authentication template work under WA-02 as OPEN (no new ID/backlog). Rich MARKETING/UTILITY authoring remains delivered; OTP is not claimed. AUTO-03 closes, leaving frozen count 24 CLOSED / 17 OPEN local requirements + 7 external/owner dependencies until remaining acceptance is updated. No code-complete/production claim, merge, deployment or real external/financial write.

## Chunked CRM upload and remaining control labels — 2026-10-23 UTC

Previous bot localization checkpoint 6e040c6 pushed/remote-verified. Migration 076 adds uploading CRM job state, immutable normalized import rows, uploaded counters and expiry cleanup. Existing APIs/worker remain: new upload/start/append/finalize endpoints enforce owner/admin, tenant isolation, ordered offsets, exact replay comparison, atomic duplicate chunks and finalization before worker processing. File fingerprints identify resumable input; they are not provider-certified signatures. New UI uploads 100-row chunks (reduced further below request budget), resumes same-file interruptions and displays progress/cancellation. Bounds remain 10000 rows, UI 10MB file and server 12MB normalized stored payload. Legacy 1MB request/import path remains compatible.

Backend upload smoke passes resume/conflict/race/finalize/no-early-processing/251-row error isolation/cancel/retention/budget/tenant checks. Actual Chromium deliberately loses a response AFTER the server committed chunk 2, resumes from ordinal 200 and confirms one job/500 exact contacts including full attributes. Arabic RTL/mobile passes. API/web types, ESLint and Next build passed. Existing automation editor browser passes after labelled secret controls and translated action/trigger/lifecycle labels. Survey previously checked all 132 route/language/width views with no overflow/page errors and found only those three now-fixed secret controls.

Frozen scope now 24 CLOSED / 17 OPEN local requirements + 7 external/owner dependencies. CRM-02 closes for safe V1 bounds, not unlimited rows/streaming/production load. Broad final regression, fresh migration 076 and final survey run next. All external/AI/email/billing/domain gates remain false; no real financial writes/merge/deployment.

## Built-in bot language checkpoint — 2026-10-23 UTC

Previous settings checkpoint c1da11c pushed/remote-verified. Built-in flow catalog and new template/blank graph creation now accept validated ar/en, defaulting to Arabic for legacy clients. Only immutable starter content is localized; existing/user-authored graphs are preserved. Wizard and advanced creation pass locale. Bot list, trigger/status/actions/empty state and reusable-component creation are bilingual, the creation form wraps on mobile and its name input is labelled. Inbox title is now a semantic h1.

API TypeScript, ESLint and Next production build passed. New smoke-flow-locales verifies all three English templates and actual engine previews contain English starter content, Arabic originals remain, graph IDs/edges match, English blank works and unsupported locale is rejected. Premium Chromium passes again through seven-step publication/preview, inspector edit, undo/redo, save/version dialog and Inbox/mobile. All dashboard route/direction/layout survey is still running; no global UI-complete claim. Frozen 23 CLOSED / 18 OPEN local requirements + 7 external dependencies unchanged.

## Legacy channel/Inbox settings completion checkpoint — 2026-10-23 UTC

Previous activity export checkpoint e5b7ad2 pushed/remote-verified. Replaced Arabic-only channel creation/deletion and Inbox assignment/canned-reply screens with shared bilingual responsive controls, labelled fields, keyboard/Escape native confirmation dialogs, loading/error/retry/busy/saved states. Channel credential labels, local status and provider job states are translated; stored tokens and existing APIs/behavior are preserved. Config/connection errors now render in MetaConnect.

New settings Chromium passes real API-backed channel create/edit/disable and fetch failure/retry; Inbox assignment save; reply create/edit/delete; deletion cancellation/Escape; English desktop, Arabic RTL/mobile and zero page errors. Current build, lint and TypeScript pass. Previous complete-source regression passed 49 backend suites with zero failures; 12 automated browser suites plus standalone template drafts acceptance passed; new settings adds a separate actual functional journey. Fairness has its independent isolated DB test. 64 unit tests and migrations through 075/repeat pass. Route survey across all dashboard pages/languages/widths is running; it is not functional acceptance or proof of global UI completion.

Frozen count remains 23 CLOSED / 18 OPEN local requirements + 7 external/owner dependencies. Do not claim code complete. No new features outside frozen requirements, real financial writes, external activation, merge or deployment.

## Retained activity export completion — 2026-10-23 UTC

Previous checkpoint a87d49f pushed/remote-verified. Migration 075 extends existing CRM jobs with activity_export, using ordinal storage and the same worker/paging/retention paths. Export freezes retained profile/consent history, notes and conversation/event metadata across canonical/merged identities plus current task/deal values. Source event payloads are excluded. Range validation and 50000-record bound remain. Download includes explicit history semantics/coverage/contact/date metadata. Bilingual customer-profile form queues the job, refreshes the existing jobs list and links to actual JSON download.

API TypeScript, ESLint and production Next build passed. New PostgreSQL smoke verifies 260 notes across chunks, original merged consent/history, post-freeze note mutations, all record categories, no raw-event sentinel, empty/range/tenant checks. Expanded actual CRM Chromium creates and downloads the activity snapshot and checks its real contents in addition to the prior CRM journey. Storage/load fixtures now remove only their own unused contact-trigger events after assertions, preventing artificial test queue pollution. The fairness defect remains fixed and its independent tests passed twice; no assertions/timing thresholds were weakened.

Frozen matrix now 23 CLOSED / 18 OPEN local requirements + 7 external/owner dependencies. Broad latest-source regression and all browser suites run next. No V1 CODE COMPLETE or production claim.

## CRM ordinal storage and tenant dispatch checkpoint — 2026-10-23 UTC

Previous bot checkpoint b99c9f0 pushed/remote-verified. Migration 073 adds tenant-isolated immutable ordinal export payloads and automatic expiration cleanup. New current/historical exports use one PostgreSQL INSERT SELECT to freeze values; job metadata stays small; workers count the next 250 ordinals without copying JSON; API pages use the ordinal index. Existing legacy input/results stay compatible. Existing 50000/10000 limits and 900KB UI import limit remain, and CRM-02 stays OPEN for remaining large upload/storage work.

Targeted API TypeScript/lint, 5000-row frozen export/concurrent worker/replay/immutability/legacy test, existing snapshot/history/paging/retention tests and actual Chromium CRM download pass. Active export rows survive retention; terminal expired payload rows are removed. Fresh migrations 001–073 and repeat passed; 074 then applied/repeated.

Bulk test fixtures exposed actual cross-tenant event starvation: global oldest-first discovery delayed other tenants' CRM exports and web campaigns. Migration 074 interleaves tenant rounds without bypassing failed/due aggregate predecessors. Isolated smoke-dispatch-fairness proves 1000 older events cannot exclude a late tenant from a two-event batch. CRM browser and rich-campaign worker pass after fix. Full post-fix regression is running; earlier failures during the backlog are retained as diagnosis, not final passing evidence. No provider activation/financial writes. Run fairness smoke on an isolated migrated DB; it intentionally refuses an existing due backlog.

Evidence in docs/acceptance/2026-10-23-v1-closure/. Frozen count remains 22 CLOSED / 19 OPEN local requirements + 7 external dependencies. No CODE COMPLETE claim.

## Bot selection/translation and bounded failure/load acceptance — 2026-10-23 UTC

Prior checkpoint c0a08b5 pushed/remote-verified. Expanded Chromium inspector assertion exposed missing React Flow selection on palette add; selected=true now persists the new selection and deselects prior nodes. Advanced inspector is actually opened and edited in the browser; undo/redo retains original node-count assertions, followed by explicit node re-selection after history travel. The full premium journey passes: real seven-step bot publication, preview button, add/undo/redo/edit/save, version Escape, branded invitation queue and Inbox mobile. Builder settings/version dialog/static node summaries are now bilingual with accessible trigger/priority controls. User-authored text is preserved.

New bounded smoke-load: 2000 synthetic contacts, 160 authenticated reads at concurrency 8, correct tenant isolation, zero failures, observed p95 63ms/max 83ms. This is local read throughput only. New smoke-process-crash kills an actual child with SIGKILL after a durable mocked provider attempt: started claim survives, replay refuses a second callback, exactly one attempt remains. No external requests or production capacity/security claim. Evidence in docs/acceptance/2026-10-23-v1-closure/. QA-04 remains open for comprehensive acceptance beyond these fixtures.

Next active unit: remove growing CRM export JSON copying by freezing PostgreSQL ordinal rows and reading bounded pages; this unit is not yet closed at this checkpoint. Frozen IDs remain unchanged.

## V1 closure verification and editor checkpoint — 2026-10-23 UTC

Rich template authoring checkpoint `38aad29` pushed/remote-verified. Current continuation closes template browser acceptance, displays persisted rich card previews, separates media input name/help, translates advanced flow inspector labels/options/hints/default new replies and gives controls accessible names with fieldset grouping. Explicit PostCSS Tailwind config fixes the reproduced root-build missing-content warning. Existing behavior and user-entered content are preserved.

Current evidence: docs/acceptance/2026-10-23-v1-closure/. 45 backend regression scripts passed; 64 unit tests; migrations 001–072 clean/repeated; TypeScript, lint and production build passed. New Chromium template draft and automation editor/recovery journeys pass English desktop/Arabic mobile with real API persistence, no overflow/page errors. Broader browser regression is in progress. Frozen matrix now records 22 local requirements CLOSED, 19 OPEN, 7 external/owner dependencies. No complete/production claim. Continue exact open IDs; all external gates remain false.

## Fixed V1 closure checkpoint — 2026-10-23 UTC

Authoritative frozen scope: [V1_FINAL_CLOSURE_MATRIX.md](V1_FINAL_CLOSURE_MATRIX.md), 48 V1 acceptance requirements (41 local completion/verification + 7 external/owner gates), plus one excluded future boundary. No CODE COMPLETE claim. Baseline and PR #1 verified at 9bf82169; matrix checkpoint 9339398 pushed and remote-verified.

Template authoring checkpoint: migration 072 adds revision checks. Supported MARKETING/UTILITY drafts now author headers (text/image/video/document), footer, quick replies or URL/phone buttons and required provider examples. Media draft examples require an externally obtained Meta upload handle; they are not message URLs. PATCH edits require current revision and DRAFT state. Provider submission commits a SUBMITTING claim before I/O, prevents concurrent requests/edits, and quarantines unknown outcomes for synchronization without blind retry. Rich definitions submit exactly; BODY-only legacy drafts remain compatible. Bilingual rich editor, structural preview, save/error/loading states and reopen editing connect to the existing page. OTP/carousel/location remain unsupported.

Current checks: API TypeScript and Next production build, ESLint, 64 unit tests, clean migrations 001–072 plus no-op repeat; smoke-template-drafts (real PostgreSQL/API, mock provider submission, race, ambiguity, gate, tenant and revision checks), smoke-template-components and smoke-rich-campaigns passed. Browser acceptance is in progress; do not count it as passed yet. No real external or financial writes. All runtime gates remain false.

Runtime reconstructed under /workspace/Boat-two: Docker Compose PostgreSQL, compiled API on 4122 and production Next on 3000. Local .env is ignored and must never be committed. Logs under /workspace/work. Environment supplies pnpm 11 although project expects 9; auto-install inserted invalid allowBuilds placeholders, which were restored. Direct node entrypoints build/run successfully. Unit loader needs TSX_TSCONFIG_PATH=apps/api/tsconfig.json when run from root. Playwright module: /opt/codex/cua_node/lib/node_modules/playwright-core, Chromium /usr/bin/chromium. Bind-mounted init SQL needed world-readable directory/file permissions in this managed environment; no source content change.

Continue remaining frozen IDs directly; update their evidence/status without duplicating historical backlog. Browser template draft harness still being validated at this checkpoint.

## Continuation — actionable campaign recipient ledger (2026-10-23 Cairo)

Recipient API and UI now support bounded contact-name search, processing/delivery/outbound-job filters, filtered counts, job errors/attempts, explicit global totals and loaded-page JSON downloads. Request sequencing discards stale ledger responses. Retry eligibility is authoritative in the API: only failed processing with no prior message and an eligible running/completed campaign can enqueue again. Existing or ambiguous messages cannot be resent through this action. Existing consent/canonical-contact/policy checks still run in the worker.

Verified API/web TypeScript, ESLint and Next production build; new Chromium+PostgreSQL acceptance covers 29-row pagination, literal/case-insensitive search, filters, tenant isolation, existing-message retry denial, actual downloaded JSON, empty state and mobile. Three existing campaign Chromium suites and four backend regression suites reran successfully. The standard unit suite remains 62 passing tests from the template checkpoint. Evidence: docs/acceptance/2026-10-23-campaign-ledger/. Template evidence directory date was corrected to 2026-10-23 (Cairo). No external calls/activation, deployment or merge; broad remaining product work is still open.

## Continuation — approved WhatsApp template components (2026-10-23 Cairo)

Migration 071 preserves synchronized provider components. Supported approved MARKETING/UTILITY variants now include text/image/video/document headers, static footer/phone/URL buttons, indexed dynamic URL suffixes and quick-reply payloads. Composer and draft editor share parameter controls and previews; API and queued outbound worker independently revalidate current approved definitions. BODY-only clients remain compatible. Authentication/OTP, carousel, location and unknown variants stay unsupported; rich provider-template creation/submission remains BODY-only and requires later work. No live provider acceptance or template submission occurred.

Verified: API/web TypeScript, ESLint, Next production build, 62 unit tests, five PostgreSQL/API/worker suites and three production Chromium suites (new template journey plus both campaign regressions). Fresh schema 001–071 and no-op repeat passed. Worker test scopes discovery to its single fixture and uses injected mock adapters; rejected template caused zero sends. Initial regression runner omitted SMOKE_API_URL and reached inactive default ports; rerun at 4122 passed without assertion changes. Browser selector was corrected to target the native template combobox. Local fixture screenshots/results: docs/acceptance/2026-10-23-template-components/. Same branch/Draft PR #1; all gates false, no deployment/merge. Remaining broad product scope from MAXIMUM_COMPLETION_2026-10-23.md still applies, with the supported template subset above now delivered.

## Maximum-scope continuation — 2026-10-23 (latest)

Eleven feature checkpoints were pushed and remote-verified, from `ca2488a` through `e899b79`; final UI acceptance checkpoint follows. Added immutable model catalog and durable generation budgets/replay safety, retained CRM history/retention/paged downloads, rich campaigns, integration auth policies, signed mail receipts/evidence review and licensed-seat preservation. Final UI adds translated statuses, direct-route role feedback, root-build Tailwind content resolution and real workspace/CRM/billing/branding browser journeys.

Validation: 57 unit tests; 43 backend integration/worker suites; clean migrations 001–070 plus no-op repeat; API/web TypeScript, ESLint, Next production build; nine bounded Chromium suites passed. All external/AI/email/receipt/billing/domain gates remain false. No merge/deployment. **Product remains incomplete**: arbitrary multi-item/provider-native billing, full WA template component variants, provider-certified tokenization/catalog, very-large streaming CRM, remaining global UI/accessibility/portal/mail breadth and external production acceptance. Detailed evidence, bounds and next slice: [MAXIMUM_COMPLETION_2026-10-23.md](MAXIMUM_COMPLETION_2026-10-23.md). Earlier dated sections are historical, not the current scope claim.

# Continue here — ELHAFEZ BOAT

## Maximum-scope continuation — subscription quantity safety (2026-10-23)

Plan mutation now explicitly preserves current licensed quantity, rejects metered/invalid quantities and verifies returned price/quantity before applying local state. Billing UI explains per-unit pricing and the remaining multi-item/metered review boundary. Existing no-proration/idempotency/ambiguous-outcome gates are retained. This fixes seat loss risk; it does not claim arbitrary multi-item additions/removals or provider-native schedules.

API/web TypeScript, ESLint, mocked catalog/delinquency and durable subscription-request suites pass. Catalog fixture now asserts five existing seats survive a plan change; unit coverage rejects invalid/metered quantities. Real Stripe calls remain disabled. Next: broad regression, fresh migration validation, full production build and expanded real browser acceptance, then truthful completion matrix/handover.

## Maximum-scope continuation — bounded CRM result downloads (2026-10-23)

Existing export result API now accepts validated ordinal cursors and bounded pages; browser downloads assemble 250-row requests with progress guards. Legacy result clients remain compatible, snapshots retain original values/order and expired jobs still return Gone. This bounds HTTP payloads, not the existing 50,000-row job limit, full worker JSON storage or initial import body limit; those larger-scale/storage constraints remain explicit.

API/web TypeScript, ESLint, paged 251-row export and retention suites pass: page limits, complete ordered equality with the frozen result, cursor progress, bad limits, empty exports, expiry and tenant isolation. Email checkpoint push initially failed with HTTP 503; retried immediately and confirmed remote 8aa94bf before proceeding. Next: safe mocked billing contracts and current-source regression/browser acceptance.

## Maximum-scope continuation — signed mail receipts and evidence reconciliation (2026-10-23)

Migration 070 adds immutable delivery/bounce/failure receipts and separate visible delivery state. Optional gateway callback uses raw-body HMAC, a five-minute timestamp window, stable event/body dedupe, provider/job/tenant binding and monotonic event ordering. Signed evidence may resolve ambiguous acceptance without sending. Owner-only manual accepted/not_sent evidence review also never resends; old effects remain quarantined. Team mail UI displays actual delivery state and review controls. Sending and receipt gates remain disabled separately; EMAIL_GATEWAY_RECEIPTS.md documents the normalized gateway contract.

API/web TypeScript, ESLint, migration and receipt/invitation-mail suites pass: signatures/gates, dedupe/body changes, stale/new bounce order, ambiguity evidence, manual no-resend review, encrypted payload/revocation and RLS. All signatures/provider replies are local fixtures. Other transactional message types and real provider/DNS activation acceptance remain open. Next: paged export results/scaling and billing contract closure, then full regression/browser acceptance.

## Maximum-scope continuation — integration authentication policies (2026-10-23)

Migration 069 extends existing host-bound encrypted secret references with Basic, allowlisted API-key headers and HMAC-SHA256, retaining Bearer compatibility and rotation/version checks. Existing automation editor configures auth and four allowlisted non-secret headers. Executor signs timestamp.body only inside the existing effect callback; replay uses the existing ledger without another request. Host/SSRF/redirect gates and external-delivery flag remain authoritative. Raw secret values never appear in list APIs or workflow definitions.

API/web TypeScript, ESLint, migration, integration-auth and existing nested-automation suites pass: encryption, HMAC vectors, Basic/API-key contracts, forbidden headers/CRLF, host/tenant denial, cached replay and existing delayed workflows. HTTP helper was mocked; no external account or delivery enabled. Next: signed email delivery receipts and evidence-only ambiguity review, then regression and browser acceptance.

## Maximum-scope continuation — connected rich campaign composition (2026-10-23)

Existing campaign JSON/storage/worker/adapters now connect to shared creation/editing controls for images/video/files, reply buttons and choice menus with stable IDs, structural preview and audience editing. Draft edits preserve rich content. API validates public HTTPS media URLs/caption limits, unique option IDs and approved supported WhatsApp BODY templates/contiguous parameters at save and schedule. Meta menus intentionally become quick replies; unsupported rich WhatsApp template component variants remain unavailable.

API/web TypeScript, ESLint and rich-campaign integration pass: actual local website worker delivery of button/menu/media payloads, consent-filtered audiences, invalid URL/duplicate IDs/template denial, approved BODY parameter validation and mocked WhatsApp/Meta payloads. Chromium actually creates, previews, saves and edits a button campaign while preserving action ID, plus English/Arabic/mobile. Initial fixture lacked an active conversation; corrected fixture rather than weakening delivery assertions. No external delivery enabled. Next: integration authentication/header policies and email delivery lifecycle, then broader regression/acceptance.

## Maximum-scope continuation — reviewed CRM retention (2026-10-23)

Migration 068 and owner-only preview/apply API/UI expire old completed/canceled job payloads and trim historical revisions while preserving each contact's last predecessor before the cutoff. Current contacts, consent, active jobs and job metadata are retained. Exact preview counts and a minimum seven-day cutoff are enforced; backlog blocks cleanup, coverage bounds advance and cleanup is audited. Expired downloads return Gone rather than empty misleading results. Cleanup is explicit, not an automatically scheduled deletion policy.

API/web TypeScript, ESLint, migration, retention and historical-export suites pass: stale preview denial, predecessor retention, expired payloads, active/contact preservation, audit and tenant isolation. PostgreSQL offset timestamps are accepted without discarding precision. Next: bounded export result paging/storage, rich campaign composer, integration auth and email receipts. All external gates remain false.

## Maximum-scope continuation — recorded historical CRM exports (2026-10-23)

Migration 067 adds tenant-isolated immutable profile history. Source transactions enqueue snapshots; the existing worker observes committed changes and assigns journal times after commit. Rollbacks never enter history. Existing profiles have a migration baseline. Export jobs can select an observed as-of time, apply existing filters to historical values and freeze results through the existing worker; current snapshot exports are retained. UI/API expose coverage and backlog, reject pre-coverage/future times, and explain observation-time semantics (not original database commit timestamps). No pre-migration history is invented.

API/web TypeScript, ESLint, migration, smoke-crm-history and existing snapshot smoke pass: historical values/archive state, precise coverage, future denial, rollback exclusion, chunked export and tenant isolation. Next: explicit retention/cleanup with predecessor preservation and bounded result downloads, then campaign/integration/email completion. External gates remain disabled.

## Maximum-scope continuation — bilingual AI workspace and accurate attempts (2026-10-23)

Replaced the legacy Arabic-only AI settings screen with shared premium forms/cards, Arabic/English direction, accessible labels, bounded context/variation fields, role-aware editing, persistent save/reopen and test feedback. Provider readiness now includes tenant providers; the independent paid-call gate is explicit. Usage remaining counts durable attempts/reservations rather than successful replies alone. Existing settings/Knowledge/generation engines are retained.

API/web TypeScript and ESLint pass. PostgreSQL generation-replay confirms one mocked call/run/tool task/usage charge across replay. Chromium ai-workspace suite actually saves/reopens settings and persists owner call/token/cost caps, then checks Arabic/mobile and zero page errors. Next: commit-observed CRM historical export and retention, campaign rich composition, automation auth and email receipts. No external services activated.

## Maximum-scope continuation — durable generation budgets (2026-10-23)

Migration 066 adds detached generation reservations and monthly call/token/cost accounting. The existing AI runtime reserves before calling, enforces plan and optional owner caps plus model context/output/tools, and settles actual usage from cached provider evidence. Interrupted/uncertain outcomes keep reservations; a completed effect can settle without another paid call. Unknown usage/pricing stays unresolved; legacy effects are not blindly replayed. Immutable model/pricing versions are bound to reservation hashes. Successful local replay reuses its run/tool audit; rollback cannot erase paid accounting. Owner evidence release is stale-only, audited and never repeats the old request; plan attempt counts remain consumed. Conservative byte/framing token estimates are operational reservations, not provider-certified tokenization or invoices; provider/model validation remains an external acceptance gate.

Connected bilingual usage/policy/review UI and role-checked APIs are implemented. API/web TypeScript, ESLint, migration and PostgreSQL generation-budget/tool-audit/failure suites pass: races, call/token/cost/plan limits, durable rollback, crash evidence, cached replay, uncertain hold/release, capability validation and isolation. Next: accurate legacy AI settings usage/bilingual UI and browser budget acceptance, then CRM historical exports/retention and campaign/integration/email closure. No external gates enabled.

## Maximum-scope continuation — immutable model catalog (2026-10-23)

Migration 065 records immutable provider model/capability/context/output/pricing versions, backfills existing configurations and captures subsequent changes with a database trigger. App role cannot edit historical versions. Connected bilingual provider editor and catalog expose context/output limits and latest 500 versions. These remain administrator-declared capabilities, not remotely certified model discovery. Generation runtime enforcement follows in the reservation unit.

API/web TypeScript, ESLint, migration and smoke-model-catalog pass: pricing history, context/output validation, denied mutation and tenant isolation. Next: durable generation reservations, atomic monthly plan/token/cost budgets, replay/crash safety and usage/review UI. Real provider gates stay disabled.

## Maximum-scope continuation — provider retry safety (2026-10-23)

Continued from verified local/remote 877d311 on the existing branch/Draft PR #1. Removed Anthropic adapter automatic retries for timeouts, 429 and 5xx; ambiguous paid outcomes now make one attempt only, matching OpenAI safety. Error bodies are not disclosed. API build, ESLint and three mocked adapter tests passed. Next: immutable model capability/pricing catalog and durable generation reservations. No external gates enabled.

## Acceptance evidence archive — 2026-10-23

Eight actual local Chromium screenshots are now tracked in `docs/acceptance/2026-10-23/`, with fixture/privacy notes and scope. The premium browser suite reran after `ce4d9ff` to refresh images following the final desktop navigation CSS fix; all assertions passed. Eight functional/verification checkpoints (`7a10e70` through `ce4d9ff`) plus this evidence checkpoint were pushed on the same branch/PR; current Git/remote HEAD is authoritative. Build/lint/55 unit tests, 19 distinct PostgreSQL/API/worker suites, four Chromium suites and clean/repeated migrations 001–064 passed. Product remains partial; next work and external gates are unchanged below.

## Verified acceptance continuation — 2026-10-23 (latest)

Continued from verified local/remote `260f719cbea9143993d01d9a41fb9102259c7e9a` on `feat/complete-premium-saas`, existing Draft PR #1. Seven independently pushed/verified feature checkpoints: `7a10e70`, `ffb2365`, `b833dff`, `64c4603`, `9fbcd36`, `6d2d20d`, `224e56e`. This final checkpoint also fixes desktop/mobile navigation dismissal styling and live language updates of campaign success feedback, and adds real provider-editor Chromium acceptance. Current Git/remote HEAD identifies this final checkpoint.

Delivered: provider editing/retirement/tool capability checks; frozen request-time CRM exports; explicit audited pipeline/deal ownership; guided text/BODY campaign composer and preview; handled AI failure audit/handoff; exact Inbox tuple cursors; canonical-contact recovery for delayed automation. Migrations 062–064 are additive. No external provider calls/email/financial writes, new branch/PR, force push, main merge or production deployment.

Current-source validation: API TypeScript build; Next production build (31 routes)/web TypeScript; ESLint; **55 unit tests passed**, zero skipped/failed; clean PostgreSQL migrations **001–064** and no-op repeat; **19 distinct PostgreSQL/API/worker suites** passed. Following Inbox/automation changes, 11 relevant suites reran against the latest compiled runtime. Four Chromium suites passed on a production Next server: premium bot creation/preview/publication/undo/redo/team preview, populated Inbox/private note/mobile dialog, campaign audience/gallery/editable preview/persisted draft/Arabic-English/390px, and provider edit/capability/retirement with actual API verification. Screenshots use local test fixtures only. Campaign/browser failures led to source fixes; no assertions were removed. This remains bounded acceptance, not the full requested fifteen-journey/security/load/visual acceptance.

Exact remaining scope: arbitrary historical/as-of reconstruction before an export request and retention/large-data scaling; provider model catalog/cost caps/process-crash accounting; full rich campaign/media/button/template variants and recipient tools; advanced automation authentication/debugging; multi-item/provider-native subscription schedules and broader financial recovery; transactional email receipts/bounces/ambiguous evidence reconciliation; remaining global legacy UI/i18n/accessibility and complete browser/owner design acceptance. Existing working functions must not be rebuilt. Product is **not complete or certified ready for sale**.

Continue first with model capability catalog and explicit provider usage/cost reservations (unknown outcomes must retain reservations; no automatic paid retry), then historical CRM/retention and rich campaign variants. Keep all external/AI/email and financial/domain activation gates disabled. Test fixtures live in local `chatbot`; clean schema verification used `boat_acceptance_20261023`. Dependency/browser tools and validation logs are in `/workspace/work`; never commit `.env` or those databases. See the latest section of SPRINT_FULL_PRODUCT_2026-10-23.md for commands and bounds.

## Acceptance continuation — delayed automation after CRM merge (2026-10-23)

Existing follow-up executor now resolves the tenant-scoped canonical merge chain and runs saved actions under the same tenant lock as CRM merge. Original event/effect identities are preserved. Retargeted work writes an audit entry; archived/missing targets or disabled rules are suppressed; cyclic/excessive chains fail for operator review. No consent is changed and no parallel engine or external replay path is added.

Verified: API TypeScript, ESLint, PostgreSQL smoke-automation-merge (target/source preservation, task/tag execution, audit, archived/cross-tenant suppression and cycle denial) and existing nested-automations smoke (real delayed branch/replay/version isolation). Next: latest-runtime/browser regressions and full handover. Advanced integration authentication/debugger, billing/email lifecycle and broad visual acceptance remain open.

## Acceptance continuation — Inbox tuple pagination (2026-10-23)

Inbox API/UI now page by descending (last_message_at,id), encoding the exact PostgreSQL microsecond timestamp and ID into a validated cursor. Equal timestamps cannot skip conversations; tenant/search filters remain authoritative. Legacy before clients remain supported with their prior semantics. Migration 064 indexes the tuple. Pagination remains a live view: conversations receiving new messages can move ahead of an existing cursor.

Verified: API/web TypeScript, ESLint, migration 064 and PostgreSQL smoke-inbox-cursors: nine conversations with timestamp ties and adjacent microseconds, all pages complete/unique, search, malformed cursors, cross-tenant access and legacy before. Seventeen broader PostgreSQL/worker suites and existing premium Chromium smoke also passed before this change. Next: rebuilt runtime and Inbox/browser regression, remaining automation recovery/integration and billing/email work. Product is not fully accepted.

## Acceptance continuation — AI failure auditing (2026-10-23)

Generation now creates a run before provider execution, updates its immutable provider/model/rate snapshot with actual usage on success, and records a sanitized failure code on provider/execution failure. Unknown failure cost stays null. Failures honor handoff_enabled and do not automatically replay a provider call. Bilingual run history gives recovery guidance. This is handled-failure auditing; process-crash durability/reservations and cost caps remain open.

Verified: API/web TypeScript, ESLint, mocked PostgreSQL smoke-ai-failures (failed run, sanitized data, unknown costs, no automatic retry, enabled/disabled human handoff, subsequent recovery) and existing smoke-ai-tool-audit (permission/idempotency/cost snapshot isolation). All real provider gates remain false. Next: regression/current-source build and expanded browser acceptance; product scope remains incomplete.

## Acceptance continuation — campaign composer and mobile navigation (2026-10-23)

Replaced the single campaign form with a connected three-step bilingual composer: channel/segment/frequency and real audience count, six starter-copy choices or supported approved WhatsApp BODY templates, parameter substitution/content preview, and explicit draft save. Rechecks eligibility before save; scheduling/delivery retain authoritative consent/window/policy checks. Back navigation retains values; obsolete template/audience responses are discarded. This composer still supports text/BODY only, not rich template/media/button variants. Preview is content, not provider-app rendering.

Chromium exposed missing mobile navigation dismissal; added an inside close button, Escape, expanded/control semantics and auto-close on language change. Verified API/web TypeScript, ESLint, Next production build (before final navigation adjustment), all 55 unit tests and smoke-campaign-browser: actual audience, gallery, preview/edit/back/save persisted via API, 390px overflow, English/Arabic RTL, zero page errors. Screenshots inspected locally. Next: current-source build/regression and AI failure audit; comprehensive acceptance remains incomplete.

## Acceptance continuation — pipeline ownership (2026-10-23)

Migration 063 adds pipeline owner and ownership revision. Owner/admin can reassign through the connected bilingual pipeline form with membership/revision checks and audit. Optional explicit transfer changes only open deals belonging to the previous pipeline owner; separately assigned and closed deals are retained. Contacts/consent are untouched. No automatic reassignment follows a pipeline ownership edit.

Verified: API/web TypeScript, ESLint, migration 063 and PostgreSQL smoke-pipeline-ownership (explicit transfer, preservation, default no-transfer, invalid member, stale revision, cross-tenant denial and audit). Next: campaign creation/preview and broader browser acceptance; remaining historical CRM/retention scope stays open.

## Acceptance continuation — frozen CRM exports (2026-10-23)

New export jobs freeze all selected profile values in a single PostgreSQL statement at request time, then use the existing chunked worker. Later edits/archive/merge cannot mix different profile moments into one export. Job/result API and bilingual UI expose snapshot time. Legacy jobs retain prior semantics. No new historical profile store or arbitrary pre-request as-of reconstruction is claimed; job snapshots remain subject to existing retention/scaling work.

Verified: API/web TypeScript, ESLint and PostgreSQL smoke-crm-snapshots: 251 records over two chunks, intervening mutation/archive, stable values/unique IDs/timestamp, empty export and tenant isolation. Next: pipeline ownership/reassignment and campaign composition. Product remains partial.

## Acceptance continuation — AI provider lifecycle (2026-10-23)

Migration 062 adds revisions, retirement and administrator-declared tool capability to existing providers. Connected bilingual provider cards edit name/model/rates/capability with revision conflicts; enable/disable remains compatible. Permanent retirement erases the encrypted key, preserves agents/run history and refuses later edits/key rotation/reassignment. Tenant lock serializes configuration with generation; enabled agents requiring tools cannot use a declared incompatible model. Existing capability defaults remain compatible, not provider-certified. No provider network calls enabled.

Verified: API/web TypeScript, ESLint, targeted AI unit files, clean PostgreSQL migration chain 001–062 and HTTP smoke-provider-lifecycle (edit/conflict/compatibility/retirement/tenant isolation). Next: CRM export snapshot semantics and pipeline ownership, then campaign composer and remaining closure. AI cost caps/catalog/fallback and full browser acceptance remain open; this checkpoint is not complete product acceptance.

## Final full-product sprint handover — 2026-10-23

Implemented and continuously pushed eight checkpoints from verified `386b6b3` through feature HEAD `8a8b77a` on the same branch/Draft PR #1. Delivered audited billing evidence review and future requests, domain-bound branded authentication, premium foundation and seven-step bot builder, nested/versioned automation, gated encrypted invitation mail and inbox refinement. See [the full sprint report](SPRINT_FULL_PRODUCT_2026-10-23.md) for files, commits and exact limitations.

Validation passed: full API/Next production build and TypeScript, ESLint, **55 unit tests**, **28 PostgreSQL/API smoke suites** (18 direct + 10 worker), clean/repeated migrations **001–061**, and two local Chromium flows including actual bot publication and persisted private inbox notes. This is limited browser smoke, not full visual/accessibility/owner acceptance. No paid provider, real email/DNS/TLS, deployment or main merge. All external/AI/email gates remain false.

Product scope is still incomplete: provider-native/multi-item billing schedules, broader customer portal/email lifecycle, AI provider/model lifecycle/capabilities, historical CRM/export scaling and campaign composer gaps, richer automation recovery/integrations and full legacy i18n/premium/accessibility acceptance. Next: AI/provider capability lifecycle and remaining CRM/campaign business functions; continue UI completion alongside them. Historical sections below describe earlier checkpoints and are superseded by this report. Final documentation HEAD is current Git/PR HEAD, following the feature checkpoint.

## Full product sprint checkpoint — premium inbox and browser regression

Inbox now uses shared surfaces/tokens, named channel labels instead of colored emoji, keyboard-openable conversation rows, bilingual primary filters/actions, IME-safe reply entry and a native focus-managed customer-profile dialog on mobile. Search and pagination discard results that belong to an obsolete filter. Existing message, assignment, department, SLA, note, media, CRM-tag and policy paths remain connected. Advanced message/system labels still require translation.

Full API/Next production build, web TypeScript, ESLint, 55 unit tests and a clean database applying migrations 001–061 twice pass. Expanded Chromium smoke passed the seven-step real bot preview/publication, editor add/undo/redo/save/version-dialog dismissal, branded invitation preview/queue and inbox search at 390px, with zero application page errors and no horizontal overflow. This is limited smoke coverage, not full owner visual/accessibility acceptance. A sandboxed email preview correctly denies storage; the browser fixture initializer now targets the top frame only. PostgreSQL regression is ongoing; final report will record the result.

## Full product sprint checkpoint — branded invitation mail

Migration 061 adds encrypted invitation mail jobs using the existing outbox and external effect ledger. Owner/admin invitation forms opt into email; preview and status screens distinguish provider acceptance from delivery. Brand entitlement/domain eligibility is rechecked at processing, and revoked/expired invitations cancel safely. An operator-configured HTTPS gateway requires both external delivery and EMAIL_DELIVERY_ENABLED (default false), with provider idempotency keys. Ambiguous outcomes are quarantined without automatic retry. The invitation acceptance screen now shares the bilingual premium authentication experience and host binding.

API build, web TypeScript, ESLint and PostgreSQL smoke-invitation-mail pass: encryption, disabled gates, mocked acceptance, duplicate suppression, ambiguous timeout, revoked invitations, escaping and tenant isolation. No external email was sent. Gateway delivery receipts, bounce handling and reconciliation of ambiguous email remain incomplete. Next: current-source full regression and browser checks, plus remaining business workspace improvements.

## Full product sprint checkpoint — scheduled subscription requests

Migration 060 adds execution timestamps to the existing durable owner requests. Owners can choose a future local date/time (validated and stored as UTC, one minute to 366 days ahead), see the saved execution time and withdraw before execution. The outbox schedules the existing worker; ownership, provider link, price availability and gates are rechecked at execution. Early handler calls cannot mutate a future request. This is application scheduling, not an independently running Stripe subscription schedule; worker availability still matters around renewal deadlines.

API build, web TypeScript, ESLint and subscription-request/evidence PostgreSQL smokes pass, including saved due time, early-execution denial, withdrawal and invalid dates. All financial/external gates remain false. Next: branded invitation email lifecycle and remaining product controls, then full development/browser regression.

## Full product sprint checkpoint — nested automations and visual editing

Migration 059 and the existing automation engine now support nested AND/OR condition groups and nested branch/delay/HTTP actions, bounded before recursive parsing (depth four, bounded lists/node counts). No parallel executor was introduced. Workflow updates optionally check revisions for legacy compatibility; the upgraded editor always sends its revision. Immutable snapshots, saved canvas positions and execution rule revisions are persisted.

The saved-workflow editor includes a draggable structured workflow canvas with zoom/minimap, click-to-inspect steps, nested conditions/actions, trigger editing, undo/redo and version load-as-disabled-draft. Existing sequence creation, secrets, schedules and recovery remain available. Canvas connections reflect structured execution; arbitrary cyclic graph rewiring is intentionally unsupported.

API/web TypeScript, ESLint, all 55 unit tests and actual PostgreSQL nested-branch/delayed-branch/replay/version/layout/isolation smoke pass. Next: scheduled subscription requests, provider lifecycle and remaining CRM/Inbox refinements, then current-HEAD full regression and local browser readiness checks. Product remains partial.

## Full product sprint checkpoint — premium bot canvas and seven-step creation

The existing React Flow editor now has original SVG node icons, directional ports, colored action cards, searchable draggable palette, clearer edges, minimap/zoom controls, responsive inspector and native focus-trapped version dialog. Existing save/autosave/conflict/version/publish/reusable-component behavior is preserved; added keyboard save and bilingual primary controls/preview. Legacy advanced inspector strings still need completion rather than a false full-translation claim.

Beginner creation now runs seven steps: goal, real template, welcome, optional three reply buttons, real channel, actual engine preview, then server-validated publication. Generated welcome/reply nodes precede the original template without deleting its workflow. Draft retries reuse the saved flow ID.

Web production build/TypeScript/ESLint pass. Chromium smoke actually created a fixture workspace/web channel, completed all seven steps, clicked a reply in the real preview, published, opened the builder, filtered/added a node and saved; zero page errors and no overflow at 390px. Desktop/mobile artifacts were inspected locally. Added configurable `scripts/smoke-premium-browser.mjs`; this is not comprehensive visual/accessibility/owner acceptance. Next: nested automation/version controls, followed by remaining CRM/provider and communications work.

## Full product sprint checkpoint — premium foundation and branded sign-in

Migration 058 binds branded sign-in to a currently eligible verified domain and actual membership. Branded joining is invitation-only and validates the invitation workspace. The root brand context reaches login/register and the workspace shell; a mismatched saved workspace cannot render tenant pages. Added a real membership-backed workspace switcher (restricted to the host workspace on custom domains).

Shared design tokens, self-hosted DM Sans/Noto Sans Arabic, unified forms/cards/tables/buttons, SVG navigation, responsive public authentication and reusable native accessible Dialog/Feedback/EmptyState/Button components are implemented. Canonical registration still creates a workspace; branded registration accepts a company invitation. This covers member sign-in/portal surfaces, not a separate public customer account product or live email sending.

Full API/Next build, TypeScript, ESLint, migrations and PostgreSQL branded-auth smoke pass (gate, membership, invitation isolation and domain revocation). Existing paid/external/ingress gates remain false. Next: premium flow canvas, beginner creation and advanced automation improvements in this same sprint. Owner visual approval remains open.

## Full product sprint checkpoint — provider-evidence review

Continued from verified local/remote `386b6b3c872ca78793c899b8f55ccc48bd388136`, same branch/PR #1. Migration 057 adds restricted operator review of ambiguous subscription requests: step-up-protected evidence requests, durable read-only provider inspection through the existing effect ledger/outbox, provider request IDs, mismatch quarantine and explicit approval of fresh matching evidence. Confirmation closes the local request only; it never repeats a financial write or clears an unknown effect. Bilingual platform review UI is connected.

API build, web TypeScript, ESLint and PostgreSQL `smoke-billing-review.mjs` pass with mocked Stripe reads only. New owner instructions authorize premium UI/UX work during this same sprint; earlier design deferral is superseded. Next: shared design system/branded authentication and builder improvements alongside remaining functional modules. Full product scope remains incomplete.

## Verified sprint delivery — 2026-10-23 (latest; supersedes historical checkpoints)

Continued from exact verified remote `fc78c7c6baed4619619ae1a4e4631248f0b1658e` on `feat/complete-premium-saas`, same Draft PR #1. Eleven implementation/hardening checkpoints were committed, pushed immediately and remotely verified: `21c55bc`, `616b64a`, `a5d9490`, `e59949f`, `825502d`, `e47869b`, `c323dd4`, `468c08f`, `2cc4861`, `744ac66`, `4753b84`. Source HEAD `4753b840e2d99c4284fe70a0797786b8310c5ddf` matched both the remote branch and PR #1 head before this final documentation checkpoint. Use current Git HEAD for the documentation commit. No new repository/branch/PR, main merge, force push or production deployment.

Delivered connected API/database/permission/UI slices: periodic reconciliation and paged invoice backfill; durable cancel/resume/single-item price changes; immutable local price catalog and delinquency grace/free-limit recovery; segmented operator read/write scopes, request-bound one-use TOTP step-up and backup-factor MFA recovery; explicit fresh-TXT domain transfer and own-domain reclaim; currency-separated ledger-backed platform reports; in-place knowledge file replacement/extraction snapshots, explicit bounded retention, AI tool decisions and historical cost-rate snapshots. Migration range 046–056. See `docs/SPRINT_2026-10-23_CONTINUATION.md` for details and exact limitations.

Final current-source validation passed: full API/Next production build and TypeScript, ESLint, all 53 unit tests (zero skips), **24** PostgreSQL/API smoke suites on restarted current-source test/worker servers, incremental/repeated migrations, and a new clean database `boat_final_clean_20261023` applying 001–056. Smoke coverage includes real local worker/outbox execution, concurrency, uncertainty suppression, role separation, tenant isolation and old module regressions. External Stripe/AI calls were mocked only. External delivery, paid AI, automatic Stripe work, subscription mutations, custom ingress and real platform-admin activation remain disabled. No real DNS/TLS/ACME, paid-account activation or comprehensive browser/security/load/visual acceptance ran.

**Product remains incomplete.** Resume first with audited operator resolution of ambiguous subscription requests using fresh provider evidence and step-up; then remaining subscription scheduling/multi-item/catalog-provider consistency, white-label authentication/branded email journeys and domain recovery/ingress acceptance. Batch 2 still needs advanced automation graphs/integration policies, CRM historical/large-export improvements, model/price catalog and provider lifecycle, full channel/Inbox/session refinement. Batch 4 premium design/mobile/accessibility/onboarding and owner visual approval remain open; do not start final visual approval before functional closure. Continue stable-unit commit + push immediately.

## Concurrency hardening checkpoint (2026-10-23)

Migration 056 prevents password-only sign-in from replacing an already-authorized MFA recovery enrollment challenge. Losing/expiring that recovery challenge after backup codes are consumed requires externally reviewed recovery, rather than a password bypass. Domain acceptance locks domain before transfer state to match revocation. Reconciliation reads overlapping an already-applied event second are deferred to a later snapshot instead of overwriting potentially newer provider state.

API build, migrations and expanded MFA/catalog/domain PostgreSQL/API smokes pass, including recovery challenge preservation and equal-second read rejection. Next: final full production build/unit/lint and clean migration verification through 056, then save exact current remote HEAD and remaining scope.

## Continuation — AI tool decisions and historical cost inputs (2026-10-23)

Migration 055 adds tenant-scoped append-only tool decision records, stable run/tool indexes and hashed inputs. Shared execution rechecks current agent/tool/provider permissions and local active contact scope, validates inputs, enforces the three-tool action bound, records applied/no-op/denied/invalid/limit/failed decisions and prevents duplicate CRM effects on replay. Changed replay inputs are refused. Handoff is an audited request consumed by the existing conversation workflow. The connected agents screen filters/pages audit records without customer payloads. AI runs now snapshot provider ID/model and input/output cost rates, visible alongside the estimate; this is not a provider invoice or complete model-price catalog.

Validation: API build, web TypeScript, ESLint, incremental migration 055, all 53 unit tests and PostgreSQL mocked-generation/tool-audit smoke pass, including actual CRM effects, replay safety, current permission revocation, private input hashing, cost-rate snapshots and tenant isolation. Before this unit, full API/Next build, migrations 001–054 on a clean database and 23 targeted/core/business/worker regression suites passed. Next: final current-HEAD build/regression and handover; substantial remaining automation/CRM/Inbox/provider/catalog and white-label auth/email/Batch 4 scope stays open.

## Continuation — bounded knowledge retention (2026-10-23)

Migration 054 connects owner-only preview/confirmed durable retention runs to the existing outbox and bilingual knowledge UI. A frozen cutoff (minimum 30 days) clears old completed/canceled job raw/chunk/vector payloads in 100-record batches and removes eligible historical extraction text, retaining hash/character-count tombstones. Current source content, published chunks, revisions, latest snapshot and external accounting/effect ledgers remain. Active/blocked/failed jobs remain recoverable; workers recheck owner authority and skip locked sources. Cleanup is explicit, not an automatic production deletion policy.

Validation: API build, web TypeScript, migration 054, ESLint and PostgreSQL retention smoke pass (120-job paging, frozen cutoff, active/failed protection, latest snapshot preservation, no source deletion and tenant isolation). File replacement regression also passes. Next: broad current-HEAD build/unit/smoke/migration regression; then remaining AI tool/pricing/provider lifecycle, automation graph/CRM/Inbox and white-label auth/email work. Product remains incomplete.

## Continuation — in-place knowledge file replacement (2026-10-23)

Migration 053 and bilingual editor/API replace a file in the existing source, preserving agent assignments and prior published chunks until replacement publication. Mandatory revision checks/source lock refuse stale, concurrent, archived or active-job replacements. File revisions retain SHA-256/size/MIME metadata; durable file/URL extraction snapshots include source revision/job/text hash and can be reviewed through tenant-scoped endpoints/UI. Upload remains bounded to 5MB and supported extensions. Original raw binaries are not an immutable download archive.

Validation: API build, web TypeScript, ESLint, migration 053, all 53 unit tests and PostgreSQL file-replacement smoke pass using mocked embeddings. Coverage includes stable links, revision/hash metadata, concurrent replacement, old-index preservation, paid-call gate, persisted extraction, final mock publication and cross-tenant denial. Next: bounded explicit knowledge-job/extraction retention, then broader sprint regression and remaining AI/automation/CRM/Inbox scope. No product completion claimed.

## Continuation — platform financial and operational reporting (2026-10-23)

Migration 052 persists provider invoice payment dates and exposes a restricted, bounded-date aggregate report to `reports.read`. Connected bilingual console shows gross paid invoice totals by payment date/currency, invoice creation cohorts, failed/open balances, current monthly-equivalent mapped active/past-due contracts, unpriced/missing-date counts and operational queue/domain/company/subscription states. Currencies are never mixed; totals do not claim net revenue/refund/tax or bank settlement. Legacy paid invoices without provider payment timestamps remain explicitly excluded from dated paid totals until backfill.

Validation: API build, web TypeScript, migration 052, PostgreSQL report privilege/range/date/currency smoke and signed invoice/backfill/catalog regression smokes pass; no provider calls. Next: complete broad build/lint/unit/integration regression across saved units, then Batch 2 AI source replacement/retention and remaining automations/CRM/Inbox; white-label auth/email and Batch 4 remain open. Do not declare product complete.

## Continuation — explicit domain transfer/reclaim (2026-10-23)

Migration 051 adds current-owner initiated transfers to a specific workspace, 24-hour expiry, one-time secret (hash stored), fresh target TXT proof and atomic acceptance. Hosting stops at initiation and remains off after transfer until the receiver requests it. Pending transfers prevent source hosting; revocation cancels them. Source/target audits remain, unrelated tenants cannot see transfers, and stale source recheck events cannot serve the new owner. The owner UI includes outgoing/incoming transfers and own-domain reclaim with rotated TXT and fresh verification. Revoked names remain reserved; DNS alone never permits another tenant to reclaim a hostname. Expired requests must be canceled explicitly before restarting; involuntary/operator takeover remains deliberately unsupported pending policy review.

Validation: API build, web TypeScript, ESLint, migration 051, new PostgreSQL domain-transfer smoke and existing hosting smoke pass with mocked DNS only. Tests cover secret/tenant checks, failed proof, concurrent acceptance, hosting gates, revocation cancellation, reclaim rotation and retained audits. No DNS/ingress/certificate was activated. Next: ledger-backed platform reports; then remaining Batch 2 AI/CRM/automation and white-label auth/email journeys, followed by Batch 4. Product remains incomplete.

## Continuation — secure operator MFA recovery (2026-10-23)

Migration 050 adds eight high-entropy single-use backup codes, generated only after operation step-up and displayed once in the bilingual console. Only SHA-256 hashes are persisted in the restricted platform database. Public recovery requires allowlisted account + correct password + saved code, is rate limited, consumes the code atomically, revokes all user sessions, invalidates all remaining backup codes and grants enrollment only for a new encrypted authenticator. Password alone never bypasses MFA. Codes clear from the console on sign-out.

Validation: API build, web TypeScript, migration 050, ESLint, all 53 unit tests and expanded isolated API/PostgreSQL MFA smoke pass, including wrong password, concurrent one-code recovery, hash-only storage, app-role denial, old-token revocation, new enrollment and remaining-code invalidation. No live operator account activated. Next: domain transfer/reclaim and platform ledger-backed financial/operations reports; Batches 2/4 and full acceptance remain incomplete.

## Continuation — platform read scopes and operation step-up (2026-10-23)

Migration 049 and platform guards enforce segmented company/user/subscription/catalog/audit/report read permissions from immutable operator roles. Snapshot and directory responses respect these scopes; console loads authorized data only. Every privileged write additionally requires a fresh TOTP and a two-minute signed approval bound to actor/session version, method, target and complete body. PostgreSQL consumes each approval once across replicas, including rejected SQL operations. Tokens remain in memory and are redacted from HTTP logs. Bilingual console includes fresh-code input.

Validation: API build, web TypeScript, incremental migration 049, isolated PostgreSQL/API MFA smoke (scope denial, legacy tokens, tampered body, missing step-up and replay rejection), ESLint and 52 existing unit tests passed. Added a canonical operation-binding unit test for the next regression. Production operator activation remains disabled. Recovery factors and platform financial/operations reports, domain transfer, remaining Batches 2/4 are still open.

## Continuation — price catalog and past-due lifecycle (2026-10-23)

Migration 048 adds an immutable local provider-price registry, restricted operator publish/retire APIs and bilingual console. Publishing selects a default without rewriting existing subscription prices; retiring blocks new selection but retains historical mappings. Subscription events use provider item price rather than conflicting plan metadata; unsupported/multi-item prices are held for review. Equal-second webhook updates are conservatively ignored and make reconciliation due. Past-due timestamps persist across failed retries, clear on recovery, and a configurable seven-day default grace period applies free entitlements without deleting tenant data. Custom-host eligibility follows the same grace policy. Billing UI explains overdue status and month/year intervals.

Validation: API build, web TypeScript, ESLint, incremental migration 048 and PostgreSQL catalog/delinquency, subscription requests and signed invoice smokes pass. Coverage includes restricted DB privileges, immutable/retired price mapping, tie-time safety, grace expiry/recovery and a mocked single-item plan change with no proration. No real Stripe call. Remaining: live catalog/provider consistency acceptance, multi-item/scheduled changes, operator uncertainty resolution, platform advanced security/reports, domain transfers/auth and remaining Batches 2/4. Not product complete.

## Continuation — durable subscription requests (2026-10-23)

Migration 047 adds owner-only audited cancel-at-period-end, renewal resume and single-item price-change requests, connected to bilingual billing UI/API and the existing outbox. Separate `BILLING_SUBSCRIPTION_CHANGES_ENABLED=false` plus the external gate block provider activity. Pending requests can be withdrawn; workers recheck owner/company/link/price state. Stable request effect keys and Stripe idempotency keys prevent replay; uncertain outcomes quarantine the request and block further changes. No immediate proration is requested; plan changes affect subsequent invoices. Multi-item/scheduled changes and operator uncertainty resolution remain open.

Validation: API build, web TypeScript, incremental migration 047, PostgreSQL subscription-request smoke (blocked/withdraw, concurrent cancel/resume, idempotency key, revoked owner, ambiguous suppression and tenant isolation) pass using mocked SDK only. Next: authoritative price mapping/catalog lifecycle and past-due entitlement policy, then finer platform scopes/step-up/recovery and domain transfer. Full product completion remains open.

## Continuation — periodic billing reconciliation and invoice backfill (2026-10-23)

Continued from verified `fc78c7c6baed4619619ae1a4e4631248f0b1658e`, same branch and Draft PR #1. Migration 046 adds a bounded, replica-safe due scheduler feeding the existing outbox. A separate disabled-by-default `BILLING_AUTOMATIC_RECONCILIATION_ENABLED` gate also requires Stripe configuration and external activation. Owner/periodic jobs now persist paged invoice backfill progress, validate customer/subscription ownership, and reuse the durable effect ledger. Uncertain effects cannot replay automatically. Provider reads use their start timestamp to avoid overwriting newer concurrent events. UI displays source and invoice progress.

Validation: API build/TypeScript, web TypeScript, ESLint, all 52 existing unit tests, clean migrations 001–046, health check and new PostgreSQL `smoke-billing-backfill.mjs` pass (mocked SDK only; concurrency, blocked mode, pagination, durable replay and tenant isolation). No Stripe account/network call or production activation. Remaining: durable subscription change/cancel requests, catalog and delinquency policy; subsequent platform/domain/Batch 2/4 scope remains unfinished. Product is not complete.

## Current continuation delivery — 2026-10-23

Newest status supersedes the historical checkpoints below. Continued from verified local/remote `c6b85ba` with six connected units, each pushed independently: audit filters/cursors/export (`94d8f5f`), immutable operator scopes (`52d3df9`), mandatory TOTP MFA (`129ac0b`, test lint fix `3d156be`), invoice ledger/external billing gates (`c575f50`), gated domain ingress/ownership rechecks (`35ad618`), and knowledge revisions/archive/bilingual editor (`ad81ab2`). Follow-up `2af9713` avoids query embedding charges when no available matching source index exists and updates the integration harness for mandatory MFA/source locking. No new branch/PR, merge, deployment or screenshots.

Verification: full API/Next production build and TypeScript, latest API rebuild, ESLint, all 52 API tests; five new audit/MFA/invoice/domain/knowledge smoke suites and seven existing core/business/sprint/worker/reliability/major/billing-branding suites passed. Clean database `boat_completion_validation_1792766470825` applied migrations 001–045; incremental migrations also passed. All provider generation/embeddings in tests were mocked and Stripe fixtures were locally signed. External delivery, paid AI, custom ingress and live platform-admin configuration remain disabled. Actual Caddy/ACME issuance, production DNS/provider activation and comprehensive browser/security/load/visual acceptance have NOT run.

Exact next implementation: automatic periodic Stripe reconciliation/backfill and durable subscription-change/cancellation requests through the existing outbox/effect ledger, with ownership validation, uncertainty handling and a connected owner UI. Continue afterwards with price/catalog/payment delinquency policy, richer platform read scopes/backup factors/operation step-up, domain transfer and white-label auth journeys; advanced automation graphs/auth policies; CRM historical/large export refinements; AI tool/pricing audit/file replacement/extraction retention; remaining Inbox/session/channel and Batch 4 editor/mobile/bilingual work. Read activation runbooks before external integration. The product is not PRODUCT BUILD COMPLETE. Maintain stable-unit commit/push and 10–15-minute recoverable checkpoints.

## Knowledge lifecycle checkpoint — 2026-10-23

Migration 045 adds immutable input revisions, source archive state and per-job source revisions. Text/FAQ/URL edits require the current revision and cancellation of active indexing first; prior published chunks survive replacement processing. One source advisory lock coordinates edit/archive/reindex/process/resume/cancel. Obsolete jobs cannot resume or publish. Archived sources retain content/history/index but are excluded from vector/keyword retrieval; restore makes the retained index available again. The connected knowledge page now uses shared bilingual forms/cards, search, archive filtering and version review/load-as-new-save. File replacement remains a new upload; extracted URL/file snapshots are not an immutable crawler archive. History is bounded to 50 revisions per source and refuses further edits instead of deleting records; retained archived sources still count toward source quota.

Full API/Next build/TypeScript, ESLint and the new knowledge revision smoke pass with mocked embeddings only. Source retention/cleanup, historical extraction snapshots, larger file replacement and AI tool/pricing audit remain open. Continue with basic cross-module regression/migration verification and save the final handover; do not start screenshots or comprehensive acceptance.

## Custom-domain integration checkpoint — 2026-10-23

Migration 044 connects hosting requests, minimal public brand resolution/TLS eligibility, web Host enforcement/branded entry, and versioned twelve-hour ownership rechecks through the existing outbox. Recent ownership, tenant status and white-label entitlement are checked; disable/revoke/expiry/downgrade deny serving. API/web gates stay false. An optional Caddy ask + per-request forward-auth example and activation runbook are provided, but actual Caddy/ACME/DNS configuration and certificate issuance were not performed or tested.

API/web TypeScript, full production build, ESLint and mocked DNS/outbox/tenant-hosting smoke passed. No screenshots or comprehensive acceptance were run. Domain transfer/reclaim, white-label authentication emails and live ingress/ACME acceptance remain open. Continue with remaining billing automation, AI source lifecycle and product UX using immediate stable commit/push checkpoints.

## Invoice lifecycle checkpoint — 2026-10-23

Migration 043 and connected billing UI/API persist verified Stripe invoice snapshots: due/paid/remaining amounts, currency, attempts, failed-payment state, due dates and sanitized Stripe document links. Independent invoice event ordering/deduplication prevents stale/equal-priority updates from erasing paid/failure transitions; invoice events do not override authoritative subscription status. Customer-routed subscription events now apply without tenant metadata, cancellation-at-period-end is visible, and existing active subscriptions use the portal rather than duplicate checkout. Checkout/portal now also require the explicit external-delivery gate.

API build, web TypeScript, ESLint, 52 unit tests, invoice smoke and existing signed billing/branding smoke pass without Stripe calls. This is a webhook-backed ledger, not historical invoice backfill or a payment processor. Automatic reconciliation/backfill, price catalog lifecycle, provider mutations/cancellation workflows and comprehensive delinquency policy remain open. Next: custom-host routing/TLS code and gated activation.

## Platform MFA checkpoint — 2026-10-23

Migration 042 and connected bilingual sign-in/enrollment UI enforce authenticator MFA for every platform session. Secrets use the existing authenticated encryption; limited enrollment challenges grant no console access; database time-step consumption prevents replay across replicas. Old password-only platform tokens are rejected. API/web TypeScript, ESLint and 50 API tests pass, including RFC TOTP vectors. An isolated API/DB smoke validates enrollment, encrypted storage, replay/concurrency, role guards and revocation without activating a real operator. Recovery remains an externally reviewed operator process; hardware factors, backup codes and additional operation step-up remain open. Next: invoice/payment lifecycle, then domain-host/TLS integration.

## Operator authorization checkpoint — 2026-10-23

Explicit operator-managed role mappings now enforce independent company/user/session/subscription/plan write permissions on every request. Missing or invalid configuration is read-only; workspace ownership never grants writes. The platform UI displays effective scopes and disables unauthorized actions. No new schema is required for immutable operator configuration. API/web TypeScript, ESLint and 48 API tests pass. MFA is the immediate next unit; external delivery/AI remain disabled.

## Platform audit checkpoint — 2026-10-23

Migration 041, restricted API and bilingual console provide exact actor/company/action filters, bounded UTC date ranges, stable ID cursor pagination and explicitly loaded-record JSON export. Direct table/application-role access remains denied. API build, web TypeScript, lint and dedicated SQL smoke passed. Continue with granular operator permissions and MFA; product remains partial. No screenshots or visual acceptance are requested in this sprint.

## Mandatory continuous Git checkpoints

Owner instruction applies to all current/future work: after each coherent stable functional unit, run appropriate quick checks, commit and push immediately to `feat/complete-premium-saas` / existing Draft PR #1. Target checkpoints every 10–15 minutes while recoverable changes exist. Verify clean/status and remote HEAD after each push, then continue without asking approval. Do not wait for a batch/session or final acceptance tests. If limits approach, prioritize a safe `wip:` checkpoint with feature gates and an honest continuation note. Never stage .env files, secrets, generated/temporary files; `.env.example` must contain placeholders only. No new branch/PR, main merge or production deployment.

## Continuous sprint verification — 2026-10-23

Four functional checkpoints were committed and pushed separately on the existing branch/PR: `2a67d3f` (CRM work management), `5d6b768` (shared delivery-account budgets), `3c3f07f` (department lifecycle/response reporting), and `00a0a55` (platform directory search/pagination). Each received targeted checks before push; remote HEAD was verified. No new branch/PR, merge or deployment.

Final development verification passed: full API/Next production build and TypeScript, ESLint, all 47 API unit tests; four new CRM-work/delivery-account/department/platform-directory smoke suites and seven existing core/business/sprint/worker/reliability/major/billing-branding suites. Incremental migrations 037–040 and the clean-schema validation chain through 040 passed. External delivery, paid AI calls and live platform-administrator activation remain disabled. Comprehensive browser, security, performance and visual acceptance remain deferred.

Continue directly with platform audit pagination and granular operator authorization/MFA, then remaining billing/catalog/invoice lifecycle and custom-domain host routing/TLS. Batch 2 still needs advanced automation graphs/integration policies, AI audit/pricing/source lifecycle, provider-policy activation acceptance and CRM historical/large-export refinements. Department metrics use current assignment/target and message creation timestamps; provider quotas are operator-configured limits, not automatic discovery. Batch 4 and final visual previews/owner approval remain open. Do not declare PRODUCT BUILD COMPLETE. Maintain immediate commit/push after each stable unit and 10–15-minute recoverable checkpoints.

## Continuous checkpoint — platform company/user directory

Migration 040 adds an explicitly granted security-definer paged directory for the restricted platform DB role. Platform API validates kind/search/page/limit; console searches and pages all company/user records while preserving existing management actions. Literal search and stable date/ID ordering avoid wildcard injection and unstable page boundaries. The application SQL role and tenant JWTs cannot use the directory. Legacy snapshot remains bounded for compatibility; platform audit paging, MFA and granular operator roles remain open. API/web TypeScript, ESLint, migration and `smoke-platform-directory.mjs` pass. Next: broader development regression/build for saved checkpoints; do not pause continuous commits until a whole batch finishes.

## Continuous checkpoint — department operations and response metrics

Migration 039 adds non-destructive archive/restore, update revisions and audit. Existing departments API/UI now edits name/membership/response target and preserves historical conversation links when archived; Inbox refuses new assignments to archived departments with a shared row lock. Date-scoped aggregates and UI show conversation/answered/unanswered/average response and current-target breaches. Metrics use UTC wall-clock message creation time for public staff messages with sent status, and current target/assignment; they are not historical business-calendar or provider-acknowledgement SLA certification. Targeted API/web TypeScript, ESLint, migration and `smoke-departments.mjs` pass. Next: full development regression/build across the saved checkpoints, then remaining billing/platform role/UX work. Continuous push checkpoints remain mandatory.

## Continuous checkpoint — shared delivery account limits

Migration 038 adds tenant-owned operator-defined Meta/web account groups. Channels can share a group through the policy UI. The existing outbound worker and web campaign dispatcher use one PostgreSQL permit service for channel interval + account interval + UTC daily attempt caps. Locks serialize cross-channel/cross-worker reservations, and rollback releases uncommitted permits. Disabled groups block dispatch; provider mismatches/cross-tenant assignments are refused. Uncertain provider attempts stay counted. These are configured operational limits, not automatic discovery/approval of provider quotas. Direct web chat remains immediate. API/web TypeScript, ESLint, migration and `smoke-delivery-accounts.mjs` pass. No external sending enabled.

## Current checkpoint — CRM sales and follow-ups

Migration 037 adds deal ownership, task update timestamps and indexes/audit triggers. `/crm/deals` and `/crm/tasks` now filter/search/page; bounded filtered exports refuse silent truncation. Existing PATCH endpoints support titles/amounts/currency/ownership and task due dates/assignment, with optional revision checks and member validation. The connected bilingual `/dashboard/crm/work` screen links from CRM and edits existing records. Existing create/stage/status callers remain compatible. API build, web TypeScript, ESLint, migration and `scripts/smoke-crm-work.mjs` validate this slice. Next: cross-channel/provider-account pacing using existing delivery policies, then remaining SaaS/UX work.

## Major product implementation checkpoint — 2026-10-23

Started from verified local/remote `1f338897cceb119577d9093c2b95d43e91cb8f35`, same branch and Draft PR #1. New migrations 028–036 build on the existing outbox and tenant RLS; no parallel scheduler or production deployment.

- Knowledge: durable text/FAQ/URL/file jobs, persisted file extraction, prepared chunks/vector batches, blocked/failed/canceled states, resume/progress UI, atomic conservative monthly embedding reservations, durable cached effects and audited uncertainty reconciliation. Paid generation/query/ingestion calls remain disabled. Index replacement is atomic after complete processing; the prior index survives failures.
- Campaigns: explicit per-channel marketing policy, shared external-send pacing across replicas/campaigns, paced web campaign events, Meta response-window checks, inbound opt-out keywords and existing consent checks. Provider-wide account caps and complete external Meta policy acceptance remain open.
- CRM: real searchable merge-impact preview with profile differences, dependency counts, consent result, identity conflicts and Inbox links. Unsafe identity merges still require manual review; deal/task filtering/editing remains open.
- Automation: reopen/edit existing sequences and bounded branch/condition groups; encrypted, rotatable host-bound Bearer secret references; durable per-rule failure attribution and safe event retry UI. Nested arbitrary graphs and extended integration policies remain open.
- Platform administration: separately signed/purposed short-lived platform sessions, immutable operator allowlist, separate least-privilege database connection/role, database-backed sign-in limits and audited company/subscription/user/plan operations. Console is disabled until external operator configuration; tenant roles cannot activate it. See PLATFORM_ADMIN_ACTIVATION.md. Pagination/MFA/granular operator roles remain open.
- Sessions: backing session IDs/user versions for new access tokens, self-service session list/revoke, global operator revoke, account/tenant suspension enforcement, and live SSE revocation checks. Legacy access tokens without IDs retain their short access lifetime unless globally revoked; cookie migration/recovery remain open.
- Billing: durable owner-requested Stripe reconciliation jobs, disabled-by-default activation gate, linked customer/subscription ownership checks, cached retrieval and existing event dedupe/order application. No Stripe calls or real account setup occurred.
- UX: original SVG navigation icons, connected bilingual job/policy/merge/sequence/platform/session screens. Final identity/design approval and standalone visual previews remain deferred to completed-product review.

Validation: production API/Next build and TypeScript, ESLint, 47 unit tests (including active SSE revocation), migrations through 036 on a fresh validation database, core/business/sprint/billing development smokes and `smoke-major.mjs`. Major smoke covers gated jobs and durable file extraction, a real vector index built from mocked embeddings, cached replay/concurrent quota reservation, opt-out/policy isolation, merge preview, encrypted secrets/saved branches, platform token/SQL-role boundaries, suspension, session revocation and blocked/mocked Stripe reconciliation. No paid/provider network calls, live admin credentials or comprehensive final acceptance were used.

Next: finish provider/account-wide campaign caps, CRM deal/task workflows and operator roles/MFA, complete billing/catalog/invoice lifecycle and custom-domain host/TLS integration, then remaining UX/unified bilingual controls and final visual previews. Product build remains incomplete.

## Multi-feature implementation checkpoint — 2026-10-23

Started from verified local/remote `6b4f68f0468f503469ce9ac581a97861af624e16` on `feat/complete-premium-saas`, same open Draft PR #1. No new branch/PR, merge or production deployment.

- CRM lifecycle: migrations 022–023; normalized identity matching, audited soft merge/reparenting with original campaign ledger preservation and conservative consent, archive/restore, bulk custom fields, durable chunked import/export with progress/cancel/results UI. Distinct identities on the same channel require manual review; merged source records are retained.
- Campaigns: migration 024; draft revision checks, editing, starter copy, versioned rescheduling/cancel, canonical recipient dedupe/frequency checks. Website widget opt-out and pre-send consent checks are connected. No external delivery occurred.
- AI: migration 025; shared Anthropic/OpenAI implementations, encrypted key rotation, flow/channel/default assignments and UI; flow routing is propagated through resume/delay. Paid calls remain disabled. Knowledge ingestion/embedding recovery remains open.
- Automations: bounded AND/OR groups, then/otherwise branches, ordered visual step cards, gated HTTPS actions using the existing SSRF helper/effect ledger, and audited schedule/follow-up cancel/reschedule. Arbitrary graph editing, secret references and detailed failure attribution remain open.
- Batch 3: real tenant/date-scoped reports and exports; migration 026 branding/domain ownership models and UI with plan enforcement and widget integration; migration 027 atomic signed Stripe event dedupe/order guard and tenant event history. Domain verification does not activate hosting/TLS. Super Admin is not implemented.

Verification: API + Next production build/TypeScript, ESLint and 46 API unit tests; fresh database migration chain 001–027 and incremental migration checks; core, business, worker, reliability, sprint and billing/branding development smokes. Sprint smoke covers multi-batch jobs and row errors, merge data retention/consent, archive/restore, bulk custom-field rollback, authenticated widget opt-out, routing/key rotation, OR/branches, schedule edits, campaign revisions and report isolation. Billing smoke uses local signed fixtures only; OpenAI tests mock fetch. No comprehensive browser/security/load/visual acceptance was run.

Continue directly with durable knowledge ingestion/embedding budgets, channel-wide campaign pacing/provider policies and remaining CRM conflict/graph editing, then separate Super Admin authorization/administration and domain hosting/TLS. Read REMAINING_WORK.md for exact bounds. Batches 2–3 remain partial; final design/Batch 4 is deferred per owner instructions. This is not PRODUCT BUILD COMPLETE.

## Checkout and delivery boundary

Use `/workspace/Boat-two`, branch `feat/complete-premium-saas`, existing **Draft PR #1**: https://github.com/hendhafez5566-arch/Boat-two/pull/1. This continuation started from verified local/remote `f1292123a60acd19e12562b41e4d3c829b337d46`. Read `git status --short` and `git log -3 --oneline` for the latest pushed checkpoint. Never create another branch/PR, merge main or deploy production without explicit owner approval.

Read PRODUCT_COMPLETION_MATRIX.md, REMAINING_WORK.md and IMPLEMENTATION_PROGRESS.md. Do not repeat the original repository audit or rebuild the connected CRM/marketing/event models. The owner authorized source changes, migrations, tests, commits and push; the old onboarding-only source restriction is superseded for this product task.

Source implementation checkpoint: `f091db0613297d4ab4c8560274017bc0f5daa78b`. A following documentation commit records handover; use current Git HEAD.

## Current construction architecture

- `events/`: durable domain outbox, effect cache; DatabaseService reuses tenant transactions and provides separate durable-effect connections. Message persistence/dispatch is atomic. Listener failures propagate. Future scheduled work cannot block immediate aggregate work.
- `messaging/outbound.service.ts`: durable send leases, rejection retry, unknown-delivery suppression. Delivery UI supports audited manual reconciliation before confirmed failed work is retried.
- Shared realtime is PostgreSQL `realtime_events -> stream_events`, materialized after source commit so replay cursors cannot skip late transactions. SSE checks membership each batch. Redis remains provisioned; do not introduce another competing event transport/automation engine.
- `business/`: CRM/consent, campaign recipient events, typed business rules/actions and departments, all RLS-scoped. Rule/root/contact uniqueness suppresses loops. Delayed follow-ups reuse domain events.
- Flow components are existing published flows, frozen into parent versions at publish. Event triggers and the beginner wizard use the existing engine/editor.
- AI tenant agents/providers/tools reuse the existing generation/retrieval service. Embedding provider/ingestion still uses environment configuration; do not imply tenant generation credentials configure embeddings.

## Start

```bash
export PATH=/workspace/.boat-tools/node_modules/.bin:$PATH
cd /workspace/Boat-two
docker compose up -d
docker compose exec -T postgres pg_isready -U postgres -d chatbot
pnpm migrate # all migrations 001–021 required
pnpm dev:api
# Another session, same PATH/cwd:
pnpm dev:web
```

Wait for clean TypeScript compilation and Nest startup; require GET `/health` status=ok/db=up before requests. `scripts/dev-api.mjs` preserves decorator metadata. Do not revert to tsx API watch or `--noCheck`. Retain ignored `.env`; never print/overwrite keys. The clean migration validation DB is `boat_business_validation`; earlier `boat_core_validation` is also a local test DB. They contain no production data.

`EXTERNAL_DELIVERY_ENABLED=false` and **independent** `AI_PROVIDER_CALLS_ENABLED=false` are defaults. No real provider credentials/accounts or paid calls were used. Meta connection buttons require operator configuration/permissions; consult INTEGRATION_ACTIVATION.md. WhatsApp unsupported template variants cannot send; text BODY variants are the implemented slice.

## Development checks

```bash
pnpm build
pnpm lint
pnpm --filter api test # 44 passed; no skips
node scripts/smoke-core.mjs
node --env-file=.env scripts/smoke-worker.mjs
node --env-file=.env scripts/smoke-business.mjs
node --env-file=.env scripts/smoke-reliability.mjs
```

Run smoke scripts against a stable API, not while editing TypeScript/hot-reloading it. To check multiple replicas, build first, then from apps/api start `API_PORT=4100 node --env-file=../../.env dist/main.js` and similarly 4101. Set `SMOKE_API_URL=http://localhost:4100` for the smoke process; both workers share PostgreSQL. Stop only your test replicas afterward. Test fixtures use explicit local-only names and no provider calls. Smoke scripts create isolated test tenants; the business script accelerates only its own delayed event fixture.

All 44 tests, core/worker/business/reliability smoke, full build/lint and migration chain passed in this continuation. Basic HTTP route checks are not browser acceptance. Full final security/load/visual/provider acceptance is deliberately not claimed.

## Direct continuation point

Finish the explicit Batch 2 gaps in REMAINING_WORK.md. In particular: CRM contact merge/reparenting and pipeline/bulk controls; durable knowledge ingestion/embedding budgets and richer agent routing/providers; campaign draft editing/opt-out collection/compliance and analytics; OR/branch automation and graphical sequences. Keep current-contact AI tools limited to explicit permissions and keep unknown external results non-retryable until reconciled.

Then Batch 3 starts with real ledger-backed reporting (messages/conversations, campaign_recipients/outbound_jobs, ai_runs, crm_deals and automation_runs), date filters and exports, followed by Stripe event reliability, platform-admin privilege boundary and verified white-label domains/entitlements. Batch 4 completes legacy bilingual/mobile/accessibility flows, template/wizard integration and operator documentation. Do not insert fake metrics or start full release acceptance prematurely.

## CRM continuation — 2026-10-23

Started from verified local/remote `e3f714e5d7bd5c15a3f6781bdfac4d3f3bca7ba8`, same branch and Draft PR #1. Added connected sales-pipeline editing/removal and safe stage remapping; deal writes share pipeline locks with configuration changes. Bulk contact lifecycle/owner/additive-tag edits are atomic, tenant scoped and restricted to owner/admin; the UI supports selecting up to 100 contacts. No new schema is required.

Verification: full API/Next build and TypeScript passed; ESLint passed; 44 API unit tests passed. Expanded business smoke passed against a stable compiled local API, including rejected unsafe stage deletion, stage remapping, empty/occupied pipeline removal, cross-tenant rejection, successful bulk edits and rollback on a missing contact. External sending and paid AI calls remain disabled. No final browser/security/performance/visual acceptance was performed.

Batch 2 is still partial; Batches 3–4 remain unfinished. Immediate next implementation: safe duplicate-contact merging with identity/consent/campaign-ledger preservation, then remaining campaign/AI/automation work described in REMAINING_WORK.md. This checkpoint does not declare product completion.
