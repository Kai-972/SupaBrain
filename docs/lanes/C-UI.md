# Lane C: Face (Kai, Claude #2): dashboard, onboarding, demo visuals

**You own:** `apps/web`, `docs/DEMO_SCRIPT.md`, the `README.md` structure and visuals, and the video.
**You consume:** the dashboard API + SSE (CLAUDE.md §6.4) and the shared types from `packages/shared` (import them; never redefine them).
**Rule:** build everything against `apps/web/fixtures/demo.json` first. Switch to the real API per screen only when Lane A marks the endpoint done in `PROGRESS.md`.

---

## 1. What the UI must make obvious, in 5 seconds from a judge's seat

1. Several AIs from different companies share **one** memory, and you can see who wrote what.
2. Every memory has a source. You can trace why an AI believes something.
3. One click shows how far a wrong fact spread (the **blast radius**), and one click takes it back: red spreads, good things stay green.
4. Each AI is an **ENS name** with rules. Money only moves on clean facts, and a human approves risky payments.

**Design intent:**
- An **incident console crossed with a git graph**: calm by default, dramatic only on revoke.
- Dark-first, with a light theme.
- The graph is the hero; everything else supports it.

---

## 2. Design system

**Stack:** Next.js App Router, Tailwind, shadcn/ui, `@xyflow/react` + `@dagrejs/dagre`, `lucide-react`, `qrcode.react`, `zustand` (one store). Optional: `framer-motion` for the cascade; CSS transitions are fine. No other UI dependencies without a reason.

**Fonts** (Google Fonts): Inter for UI, JetBrains Mono for keys, addresses, ENS names and code snippets.

**Color tokens** (CSS variables on `:root`; dark values first; define a light theme too):

| Token | Use |
|---|---|
| `--bg` `--panel` `--panel-2` `--border` `--text` `--muted` | Base surfaces |
| `--accent` | The **one** "look here" color: focus ring, primary button, selected node |
| `--danger` | **Only** for quarantined and blocked |
| `--warn` | Stale, pending human, expiring soon |
| `--ok` | Paid, restored, connected |
| Vendor tints: `--v-claude` `--v-gemini` `--v-openai` `--v-human` | Small badge only, **always with a letter** (C / G / O / H) |

**Never rely on color alone:** every status chip has text.

### Visual encodings (memory node)

| Property | Encoding |
|---|---|
| Trust 3 (human) | Solid filled node |
| Trust 2 (agent) | Outlined node |
| Trust 1 (evidence / outside) | Dashed outline + a source icon (mail / globe / file / Notion / GitHub) |
| Status `active` | Neutral |
| Status `quarantined` | Red fill, strike-through text, "QUARANTINED" chip |
| Status `stale` | Amber outline, "stale source" chip |
| Status `expired` | Ghost: 30% opacity, dotted, "expired" (still shown so the lineage reads) |
| Status `restored` | Green flash, then neutral |
| `pending` (not yet on chain) | Small "⛓ pending" tag; becomes a ⛓ link when `confirmed` |
| Vendor | Corner badge with a letter |
| Expiry | A thin ring that drains as `expiresAt` nears. "Kept" shows a pin icon |
| `ref` (private pointer) | Lock icon + label; the tooltip says "private: open with your own access" |
| `kind=address` | Mono address with ENS name if known; mismatch shown with ✗ |

- **Edges:** parent → child arrows. On revoke, tainted edges turn red in sequence.
- **Agent chip:** `gem-research.<team>.eth` (mono), with a status dot, a lease countdown and a vendor badge.

---

## 3. Screens (routes)

### 3.1 `/t`: team brain (hero; build first)
Layout: a three-column desktop grid with a bottom feed.

- **Left: agents rail** (one card per `AgentView`):
  - ENS name, vendor badge, role, scope.
  - Caps: "pay cap 4 USDC · daily 30", labelled **"from ENS"**.
  - Lease countdown.
  - Status: active / quarantined / unregistered / expired. Plus "connected via Antigravity" when a `connected` event arrived.
  - Last write time.
  - Actions: **Copy connect prompt** (goes to `/t/connect?agent=`) and **Revoke agent** (dry run with `target.type=agent`).
