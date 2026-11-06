"use client";
// How it works: the architecture as one picture, the life of a memory, the rules, and every judge question.
import { Suspense, useState } from "react";
import Link from "next/link";
import { Shell, useHref } from "@/components/Shell";
import { useStore } from "@/lib/store";
import { Copy } from "@/components/ui";

const LIFE = [
  ["remember", "An AI calls remember over MCP", "Claude, Gemini or ChatGPT, with its own bearer token."],
  ["ENS", "The server checks ENS live", "getOwner(labelhash) must be the AI's wallet, status active, folder inside sb.scope. ENS unreadable → refused (fail closed)."],
  ["lineage", "Parents, roots and trust", "Parents = what the AI cited or read since its last write. Roots = the original sources. Trust = the lowest parent."],
  ["dispute", "Checked against vendor ENS", "If it claims an address for a vendor that differs from the vendor's own ENS record: DISPUTED BY ENS, in milliseconds."],
  ["Arkiv", "Signed by the AI's own wallet", "One Arkiv batch: memory + edges + taint rows, created by the agent wallet, owned by the team. Fades in 2 days unless kept."],
  ["live", "Every AI and this dashboard see it", "SSE pushes it here instantly; the next recall by any AI returns it with its source and flags."],
];

const QA: [string, string][] = [
  ["Can an AI fake who wrote a memory?", "No. Each memory is an Arkiv entity created by that AI's own wallet, and that wallet must own the AI's ENS name. Anyone can check with `pnpm verify:memory <key>` using only Arkiv and ENS, without trusting our server."],
  ["Isn't this just “delete a note”?", "Deleting one note leaves everything other AIs built on it. Supabrain revokes a source and quarantines every descendant across every vendor, sends each AI that wrote or read them a retraction notice, and keeps the original readable: undo never rewrites history."],
  ["Do you detect lies with AI?", "No. We flag: an address that disagrees with the vendor's ENS record is DISPUTED, and outside content can't authorize money. Humans decide what's wrong; we make the undo one click and the wait safe."],
  ["What if the vendor really changed wallets?", "Then the vendor updates its own ENS record with its own wallet. Only Acme's key can change acme's addr record, so an email can't, and payments to the new address pass the ENS check."],
  ["Can a hacked AI call the money contract directly?", "It reverts. BrainVault checks the AI's ENS name on chain (AgentNotRegistered), the policy-signed attestation and its expiry, the revoked roots (RootRevoked) and a daily ceiling. The guardian can only tighten."],
  ["Why World ID instead of an “Approve” button?", "A button can be clicked by anyone with the dashboard, or by a hacked AI. World proves a real human approved this one payment: the proof is bound to the intent hash and accepted once, then every hard rule is re-checked."],
  ["Why Arkiv and not Postgres?", "With a database, “Gemini wrote this” means “trust us”. On Arkiv every memory, edge, revocation and payment decision is signed by its author, expires on its own, and anyone can query the public revocations."],
  ["Why ENS and not a config file?", "The rules have to be outside the AI and outside our server: role, scope and pay caps are records only the owner can set, vendors own their payout record, and the vault reads ENS on chain. Unregister the name and the AI is out everywhere."],
  ["What if ENS can't be read?", "Fail closed. The AI shows AUTHORITY UNKNOWN, its writes and payments pause, and the UI never guesses a status."],
  ["Where does confidential data go?", "Never on chain. A memory can hold a pointer (a GitHub file pinned to a commit, or a Notion page) plus a non-secret label. AIs open it with their own access."],
  ["What happens to old memories?", "They fade after 2 days on Arkiv unless a person clicks Keep (7 or 30 days). A quarantined memory can never be kept, so lies die on their own. Revocations last the maximum (~6 months)."],
  ["What does the AI actually see after a revoke?", "Its next tool call starts with a retraction notice, and recall returns the old memory flagged QUARANTINED with the reason, never as a fact. The Before / After panel shows exactly what it was handed."],
  ["Who holds the keys?", "For the demo the server holds the agent, team, policy and guardian keys, and we say so. The owner key, the vault ceilings and the ENS kill switch are not on the server."],
  ["Does it work with any AI?", "Anything that speaks MCP over HTTP: Claude Code, the Claude app, Antigravity (Gemini) and Gemini CLI today; ChatGPT developer mode next. One URL, one token per AI."],
  ["How is this different from Supermemory or Mem0?", "They help AI remember better; contradictions resolve newest-wins, which is exactly what a “bank details changed” email exploits. Supabrain keeps every fact's source and author, lets you take a source back from every AI at once, and checks why an AI trusts a payee. It can sit underneath them."],
];

