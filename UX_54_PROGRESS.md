# UX 54 progress

## Designer scope: UX-01–UX-23

Source audit received at `7aef49a`; implementation checkpoints below are pushed on `fix/boat-ux-19-one-batch` (PR #2).

Implemented: UX-02–UX-11, UX-13–UX-21, UX-23. UX-22 reuses F06 translations/navigation with content excerpts added in this pass.
Reused after source review: UX-01 = F02/F10 collision-aware layout; UX-12 = F10 selected-edge insertion controls. Existing short layout/localization/round-trip contracts pass. No claim of verification on the deployed preview.

Remaining handoff: browser acceptance at ~1363×936 and mobile for inline choices, analytics switching, arrange/fit, click-to-connect, conversion undo, condition source pickers, preview/inspector switching and fullscreen. No deployment or full Next build performed. UX-24–UX-54 outside this account's scope.

Checks: `node scripts/test-ux19.mjs` passed; `node scripts/test-ux-designer.mjs` passed (actual conversion handler, stable edge IDs, count/title limits, cancellation and metadata warnings). TS/TSX syntax passed; focused strict TypeScript checking of changed files with temporary React/ReactFlow types produced zero diagnostics after fixing pre-existing undefined `inp`. This is not a full application build. No long tests, merge, real sends or Railway operations.

## Implementation checkpoints
- UX-10 complete: reply format conversion retains option objects/IDs/titles and therefore canonical `option:<id>` edges. More than three options blocks button conversion without mutation; removing all choices asks explicitly. F07 creates actions but did not cover this conversion; F02/F10 layout remains reused. Reviewed `updateData` handle filtering to confirm retained IDs preserve connections. Short check: `git diff --check`.
- Audit received at 7aef49a; previous missing-source blocker resolved. Scope remains UX-01–UX-23 only.

- UX-02 complete: default build mode hides step/button statistics and inline click counts; explicit analytics toggle restores all metrics. No counterpart in F01–F19. Diff whitespace check passed; no runtime/browser check yet.

- UX-04/UX-19 complete: desktop inspector now obeys its open/close state, closes for preview, and consumes no space without a selected step (settings excepted). Desktop close control exposed. These gaps were not part of F03 save/navigation protection.
- UX-06 complete: minimap opt-in, compact, and hidden during preview; not covered by F02 layout.
- UX-09 complete: settings entry and tab consistently named “Bot triggers and channels”.
- UX-13 complete: moved existing F02/F10 arrange-and-fit action out of More into toolbar; reused collision-aware implementation. UX-01 already implemented by F02/F10; retained existing tests, browser verification pending.
- UX-23 complete: validation summary reports both error and warning totals, explains passed-with-warnings. Reuses F06 translated issue details for UX-22 (no duplicate translation layer). Diff whitespace check passed.

- UX-20 complete via the audit's explicit-label option: preview clearly states it tests logic with approximate channel appearance; existing F08/F09 list/media renderers reused.
- UX-21 complete: customer-facing execution status localized; raw status/error details remain in advanced variable view, real-HTTP switch moved into closed Advanced tools. No requests/sends performed. Diff check passed.

- UX-16 complete: expanded condition editor now edits/adds variable, last-message and channel rules instead of silently retaining invisible rules; operator choices match inspector including numeric/regex operations. Variable keys now required before saving. Existing contact-field/attribute/label editors retained. No F01–F19 equivalent. Diff check passed; browser interaction unverified.

- UX-11 complete: each selected step exposes named output → destination selects, including disconnect; uses existing connection validation/replacement/undo path. Handle pointer area enlarged without changing dot size. F10 only adjusted edge hit areas.
- UX-14 complete: live zoom percentage, pan/zoom help and show-all control next to canvas controls. Reuses F02 fit behavior.
- UX-12 already covered by F10: edge insertion/deletion controls render only for selected edges; retained without duplication.
- UX-19 follow-up: choosing settings/a step exits preview so contextual details can reopen.

- UX-03 complete: build mode renders each choice as a named port inside its message, using the existing unsplit node renderer. Independent button cards remain in analytics mode. Canonical saved graph/option IDs unchanged, F02/F10 conservative layout bounds retained to avoid introducing collisions.

- UX-05 complete: trigger summary moved from floating canvas card into the bot navigation strip; opens the same settings destination and no longer covers nodes.
- UX-07 complete: primary add menu and output-drop menu share grouped searchable step rendering using existing NODE_GROUPS; all node types and drag insertion retained. Prior F07 concerned wizard action creation, not this library. Diff check passed.

- UX-08 complete: message text then reply choices lead the editor; attachments/storage, variable chips, internal comment and destructive step tools moved below content into closed disclosures. Explicit Done/close releases canvas. No F01–F19 equivalent; all fields retained. Diff check passed.

- UX-15 complete: explicit fullscreen focus mode removes workspace navigation and bot tabs while retaining editing/actions; exit button/Escape restores normal layout. Browser denial reports a readable message. F18 navigation remains unchanged.

- UX-17/UX-18 complete: both condition editors share source/choice pickers derived from connected upstream steps. Reply title and stable reply-ID sources are distinguished, with stable IDs recommended and displayed as human choice titles. Saved title comparisons absent from current options show a review warning; existing comparisons are never rewritten automatically. Arbitrary variable keys remain editable. Reuses runtime's existing `<saveReplyAs>_id` behavior (no engine change). No F01–F19 equivalent.

- Review follow-ups: non-drag connections use the node's actual default target handle; all detail-opening paths exit preview. Added missing pre-existing `inp` constant discovered by focused TypeScript checking (settings otherwise referenced an undefined symbol). Localized staff-handoff preview status.
- UX-10 channel limits: conversion blocks titles over the server's 20-character button limit and requires explicit confirmation before dropping list-only descriptions/section headings/opening text. No silent truncation.

- UX-22 follow-up: validation targets now include content/comment excerpts as well as human type and ordinal; clicking still focuses the step and opens its editor. F06's translated diagnosis and unreachable-step repair guidance reused.

## UX-24–UX-54 execution (HEAD verified: 8359321)

- UX-24: goal-specific template guidance explains booking limits and how to complete request/confirmation paths without claiming automatic reservations.
- UX-25: reused F07 independent message/card/question/route/handoff actions; added a visible choice → result → template summary alongside each action.
- UX-26: static companion removed in test step; existing local TestPanel is the sole preview there.
- UX-27: reviewed/reused F18 expanded labels, optional collapse and saved preference without rewriting. UX-28: sequences, channels and settings now direct daily navigation destinations; existing groups retained for other tools.
- UX-29 (partial): direct Dashboard/Getting started titles, translated shell roles and subscription states. Other pages reviewed in subsequent groups.
- UX-30: Dashboard shows essential setup count and a single prioritized next step; metrics link to corresponding Inbox tabs or CRM. Inbox accepts those tabs through its existing query mapping.
- UX-53: wizard says “step N of 7”; onboarding says completed N of 3 essential steps, avoiding ambiguous RTL fractions.
- UX-54: team excluded from essential progress and explicitly optional; bot step explicitly records draft creation only and explains that testing/publication need separate confirmation in the builder. No inferred tested/published status.
- Check: whitespace passed. Runtime/build pending; environment Git HTTP proxy unavailable, so checkpoint commits are written through GitHub Git API with expected-HEAD checks on the existing branch. No deployment, paid service or external sends.

- UX-31: reused F11 collapsed advanced tools, search/count and existing Add contact action; table remains visible with tools closed.
- UX-32: single import picker in CrmJobs routes up to 500 rows directly and larger files through the existing resumable upload path (10,000 maximum); historical export details folded. Preserved APIs and tenant-scoped requests.
- UX-33: bulk editor mounts only with selected contacts; selection count and clear action retained.
- UX-34: reviewed/reused F15 eventLabel with collapsible technical event IDs; no second translation layer.
- UX-35: reused F11 supported type choices; custom form now generates an ASCII integration key from the label, with advanced override and content/type preview.
- UX-36: editable search/lifecycle/tag/archive conditions and matching count appear alongside segment name; loading a segment restores archive condition too.
- UX-29: CRM now uses direct section title; lifecycle options reuse shared status labels. Whitespace check passed; full build unavailable.
