# World ID debrief (Supabrain · ETHGlobal Mumbai 2026)

Lane B keeps this file up to date as things happen. It is the debrief World asks for.

## What we protect with World
Agents can spend money. The payment policy decides when a human must approve. The agent cannot skip it or trigger it itself. A human is needed for:
1. paying a payee that came from outside content (an email, a web page) and isn't verified by the team's ENS (**denied** live: the attacker's "partner" address);
2. paying over the agent's ENS-set cap (**approved** live: Acme's real 5 USDC invoice → paid on chain).

## How we integrate
**Primary: World ID 4 through IDKit core, following World's Human-in-the-loop pattern** (`packages/payments/src/world/humanApproval.ts`, wiring in `idkitAdapter.ts`, `@worldcoin/idkit-core@4.6.0`).
- **Action = the payment.** Every intent gets its own action, `supabrain-pay:<intentHash>`. The server signs `rp_context` for that action with the RP signing key (`signRequest`), so World App only accepts a proof for this exact payment. The signal is the intent hash too.
- **Server-side from Node:** `IDKit.request(...).constraints(...)` gives a `connectorURI`, which the dashboard shows as a QR on the owner-only approval card. The server polls the bridge with `pollOnce()`. No browser widget is needed.
- **Backend validation, fail closed.** Before calling World, we check:
  - `protocol_version`;
  - `action` equals this intent's action;
  - `nonce` equals the one we signed;
  - `environment` equals the pinned one (staging and sandbox accept test proofs);
  - every response's `signal_hash == hashSignal(intentHash)`;
  - the credential is in the allowed list.

  Then `POST /api/v4/verify/{rp_id}` with the result forwarded as-is, and we require `success: true` with the same environment and action. Last, the `(action, nullifier)` pair is consumed once. Only after all of that does the policy signer sign the EIP-712 attestation with `humanApproved=true`, which BrainVault checks on chain.
- **Config:** `config/world.json` → `idkit` block (environment, verify base URL, RP signature TTL, credentials, action prefix). `WORLD_APP_ID`, `WORLD_RP_ID` and `WORLD_SIGNING_KEY` come from env.

**Fallback: OIDC device flow at auth.world.org** (`deviceFlow.ts`, `discovery.ts`, `idToken.ts`, `world:oidc-spike`). It's built and tested (discovery-only endpoints, `client_secret_basic`, `id_token` checked with jose: signature, iss, aud, exp, `auth_time` freshness, one-time `jti`). We couldn't use it because its portal needs an enterprise Google Workspace account.

## Timeline
| When (IST) | What |
|---|---|
| 2026-11-06 | Read docs; live discovery against `auth.world.org` ✓ (device grant, `client_secret_basic`, RS256). Sandbox issuer discovery ✓ |
| 2026-11-06 | OIDC portal → `account_not_eligible` (enterprise Google Workspace only). Switched to IDKit 4; confirmed `IDKit.request` + `pollOnce` run from plain Node against the bridge |
| _pending_ | First approval with validated claims (time to first success: ___) |
| _pending_ | Deny path live · expire/cancel path live |

## Friction (as it happened)
- **The name "Agent Pass" doesn't appear in the public docs** (auth.world.org/docs). The closest is the "Human checkpoints" (step-up) guide. We asked the booth which product the prize means.
- **Two different "verified human" products, and only one was open to us.** The OIDC portal at auth.world.org returns `{"error":"account_not_eligible"}` unless you sign in with an enterprise Google Workspace account. Hackathon teams on personal Gmail can't register a client at all. We moved to IDKit 4 (Developer Portal), which works with any account.
- **(OIDC only) No native action binding.** The device profile marks `binding_message` and action terms as unsupported: they aren't shown on the approval page or signed into the ID token. The human sees only the requester and the user code. Our workaround:
  - the server binds `device_code → hash(intent)`;
  - only after validation does it sign the EIP-712 attestation, with `humanApproved=true` and the same `intentId`;
  - the vault checks that attestation on chain.
- **No mock proofs or simulator are documented.** Testing needs the sandbox issuer, a sandbox World App (TestFlight) and a test credential that takes about an hour to issue. We test validation with locally signed fixtures, as the docs recommend.
- **Two "World ID" credential systems that look alike.** The first credentials we tried were a Developer Portal app ID (`app_…`) and an API key (`api_…`, base64 of `key_…:sk_…`). The device endpoint returned `401 invalid_client` on both production and sandbox, with "check the environment, registered authentication method, and credentials". The OIDC flow needs a separate client registered at `auth.world.org/portal`, whose secret starts with `worldidp_client_secret_` and is shown once. Nothing in either portal points to the other. A hint in the `invalid_client` error ("this looks like an IDKit/API key") would have saved us the round trip.
- **Device-only clients still need an exact HTTPS redirect URI** at registration, even though the device grant never uses it.
- **`nonce` is omitted in device grants,** so freshness relies on `auth_time` + `jti`.
- **The discovery document under-reports:**
  - `acr_values_supported` lists only Orb classes, though the docs also describe Selfie classes;
  - `claims_supported` omits `email`.

## The single most important improvement
**Show the bound action to the human in a structured way.** IDKit 4 does bind the proof to our action and signal, so "a human approved *this exact intent*" is verifiable. But World App shows only the free-text `action_description`, and the human can't check that `supabrain-pay:0x…` is the 5 USDC invoice they think it is. A typed "payment" display (amount, payee, chain), signed into the proof, would close the last gap. Second: make the OIDC portal usable without an enterprise Google account, or say so on the landing page.
