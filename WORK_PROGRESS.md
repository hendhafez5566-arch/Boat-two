# Flow Builder fidelity — 2026-11-07

Branch: feat/flow-builder-fidelity-20261107. Base is the verified deployed source `559fa8c034a76a0f1a08842610f5a5d35caf268e`, preserving PR #12 product changes and PR #13. PR #12's later documentation-only checkpoint is not an ancestor; its existing branch remains untouched.

## Milestone A — in progress
- Verified Railway web deployment abc3b343-d032-4c4d-bba3-57a795fc0a55 (sleeping) and API 1b75418b-378d-4a3c-b1fa-16c40baf5795 (success), both source 559fa8c.
- Web Sleep Application remains enabled; source pinned to phase2a, not the new branch. No Railway mutations/resources created.
- Signed-in live BotSailor inspected; Create opens a new, unsaved flow editor. No existing reference bot modified or saved.
- Measured palette 56 px collapsed / 264 expanded, cards 264 px, reference card 163 px high, connector 15 px, left configuration drawer 576 px.
- Inspected Reference and Image configuration. Reference shows Back/Rearrange/channel/Save; no visible Publish or undo/redo controls yet. Further inspection required before any completeness claim.
- Last edited: FLOW_BUILDER_REFERENCE_INVENTORY.md. No product code changed or tests claimed yet.

## Next
Complete reference interactions, archive safe screenshots/measurements; compare current Boat Two. Implement scoped shell then nodes and interactions in small pushed batches. Run isolated create/save/reopen/preview/publish/runtime + tenant/roles and regression before any deployment. PLAN_LIMIT must stay enforced; live create may remain BLOCKED.

## Milestone B — shell implementation checkpoint
- Last changed: editor page, BlockPalette, editor-shell.module.css. Toolbar now prioritizes Back/Rearrange/channel/Save with measured 40px controls. Name/status/Preview/Publish/settings and zoom remain functional under More; essential Boat-specific publishing is an explicitly retained exception.
- Removed default dot grid and bottom zoom/hint chrome; extra block groups are collapsed behind Additional Boat Two blocks. No node types or saved graph data removed.
- Autosave now defaults OFF to match explicit Save workflow and prevent incidental changes; opt-in remains available.
- TypeScript `tsc --noEmit` passed; build/UI interaction checks pending. No deploy authorized by this checkpoint.
- Live Boat Two login verified, existing QA draft opened read-only. No live flow edited or saved.

## Milestone C — WIP node/connection checkpoint
- Scoped 264px node cards, 48px headers, footer ports and 15px sockets; independent SVG block icons. Start decoration now fits initial viewport after measurement.
- Message statistics use actual API statistics (unavailable stays —); blank cards show an independent configuration gesture icon, while validation errors remain available.
- Connections use 2px Bezier curves; sockets move to opposing footer sides and mirror in RTL. Reference-output reconnection updates the actual startNodeId, never saves a decorative node/edge.
- Clone/Delete retained on node contextual toolbar; editing via double-click and original editor forms retained.
- TypeScript check passed again. Production web/API build passed on the preceding shell checkpoint. Current node changes await fresh build and UI/runtime acceptance; no deploy.
- Reference context menu additionally exposes Product, Product Section, Row, Section. Nested reference actions remain incomplete; no full parity claim.
- Code and sanitized text observations are pushed. Screenshot binary upload has not succeeded; images retained locally pending durable attachment.

## First UI run — failures retained, fixes in progress
- First run: 9 failed checks. Product defect: decorative reference dimensions were discarded, leaving it hidden. Fixed by supplying its measured264×163 dimensions explicitly; retest required.
- Test harness defects: locale initializer overwrote Arabic on reload; preview close accessible name and published_version field assertions corrected. These were not claimed as product fixes.
- First API suite:210 passed,2 test modules could not initialize without required environment variables. Rerun with isolated dummy configuration pending.
- Initial failing JSON retained; no deployment. Next: rebuild/retest, then full node interaction and protected-flow acceptance.

