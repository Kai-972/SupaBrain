"use client";
// Onboarding (FRONTEND_V2.md §5.6): identity first, then the app, then one snippet, then "waiting for your AI…".
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { Shell, useBrainId, useHref } from "@/components/Shell";
import { api, ApiError, type PairResult } from "@/lib/api";
import { loadRegistry, useStore } from "@/lib/store";
import { short, until, vendorOf } from "@/lib/format";
import { Copy, Ext, VendorBadge } from "@/components/ui";

const APPS: { id: string; name: string; fam: string[]; note: string }[] = [
  { id: "claude-code", name: "Claude Code", fam: ["claude"], note: "Paste the command in your terminal, then start claude." },
  { id: "claude-ai", name: "Claude app (web, desktop, phone)", fam: ["claude"], note: "Settings → Connectors → Add custom connector. The Free plan allows one custom connector." },
  { id: "antigravity", name: "Antigravity", fam: ["gemini"], note: "Add the block to Antigravity's MCP servers config." },
  { id: "gemini-cli", name: "Gemini CLI", fam: ["gemini"], note: "Merge into ~/.gemini/settings.json. The Gemini consumer app may be unavailable in India; use Antigravity." },
  { id: "codex", name: "Codex", fam: ["openai"], note: "Codex adds an MCP server by URL." },
  { id: "chatgpt", name: "ChatGPT (developer mode)", fam: ["openai"], note: "Developer mode → Connectors. Some plans are read-only." },
];

/** The path-token MCP URL the server put in its own snippets (no URL is built here). */
const pathUrlFrom = (snips: Record<string, string>) => Object.values(snips).map((s) => /(\S+\/mcp\/t\/[A-Za-z0-9._~-]+)/.exec(s)?.[1]).find(Boolean);

