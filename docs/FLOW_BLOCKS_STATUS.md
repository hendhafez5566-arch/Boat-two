# Flow blocks palette — status against the reference palette

| Group | Block | Status |
|---|---|---|
| Messages | Text (`message`) | Done |
| Messages | Image / Audio / Video / File | Done: engine, validator, schema, inspector, canvas preview (image thumbnail; audio, video and file chips) |
| Messages | Location, AI Reply | Done |
| Data collection | User Input Flow | Done |
| Data collection | WhatsApp Flows | NOT done |
| Data collection | Appointment | NOT done |
| Interactive | Interactive Message (`interactive`) | Done: separate palette block, requires at least one button/list option, same routing as `message` |
| Interactive | Template, CTA URL | Done |
| Flow control | Condition, Sequence, Label Assign (`tag`) | Done |
| Flow control | Random Number Generator (`random_number`) | Done: inclusive integer range saved to a variable |
| Integrations | HTTP API | Done |
| Integrations | Google Sheet Data Fetch | NOT done |

Canvas: stats row, image, text box and pill buttons are done. Reference-style separate button and image cards are not done (buttons stay inside the message card).
Not verified in a real browser; no node_modules were available when this was written. Engine unit tests (30) pass when compiled with tsc and run with node --test.

## Canvas look (reference images 1, 2, 3, 5)
- Separate-looking cards (image 5): a message/interactive node shows the message card, an image card, and one card per button, each button with its own connection point. Still ONE node (cards move together); buttons are not independent nodes. Per-button click statistics are not shown (no such data exists).
- New Sequence Campaign card (image 1): the "add to sequence" node shows sequence name, delivery time and time zone. The full sequence editor with Send Message After cards already existed in /dashboard/sequences.
- User Input Flow (image 2): the node shows its questions as cards with the Multiple Choice bar, options and save-to field (first 3 questions). The full chain preview already existed in the inspector.
- Configure Condition (image 3): already existed (ConditionModal, used by the condition node and by sequences).
- "Drag. Connect. Automate." handwritten tagline on the flow canvas (hidden on small screens).
Not verified in a browser. Existing browser smoke scripts were not run and may rely on old node card markup.
