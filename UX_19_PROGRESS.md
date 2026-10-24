# UX 19 progress

Verified preview source: b4f2da4894dae24bd55e6d7351fddc2b25fe7a14; materialized V10/V11/Phase 5, legacy build commands do not mutate source.

Completed: F01, F02, F03, F04, F05, F06, F07, F08, F09, F10, F11, F12, F13, F14, F15, F17, F19.
Remaining: F16, F18.
Last pushed commit before this checkpoint: 52911a615f4c90d5f3ef17246fb2bfa5f4acf2ec.
The commit containing this file is the current checkpoint; see PR history for its SHA.

F01: browser draft persistence/isolation/expiry/storage failure tests passed.
F03/F19: shared leave guard captures internal links and browser back with save/discard/cancel; failed saves keep editor open. Dedicated loading/dirty/saving/saved/error status; newer edits cannot be marked saved by an older response. Reviewed save and navigation paths; diff whitespace check passed.
F02/F10: layout reserves measured node/button envelopes, resolves loaded overlaps and avoids stacking new nodes; button spacing uses measured height; connection hit areas narrowed and edge controls selected-only. Node finder selects/focuses existing nodes. Focused 40-node RTL/LTR tests passed for tall cards, buttons, cycles, disconnected and empty graphs.
F04/F05/F06: sequence errors retain exact field/step paths; eligible channel selection and actionable Arabic messages replace generic VALIDATION; server validation remains enforced, blank messages rejected and immutable sequence channel checked. Flow validation messages localized with human step labels; edits invalidate results and stale requests are ignored in designer/wizard. All 44 static engine messages plus dynamic technical-ID cases passed localization checks.
F07: independent message, link/image card, template route, question/answer field, and staff handoff actions emit existing canonical graph nodes. Template draft created once to expose real route destinations; restored IDs reused. Five action variants tested for valid edges, idempotence, non-mutation and missing-route rejection; F01 persistence checks rerun successfully.
F08/F09: shared image/video/audio/file preview with invalid/unavailable media feedback; grouped expandable lists preserve sections, row descriptions and reply IDs, enforce the existing 10-option preview limit and enable replies only on the active transcript item. Used by graph cards and actual test transcript; no real sends performed.
F11/F12: contact search/count/list and primary add action lead the CRM; advanced filters/import/export/jobs/lifecycle and bulk actions grouped without removal; create/edit form in accessible dialog. Custom field type is a supported text/number/date/boolean select with Arabic labels and help; server enum unchanged. Diff check passed.
F14: report headers and status/channel values use business labels; counts/dates localized. SQL confirms value_cents uses 100 minor units and AI cost_microusd uses 1,000,000 per USD. Exact BigInt formatting applies correct scales to UI/CSV without changing ledger calculations. Tests cover fractions, negatives, zero, large integers and Arabic numerals.
F17: workspace audit actions/resources and CRM event timeline use Arabic business labels; raw actions/table names/IDs remain available under explicit technical details. Unknown events have readable fallbacks instead of leaking identifiers. Existing audit collection and tenant scopes unchanged.
F13: audience preview returns matched/identity-consent-eligible/excluded totals and mutually exclusive no-channel-identity, opted-out, and missing-consent counts using tenant-scoped SQL. Shared summary explains policy gates and runtime rechecks; composer and existing draft scheduling require audience review, invalidated by campaign revision. Scheduling/dispatch checks unchanged; no campaign scheduled or sent.
F15: automation events grouped into contacts, sales, follow-ups and scheduling with business labels and selected-event descriptions. Internal event identifiers and trigger behavior preserved, including saved custom events.

Build verification: dependencies unavailable locally; network proxy unavailable. No production data or real sends used.
