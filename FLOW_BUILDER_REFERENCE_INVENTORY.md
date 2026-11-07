# Flow Builder live reference inventory

Observed 2026-11-07, BotSailor signed-in owner account. New UNSAVED flow only. Viewport 1363×936. Measurements are DOM/computed styles, not inferred. This inventory is incomplete and will be extended; unavailable values are marked unmeasured. No reference Save was executed.

| ID | Element/location | Measured appearance | Behavior observed | Boat Two difference / verification |
|---|---|---|---|---|
| FB-001 | Canvas | Full viewport, pale grey/blue gradient | New flow contains Start Bot Flow | Boat editor uses surrounding app chrome and visible dot grid; comparison pending |
| FB-002 | Collapsed palette, left | 56 px wide; items 48×43.72, radius10 | Interaction expands palette | Boat width58, expanded268; click currently adds immediately |
| FB-003 | Expanded palette | 264 px; first measured item200×39 | Search and grouped blocks; drag Image onto canvas succeeds | Boat grouping/order includes extra blocks; retain important functions without default clutter |
| FB-004 | Floating toolbar, upper right | Outer523.11×82 at827.89,10 including padding12×18; inner panel measurement pending | Back/Rearrange/channel/Save | Boat has visible name/status/Preview/settings/Publish/More; extra controls need relocation, not data/function deletion |
| FB-005 | Reference card | 264×163, white, border2 rgba(222,227,230,.42), radius12; font14/21 Plus Jakarta Sans | Double-click opens Configure Reference | Boat summary/hint and sizing differ |
| FB-006 | Output socket | 15×15, white, 2px #778292, radius12; right edge | Compose Next Message | Boat source start is not connectable; investigate existing derived start mapping |
| FB-007 | Configure Reference | Left drawer576×912 at1,0, white, radius12, font16/24 | Keywords, exact/string match, title; automation labels/lists/sequences/team; data/custom-field/webhook; Save Changes/Close. Closed without save | Boat settings functional equivalents need comparison; no invented mapping |
| FB-008 | Image card | 264×221, white; stats Sent/Delivered/Subscribers/Errors | Drag added to temporary unsaved canvas; double-click opens config | Boat width280, vertical ports, incomplete warning diverge |
| FB-009 | Configure Image | Drawer dimensions not yet measured separately | Upload png/jpg, custom-field URL selector, URL; collapsed Delivery Options; Save Changes/Close | Boat own media editor supports URLs/upload; compare pending |
| FB-010 | Node selection | Reference selected border blue; floating Clone/Delete controls exist in DOM | Double-click tested; clone/delete pending | Boat shows extra edit/set-start controls |

## Discovered palette (18 types, not all configuration tested yet)
Text, Image, Audio, Video, File, Location, AI Reply; User Input Flow, Whatsapp Flows, Appointment; Interactive Message, Template Message, CTA URL Button; Condition, New Sequence Campaign, Label Assign, Notify Contact, Random Number Generator.

## EXTRA_ELEMENTS_REMOVAL
No removals applied yet. Candidate default chrome: title/status, Preview, settings, Publish, More, bottom zoom/hint, dotted grid. Preserve necessary real functions in a secondary surface; do not remove saved data or runtime types. Decisions await completed reference inspection.