- **Center: lineage graph:**
  - dagre layout, left to right by `seq`.
  - Pan/zoom, and fit-to-view on load.
  - **Focus mode:** clicking a node dims everything except its ancestors and descendants.
  - **Filters:** folder, vendor, trust, status.
  - A **list-view toggle** (a table of memories). This doubles as the fallback if the graph misbehaves and as the accessible view.
- **Right: node drawer** (opens on click):
  - text, kind, folder, trust (with reason: "trust 1 because it came from email:acme-0611");
  - author agent + `$creator` wallet + vendor;
  - created time, expires in (countdown), and Keep;
  - **Parents / Children** (clickable);
  - **Readers** ("read by lead-claude, gpt-writer");
  - Arkiv proof link;
  - if `ref`: a lock card with the label and locator, and "Open (needs access)" if it's a URL.
  - **Buttons:**
    - **Why does my AI believe this?** highlights the lineage path to the roots (`GET /api/memory/:key` → `lineage`).
    - **This is wrong** opens the dry-run modal for this memory's root source, or the memory itself. Let the user pick the scope.
    - **Correct this** opens a text field; submitting calls `POST /api/memory/:key/correct`.
    - **Keep** offers 7 / 30 days and calls `POST /api/memory/:key/keep`. It's disabled when quarantined, with the reason shown.
- **Bottom: live feed** (newest first): memory written, confirmed, connected, revocation, notice delivered, payment decision, approval, kept, expired. Each item is clickable and focuses the node.
- **Top bar:**
  - team name;
  - counts ("12 memories · 3 agents · 3 vendors");
  - **Add context** (a human fact: text, folder, optional subject / ref → `POST /api/memory/human`);
  - admin login state;
  - theme toggle;
  - "MOCK DATA" banner in mock mode.

### 3.2 Dry-run modal: the money moment
- **Headline:** "**1 source · 6 memories · 3 agents · 3 vendors · read by 3 · 0 pending payments**".
- A mini-graph with the affected nodes in red and untouched ones grey. Also a list grouped by agent.
- A scope selector: source / agent / memory.
- A big **Revoke** button (admin).
- **After the click,** a step list, each item spinner → ✓ with a proof link (from the revoke response + SSE):
  1. Arkiv revocation ✓ (link)
  2. Vault root revoked ✓ (Etherscan), or "skipped: payments not enabled", or a red "retry"
  3. Pending payments cancelled ✓
  4. Notices sent to N agents ✓
- **Then the cascade animation** on the main graph: BFS from the root, about **120 ms per hop**. Nodes turn red, shake once, then dim, and edges turn red. Untouched nodes stay put. A soft sound is optional, off by default, behind a mute toggle.

### 3.3 Before/After panel (a slide-over from the top bar, "Before / After")
- Pick an agent and a query (e.g. gem-research, "Acme wallet").
- Two columns show the **recall results** for that query before and after the revoke (`GET /api/recall-log`):
  - **Before:** "0xBAD… (active, from email)".
  - **After:** "0xBAD… QUARANTINED, retraction delivered" plus "acme.<team>.eth → 0x9F2… (ENS)".
- Our server can't see the AI's prose answer. Label the panel honestly as **"what the AI was given"**, and show the real AI answer live on screen in Antigravity during the demo.

### 3.4 `/t/connect`: onboarding (Stage S4; Kai wants this to feel great)
1. **Step 1:** pick the agent identity (admin) or arrive with `?code=` from the QR.
2. **Step 2:** pick a client: tiles for Claude Code, Claude app, Antigravity (Gemini) and Gemini CLI. ChatGPT is greyed out as "soon".
3. **Step 3:** the exact snippet, with a one-click copy, then the copy prompt with its own copy button. Show the QR code (`qrPayload`) large, for a phone or a second laptop.
4. **Step 4:** a big **"Waiting for your AI…"** pulse. It turns green on the SSE `connected` event for that agent: "gem-research is connected via Antigravity. Say hello."
- **Notes per client** (small print): "Claude app Free plan allows 1 custom connector". "Gemini consumer app isn't available in India yet; use Antigravity".
- On mobile, steps are stacked and the copy buttons are big.

