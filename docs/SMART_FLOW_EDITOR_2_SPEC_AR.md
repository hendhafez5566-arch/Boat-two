# ELHAFEZ BOAT — SMART FLOW EDITOR 2.0
## Locked UX/UI & behavior contract | 2026-10-24 | Owner-facing implementation specification

**Status:** Execution reference, not proof of implementation. This document explicitly defines the new editor experience. Codex must not substitute an arbitrary cosmetic makeover. The visual structure, interaction behavior, mobile presentation and success criteria below take precedence over subjective design preferences. Keep the existing Elhafez Boat brand.

### 0. Verified inputs (distinguish evidence from proposed design)
- Existing project: hendhafez5566-arch/Boat-two, branch fix/boat-ux-19-one-batch, Draft PR #2.
- Current deployed build before this task: pinned SHA 4c411d73332f2873c2cb2a1e297a50cf8f55f13d, same Railway Preview. Do NOT deploy, merge, or touch production without owner request.
- User's two mobile screenshots (2026-10-24): narrow classic white side inspector, tiny inputs/labels, half the viewport darkened, tiny flow behind. This is direct visual evidence; do not claim the mobile inspector is fixed without a mobile screenshot.
- Existing UI source as of 4c411d7: apps/web/components/flow/Inspector.tsx (~1324 lines, generic fields); apps/web/app/dashboard/flows/[id]/page.tsx (ReactFlow and canvas/editor state); apps/web/components/flow/FlowNodeView.tsx; apps/web/lib/flow-types.ts; apps/web/app/builder-responsive.css; apps/web/components/business/ConditionModal.tsx. Reuse current graph model, save/undo logic, inspector behavior and working UX-01–54 fixes.
- Manychat official reference: https://help.manychat.com/hc/en-us/articles/14281326740124-How-to-use-WhatsApp-Messages-Templates-in-Manychat (button-specific edit and link to next steps); condition behavior: https://help.manychat.com/hc/en-us/articles/14281142518556-Condition-Block (true/false, all/any); actions: https://help.manychat.com/hc/en-us/articles/17636378650268-Actions
- BotSailor official reference: https://botsailor.com/blog/explore-the-upgraded-no-code-chatbot-builder (categorized block library, search, automatic setup opening, clean hover actions, smart field suggestions).
- These are interaction references, NOT licenses or instructions to duplicate competitor pixels, brand, exact artwork, or proprietary source. The target below is **our approved proposed interaction specification**, not a claim that every competitor implements it identically.

### 1. Non-negotiable goal
A nontechnical Egyptian business owner must configure a WhatsApp/Web bot by answering:
(1) العميل هيشوف إيه؟
(2) العميل يقدر يختار إيه؟
(3) هيحصل إيه بعد اختياره؟
Every primary control must be task-language Arabic, discoverable, and visually legible. Retain an advanced mode for all existing capabilities; avoid merely restyling input borders.

### 2. Design system / fixed visual hierarchy
- Keep existing navy + blue brand, Arabic RTL, Noto Sans Arabic or the current app's Arabic typeface; do not replace the site branding.
- Body/input text >=16px on mobile, >=14px desktop; section titles 16–18px; help text >=13px and good contrast. Avoid pale grey/10px labels.
- Primary action visually distinct, secondary outlined, destructive control inside a closed "more" menu with confirmation; no decorative gradients or unnecessary shadows.
- Main title, status, help, cards, section gaps use one consistent shared component set, no standalone per-node CSS improvisation.
- Touch targets >=44x44px. Full keyboard accessibility, visible focus, Escape/back behavior, meaningful labels and errors. No horizontal scroll in the editor.

### 3. Precise desktop/tablet/mobile surfaces
**Desktop >=1100 CSS px**
- Navigation remains on its existing RTL side of app. Canvas fills remaining area.
- When node selected: contextual inspector docks on canvas opposite navigation (left in RTL), width clamp(380px, 31vw, 460px), and may be closed with a visible X. Never stack inspector + phone preview and obscure graph. When no selection, hide inspector.
- Sticky inspector header: node icon, human title, brief status, X; sticky bottom: saving state, "تجربة", "تم". Internal body scroll only.
- Inspector order ALWAYS: live content/condition core first, choices/actions second, next-step controls third, advanced accordion last. No variable chips, Delete, raw IDs or explanatory technical text before content.
- Clicking any option/action opens its contextual setup INSIDE the inspector in a drill-down view with visible breadcrumb/back, not a new full page.
- "معاينة" becomes a mutually exclusive review mode. Closing returns to prior selected node and preserved canvas zoom/position.

**Tablet 701–1099 CSS px**
- Inspector is an overlay max-width min(460px, 90vw); canvas not permanently squashed. Visible close button; background dimmed; it can be closed to return to exact canvas state.

