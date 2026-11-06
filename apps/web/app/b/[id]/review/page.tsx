"use client";
import { Suspense } from "react";
import Link from "next/link";
import { BrainFrame } from "@/components/BrainFrame";
import { useBrainId, useHref } from "@/components/Shell";
import { useStore } from "@/lib/store";
import { ago, clock, GUARD_RULES, vendorOf } from "@/lib/format";
import { Ext } from "@/components/ui";

function Review() {
  const review = useStore((s) => s.review);
  const blocked = useStore((s) => s.blocked);
  const checkpoints = useStore((s) => s.checkpoints);
  const brain = useStore((s) => s.brain);
  const loaded = useStore((s) => s.loaded);
  const id = useBrainId();
  const href = useHref();
  // /review lists what this server stopped; quarantined checkpoints from earlier sessions still show from Arkiv.
  const older = checkpoints.filter((c) => c.status === "quarantined" && !review.some((r) => r.key === c.key));
  return (
    <BrainFrame title="Stopped for review" lede="Content that tried to steer another AI. It is kept, signed by the AI that relayed it, and revoked on Arkiv so no AI receives it. History is not rewritten.">
      <main className="page v2">
        {loaded && review.length === 0 && older.length === 0 && <div className="card pad"><b>Nothing stopped.</b> <span className="muted">Try the “Poisoned README” preset in the </span><Link className="link" href={href(`/b/${id}/lab`)}>attack lab</Link>.</div>}
        <div className="gitlog">
          {review.map((r) => {
            const v = vendorOf(brain?.agents.find((a) => a.label === r.agent)?.vendor);
            const b = blocked.find((x) => x.key === r.key);
            return (
              <article key={r.key} className="commit q">
                <div className="row wrapr" style={{ gap: 8 }}>
                  <span className="chip solid-bad">STOPPED · INJECTION{b?.rule ? ` · ${b.rule}` : ""}</span>
                  <span className={`vb ${v.cls}`}>{v.letter}</span><span className="mono small">relayed by {r.ens}</span>
                  <span className="spacer" /><span className="mono tiny dim">{clock(r.at)} · {ago(r.at)}</span>
                </div>
                <div className="excerpt" style={{ margin: "8px 0" }}>{r.excerpt}</div>
                <div className="small muted">{b?.rule && GUARD_RULES[b.rule] ? `${GUARD_RULES[b.rule]}. ` : ""}{r.reason}</div>
                <div className="row" style={{ marginTop: 8 }}>
                  {r.arkivUrl && <Ext href={r.arkivUrl}>Revocation on Arkiv</Ext>}
                  <span className="spacer" />
                  <button className="btn g xs" disabled title="Not built yet">Release · coming soon</button>
                </div>
              </article>
            );
          })}
          {older.map((c) => (
            <article key={c.key} className="commit q">
              <div className="row wrapr" style={{ gap: 8 }}><span className="chip solid-bad">STOPPED</span><span className="mono small">{brain?.agents.find((a) => a.label === c.agent)?.ens ?? c.agent}</span><span className="spacer" /><span className="mono tiny dim">{ago(c.createdAt)}</span></div>
              <div className="memtext q" style={{ fontSize: "1rem", margin: "6px 0" }}>{c.summary}</div>
              <div className="small muted">{c.why} · from an earlier server session (the rule name lives in that session&apos;s log)</div>
              {c.proofUrl && <div style={{ marginTop: 6 }}><Ext href={c.proofUrl}>Arkiv</Ext></div>}
            </article>
          ))}
        </div>
      </main>
    </BrainFrame>
  );
}
export default function Page() { return <Suspense fallback={null}><Review /></Suspense>; }