### 3.5 `/t/payments` (Stage S5–S6)
- A table of intents with columns: time, agent, payee (ENS name + mono address), amount, status chip, reasons.
- **Blocked** row: reason chips (`ENS MISMATCH`, `OUTSIDE CONTENT`, `NEW PAYEE`…). Expanding it shows the path "payee → memory → source" with a "show in graph" link.
- **Paid** row: Etherscan link.
- **Pending human** row: the **approval card**:
  - a big user code;
  - a QR of `verificationUriComplete`;
  - the intent summary: "lead-claude wants to pay acme.<team>.eth (0x9F2…) 5 USDC. Needs a human because: OVER CAP (cap 4)";
  - a countdown and a **Cancel** button.
  - On SSE it flips to **APPROVED → PAID** or **DENIED / EXPIRED: nothing moved**.

### 3.6 `/t/rules`
- A read-only role table (Owner / Lead / Worker / Observer: what each can write and pay), with each agent's live records.
- The heading says **"Enforced by ENS (read live)"**, with links to the Etherscan resolver for each agent.
- Include one proof row: "gem-research tried to raise its own pay cap → reverted (tx)".

### 3.7 `/advisories` (public, stretch)
- Search "is this payee / source revoked?". It reads live from Arkiv through `GET /api/advisories`.
- Show the runnable query snippet from the README.

### 3.8 `/`: landing
- One sentence: "A shared memory for your AIs that knows where every fact came from, and can take a wrong one back."
- A 10–15 s looping cascade visual (reuse the graph with fixture data, autoplay).
- Two buttons: **Open demo team** and **Connect your AI**.

---

## 4. Interaction rules
- **Optimistic UI:** show writes at once with "⛓ pending"; confirm on SSE `confirmed`. Never block on a chain.
- **SSE:** reconnect with `?since=<lastSeq>`. One `zustand` store holds `{nodes, edges, agents, payments, approvals, feed, seq}`, and events patch it (`applyEvent(e)`).
- **Errors:**
  - A write that fails on chain gets a retry badge.
  - An ENS read failure shows the agent as "authority unknown: writes paused" (fail closed).
  - A server disconnect shows a top banner "reconnecting…".
- **Empty state:** "No memories yet. Connect an AI →" links to `/t/connect`.
- **Admin:** the passphrase dialog sets a cookie through `POST /api/admin/login`. Admin-only buttons show a lock until you log in.
- **Mobile:** the rail and the feed become tabs, the drawer becomes a bottom sheet, and the graph is pannable. A judge's phone needs only `/t/connect` and a read-only `/t`.
- **Accessibility:** text for every status, focus rings, keyboard navigation in the list view, and contrast at least WCAG AA in both themes.

---

## 5. Fixture: `apps/web/fixtures/demo.json` (the "bank details changed" story)

Times are **offsets in seconds**. The loader rebases them to `Date.now()`. Mock mode plays `timeline` with these delays through the same `applyEvent` the real SSE uses.