function Arch() {
  const team = useStore((s) => s.team);
  const box = (x: number, y: number, w: number, h: number, t: string, s: string, tone = "var(--line2)") => (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={12} fill="var(--panel)" stroke={tone} />
      <text x={x + 14} y={y + 24} style={{ font: "500 13px var(--sans)", fill: "var(--fg)" }}>{t}</text>
      <text x={x + 14} y={y + 42} style={{ font: "10.5px var(--mono)", fill: "var(--muted)" }}>{s}</text>
    </g>
  );
  const flow = (d: string, c = "var(--flow)", dur = 2.4) => (
    <g>
      <path d={d} fill="none" stroke="color-mix(in srgb, var(--flow) 30%, var(--line2))" strokeWidth={1.5} />
      <circle r={3} fill={c} filter="url(#hg)"><animateMotion dur={`${dur}s`} repeatCount="indefinite" path={d} /></circle>
    </g>
  );
  return (
    <div className="card" style={{ overflowX: "auto", padding: 12 }}>
      <svg viewBox="0 0 960 430" style={{ width: "100%", minWidth: 760, display: "block" }} role="img" aria-label="Architecture: AI clients connect over MCP to the Supabrain server, which reads ENS, writes signed entities to Arkiv, asks World App for human approval and pays through BrainVault">
        <defs><filter id="hg" x="-300%" y="-300%" width="700%" height="700%"><feGaussianBlur stdDeviation="3" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter></defs>
        <text x={20} y={22} style={{ font: "600 10.5px var(--mono)", fill: "var(--dim)", letterSpacing: ".06em" }}>AI CLIENTS · ANY VENDOR</text>
        {box(20, 36, 190, 56, "Claude Code / Claude app", "Anthropic · lead-claude")}
        {box(20, 108, 190, 56, "Antigravity / Gemini CLI", "Google · gem-research")}
        {box(20, 180, 190, 56, "ChatGPT", "OpenAI · gpt-writer")}
        {box(20, 300, 190, 56, "This dashboard", "owner · REST + live SSE")}
        {flow("M210,64 C260,64 260,170 330,170")}
        {flow("M210,136 C260,136 260,180 330,180", "var(--vg)", 2.8)}
        {flow("M210,208 C260,208 260,190 330,190", "var(--vo)", 3.2)}
        {flow("M210,328 C260,328 260,260 330,260", "var(--amber)", 3)}
        <text x={232} y={160} style={{ font: "10px var(--mono)", fill: "var(--dim)" }}>one MCP URL</text>
        <rect x={330} y={36} width={300} height={350} rx={16} fill="var(--panel2)" stroke="var(--flow)" strokeOpacity={0.5} />
        <text x={348} y={62} style={{ font: "600 14px var(--sans)", fill: "var(--fg)" }}>Supabrain server</text>
        <text x={348} y={80} style={{ font: "10.5px var(--mono)", fill: "var(--muted)" }}>MCP: whoami · recall · remember · pay</text>
        {[["ENS check on every call", "owner · status · scope · caps"], ["Lineage + trust", "parents · roots · min(trust)"], ["Dispute check", "memory address vs vendor ENS"], ["Undo engine", "dry run · revoke · notices · keep"], ["Payment policy", "trace payee → ENS → human → vault"]].map(([t, s], i) => (
          <g key={t}><rect x={348} y={96 + i * 56} width={264} height={46} rx={10} fill="var(--panel)" stroke="var(--line2)" /><text x={362} y={116 + i * 56} style={{ font: "500 12.5px var(--sans)", fill: "var(--fg)" }}>{t}</text><text x={362} y={132 + i * 56} style={{ font: "10px var(--mono)", fill: "var(--muted)" }}>{s}</text></g>
        ))}
        {flow("M630,90 C690,90 690,64 740,64", "var(--blue)", 2.6)}
        {flow("M630,170 C690,170 690,150 740,150", "var(--flow)", 2.2)}
        {flow("M630,300 C690,300 690,236 740,236", "var(--amber)", 3)}
        {flow("M630,330 C690,330 690,322 740,322", "var(--amber)", 3.4)}
        <text x={760} y={22} style={{ font: "600 10.5px var(--mono)", fill: "var(--dim)", letterSpacing: ".06em" }}>THE TRUTH LIVES OUTSIDE US</text>
        {box(740, 36, 200, 56, "ENSv2 · Sepolia", `${team?.team.ens ?? "team"} · names + rules`, "var(--blue)")}
        {box(740, 122, 200, 56, "Arkiv · Rabdi", "signed memories · revocations", "var(--flow)")}
        {box(740, 208, 200, 56, "World App", "a real human approves", "var(--amber)")}
        {box(740, 294, 200, 56, "BrainVault · Sepolia", "test USDC · re-checks ENS", "var(--amber)")}
        <path d="M940,322 C960,322 960,64 940,64" fill="none" stroke="var(--blue)" strokeDasharray="3 4" />
        <text x={890} y={378} style={{ font: "10px var(--mono)", fill: "var(--dim)" }} textAnchor="end">vault reads ENS on chain ↑</text>
      </svg>
    </div>
  );
}

