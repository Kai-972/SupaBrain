"use client";
// Live (UI_REDESIGN_PROMPT.md §5.3): one sentence and three numbers, then the graph is the whole screen. AI details
// live in the lane headers (click), commit details in the side panel, the log in a bottom drawer, charts in Insights.
import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import type { Vendor } from "@supabrain/shared";
import { BrainFrame } from "@/components/BrainFrame";
import { LiveGraph, type Lane } from "@/components/LiveGraph";
import { SidePanel } from "@/components/SidePanel";
import { LiveLog, Meters, useCounts, useHeadMap, writesToday } from "@/components/BrainParts";
import { Funnel, OutcomesPerAI, RuleHits, Timeline } from "@/components/Charts";
import { useBrainId, useHref } from "@/components/Shell";
import { Copy, Ext, useNow } from "@/components/ui";
import { useStore } from "@/lib/store";
import { vendorOf } from "@/lib/format";

function LanePopover({ lane, rect, onClose }: { lane: Lane; rect: DOMRect; onClose: () => void }) {
  const href = useHref();
  const id = useBrainId();
  const checkpoints = useStore((s) => s.checkpoints);
  const heads = useStore((s) => s.heads);
  const a = lane.agent;
  const r = lane.rule;
  const head = heads.find((h) => h.agent === lane.id);
  const daily = Number(r?.writeDaily ?? a?.writeDaily ?? 0);
  const used = writesToday(checkpoints, lane.id);
  const left = Math.min(Math.max(12, rect.left), (typeof window !== "undefined" ? innerWidth : 1200) - 392);
  return (
    <>
      <div className="scrim4 clear" onClick={onClose} />
      <div className="pop4" style={{ top: rect.bottom + 10, left }} role="dialog" aria-label={`${lane.ens} rules`}>
        <div className="row"><span className={`dot4 big ${vendorOf(lane.vendor).cls}`} /><div className="grow"><b className="mono">{lane.ens}</b><div className="small muted">{a?.connectedClient ? `Connected via ${a.connectedClient}` : "Not connected right now"}</div></div><Copy text={lane.ens} /></div>
        {a ? (
          <dl className="rules4">
            <dt>Status</dt><dd>{a.status === "active" ? "Active" : a.status === "paused" ? "Paused: every call is refused" : a.status}</dd>
            <dt>May write</dt><dd>{(r?.scope ?? a.scope) === "*" ? "Everywhere in the project" : `Only ${r?.scope ?? a.scope}`}</dd>
            <dt>Writes today</dt><dd>{used} of {daily || "no limit"}</dd>
            <dt>Role</dt><dd>{r?.role ?? a.role}</dd>
            <dt>HEAD on ENS</dt><dd>{head?.match ? <>✓ points at its newest commit {head.txUrl && <Ext href={head.txUrl}>tx</Ext>}</> : head?.ensHead ? "points at an older commit" : "not set yet"}</dd>
          </dl>
        ) : <p className="muted">The brain owner, through the website.</p>}
        <p className="small muted" style={{ margin: 0 }}>These are ENS text records on {lane.ens}. The server reads them on every call.</p>
        <div className="row">
          <Link className="btn p sm" href={href(`/b/${id}/lab?rules=${lane.id}`)}>Change rules</Link>
          <Link className="btn g sm" href={href("/connect")}>Connect an app</Link>
        </div>
      </div>
    </>
  );
}

