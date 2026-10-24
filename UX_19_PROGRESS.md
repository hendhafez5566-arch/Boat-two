# UX 19 progress

Verified preview source: b4f2da4894dae24bd55e6d7351fddc2b25fe7a14; materialized V10/V11/Phase 5, legacy build commands do not mutate source.

Completed: F01, F02, F03, F04, F05, F06, F10, F19.
Remaining: F07, F08, F09, F11, F12, F13, F14, F15, F16, F17, F18.
Last pushed commit before this checkpoint: 91a439bd551c9c7772238e48f02c9288c582e114.
The commit containing this file is the current checkpoint; see PR history for its SHA.

F01: browser draft persistence/isolation/expiry/storage failure tests passed.
F03/F19: shared leave guard captures internal links and browser back with save/discard/cancel; failed saves keep editor open. Dedicated loading/dirty/saving/saved/error status; newer edits cannot be marked saved by an older response. Reviewed save and navigation paths; diff whitespace check passed.
F02/F10: layout reserves measured node/button envelopes, resolves loaded overlaps and avoids stacking new nodes; button spacing uses measured height; connection hit areas narrowed and edge controls selected-only. Node finder selects/focuses existing nodes. Focused 40-node RTL/LTR tests passed for tall cards, buttons, cycles, disconnected and empty graphs.
F04/F05/F06: sequence errors retain exact field/step paths; eligible channel selection and actionable Arabic messages replace generic VALIDATION; server validation remains enforced, blank messages rejected and immutable sequence channel checked. Flow validation messages localized with human step labels; edits invalidate results and stale requests are ignored in designer/wizard. All 44 static engine messages plus dynamic technical-ID cases passed localization checks.

Build verification: dependencies unavailable locally; network proxy unavailable. No production data or real sends used.
