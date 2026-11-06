# Demo script (about 4 minutes)

Positioning and copy: `docs/FRONTEND_CONTENT.md`. Every screen below reads the live server; nothing is scripted except the landing page's scroll story, which is labelled "example".

## Before you start
- **Server:** demo on `otter`, test on `maple`:
  ```
  SUPABRAIN_APP_NAMESPACE=supabrain-mumbai26 SUPABRAIN_BRAIN=otter pnpm --filter @supabrain/server start
  ```
- **Website:**
  ```
  pnpm --filter @supabrain/web dev
  ```
  `apps/web/.env.local` must have `NEXT_PUBLIC_SERVER_URL` pointing at the server.
- **Sign in as the owner** on the demo laptop (top right: **Owner sign-in**). The lab, the rules strip and pairing need it.
- **Connect two real apps** from `/connect`: Claude Code as `claude`, Antigravity as `gemini`.
- **Before you present:** in the attack lab, open the rules strip and make sure Gemini's `sb.scope` is `*`. The **Reset rules** button appears after any change.
- **Projector:** turn on **Aa** (projector size) in the top bar. `?present=1` on the lab pins each outcome for 6 s.
- **Fallbacks:**
  - `SUPABRAIN_BRAIN=<brain> pnpm demo:injection` runs the same scene against the live server.
  - `?mock=1` replays a saved snapshot behind the MOCK DATA banner.
  - Never depend on a model being fooled live.

## Script
1. **Hook (landing `/`, 20 s).** "Every team here hands work between AI agents. If one of them reads a poisoned README, the next one follows it. Supabrain stops that at the handoff." Point at the **Live right now** strip; every number there is from the server.
2. **Why not just MCP (landing, "Why MCP isn't enough", 20 s).** "MCP is the cable. ENS is who the AI is and what it may do. Arkiv is the log nobody can edit, not even us." Scroll to **Fig. 4**, the four gates, with live counts.
3. **Real work (`/b/<brain>`, 40 s).**
   - In Claude Code: "build a to-do app and checkpoint." The commit appears on Claude's lane, dashed while SAVING, then solid. The HEAD ring arrives with the Sepolia link.
   - In Antigravity: "continue". The **continue** edge crosses from Claude's lane to Gemini's.
4. **The attack (`/b/<brain>/lab`, 50 s).**
   - In the Gemini console, choose **Attack → Poisoned README** (or let a judge type their own). Send.
   - **STOPPED · INJECTION · instruction-override** appears in red, with the excerpt and the Arkiv revocation link.
   - The callout runs a live `continue` as Claude and shows **✓ NOT IN WHAT CLAUDE READS**.
5. **The ENS limit (lab, 40 s).**
   - On the rules strip, set Gemini's `sb.scope` to `docs/` and click **Write to ENS**. "Writing to ENS…", then the Sepolia tx, then the read-back.
   - **Attack → Write outside scope** gives **BLOCKED BY ENS · sb.scope**.
   - Then **Sneak past the tripwire**: the wording may pass the content check, but the CI file is still blocked. "Detection can miss. The ENS rule doesn't."
6. **Proof (`/verify`, 30 s).**
   - Back on the graph, click a commit. The drawer shows signer = ENS ADDRESS, the Arkiv entity link and the lineage.
   - `/verify` shows **ENS ⇄ Arkiv heads ✓ MATCH**, plus the `pnpm verify:memory <key>` command.
7. **Close (20 s).** "Supermemory makes AIs remember. Supabrain makes what they hand each other accountable: signed by the AI that wrote it, ruled by ENS, checkable on Arkiv."

## After the demo
Click **Reset rules** in the lab (or set Gemini's `sb.scope` back to `*`), so the next run starts clean.

## Q&A pointers
- **"Isn't it just regex?"** The content check is a tripwire, and we say so on `/verify`. The guarantees are the ENS rules (identity, status, scope, writes per day) and the signed record. Show "Sneak past the tripwire".
- **"Why ENS?"** `/brains`: ten projects, each its own ENSv2 subname registry, and thirty AI names, each with its own resolver and records. `/b/<brain>/rules`: rules are public records; a change is a Sepolia tx.
- **"Why Arkiv?"** The drawer's signer and Arkiv links, revocations instead of deletes, and data that expires with the project.