function How() {
  const href = useHref();
  const [open, setOpen] = useState<number | null>(0);
  return (
    <Shell>
      <main className="page">
        <span className="eyebrow"><i />How it works</span>
        <h1>Simple on the outside. Checked everywhere underneath.</h1>
        <p className="lede">Three ideas: every fact keeps its source; ENS is the truth for who an AI is, what it may do and where a vendor gets paid; a real person decides risky money. Everything is signed on Arkiv so nobody, not even us, can quietly change history.</p>
        <Arch />

        <h2 style={{ fontSize: "1.25rem", fontWeight: 500, margin: "34px 0 14px", letterSpacing: "-.02em" }}>The life of one memory</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
          {LIFE.map(([k, t, d], i) => (
            <div key={k} className="card pad" style={{ position: "relative" }}>
              <div className="mono tiny" style={{ color: "var(--flow)" }}>{String(i + 1).padStart(2, "0")} · {k}</div>
              <div style={{ fontWeight: 500, margin: "6px 0 4px" }}>{t}</div>
              <div className="small muted">{d}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 12, marginTop: 30 }}>
          <div className="card pad">
            <div className="section-t">Trust: the lowest of what you built on</div>
            <table className="rules"><tbody>
              <tr><td><span className="chip ok">HUMAN · 3</span></td><td className="small">Only people, from this dashboard (Add context, Correct this). No AI can produce it.</td></tr>
              <tr><td><span className="chip">AGENT · 2</span></td><td className="small">An AI&apos;s note built only on trusted notes.</td></tr>
              <tr><td><span className="chip warn">EVIDENCE · 1</span></td><td className="small">Outside content: email, web, file. It can never authorize money.</td></tr>
            </tbody></table>
            <div className="small muted" style={{ marginTop: 10 }}>An AI that reads an email and your budget, then writes a plan: that plan is EVIDENCE (1), because it rests on the email.</div>
          </div>
          <div className="card pad">
            <div className="section-t">Every status, in words</div>
            <div className="row wrapr" style={{ gap: 6 }}>
              <span className="chip ok">ACTIVE</span><span className="chip warn">DISPUTED BY ENS</span><span className="chip">UNVERIFIED</span><span className="chip solid-bad">QUARANTINED</span><span className="chip warn">STALE</span><span className="chip">EXPIRED</span><span className="chip ok">KEPT</span><span className="chip">WRITING TO ARKIV…</span>
            </div>
            <div className="small muted" style={{ marginTop: 10 }}><b style={{ color: "var(--fg)" }}>Machines flag in milliseconds</b> (DISPUTED shows the moment it&apos;s written). <b style={{ color: "var(--fg)" }}>Humans decide in minutes</b> (one revoke). In between, payments built on it are blocked.</div>
          </div>
          <div className="card pad">
            <div className="section-t">On chain vs. never on chain</div>
            <div className="small" style={{ display: "grid", gap: 6 }}>
              <div><span className="chip ok">on Arkiv</span> memory text, author, parents, roots, trust, revocations, notices, payment decisions</div>
              <div><span className="chip ok">on ENS</span> AI names, role, scope, pay caps, status, vendor payout address</div>
              <div><span className="chip">never</span> private docs (pointer + label only), chat transcripts, tokens, the Arkiv key</div>
            </div>
          </div>
        </div>

        <h2 style={{ fontSize: "1.25rem", fontWeight: 500, margin: "34px 0 6px", letterSpacing: "-.02em" }}>Check it yourself, without trusting us</h2>
        <div style={{ display: "grid", gap: 8, maxWidth: 720 }}>
          {[["pnpm verify:memory <key>", "Proves who wrote a memory using only Arkiv and ENS"], ["pnpm arkiv:query", "The public query: every revocation for the team"], ["pnpm ens:status", "Every AI's ENS name, owner and records, read live"]].map(([c, d]) => (
            <div key={c} className="row card" style={{ padding: "10px 12px" }}><span className="mono small grow">{c}<span className="muted" style={{ fontFamily: "var(--sans)", marginLeft: 10 }}>{d}</span></span><Copy text={c} /></div>
          ))}
        </div>

        <h2 style={{ fontSize: "1.25rem", fontWeight: 500, margin: "34px 0 12px", letterSpacing: "-.02em" }}>Questions judges ask</h2>
        <div className="card">
          {QA.map(([q, a], i) => (
            <div key={q} style={{ borderTop: i ? "1px solid var(--line)" : undefined }}>
              <button className="row" style={{ width: "100%", textAlign: "left", padding: "14px 16px", fontWeight: 500 }} aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)}>
                <span className="grow">{q}</span><span className="muted mono">{open === i ? "−" : "+"}</span>
              </button>
              {open === i && <div className="small muted" style={{ padding: "0 16px 16px", maxWidth: "75ch", lineHeight: 1.6 }}>{a.split("`").map((s, j) => (j % 2 ? <span key={j} className="mono" style={{ color: "var(--fg)" }}>{s}</span> : s))}</div>}
            </div>
          ))}
        </div>

        <div className="callout" style={{ marginTop: 24 }}>
          <b>Honest limits.</b> Custodial agent keys for the demo (owner key, vault ceilings and the ENS kill switch are not on the server). Lineage is recorded by the server; <span className="mono">verify:memory</span> proves each signer owns its AI&apos;s ENS name now, not at write time. We flag, we don&apos;t “detect lies”. Any verified human who scans the World QR can approve, so the QR shows only on the owner dashboard. Testnets only, synthetic data; World proofs are real.
        </div>
        <div className="row wrapr" style={{ marginTop: 20 }}><Link className="btn p" href={href("/t")}>Open the live team</Link><Link className="btn g" href={href("/connect")}>Connect your AI</Link></div>
      </main>
    </Shell>
  );
}

export default function Page() { return <Suspense fallback={null}><How /></Suspense>; }
