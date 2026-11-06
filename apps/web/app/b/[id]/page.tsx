"use client";
import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import type { Vendor } from "@supabrain/shared";
import { BrainFrame } from "@/components/BrainFrame";
import { CommitGraph, type Lane } from "@/components/CommitGraph";
import { AgentCard, Drawer, LiveLog, Meters, useHeadMap, writesToday } from "@/components/BrainParts";
import { Funnel, OutcomesPerAI, RuleHits, Timeline } from "@/components/Charts";
import { useHref, useBrainId } from "@/components/Shell";
import { Empty, Fig, useNow } from "@/components/ui";
import { useStore } from "@/lib/store";

function BrainPage() {
  const id = useBrainId();
  const href = useHref();
  const brain = useStore((s) => s.brain);
  const nodes = useStore((s) => s.nodes);
  const blocked = useStore((s) => s.blocked);
  const rules = useStore((s) => s.rules);
  const heads = useStore((s) => s.heads);
  const checkpoints = useStore((s) => s.checkpoints);
  const cascade = useStore((s) => s.cascade);
  const connected = useStore((s) => s.connected);
  const pulse = useStore((s) => s.pulse);
  const loaded = useStore((s) => s.loaded);
  const headMap = useHeadMap();
  const now = useNow(1000);
  const [sel, setSel] = useState<string>();
  const [hot, setHot] = useState<Set<string>>();
  const [tab, setTab] = useState<"graph" | "ais" | "log">("graph");
  const all = useMemo(() => Object.values(nodes), [nodes]);

  const lanes: Lane[] = useMemo(() => {
    const ids = [...(brain?.agents.map((a) => a.label) ?? [])];
    if (all.some((n) => n.agent === "owner")) ids.unshift("owner");
    for (const n of all) if (!ids.includes(n.agent)) ids.push(n.agent);
    return ids.map((l) => {
      const a = brain?.agents.find((x) => x.label === l);
      return {
        id: l, ens: a?.ens ?? l, vendor: (a?.vendor ?? (l === "owner" ? "human" : all.find((n) => n.agent === l)?.vendor ?? "human")) as Vendor,
        count: all.filter((n) => n.agent === l && n.kind === "checkpoint").length,
        on: !!(connected[l] ?? a?.connectedClient), pulse: !!pulse && pulse.agent === l && now - pulse.at < 2500,
      };
    });
  }, [brain, all, connected, pulse, now]);

  return (
    <BrainFrame lede={<>Several AIs from different companies work on this project. Every commit is signed on Arkiv by the AI that made it; every AI&apos;s rules are public ENS records the server enforces on every call. Click any commit for its proof and lineage.</>}>
      <div className="wrapx"><Meters /></div>
      <div className="mtabs" role="group" aria-label="Panels">
        {(["graph", "ais", "log"] as const).map((t) => <button key={t} aria-pressed={tab === t} onClick={() => setTab(t)}>{t === "graph" ? "Commits" : t === "ais" ? "AIs" : "Live log"}</button>)}
      </div>
      <div className="bgrid">
        <aside className={`rail${tab !== "ais" ? " mhide" : ""}`} aria-label="The AIs">
          <div className="row" style={{ justifyContent: "space-between" }}><span className="eyebrow"><i />AIs · {brain?.agents.length ?? 0}</span><Link className="btn g xs" href={href("/connect")}>+ Connect</Link></div>
          {!brain && [0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 180 }} />)}
          {brain?.agents.map((a) => <AgentCard key={a.label} a={a} rule={rules?.agents.find((r) => r.agent === a.label)} head={heads.find((h) => h.agent === a.label)} />)}
          <Link className="btn g sm wide" href={href(`/b/${id}/rules`)}>Rules on ENS →</Link>
        </aside>
        <section className={`stage${tab !== "graph" ? " mhide" : ""}`} aria-label="Commit graph">
          <div className="stagebar">
            <span className="mono tiny dim">FIG. 1</span><b>Commit graph</b>
            <span className="small muted hide-sm">one lane per AI · newest at the bottom</span>
            <span className="spacer" />
            {hot && <button className="btn g xs" onClick={() => setHot(undefined)}>Clear highlight</button>}
            <Link className="btn p xs" href={href(`/b/${id}/lab`)}>Open the attack lab →</Link>
          </div>
          <div className="canvas">
            {!loaded && <div className="empty"><span className="spinner" /><div>Rebuilding this brain from Arkiv…</div></div>}
            {loaded && all.length === 0 && blocked.length === 0 && (
              <Empty title="No checkpoints yet"><p>Connect an AI and ask it to build something, or open the attack lab.</p><div className="row"><Link className="btn p sm" href={href("/connect")}>Connect an AI</Link><Link className="btn g sm" href={href(`/b/${id}/lab`)}>Attack lab</Link></div></Empty>
            )}
            {(all.length > 0 || blocked.length > 0) && <CommitGraph nodes={all} blocked={blocked} lanes={lanes} heads={headMap} selected={sel} hot={hot} cascade={cascade} onSelect={(k) => { setSel(k); setTab("graph"); }} />}
          </div>
          <div className="legend" aria-label="Legend">
            <span><i style={{ background: "var(--vc)" }} />checkpoint (fill = AI)</span>
            <span><i style={{ border: "1.5px dashed var(--muted)" }} />SAVING / outside content</span>
            <span><i style={{ border: "1.5px solid var(--lie)" }} />STOPPED ✕</span>
            <span><i style={{ background: "var(--lie)", borderRadius: 2 }} />BLOCKED (nothing written)</span>
            <span><i style={{ border: "2px solid var(--amber)" }} />HEAD on ENS</span>
            <span className="mono">T1/T2/T3 trust</span>
          </div>
          {sel && nodes[sel] && <Drawer k={sel} onClose={() => setSel(undefined)} onSelect={setSel} onHot={setHot} />}
        </section>
        <section className={`logcol${tab !== "log" ? " mhide" : ""}`} aria-label="Live log"><LiveLog onSelect={(k) => { setSel(k); setTab("graph"); }} /></section>
      </div>
      <section className="analysis wrapx" aria-label="Analysis">
        <div className="row" style={{ margin: "26px 0 12px" }}><span className="eyebrow"><i />Analysis · live</span></div>
        <div className="figgrid">
          <Funnel id={id} />
          <OutcomesPerAI id={id} />
          <RuleHits id={id} />
          <Timeline id={id} />
        </div>
        <Fig n={7} title="Where each AI stands against its ENS write limit" how="Bars fill as an AI checkpoints today; at 100% the next write is BLOCKED BY ENS · sb.write.daily." source={`GET /api/brains/${id}/checkpoints + /rules`}>
          <div className="bars">
            {brain?.agents.map((a) => {
              const daily = Number(rules?.agents.find((r) => r.agent === a.label)?.writeDaily ?? a.writeDaily ?? 0);
              const n = writesToday(checkpoints, a.label);
              const pct = daily ? Math.min(100, (n / daily) * 100) : 0;
              return (
                <div key={a.label} className="brow">
                  <span className="mono small ell" style={{ width: 220 }}>{a.ens}</span>
                  <div className="stack"><i style={{ width: `${pct}%`, background: pct >= 100 ? "var(--lie)" : pct >= 80 ? "var(--amber)" : "var(--flow)" }} /></div>
                  <span className="mono tiny" style={{ width: 120, textAlign: "right" }}>{n} / {daily || "—"}{pct >= 100 ? " · AT LIMIT" : ""}</span>
                </div>
              );
            })}
          </div>
        </Fig>
      </section>
    </BrainFrame>
  );
}

export default function Page() { return <Suspense fallback={null}><BrainPage /></Suspense>; }