```jsonc
{
  "team": { "id": "team1", "displayName": "Demo Team", "ensRoot": "demo.eth" },
  "agents": [
    { "label": "owner",        "ens": "owner.demo.eth",        "vendor": "human",  "role": "owner",  "scope": "*",        "payCap": "-", "payDaily": "-" },
    { "label": "lead-claude",  "ens": "lead-claude.demo.eth",  "vendor": "claude", "role": "lead",   "scope": "*",        "payCap": "4", "payDaily": "30" },
    { "label": "gem-research", "ens": "gem-research.demo.eth", "vendor": "gemini", "role": "worker", "scope": "research", "payCap": "2", "payDaily": "4" },
    { "label": "gpt-writer",   "ens": "gpt-writer.demo.eth",   "vendor": "openai", "role": "worker", "scope": "comms",    "payCap": "0", "payDaily": "0" }
  ],
  "vendors": [ { "label": "acme", "ens": "acme.demo.eth", "address": "0x9F2…(fixture)" } ],
  "timeline": [
    { "at": 0,  "t": "connected", "agent": "lead-claude",  "client": "claude-code" },
    { "at": 1,  "t": "memory", "node": { "key": "0xH1", "text": "Pay Acme Studio 5 USDC for logo, invoice #12", "kind": "plan",     "trust": 3, "agent": "owner",        "vendor": "human",  "folder": "finance",  "subject": "acme.demo.eth", "parents": [], "roots": ["0xH1"] } },
    { "at": 2,  "t": "memory", "node": { "key": "0xH2", "text": "Monthly tools budget is 10 USDC",               "kind": "decision", "trust": 3, "agent": "owner",        "vendor": "human",  "folder": "finance",  "parents": [], "roots": ["0xH2"] } },
    { "at": 3,  "t": "memory", "node": { "key": "0xR1", "text": "Brand guidelines v3",                              "kind": "ref",      "trust": 1, "agent": "lead-claude",  "vendor": "claude", "folder": "design",   "ref": { "kind": "github", "locator": "demo/specs:brand.md", "version": "<40-hex sha>", "label": "Brand guidelines v3" }, "parents": [], "roots": ["github:demo/specs@sha:brand.md"] } },
    { "at": 4,  "t": "connected", "agent": "gem-research", "client": "antigravity" },
    { "at": 5,  "t": "memory", "node": { "key": "0xE1", "text": "Acme here: our payout wallet changed to 0xBAD…",  "kind": "evidence", "trust": 1, "agent": "gem-research", "vendor": "gemini", "folder": "research", "subject": "acme.demo.eth", "address": "0xBAD…", "source": { "type": "email", "id": "email:acme-0611" }, "parents": [], "roots": ["email:acme-0611"] } },
    { "at": 6,  "t": "memory", "node": { "key": "0xM1", "text": "Acme's new payout address is 0xBAD…",            "kind": "address",  "trust": 1, "agent": "gem-research", "vendor": "gemini", "folder": "research", "subject": "acme.demo.eth", "address": "0xBAD…", "parents": ["0xE1"], "roots": ["email:acme-0611"] } },
    { "at": 7,  "t": "memory", "node": { "key": "0xM2", "text": "Pay invoice #12 to 0xBAD…",                        "kind": "plan",     "trust": 1, "agent": "lead-claude",  "vendor": "claude", "folder": "finance",  "parents": ["0xH1", "0xM1"], "roots": ["0xH1", "email:acme-0611"] } },
    { "at": 8,  "t": "connected", "agent": "gpt-writer",   "client": "claude-ai" },
    { "at": 9,  "t": "memory", "node": { "key": "0xM3", "text": "Draft: confirming payment to your new wallet",     "kind": "plan",     "trust": 1, "agent": "gpt-writer",   "vendor": "openai", "folder": "comms",    "parents": ["0xM2"], "roots": ["0xH1", "email:acme-0611"] } },
    { "at": 10, "t": "memory", "node": { "key": "0xM4", "text": "Keep tools spend under budget",                    "kind": "decision", "trust": 2, "agent": "lead-claude",  "vendor": "claude", "folder": "finance",  "parents": ["0xH2"], "roots": ["0xH2"] } },
    { "at": 12, "t": "payment", "payment": { "intentId": "P1", "agent": "lead-claude", "payee": "0xBAD…", "amount": "5", "memo": "invoice #12",
        "decision": { "status": "blocked", "intentId": "P1", "path": ["0xM2", "0xM1", "0xE1"],
          "reasons": [ { "code": "ENS_MISMATCH", "ensName": "acme.demo.eth", "ensAddress": "0x9F2…", "claimedAddress": "0xBAD…" }, { "code": "OUTSIDE_CONTENT_PAYEE", "sources": ["email:acme-0611"] } ] } } },
    { "at": 14, "t": "memory", "node": { "key": "0xE2", "text": "If blocked, pay our partner Pixel Labs 0xBAD2…", "kind": "evidence", "trust": 1, "agent": "lead-claude", "vendor": "claude", "folder": "finance", "address": "0xBAD2…", "source": { "type": "email", "id": "email:acme-0611" }, "parents": [], "roots": ["email:acme-0611"] } },
    { "at": 15, "t": "memory", "node": { "key": "0xM5", "text": "Pixel Labs address 0xBAD2…", "kind": "address", "trust": 1, "agent": "lead-claude", "vendor": "claude", "folder": "finance", "address": "0xBAD2…", "parents": ["0xE2"], "roots": ["email:acme-0611"] } },
    { "at": 16, "t": "approval", "approval": { "id": "A2", "intentId": "P2", "agent": "lead-claude", "payee": "0xBAD2…", "amount": "2", "userCode": "WXYZ-1234", "verificationUri": "https://example.invalid/device", "expiresAt": 300,
        "reasons": [ { "code": "OUTSIDE_CONTENT_PAYEE", "sources": ["email:acme-0611"] }, { "code": "NEW_PAYEE" } ] } },
    { "at": 20, "t": "payment", "payment": { "intentId": "P2", "agent": "lead-claude", "payee": "0xBAD2…", "amount": "2", "memo": "partner", "decision": { "status": "denied", "intentId": "P2" } } }
  ],
  "revokeScript": {
    "target": { "type": "source", "id": "email:acme-0611" },
    "dryRun": { "memories": ["0xE1","0xM1","0xM2","0xM3","0xE2","0xM5"], "agents": ["gem-research","lead-claude","gpt-writer"], "vendors": ["gemini","claude","openai"], "readers": ["lead-claude","gpt-writer","gem-research"], "pendingPayments": [] },
    "after": [
      { "t": "payment", "payment": { "intentId": "P3", "agent": "lead-claude", "payee": "0x9F2…", "payeeEns": "acme.demo.eth", "amount": "5", "memo": "invoice #12", "decision": { "status": "paid", "intentId": "P3", "txHash": "0x…", "txUrl": "https://example.invalid/tx" } } }
    ]
  }
}
```

