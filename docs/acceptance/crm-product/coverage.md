# CRM product rebuild coverage

Baseline: `197eba7ab499b505e352bca314fedd21931f0da3`. The previous review was consulted for acceptance coverage, typed customer fields and refresh behavior. Review branches are independent of production.

| Area | Baseline capabilities and contract | Changes in this branch |
| --- | --- | --- |
| Customers | Search and filters, paging, custom columns, bulk operations, import/export, merge preview and merge, archive and restore | Customer directory remains the canonical list route. New customers open their record immediately. Archive is a direct list scope. |
| Customer record | Profile, company contacts, owner, lifecycle, conversations, notes, activity, tasks, deals, consent, lists, sequences, fields, score | The record is a full-screen work context on touch devices with a direct link, a return action and a follow-up entry point. Existing internal views remain connected. |
| Contact forms | Create and profile patch, timestamps, labels and typed custom fields | Basic fields first, expandable field groups, typed extra values and persistent form actions. |
| Follow-ups | Today/overdue/upcoming/completed, owner, contact/deal, rescheduling, status and filtered export | The main CRM entry opens the signed-in user's queues. Opening a queue item takes the user straight to the contact's follow-ups. Existing task and export screens remain available. |
| Opportunities | Board and table, pipelines/stages, owner, value, currency, expected close, status and loss reason | Main navigation keeps both modes discoverable. Team-report totals link to the matching employee and record scope. Detailed editor and pipeline management retain their existing implementations. |
| Reports | Date and owner scopes, analytics, CSV, metrics and drill-downs | Per-employee completed, overdue and won totals now drill into exact filter scopes. The overview route remains available. |
| Tools | Lists, saved views and segments, notifications, assignments, score, automation, pipelines, fields and filtered exports | Dedicated tools directory replaces the hidden global menu. Settings group secondary CRM functions. Assignment queue and history are directly addressable from the assignment header. |
| Permissions | Owner/admin management, agent-scoped work and existing tenant isolation | Existing backend rules and API contracts are retained. No destructive customer deletion or production mutation. |

Creating a customer opens their profile in the same save action, removing the directory lookup and subsequent profile click. The report-to-record route removes manual re-entry of the employee, status and date filters.

The existing browser suite exercises customer, task, pipeline, role and route interactions with isolated fixtures. Route rendering alone does not verify every internal action. Physical Android, post-login Preview and feature-by-feature verification of all advanced tools are separate acceptance gates. This branch should remain a review branch while those gates are incomplete.

## Internal action inventory for the continuation

This matrix supplements the baseline above. “Earlier” records a browser journey on the reviewed baseline, not a re-test of the latest code. “Pending” means no release acceptance claim. Browser results use synthetic accounts, with Chromium emulation for touch widths.

