# Flow Builder fidelity — 2026-11-07

Branch: feat/flow-builder-fidelity-20261107. Base is the verified deployed source `559fa8c034a76a0f1a08842610f5a5d35caf268e`, preserving PR #12 product changes and PR #13. PR #12's later documentation-only checkpoint is not an ancestor; its existing branch remains untouched.

## Milestone A — in progress
- Verified Railway web deployment abc3b343-d032-4c4d-bba3-57a795fc0a55 (sleeping) and API 1b75418b-378d-4a3c-b1fa-16c40baf5795 (success), both source 559fa8c.
- Web Sleep Application remains enabled; source pinned to phase2a, not the new branch. No Railway mutations/resources created.
- Signed-in live BotSailor inspected; Create opens a new, unsaved flow editor. No existing reference bot modified or saved.
- Measured palette 56 px collapsed / 264 expanded, cards 264 px, reference card 163 px high, connector 15 px, left configuration drawer 576 px.
- Inspected Reference and Image configuration. Reference shows Back/Rearrange/channel/Save; no visible Publish or undo/redo controls yet. Further inspection required before any completeness claim.
- Last edited: FLOW_BUILDER_REFERENCE_INVENTORY.md. No product code changed or tests claimed yet.

## Next
Complete reference interactions, archive safe screenshots/measurements; compare current Boat Two. Implement scoped shell then nodes and interactions in small pushed batches. Run isolated create/save/reopen/preview/publish/runtime + tenant/roles and regression before any deployment. PLAN_LIMIT must stay enforced; live create may remain BLOCKED.