## Property panel checkpoint
- Flow Builder opts into reference-sized drawer variant; campaign uses of the shared component keep the existing default.
- Template/condition drawers640px, label drawer520px, others576px; text input200px and footer follows content like the measured reference.
- Removed header close icon in this variant; footer Close and Escape retained. Clone icon is independent SVG; node tools only show on hover/selection/focus.
- API suite rerun with isolated required config:216 pass/0 fail/0 skip. Current UI retest pending; no Railway mutation.

## Milestone D — contextual interactions checkpoint
- Added measured220px right-click menu, four grouped block menus, search and existing product/catalog entries. Additional supported Boat blocks retained under a collapsed section. Unsupported reference Row/Section/Notify Contact are not replaced with fake actions.
- Fixed real More-toggle defect: menu scrim covered the toggle; trigger now remains operable above its scrim.
- Second UI run: initial reference visible and ten AR/EN width cases passed; preview, persistence, real publish/republish and tenant isolation passed. Three remaining failures: menu-toggle defect above, and property close test selector caused a subsequent blocked action; corrections pending retest.
- Reference undo/redo verified on temporary clone deletion (22→23→22 nodes); pan/wheel and Back tested. Existing saved audit-only graph read back and contained original travel test content, no new inspection nodes/text. Its updated date changed during the session; cause not established, so unchanged timestamp is not asserted. Global reference Save was never invoked.
- Last changed: editor page / editor-shell.module.css / QA script. Typecheck passed before edge-clamping CSS; fresh build/UI checks pending. No deploy.

## Acceptance checkpoint — 2026-11-07
- Latest isolated run26 pass/1 fail: actual UI creation, mouse connections, save/reopen, UI publish/edit/republish, all31 block configuration forms, Admin/Agent API permissions, tenant isolation and Webchat→CRM→human handoff passed. Intermittent keyboard Delete after undo/redo was isolated and editor-owned deletion added; fresh retest pending.
- Enter now opens a focused node's configuration; underlying native input shortcuts stay untouched. Rearrange uses measured column envelopes horizontally, mirrored in RTL. Existing40-node/cycle/disconnected/button-envelope layout checks passed.
- Visual capture:50 before/after pairs (30 builder state pairs across five widths × two languages;20 protected-route pairs). Protected routes20/20 pixel-identical at1366×936. Ten responsive drawer checks passed, no browser page errors. This does not establish BotSailor pixel parity.
- Reference viewport is1363×936; requested alternate reference viewports have not been established. Some reference settings/actions remain gaps, including random-character generation versus numeric range, reference notification action, row/section nodes and sequence campaign composition.
- Last product files: editor page and flow-layout.ts. Source checkpoints pushed to PR14; fresh build/retest pending. No Railway changes or new resources.

## Loading/error and touch acceptance checkpoint
- Added explicit localized Loading flow state, error Retry, and disabled Save until a real graph loads. No fake success or placeholder graph introduced.
- Full UI journey now uses the same manager-created flow through add/configure/connect/save/reopen/preview/publish/edit/republish. Fresh run pending on current source.
- Live Preview creation retried only on the named QA Webchat account and was BLOCKED by PLAN_LIMIT. No record was created; no billing/plan changes attempted.
- Last changed: editor page, editor-shell.module.css, QA script. Previous checkpoints are remote; current source must rebuild/retest before deployment.

## Latest completed acceptance run
- Current product source36aa37418e7638109889ac356acda9119813d81d built successfully. Run r8:31 checks PASS,0 FAIL,0 browser errors, including all31 supported block configuration dialogs counted within that suite.
- Same UI-created flow completed create→add/configure/connect→save→reopen→server preview→publish→edit→republish. Keyboard deletion after undo/redo and Enter/Escape now passed. Arabic touch drawer and real load error/retry passed.
- Two focused start-socket/edge-disconnect tests added next; not yet claimed passed. Source remains undeployed. Latest code and results must stay in PR14.