function BrainPage() {
  const id = useBrainId();
  const href = useHref();
  const brain = useStore((s) => s.brain);
  const nodes = useStore((s) => s.nodes);
  const blocked = useStore((s) => s.blocked);
  const rules = useStore((s) => s.rules);
  const heads = useStore((s) => s.heads);
  const cascade = useStore((s) => s.cascade);
  const connected = useStore((s) => s.connected);
  const pulse = useStore((s) => s.pulse);
  const loaded = useStore((s) => s.loaded);
  const recent = useStore((s) => s.recent);
  const feedCount = useStore((s) => s.feed.length);
  const headMap = useHeadMap();
  const c = useCounts();
  const now = useNow(1000);
  const [sel, setSel] = useState<string>();
  const [hot, setHot] = useState<Set<string>>();
  const [pop, setPop] = useState<{ lane: string; rect: DOMRect }>();
  const [details, setDetails] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [newestFirst, setNewestFirst] = useState(false);
  const [fit, setFit] = useState(false);
  const all = useMemo(() => Object.values(nodes), [nodes]);

  const lanes: Lane[] = useMemo(() => {
    const ids = [...(brain?.agents.map((a) => a.label) ?? [])];
    if (all.some((n) => n.agent === "owner")) ids.unshift("owner");
    for (const n of all) if (!ids.includes(n.agent)) ids.push(n.agent);
    return ids.map((l) => {
      const a = brain?.agents.find((x) => x.label === l);
      return {
        id: l, ens: a?.ens ?? l, vendor: (a?.vendor ?? (l === "owner" ? "human" : all.find((n) => n.agent === l)?.vendor ?? "human")) as Vendor,
        count: all.filter((n) => n.agent === l && n.kind === "checkpoint").length, agent: a, rule: rules?.agents.find((r) => r.agent === l),
        on: !!(connected[l] ?? a?.connectedClient), pulse: !!pulse && pulse.agent === l && now - pulse.at < 2500,
        headOk: heads.find((h) => h.agent === l)?.match,
      };
    });
  }, [brain, all, connected, pulse, now, rules, heads]);
  const popLane = pop && lanes.find((l) => l.id === pop.lane);

  return (
    <BrainFrame>
      <section className="live4-head wrapx" data-tour="graph-head">
        <h1 className="headline4">
          <span className="n">{c.saved}</span> commit{c.saved === 1 ? "" : "s"} signed <span className="sep">·</span>{" "}
          <span className="n bad">{c.stopped}</span> injection{c.stopped === 1 ? "" : "s"} stopped <span className="sep">·</span>{" "}
          <span className="n bad">{c.ens}</span> blocked by ENS
        </h1>
        <p className="lede4">Each column is one AI with its own ENS name. Each dot is a commit signed by that AI on Arkiv. Click a dot for its proof, or a column header for that AI&apos;s rules.</p>
        <div className="row wrapr">
          <Link className="btn p" href={href(`/b/${id}/lab`)} data-tour="try">Try to break it →</Link>
          <button className="btn g" aria-expanded={details} onClick={() => setDetails(!details)}>{details ? "Hide details" : "Details"}</button>
        </div>
        {details && <div className="details4"><Meters /></div>}
      </section>

      <section className="lg4-wrap" aria-label="Commit graph" data-tour="graph">
        <div className="lg4-tools wrapx">
          <span className="small muted">{newestFirst ? "Newest at the top" : "Newest at the bottom"}</span>
          <span className="spacer" />
          {hot && <button className="btn g sm" onClick={() => setHot(undefined)}>Clear highlight</button>}
          <button className="btn g sm" aria-pressed={newestFirst} onClick={() => setNewestFirst(!newestFirst)}>{newestFirst ? "Newest last" : "Newest first"}</button>
          <button className="btn g sm" aria-pressed={fit} onClick={() => setFit(!fit)}>{fit ? "Full size" : "Fit to screen"}</button>
        </div>
        <div className="lg4-scroll">
          {!loaded && <div className="empty4"><span className="spinner" /><p>Rebuilding this brain from Arkiv…</p></div>}
          {loaded && all.length === 0 && blocked.length === 0 && (
            <div className="empty4"><h2>No commits yet</h2><p>Connect an AI and ask it to build something, or try the attack lab.</p><div className="row"><Link className="btn p" href={href("/connect")}>Connect an AI</Link><Link className="btn g" href={href(`/b/${id}/lab`)}>Try it</Link></div></div>
          )}
          {(all.length > 0 || blocked.length > 0) && (
            <LiveGraph nodes={all} blocked={blocked} lanes={lanes} heads={headMap} selected={sel} hot={hot} recent={recent} cascade={cascade} newestFirst={newestFirst} fit={fit}
              onSelect={setSel} onLane={(lane, rect) => setPop({ lane, rect })} />
          )}
        </div>
      </section>

      <section className="insights4 wrapx" id="insights" aria-label="Insights">
        <h2 className="h2-4">Insights</h2>
        <p className="lede4">Live numbers from the same API. One question per chart.</p>
        <Funnel id={id} />
        <OutcomesPerAI id={id} />
        <RuleHits id={id} />
        <Timeline id={id} />
      </section>

      <div className={`logdrawer4${logOpen ? " open" : ""}`}>
        <button className="ld-tab" aria-expanded={logOpen} onClick={() => setLogOpen(!logOpen)}>
          <span className="dot ok pulse" /> Live log · {feedCount} event{feedCount === 1 ? "" : "s"} <span className="muted">{logOpen ? "Hide ↓" : "Show ↑"}</span>
        </button>
        {logOpen && <div className="ld-body"><LiveLog onSelect={(k) => setSel(k)} limit={80} /></div>}
      </div>

      {popLane && pop && <LanePopover lane={popLane} rect={pop.rect} onClose={() => setPop(undefined)} />}
      {sel && nodes[sel] && <SidePanel k={sel} onClose={() => setSel(undefined)} onSelect={setSel} onHot={setHot} />}
    </BrainFrame>
  );
}

export default function Page() { return <Suspense fallback={null}><BrainPage /></Suspense>; }
