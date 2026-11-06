"use client";
import { Suspense, useEffect, useRef } from "react";
import Link from "next/link";
import story from "@/fixtures/story-v2.json";
import evidence from "@/content/evidence.json";
import faq from "@/content/faq.json";
import { mountLanding } from "@/components/landing/engine";
import { Logo } from "@/components/ui";
import { LiveDot, useBoot, useBrainId, useHref } from "@/components/Shell";
import { Pipeline } from "@/components/Charts";
import { useCounts } from "@/components/BrainParts";
import { useStore } from "@/lib/store";
import "./landing.css";

const WORKS = [["C", "v-claude", "Claude Code"], ["C", "v-claude", "Claude app"], ["G", "v-gemini", "Antigravity"], ["G", "v-gemini", "Gemini CLI"], ["O", "v-openai", "Codex"], ["O", "v-openai", "ChatGPT"]];

function Landing() {
  useBoot();
  const href = useHref();
  const id = useBrainId();
  const root = useRef<HTMLDivElement>(null);
  const health = useStore((s) => s.health);
  const brain = useStore((s) => s.brain);
  const conn = useStore((s) => s.conn);
  const c = useCounts();
  useEffect(() => (root.current ? mountLanding(root.current, story) : undefined), []);
  const live = !!brain && conn !== "noserver";
  const brainHref = href(id ? `/b/${id}` : "/brains");
  const labHref = href(id ? `/b/${id}/lab` : "/brains");

  return (
    <div className="landing" ref={root}>
      <nav className="top"><div className="wrap">
        <Link className="logo" href={href("/")}><Logo />Supabrain</Link>
        <div className="links">
          <a className="hide" href="#problem">The problem</a>
          <a className="hide" href="#layers">Why ENS + Arkiv</a>
          <Link className="hide" href={href("/verify")}>Verify</Link>
          <LiveDot />
          <Link className="btn p sm" href={brainHref}>Open the live brain</Link>
        </div>
      </div></nav>

      <header className="hero" id="top">
        <div className="field" aria-hidden="true"><canvas data-field="1" /></div>
        <div className="copy"><div className="wrap">
          <span className="eyebrow"><i />Trust layer for multi-agent AI · live on ENSv2 Sepolia + Arkiv</span>
          <h1>Stop prompt injection at the handoff <span className="muted">between AI agents.</span></h1>
          <div className="row2">
            <p>Every AI gets an ENS identity with rules anyone can read. Every handoff is signed on Arkiv by the AI that wrote it. Injected instructions are stopped before the next AI reads them, and the ENS rules still cap what an AI can do when one slips through.</p>
            <div className="cta">
              <Link className="btn p" href={brainHref}>Open the live brain</Link>
              <Link className="btn g" href={labHref}>Try to break it</Link>
              <Link className="btn g" href={href("/verify")}>Verify without us</Link>
            </div>
          </div>
          <div className="works">Works with {WORKS.map(([l, cl, n]) => <span key={n}><span className={`vb ${cl}`}>{l}</span>{n}</span>)}</div>
        </div></div>
      </header>

      <div className="livestrip" id="live" aria-live="polite"><div className="wrap">
        <div className="c">
          <span className="eyebrow"><i />{live ? "Live right now" : "Live numbers"}</span>
          <div className="small muted">{live ? <>Read just now from <b className="mono" style={{ color: "var(--fg)" }}>{health?.ens}</b> · ENS on Sepolia · Arkiv</> : "appear when the server is reachable"}</div>
        </div>
        <div className="c"><b>{live ? brain!.agents.length : "—"}</b><span>AI names on ENS</span></div>
        <div className="c"><b>{live ? c.checkpoints : "—"}</b><span>checkpoints signed on Arkiv</span></div>
        <div className="c"><b style={{ color: "var(--lie)" }}>{live ? c.stopped : "—"}</b><span>stopped injections</span></div>
        <div className="c"><b style={{ color: "var(--amber)" }}>{live ? c.ens : "—"}</b><span>blocked by ENS rules</span></div>
        <div className="c"><b style={{ color: "var(--flow)" }}>{live ? `${c.headsOk}/${c.headsTotal}` : "—"}</b><span>ENS heads verified</span></div>
      </div></div>

      <main>
        <section className="blk" id="problem"><div className="wrap">
          <span className="eyebrow bad"><i />The handoff is the new attack surface</span>
          <h2>One poisoned file. Three AIs. One of them acts on it.</h2>
          <div className="steps3">
            <div><div className="n">01</div><h3>An AI reads something</h3><p>A README, an issue, a web page. It hides an instruction meant for AIs, not for people.</p></div>
            <div><div className="n">02</div><h3>It hands it on</h3><p>Through shared memory or a handoff note, the instruction now looks like a teammate&apos;s context.</p></div>
            <div><div className="n">03</div><h3>The next AI acts</h3><p>A different vendor, no idea where it came from. It pushes a key, runs a script, pays an address.</p></div>
          </div>
          <div className="evid">
            {evidence.map((e) => (
              <a key={e.source} className="ev-card" href={e.url} target="_blank" rel="noreferrer noopener">
                <b>{e.stat}</b><span>{e.text}</span><em className="mono">{e.source} ↗</em>
              </a>
            ))}
          </div>
          <p className="tiny muted" style={{ marginTop: 10 }}>Lab and field results reported by their authors; each card opens the source.</p>
        </div></section>

        <section className="blk" id="layers"><div className="wrap">
          <span className="eyebrow"><i />Why MCP isn&apos;t enough</span>
          <h2>MCP connects agents. It doesn&apos;t make them accountable.</h2>
          <p className="lede">MCP is the network cable. ENS is the badge and the access policy. Arkiv is the audit log nobody can edit, not even us.</p>
          <div className="bands">
            <div className="band mcp"><b>MCP</b><span>How does an AI call a tool?</span><em>Without more: nothing about who the AI is or what it may do.</em></div>
            <div className="band ens"><b>ENS</b><span>Who is this AI, and what is it allowed to do in this project?</span><em>Without it: rules live in a config file anyone with server access can change silently.</em></div>
            <div className="band arkiv"><b>Arkiv</b><span>What did this AI hand over, and can anyone prove it?</span><em>Without it: &ldquo;Gemini wrote this&rdquo; means &ldquo;trust our database&rdquo;.</em></div>
          </div>
        </div></section>

        <section className="blk"><div className="wrap">
          <span className="eyebrow"><i />Fig. 4 · How a handoff is checked · live counts</span>
          <h2>Four gates on every call.</h2>
          <div style={{ marginTop: 28 }}><Pipeline /></div>
          <p className="small muted" style={{ marginTop: 14 }}>Gates 1, 2 and 4 are guarantees. Gate 3 is a tripwire for known injection shapes. If it misses new wording, gate 2 still limits what the AI can do. Source: GET /api/brains/{id || "…"}/checkpoints + /blocked · live.</p>
        </div></section>

        <section className="story" id="sb-story">
          <div className="pin">
            <div className="left">
              <span className="eyebrow"><i />See it work · example</span>
              <h2>Three AIs, one project, one poisoned file.</h2>
              <ol id="sb-list">{story.steps.map(([b, s], i) => <li key={b}><button data-s={i}><b>{b}</b><span>{s}</span></button></li>)}</ol>
              <div className="prog" id="sb-prog">Scroll, or pick a step</div>
            </div>
            <div className="cap" id="sb-cap" />
            <div className="tree" id="sb-tree"><svg id="sb-g" role="img" aria-label="Example: commits by three AIs, and a stopped injection" /><div id="sb-tipc" /></div>
            <div className="log">
              <div className="hd"><b>Brain log</b><span className="mono dim" style={{ fontSize: 11 }}>example</span></div>
              <div className="meter"><div>Commits<b id="sb-cM">0</b></div><div>Clean<b id="sb-cC">0</b></div><div className="q">Stopped<b id="sb-cQ">0</b></div><div>Blocked<b id="sb-cP">0</b></div></div>
              <div className="bar"><i id="sb-bC" style={{ width: 0 }} /><i id="sb-bQ" className="q" style={{ width: 0 }} /></div>
              <div className="feed" id="sb-feed" />
            </div>
          </div>
        </section>

        <section className="blk"><div className="wrap">
          <span className="eyebrow"><i />Why ENS</span>
          <h2>Rules that live outside the AI, the vendor and our server.</h2>
          <div className="tiles4">
            <div className="tile4"><b>A registry per project</b><p>Each brain is its own ENSv2 subname registry. Ending the project ends its identities.</p></div>
            <div className="tile4"><b>A name per AI</b><p><span className="mono">claude.{health?.ens ?? "brain.supabrain.eth"}</span>: its own resolver, records and expiry.</p></div>
            <div className="tile4"><b>Rules as records</b><p><span className="mono">sb.status · sb.scope · sb.write.daily · sb.role</span>, read live and enforced on every call. Changing one is a public Sepolia transaction.</p></div>
            <div className="tile4"><b>A head per AI</b><p><span className="mono">sb.memory.head</span> points at the AI&apos;s newest commit on Arkiv, so its latest work is findable from its name alone.</p></div>
          </div>
          <div className="cta" style={{ marginTop: 18 }}><Link className="btn g sm" href={href("/brains")}>See the registry</Link><Link className="btn g sm" href={href(id ? `/b/${id}/rules` : "/brains")}>See the live rules</Link></div>
        </div></section>

        <section className="blk"><div className="wrap">
          <span className="eyebrow"><i />Why Arkiv</span>
          <h2>The handoff log nobody can edit. Not even us.</h2>
          <div className="tiles">
            <div className="tile"><canvas data-m="grow" /><div className="lg"><span><i style={{ background: "var(--flow)" }} />signed commits</span></div><div className="tx"><h3>Signed by the writer</h3><p>Every checkpoint is created by the AI&apos;s own wallet. Authorship is a signature, not a database column.</p></div></div>
            <div className="tile"><canvas data-m="blast" /><div className="lg"><span><i style={{ background: "var(--lie)" }} />stopped</span></div><div className="tx"><h3>Revoked, not deleted</h3><p>A stopped item gets a public revocation. No AI receives it, and history stays readable.</p></div></div>
            <div className="tile"><canvas data-m="expire" /><div className="lg"><span><i style={{ background: "var(--amber)" }} />kept</span></div><div className="tx"><h3>Expires with the project</h3><p>Data has a lifetime on Arkiv, so a finished project doesn&apos;t leave a permanent pile of context.</p></div></div>
          </div>
          <div className="term" style={{ marginTop: 16, maxWidth: 520 }}><span className="s">$</span>pnpm verify:memory &lt;key&gt;<span className="dim" style={{ marginLeft: "auto" }}>Arkiv + ENS only</span></div>
        </div></section>

        <section className="blk"><div className="wrap">
          <span className="eyebrow"><i />Questions</span>
          <h2>What judges ask.</h2>
          <div className="faqgrid">{faq.faq.slice(0, 4).map((q) => <div key={q.q} className="tile4"><b>{q.q}</b><p>{q.a}</p></div>)}</div>
          <div style={{ marginTop: 16 }}><Link className="btn g sm" href={href("/verify")}>All questions and honest limits →</Link></div>
        </div></section>

        <section className="blk end" id="demo"><canvas data-field="2" aria-hidden="true" /><div className="wrap">
          <span className="eyebrow"><i />Try it</span>
          <h2>Your agents already hand work to each other. Make every handoff accountable.</h2>
          <div className="cta"><Link className="btn p" href={brainHref}>Open the live brain</Link><Link className="btn g" href={labHref}>Try to break it</Link><Link className="btn g" href={href("/connect")}>Connect your AI</Link></div>
        </div></section>
      </main>
      <footer><div className="wrap"><span>Supabrain · built at ETHGlobal Mumbai 2026 · testnets only (Ethereum Sepolia, Arkiv Rabdi)</span><span>The scroll story is example data; everything else on this site is live.</span></div></footer>
    </div>
  );
}

export default function Page() { return <Suspense fallback={null}><Landing /></Suspense>; }
