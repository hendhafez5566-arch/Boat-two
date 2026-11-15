# UX audit checkpoint — 2026-11-15

## Baseline and publishing boundary

- Requested branch: feat/flow-builder-fidelity-20261107, PR #14. No main merge.
- Initial target 888c49a was an ancestor of live Web d885981 (feat/ui-conversations-customers-redesign). Fast-forwarded requested branch to d885981 to preserve newer published conversation/customer layouts.
- Existing Railway project/environment/services only. Sleep settings unchanged. No customer or channel data modifications during initial inspection.

## Browser-first observations

- Signed into Boat Two through secure browser authentication. BotSailor signed-in reference inspected.
- Dashboard: primary navigation, control menu, growth/filter/quick-action layout viewed. Full interaction/responsive acceptance still pending.
- CRM overview: date/team controls, actionable summaries, contacts and follow-up entry routes inspected. Full filters/error/large-data acceptance pending.
- Customers: list/filter/action layout and create modal inspected. Found duplicate headings/card nesting, comma-only labels, ungrouped details/organization, raw JSON without task context, no dirty-close protection.
- Follow-ups: empty list and create dialog inspected; contact search/select, priority, due date, owner observed. No live save executed.
- Pipeline: loaded board with existing synthetic opportunity inspected; no mutations. Create/edit/table/drag journey pending.
- BotSailor subscribers: signed-in filter/toolbar/profile-tab organization used as reference; no code or assets copied.

## Batch 1 implementation

- Grouped contact editor: contact details, customer organization, typed custom fields, optional advanced attributes.
- Label chips with add/remove, Arabic comma support, pending label included on save, API limits validated.
- Inline validation and failed-save feedback retain input. Sticky save/cancel footer.
- Dirty close asks keep/discard; changes cannot be silently lost by dialog close/Escape.
- Updates use existing revision-checked profile endpoint, rejecting concurrent changes. No API/database changes required.
- Isolated browser acceptance covers Arabic/English at 320/390/768/1366/1920: data-heavy list, create/edit/reload, attributes including false/zero, invalid JSON, 503 retry, dirty close and conflict protection.

## Acceptance status

- Local helper tests: 2 passing. Build/type check and isolated CI pending at checkpoint creation.
- No claim that the platform or CRM is fully accepted. This is the first coherent batch of an ongoing audit.

## Remaining inventory / next journeys

1. Finish CRM contacts/profile/import, follow-ups save/reopen, pipeline create/edit/move, reports, segments, notifications, smart sales, advanced settings.
2. Inbox: all panels, conversation actions, filters, assignments, internal notes; synthetic conversations only, no outbound delivery.
3. Flow Builder: long sessions/save/recovery/connections; commerce/category/import-to-catalog full journey on latest code.
4. Channels/connect, automations/campaigns/templates, team/permissions/settings/reports/social/billing: inspect actual routes and states without changing real authorizations or financial settings.
5. For every section record empty/loading/error/populated/large-data, language and viewport coverage; opening a page is not completion.

## Safety and evidence

Never commit live customer screenshots, credentials, .env, database copies or session artifacts. Browser CI screenshots contain synthetic data only. Publish accepted batches to existing preview, verify terminal deployment success and live UI before marking accepted.

## Batch 2 and 3 discovered while CI ran

- Inbox: inspected filters, isolated existing QA webchat, opened actions/customer panel, internal note and follow-up entry points. No live messages sent.
- Unified Inbox labels with the structured label editor. Initialize from the latest contact profile, retain the revision at the start of a local draft, show inline result/conflict feedback, and provide explicit reload after conflict. Isolated CI seeds existing labels and tests pending-input saves and external concurrent changes.
- Reproduced a wrong-customer bug live without saving: choose QA English in the follow-up dialog, search QA CSV; after search results arrive the native select silently changes to QA CSV while the optional opportunity lookup still refers to the earlier customer.
- Shared follow-up/opportunity editor now retains the selected customer across result changes. Added search/loading/empty guidance, meaningful save labels, sticky cancel/save, disabled fields during save, dirty-close protection and narrow-screen grid bounds.
- Added isolated task/opportunity create, retry, reload and edit journeys at all five widths in both languages, verifying persisted contact_id and exact cents.
- First contact CI found advanced textarea accessible-name mismatch; fixed with explicit localized accessible label. This is recorded as a real failed check, not accepted until rerun passes.

## Accepted batch evidence / deployment in progress

- Contact editor + Inbox label acceptance: all ten language/viewport combinations PASS on c662736 and again on 9dfe176. Five helper checks PASS.
- Product/import acceptance, editor recovery/connections, channel acceptance and 500 responsive/runtime inventory cases passed on 9dfe176.
- Task/opportunity acceptance: all ten combinations PASS on 2a012d1. The first run waited for native option visibility (options are hidden until opened); corrected the test to await the actual search response/render and retained the persisted customer_id assertion.
- Web deployment 7b8fd513-f746-45aa-8367-06760ecec97e started for 2a012d1. Do not mark deployed until terminal SUCCESS and live reinspection.
- API source 28cd99f has identical apps/api tree to the accepted code. No API redeploy or migration required. Four existing services and one preview environment confirmed; Web/API Sleep remains true.

## Batch 4 — saved segments

Observed live: selecting a saved OR view displayed results underneath the unchanged empty AND rule builder, with no result source title. New layout separates custom conditions, saved view cards with readable summaries, and explicitly named results. Draft changes invalidate old results. Added empty/loading/error/retry/save/reopen/preview acceptance at all ten combinations. Still pending CI and live verification.

## Live acceptance after first deployment

- 2a012d1 reached Railway SUCCESS. Web /login 200; API /health 200 with db up.
- Created one explicitly synthetic contact, QA UX 20261115, with example.test email and QA label. Reloaded and reopened, verified pending label persisted, edited only its synthetic custom-field value and saved successfully. No real contact was changed.
- Found ?create=true reopened an empty add dialog after reload. CRM contacts and shared work editor now consume this navigation command once while preserving other query parameters; browser suites start via these links and verify reload does not reopen creation.
- Team page inspected: members/roles, empty pending invites/mail states, branding preview. No invitation sent and no permissions changed. Fixed raw role display and clarified the optional email request label.
- Saved segment suite was blocked by the isolated runner leaving a Next child alive between two journeys. Runner now creates and cleans up its own process groups; no unrelated processes are killed. Rerun both journeys before accepting batch 4.
