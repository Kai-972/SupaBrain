"use client";
// "This is wrong": preview the blast radius on the graph first, then revoke once (C-UI.md §3.2).
import { useEffect, useState } from "react";
import type { DryRun, RevocationTarget } from "@supabrain/shared";
import { api, ApiError, type RevokeResult } from "@/lib/api";
import { dryRun, refreshGraph, refreshPayments, toast, useStore } from "@/lib/store";
import { vendorOf, shortKey } from "@/lib/format";
import { Ext } from "./ui";

const TLABEL = { source: "The source", memory: "Just this memory", agent: "Everything this AI wrote" } as const;

export function DryRunPanel({ targets, onClose, onPreview }: { targets: RevocationTarget[]; onClose: () => void; onPreview: (keys: Set<string> | undefined) => void }) {
  const [ti, setTi] = useState(0);
  const target = targets[ti];
  const nodes = useStore((s) => s.nodes);
  const mode = useStore((s) => s.mode);
  const [dry, setDry] = useState<DryRun>();
  const [err, setErr] = useState<string>();
  const [phase, setPhase] = useState<"preview" | "writing" | "done">("preview");
  const [res, setRes] = useState<RevokeResult>();
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (phase !== "preview") return;
    setDry(undefined); setErr(undefined);
    let live = true;
    dryRun(target).then((d) => { if (!live) return; setDry(d); onPreview(new Set(d.memories)); })
      .catch((e) => live && setErr(e instanceof ApiError ? e.message : "Dry run failed"));
    return () => { live = false; };
  }, [target.type, target.id, phase]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => onPreview(undefined), []); // eslint-disable-line react-hooks/exhaustive-deps

  const revoke = async () => {
    setPhase("writing"); onPreview(undefined);
    try {
      const r = mode === "mock" ? await (await import("@/lib/mock")).mockRevoke(target) as RevokeResult : await api.revoke(target, reason || undefined);
      setRes(r); setPhase("done");
      await Promise.all([refreshGraph().catch(() => {}), refreshPayments().catch(() => {})]);
    } catch (e) {
      setPhase("preview"); toast(e instanceof ApiError ? e.message : "Revoke failed", "bad");
    }
  };

  const byAgent: Record<string, string[]> = {};
  for (const k of dry?.memories ?? []) (byAgent[nodes[k]?.agent ?? "expired"] ??= []).push(k);
  const notified = res?.notified ? (Array.isArray(res.notified) ? res.notified.length : res.notified) : 0;

  return (
    <aside className="sidepanel" aria-label="Dry run and revoke">
      <div className="hd">
        <div className="row"><span className="eyebrow bad"><i />{phase === "done" ? "Revoked" : "Blast radius · dry run"}</span><span className="spacer" /><button className="iconbtn" onClick={onClose} aria-label="Close">×</button></div>
        <h2 style={{ margin: "10px 0 4px", fontSize: "1.2rem", fontWeight: 500, letterSpacing: "-.02em" }}>
          {phase === "done" ? "Taken back from every AI." : "Nothing has changed yet."}
        </h2>
        <div className="small muted">{phase === "done" ? "Good work stayed. The red memories are now flagged QUARANTINED for every AI that recalls them." : "Everything in red on the graph is built on this. Check it, then revoke once."}</div>
      </div>
      <div className="bd">
        {phase === "preview" && targets.length > 1 && (
          <div>
            <div className="section-t">What is wrong?</div>
            <div className="segm" role="group" aria-label="Revoke scope">
              {targets.map((t, i) => <button key={t.type + t.id} aria-pressed={i === ti} onClick={() => setTi(i)} title={t.id}>{TLABEL[t.type]}</button>)}
            </div>
            <div className="mono tiny dim" style={{ marginTop: 6 }}>{target.type}:{target.type === "memory" ? shortKey(target.id) : target.id}</div>
          </div>
        )}
        {err && <div className="callout bad">{err}</div>}
        {!dry && !err && phase === "preview" && <div className="row muted small"><span className="spinner" /> Tracing everything built on it…</div>}
        {phase !== "preview" && (
          <div className="steps" aria-live="polite">
            <Step state={phase === "writing" ? "run" : "done"} label="Revocation signed and written to Arkiv" href={res?.arkivUrl} note={phase === "writing" ? "writing to Arkiv… (about 5 s)" : undefined} />
            {phase === "done" && <>
              <Step state={res?.paymentsError ? "err" : "done"} label={res?.vaultTxUrl ? "BrainVault told on chain: this root can't pay" : res?.paymentsError ? `Vault step failed: ${res.paymentsError}` : "Vault: no on-chain root needed"} href={res?.vaultTxUrl} />
              <Step state="done" label={`${res?.cancelled?.length ?? 0} pending payment${(res?.cancelled?.length ?? 0) === 1 ? "" : "s"} cancelled`} />
              <Step state="done" label={`Retraction notices queued for ${notified} AI${notified === 1 ? "" : "s"}`} />
              <Step state="done" label={`${res?.affected.length ?? 0} memories quarantined in Claude, Gemini and ChatGPT`} />
              {res?.ensNote && <div className="callout warn small"><b>Next:</b> {res.ensNote}</div>}
            </>}
          </div>
        )}
        {dry && (
          <>
            <div className="callout bad" style={{ fontWeight: 500 }}>
              {target.type === "source" ? "1 source" : target.type === "agent" ? "1 AI" : "1 memory"} · {dry.memories.length} memories · {dry.agents.length} AIs · {dry.vendors.length} companies · read by {dry.readers.length}{dry.pendingPayments.length ? ` · ${dry.pendingPayments.length} pending payment${dry.pendingPayments.length > 1 ? "s" : ""}` : ""}
            </div>
            <div className="blastnums">
              <div className="bad">Memories<b>{dry.memories.length}</b></div>
              <div>AIs<b>{dry.agents.length}</b></div>
              <div>Companies<b>{dry.vendors.length}</b></div>
            </div>
            <div className="row wrapr">{dry.vendors.map((v) => <span key={v} className="chip"><span className={`vb ${vendorOf(v).cls}`} style={{ width: 14, height: 14, fontSize: 8 }}>{vendorOf(v).letter}</span>{vendorOf(v).company}</span>)}</div>
            {dry.memories.length === 0 && <div className="callout">Nothing active is built on this (it may already be revoked).</div>}
            {phase === "preview" && Object.entries(byAgent).map(([agent, keys]) => (
              <div key={agent}>
                <div className="section-t">{agent === "owner" ? "people" : agent} · {keys.length}</div>
                {keys.map((k) => <div key={k} className="small" style={{ padding: "4px 0", borderBottom: "1px solid var(--line)", color: "var(--lie-text)" }}>{nodes[k]?.text ?? shortKey(k)}</div>)}
              </div>
            ))}
            <div className="callout ok small"><b>Stays green:</b> {Object.values(nodes).filter((n) => !dry.memories.includes(n.key) && n.status === "active").length} memories that don&apos;t depend on it, including every HUMAN note.</div>
            {phase === "preview" && mode !== "mock" && <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (optional, public on Arkiv)" aria-label="Reason" />}
          </>
        )}
      </div>
      <div className="ft">
        {phase === "done"
          ? <button className="btn g wide" onClick={onClose}>Done</button>
          : <>
            <button className="btn g" onClick={onClose} disabled={phase === "writing"}>Cancel</button>
            <button className="btn r grow" disabled={!dry || phase === "writing" || dry.memories.length === 0} onClick={revoke}>
              {phase === "writing" ? <><span className="spinner" /> Revoking…</> : `Revoke from every AI`}
            </button>
          </>}
      </div>
    </aside>
  );
}

function Step({ state, label, href, note }: { state: "run" | "done" | "err"; label: string; href?: string; note?: string }) {
  return (
    <div className={`s ${state === "done" ? "done" : state === "err" ? "err" : ""}`}>
      <span className="ck">{state === "run" ? <span className="spinner" /> : state === "err" ? "!" : "✓"}</span>
      <span className="grow">{label}{note && <span className="tiny muted" style={{ display: "block" }}>{note}</span>}</span>
      {href && <Ext href={href}>proof</Ext>}
    </div>
  );
}

