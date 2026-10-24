# Fixed V1 closure acceptance — 2026-10-23 UTC

Local synthetic fixtures only; real PostgreSQL 16/pgvector, compiled Nest API :4122, production Next :3000 and headless Chromium. No live external integration, financial write, production security certification, merge or deployment.

- Fresh migrations 001–072 plus no-op repeat passed.
- API/web TypeScript, ESLint and production Next build passed. Build from repository root now resolves the explicit Tailwind configuration without the earlier missing-content warning.
- 64 unit tests passed, no skips/failures. Root loader needs TSX_TSCONFIG_PATH=apps/api/tsconfig.json.
- All 45 PostgreSQL/API/worker scripts passed; individual names/times in regression-results.json.
- New template-drafts browser journey passed creation with DOCUMENT sample handle and dynamic URL example, structural preview, PATCH edit, API-persisted/reopened values, disabled external submit with unchanged DRAFT, English desktop/Arabic mobile/RTL, no overflow and zero page errors.
- New automation browser journey passed creation, reopen, editing, undo/redo, nested branch saved to API, version load/re-save as disabled, Arabic/mobile/RTL and zero page errors.
- Broader browser regression continues; do not interpret this checkpoint as complete browser acceptance.

Template sample upload handles are obtained from an operator-authorized Meta account; local fake handles only test the exact submission contract. No media was uploaded to Meta. OTP/carousel/location remain explicitly unsupported. Interrupted SUBMITTING/unknown submissions are synchronized, never blindly retried.

Initial harness corrections: native select located by combobox name; helper text separated from input name (actual accessibility fix); saved template cards now display header/footer/buttons (actual missing preview fix); automation saved-rule selector explicitly refreshed after creation; Inbox assertion scoped to message section because the sidebar also shows the same last-message text. No functional assertions removed.

## Later verified checkpoints

- 073/074: ordinal CRM export storage and fair tenant event discovery, with preserved aggregate ordering; 5000-row concurrent/replay storage test and isolated 1000-event fairness test pass. Heavy storage/read fixtures now clean only their own unused contact-trigger events. Earlier backlog failures led to the fairness fix, not relaxed assertions.
- 075: retained activity export including original merged consent and explicitly current work records; expanded CRM Chromium downloads and inspects actual JSON.
- Latest backend regression: 49 scripts passed; isolated fairness test passed separately. 64 unit tests passed. Fresh chain/repeat through 075 passed. Browser-results.json records 12 successful functional suites; template draft and new settings suites have separate result logs.
- Settings acceptance covers actual channel, assignment and saved-reply writes, failure retry, cancellation/Escape, bilingual direction and mobile, with four additional real screenshots.
- Remaining global UI and functional scope stays OPEN in the frozen matrix. Route survey evidence, when available, must not be represented as clicking every action or comprehensive accessibility certification.
