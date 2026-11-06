# Supabrain: what we're building, in plain words

> **v2:** current plan: [`docs/PLAN.md`](PLAN.md). The product is now "GitHub for your AIs' memory"; this page describes the v1 idea, which lives on as the safety layer.

ETHGlobal Mumbai · Nov 5–7, 2026 · Kai + Srijit
This merges Kai's memory/undo plan with Srijit's `PROJECT.md` and `CLAUDE.md`.

**Confirmed by Kai (Nov 6, 03:22):**
- Memory first; money is the second pillar.
- Sponsors: ENS + Arkiv + World.
- Kai owns ENS, memory and UI. Srijit owns payments, vault, World and security.
- Memories live 2 days unless kept.
- Private content goes behind pointers.
- Notion is the off-chain integration.

Items still marked **(confirm)** are defaults from `docs/DECISIONS.md`.

---

## 1. In one line

**A shared memory for your team's AIs that remembers where every fact came from. When a fact turns out to be wrong, you take it back from every AI at once, and no money moves on a lie.**

---

## 2. The idea

You code with Claude, your teammate researches with Gemini, and someone writes emails with ChatGPT. Each AI used to have its own memory. Now they're starting to share one: Notion launched exactly that on Nov 4. That's useful until a wrong fact gets in, because then every AI believes it.

Supabrain works like **git for that shared memory**:

- **Every memory is like a commit.** It records which AI wrote it, which company that AI comes from, and its **parents**: the memories the AI read before writing it. Our server records this, so the AI can't fake it.
- **You can see the history.** A graph shows who learned what, and where they got it.
- **You can revert a bad source.** Mark it wrong, and everything built on it is pulled back from every AI. This is not a rollback: good work stays, and only the bad branch goes.

Two things make it more than a notes app:

- **Names and rules (ENS).** Each AI gets a name like `gem-research.ourteam.eth`. The name says what that AI may write and how much it may spend. Delete the name and the AI is out, including on chain.
- **Money.** When an AI tries to pay someone, we check where it got the address. An address that came from an email or a web page can't move money on its own.

---

## 3. The story we tell

> An email arrives: *"Hi, it's Acme, our wallet changed, please pay the new address."*
> Gemini saves it. Claude plans the payment with it. ChatGPT writes the confirmation.
> One fake email, and three AIs from three companies all believe it.

This is the oldest scam in business, the "bank details changed" email. It cost US businesses over $3B in 2025 (FBI IC3). It works even better on AI, because AI doesn't get suspicious.

With Supabrain:
- **Claude's payment is blocked.** The address came from an email, and Acme's own ENS name says something different.
- **We click the email and choose "This is wrong."** Everything built on it goes red across all three AIs.
- **The next time anyone asks, every AI gives the right answer.**

---

## 4. How someone uses it

1. **Create a team.** The owner gets `ourteam.eth`. Each AI gets a subname with a role, the folder it may write to, and a spending cap.
2. **Connect any AI in one step.** The `/connect` page shows a QR code and the exact line to paste for Claude Code, the Claude app, Antigravity (Gemini) and Gemini CLI. The AI replies: *"I'm gem-research.ourteam.eth. I can write to research."* The page turns green.
3. **Work normally.** AIs check the memory before answering and save what they learn. Humans can add facts from the dashboard with **Add context**; human facts get the highest trust.
4. **See everything.** The graph shows each memory, which AI wrote it, from which company, how much it's trusted, and what it was based on.
5. **Fix a mistake.** Click a memory and choose **This is wrong**. You see the blast radius first ("1 email · 6 memories · 3 AIs · 3 companies"), then click **Revoke**. Or use **Correct this**, which revokes the old fact and saves the right one in one step **(confirm)**.
6. **AIs fix themselves.** The next time an affected AI calls us, it gets a retraction notice, drops the fact and re-answers.
7. **Pay safely.** An AI calls `pay`:
   - Clean lineage and a known vendor: **paid**.
   - Address from outside content, or it disagrees with the vendor's ENS: **blocked**.
   - New payee or over the cap: **a human approves on their phone** (World ID).
8. **Kill an AI.** Unregister its ENS name. It can't write and it can't spend; the vault itself checks on chain.
9. **Undo the undo.** If a revoke was too broad, restore a single memory. Anything about money needs a human.

---

## 5. What each piece does

| Piece | What it does for the user | What breaks without it |
|---|---|---|
| **MCP server** | One URL that every AI connects to: Claude, Gemini, ChatGPT | Nothing connects |
| **ENSv2** | Each AI is a name with a role, a folder, a spending cap and a lease. Vendors own their own payout address on their name, so only Acme can change where Acme gets paid. Unregister the name and the AI stops, on chain | No identity, no rules, no kill switch. Payee addresses fall back to whatever an email said |
| **Arkiv** | Every memory, link, revocation and payment decision is stored there, **signed by the AI that wrote it**. Memories expire unless kept. Revocations are public, so anyone can check them | "Trust our database." Nobody else can verify who wrote what, or what was revoked |
| **World ID Agent Pass** (3rd pick, confirmed) | A real human approves risky payments on their phone. Deny means nothing moves | "A human approved" is just a button anyone could click |
| **BrainVault** (Sepolia, test USDC) | The money lives in a contract. It pays only if the AI's ENS name is alive, the policy signed off, and no source is revoked | A hacked server could pay anyone |

