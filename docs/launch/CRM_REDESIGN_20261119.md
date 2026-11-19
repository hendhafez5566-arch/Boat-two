# CRM visual redesign — 2026-11-19

## Implemented
- Five primary navigation destinations, with secondary settings grouped under More.
- Customer cards as default, with readable names, tinted avatars, status badges and explicit Open/Edit actions. Table view and pagination retained.
- Search stays visible; advanced filters open on demand without dropping filter functionality.
- Opportunity and follow-up cards use icons, hierarchy and status colors.
- Contact and work editors group fields in distinct sections, with responsive columns and clear assignment controls.
- Customer profile styling is consistent with the workspace. Static instructional introductions removed; validation and operational feedback retained.

## Verified
Source b174e69c5f30d8df3e6942f0f417034288b5c164 passed CRM browser acceptance [44575593039](https://github.com/hendhafez5566-arch/Boat-two/actions/runs/44575593039).
Four isolated Arabic/English journeys at 390/1366 pixels verified filters, pagination, profile opening, actual customer/follow-up creation, opportunity money persistence and viewport overflow. Screenshots reviewed for desktop/mobile cards and structured editors.
Contact editor regression [44575593087](https://github.com/hendhafez5566-arch/Boat-two/actions/runs/44575593087) passed.
Browser tests use synthetic accounts and PGlite; this is not production acceptance or a new PostgreSQL claim.
Final cleanup removes the pipeline instructional paragraph without changing behavior.

## Release boundary
Saved on PR #14 branch. No main merge. No Railway replacement performed. The existing API has unverified ephemeral customer-file storage; inventory, encrypted backup and restore proof remain required before replacing it. The new CRM has not been claimed live.