## Final functional checkpoint
- Acceptance r10 completed:33 PASS/0 FAIL/0 page errors. Includes31 supported node configuration dialogs and same-flow UI creation-to-republish, root reconnection, edge delete/undo, keyboard and touch, roles/tenant isolation, live local outbox→CRM→human handoff.
- Final visual rerun on36aa374:50 pairs;20/20 protected pages pixel-identical;10/10 responsive drawer bounds passed. API216/216 passed.
- Scoped lint identified two unused imports left by removed chrome; removed only those imports. Rebuilding and rerunning scoped lint/typecheck; no runtime behavior changed after the passing UI suite.
- RELEASE BLOCKED: full reference parity remains incomplete (see inventory). Live Preview create independently BLOCKED by PLAN_LIMIT. No Railway deploy, main merge, resource/configuration/secret changes. Both existing Web/API still pinned559fa8c with Sleep enabled.

## Resumed checkpoint — 2026-11-07 (PR #14)
- Verified GitHub HEAD10f1df82 before checkout; all six requested checkpoint files read. Existing work retained.
- Baseline rebuild: Web/API build, web TypeScript and scoped ESLint passed; recursive API suite216/216 passed. An initial one-directory shell glob ran154 tests; the explicit recursive run is the authoritative result.
- Live BotSailor new unsaved canvas and Image configuration inspected again; no global Save. Existing Boat QA draft opened read-only after secure login.
- First scoped visual batch: replace font-dependent analytics glyphs with independent SVG symbols; use the existing node-type SVG in the configuration header. Data, routing, analytics counts, and campaign/default panel fallback remain intact.
- This checkpoint is pushed before the fresh UI acceptance rerun. No parity claim or deployment for this batch. Node dimensions, missing node concepts and Random Character semantics remain unresolved.
- Railway current Web deployment6dcc4257-e623-4821-ad87-9f7aeb3bf5df and API1b75418b-378d-4a3c-b1fa-16c40baf5795 observed; original log's undeployed Web assertion is historical. No resource, variable, Sleep or source mutations in this continuation.

### First resumed batch validation
- Remote source e04731bd confirmed on PR14 (draft). Shell git push had no GitHub credential; the same file batch was pushed using the authenticated GitHub connector, without changing branch/base.
- New Web production build, TypeScript and scoped ESLint passed. Independent SSR contract test renders all31 supported node icons and4 analytics icons, checks actual SVG paths, no font text or focus targets. Recursive API216/216 still passes.
- Original33 UI checks are historical, not rerun: automatic approval rejected local Chromium package setup due the earlier Cloud Browser instruction. Cloud Browser is signed into both sites; existing QA draft is inspected without Save/Publish.
- Proposed release is Web-only icon presentation; no API/schema/runtime changes. Current before screenshot retained privately at1363×936; post-release inspection must verify exact same graph/counts and property-panel close/cancel. No full BotSailor parity claim.

### Connector selection batch
- Live reference: connected temporary Start→Image; target settings opened automatically. With Image selected, DOM-measured connection stroke rgb(119,130,146),2px. Global reference Save not invoked.
- Boat source changed connected edges to primary purple and dimmed unrelated edges on node selection. Removed these visual overrides; hover/selection disconnect tools, hit target, Bezier geometry and actual graph editing stay intact.
- Fresh SSR selection regression covers adjacent/unrelated selected nodes; fresh build/typecheck/lint and live post-deploy check pending at this checkpoint.
- First resumed batch deployed Web1798fe65-9e1b-43dc-9b81-563cc432a610 at source01852f2. Cloud confirmed4 SVG analytics icons, same four counts0/0/0/0, same286×63.8 displayed stats bounds at1363×936; configuration opens normally.
- Isolated HTTP journey6/6 passed. Initial5/6 result retained: the first runner omitted the actual internal outbox worker. Rerun enabled the existing test-only worker; no production logic changed for that harness issue.

### Measured selected-card finish
- Existing node-metrics.json fixes selected border rgb(13,139,241), and card shadow rgba(139,141,141,.15)0px4px8px. Previous source still used#1993ce and0px3px7px#243b4b12. Applied exact recorded values to reference/card selectors only. No geometry or runtime modifications.
- Fresh production build and live computed-style confirmation are required before accepting this finish.

