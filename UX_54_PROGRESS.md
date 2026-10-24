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

- UX-37: Inbox distinguishes filtered-empty from initial-empty, clears search/channel/tab together, offers closed conversations when present and links first-channel/widget setup.
- UX-38: consistent button sizes/primary active state, aria-pressed and available zero counts.
- UX-39: reviewed/reused F14 audience reason counts and scheduling rechecks; added links to customer identity/consent and channels without changing eligibility or granting consent. Empty-audience drafting remains gated by current composer (not bypassed).
- UX-40: delivery policies moved into closed advanced disclosure with plain-language impact.
- UX-41: each rule opens its exact saved editor through an adjacent named edit action; activation confirmation explicitly asks to review trigger/conditions/actions. Existing revision-aware save retained.
- UX-42: reused F16 supported-channel filtering and validation; explains website exclusion at empty select and disables Save until a supported channel is selected.
- UX-43: timing mode separates free delay from clock-after-delay, with per-step summary tied to enrollment/previous step and timezone; schedule.ts reviewed to match delay-first then next local clock semantics. Global delivery time remains day-step-only.
- UX-44: unsent steps show content without zero metrics; existing real statistics remain in a disclosure when activity exists.
- UX-29: direct Campaigns and Automations titles; shared status/event labels reused. Check: whitespace passed. No external delivery/activation performed.

- UX-45: unavailable official Meta connection now names the pending setup, responsible platform administrator and website-channel alternative; operator requirements remain in closed details. No connection or service activated.
- UX-46: widget snippet copy action with success/failure, real demo link and short shareable installation instruction. Demo now loads the configured API script through a same-origin config route, replacing the broken localhost literal without accepting arbitrary script URLs from query parameters.
- UX-47: verified server defaults were English with RTL; new defaults now Arabic. Existing channels are preserved, with explicit suggested Arabic text applied only on click and saved only by Save. Live content/direction preview added to channel settings.
- Check: whitespace passed. Widget not opened and no external messages sent.

- UX-48: reviewed/reused F13 reportColumn/reportValue and exact BigInt minor-unit formatting; corrected stale explanatory text that still claimed displayed sales were cents. Existing export/display functions retained.
- UX-49: company-timezone Today/7-day/30-day presets and inclusive end-day UI; time-range helper finds local calendar-day boundaries then sends exclusive UTC bounds. Cairo DST, New York 23/25-hour days, fractional offsets, skipped/invalid dates and final-day inclusion checks passed with Node's TypeScript stripping.
- UX-50: summary counts sections with data and links to them; empty sections hidden by default with explicit show control.
- UX-51: shared searchable city/region selector, localized common-city labels, full supported-zone list, current local-time preview and secondary IANA identifier in Settings and Sequences.
- UX-52: removed non-operative preferred-plan selector; current plan and billing/upgrade link shown. Workspace save includes identity/language/timezone only and does not modify billing.
- Check: whitespace and focused timezone checks passed. Full web build not yet available (dependencies absent; initial workspace command unsupported by the old local bootstrap). No deployment.

### Review checkpoint
- UX-39 follow-up: server create endpoint inspected; it creates a draft without scheduling and does not require eligible contacts. Composer now permits composing/saving after audience review even at zero eligible. Existing scheduling/dispatch eligibility checks unchanged. Actual save handler passes offline tests for eligible=0 and eligible=1 with no schedule/send calls. This supersedes the earlier temporary drafting limitation.
- UX-29 complete across reviewed scope: direct section titles and shared status translations for shell roles, subscription, CRM and sequence states. Added role labels to existing shared translator rather than duplicating it.
- Review fixes: Settings save guards unloaded data; custom-field override matches server lowercase/41-character schema; campaign progress uses explicit “step N of 3”.
- PASS: existing test-ux19.mjs (draft isolation/expiry, five wizard actions, real engine validation, round trip, 40-node RTL/LTR layout, translations and exact monetary units) and test-ux-designer.mjs (conversion preservation/limits/cancellation), run against current HEAD source copies.
- PASS: new scripts/test-ux-workspace.mjs (local calendar boundaries, DST, invalid dates, empty-audience draft save without sends and widget demo JS syntax). Whitespace check passed.
- Full Next/TypeScript build unavailable: npm run build --prefix apps/web stops at next: not found; project dependencies are absent and environment Git/network proxy is unreachable. No browser or deployed-preview verification claimed.

Implementation coverage: UX-24–UX-54 implemented or explicitly reused as described above. Remaining verification: full dependency-backed build/typecheck and browser acceptance (RTL/mobile, filters/forms, widget with allowed origins, report presets, draft/test/published onboarding comprehension). PR #2 stays draft; no main merge, Railway deployment, real messages, Meta connection or paid AI activation.