---

## 6. The two questions Arkiv asked

### "Use Arkiv's features, like expiry"

Memory should fade unless it earns its place.

| Thing | How long it lives | Why |
|---|---|---|
| A memory | **2 days by default** (team setting) | During a hackathon or sprint, most context is short-lived |
| A kept memory | Extended when a human clicks **Keep** | Important facts stay; the rest disappears |
| A quarantined memory | **Never extended**, so it expires on its own | Lies die on their own |
| A revocation | The maximum (~182 days), always longer than anything it revokes | The "this was wrong" record must outlive the lie, so it can't come back |
| A payment request | 15 minutes | A stale approval can't be used later |
| Outside evidence (an email, a web page) | 2 days, then shown as "stale" | Old evidence is flagged, not trusted forever |

Details we must handle:
- If a parent memory expires but its child was kept, the child still remembers its roots, so a revoke still works. The graph shows the expired parent as a faded ghost.
- **To verify in the Arkiv spike:** can the owner extend a memory that's marked `readonly`? If not, either drop `readonly` on memories, or have **Keep** create a fresh copy linked to the old one. Either way, log it in `friction.md`.

### "Arkiv is public, so what about confidential data?"

**Confidential content never goes on Arkiv. The memory only points to it.**

- The private thing lives where it already lives: a **private GitHub repo** or a **Notion page**. Notion is our off-chain integration.
- The memory on Arkiv holds a short, non-secret label plus a pointer, e.g. `github:ourteam/specs@<commit>:pricing.md`. Pinning the commit means the pointer always refers to exactly that version.
- An AI that has access (through its own GitHub connection) can open the pointer. One without access sees only the label. Our server never holds the private content.
- **Lineage still works.** If an AI reads the private doc and builds on it, that link is recorded. If the doc turns out wrong, revoking it pulls back everything built on it, without the doc ever touching the chain.
- **Honest catch:** the pointer and label are public. Labels must not contain secrets; use opaque names if needed.

---

## 7. The rules

**Trust levels.** A memory is only as trusted as its weakest parent. Only a human can raise trust.
- **Human (3):** a person typed or approved it, in the dashboard only.
- **Agent (2):** an AI concluded it from trusted things.
- **Evidence (1):** it touched outside content (an email, the web, a file, a tool result), or was built on something that did.

**The one rule that protects money:** outside content can **inform** an AI but can never **authorize** a payment. Only a human or the payee's own ENS record can.

**Roles**, stored in ENS and checked on every call:

| Role | Can do |
|---|---|
| Owner (human) | Everything: set rules, revoke, restore, approve, kill |
| Lead AI | Write anywhere; pay up to its cap |
| Worker AI | Write only in its folder; pay only up to its cap (can be 0) |
| Observer AI | Read only (its writes become 24h proposals; stretch) |

---

## 8. What's in the MVP and what's later

**Stage 1. The core loop. It must work end to end before anything else.**
- Connect Claude Code, the Claude app and Antigravity to one URL.
- `whoami`, `recall`, `remember`, `explain`, with lineage and trust.
- Everything stored on Arkiv, signed by each AI's wallet, with expiry.
- Graph, dry run, revoke, red cascade, retraction notices, before/after answer.
- Each AI checked against its ENS name on every call.

This alone is a complete product.