**Phone <=700 CSS px — CRITICAL screenshot regression**
- NEVER display desktop-style narrow side drawer on phone. Selecting a node opens a full-width, full-height (100dvh with safe-area and sensible browser chrome handling) MOBILE EDITOR view with a single-column body, 16px inputs, large option cards and sticky footer.
- Header: "رجوع للمخطط" + node name + close/back; back closes editor and restores graph view/zoom. No concurrently visible underlying graph as a tiny sliver or dark overlay beside the editor.
- Content tab, choices tab, next-step tab can be simplified into a short in-page segmented navigation; avoid duplicating same fields. Keyboard should not obscure Save/Done; safe-area spacing; handle 360–430px widths and 200% text zoom.
- Tiny fixed mini-map and irrelevant navigation controls must remain hidden while editing.
- Detect CSS viewport and override specificity. User screenshot showed a side sheet on Chrome Android; visually verify real mobile width before claiming success.

### 4. Per-type editor specification (implement actual interactions, not fake controls)

**A — Message / interactive**
- Top section "العميل هيشوف إيه؟" with large editable message body and inline preview bubble; preview updates as user types.
- Within body: easy variable suggestion when typing '{{' or via "إضافة بيانات العميل", showing human labels and inserting existing canonical tokens; preserve focus/caret. Never invent new engine syntax. Emoji insertion can use native input; no paid dependencies.
- Media card "إضافة صورة / فيديو / صوت / ملف" shows type, URL/file source supported by existing backend and an actual safe preview or explicit unavailable state. Do not promise local upload without a real upload API. Channel-specific limits in human Arabic.
- Second section "اختيارات العميل": buttons/list segmented modes. Each item is a LARGE card with title, optional description and action summary; add/rename/reorder/remove with confirmation on branch destruction; keyboard-accessible. Use existing stable option IDs, preserve edge source handle option:<id>. Respect existing WhatsApp maximum button/list limits and confirmation on format conversion. No silent loss.
- Clicking choice opens "عندما يضغط العميل على [title]، ماذا يحدث؟" with icon-and-label action choices, at most the supported actions: (a) إرسال رسالة جديدة — create/connect message, (b) الانتقال لخطوة موجودة — searchable picker, (c) سؤال العميل — question/user_input, (d) تحقق من شرط — condition, (e) تحويل لموظف — handoff, (f) إضافة وسم — tag, (g) انتظار — delay, (h) إنهاء المحادثة — end, and URL link ONLY via existing supported CTA/link node semantics. Preserve existing channel restrictions and tell user before modifying.
- After choosing an action: create/connect actual graph node or edge, auto-open new node's setup, show "بعد الضغط: ...", and support undo. "لا يوجد إجراء بعد" visibly displayed for unconnected options.
- Next-step destination must be discoverable WITHOUT canvas dragging; never regress existing connect-by-click and drag behavior.

