# Telegram observed connection journey and implementation

| Step | BotSailor screen | Button | Fields | Action | Result |
|---|---|---|---|---|---|
| 1 | Connect Account | Connect Telegram | None | Open | Dedicated Telegram Bot Connection page |
| 2 | Connect Your Telegram Bot | Connect Bot | Bot Token only | Viewed | BotFather creation/token instructions; no name field |
| 3 | Token submission | Connect Bot | Test token unavailable | Not run live | Provider success/error text and post-connect layout remain BLOCKED |

Boat implementation now has a dedicated Telegram page and a token-only endpoint guarded for owner/admin. Server validates token identity with getMe before writing a channel, uses the provider bot name, preserves duplicate protection, invokes the existing webhook setup and connection verifier, and returns no token. A failed webhook keeps the channel recoverable and explicitly reports incomplete setup. Legacy create/setup endpoints remain unchanged.

Fresh validation: API TypeScript build PASS; Web production build PASS (51 routes); scoped ESLint PASS; nine tests PASS including the new orchestration test and existing Meta PostgreSQL identity/tenant tests. Provider calls are synthetic/mocked; no live Telegram connection is claimed. CLI tsx runner initially failed on its IPC pipe (EPERM); node --import tsx --test succeeded without an IPC server.

Remaining: full HTTP role/tenant and bot-to-Inbox/CRM regression, current-source interactive screenshots at requested viewports, real disposable bot acceptance, exact reference post-connect state and reconnect/disconnect behavior. No deployment approved by this checkpoint's evidence.
