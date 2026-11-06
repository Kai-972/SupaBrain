"use client";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import type { RevocationTarget, Vendor } from "@supabrain/shared";
import { Shell, useHref } from "@/components/Shell";
import { LineageGraph, type Lane } from "@/components/LineageGraph";
import { AgentsRail } from "@/components/AgentsRail";
import { Drawer } from "@/components/Drawer";
import { DryRunPanel } from "@/components/DryRunPanel";
import { AddContext, BeforeAfter, Feed, PitchGuide } from "@/components/BrainExtras";
import { ancestors, descendants, useStore } from "@/lib/store";
import { TRUST, vendorOf, ago, isSourceRoot } from "@/lib/format";
import { StatusChips, VendorBadge } from "@/components/ui";
import type { GraphNode } from "@/lib/api";

type StatusF = "all" | "active" | "quarantined" | "disputed";

function Brain() {
  const sp = useSearchParams();
  const href = useHref();
  const nodes = useStore((s) => s.nodes);
  const team = useStore((s) => s.team);
  const cascade = useStore((s) => s.cascade);
  const loaded = useStore((s) => s.loaded);
  const conn = useStore((s) => s.conn);
  const admin = useStore((s) => s.admin);
  const connected = useStore((s) => s.connected);
  const mode = useStore((s) => s.mode);

  const [sel, setSel] = useState<string | undefined>(sp.get("m") ?? undefined);
  const [hot, setHot] = useState<string[][] | undefined>(() => { const p = sp.get("path"); return p ? [p.split(",")] : undefined; });
  const [blast, setBlast] = useState<Set<string>>();
  const [targets, setTargets] = useState<RevocationTarget[]>();
  const [view, setView] = useState<"graph" | "list">("graph");
  const [statusF, setStatusF] = useState<StatusF>("all");
  const [trustF, setTrustF] = useState<number>(0);
  const [agentF, setAgentF] = useState<string>();
  const [focusOn, setFocusOn] = useState(true);
  const [modal, setModal] = useState<"add" | "ba">();
  const [guide, setGuide] = useState(false);
  useEffect(() => { setGuide(sp.get("guide") !== "0" && matchMedia("(min-width: 821px)").matches); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [mtab, setMtab] = useState<"graph" | "agents" | "feed">("graph");

  useEffect(() => { if (sel && !nodes[sel] && Object.keys(nodes).length) setSel(undefined); }, [nodes, sel]);

  const all = useMemo(() => Object.values(nodes), [nodes]);
  const shown = useMemo(() => all.filter((n) =>
    (statusF === "all" || (statusF === "disputed" ? n.dispute?.state === "disputed" && n.status !== "quarantined" : n.status === statusF)) &&
    (!trustF || n.trust === trustF) && (!agentF || n.agent === agentF)), [all, statusF, trustF, agentF]);

  const lanes: Lane[] = useMemo(() => {
    const first: Record<string, number> = {};
    for (const n of all) first[n.agent] = Math.min(first[n.agent] ?? Infinity, n.seq);
    const ids = new Set<string>([...Object.keys(first), ...(team?.agents.map((a) => a.label) ?? [])]);
    const order = [...ids].sort((a, b) => (a === "owner" ? -1 : b === "owner" ? 1 : (first[a] ?? 1e9) - (first[b] ?? 1e9)));
    return order.map((id) => {
      const a = team?.agents.find((x) => x.label === id);
      const vendor: Vendor = id === "owner" ? "human" : a?.vendor ?? (all.find((n) => n.agent === id)?.vendor as Vendor) ?? "human";
      return { id, label: id === "owner" ? "people" : id, sub: id === "owner" ? "owner" : vendorOf(vendor).name, vendor, count: all.filter((n) => n.agent === id).length, on: !!(connected[id] ?? a?.connectedClient) };
    });
  }, [all, team, connected]);

  const focus = useMemo(() => {
    if (!sel || !focusOn || !nodes[sel]) return undefined;
    const s = new Set<string>([sel, ...ancestors(nodes, sel), ...descendants(nodes, sel)]);
    return s;
  }, [sel, focusOn, nodes]);

  const select = useCallback((k: string) => { setSel(k); setHot(undefined); setMtab("graph"); }, []);
  const wrongFor = useCallback((k: string) => {
    const n = nodes[k]; if (!n) return;
    setTargets([...n.roots.filter(isSourceRoot).map((id) => ({ type: "source" as const, id })), { type: "memory", id: k }]);
  }, [nodes]);

  const counts = { total: all.length, q: all.filter((n) => n.status === "quarantined").length, d: all.filter((n) => n.dispute?.state === "disputed" && n.status !== "quarantined").length };
  const vendorsWriting = new Set(all.map((n) => n.vendor).filter((v) => v !== "human")).size;

  return (
    <Shell right={<div className="counts hide-md" aria-label="Team counts">
      <span><b>{counts.total}</b>memories</span>
      <span><b>{team?.agents.length ?? 0}</b>AIs</span>
      <span><b>{vendorsWriting}</b>companies</span>
      <span className="q"><b>{counts.q}</b>quarantined</span>
    </div>}>
      <div className="mtabs" role="group" aria-label="Panels">
        {(["graph", "agents", "feed"] as const).map((t) => <button key={t} aria-pressed={mtab === t} onClick={() => setMtab(t)}>{t === "graph" ? "Memory" : t === "agents" ? "AIs" : "Feed"}</button>)}
      </div>
      <div className={`brain${mode === "mock" || conn !== "open" ? " withbanner" : ""}`}>
        <aside className={`rail${mtab !== "agents" ? " mhide" : ""}`} aria-label="AIs on the team">
          <AgentsRail picked={agentF} onPick={(l) => { setAgentF(l); setMtab("graph"); }} onRevokeAgent={(label) => setTargets([{ type: "agent", id: label }])} />
        </aside>
        <section className={`stage${mtab !== "graph" ? " mhide" : ""}`} aria-label="Shared memory">
          <div className="stagebar">
            <h1>Team memory</h1>
            <span className="segm" role="group" aria-label="View">
              <button aria-pressed={view === "graph"} onClick={() => setView("graph")}>Graph</button>
              <button aria-pressed={view === "list"} onClick={() => setView("list")}>List</button>
            </span>
            <div className="filters" role="group" aria-label="Filters">
              {(["all", "active", "disputed", "quarantined"] as StatusF[]).map((f) => <button key={f} aria-pressed={statusF === f} onClick={() => setStatusF(f)}>{f === "all" ? `All ${counts.total}` : f === "quarantined" ? `Quarantined ${counts.q}` : f === "disputed" ? `Disputed ${counts.d}` : "Active"}</button>)}
              <button aria-pressed={trustF !== 0} onClick={() => setTrustF((t) => (t + 1) % 4)} title="Cycle trust filter">{trustF ? `Trust: ${TRUST[trustF as 1].word}` : "Any trust"}</button>
              {agentF && <button aria-pressed onClick={() => setAgentF(undefined)}>{agentF} ×</button>}
            </div>
            <span className="spacer" />
            <button className="btn g xs" aria-pressed={guide} onClick={() => setGuide((g) => !g)}>{guide ? "Hide guide" : "Pitch guide"}</button>
            <button className="btn g xs" onClick={() => setModal("ba")}>Before / after</button>
            <button className="btn p xs" disabled={!admin && mode !== "mock"} title={admin ? "Add a HUMAN-trust note" : "Owner sign-in needed"} onClick={() => setModal("add")}>{admin || mode === "mock" ? "+ Add context" : "🔒 Add context"}</button>
          </div>
          <div className="canvas" onClick={(e) => { if (e.target === e.currentTarget) setSel(undefined); }}>
            {!loaded && <div className="empty"><span className="spinner" /><div>Reading the team&apos;s memory from Arkiv…</div></div>}
            {loaded && all.length === 0 && conn !== "noserver" && (
              <div className="empty"><h3>No memories yet</h3><p>Connect an AI and ask it to remember something. It appears here the moment it writes.</p><Link className="btn p sm" href={href("/connect")}>Connect an AI →</Link></div>
            )}
            {loaded && conn === "noserver" && all.length === 0 && (
              <div className="empty"><h3>The Supabrain server isn&apos;t reachable</h3><p>This page only shows real data. Start the server, or open the labelled snapshot.</p><Link className="btn g sm" href="/t?mock=1">Open MOCK DATA snapshot</Link></div>
            )}
            {all.length > 0 && view === "graph" && (
              <LineageGraph nodes={shown} lanes={lanes} selected={sel} focus={blast || targets ? undefined : hot ? new Set(hot.flat()) : focus} hot={hot} blast={blast} cascade={cascade} onSelect={select} />
            )}
            {all.length > 0 && view === "list" && <ListView nodes={shown} onSelect={select} sel={sel} />}
          </div>
          {guide && all.length > 0 && !targets && (
            <PitchGuide left={!!sel} onClose={() => setGuide(false)} onFocus={(k) => { select(k); }} onWhy={(p) => { setHot(p); setSel(p[0]?.[0]); }} onWrong={(k) => wrongFor(k)} onBeforeAfter={() => setModal("ba")} />
          )}
          {view === "graph" && all.length > 0 && (
            <div className="legend" aria-label="Legend">
              <span><i style={{ background: "var(--fg)" }} />HUMAN note</span>
              <span><i style={{ background: "var(--flow)" }} />AI note</span>
              <span><i style={{ border: "1.5px dashed var(--muted)" }} />outside content</span>
              <span><i style={{ background: "var(--amber)", borderRadius: 2, transform: "rotate(45deg) scale(.8)" }} />payment</span>
              <span><i style={{ border: "1.5px solid var(--lie)" }} />quarantined ✕</span>
              <span><i style={{ border: "1.5px solid var(--amber)" }} />disputed by ENS</span>
              <span className="spacer" />
              <label className="row" style={{ gap: 6, cursor: "pointer" }}><input type="checkbox" checked={focusOn} onChange={(e) => setFocusOn(e.target.checked)} style={{ width: "auto" }} />focus family on click</label>
            </div>
          )}
          {sel && nodes[sel] && !targets && (
            <Drawer k={sel} onClose={() => { setSel(undefined); setHot(undefined); }} onSelect={select}
              whyOn={!!hot} onWhy={(p) => setHot(p)} onWrong={(t) => setTargets(t)} />
          )}
          {targets && <DryRunPanel targets={targets} onClose={() => { setTargets(undefined); setBlast(undefined); }} onPreview={setBlast} />}
        </section>
        <section className={`feedbar${mtab !== "feed" ? " mhide" : ""}`} aria-label="Live feed"><Feed onSelect={select} /></section>
      </div>
      {modal === "add" && <AddContext onClose={() => setModal(undefined)} />}
      {modal === "ba" && <BeforeAfter onClose={() => setModal(undefined)} />}
    </Shell>
  );
}

function ListView({ nodes, onSelect, sel }: { nodes: GraphNode[]; onSelect: (k: string) => void; sel?: string }) {
  const rows = [...nodes].sort((a, b) => b.seq - a.seq);
  return (
    <table className="list">
      <thead><tr><th>#</th><th>Memory</th><th>By</th><th>Trust</th><th>Status</th><th className="hide-sm">Written</th></tr></thead>
      <tbody>
        {rows.map((n) => (
          <tr key={n.key} className={n.status === "quarantined" ? "q" : ""} onClick={() => onSelect(n.key)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && onSelect(n.key)} aria-selected={sel === n.key}>
            <td className="mono dim">{n.seq}</td>
            <td><div className="txt">{n.text}</div><div className="tiny dim mono">{n.kind} · {n.folder}{n.source ? ` · ${n.source.id}` : ""}</div></td>
            <td><span className="row" style={{ gap: 6 }}><VendorBadge vendor={n.vendor} /><span className="mono tiny">{n.agent}</span></span></td>
            <td><span className="chip">{TRUST[n.trust].word}</span></td>
            <td><div className="row wrapr" style={{ gap: 4 }}><StatusChips n={n} /></div></td>
            <td className="hide-sm tiny muted">{ago(n.createdAt)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function Page() {
  return <Suspense fallback={null}><Brain /></Suspense>;
}
