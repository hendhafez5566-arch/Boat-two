# Provider activation — no live activation performed

All provider credentials are absent/unconfigured in development. This checkpoint tested no real customer account, external campaign or paid AI call. Use secure environment settings, not chat or Git, for real values.

## Meta

Server variables: META_APP_ID, META_APP_SECRET, META_VERIFY_TOKEN, META_EMBEDDED_CONFIG_ID (WhatsApp), PUBLIC_API_URL and APP_URL. Public callback: `${PUBLIC_API_URL}/channels/meta/callback`; use HTTPS and register that exact redirect URI in Facebook Login settings. Register `/webhooks/meta` and `/webhooks/whatsapp` and verify the relevant fields. Existing signature validation uses the raw request body. Page/WABA webhook subscriptions and app permissions must be configured with Meta; asset attachment alone does not establish event delivery.

Code uses the repository's Graph v21 baseline. Recheck its support window, scopes and current provider requirements during live acceptance. Facebook/Instagram via Facebook Login discover approved Page/Instagram business assets. WhatsApp uses the Meta JavaScript SDK Embedded Signup configuration and validates that the selected phone ID belongs to the granted WABA. HTTPS origins, app/business verification, app review, approved messaging permissions and eligible business accounts remain external prerequisites.

The UI start buttons are disabled until server configuration and `EXTERNAL_DELIVERY_ENABLED=true` are explicitly supplied by the operator. OAuth state is short-lived, hashed, bound to user/workspace and consumed once; discovered access tokens are server-encrypted. Never return them to the browser. Manual token replacement also accepts a WABA ID for existing WhatsApp channels.

Template management supports text BODY drafts/examples, submission and status synchronization. Only provider-approved name/language records can send; BODY parameter count is checked. Imported complex HEADER/button/authentication templates require the remaining structured composer work; do not claim these variants supported. Outside WhatsApp's reply window, use a supported approved template. Recheck status and consent with the official provider before any authorized campaign.

Official references for activation/acceptance:

- https://developers.facebook.com/docs/facebook-login/guides/advanced/manual-flow/
- https://developers.facebook.com/docs/messenger-platform/
- https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/
- https://developers.facebook.com/docs/whatsapp/embedded-signup/
- https://developers.facebook.com/docs/whatsapp/business-management-api/message-templates/

These are provider references, not evidence that this environment or a particular account has been approved.

## AI

`AI_PROVIDER_CALLS_ENABLED=false` is independent of the Meta/outbound gate. Tenant providers save encrypted Anthropic keys and are disabled by default. A default enabled agent can scope existing knowledge sources and explicitly permit current-contact handoff/follow-up/tag tools. Environment provider settings remain a fallback when no configured agent overrides generation. Embeddings still use the existing embedding provider settings and require separate authorization/budget work.

Input/output rates are optional operator-provided USD-per-million values. ai_runs record actual returned token counts and a calculated estimate when both rates exist; null means unknown cost. They do not represent a provider invoice. Do not enable calls or enter production keys without the owner's explicit authorization.

## Delivery and recovery

Outbound dispatch records a sending lease before calling a provider. Rate-limit rejections may retry; network failures, worker loss and 5xx responses remain ambiguous to prevent duplicate sends. In Delivery & events, reconcile an ambiguous provider message with evidence and a provider message ID if confirmed sent; only confirmed failed work can then be retried. Arbitrary external HTTP/AI effect ambiguities currently require a dedicated operator workflow still tracked in REMAINING_WORK.