### Node-focus zoom correction
- New and fit-all viewports already cap automatic zoom at1, but focusNode used1.1. Opening the existing QA step enlarged its264px card to290.4px versus reference264px. Capped only automatic node focus at1; manual zoom range remains unchanged. Fresh source checks and live width confirmation pending.

### Preserve authored positions on opening
- Live QA More showed Unsaved before any author edit; source investigation found the loader automatically ran computeLayout for overlaps/nearby coordinates and marked dirty. Removed that loader-only rewrite. Explicit Rearrange and add-node collision handling remain.
- Added round-trip coverage for negative/fractional overlapping authored positions in RTL/LTR, including unchanged saved data/edges. Fresh tests/build and live Saved-state check required before release.

- Position batch validation:4/4 graph conversion/derived-card round-trip tests passed; web TypeScript, scoped ESLint and production build passed. A missing type-only import in the new test fixture was corrected before push/deploy. API/runtime unchanged.

## Latest resumed release and acceptance checkpoint
- Product source fbfa99835e99d4800f95c714cdb7f29b267940f9 deployed to existing boat-preview-web only:5aad01a2-9359-4812-89e2-7bb45b2573da SUCCESS. API stays1b75418b-378d-4a3c-b1fa-16c40baf5795. No new Railway resources, variables, domains, volumes, Sleep changes or main merge.
- Live Cloud Browser: Arabic/English at1363×936; selected card264px screen width; border rgb(13,139,241); shadow rgba(139,141,141,.15)0px4px8px; both connections rgb(119,130,146),2px,opacity1; four stats retain0/0/0/0. Header uses type icon; open/Close work.
- Reopening the same QA draft now shows Saved without Save; before the loader fix it showed Unsaved due automatic repositioning. No existing live graph saved/published during this continuation.
- Evidence: resumed/RESULTS_AR.md,216 API tests,31+4 SVG renders,2 selection renders,4 graph conversion cases,6/6 real isolated HTTP journeys, before/after screenshots and actual DOM measurements. Initial HTTP5/6 harness failure is retained with its worker correction.
- Previous33 UI suite,50 local pairs and20/20 protected comparisons remain historical. Full rerun across320/390/768/1366/1920 is BLOCKED here: local Chromium setup was rejected by automatic approval under the earlier Cloud Browser instruction; Cloud exposes the fixed1363 viewport used for this run. No workaround/download was used after rejection.
- PR14 remains Draft. Distinct Notify Contact/Row/Section, character-generator semantics, full sequence composition/provider commerce and complete window-by-window parity are still gaps. No full completion/parity claim.

- Final English rerun also used released fbfa9983:264px cards, reference selected border, grey connections and576px left drawer at1363×936. Arabic RTL uses576px right drawer. Restored Arabic preference after the test. Screenshots and DOM measures are retained in resumed/.

