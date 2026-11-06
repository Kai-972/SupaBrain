"use client";
import { Suspense, useState } from "react";
import { BrainFrame } from "@/components/BrainFrame";
import { useHeadMap } from "@/components/BrainParts";
import { useStore } from "@/lib/store";
import { ago, clock, short, vendorOf } from "@/lib/format";
import { Ext, NodeStatus, Trust, VendorBadge } from "@/components/ui";

function History() {
  const checkpoints = useStore((s) => s.checkpoints);
  const tasks = useStore((s) => s.tasks);
  const brain = useStore((s) => s.brain);
  const loaded = useStore((s) => s.loaded);
  const heads = useHeadMap();
  const [who, setWho] = useState<string>();
  const rows = checkpoints.filter((c) => !who || c.agent === who);
  return (
    <BrainFrame title="History · git log" lede="Every checkpoint, newest first, with the Arkiv entity it was signed into. HEAD marks the commit each AI's ENS name points at.">
      <main className="page v2">
        <div className="filters" style={{ marginBottom: 12 }}>
          <button aria-pressed={!who} onClick={() => setWho(undefined)}>All AIs · {checkpoints.length}</button>
          {brain?.agents.map((a) => <button key={a.label} aria-pressed={who === a.label} onClick={() => setWho(a.label)}><span className={`vb ${vendorOf(a.vendor).cls}`} style={{ width: 14, height: 14, fontSize: 8 }}>{vendorOf(a.vendor).letter}</span>{a.label} · {checkpoints.filter((c) => c.agent === a.label).length}</button>)}
        </div>
        {!loaded && <div className="skeleton" style={{ height: 120 }} />}
        {loaded && rows.length === 0 && <div className="card pad muted">No checkpoints yet.</div>}
        <div className="gitlog">
          {rows.map((c) => (
            <article key={c.key} className={`commit${c.status === "quarantined" ? " q" : ""}`}>
              <div className="row wrapr" style={{ gap: 8 }}>
                <VendorBadge vendor={c.vendor} />
                <span className="mono small">{brain?.agents.find((a) => a.label === c.agent)?.ens ?? c.agent}</span>
                <NodeStatus n={{ status: c.status, pending: c.pending }} head={heads[c.agent] === c.key} />
                <Trust t={c.trust} />
                {c.client && <span className="chip">{c.client === "supabrain-lab" ? "LAB" : `MCP · ${c.client}`}</span>}
                <span className="spacer" />
                <span className="mono tiny dim">{clock(c.createdAt)} · {ago(c.createdAt)}</span>
              </div>
              <div className={`memtext${c.status === "quarantined" ? " q" : ""}`} style={{ fontSize: "1rem", margin: "6px 0" }}>{c.summary}</div>
              {c.why && <div className="small" style={{ color: "var(--lie)" }}>stopped: {c.why}</div>}
              <div className="small muted">
                {c.next && <>next: {c.next} · </>}
                {c.done.length ? <>ticked {c.done.map((d) => tasks.find((t) => t.key === d)?.title ?? short(d)).join(", ")} · </> : null}
                {c.files.length ? <>files {c.files.join(", ")} · </> : null}
                {c.parents.length} parent{c.parents.length === 1 ? "" : "s"}
              </div>
              <div className="row" style={{ marginTop: 6 }}><span className="mono tiny dim">{short(c.key, 10, 8)}</span>{c.proofUrl && <Ext href={c.proofUrl}>Arkiv</Ext>}</div>
            </article>
          ))}
        </div>
      </main>
    </BrainFrame>
  );
}
export default function Page() { return <Suspense fallback={null}><History /></Suspense>; }