**Stage 2. Money and humans (Srijit's lane, in parallel).**
- `pay` with the payee check (ENS mismatch blocks it).
- BrainVault on Sepolia with test USDC, plus the on-chain kill.
- World approve and deny.

**Stage 3. Polish.**
- Keep/extend button, private pointers, Correct this, the payments page, mobile.

**Later (on hold; mention in one line if asked):**
- **GitHub-style public memory.** A team publishes a branch of its memory that others can pull. The public "is this source revoked?" lookup is the first step.
- Importing Notion memories as revocable roots.
- AIs signing their own lineage.
- Real OAuth instead of pairing tokens.

**Optional Reach idea for Arkiv (confirm):** a public **"ETHMumbai brain"** that any hacker's AI can join at the venue. It shares event facts (deadlines, booth times, sponsor tips), and we show a real revoke when something changes. All of it is public anyway, and it's real usage for `reach.md`.

---

## 9. Honest limits (say these when asked)

- **Undo works on the shared memory.** ChatGPT and Claude also keep their own private memories, which we can't erase. What we do: send a retraction to every AI that read the fact, and show who read it.
- **Our server holds the AIs' keys** (disclosed). The owner's key and the vault limits are never on the server, and the server can only tighten the vault, never loosen it.
- **This would not have stopped the Binance hack** (Oct 29), which was malware on an engineer's laptop. We took its lesson: put the check at the money, not in a workflow someone can skip.
- **Testnets, synthetic demo data, test USDC.**

---

## 10. The pitch (spoken, about 3 minutes)

> Quick question: how many of you use more than one AI?
>
> Most teams do now. Claude in the editor, Gemini for research, ChatGPT for emails. And this week Notion launched a way for all of them to share one memory. That's where this is going: your AIs will share what they know.
>
> There's a catch. When they share memory, they also share mistakes.
>
> Picture this. An email comes in: "Hi, it's Acme, our wallet changed, please pay the new address." Gemini saves it. Claude plans the payment. ChatGPT writes the confirmation. One fake email, and three AIs from three different companies believe it. That's the oldest scam in business. It cost US companies over three billion dollars last year, and it works even better on AI, because AI doesn't get suspicious.
>
> So we built Supabrain. It's a shared memory for your AIs that works like git: every memory knows which AI wrote it and what it was based on.
>
> Let me show you. *[demo]* I've been working in Claude Code. Now I open Gemini and paste one line. It already knows who it is (gem-research dot ourteam dot eth, allowed to write research) and it already knows what Claude knows.
>
> Here's the email spreading. One source, three AIs.
>
> Claude tries to pay Acme. Blocked. The email says one address. Acme's own ENS name says another. Only Acme can change where Acme gets paid, so a stranger's email can't.
>
> Now I fix the actual problem. I click the email: "This is wrong." Before anything happens, it shows me the blast radius: one email, six memories, three AIs, three companies. Revoke. Everything that came from that email turns red. Our budget, which a human set, stays green. That's not a rollback. We only took back the lie.
>
> I ask Gemini again. It says that fact was retracted, and gives the right answer.
>
> And when Claude pays Acme the right way, it's over its limit, so a real person approves it on their phone with World. Paid, on chain.
>
> Every memory here lives on Arkiv, signed by the AI that wrote it. It expires in two days unless we keep it, so lies die on their own. Anything private stays in your private repo; the memory just points to it.
>
> Every AI company is racing to make AI remember more. We built the part that lets you take it back.

### Short versions

- **One sentence:** "A shared memory for your AIs that knows where every fact came from, so you can take a wrong one back from all of them at once, and money never follows a lie."
- **At the Arkiv booth:** "Every memory is an Arkiv entity signed by the AI that wrote it, and it expires in two days unless a human keeps it. Revocations are public and outlive what they revoke. Private content stays off chain behind a pointer."
- **At the ENS booth:** "Each AI is an ENSv2 subname with its role, folder and spending cap as records only the owner can change. Our vault checks the name on chain before every payment. Vendors own their payout record, so an email can't redirect money."
- **At the World booth:** "A human approves when an AI wants to pay a new or untrusted payee. The approval is tied to that exact payment. Deny means nothing moves."

---

## 11. Quick answers for judges

- **"Isn't this just Notion's new feature?"** Notion gives your AIs one memory. It has no history of where facts came from, and its own setup prompt admits it can't recall what other AIs absorbed. A shared memory makes one wrong fact reach every AI. We built the undo.
- **"Why Arkiv and not Postgres?"** With Postgres you'd have to trust us about who wrote what. On Arkiv, each AI signs its own memories, anyone can check our revocations without asking us, and expiry is enforced by the network, not by a cron job.
- **"It's a public chain. What about private data?"** It never goes on chain. The memory points to your private repo, and only AIs with access can open it.
- **"What if your server gets hacked?"** It can't loosen the vault or withdraw. The owner's kill switch and spending ceilings live on chain, outside the server.
- **"What if the revoke takes out too much?"** AIs can cite exactly what they used, which narrows lineage, and you can restore a single memory.
- **"Would this have stopped Binance?"** No; that was an access breach. We applied its lesson: the check lives at the money.

---

## 12. Who does what (confirmed)

| Person | Claude session | Builds |
|---|---|---|
| Kai | #1 Brain (Lane A) | MCP server, lineage/trust/quarantine engine, Arkiv, revoke + notices, Keep/expiry, pointers, **ENS setup + reads**, dashboard API, Notion (stretch) |
| Kai | #2 Face (Lane C) | Dashboard (graph, dry run, agents, `/connect`, payments + approval UI), demo script, README, video |
| Srijit | #3 Money & Security (Lane B) | Payment policy, BrainVault, payment executor, World Agent Pass, SECURITY.md, WORLD_DEBRIEF.md |

What must stay in sync: `packages/shared` types, the `EnsAuthority` and `Payments` interfaces, and the dashboard API (`CLAUDE.md` §6). Track everything in `docs/PROGRESS.md`.

---

## 13. Still open (defaults apply until someone changes them)

1. World deny: DEFAULT is the booth demo + video; the stage pitch may show only approve.
2. Public "ETHMumbai brain" for reach: DEFAULT is stretch (S7).
3. Team ENS label: ask when S1 starts.
