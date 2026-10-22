# UI/UX standards

Brand: **ELHAFEZ BOAT**. Use a dark teal navigation rail, restrained teal primary actions, neutral canvas, white content surfaces, strong readable text and subtle borders. Do not use copied Manychat/BotSailor assets. Tokens live in `globals.css`; reusable classes include card, btn, field, form-grid, notice, product-table, badge and page-heading.

Each workspace screen lives under the shared dashboard layout. Use an outcome-oriented title, one primary action, real server data and explicit empty/loading/error states. Keep editor and Inbox focused while retaining global navigation. On small screens, expose navigation through a labeled menu; use logical start/end alignment and avoid fixed-width forms.

New product screens use `useLocale().t(ar,en)` and inherit document RTL/LTR. Persist language preference locally. Legacy builder/Inbox/AI internals remain partly Arabic and must be migrated before claiming complete bilingual support. Workspace language setting is company data, distinct from the operator's local UI preference.

Forms require visible labels, valid limits, disabled submission during pending actions and recoverable errors. Do not label a saved Meta token as “connected” or a locally enabled channel as provider-verified. Billing controls must explain missing operator configuration and must never simulate payment success.

Template text is editable starter content, not asserted business facts. Preview uses the actual engine. Restore affects a draft and requires publishing to change future sessions. Expose saving errors and pause autosave on failure. Never silently overwrite a newer server draft.

Destructive operations require confirmation. Batch operations report partial failure. Show database counts; never seed fake metrics into production screens. No full browser/a11y/visual acceptance was performed in this construction pass; reserve that for FINAL PRODUCT ACCEPTANCE & COMMERCIAL RELEASE READINESS.

New business screens share the same shell and bilingual controls: CRM, campaigns, automation, AI agents, delivery and departments. The bot wizard creates a draft rather than claiming publication. Editor mobile users switch between canvas/palette/Inspector; Inbox exposes customer context in a mobile drawer. CRM uses native custom-field inputs with advanced JSON behind disclosure. Import/export bounds and partial/unknown delivery states must be explicit. Unknown AI cost is displayed as uncalculated; configured-rate values are estimates, not invoices. External activation controls must remain disabled when the operator gate or application configuration is missing.