function Connect() {
  const sp = useSearchParams();
  const href = useHref();
  const id = useBrainId();
  const code = sp.get("code");
  const brain = useStore((s) => s.brain);
  const rules = useStore((s) => s.rules);
  const reg = useStore((s) => s.registry);
  const admin = useStore((s) => s.admin);
  const connected = useStore((s) => s.connected);
  const conn = useStore((s) => s.conn);
  const [label, setLabel] = useState(sp.get("agent") ?? "");
  const [app, setApp] = useState("claude-code");
  const [pair, setPair] = useState<PairResult>();
  const [err, setErr] = useState<string>();
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (conn === "open") loadRegistry().catch(() => {}); }, [conn]);
  useEffect(() => { if (!code) return; api.pairCode(code).then((p) => { setPair(p); setLabel(p.agent); if (p.client) setApp(p.client); }).catch((e) => setErr(e instanceof ApiError ? e.message : "This code is unknown or expired")); }, [code]);
  useEffect(() => { if (!label && brain?.agents[0]) setLabel(brain.agents[0].label); }, [brain, label]);
  const agent = brain?.agents.find((a) => a.label === label);
  const rule = rules?.agents.find((r) => r.agent === label);
  const regAgent = reg?.brains.find((b) => b.label === id)?.agents[agent?.vendor ?? ""];
  const apps = APPS.filter((a) => !agent || a.fam.includes(agent.vendor));
  useEffect(() => { if (agent && !apps.some((a) => a.id === app)) setApp(apps[0]?.id ?? "claude-code"); }, [agent?.vendor]); // eslint-disable-line react-hooks/exhaustive-deps
  const done = label && connected[label];
  const snippet = pair ? (app === "codex" ? (() => { const u = pathUrlFrom(pair.snippets); return u ? `codex mcp add supabrain-${pair.agent} --url ${u}` : undefined; })() : pair.snippets[app]) : undefined;

  return (
    <Shell>
      <main className="page" style={{ maxWidth: 1000 }}>
        <span className="eyebrow"><i />Connect · one MCP link per AI</span>
        <h1>Give an AI its name, then connect it.</h1>
        <p className="lede">Every app connects to the same Supabrain server, as a named AI of this brain. Everything it saves is signed by that AI&apos;s own wallet and checked against its ENS rules.</p>
        <div className="steplist">
          <section className="cstep">
            <div className="num">STEP 1 · IDENTITY</div>
            <h3>{code ? "Your AI identity (from the QR)" : "Which AI will this app act as?"}</h3>
            <div className="tiles2">
              {brain?.agents.map((a) => (
                <button key={a.label} className="tile2" aria-pressed={label === a.label} disabled={!!code} onClick={() => { setLabel(a.label); setPair(undefined); }}>
                  <div className="row"><VendorBadge vendor={a.vendor} /><b className="mono small">{a.label}</b></div>
                  <span className="mono">{a.ens}</span>
                </button>
              ))}
            </div>
            {agent && (
              <div className="card pad" style={{ marginTop: 12, display: "grid", gap: 6 }}>
                <div className="small">This app will act as <b className="mono">{agent.ens}</b>.</div>
                <div className="mono tiny muted">wallet {short(agent.wallet, 8, 6)} <Copy text={agent.wallet} /> · status {rule?.status ?? agent.status} · scope {rule?.scope ?? agent.scope} · {rule?.writeDaily ?? agent.writeDaily ?? "—"} writes/day · role {rule?.role ?? agent.role}</div>
                {regAgent?.fundingUrl && <div className="tiny">Arkiv write funding: <Ext href={regAgent.fundingUrl}>funding tx{regAgent.fundedGlm ? ` (${regAgent.fundedGlm} tGLM)` : ""}</Ext></div>}
              </div>
            )}
          </section>

          <section className="cstep">
            <div className="num">STEP 2 · APP</div>
            <h3>Which app is it?</h3>
            <div className="tiles2">{apps.map((a) => <button key={a.id} className="tile2" aria-pressed={app === a.id} onClick={() => setApp(a.id)}><b>{a.name}</b><span>{vendorOf(a.fam[0]).company}</span></button>)}</div>
            <div className="small muted" style={{ marginTop: 10 }}>{APPS.find((a) => a.id === app)?.note}</div>
          </section>

          <section className="cstep">
            <div className="num">STEP 3 · PASTE</div>
            <h3>Paste this, then paste the prompt</h3>
            {!pair && !code && (
              <div className="row wrapr">
                <button className="btn p" disabled={!admin || !label || busy} onClick={async () => { setBusy(true); setErr(undefined); try { setPair(await api.pair(label, app === "codex" ? undefined : app)); } catch (e) { setErr(e instanceof ApiError ? e.message : "Pairing failed"); } finally { setBusy(false); } }}>{busy ? "Creating…" : admin ? `Create a link for ${agent?.ens ?? "…"}` : "Owner sign-in to create a link"}</button>
                <span className="small muted">Creates a token for this AI and a 10-minute QR for a phone or second laptop.</span>
              </div>
            )}
            {err && <div className="callout bad" style={{ marginTop: 10 }}>{err}</div>}
            {pair && (
              <div className="pairgrid">
                <div style={{ display: "grid", gap: 12, minWidth: 0 }}>
                  <div><div className="section-t">1 · {APPS.find((a) => a.id === app)?.name}</div>{snippet ? <div className="codewrap"><pre className="code">{snippet}</pre><Copy text={snippet} label="Copy" small={false} /></div> : <div className="callout small">No snippet for this app from the server.</div>}</div>
                  <div><div className="section-t">2 · Then paste this prompt into the chat</div><div className="codewrap"><pre className="code">{pair.prompt}</pre><Copy text={pair.prompt} label="Copy prompt" small={false} /></div></div>
                  <div className="tiny muted">The link carries this AI&apos;s key to the brain. Treat it like a password. It expires in {until(pair.expiresAt)}.</div>
                </div>
                {pair.qrPayload && <div style={{ display: "grid", gap: 8, justifyItems: "center" }}><div className="qr"><QRCodeSVG value={pair.qrPayload} size={190} level="M" /></div><div className="tiny muted" style={{ textAlign: "center", maxWidth: 210 }}>Scan on a phone or another laptop to open this step there. Code <b className="mono">{pair.code}</b>, 10 minutes.</div></div>}
              </div>
            )}
          </section>

          <section className="cstep">
            <div className="num">STEP 4 · CONNECTED</div>
            <div className="waiting">
              <div className={`orb${done ? " ok" : ""}`}>{agent && <VendorBadge vendor={agent.vendor} big />}</div>
              {done
                ? <><h3 style={{ margin: 0 }}>{agent?.ens} is connected via {connected[label]}.</h3><p className="small muted" style={{ margin: 0 }}>Say &ldquo;continue&rdquo;. It will read where the last AI stopped.</p><Link className="btn f sm" href={href(`/b/${id}`)}>See it in the live brain →</Link></>
                : <><h3 style={{ margin: 0 }}>Waiting for {agent?.ens ?? "your AI"}…</h3><p className="small muted" style={{ margin: 0, maxWidth: 460 }}>When the app makes its first call, this turns green live.</p></>}
            </div>
          </section>
        </div>
      </main>
    </Shell>
  );
}
export default function Page() { return <Suspense fallback={null}><Connect /></Suspense>; }
