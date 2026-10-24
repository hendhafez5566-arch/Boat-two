# UX 54 progress

## Designer scope: UX-01–UX-23

Status: blocked on missing source audit; no UX item claimed complete.

Required source: `ELHAFEZ_BOAT_DEEP_UX_FRICTION_AUDIT.md`.
Checked the working tree, all fetched branches/history, workspace attachments, and PR #2 issue comments. The audit is absent; PR issue comments are empty. Supply the report or its exact repository path/commit before assigning meanings to UX-01–UX-23.

Baseline reviewed: `UX_19_PROGRESS.md` at `ee5164a` records F01–F19 complete, including draft recovery, leave/save guards, map layout/finder, validation, wizard actions, media/list previews and navigation. New work must compare each audit item against these implementations; do not repeat them.

Remaining: read the missing audit, map UX-01–UX-23 to F01–F19, implement actual designer usability gaps, run short focused checks, and commit/push each small completed group immediately.

Constraints: no merge to main, no Railway deployment, no prolonged tests. No application code changed in this checkpoint.

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
