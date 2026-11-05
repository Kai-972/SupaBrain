# World ID debrief (Supabrain · ETHGlobal Mumbai 2026)

Lane B keeps this file up to date as things happen. It is the debrief World asks for.

## What we protect with World
Agents can spend money. The payment policy decides when a human must approve. The agent cannot skip it or trigger it itself. A human is needed for:
1. paying a payee that came from outside content (an email, a web page) and isn't verified by the team's ENS (**denied** live: the attacker's "partner" address);
2. paying over the agent's ENS-set cap (**approved** live: Acme's real 5 USDC invoice → paid on chain).

## How we integrate
- **Flow:** OIDC Device Authorization Grant (RFC 8628). The server starts it, the dashboard shows the user code and QR, the human approves in World App, and the server polls.
  - Code: `packages/payments/src/world/deviceFlow.ts`.
- **Discovery only:** endpoints are never hard-coded. They come from `${issuer}/.well-known/openid-configuration`.
  - The issuer is in `config/world.json`.
  - We stop if the device grant or `client_secret_basic` isn't advertised.
  - Code: `packages/payments/src/world/discovery.ts`.
- **Backend validation** (`packages/payments/src/world/idToken.ts`) with `jose`:
  - signature against the discovered JWKS, with `alg: none` never allowed;
  - `iss` and `aud == client_id`;
  - `exp`, plus `auth_time` no older than the request (minus a configured skew);
  - a one-time `jti`;
  - optionally `sha256(iss|sub)` equal to the enrolled approver.
- **Never client-side:** only a validated `id_token` from the token endpoint counts as approval. HTTP 503 means keep waiting, and an invalid token is a failure, never an approval.

## Denied / expired / cancelled paths
- `access_denied` → **denied**. `expired_token`, or our local expiry → **expired**. An app-side cancel → **cancelled**.
- On each of these, the intent is cancelled and nothing moves.
- Tests: `packages/payments/src/world/world.test.ts` (`waitForDecision` suite).
- Live proof: _pending_ (the S4 spike needs client credentials).

## Timeline
| When (IST) | What |
|---|---|
| 2026-11-06 | Read docs; live discovery against `auth.world.org` ✓ (device grant, `client_secret_basic`, RS256). Sandbox issuer discovery ✓ |
| _pending_ | First approval with validated claims (time to first success: ___) |
| _pending_ | Deny path live · expire/cancel path live |

## Friction (as it happened)
- **The name "Agent Pass" doesn't appear in the public docs** (auth.world.org/docs). The closest is the "Human checkpoints" (step-up) guide. We asked the booth which product the prize means.
- **No native action binding.** The device profile marks `binding_message` and action terms as unsupported: they aren't shown on the approval page or signed into the ID token. The human sees only the requester and the user code. Our workaround:
  - the server binds `device_code → hash(intent)`;
  - only after validation does it sign the EIP-712 attestation, with `humanApproved=true` and the same `intentId`;
  - the vault checks that attestation on chain.
- **No mock proofs or simulator are documented.** Testing needs the sandbox issuer, a sandbox World App (TestFlight) and a test credential that takes about an hour to issue. We test validation with locally signed fixtures, as the docs recommend.
- **Device-only clients still need an exact HTTPS redirect URI** at registration, even though the device grant never uses it.
- **`nonce` is omitted in device grants,** so freshness relies on `auth_time` + `jti`.
- **The discovery document under-reports:**
  - `acr_values_supported` lists only Orb classes, though the docs also describe Selfie classes;
  - `claims_supported` omits `email`.

## The single most important improvement
**Native action binding:** an approval token that carries a hash of the approved action, shown to the human and signed into the `id_token` (or a separate signed receipt). Then "a human approved *this exact payment*" would be verifiable without trusting our server's `device_code → intent` mapping.
