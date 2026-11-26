# Bot Two Team — Staff mobile companion (MVP)

A native React Native + Expo mobile client for the existing Bot Two backend. This is an **experimental branch**, not a deployed APK or store release.

## Audience and scope

The app is exclusively for workspace `owner`, `admin`, and `agent` roles. It is not a consumer messaging application or a replacement for web account/channel onboarding and bot flow editing.

- **Chats:** WhatsApp-inspired internal inbox UI across the connected channels (WhatsApp, Instagram, Facebook, Telegram, Webchat). Search, filters, unread counts, chat history, text replies, take over / release bot, pending and close, mark important.
- **Tasks:** List open CRM tasks, mark done using the existing tenant-scoped endpoint.
- **Orders:** Read and update order status for owner/admin only. This is intentional: the existing `CommerceController` has `@Roles('owner','admin')` and staff **must not** bypass that restriction from a client.
- **Account:** Workspace switch, agent availability toggle, logout, secure on-device session storage.
- Uses the existing database, tenants, channels, messages, API authentication and authorization. Does not store a second set of conversations.

## Setup

Requires Node.js compatible with Expo SDK 58 and pnpm.

```bash
cd apps/mobile
cp .env.example .env
# Set EXPO_PUBLIC_API_URL to the same HTTPS API base URL that the web app uses.
pnpm install
pnpm exec expo install --fix
pnpm typecheck
pnpm start
```

Run in Expo Go or a native dev build. For a physical Android/iOS phone the API must be a reachable HTTPS hostname, not `localhost`. Never commit real `.env` credentials.

This folder was built against the `backup-live-20261126` backend contract. The repository's default `main` branch is older. Do not merge this branch blindly into `main` or production.

## Server APIs used

- `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me`, `POST /auth/switch-tenant`
- `GET /conversations`, `GET /conversations/:id`, `GET /conversations/:id/messages`, `POST /conversations/:id/read`, `POST /conversations/:id/messages`
- `PATCH /conversations/:id`, `POST /conversations/:id/takeover`, `POST /conversations/:id/release`
- `GET /crm/tasks`, `PATCH /crm/tasks/:id`, `PATCH /team/me/availability`
- Manager only: `GET /commerce/orders`, `PATCH /commerce/orders/:id/status`

Access and refresh tokens are kept in `expo-secure-store`. Refresh tokens rotate, and requests coordinate refresh attempts in process. All authorization decisions remain server-side.

## Explicit MVP limitations

The current app is a **functional code scaffold** that has not been compiled, device tested, or connected to the user's Railway Preview during this task.

- Foreground polling refreshes conversations about every seven seconds and open chat about every four seconds; full SSE/WebSocket integration and reliable background notification delivery are not implemented.
- Text messaging works through the existing API contract. Sending photos, files, audio recording/playback, message reactions, quoted replies, and approved WhatsApp templates need a follow-up implementation.
- Incoming attachments are represented by file/audio/image labels, not yet downloaded or played.
- The WhatsApp 24-hour free-form messaging window is respected in the UI; outside that window the user must use an approved template on the web until the mobile template picker is added.
- Multi-factor authentication, device biometrics, audit UX, push token registry, permissions hardening for agents' orders, offline queue, full localization and production branding remain separate release gates.
- Order transitions may be rejected by the backend based on document requirements; the app does not override them.
- It borrows familiar messaging interaction patterns, but does not include WhatsApp logos, trademarked branding or claim to be WhatsApp.

## Release/acceptance checklist

1. Run `pnpm exec expo install --fix` and `pnpm typecheck`; fix any SDK/toolchain compatibility issues.
2. Log in using test owner, admin and agent accounts on a Railway **Preview** workspace. Verify correct workspace scoping, refresh rotation, login expiration, logout and switching tenant.
3. Generate a Webchat inbound message; confirm it appears in both the web inbox and mobile inbox.
4. Reply from the phone; verify the exact outbound message reaches the preview channel and the existing web inbox shows the same message.
5. Assign/take over, close, return to bot; validate role restrictions and changes across clients.
6. Complete an ordinary CRM task and an order workflow task; confirm correct progression, conflicts and alerts.
7. Validate owner/admin order views, document-gated transitions, and that agent cannot access manager APIs.
8. Test Android/iOS, small screens, Arabic/English and dark mode readiness. Check tap targets, scroll position, keyboard behavior, poor connectivity and accessibility.
9. Implement protected attachment transport and push notifications (FCM/APNs through Expo with backend token registry) before inviting staff to rely on the app.
10. Create Android/iOS signed development builds through EAS; do not publish to stores or production without explicit approval.

## Product design principles

The chat screen is the app's home; a WhatsApp-like list and chat layout minimize retraining. All account connection setup, campaign management, platform owner controls, and full bot-builder complexity remain on desktop/web.