**B — Conditions**
- Header question "متى يسلك العميل هذا المسار؟"; visual rows [اختار البيانات] [المقارنة] [القيمة]; default sensible labels.
- ALL / ANY control in natural Arabic: "كل الشروط" / "أي شرط". Add nested condition groups only to the extent existing engine supports them; do not simulate unsupported branching.
- Pick known variables and custom/system fields; advanced raw keys available but folded. Human summary "لو ... يساوي ...".
- Output action cards "نعم — تحقق الشرط" / "لا — لم يتحقق" (or existing engine's exact branch labels), each linked/empty status.
- Maintain compatibility with ConditionModal and all existing rule types. Edit in inspector and expanded modal must serialize identically.

**C — Question / user-input**
- Question text first; response type as segmented options or clear tiles (نص/رقم/هاتف/بريد/اختيارات).
- Where to save answer: human picker of available contact fields; existing key preserved and technical field accessible in Advanced.
- Validation + retry messages folded under "لو الإجابة غير صحيحة".
- For user_input multi-question chain show 1/2/3 list, one question expanded, simple reorder, inline conversation preview, not all raw questions expanded at once.

**D — Handoff**
- Header "تحويل إلى موظف"; select team/employee ONLY if available in existing backend, otherwise explain actual current behavior, with reliable defaults. Show what customer sees and what happens to bot on handoff. Do not create fake staff assignment or new APIs.

**E — Other node types**
- Cover every existing NodeType from apps/web/lib/flow-types.ts: subflow, message, interactive, location, cta_url, template, sequence, user_input, image, audio, video, file, question, condition, set_variable, set_attribute, delay, http_request, sheet_fetch, business_hours, split, random_number, ai_reply, handoff, tag, note, end.
- Put each into category: التواصل / جمع البيانات / التحكم والمنطق / إدارة العميل / التكاملات / متقدم. Show core human-labeled fields first and advanced options folded. Do not drop or silently disable ANY existing field/behavior. For unknown/unimplemented integrations, describe the actual capability and show disabled state, never fake "connected".
- HTTP Request / Google Sheet Data Fetch: retain mapping, request restrictions and safe URI validation; hide raw headers/JSON behind Advanced. Do not call external services as part of this task.
- AI reply: do not activate any paid AI provider, agent, or enable external calls. Leave disabled safely if unsupported by preview.

### 5. Library and canvas behavior (do not rewrite flow engine)
- Categorized searchable add-step palette using existing NODE_GROUPS or consistent groups; beginner-friendly descriptions (one sentence), icon and "استخدمها عندما..." hint.
- On create/connect step, open relevant editor immediately, but do NOT steal keyboard focus on mobile or trigger unwanted autosave.
- Main graph: quiet text/message preview, large readable labels, no statistics in build mode; switch to analytics separately. Preserve optional minimap, focus mode, arrange/fit, preview, graph navigation and zero collision layout.
- Do not change persisted node schemas, node IDs, edge IDs, RLS, graph serialization, workflow execution semantics, API routes, tenant isolation, permission checks, or DB schema unless strictly required; if required, document compatibility and add migration/tests.
- Never reintroduce UX-01–54 or F01–F19 regressions.

### 6. Visually fixed target journey / example content
Use exact Arabic QA scenario:
- New flow "بوت استقبال شركة سياحة".
- Step 1: message "أهلًا بيك في شركتنا 👋\nاختار الخدمة اللي محتاجها:".
- Reply options: "حجز عمرة", "التحدث مع موظف", "الأسئلة الشائعة".
- Choose "حجز عمرة" -> action "إرسال رسالة جديدة" -> create next message "تحب تسافر إمتى؟" -> question saves departure preference to supported existing field.
- "التحدث مع موظف" -> handoff node with actual supported flow.
- Add condition "لو العميل اختار حجز عمرة" using supported variable ID or value; show two labeled outcomes.
- Convert 3-button message to list and back without silently dropping option IDs/branches; if constraints disallow, explicit prompt before changes.
- Live preview must clearly distinguish logic simulator from real WhatsApp UI; no external Meta delivery. Save, close, reopen: identical graph/branch behavior and no lost draft.

Target screenshots / review matrix (supply REAL screenshots after implementation):
1. Desktop 1440x900: message inspector, option action drilldown, no accidental clipping.
2. Desktop 1440x900: conditions, true/false outcomes.
3. Desktop 1440x900: canvas compact layout with choices and a staff branch.
4. Phone 390x844: editor message, buttons, condition; no narrow side sheet.
5. Phone 390x844: editor close -> visible graph.
6. Tablet 768x1024: inspector overlay.
If environment cannot run browser, DO NOT claim visual acceptance; deliver working code + explicitly marked unverified browser items instead.

### 7. Acceptance gates — NOT optional
- Build successful: pnpm install (once as needed); pnpm --filter web build; pnpm --filter api build if API was touched.
- Focused tests: existing scripts/test-ux19.mjs, scripts/test-ux-designer.mjs and relevant flow/save tests; add concise tests for action-to-graph mapping, stable option IDs, branch links, reversible conversion, condition roundtrip, and focus/selection persistence.
- Any buttons introduced must perform REAL operations. No mock/demo buttons disguised as working features.
- Cross-browser/viewport smoke screenshots for desktop + Android-sized layout, using local Chromium if available; do not invent screenshots or publish without instruction.
- User text legible; no backwards RTL labels, input fields under 16px on phone, unintended horizontal scroll, white-on-white/low contrast, or editor overlay consuming half canvas incorrectly.
- Cannot claim success if only CSS changed, if half the node kinds lost editing fields, if graph serialization changes, if default preview performs real sends, or if browser acceptance unavailable but declared passed.
- A single small handoff document lists completed node types, exact gaps, evidence/screenshots, test/build status, and a before/after comparison.

### 8. Work organization and credit budget
- Deliver as one INTEGRATED task, not separate PRs. Continue ONLY on fix/boat-ux-19-one-batch, Draft PR #2, latest HEAD verified first.
- First map existing inspector field capabilities by NodeType and identify code to reuse; then implement shared UI shell, main message/choice/condition workflows, then remaining NodeType editors, responsive styles, and acceptance.
- Commit and PUSH immediately after each coherent, passing unit; update docs/SMART_FLOW_EDITOR_2_PROGRESS.md. Do not force-push. If credits run out, the next session can continue from latest commit with no exploratory rework.
- Short updates; no long competitive research or generic audits. Official references above are sufficient. Preserve original layouts/code path when feature parity cannot be safely matched; explicitly list gaps.
- No main merge, no Railway deploy/branch switch, no production changes, no Meta connect, no real WhatsApp messages, no paid AI, no extra preview environments.
- Final: PR URL, last SHA, precise completed/remaining scope, builds/tests, and screenshots only if real. **No assertion of finished visual quality without actual inspection.**

### 9. Design decisions locked (executor must not improvise)
- Editing is a task-specific form + LIVE chat preview, not a long technical spreadsheet.
- One step-specific editor at a time. On desktop editor width <=460px; on phone dedicated full-width editor.
- Primary labels: "العميل هيشوف إيه؟", "اختيارات العميل", "لما يضغط العميل، هيحصل إيه؟", "الخطوة التالية", "إعدادات متقدمة".
- Contextual option editor uses clear action tiles and existing graph nodes, not hardcoded effects disconnected from execution.
- Beginner workflow first; technical controls only inside advanced sections; preserve expert access.
- Brand unchanged, no paid AI, no backend rewrite, no speculative new channel capability.
- If product requirements conflict with current supported engine, preserve working behavior and report exact conflict; do not invent APIs or show nonfunctional actions.