## User Input Flow — isolated management/report batch (in progress)
- Working tree resumes from remote HEAD `4ca0111eaa06486fc0943cfaa03c7acd1e1e87e2` on the existing PR14 branch. No new branch or project created.
- Live reference and Boat were previously inspected at1363×936. Reference list exposes Report / Export Flow Data / Edit, while Boat previously misclassified regular `question` automations as User Input Flows and showed extra Duplicate / Copy / JSON / Delete / Folder / Status / Refresh controls. A specialized User Input editor is still a separate remaining batch.
- Current code now classifies only `user_input` node graphs for this section; creation reuses the requested flow name as campaign name. Added tenant-scoped Owner/Admin-only answer report API over saved flow session versions, and a read-only report page plus real CSV export of configured answers. Report omits phone numbers and arbitrary flow variables. Existing extra actions remain available in the general automation section.
- Isolated validation: all75 Flow API tests passed; API TypeScript build passed; Web TypeScript passed; scoped ESLint passed; Web production build passed. Full isolated HTTP harness passed9/9, including User Input create/reopen/empty report, real Webchat question order, invalid email rejection, valid email, CRM custom attribute/system email storage, handoff state, Owner/Admin/Agent permissions, and cross-tenant report isolation. Only synthetic test records were used in PGlite; no provider sends.
- Visual acceptance for the changed UI has not yet occurred: Railway remains on the previous Web source `fbfa99835e99d4800f95c714cdb7f29b267940f9`; no deploy, screenshots, alternate viewport, or live data writes in this batch. Do not call this UI parity or release-ready. Next: implement the reference-shaped question editor, then push this batch and run same-size Cloud Browser comparisons before any deployment.
- First batch commit `d72228f7ebb6cabceaaccd7faa1fdb9b12f6dfc4` is on the existing PR14 branch.
- Question-editor batch adds the reference's Free keyboard / Multiple choice modes, all11 supported reply-validation formats, CRM custom/system destination, Additional Options, and a configurable 20-character multiple-choice list button label backed by the real runtime. Existing question ordering, retries, skip, thank-you and completion actions remain available. This remains the existing `user_input` execution model; no parallel runtime or data migration was introduced.
- Fresh validation after that batch: all76 Flow API tests PASS; API build PASS; Web production build PASS; post-build Web TypeScript PASS; scoped ESLint PASS. The isolated HTTP journey is9/9 PASS, now including a four-option Webchat list and its saved button label, invalid email retry, real CRM custom attribute/system email, report contents, handoff, roles and tenant isolation. Automated UI/browser acceptance and live screenshots are still pending; no Railway deployment yet.

## Platform fidelity continuation — 2026-11-08
- User Input Flow is closed by owner scope. PR14 remains Draft at verified starting head d5116324. Live Boat and BotSailor sessions are authenticated.
- Started Bot Manager Settings: reference General inspected without Save/Publish. Current activation contract ignores getStartedFrequency, so its editor is disabled with a bilingual explanation while preserving saved values. Time-field accessible day names now use the active locale. No runtime/data/schema change.
- New PLATFORM_FIDELITY_PROGRESS.md records all remaining areas and next steps. Web TypeScript and scoped ESLint passed; current-change browser/visual/roles/tenant acceptance not run. No deploy or parity claim. Existing API release remains blocked by the recorded mise download failure; no repeated deployment attempted.

## Channel signature runtime batch — 2026-11-08
- Linked explicit per-channel activated signatureEnabled to MessagingService's real agent outbound text/media formatting. Drafts do not affect delivery; legacy/workspace behavior remains the fallback. Existing workspace template reused; no schema/provider/new engine change.
- Actual full Nest/PGlite HTTP7/7 PASS verifies save/reopen/activate/deactivate/stale draft, Inbox persisted messages, CRM identity and handoff preservation, second channel/workspace preservation, roles and tenant isolation. API source225/225 PASS, API/Web builds, web TypeScript and scoped lint PASS. Initial fixture/runner failures retained in PLATFORM_FIDELITY_PROGRESS.md.
- Shared Inbox reference inspected live without save/publish. Message Template Mixed creation inspected without saving. Visual acceptance for new code remains BLOCKED; no current-source browser PASS/deploy/full-fidelity claim.

## Channel human-session expiry batch — 2026-11-08
- Existing Inbox policy worker and due SQL extended with activated per-channel positive expiry; absent/null preserves workspace behavior. Migration104 is additive CREATE OR REPLACE, preserves SLA and function grants. Zero activation denied pending verified reference semantics.
- PostgreSQL test executes real migration twice and worker under tenant RLS across two tenants/eight channels, verifies active vs draft/legacy/malformed, internal expiry event and no duplicate event. API227/227 PASS and full Nest/PGlite HTTP7/7 PASS after schema104, including active expiry receipt, roles/isolation/CRM/handoff. API build, scoped lint and web TypeScript passed. No new browser/visual parity claim.
- API-only deployment attempt of preceding f24379f2 was cancelled by Railway tool approval; no new deployment. Staged source restored to original d511, but a no-op source patch remains visible (documented in PLATFORM_FIDELITY_PROGRESS.md); no discard tool exposed. No main/resource/variable/Sleep changes.

