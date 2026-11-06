"use client";
// Figures 2–9 (docs/FRONTEND_CONTENT.md §6). Hand-written SVG, every colour paired with a text label.
import { useMemo } from "react";
import { explorerFromTx, type HeadRow, type Registry } from "@/lib/api";
import { useStore } from "@/lib/store";
import { classOf, ENS_RULES, GUARD_RULES, short, vendorOf } from "@/lib/format";
import { Ext, Fig, useNow } from "./ui";
import { useCounts } from "./BrainParts";

/** Fig. 2: what each layer stopped. */
export function Funnel({ id }: { id: string }) {
  const c = useCounts();
  const steps = [
    { l: "Actions the server decided on", v: c.attempts, note: "saved + stopped + blocked" },
    { l: "Passed identity (ENS name, key = ENS address)", v: c.attempts - c.identity, cut: c.identity, why: "blocked at identity" },
    { l: "Passed ENS rules (status, scope, writes/day)", v: c.attempts - c.identity - c.ens, cut: c.ens, why: "blocked by ENS" },
    { l: "Passed the content check", v: c.saved, cut: c.stopped, why: "stopped as injection" },
  ];
  const max = Math.max(1, c.attempts);
  return (
    <Fig n={2} title="Defense funnel" how="Each bar is what got through the layer above it. The red figure is what that layer stopped." source={`GET /api/brains/${id}/checkpoints + /blocked`}>
      <div className="funnel">
        {steps.map((s, i) => (
          <div key={s.l} className="frow">
            <div className="flabel small">{s.l}</div>
            <div className="fbar"><i style={{ width: `${(s.v / max) * 100}%`, background: i === steps.length - 1 ? "var(--flow)" : "var(--line2)" }} /><b className="mono">{s.v}</b></div>
            <div className="fcut mono tiny">{s.cut ? <span style={{ color: "var(--lie)" }}>−{s.cut} {s.why}</span> : s.note ?? <span className="dim">−0</span>}</div>
          </div>
        ))}
      </div>
    </Fig>
  );
}

/** Fig. 3: outcomes per AI. */
export function OutcomesPerAI({ id }: { id: string }) {
  const checkpoints = useStore((s) => s.checkpoints);
  const blocked = useStore((s) => s.blocked);
  const brain = useStore((s) => s.brain);
  const agents = brain?.agents ?? [];
  const rows = agents.map((a) => {
    const saved = checkpoints.filter((c) => c.agent === a.label && c.status !== "quarantined").length;
    const stopped = checkpoints.filter((c) => c.agent === a.label && c.status === "quarantined").length;
    const ens = blocked.filter((b) => b.agent === a.label && classOf(b) === "ens").length;
    const ident = blocked.filter((b) => b.agent === a.label && classOf(b) === "identity").length;
    return { a, saved, stopped, ens, ident, total: saved + stopped + ens + ident };
  });
  const max = Math.max(1, ...rows.map((r) => r.total));
  const seg = (v: number, color: string, label: string, pattern?: boolean) => v ? <i key={label} title={`${label}: ${v}`} style={{ width: `${(v / max) * 100}%`, background: pattern ? `repeating-linear-gradient(45deg, ${color} 0 4px, transparent 4px 7px)` : color }} /> : null;
  return (
    <Fig n={3} title="Outcomes per AI" how="Which AI tried what, and what the system decided." source={`GET /api/brains/${id}/checkpoints + /blocked`}
      right={<span className="legend-inline"><span><i style={{ background: "var(--flow)" }} />saved</span><span><i style={{ background: "var(--lie)" }} />stopped</span><span><i style={{ background: "repeating-linear-gradient(45deg, var(--amber) 0 3px, transparent 3px 5px)" }} />blocked by ENS</span><span><i style={{ background: "var(--muted)" }} />identity</span></span>}>
      <div className="bars">
        {rows.map((r) => (
          <div key={r.a.label} className="brow">
            <span className="row small" style={{ gap: 6, width: 150 }}><span className={`vb ${vendorOf(r.a.vendor).cls}`}>{vendorOf(r.a.vendor).letter}</span><span className="mono ell">{r.a.label}</span></span>
            <div className="stack">{seg(r.saved, "var(--flow)", "saved")}{seg(r.stopped, "var(--lie)", "stopped")}{seg(r.ens, "var(--amber)", "blocked by ENS", true)}{seg(r.ident, "var(--muted)", "identity")}</div>
            <span className="mono tiny dim" style={{ width: 120, textAlign: "right" }}>{r.saved} · {r.stopped} · {r.ens} · {r.ident}</span>
          </div>
        ))}
      </div>
    </Fig>
  );
}