**Fixture invariants (test these):** after the revoke, `0xH1`, `0xH2`, `0xM4` and `0xR1` stay active, and the six listed memories are quarantined. In mock mode the dry run, revoke and the later payment are computed from `revokeScript`.

---

## 6. API mapping (real mode)

| UI | Endpoint |
|---|---|
| Initial load | `GET /api/team`, `GET /api/graph?since=0`, then `GET /api/stream?since=<seq>` |
| Drawer | `GET /api/memory/:key` |
| Add context / Correct / Keep | `POST /api/memory/human`, `POST /api/memory/:key/correct`, `POST /api/memory/:key/keep` |
| Dry run / Revoke | `POST /api/dryrun`, `POST /api/revoke` |
| Before/After | `GET /api/recall-log?agent=&q=` |
| Connect | `POST /api/pair`, then watch SSE `connected` |
| Payments | `GET /api/payments`, `GET /api/approvals`, `POST /api/approvals/:id/cancel` |
| Advisories | `GET /api/advisories` |

Put all endpoints in one `lib/api.ts`, with the base URL from `NEXT_PUBLIC_SERVER_URL` (public, not secret). Never call Arkiv, ENS or chains from the browser for data; read through the server. The only exception is an optional owner-wallet "unregister" button (stretch), which sends a tx from the browser wallet.

---

## 7. Your stages (match CLAUDE.md §8; `/log` after each step)

| Stage | Steps | Done when |
|---|---|---|
| **S0** | Pull. Create the Next.js app in `apps/web`, Tailwind + shadcn + fonts + color tokens (dark/light), the `zustand` store with `applyEvent`, the fixture loader + timeline player, the `?mock=1` switch + MOCK banner | `pnpm dev` shows an empty `/t` with the banner |
| **S1** | Static graph from the fixture with **every encoding in §2**, dagre layout, filters, list view, fit-to-view | Screenshot posted in PROGRESS; all statuses visible with text |
| **S2** | Node drawer (including "why" path highlight), agents rail, live feed playing the timeline. **Then switch to the real** `/api/graph` + SSE when A says S2 is done | Real memories from Claude Code + Antigravity appear live |
| **S3** ⭐ | Dry-run modal, revoke steps, **cascade animation**, Correct this, Keep (countdown ring + pin), Add context, `ref` lock card, before/after panel. Fixture first, then real | The memory-first demo runs end to end on real data |
| **S4** | `/t/connect` (4 steps, QR, snippets, waiting → connected) | A second laptop connects from the QR, and the page turns green |
| **S5** | `/t/payments` table, blocked row with reason chips + path, paid row with Etherscan | P1 blocked shows correctly from real data |
| **S6** | Approval card (code, QR, summary, countdown, cancel); flips on SSE | Approve and deny both render live |
| **S7** | `/t/rules`, `/advisories`, `/` landing loop, mobile pass, sound toggle, polish | Mobile check on a real phone |
| **S8** | `docs/DEMO_SCRIPT.md` (from CLAUDE.md §9, with exact clicks and fallbacks), video ≤ 4 min showing each sponsor on screen, README structure + screenshots, Vercel deploy, V2 sponsor audit | Three rehearsals done |

**Polish checklist before the demo:**
- Readable at projector distance (minimum 14 px text; graph labels truncated with a tooltip).
- The cascade is visible at a glance.
- Proof links open in a new tab.
- No console errors.
- Mock banner off in real mode.