## Message Template studio continuation — 2026-11-08
- Verified remote9812afbe and live reference Mixed Template. Captured sanitized DOM measurements and locale choices; no reference save/sync/submit. Manager create/edit now renders inline using a scoped variant of the existing shared form; ordered cards and side preview, connected supported category/header choices,71 valid locales and real draft save / save-to-review-confirmation. Existing template API and provider gates retained.
- HTTP7/7 PASS in full isolated Nest/PGlite,20 populated default/manager renders PASS,71 locale contracts PASS, scoped ESLint and TypeScript PASS; build log and detailed limitations in docs/platform-fidelity-20261108/. Browser/visual acceptance on modified source and real provider acceptance remain BLOCKED. No deploy/main/new resources. Section remains IN PROGRESS; do not claim full parity.

## Connected accounts reference batch — 2026-11-08
- Verified remote2cdcb945 and live reference Connect Account DOM metrics. Channels now uses a compact account/status/platform/check/MM/actions table, truthful API-backed expiring state, search/status/platform filters and statistics; existing full account actions remain under Manage. Large onboarding guide moved behind disclosure; ChannelCatalog has a scoped connections variant with its original variant retained.
- Isolated channel HTTP6/6 PASS; full Flow/Webchat/CRM/Handoff/roles/tenant regression HTTP9/9 PASS after schema104; filter/state/catalog tests, TypeScript/scoped ESLint and web production build PASS. Visual/browser acceptance of modified source not yet claimed. Details and pending provider/Google/MM/last-sync/disconnect semantics in docs/platform-fidelity-20261108/CHANNELS_AR.md.
- User requested existing Preview deployment; source checkpoint first, then API-before-Web compatibility and terminal deployment verification. No resource/config/Sleep/main changes authorized beyond existing service source pins.

### Channels release checkpoint
Product source1f249b6b pushed/verified. API-before-Web deploy staged on the same existing Preview API only; accept-deploy cancelled explicitly because tool approval was not granted. No new deployment/build; Web not staged or deployed. Pending patch ae600b07-b326-42c8-9aaf-d5e0efdca76d pins API to1f249b6b when/if approved. Do not deploy Web before successful API/schema104 compatibility and do not claim current-source visual acceptance.

## Connect Account continuation — 2026-11-14, first batch
- Resolved workspace blocker with a direct single-branch Git clone; verified starting HEAD b20dbe19. Frozen-lockfile dependency installation succeeded.
- Reused authenticated live reference observations. Connection Guide, statistics, filters, MM Status and account table are present in BotSailor and are not indiscriminately removed.
- Removed the extra first-customer journey, website-test shortcut and three bot preparation/test cards from the guide. Retained a concise bilingual connection explanation and removed unused step styles. Existing channel/OAuth/provider/diagnostic/data actions are unchanged.
- Fresh Web production build PASS; scoped ESLint PASS; existing channel-overview/catalog contract checks PASS. This is a saved first batch, not full UI/provider acceptance.
- Remaining: inspect reference details and actual Boat UI, align provider-specific launch surfaces, test AR/EN at requested widths, isolated provider/role/tenant journeys and visual before/after evidence. No deployment or full-parity claim for this batch.