/** Fig. 5: which rule did the work. */
export function RuleHits({ id }: { id: string }) {
  const blocked = useStore((s) => s.blocked);
  const checkpoints = useStore((s) => s.checkpoints);
  const data = useMemo(() => {
    const m: Record<string, number> = {};
    for (const b of blocked) if (b.rule) m[b.rule] = (m[b.rule] ?? 0) + 1;
    // Stops survive a server restart on Arkiv even when the in-memory log doesn't: count unmatched ones as "stopped (rule not logged)".
    const logged = blocked.filter((b) => b.code === "STOPPED").length;
    const persisted = checkpoints.filter((c) => c.status === "quarantined").length;
    if (persisted > logged) m["stopped · rule not in this session's log"] = persisted - logged;
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [blocked, checkpoints]);
  const max = Math.max(1, ...data.map(([, v]) => v));
  return (
    <Fig n={5} title="Rule hits" how="Which rule decided. ENS rules are amber; content rules are red." source={`GET /api/brains/${id}/blocked`}>
      {data.length === 0 ? <div className="small muted">No rule has fired yet. Try the attack lab.</div> : (
        <div className="bars">
          {data.map(([rule, v]) => {
            const ens = ENS_RULES.includes(rule) || rule.startsWith("sb.");
            return (
              <div key={rule} className="brow" title={GUARD_RULES[rule] ?? rule}>
                <span className="mono small ell" style={{ width: 220 }}>{rule}</span>
                <div className="stack"><i style={{ width: `${(v / max) * 100}%`, background: ens ? "var(--amber)" : "var(--lie)" }} /></div>
                <span className="mono tiny" style={{ width: 90, textAlign: "right" }}>{v} · {ens ? "ENS" : "content"}</span>
              </div>
            );
          })}
        </div>
      )}
    </Fig>
  );
}

/** Fig. 6: ENS ⇄ Arkiv heads. */
export function HeadsTable({ id, heads }: { id: string; heads: HeadRow[] }) {
  const nodes = useStore((s) => s.nodes);
  return (
    <Fig n={6} title="ENS ⇄ Arkiv heads" how="✓ means the AI's public ENS name points at the same Arkiv commit our server has. Anyone can check it." source={`GET /api/brains/${id}/heads`}>
      <div className="tablewrap">
        <table className="rules">
          <thead><tr><th>AI name</th><th>sb.memory.head on ENS</th><th>Server&apos;s newest commit</th><th>Result</th><th>Proof</th></tr></thead>
          <tbody>
            {heads.length === 0 && <tr><td colSpan={5} className="muted small">No heads yet.</td></tr>}
            {heads.map((h) => {
              const n = h.ensHead ? nodes[h.ensHead] : undefined;
              return (
                <tr key={h.agent}>
                  <td className="mono small">{h.ens}</td>
                  <td className="mono tiny">{h.ensHead ? short(h.ensHead, 8, 6) : "—"}{n?.proofUrl && <> · <Ext href={n.proofUrl}>Arkiv</Ext></>}</td>
                  <td className="mono tiny">{h.serverHead ? short(h.serverHead, 8, 6) : "none in this session"}</td>
                  <td>{h.match ? <span className="chip ok">✓ MATCH</span> : h.ensHead && h.serverHead ? <span className="chip solid-bad">✗ MISMATCH</span> : <span className="chip">{h.error ? "ERROR" : "NOT COMPARABLE"}</span>}</td>
                  <td>{h.txUrl ? <Ext href={h.txUrl}>Sepolia tx</Ext> : <span className="tiny dim">{h.error ?? "—"}</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Fig>
  );
}

/** Fig. 8: security timeline over the last hour. */
export function Timeline({ id }: { id: string }) {
  const checkpoints = useStore((s) => s.checkpoints);
  const blocked = useStore((s) => s.blocked);
  const now = useNow(10_000);
  const span = 60 * 60 * 1000;
  const items = [
    ...checkpoints.filter((c) => c.status !== "quarantined").map((c) => ({ at: c.createdAt, k: "saved" as const })),
    ...checkpoints.filter((c) => c.status === "quarantined").map((c) => ({ at: c.createdAt, k: "stopped" as const })),
    ...blocked.filter((b) => b.code !== "STOPPED").map((b) => ({ at: b.at, k: "blocked" as const })),
  ].filter((x) => now - x.at < span);
  const W = 1000;
  return (
    <Fig n={8} title="Security timeline · last hour" how="When things happened. A cluster of ✕ means an attack arrived." source={`GET /api/brains/${id}/checkpoints + /blocked`}
      right={<span className="legend-inline"><span>● saved</span><span style={{ color: "var(--lie)" }}>✕ stopped</span><span style={{ color: "var(--amber)" }}>■ blocked</span></span>}>
      <svg viewBox={`0 0 ${W} 56`} style={{ width: "100%", height: 56, display: "block" }} role="img" aria-label="Events in the last hour">
        <line x1={0} x2={W} y1={30} y2={30} stroke="var(--line2)" />
        {[0, 15, 30, 45, 60].map((m) => <text key={m} x={W - (m / 60) * W + (m === 0 ? -4 : 0)} y={52} textAnchor={m === 0 ? "end" : "middle"} style={{ font: "10px var(--mono)", fill: "var(--dim)" }}>{m === 0 ? "now" : `-${m}m`}</text>)}
        {items.map((x, i) => {
          const cx = W - ((now - x.at) / span) * W;
          return x.k === "saved" ? <circle key={i} cx={cx} cy={30} r={4} fill="var(--flow)" />
            : x.k === "stopped" ? <text key={i} x={cx} y={34} textAnchor="middle" style={{ font: "700 13px var(--mono)", fill: "var(--lie)" }}>✕</text>
              : <rect key={i} x={cx - 4} y={26} width={8} height={8} fill="var(--amber)" />;
        })}
      </svg>
      {items.length === 0 && <div className="small muted">Nothing in the last hour.</div>}
    </Fig>
  );
}

/** Fig. 9: the registry map. */
export function RegistryMap({ reg }: { reg: Registry }) {
  const fams = ["claude", "gemini", "openai"];
  const explorer = explorerFromTx(reg.brains.find((b) => b.txUrls?.length)?.txUrls[0]);
  return (
    <Fig n={9} title="Registry map: brains × AI names" how="Every cell is a real ENS name with its own resolver. The outlined brain is the one served live." source="GET /api/registry">
      <div className="regmap">
        <div className="rm-h mono tiny dim">brain</div>
        {fams.map((f) => <div key={f} className="rm-h mono tiny dim">{f}</div>)}
        {reg.brains.map((b) => (
          <div key={b.label} className="rm-row" style={{ display: "contents" }}>
            <div className={`rm-b${b.served ? " live" : ""}`}><span className="mono small">{b.ens}</span>{b.served && <span className="chip ok">LIVE</span>}</div>
            {fams.map((f) => {
              const a = b.agents[f];
              const st = a?.records?.["sb.status"] ?? "—";
              return (
                <div key={f} className={`rm-c ${st === "active" ? "ok" : st === "paused" ? "bad" : ""}`} title={a ? `${a.ens}\nresolver ${a.resolver}\nwallet ${a.wallet}` : "missing"}>
                  {a ? <>{explorer ? <a href={`${explorer}/address/${a.resolver}`} target="_blank" rel="noreferrer noopener">{st.toUpperCase()}</a> : st.toUpperCase()}<span className="mono tiny dim">scope {a.records?.["sb.scope"] ?? "?"}</span></> : "—"}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </Fig>
  );
}

/** Fig. 4: how a handoff is checked, with live counts on each gate. */
export function Pipeline({ compact }: { compact?: boolean }) {
  const c = useCounts();
  const gates = [
    { n: "1", t: "Identity", d: "Is the AI's ENS name live, and does the server's key equal its ENS address?", out: "BLOCKED · KEY ≠ ENS", v: c.identity, kind: "guarantee" },
    { n: "2", t: "ENS rules", d: "sb.status · sb.scope · sb.write.daily, read live from ENS on every call.", out: "BLOCKED BY ENS · <rule>", v: c.ens, kind: "guarantee" },
    { n: "3", t: "Content", d: "A tripwire for injection shapes. Real secrets are refused before writing.", out: "STOPPED · INJECTION", v: c.stopped, kind: "tripwire" },
    { n: "4", t: "Record", d: "Signed on Arkiv by the AI's own wallet; its ENS name points at it.", out: "SAVED · HEAD", v: c.saved, kind: "guarantee" },
  ];
  return (
    <div className={`pipeline${compact ? " compact" : ""}`}>
      {gates.map((g, i) => (
        <div key={g.n} className={`gate ${i === 3 ? "ok" : i === 2 ? "trip" : ""}`}>
          <div className="row"><span className="gnum mono">{g.n}</span><b>{g.t}</b><span className="spacer" /><span className={`chip ${g.kind === "tripwire" ? "warn" : ""}`}>{g.kind.toUpperCase()}</span></div>
          <p className="small muted">{g.d}</p>
          <div className="row" style={{ justifyContent: "space-between" }}><span className={`chip ${i === 3 ? "ok" : "solid-bad"}`}>{g.out}</span><b className="mono tnum" style={{ fontSize: "1.3rem" }}>{g.v}</b></div>
        </div>
      ))}
    </div>
  );
}
