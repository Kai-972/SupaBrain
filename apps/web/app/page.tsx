"use client";
import { Suspense, useEffect, useRef } from "react";
import Link from "next/link";
import story from "@/fixtures/story-v2.json";
import evidence from "@/content/evidence.json";
import faq from "@/content/faq.json";
import { mountLanding } from "@/components/landing/engine";
import { HandoffHero } from "@/components/landing/HandoffHero";
import { Intro } from "@/components/Intro";
import { startTour, Tour, TOUR_SECONDS } from "@/components/Tour";
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
  const mins = Math.round(TOUR_SECONDS / 60);

  return (
    <div className="landing" ref={root}>
      <Intro />
      <nav className="top"><div className="wrap">
        <Link className="logo" href={href("/")}><Logo />Supabrain</Link>
        <div className="links">
          <a className="hide" href="#problem">Problem</a>
          <a className="hide" href="#layers">Why ENS + Arkiv</a>
          <Link className="hide" href={brainHref}>Live brain</Link>
          <Link className="hide" href={href("/verify")}>Verify</Link>
          <LiveDot />
          <button className="btn ink sm" onClick={startTour}>Take the tour</button>
        </div>
      </div></nav>

      <header className="hero" data-tour="hero"><div className="wrap">
        <div className="grid">
          <div>
            <span className="eyebrow"><i />Security for AI-agent handoffs · live on ENSv2 + Arkiv</span>
            <h1>Stop prompt injection <mark>at the handoff</mark> between AI agents.</h1>
            <p className="lede"><b>Your team&apos;s AIs pass work to each other.</b> Supabrain gives each one an ENS identity with rules anyone can read, signs every handoff on Arkiv, and stops injected instructions before the next AI reads them.</p>
            <div className="cta">
              <button className="btn p" onClick={startTour}>Take the {mins}-minute tour</button>
              <Link className="btn g" href={brainHref}>Open the live brain</Link>
              <Link className="tlink" href={labHref}>Try to break it →</Link>
            </div>
            <div className="works">Works with {WORKS.map(([l, cl, n]) => <span key={n}><span className={`vb ${cl}`}>{l}</span>{n}</span>)}</div>
          </div>
          <HandoffHero />
        </div>
      </div></header>

      <div className="livestrip" id="live" aria-live="polite"><div className="wrap">
        <div className="c">
          <span className="eyebrow"><i />{live ? "Live right now" : "Live numbers"}</span>
          <div className="small muted">{live ? <>From <b className="mono" style={{ color: "var(--fg)" }}>{health?.ens}</b>, ENS on Sepolia and Arkiv</> : "appear when the server is reachable"}</div>
        </div>
        <div className="c"><b>{live ? brain!.agents.length : "—"}</b><span>AIs with ENS names</span></div>
        <div className="c"><b>{live ? c.checkpoints : "—"}</b><span>commits signed on Arkiv</span></div>
        <div className="c"><b style={{ color: "var(--lie)" }}>{live ? c.stopped : "—"}</b><span>injections stopped</span></div>
        <div className="c"><b>{live ? c.ens : "—"}</b><span>blocked by ENS rules</span></div>
        <div className="c"><b>{live ? `${c.headsOk}/${c.headsTotal}` : "—"}</b><span>ENS heads verified</span></div>
      </div></div>

      <main>
        <section className="blk" id="problem"><div className="wrap sect">
          <div className="num">01</div>
          <div>
            <span className="eyebrow bad"><i />The problem</span>
            <h2>One poisoned file. Three AIs. One of them acts on it.</h2>
            <p className="lead"><b>Teams now run Claude Code, Gemini and Codex on one codebase.</b> When one AI reads a README, issue or web page with an instruction hidden for AIs, it writes it into shared memory. The next AI, from a different company, treats it as a teammate&apos;s note and pushes a key, runs a script, or pays an address.</p>
            <div className="evid">
              {evidence.map((e) => (
                <a key={e.source} className="ev-card" href={e.url} target="_blank" rel="noreferrer noopener">
                  <b>{e.stat}</b><span>{e.text}</span><em>{e.source} ↗</em>
                </a>
              ))}
            </div>
          </div>
        </div></section>

        <section className="layers dark" id="layers" data-tour="layers"><div className="wrap sect">
          <div className="num">02</div>
          <div>
            <span className="eyebrow"><i />Why MCP isn&apos;t enough</span>
            <h2>MCP connects agents. It doesn&apos;t make them accountable.</h2>
            <p className="lead"><b>MCP is the cable.</b> ENS is the badge and the access rules. Arkiv is the log nobody can edit, not even us.</p>
            <div className="bands">
              <div className="band mcp"><b>MCP</b><span>How does an AI call a tool?</span><em>On its own, nothing about who the AI is or what it may do.</em></div>
              <div className="band ens"><b>ENS</b><span>Who is this AI, and what may it do in this project?</span><em>Without it, rules live in a config file anyone with server access can change silently.</em></div>
              <div className="band arkiv"><b>ARKIV</b><span>What did it hand over, and can anyone prove it?</span><em>Without it, “Gemini wrote this” means “trust our database”.</em></div>
            </div>
          </div>
        </div></section>

        <section className="blk" data-tour="gates"><div className="wrap sect">
          <div className="num">03</div>
          <div>
            <span className="eyebrow"><i />How a handoff is checked · live counts</span>
            <h2>Four gates on every call.</h2>
            <p className="lead"><b>Gates one, two and four are guarantees.</b> Gate three is a tripwire for known injection shapes; if new wording slips past it, the ENS rule still limits what the AI can do.</p>
            <div style={{ marginTop: 40 }}><Pipeline /></div>
          </div>
        </div></section>

        <section className="story dark" id="sb-story">
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

        <section className="blk"><div className="wrap sect">
          <div className="num">04</div>
          <div>
            <span className="eyebrow"><i />Why ENS</span>
            <h2>Rules that live outside the AI, the vendor and our server.</h2>
            <div className="three">
              <div className="beige"><span className="k">A registry per project</span><h3>Each brain is its own ENSv2 registry</h3><p>Ten projects, thirty AI names, each with its own resolver and expiry. End the project and its identities end.</p></div>
              <div className="beige"><span className="k">Rules as records</span><h3>Status, scope, writes per day</h3><p><span className="mono">sb.status · sb.scope · sb.write.daily</span> are read live and enforced on every call. Changing one is a public Sepolia transaction.</p></div>
              <div className="beige"><span className="k">A head per AI</span><h3>ENS points at the latest commit</h3><p><span className="mono">sb.memory.head</span> on <span className="mono">claude.{health?.ens ?? "brain.supabrain.eth"}</span> points at its newest commit on Arkiv.</p></div>
            </div>
            <div className="cta"><Link className="btn g sm" href={href("/brains")}>See the registry</Link><Link className="btn g sm" href={href(id ? `/b/${id}/rules` : "/brains")}>See the live rules</Link></div>
          </div>
        </div></section>

        <section className="blk"><div className="wrap sect">
          <div className="num">05</div>
          <div>
            <span className="eyebrow"><i />Why Arkiv</span>
            <h2>The handoff log nobody can edit. Not even us.</h2>
            <div className="tiles">
              <div className="tile"><canvas data-m="grow" /><div className="tx"><h3>Signed by the writer</h3><p>Every commit is created by the AI&apos;s own wallet. Authorship is a signature, not a database column.</p></div></div>
              <div className="tile"><canvas data-m="blast" /><div className="tx"><h3>Revoked, not deleted</h3><p>A stopped item gets a public revocation. No AI receives it, and history stays readable.</p></div></div>
              <div className="tile"><canvas data-m="expire" /><div className="tx"><h3>Expires with the project</h3><p>Data has a lifetime on Arkiv, so a finished project doesn&apos;t leave a permanent pile of context.</p></div></div>
            </div>
            <div className="term"><span className="s">$</span>pnpm verify:memory &lt;key&gt;<span style={{ opacity: .6 }}>· Arkiv + ENS only</span></div>
          </div>
        </div></section>

        <section className="blk"><div className="wrap sect">
          <div className="num">06</div>
          <div>
            <span className="eyebrow"><i />Who it&apos;s for</span>
            <h2>Teams that run more than one AI agent on the same work.</h2>
            <p className="lead"><b>Engineering teams</b> using Claude Code, Gemini and Codex on one codebase, and the <b>AI platform and security leads</b> who must answer: which agent did this, what was it allowed to do, and what did it pass on? Regulated teams (fintech, health) get an audit trail they can show.</p>
            <div className="faqgrid">{faq.faq.slice(0, 4).map((q) => <div key={q.q} className="beige"><h3 style={{ fontSize: "1.25rem" }}>{q.q}</h3><p>{q.a}</p></div>)}</div>
          </div>
        </div></section>

        <section className="end dark" data-tour="cta"><canvas data-field="2" aria-hidden="true" /><div className="wrap">
          <span className="eyebrow"><i />Try it</span>
          <h2 style={{ fontFamily: "var(--serif)", fontWeight: 400, fontSize: "clamp(2.2rem, 4.5vw, 3.8rem)", lineHeight: 1.05, letterSpacing: "-.025em", margin: "14px 0 0" }}>Your agents already hand work to each other. Make every handoff accountable.</h2>
          <div className="cta"><Link className="btn p" href={brainHref}>Open the live brain</Link><Link className="btn g" href={labHref}>Try to break it</Link><Link className="btn g" href={href("/connect")}>Connect your AI</Link></div>
        </div></section>
      </main>
      <footer><div className="wrap"><span>Supabrain · built at ETHGlobal Mumbai 2026 · testnets only (Ethereum Sepolia, Arkiv Rabdi)</span><span>The scroll story and hero card are illustrations; every number and page after them is live.</span></div></footer>
      <Tour />
    </div>
  );
}

export default function Page() { return <Suspense fallback={null}><Landing /></Suspense>; }
