# World ID debrief (Supabrain · ETHGlobal Mumbai 2026)

This is the debrief World asks for, kept by Lane B as things happened.

## Summary
- **What World does for us:** our AI agents can spend a team budget, and the payment policy decides when a real human must approve. World makes that approval a unique human proving it in World App **for one exact payment**, checked on our backend and by World's verify API before any money moves.
- **Product used:** World ID 4 through IDKit core (`@worldcoin/idkit-core@4.6.0`), following World's Human-in-the-loop pattern for agents. We also built the OIDC device flow at auth.world.org, but couldn't register a client for it (below).
- **Live results** (production World App, 2026-11-06): **approve ×3** (111 s, 85 s, 99 s, `proof_of_human`, verified by World), **deny** (`verification_rejected`, 46 s), **cancel** (45 s). Nothing moved on any non-approval.
- **Time to first success:** about 2 h from first reading the docs, including about 1 h 30 on the OIDC route we couldn't use. From registering the relying party to the first verified approval: **about 25 min**, of which about 5 min was finding that Selfie Check (preview) breaks the request.

## What we protect with World
The policy (`packages/payments/src/policy.ts`) asks for a human when:
1. the payee came from **outside content** (an email or web page, via memory) and isn't verified by the team's ENS: the attacker's "partner" address in our demo, which the human **denies**;
2. the payee is **new**, or the amount is **over the agent's ENS-set cap or daily limit**: Acme's real 5 USDC invoice against lead-claude's 4 USDC cap, which the human **approves**.

The agent can't skip the check or trigger it itself. An ENS mismatch or a revoked source is a hard block that no approval can override.

Status of the protected action: **live on Sepolia through the server's `pay` MCP tool** (2026-11-06). P3 `pay(acme.supabrain.eth, 5 USDC)` was over the 4 USDC ENS cap → PENDING HUMAN → approved in World App → [PAID](https://sepolia.etherscan.io/tx/0x7b983ad5aafadce22a1fdd98da09a3710be64be673f96c39602c5663de517528). The on-chain `Paid` event carries `humanApproved=true`, and its only root is the owner's invoice. It took 85 s from pending to paid. Also proven on anvil (`packages/payments/src/vault/vault.anvil.test.ts`).

## How we integrate (flow)
1. The policy returns `pending_human` and the engine snapshots the payee, amount and lineage roots (`engine.ts:225–236`).
2. **Action = the payment:** `supabrain-pay:<intentHash>`, where `intentHash = keccak256(agent, payee, amount, rootsHash, intentId, intentExpiry)` (`vault/attestation.ts:51`, `world/humanApproval.ts:106`).
3. The server signs `rp_context` for that action with our RP signing key (`signRequest`, `idkitAdapter.ts:10`). The signal is the intent hash too.
4. `IDKit.request(...).constraints(...)` runs **from Node** and returns a `connectorURI`. The dashboard shows it as a QR on the owner-only approval card, and the MCP `pay` call returns `pending_human` at once (`idkitAdapter.ts:16`).
5. The server polls the bridge (`waitForHumanApproval`, `humanApproval.ts:247`), sleeping the interval before each poll and keeping going through retryable bridge errors.
6. On a confirmed result: backend validation (below), then **every hard policy check again, live** (`engine.ts:189–209`), then a fresh EIP-712 attestation with `humanApproved=true`, then `BrainVault.pay`.

## How we validate on the backend (fail closed)
`verifyApprovalResult` (`packages/payments/src/world/humanApproval.ts:165–235`). Any failure is `failed`, never an approval:
- the request window hasn't passed (RP signature expiry);
- `protocol_version` is 4.0 (3.0 only if legacy is enabled in config);
- `action` equals this intent's action;
- `nonce` equals the nonce **we** signed;
- `environment` equals the pinned one (production; staging and sandbox accept test proofs);
- every response's `signal_hash == hashSignal(intentHash)`, and the credential is in the allowed list;
- `POST {verifyBaseUrl}/api/v4/verify/{rp_id}` with the result as-is, requiring `success: true` and the same environment and action;
- the `(action, nullifier)` pair is consumed **once** (replay store).

Tests: 46 in `humanApproval.test.ts`. Deliberately disabling the action, signal or replay check makes tests fail each time.

