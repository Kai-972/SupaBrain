# PROGRESS: Supabrain (shared by Kai + Srijit + all 3 Claude sessions)

**Rules:**
- `git pull --rebase` before editing.
- Edit **only your own row and your own lane's sections.**
- Log entries go newest first.
- **Never write secrets here.** Names and public addresses only.
- Commit as `docs(progress): <lane> <stage/step> <result>`.
- If you hit a merge conflict here, keep both sides. It's a log.

Stage plan: `CLAUDE.md` §8. Step details: `docs/lanes/*.md`.

---

## Board

| Lane | Person | Claude | Current stage / step | Status | Blocked on |
|---|---|---|---|---|---|
| A: Brain (server, memory, Arkiv, ENS) | Kai | #1 | S0 | ⏳ not started | – |
| C: Face (dashboard, onboarding, demo) | Kai | #2 | S0 (waits for A's push) | ⏳ | A: S0 push |
| B: Money & Security (policy, vault, World) | Srijit | #3 | S0 (waits for A's push) | ⏳ | A: S0 push |

Status icons: ⏳ not started · 🔨 in progress · ✅ done · 🛑 blocked · ⚠️ fallback taken

---

## Stage checklist (tick with a proof link or commit hash)

### S0: Scaffold
- [ ] A: monorepo, config + zod, types + interfaces, fakes, guards, `.env.example`, MIT, first push
- [ ] B: pulled; Foundry init; `packages/payments` skeleton builds
- [ ] C: pulled; Next app, tokens, fixture loader, `?mock=1` banner

### S1: Spikes
- [ ] A · S1 ENS: team name + registry · agent + own resolver · `sb.memory.head` ✓ · `sb.pay.cap` revert tx · UR read-back · unregister → null · transfer revert · **handoff `ens.sepolia.json` to B**
- [ ] A · S2 Arkiv: batch ok · `$creator ≠ $owner` · queries ok · **extend-on-readonly result: ___** · watcher fires · friction logged
- [ ] A · S3 MCP: public URL · Claude Code ✓ · Claude.ai ✓ · Antigravity ✓ · bad token 401
- [ ] B · S4 World: discovery logged · approve · deny · expire/cancel
- [ ] B · S5 Vault: `forge test` green (mock registry)
- [ ] C: static graph with all encodings + list view (screenshot)

### S2: Memory core
- [ ] A: whoami/recall/remember/explain · lineage + trust tests · Arkiv batch writes · startup rebuild · ENS check per call · SSE · `/api/team` `/api/graph` `/api/memory/:key`
- [ ] B: fork test vs the real team registry · V1 review · deployed · 1-USDC pay tx · `step-kill` revert tx · `decidePayment` table tests
- [ ] C: drawer · agents rail · feed · **switched to real graph + SSE**
- [ ] **Gate:** Claude Code + Antigravity write to one graph, live in the UI

### S3: Undo ⭐ (memory-first checkpoint)
- [ ] A: dry run (+ readers) · revoke · quarantine · notices · Keep · Correct this · Add context · refs · recall log
- [ ] B: `onRevoke` (`revokeRoot`, cancel intents) · `pauseAgent`
- [ ] C: dry-run modal · cascade · Keep/Correct/Add context · ref card · before/after
- [ ] **Gate:** one full rehearsal without money (connect → write → dry run → revoke → re-ask)

### S4: Onboarding
- [ ] A: `/api/pair` · snippets · `connected` event · path-token route
- [ ] B: token design security review
- [ ] C: `/t/connect` with QR → green on connect
- [ ] **Gate:** a stranger's AI connects from the QR

### S5: Money
- [ ] A: acme vendor ENS (own resolver) · `EnsAuthority` vendor fns · `GraphView`/`ArkivWriter` · `pay`/`pay_status` mounted
- [ ] B: `createPayments` end to end
- [ ] C: payments page
- [ ] **Gate:** P1 BLOCKED (ENS mismatch) from a real client · paid tx on Etherscan

### S6: Human
- [ ] B: World approve → paid · deny/expire → nothing moved
- [ ] C: approval card
- [ ] **Gate:** both paths live

### S7: Extras (cut order applies)
- [ ] A: ENS watcher · Notion import · public "ETHMumbai brain" · `/api/advisories`
- [ ] B: restore-with-World · enroll owner sub
- [ ] C: rules · advisories · landing · mobile

### S8: Ship
- [ ] A: `seed.ts` on a fresh team · Arkiv docs · README addresses · V5 + V6
- [ ] B: SECURITY.md · WORLD_DEBRIEF.md · V3 red team
- [ ] C: DEMO_SCRIPT.md · video · README · Vercel · V2 sponsor audit
- [ ] Rehearsal 1 · Rehearsal 2 · Rehearsal 3 · **Submitted** (link: ___)

---

## Requests (cross-lane; format: `- [ ] FROM → TO: ask (time)`)
- [ ] A → B, C: S0 pushed; pull and start (fill in when done)

## Hand-offs (when a Claude account hits its limit)
<!-- ### <time> · <lane> · state / next step / open questions -->

## Asks received (names only, never values)
<!-- - <time> · <lane> · ASK <NAME>: received, validated (<public detail>) -->

---

## Log: Lane A (Brain)
<!-- newest first; format in CLAUDE.md §3.4 -->

## Log: Lane B (Money & Security)
<!-- newest first -->

## Log: Lane C (Face)
<!-- newest first -->
