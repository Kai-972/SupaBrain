"use client";
// Onboarding (C-UI.md §3.4): pick an identity, pick a client, paste one snippet, watch it connect live.
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import type { Client } from "@supabrain/shared";
import { Shell, useHref } from "@/components/Shell";
import { api, ApiError, type PairResult } from "@/lib/api";
import { useStore } from "@/lib/store";
import { until, vendorOf } from "@/lib/format";
import { Copy, VendorBadge, useNow } from "@/components/ui";

const CLIENTS: { id: Client; name: string; maker: string; note: string; soon?: boolean }[] = [
  { id: "claude-code", name: "Claude Code", maker: "Anthropic · terminal", note: "Paste the command in your terminal, then start claude." },
  { id: "claude-ai", name: "Claude app", maker: "Anthropic · web & desktop", note: "Free plan allows 1 custom connector." },
  { id: "antigravity", name: "Antigravity", maker: "Google · Gemini", note: "Add to the MCP servers config. The Gemini consumer app isn't available in India yet; use Antigravity." },
  { id: "gemini-cli", name: "Gemini CLI", maker: "Google · terminal", note: "Merge into ~/.gemini/settings.json." },
  { id: "chatgpt", name: "ChatGPT", maker: "OpenAI", note: "Developer mode connectors; Plus may be read-only.", soon: true },
];