| Area and action | Analyzed | Workflow change | Interface change | Interactive verification | Permissions | Phone and desktop | Remaining gap |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Customer search, paging, filters, columns | Yes | Earlier | Earlier | Search and retained filters earlier | Agent scope earlier | Earlier | Column and every filter combination pending |
| Customer create, edit, validation | Yes | Earlier | Earlier | Earlier | Owner/agent earlier | Earlier | Custom field types individually pending |
| Archive, restore | Yes | Earlier | Earlier | Earlier | Owner/admin earlier | Earlier | Permanent deletion excluded |
| Customer channels and conversations | Yes | Existing conversation links | Extra tools grouped by purpose | Inbox navigation earlier | Workspace scope earlier | Earlier | Account linking actions pending |
| Notes and activity | Yes | Existing | Existing | Creation and activity earlier | Pending | Earlier | Edit/delete where supported pending |
| Customer ownership and lifecycle | Yes | Existing | Ownership grouped with customer fields | Lifecycle earlier | Agent write restriction earlier | Earlier | Reassignment path pending |
| Company, labels and custom fields | Yes | Existing | Grouped by purpose | Pending per subview | Pending | Pending | Only discovery was redesigned |
| Lists, sequences and marketing consent | Yes | Existing | Grouped together | Pending per subview | Pending | Pending | Membership, enrolment and consent writes need acceptance |
| Input-flow answers | Yes | Existing | Nested input values rendered as readable fields | Pending with nested records | Existing scope | Pending | Verify mixed data and long values |
| Customer score and support ID | Yes | One additional disclosure for technical reference | Separate score/reference section | Pending | Pending | Pending | Score breakdown and support access pending |
| Duplicate detection, merge, bulk edits | Broad review | Existing | Existing | Pending | Pending | Pending | Dedicated redesign and safety verification pending |
| Import and customer export | Broad review | Existing | Existing | Open/import dialog and CSV earlier | Pending | Earlier | Import conflict resolution and confirmed import pending |
| Follow-up create, schedule, priority, assignee | Yes | Shared editor with title first | Scrollable editor and fixed actions on standalone page | Matrix scenario | Owner/agent scope in matrix | Matrix scenario | Physical Android and reassignment edge cases pending |
| Follow-up completion/reopen | Yes | Status editable in editor as well as row action | Status field added | Completion in existing matrix | Agent-scoped changes | Matrix scenario | Reopen from both paths and status selector pending |
| Follow-up opportunity link/relink/unlink | Yes | Existing follow-up can now change linked deal | Same customer’s deals selectable | Matrix relink and API unlink | Existing ownership checks | Matrix scenario | Large deal list and cross-tenant UI scenarios pending |
| Deal creation and stage movement | Yes | Existing | Grouped editor, persistent actions | Matrix scenario | Existing owner and agent restrictions | Matrix scenario | Drag-and-drop and search/filter combinations pending |
| Deal close and loss reason | Yes | Loss reason displayed only for lost status | Conditional field | Earlier status change; loss reason editor pending | Existing | Pending for outcome field | Won/lost editor and reopen acceptance pending |
| Deal value, currency, owner, close date, history | Yes | Existing | Shared editor layout | Creation value covered; remaining fields pending | Existing | Pending per field | History with past transitions and edits pending |
| Pipeline creation/reordering | Yes | Add/reorder individual stages | Ordered fields and explicit movement | Matrix creates and reorders stages | Owner action; agent restriction API contract | Matrix scenario | Physical Android pending |
| Pipeline editing, replacement, ownership | Yes | Replacement selectable only for removed stages | Replacement dropdown | Pending with linked records | Existing manager API | Pending | Existing-deal migration and transfer need end-to-end coverage |
| Report indicators, filters and export | Yes | Existing calculations and filters | In-page navigation by report purpose | Render only in current matrix | Previous API analytics coverage | Layout shown | Filter/report-export consistency and chart interactions pending |
| Report drill-down to team records | Yes | Earlier structured filters | Direct performance section link | Earlier targeted case | Earlier manager scope | Earlier | Verify all date and timezone combinations |
| Lists and smart segments | Broad review | Existing | Existing editors | Create list/saved view in matrix | Pending | Matrix scenario | Membership, edits and rule checks need full interaction tests |
| Automation | Yes | Trigger/conditions separated from action | Two fieldsets, existing summary/preview/save | Render only in matrix | Existing backend scope | Layout only | Preview, enable, save and multi-condition cases pending |
| Scoring, assignment, notifications | Broad review | Existing | Existing screens | Render only | Earlier API checks | Layout only | Internal redesign and administrator journeys pending |
| Data retention, record exports, permissions | Broad review | Existing | Existing | Pending per action | Existing endpoints | Pending | Dedicated flows and safe synthetic settings tests pending |

The former stage form required composing a comma-delimited list and manually typing replacement names. The new form uses an ordered stage list and selects replacement names from the stages that will remain. Updating the linked opportunity of a follow-up takes one edit-and-save operation, and retains the follow-up ID and history. These are measured interface differences. Independent first-use usability testing remains pending.

### Continuation verification

- Latest production build and API compilation passed. The production build was exercised on local Chromium with authenticated owner and agent sessions backed by synthetic data. All 16 combinations passed: Arabic and English at 320, 360, 390, 430, 768, and 1366 px, with 844×390 landscape and a 980 px touch-based Desktop Site approximation.
- Each matrix run created a follow-up, reopened its editor, linked it to the customer's opportunity, changed priority, and checked both persisted values. Each run created a pipeline by adding and reordering stages and checked the saved order. Archive/restore and the existing customer, task, pipeline, import dialog, list and saved view journeys also ran.
- CRM API suites passed 60 and 69 checks. Follow-up linking tests include unlink, rejection of a deal belonging to another customer, and rejection of an agent editing a task outside their assignment. The continuation browser matrix uses owner and agent roles. Administrator browser results in the preceding report are from the reviewed baseline.
- Visual checks inspected the follow-up and opportunity dialogs and pipeline settings on phone and desktop. Native Android keyboard behavior, production Preview login and advanced action-by-action acceptance remain unverified. No Railway deployment was made for this continuation.

