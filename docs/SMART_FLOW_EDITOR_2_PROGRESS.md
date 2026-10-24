# Smart Flow Editor 2.0 — progress

Base verified against remote: `145a9864f08bcce365eaa700fdb4320e13b3e36e`.

## Group 1 — shared shell, message and graph actions
- Dedicated message task editor: live bubble, caret-aware canonical variables, choice cards, in-inspector drilldown, reorder and confirmed removal, all list sections editable.
- Real create/connect/open actions reuse existing graph operations, stable `option:<id>` handles, history and persistence. Existing-step picker has search and replacement confirmation.
- Shared header/footer and desktop/tablet/phone surfaces; phone is full viewport. Done awaits existing save; failure keeps editor open.
- Existing NodeType fields retained, condition and expanded modal use same rule data, handoff technical assignment folded, request headers/JSON folded.
- `test-ux19.mjs` and updated `test-ux-designer.mjs` pass. Production compilation/type checks passed; build finalization and browser acceptance continue in group 2.
- No API/schema/engine changes, external sends, AI activation, deployment or merge.

## Pending acceptance / group 2
Browser screenshots, full build exit, expanded focused regression checks, question field picker and collapsed question chain. Remaining parity/visual gaps will be recorded explicitly after verification.

## Group 2 — in progress
- Added human answer destination picker with custom key kept under Advanced; one question in a chain expands at a time, stable reorder retained.
- Added per-type usage guidance to the library and all retained editors, action summaries on choice cards, review return with viewport restoration.
- Browser review found and fixed duplicated controls during drilldown, toolbar overflow on phones, and same-node reopening after close. Screenshot assertions wait for drawer transitions (subpixel dimensions use tolerance).
- New offline regression script covers every NodeType roundtrip, all supported action types, multi-section edits, stable handles and rich condition rules.
