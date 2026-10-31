# Verified preview baseline — 2026-10-31

Project: boat-two-ui-preview (`a2751c62-5a61-4eb7-b3ca-0b98863e3069`)
Environment: preview (`e3e456fd-2c13-457d-91db-6aa80755f502`)

| Service | Successful deployment | Commit |
| --- | --- | --- |
| boat-preview-api | e736b012-2f0e-4248-a352-2f7c50d0d433 | a640ae2323eed17a82b9505ab8eca5edf9a26f60 |
| boat-preview-web | 7d5591fa-8f12-436f-bf96-d6b392f9fcb7 | 45514754b59ca068703094d13ffd06a38011f730 |

Both deployments were online and available for rollback when inspected. They are different commits. This implementation starts at API/source branch HEAD a640ae2, which contains the web baseline. No deployment or source/configuration change has been made by this task.

If a later authorized release regresses, use Railway rollback on the exact corresponding service deployment above, rather than assuming both services used the same SHA. Do not reauthorize Meta, change WABA/webhooks/tokens, or recreate channels. No SQL migration file is modified by this PR.
