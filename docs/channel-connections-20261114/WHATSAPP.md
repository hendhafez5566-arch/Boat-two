# WhatsApp observed connection journey
Observed in authenticated BotSailor account, 2026-11-14. No production account connected or permission granted.

| Step | Screen | Control | Fields | Action | Observed result |
|---|---|---|---|---|---|
| 1 | Connect Account | Connect WhatsApp | None | Click | WhatsApp Integration page |
| 2 | WhatsApp Integration | Connect with Embed Onboarding | None | Click | Replaces launch button with Connect With Catalog / Connect Without Catalog |
| 3 | Embedded choices | Connect Without Catalog | None | Click | Opens Meta popup requiring Facebook login |
| 4 | Meta login | Log in | Email/mobile, password | Secure credential request | Meta asks for human verification |
| 5 | Human verification | Start / audio alternative | Challenge | Not completed | Owner instructed to skip Facebook login; downstream asset/phone selection BLOCKED |
| M1 | WhatsApp Integration | Connect with API | None | Click | Inline form expands in API card |
| M2 | API card | Connect | WhatsApp Business Account ID; Access Token | Viewed without credentials | Shows callback URL, verification token, privacy URL, terms URL below fields |

With-Catalog downstream behavior, successful manual submission, errors after valid provider input, asset/phone selection, final success, reauthorization and disconnect remain unobserved. Do not infer them. Reference credentials, verification token and session URLs are deliberately omitted. No Meta SDK code/assets copied. Empty Connect attempt navigated/refreshed back to integration with API panel collapsed; do not claim an observed inline validation message.
