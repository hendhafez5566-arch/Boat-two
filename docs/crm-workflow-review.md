# CRM workflow review

## Feature inventory before changes

Base commit: `939d1ec` on `feat/crm-employee-review-20261120`. The inventory covers CRM routes and the operations they expose.

| Area | Existing operations |
|---|---|
| Customers | Search by name, phone or email, paging, sorting, card and table views, selectable columns, status and lifecycle, channel and account, labels, list and sequence membership, marketing consent, owner and report presets, and statistics. Create, edit, select rows, and bulk update. |
| Customer administration | CSV export, CSV import and jobs, staged uploads, cancellation and file management, duplicate emails, merge preview and verified merge, archival and retention tools, custom field definitions, and saving filters as a segment. |
| Customer profile | Contact information, lifecycle, owner, source, channel history, latest conversation and Inbox, company and related contacts, labels, lists, sequences, input sessions, custom fields, notes, marketing consent, archive and restore, scoring, activity and activity export. |
| Follow-ups | Search and date/status/assignee filters, my tasks, priority, due date, create/edit, assign, link to customer or deal, complete/reopen, and filtered export. |
| Deals and pipelines | Board and table, stage selection and drag-and-drop, pipeline filters and configuration, title, owner, value and currency, expected close, open/won/lost, loss reason, and filtered export. |
| Lists and segments | Named customer lists and member add/remove, saved dynamic segments, filter conditions, matching customers, preview and opening filtered views. |
| Reports and overview | Date, owner and scope filters, sales and customer totals, drilldowns and exports. |
| Sales and automation | Notifications with read/dismiss controls, scoring and scoring signals, routing and assignment settings and history, team/department links, and CRM automation. |

The workflow changes reuse existing API routes, record concurrency checks, and role gates.

## Interaction comparison

Counts start at the indicated screen. A field selection counts as one action. Typing the note counts as one action. These counts compare the shortest normal paths, independent of network and typing time.

| Task and starting screen | Before | After |
|---|---:|---:|
| Change customer lifecycle from an open customer profile (owner/admin) | 4 — close profile, open row editor, change lifecycle, save | 1 — change lifecycle in profile |
| Change opportunity status from its card (authorized owner/assignee) | 3 — open editor, change status, save | 1 — change status on card |
| Show own assignments from Customers | 2 — open Tasks, select My tasks | 1 — use My tasks shortcut |
| Read latest activity from profile overview | 1 — open Activity | 0 — visible in overview |
| See the title of the next follow-up from profile overview | 1 — open Follow-ups | 0 — visible in overview |
| Add a note from profile overview | 4 — open Notes, focus field, type, submit | 3 — open focused composer, type, submit |

Search and profile opening, opening an existing conversation, and opening follow-up and opportunity creation remain direct actions. The editable customer lifecycle still requires owner/admin access. Deal status still uses the assignee/manager permission rules, and loss reason remains editable in the full opportunity form.
