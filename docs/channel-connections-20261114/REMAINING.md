# Additional observed connection entry points — 2026-11-14

| Step | Reference screen | Button / fields | Observed result | Boat Two implementation |
| --- | --- | --- | --- | --- |
| Google 1 | Google Integration | Sign in with Google | Google email/phone sign-in popup | Dedicated page, one sign-in action to existing backend OAuth start. Calendar events + read-only contacts, no extra purpose wizard. |
| Google 2 | Google account sign-in | Email or phone / Next | Stopped without credentials | BLOCKED after sign-in; callback remains existing integration callback, not claimed reference parity. |
| Webchat 1 | Widgets list | Create Live Chat Widget | Setup modal | Dedicated widget list and setup dialog. |
| Webchat 2 | Set Up Your Live Chat Widget | Display title, website, theme background/text, bubble background/text, logo, wallpaper, font, position, startup, offsets, delay | Form observed; closed without save | Supported fields persist via actual channel API and affect actual widget runtime. Website becomes allowed origin. |
| Webchat 3 | Setup extra options | Upload Media, Home, Help Articles | Controls observed only | Visitor upload/help tabs NOT implemented; no fake working toggles. Logo URL only, no upload; wallpaper color only; system/Arial/Tahoma instead of unlicensed reference font asset. |
| Webchat 4 | Save and live chat | Connect | Not invoked in reference (production account) | Isolated save/runtime tests only; reference success wording/last-active semantics remain unverified. |

WhatsApp, Facebook, Instagram: see WHATSAPP.md; all post-Meta screens remain BLOCKED at skipped provider login. No grants or production accounts modified.

Visual evidence: workflow 43586431415 passed 70 AR/EN screenshots; reviewed corrected WhatsApp desktop/manual mobile. New Google/Webchat/main-page captures will be generated in next source CI run. CI fixtures are not live provider acceptance.
