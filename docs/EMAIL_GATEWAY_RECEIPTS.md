# Email gateway receipts and evidence review

Local code is implemented; real gateway/domain/sender activation is still disabled and requires owner authorization. Existing EXTERNAL_DELIVERY_ENABLED and EMAIL_DELIVERY_ENABLED gates remain independent from EMAIL_RECEIPTS_ENABLED (default false). Configure EMAIL_RECEIPT_SECRET securely, at least 32 characters, on the app and trusted gateway; never commit it.

The outbound gateway request includes `reference: {tenantId, jobId}` and `receiptUrl`. A configured gateway must first return its existing `{accepted:true,id}` response, then asynchronously post normalized delivery events. Do not wait for a callback before completing acceptance: callbacks and sending serialize on the same job.

`POST /mail/receipts` accepts exactly: eventId (stable gateway event identifier), tenantId, jobId, providerId (same as gateway acceptance ID), status (`delivered`, `bounced`, `failed`), occurredAt (UTC ISO timestamp). No recipient email, invitation token or message body is required or accepted.

Set X-Boat-Timestamp to current Unix seconds and X-Boat-Signature to the lowercase hex HMAC-SHA256 of `timestamp + '.' + exact raw JSON bytes` using the receipt secret. Requests outside five minutes, unsigned/disabled requests, changed duplicate event bodies, wrong provider/job/workspace links and future event times are refused. Re-sign retries with a fresh header timestamp but preserve event ID and exact body bytes. Every verified event is immutable; older receipts cannot regress the visible state. Equal-time conflicts prefer bounced, then failed, then delivered.

Signed gateway evidence can close an ambiguous acceptance without sending anything. Owner-only `POST /workspace/mail/:id/reconcile` also supports evidence-based accepted/not_sent review; accepted requires a provider ID. Review never replays the send or clears/reuses an ambiguous external effect. Not_sent closes the job as canceled; any new invitation/send is a separate deliberate action. Provider acceptance remains distinct from recipient delivery.

Validated locally by smoke-mail-receipts and smoke-invitation-mail with synthetic signatures/mocked gateway responses. No real delivery, bounce service, sender DNS or provider webhook contract acceptance was performed.
