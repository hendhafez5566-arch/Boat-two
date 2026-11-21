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