## Where the denied, expired and cancelled paths are
| Path | Trigger | Code | Proof |
|---|---|---|---|
| **Denied** | Human rejects in World App (`user_rejected` / `verification_rejected`) | `humanApproval.ts:282` → `engine.ts:173–179` | Live: spike 2026-11-06 08:00, and through the server (P3 deny → vault unchanged, [Arkiv](https://rabdi.explorer.arkiv.network/tx/0xc272dd7fa0e51ad5ea40c64a06cb1255bc70ad7f4546c2a8dc0c8e8708a8aa39)) · tests |
| **Expired** | Bridge `timeout`, the RP signature window passing, or an approval arriving after the intent's expiry | `humanApproval.ts:283`, `:259` · `engine.ts:180` | Unit tests (`waitForHumanApproval`, engine "approval after expiry") |
| **Cancelled** | Owner cancels on the dashboard, a revoke cancels intents in its blast radius, or app-side abort | `engine.ts` `cancel` / `onRevoke`; `humanApproval.ts:258` | Live: spike (`--cancel-after`), and owner `POST /api/approvals/:id/cancel` through the server ([Arkiv](https://rabdi.explorer.arkiv.network/tx/0x926cd6ffe99f47e3efc53db12ad2debf94e39cb32864ad5d2cc46afa8eba1128)) · tests |
| **Failed** | Any other World error, a failed verify, a replayed proof | `humanApproval.ts:285`, `:165–235` | Tests |

In every one of these the decision is recorded (Arkiv + dashboard event) and **no attestation is signed, so nothing can move.** Video: _timestamp to add_ (booth/video version shows approve and deny).

## Timeline
| When (IST) | What |
|---|---|
| 2026-11-06 ~06:00 | Read auth.world.org docs; built and tested the OIDC device-flow client (37 tests); live discovery ✓ (device grant, `client_secret_basic`, RS256; sandbox too) |
| 2026-11-06 ~07:00 | First credentials were a Developer Portal app id + API key → `invalid_client`. The OIDC portal → `account_not_eligible` (enterprise Google Workspace only) |
| 2026-11-06 ~07:20 | Switched to IDKit 4; confirmed `IDKit.request` + `pollOnce` from plain Node; built and tested the approval module (46 tests) |
| 2026-11-06 07:52 | Registered the relying party. First live run with `proof_of_human` **or** `selfie` → `feature_unavailable` |
| 2026-11-06 07:54 | **First verified approval** (Orb only, legacy allowed) |
| 2026-11-06 08:00 | Deny live (`verification_rejected`); app-side cancel live |
| 2026-11-06 (S5 live run) | Through the server's `pay` tool: P3 approved in World App → [PAID on Sepolia](https://sepolia.etherscan.io/tx/0x7b983ad5aafadce22a1fdd98da09a3710be64be673f96c39602c5663de517528) (85 s); deny → nothing moved; owner cancel → nothing moved |

## Friction (as it happened)
**Finding the right product**
- **"Agent Pass" isn't in the public docs** (auth.world.org or docs.world.org). The closest are "Human checkpoints" (OIDC step-up) and the agents "Human-in-the-loop" guide. We asked the booth which product the prize means.
- **Two "World ID" stacks that look alike, with credentials that look alike.** Our first credentials were a Developer Portal app id (`app_…`) and an API key (`api_…`, base64 of `key_…:sk_…`). The OIDC device endpoint answered `401 invalid_client` on production and sandbox. The OIDC flow needs a different client from a different portal (secret `worldidp_client_secret_…`, shown once). Neither portal points to the other. A hint in the `invalid_client` error would have saved the round trip.
- **The OIDC portal is closed to most hackers:** `{"error":"account_not_eligible"}` unless you sign in with an enterprise Google Workspace account. Teams on personal Gmail can't register a client at all.

**IDKit 4**
- **`any(proof_of_human, selfie)` fails the whole request** with `feature_unavailable` instead of falling back to the credential the user has. Selfie Check is a preview feature that must be enabled per app. We ask for Orb only.
- **A 300 s RP-signature window is tight** for a human who isn't at the screen. Our first link expired while it was being sent over chat. The approval card must show the QR instantly.
- **The relying-party setup isn't obvious from the app page:** "RP ID: Not registered" with a "Register relying party" button. The docs say to keep `rp_id` and `signing_key` but don't say where they appear.
- **Mock proofs and testing:** the docs point to staging plus the simulator, or a sandbox World App build. We tested validation with fixtures and did the real runs in production.
- **`signal_hash` semantics in v4** aren't documented (v4 examples show `"0x0"`); we inferred `hashSignal` from the SDK.

**OIDC device flow (built, unused)**
- No native action binding: `binding_message` and action terms are unsupported in the device profile. We'd have had to bind `device_code → hash(intent)` on our server.
- Device-only clients still need an exact HTTPS redirect URI at registration.
- `nonce` is omitted in device grants, so freshness relies on `auth_time` + `jti`.
- Discovery under-reports: `acr_values_supported` lists only Orb classes; `claims_supported` omits `email`.

## Missing capability
**A typed, human-readable action.** IDKit 4 binds the proof to our action and signal, so "a human approved *this intent*" is verifiable. But World App shows only our free-text `action_description`, and the human can't check that `supabrain-pay:0x…` is the 5 USDC invoice they think it is. The human trusts our dashboard for amount and payee.

**Approver binding across actions.** Nullifiers are per action, and every payment is its own action, so we can't require "the same human who approved before" without session proofs. Any verified human who sees the QR can approve. We show the QR only on the owner-authenticated dashboard.

## The single most important improvement
**Structured approvals for agent actions:** let the RP pass a typed payload (amount, token, payee, chain), have World App render it, and sign its hash into the proof. That closes "what you see isn't what you sign" for agent payments: the human would see the payment itself, and the proof would commit to exactly that, with no trust in the requesting app's UI.

Second: make the OIDC portal usable with any account, or say on its landing page that it needs Google Workspace.
