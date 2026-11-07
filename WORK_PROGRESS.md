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
