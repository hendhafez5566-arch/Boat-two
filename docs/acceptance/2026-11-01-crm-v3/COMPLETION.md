# CRM V3 completion checkpoint — 2026-11-02

Continues the same PR #8 and approved V2/V3 source; no main merge or new Railway resources.

Implemented after initial preview release:

- One shared current scoring function for Customer360, automation root/branch conditions and synthetic previews.
- Hot/Warm/Cold and minimum-score conditions inside bounded nested AND/OR. Generic contact searches reject automation-only score keys rather than silently broadening a search.
- Beginner and advanced UI controls for typed customer/bot attributes, numeric deal thresholds and score conditions; preserve zero and false.
- Deal-event conditions target the event's own opportunity, preventing another opportunity on the same contact from satisfying its stage/value condition.
- Pipeline attention filter and badges use the company's configured inactivity/closing windows, with agent scope preserved.

Acceptance at this checkpoint: 90 API groups across three isolated businesses and all210 regression tests pass. Web/API builds pass. ESLint remains173 baseline errors+1warning, zero new at the checked snapshot. Additional real-browser acceptance is running; selectors exposed an accessibility label issue, corrected before rerun. No deployment of these completion changes yet.

Existing initial preview release remains pinned toc6fd09f266f258928cf44b35eaf58fc8a45c371d on both existing services. Authenticated cloud acceptance still needs owner sign-in; no live WhatsApp messages or Meta/active-bot changes.
