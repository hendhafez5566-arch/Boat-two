# Smart Flow Editor 2.0 — handoff

PR: https://github.com/hendhafez5566-arch/Boat-two/pull/2  
Branch: `fix/boat-ux-19-one-batch`. Base remote HEAD verified: `145a9864f08bcce365eaa700fdb4320e13b3e36e`.

## Before → after

Classic generic inspector / short mobile sheet → task message editor, live bubble, large choice cards, contextual action setup, shared sticky header/footer, desktop dock and full-screen phone editor. Choice actions create/connect actual graph nodes using existing history/save operations. Tablet remains an overlay; preview and editing are exclusive, and return restores the viewport.

## Contract comparison

| Contract | Implementation / evidence |
| --- | --- |
| Shared structure and RTL/English | Shared task sections, 380–460px desktop dock, close/back, save status, Try/Done, folded technical controls. English smoke included. |
| Message / interactive | Live text bubble, caret-aware canonical tokens including `{{` suggestions, hosted media URL/caption controls and explicit unavailable automatic media preview/upload state. |
| Choices and lists | Large cards with action summaries, rename/descriptions, all existing list sections, reorder within sections, confirmed destructive controls, stable option IDs/handles; conversion rejects invalid counts/lengths and confirms metadata/removal. |
| Context actions | Message, question, condition, handoff, tag, delay, end and CTA URL nodes, plus searchable existing destination. Create/connect/open uses existing graph operations; replacing a link leaves its old node intact. |
| Conditions | Existing ALL/ANY/rule groups and every engine source/operator retained; upstream choice title/ID picker; system field picker; raw key folded; exact `rule:<id>`/`else` outcomes labeled yes/no, same modal data. |
| Questions / user_input | Text/type first, answer destination from known fields with advanced custom key, retry controls folded for question, live previews, one expanded chain question and stable reorder. |
| Handoff | Existing `/team` staff picker saves canonical `assignTo`; unavailable or missing saved member never clears stored data. Customer bubble, inbox default, no unsupported department API. |
| Other NodeTypes | All existing editable fields retained in shared shell with human title and per-type use guidance: subflow, location, cta_url, template, sequence, image/audio/video/file, set_variable, set_attribute, delay, http_request, sheet_fetch, business_hours, split, random_number, ai_reply, tag, note, end. Raw HTTP headers/JSON folded. All 27 NodeTypes covered by serialization test. |
| Canvas and library | Existing search, categories, drag/click connections, analytics switch, layout, map, history retained. Added per-type descriptions; creation immediately opens editor; same selected node reopens after close. |
| Mobile / tablet | Phone 100dvh, full width, 16px fields, 44px controls and safe-area footer; tablet max 460px overlay. Toolbar wraps to prevent document overflow. |
| Persistence | Original IDs, schemas, serializers, routes and engine preserved. Browser exercises real UI PATCH payload and reload against an isolated HTTP fixture; offline tests check every NodeType and branch handles. |
| Safety | No deployment, main merge, external delivery, database changes, AI provider activation or paid service. Simulator retains existing HTTP opt-in default off. |

## Verification

- `pnpm install --frozen-lockfile`: passed. Current environment uses pnpm 11; explicitly declined unnecessary Nest/esbuild install scripts in workspace allowBuilds (no dependency versions changed).
- `pnpm --filter web build`: passed production compilation, lint/type checks, static generation and build traces.
- `node scripts/test-ux19.mjs`: passed existing draft isolation, wizard actions, engine validation/roundtrip, RTL/LTR layout and localization checks.
- `node scripts/test-ux-designer.mjs`: passed actual new conversion handler, limits, cancellations, branch IDs, metadata confirmation and adding first button to empty message.
- `node scripts/test-smart-editor.mjs`: passed all NodeTypes/action types roundtrip, multi-section preservation, stable IDs, reorder, token caret insertion and rich condition sources/branches.
- `pnpm --filter api exec tsx --test src/flows/engine/engine.test.ts src/flows/expand.test.ts`: 39 passed, 0 failed. API was not modified.
- `node scripts/smoke-smart-editor-browser.mjs`: real local production app with in-memory HTTP API; no database, real users, WhatsApp delivery or external sends. Evidence and exact saved graph in `screenshots/smart-editor-2/result.json`.

Screenshots in `screenshots/smart-editor-2/`: desktop message, contextual action, condition, outcomes and canvas (1440×900); phone message, choices, action, condition and closed canvas (390×844); tablet overlay (768×1024). Browser also checks 360/430px overflow, 16px phone input, save/reopen, condition ANY persistence, staff assignment, stable links after format conversion, preview return/viewport and English LTR. Screenshots were visually inspected; they are browser renders of the app with fixture data.

## Exact remaining limitations / unverified acceptance

- Full live-database save/concurrency/tenant-permission integration and production/real WhatsApp behavior were not exercised. Existing route/security code is unchanged; fixture persistence is not proof of database persistence.
- Chromium only. Physical Android/iOS keyboards, safe-area on physical devices, 200% browser text zoom, Firefox/Safari and assistive-technology acceptance remain unverified.
- Secondary NodeTypes retain their existing core form controls in the shared shell; this is not a bespoke new task wizard for each of the 27 kinds. Their field serialization is covered, but every field was not manually edited in a browser.
- Full natural-language sentence summaries for compound conditions remain to be added; comparison rows and exact engine branch labels are implemented.
- Answer destination suggestions use known upstream fields, not a complete fetched contact-field catalog. Custom keys remain available in Advanced. Question stores a flow variable; user_input retains existing contact-attribute semantics.
- List sections are all editable; cross-section drag/move and adding/removing entire section groups are not new features in this batch. Row moves stay within their section.
- Media shows a truthful unavailable automatic preview state and preserves URL/caption controls; no local upload was invented. Nested condition groups beyond existing ordered rules, department assignment and new channel actions were not added.
- Existing history is reused; dedicated browser coverage for every action type's undo/redo, every ConditionModal source and keyboard focus-return/trapping is still outstanding. No claim that every F01–F19 / UX-01–54 scenario was individually rerun.