## Channel connection journeys — 2026-11-14
- Owner requested skipping Facebook login. WhatsApp embedded journey actually opens Catalog/Without Catalog choices before Meta. Facebook human verification and all downstream provider choices remain BLOCKED; no permission granted or production link changed. Detailed observed steps are in docs/channel-connections-20261114/WHATSAPP.md.
- Telegram has a dedicated connection page with Bot Token only; backend verifies bot identity before persistence, derives provider name, registers the existing webhook, checks connectivity and reports incomplete setup without false success. Duplicate guard and existing endpoints are preserved. Details in TELEGRAM.md.
- Fresh API and Web production builds PASS; scoped lint PASS; nine isolated tests PASS. The tsx CLI IPC limitation was resolved with the supported node --import tsx test runner. No live provider acceptance, visual parity or deployment claim.
- Current remaining scope includes WhatsApp manual/embedded UI, Facebook/Instagram pre-auth surfaces, Webchat/Google, provider post-auth states, full UI/HTTP regression and final release. Facebook login stays skipped per owner.
- Follow-up acceptance: real full Nest HTTP server with all104 migrations and PostgreSQL tenant RLS passed token-only onboarding, unauthenticated401, agent403/admin success, malformed400, same/foreign-tenant duplicate409, provider-derived name, token redaction and webhook failure recovery. Only synthetic provider responses; the QA provider fixture denies non-loopback external traffic except its strict synthetic Telegram allowlist.
- First HTTP attempt from a separate command could not reach the isolated server (ECONNREFUSED). Launching server and HTTP client under one subprocess runner passed; no production/environment change. New endpoint requires API-before-Web deployment; do not release Web against the old API.

## WhatsApp / Meta connection entry rebuild — 2026-11-14
- Dedicated WhatsApp, Facebook and Instagram pages now replace catalog-to-generic-dialog navigation. WhatsApp presents the two observed method cards, Embedded launch then With/Without Catalog choices, and an inline API form with WABA ID then access token. Legacy cloud-number mode remains secondary in advanced options.
- Added a real manual WABA sync endpoint: validates messaging/management permission, reads bounded paginated phone identities, reauthorizes existing local identities or creates new ones in one database transaction, rejects foreign tenant identities and reports subscription/verification results. Sanitized account metadata returns WABA IDs, never credentials.
- Catalog requires the separate optional META_EMBEDDED_CATALOG_CONFIG_ID. Missing configuration is visibly disabled and server-rejected before creating a signup state. No operator variables changed. Live Catalog authorization and all post-Meta reference screens remain BLOCKED; the existing non-Catalog config is retained.
- Fresh Web production build PASS (54 routes), API build PASS, scoped lint PASS and ten focused tests PASS, including PostgreSQL two-phone sync, identity preservation, redaction, cross-tenant rejection, permission rejection and transaction rollback on plan failure.
- Test corrections retained: initial nested PGlite lookup stalled; identity reads were moved ahead of the write transaction while unique constraints still guard concurrent writes. An initial inferred-array TypeScript error was corrected before passing build. Initial standalone browser script ESM resolution failed; using the project's configured createRequire module loading is the next correction.
- CUA current-source localhost review returned ERR_CONNECTION_REFUSED. Continue with the repository's existing isolated Chromium test mode; no visual parity or deployment claim at this checkpoint.
- Remaining: configured browser QA and full HTTP regression, Webchat/Google, main account actions, visual comparison and release. No live account changes, Meta login retry, deployment, Sleep or Railway resource changes.
- Scripted visual acceptance found a real runtime blocker: installed Chromium cannot create its singleton socket (EPERM). No local browser workaround or privilege escalation attempted. Added a branch-only read-permission GitHub Actions job to run the same isolated AR/EN viewport checks and upload synthetic screenshots; CI results are pending, not PASS.
- Main Connected Accounts now exposes Get Embed Code for real Webchat snippets via one code dialog. Account removal from this page is replaced with explicit local disconnect (PATCH disabled), preserving conversations and channel data; dialog explains that provider permissions are not revoked. Provider disconnect semantics remain unobserved and are not claimed equivalent.

### Visual acceptance checkpoint — 2026-11-14
- Branch CI run 43585204291 PASS: real isolated Web/API, AR/EN across 320/390/768/1366/1920 widths; 70 screenshots saved in workflow artifact 14110730279. Provider start/config fixtures are explicit and all external browser requests blocked; no live OAuth acceptance claimed.
- Reviewed desktop WhatsApp, mobile manual form and Facebook screenshots. Corrected scoped heading size, WhatsApp method artwork using independent SVG, green embedded/purple API launch buttons, advanced option placement and mobile table overflow. Re-capture pending for these corrections.
- Fresh Web build and scoped lint PASS. Full recursive API suite with bounded test concurrency PASS: 229/229. Initial no-env run failed two config imports; simultaneous unbounded run lost one test process; supplied test-only environment and concurrency=4 passed all files without source changes.
- Reference Webchat setup includes several unsupported current widget capabilities; Google pre-auth is one sign-in action. Remaining source work and provider BLOCKED states are not treated as complete parity. No deployment yet.