## Acceptance delta after `5c7894c`

This table updates the continuation matrix above. API verification and browser verification are recorded separately. “Open” means this action has not met the release criterion.

| Internal action | Implementation and evidence | Remaining acceptance |
| --- | --- | --- |
| Duplicate review | Moved from the filter panel to **Manage → Duplicates and merge**. Detected groups use the exact member records, including when phone formatting differs. Mobile comparison uses two record cards. | Browser fixture for a populated detected-match group and conflicting channel identities is open. |
| Merge | Isolated API suite verified preview, denial for an agent, permitted merge, preservation of notes, and reassociation of opportunities. No live workspace data was used. | Conflict resolution and historical consent verification on the new screen are open. |
| Import | Invalid rows are identified by original file line number, with reasons and disabled submission. A valid upload completed through the isolated background worker. | XLSX worksheet selection, mixed duplicate conflict handling, and retry from the redesigned screen are open. |
| Contact fields | Text, number, date and boolean are exercised by the updated browser scenario; zero and false are checked as persisted values. | Editing and clearing each type in every entry point are open. |
| Contact export and bulk | CSV entry point remains available, with isolated browser download checked. | Bulk change/undo, all export fields, retention and bounded jobs from the UI are open. |
| Contacts, lists, sequences, consent and owner | Entry points from the prior continuation are retained. | Individual membership, enrollment, consent and ownership journeys remain open. |
| Linked stage migration | API rejects removal of a used stage without a replacement and leaves its deals intact. With a replacement, all rows were matched by ID and checked: only the intended stage and update time changed, with the new pipeline stages reflected. | Replacement and rejection journeys through the pipeline editor are open. |
| Deal outcome and details | Isolated API covered loss reason, reopen and win, amount, currency, owner, expected date. Prior stage-history regression remains in the same suite. | Independent operator and every editor variant are open. |
| Reports | Currency-specific report rows carry the currency filter to the deals list, where the filter can be cleared. API checks compare both counts and monetary totals per currency/status against filtered records across the report's date window. | Full date/filter combinations, custom periods in the UI, administrator browser permissions and CSV contents remain open. |
| Automation | CRM creation supports tag and lifecycle together, sends a synthetic fixture for preview, and can persist the previewed rule disabled. API suite covers condition trees, edits and disabling under isolation. | Enabling/editing in the CRM UI, changing all action types, and negative preview scenarios in the browser remain open. |
| Scoring | Weight inputs and the interest label are separate form groups. | Administrator save/reload journey and interpretation by a new manager are open. |
| Assignment | Eligible staff are grouped separately with their count. The browser checks the saved-policy dry-run output. The API suite checks isolation and routing. | Browser testing of saving and activating policy, exercising multiple staff, and conflict handling is open. |
| Notifications | Read actions have an in-flight lock, an explicit mark-all control, and disabled empty state. API notification checks cover per-user privacy. | Browser read/handled journeys with populated data under each role are open. |

Authenticated browser scenarios use isolated synthetic sessions. A new independent employee and manager were not available for first-use testing. A physical Android device and the Android input method were not available. The branch remains unreleased on Railway while acceptance items are open.

### Verification for this acceptance delta

- API compilation and the final Next.js build passed. The isolated API suites passed 90 and 69 checks.
- The browser regression passed all 16 Arabic/English viewport combinations (320, 360, 390, 430, 768, 1366, 844 landscape and 980 touch emulation) on the functional snapshot. The final control-size change was also exercised at 390 and 1366 in both languages.
- The added journeys check actual import processing after blocking an invalid row, persistence of all four custom field types, the duplicate-review empty state and pair preview, report CSV download and filtered drill-down, and two-condition synthetic automation preview through disabled save. The assignment dry run does not assign customers. These checks do not establish that an untrained user can find the controls independently.
