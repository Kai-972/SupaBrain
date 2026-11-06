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
- **Sign in as the owner** on the demo laptop (top right: **Sign in**). The lab, the rules sheet and pairing need it.
- **Connect two real apps** from `/connect`: Claude Code as `claude`, Antigravity as `gemini`.
- **Before you present:** in **Try it**, click **Change Gemini's rules** and make sure **May write: Everything** is selected (Gemini's `sb.scope` is `*`).
- **Projector:** press **Present** in the top bar; everything gets bigger. **Tour** runs the whole pitch as a bottom presenter bar: what to say and what to click, about 4 minutes.
- **Fallbacks:**
  - `SUPABRAIN_BRAIN=<brain> pnpm demo:injection` runs the same scene against the live server.
  - `?mock=1` replays a saved snapshot behind the MOCK DATA banner.
  - Never depend on a model being fooled live.

## Script (three screens: Story, Live, Try it)
1. **Hook (Story `/`, 20 s).** "Every team here hands work between AI agents. If one of them reads a poisoned README, the next one follows it. Supabrain stops that at the handoff." The live numbers under the hero come from the server.
2. **The problem and why MCP isn't enough (Story, 30 s).** Scroll the example story (one poisoned file, three AIs), then: "MCP is the cable. ENS is who the AI is and what it may do. Arkiv is the log nobody can edit, not even us." The four gates show live counts.
3. **Real work (Live `/b/<brain>`, 40 s).**
   - The headline says it in one line: **N commits signed · N injections stopped · N blocked by ENS**.
   - In Claude Code: "build a to-do app and checkpoint." A dot lands on Claude's column (dashed while SAVING, solid on Arkiv), then a yellow **HEAD** ring when its ENS name points at it.
   - In Antigravity: "continue". A thick **continue** curve crosses from Claude to Gemini.
   - Click a column header to show that AI's ENS rules. Click a dot: the side panel shows what it says, who signed it (✓ equals the ENS address), what it built on, and the Arkiv proof.
4. **The attack (Try it `/b/<brain>/lab`, 50 s).**
   - **1 Who acts?** Gemini. **2 What does it do?** Attacks → **Poisoned README** (a judge can edit the text, or pick **Write your own**). **3 Send as Gemini.**
   - The four gates light up in order and stop at **Content**: **STOPPED · INJECTION**, with the excerpt and the Arkiv revocation link.
   - Underneath, **What Claude reads now** runs a real `continue` as Claude: **✓ NOT RECEIVED**.
5. **The ENS limit (Try it, 40 s).**
   - **Change Gemini's rules → May write: Only docs/ → Write to ENS.** The sheet shows Writing to ENS → Confirmed on Sepolia (tx) → Read back.
   - Attacks → **Write outside scope** → Send: the gates stop at **ENS rules**: **BLOCKED BY ENS · sb.scope**.
   - Then **Sneak past the tripwire**: the wording may pass the content check, but the CI file is still blocked. "Detection can miss. The ENS rule doesn't."
6. **Proof (More → Verify, 30 s).** **ENS ⇄ Arkiv heads ✓ MATCH**, plus the `pnpm verify:memory <key>` command.
7. **Close (20 s).** "Supermemory makes AIs remember. Supabrain makes what they hand each other accountable: signed by the AI that wrote it, ruled by ENS, checkable on Arkiv."

## After the demo
In **Try it**, **Change Gemini's rules → May write: Everything → Write to ENS**, so the next run starts clean.

## Q&A pointers
- **"Isn't it just regex?"** The content check is a tripwire, and we say so on `/verify`. The guarantees are the ENS rules (identity, status, scope, writes per day) and the signed record. Show "Sneak past the tripwire".
- **"Why ENS?"** `/brains`: ten projects, each its own ENSv2 subname registry, and thirty AI names, each with its own resolver and records. `/b/<brain>/rules`: rules are public records; a change is a Sepolia tx.
- **"Why Arkiv?"** The side panel's signer check and Arkiv link, revocations instead of deletes, and data that expires with the project.