### Remaining connection entry points — 2026-11-14
- Pushed and verified visual correction checkpoint b1920a6a; CI43586431415 PASS; reviewed corrected desktop WhatsApp and mobile API screenshots (artifact14110258900).
- Added dedicated Google pre-auth entry with one real OAuth action, same observed Calendar/Contacts service family using narrower existing supported scopes. Existing callback/data source behavior is retained; post-sign-in remains BLOCKED. Stats derive stored granted scopes.
- Added dedicated Webchat list/setup modal. Theme/bubble colors, HTTPS logo URL, wallpaper color, font allowlist, four placements, startup state, offsets and delay now persist and affect the real shadow-DOM widget. Existing legacy header/wallpaper behavior is retained when new keys are absent. No visitor upload/help tabs or fake controls; these reference gaps remain explicit.
- Main cards gain observed WhatsApp recommendation and secure footer; catalog navigates directly to channel-specific surfaces. Expanded isolated browser checks capture main/Google/Webchat setup, saved row and actual widget runtime, asserting saved settings, provider-start errors and viewport containment. Results pending CI.
- Fresh Web/API builds, scoped lint and all229 API tests PASS after runtime/schema changes. No live connection, production messages, deployment, new infrastructure or Sleep mutation.

### Connect Account continuation

Inspected the signed-in BotSailor overview and Facebook, Instagram, Google, and Webchat entry pages in the cloud browser. Added separate social setup and benefits panels, Google account search and scope details, and persistent Webchat settings editing alongside its separate creation and widget-list sections. Live provider authorization and acceptance of this branch on Railway remain pending. Next action is to verify this exact commit with CI and inspect the build on the existing preview before acceptance.

GitHub Actions run 43595935535 timed out selecting Webchat Position. Commit 8f9bc80 adds explicit select names and covers editing a persisted widget. Run 43597026420 advanced through the earlier English browser cases and then caught overview overflow at 768 px. The overview now applies its tablet layout at 768 px. Next action: open the Channel connection acceptance workflow for this HEAD, inspect any failing browser log, then deploy only a passing SHA to the existing Railway preview and repeat the browser acceptance there.

## Enterprise platform expansion — 2026-11-14
- Owner expanded scope to the full platform. Fetched and switched cleanly to actual remote HEAD c87162ad; retained all newer flow/channel changes. Latest channel CI43603729491 SUCCESS. Existing Railway Web c87162ad SUCCESS; API49bd6167 SUCCESS. No infrastructure changes.
- Cloud browser reference action denied by automatic approval review because Work usage limit was reached. No browser workaround attempted. Independent source/CI work continues.
- Added complete source-route inventory and prioritized defect/acceptance backlog, with no unverified page marked DONE. Added full static-dashboard plus synthetic-flow runtime/responsive sweep across AR/EN and five widths, recording actual button/field/link inventory, headings, overflow culprits, runtime errors,5xx and desktop/failure screenshots. This is smoke coverage, not all-button functional acceptance.
- New branch-only CI uses existing isolated API/PGlite and Web; all non-loopback browser requests blocked. Sweep results pending.

### Shared interface batch
- Introduced reusable page/body/dialog typography tokens; shared page headings now20px rather than variable23.2–30.4px. Dedicated editor/node typography remains scoped.
- Fixed global menu search keyboard behavior: true combobox state, ArrowUp/Down selection, active descendant, selected result on Enter and visible active option. Added actual browser route assertion for keyboard selection.
- Fresh Web production build and scoped ESLint PASS. Initial platform CI43605901007 stopped before UI because the synthetic onboarding fixture had no channel; added a synthetic Webchat before completing onboarding. No application rule/test assertion weakened. Next run pending.
