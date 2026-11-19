# Flow lifecycle closeout — 19 November 2026

Started from verified PR #14 HEAD 3653f6f3ada028f5faecbf55ab588ec88360d58e. No main merge or deployment. Accepted catalog, assignment, SLA/CRM, integration output and event-worker work retained.

## Repairs

- `0f579db`: duplicating a reusable component now preserves `is_component` and folder placement. The new copy remains a draft with no live version. Publishing it cannot select it as a channel's standalone bot. Normal bot copies remain normal bots.
- `0f579db`: deleting a bot removes only channel active-bot pointers equal to the deleted ID in the same tenant transaction; deleting an inactive bot preserves its replacement's selection. Failed/foreign deletion cannot mutate channel selection.
- `0f579db`: 300-node publication limit is enforced after the entire graph is expanded, including ordinary trailing nodes. A valid-sized draft could previously expand beyond the cap because only subflow-loop branches checked the count. Reproduced before repair; exact 300 succeeds and 301 rejects.
- `3cb84e5`: subflow scoping now produces deterministic bounded IDs for long prefixes, generated return nodes and edge/start references. Previously valid 60-character source IDs could publish to an expanded graph that failed editor save validation after restoration. Reproduced against actual graph schema, then repaired without widening API limits or mutating existing published versions. Existing short scoped IDs retain their spelling.

## Acceptance matrix

| Item | Status | Evidence / boundary |
| --- | --- | --- |
| Subflow node count after expansion | DONE — VERIFIED | 286-test/PostgreSQL run 44568738120: exact boundary and rejected-publication version/channel preservation pass |
| Long-ID expanded version remains editable | DONE — VERIFIED | 286-test/PostgreSQL run 44568738120: deterministic bounded IDs, valid references, restoration and actual draft save pass |
| Component/normal duplication and active deletion | DONE — VERIFIED | Real PostgreSQL 44568738120: owner/admin copy, agent/foreign denial, component type/folder, active and inactive deletion pass |
| Restore version to draft without changing current live reply | DONE — VERIFIED | Actual UI 44568738118: four AR/EN × 390/1366 journeys edit/save draft, restore v1, observe v2 live visitor reply, then publish v3 and observe v1 for a fresh visitor |

Local: five component expansion tests pass; API type-check passes. [Full enterprise run 44568738120](https://github.com/hendhafez5566-arch/Boat-two/actions/runs/44568738120), source 58ec57a: SUCCESS, 286/286 API tests plus 8/8 scoped handoff tests. New lifecycle matrix and retained event/agent lock contention, stale integration output, SLA/CRM/role, attachment, real process recovery, bounded load, reports, billing and disposable restore checks pass. This is scoped evidence, not full advanced-node authoring closure.

[Version browser run 44568738118](https://github.com/hendhafez5566-arch/Boat-two/actions/runs/44568738118): SUCCESS, 4/4; evidence JSON and Arabic desktop versions-dialog screenshot reviewed. The screenshot exposed cramped inline layout and duplicated heading. Application follow-up de2579d organizes versions into responsive rows with current-live badge, readable date/time and focused restore actions. [Final version browser run 44570020622](https://github.com/hendhafez5566-arch/Boat-two/actions/runs/44570020622), source ba68d1a: SUCCESS, 4/4 AR/EN × 390/1366 with new row count, current-live badge, datetime and restore-button viewport bounds assertions. The complete draft/restore/actual live-before/republish/actual live-after journey passes on the new layout. Final evidence JSON and English mobile/Arabic desktop screenshots reviewed. Backend application source remains 3cb84e5; later application de2579d only changes version-dialog markup/styles. Test-only ba68d1a corrects workflow dynamic-route glob and adds visual assertions.

Supporting UI at application source 3cb84e5: component/sequence/booking 44568084422, private configuration/role 44568084291, products 44568084211, editor recovery 44568084378, channels 44568084661, contacts 44568084240, follow-up 44568084290, button actions 44568084357 and platform responsive 44568084164: SUCCESS. Following test corrections do not alter backend code.

Initial acceptance fixture corrections are retained in history: duplicate/create response exposes folder/publication metadata separately from full GET (`is_component`); full GET exposes `published_version`, not `published_version_id`. Browser publication button is `Publish update` for an already published bot. No application API contract was changed merely to satisfy those assertions. Initial failed run 44567314140 (new fixture response-field mismatch) and 44567688787 (new fixture used Publish bot instead of Publish update) are superseded by the accepted runs above, not relabeled successful. Final visual acceptance above is based on the completed run and inspected artifacts, not the earlier layout or a queued build.

## Remaining scope and release boundary

No Railway API replacement, customer graph/file mutation, provider send, plan change, paid resource creation or main merge. Current customer-file inventory/backup remains unverified; continue independent software work but preserve that release gate. Copy/delete tests operate only on fresh synthetic companies and flows.

This batch does not assert historical long-ID versions created before this repair have all been found or normalized. Live versions and in-flight sessions are untouched. Existing partial advanced-node/provider failure/role/UI matrices and full sector journeys remain open outside the rows actually accepted here. SOFTWARE COMPLETE, PILOT READY and COMMERCIAL LAUNCH READY are not declared.