function Connect() {
  const sp = useSearchParams();
  const href = useHref();
  const code = sp.get("code");
  const team = useStore((s) => s.team);
  const admin = useStore((s) => s.admin);
  const connected = useStore((s) => s.connected);
  const mode = useStore((s) => s.mode);
  const now = useNow(1000);
  const [label, setLabel] = useState(sp.get("agent") ?? "");
  const [client, setClient] = useState<Client>("claude-code");
  const [pair, setPair] = useState<PairResult>();
  const [err, setErr] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [since, setSince] = useState<number>();
  useEffect(() => setSince(Date.now()), []);

  useEffect(() => {
    if (!code) return;
    api.pairCode(code).then((p) => { setPair(p); setLabel(p.agent); if (p.client) setClient(p.client); }).catch((e) => setErr(e instanceof ApiError ? e.message : "This code is unknown or expired"));
  }, [code]);
  useEffect(() => { if (!label && team?.agents[0]) setLabel(team.agents[0].label); }, [team, label]);

  const agent = team?.agents.find((a) => a.label === label);
  const done = label && connected[label];
  const ready = !!pair;

  const make = async () => {
    setBusy(true); setErr(undefined);
    try { setPair(await api.pair(label, client)); } catch (e) { setErr(e instanceof ApiError ? e.message : "Pairing failed"); } finally { setBusy(false); }
  };

  return (
    <Shell>
      <main className="page" style={{ maxWidth: 980 }}>
        <span className="eyebrow"><i />Connect your AI · one remote MCP URL</span>
        <h1>Plug an AI into the team&apos;s memory.</h1>
        <p className="lede">Every vendor connects to the same Supabrain server. Each AI gets its own ENS identity and token, so everything it writes is signed by its own wallet and carries its rules.</p>
        {mode === "mock" && <div className="callout warn" style={{ marginBottom: 14 }}>Pairing is disabled in MOCK DATA mode.</div>}
        <div className="steplist">
          <section className="cstep">
            <div className="num">STEP 1</div>
            <h3>{code ? "Your identity (from the QR)" : "Which AI identity?"}</h3>
            <div className="tiles2">
              {team?.agents.map((a) => (
                <button key={a.label} className="tile2" aria-pressed={label === a.label} disabled={!!code} onClick={() => { setLabel(a.label); setPair(undefined); }}>
                  <div className="row"><VendorBadge vendor={a.vendor} /><b className="mono small ell">{a.label}</b></div>
                  <span className="mono">{a.ens}</span>
                  <span>{a.role} · writes {a.scope === "*" ? "everything" : a.scope} · pay cap {a.payCap} USDC</span>
                </button>
              ))}
              {!team && [0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 96 }} />)}
            </div>
          </section>

          <section className="cstep">
            <div className="num">STEP 2</div>
            <h3>Which app is it?</h3>
            <div className="tiles2">
              {CLIENTS.map((c) => (
                <button key={c.id} className="tile2" aria-pressed={client === c.id} onClick={() => setClient(c.id)} disabled={c.soon && !pair}>
                  <b>{c.name}</b><span>{c.maker}{c.soon ? " · soon" : ""}</span>
                </button>
              ))}
            </div>
            <div className="small muted" style={{ marginTop: 10 }}>{CLIENTS.find((c) => c.id === client)?.note}</div>
          </section>

          <section className="cstep">
            <div className="num">STEP 3</div>
            <h3>Paste this, then paste the prompt</h3>
            {!ready && !code && (
              <div className="row wrapr">
                <button className="btn p" disabled={!admin || !label || busy || mode === "mock"} onClick={make}>{busy ? "Creating…" : admin ? `Create a connection for ${label || "…"}` : "🔒 Owner sign-in to create a connection"}</button>
                <span className="small muted">Creates a 7-day token for this identity and a 10-minute QR for a phone or second laptop.</span>
              </div>
            )}
            {err && <div className="callout bad" style={{ marginTop: 10 }}>{err}</div>}
            {pair && (
              <div style={{ display: "grid", gridTemplateColumns: pair.qrPayload ? "minmax(0,1fr) auto" : "1fr", gap: 18, alignItems: "start" }} className="pairgrid">
                <div style={{ display: "grid", gap: 12, minWidth: 0 }}>
                  <div>
                    <div className="section-t">1 · {CLIENTS.find((c) => c.id === client)?.name} setup</div>
                    <div className="codewrap"><pre className="code">{pair.snippets[client]}</pre><Copy text={pair.snippets[client]} label="Copy" small={false} /></div>
                  </div>
                  <div>
                    <div className="section-t">2 · Then paste this prompt into the chat</div>
                    <div className="codewrap"><pre className="code">{pair.prompt}</pre><Copy text={pair.prompt} label="Copy prompt" small={false} /></div>
                  </div>
                  <div className="tiny muted">The token in the snippet is this AI&apos;s key to the team memory. Treat it like a password; it expires {until(pair.expiresAt, now) === "now" ? "now" : `in ${until(pair.expiresAt, now)}`}.</div>
                </div>
                {pair.qrPayload && (
                  <div style={{ display: "grid", gap: 8, justifyItems: "center" }}>
                    <div className="qr"><QRCodeSVG value={pair.qrPayload} size={190} level="M" /></div>
                    <div className="tiny muted" style={{ textAlign: "center", maxWidth: 210 }}>Scan on a phone or another laptop to open this step there. Code <b className="mono">{pair.code}</b>, valid 10 minutes.</div>
                  </div>
                )}
              </div>
            )}
          </section>

          <section className="cstep">
            <div className="num">STEP 4</div>
            <div className="waiting">
              <div className={`orb${done ? " ok" : ""}`}>{agent ? <VendorBadge vendor={agent.vendor} big /> : null}</div>
              {done
                ? <><h3 style={{ margin: 0 }}>{label} is connected via {connected[label]}. Say hello.</h3><p className="muted small" style={{ margin: 0 }}>Ask it &ldquo;what do we know about Acme?&rdquo; It will read the team&apos;s memory and cite where each fact came from.</p><Link className="btn f sm" href={href("/t")}>See it in the team brain →</Link></>
                : <><h3 style={{ margin: 0 }}>Waiting for your AI…</h3><p className="muted small" style={{ margin: 0, maxWidth: 460 }}>When {agent ? <b className="mono">{agent.ens}</b> : "it"} calls <span className="mono">whoami</span>, this turns green live. {agent ? `It's a ${vendorOf(agent.vendor).name} identity.` : ""}</p>{since && <span className="tiny dim mono">listening since {new Date(since).toLocaleTimeString()}</span>}</>}
            </div>
          </section>
        </div>
        <style>{`@media(max-width:700px){.pairgrid{grid-template-columns:1fr!important}}`}</style>
      </main>
    </Shell>
  );
}

export default function Page() { return <Suspense fallback={null}><Connect /></Suspense>; }
