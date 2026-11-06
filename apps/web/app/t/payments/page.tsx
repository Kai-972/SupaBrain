"use client";
// Payments (C-UI.md §3.5): every intent with its decision and every reason as text, plus the World approval card.
import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import type { ApprovalView, Payment } from "@supabrain/shared";
import { Shell, useHref } from "@/components/Shell";
import { api, ApiError } from "@/lib/api";
import { refreshPayments, toast, useStore } from "@/lib/store";
import { DECISION_WORD, decisionTone, isHard, reasonLabel, reasonText, short, shortKey, sortReasons, clock, ago, until } from "@/lib/format";
import { Ext, VendorBadge, useNow, Copy } from "@/components/ui";

function Payments() {
  const payments = useStore((s) => s.payments);
  const approvals = useStore((s) => s.approvals);
  const team = useStore((s) => s.team);
  const loaded = useStore((s) => s.loaded);
  const sorted = useMemo(() => [...payments].sort((a, b) => b.createdAt - a.createdAt), [payments]);
  const by = (st: string) => payments.filter((p) => p.decision.status === st);
  const moved = by("paid").reduce((s, p) => s + Number(p.amount), 0);
  const stopped = payments.filter((p) => p.decision.status !== "paid" && p.decision.status !== "pending_human").reduce((s, p) => s + Number(p.amount), 0);

  return (
    <Shell>
      <main className="page">
        <span className="eyebrow"><i />Money · BrainVault on Sepolia · World ID</span>
        <h1>No money moves on a lie.</h1>
        <p className="lede">Before an AI pays anyone, Supabrain traces <b>where the payee address came from</b>. An address that disagrees with the vendor&apos;s own ENS record is blocked with no override. Outside content can&apos;t authorize money. Anything new or over the AI&apos;s ENS pay cap waits for a real person in World App. Real test USDC moves through BrainVault, which checks ENS again on chain.</p>
        <div className="stats">
          <div className="stat ok"><span>Paid</span><b>{by("paid").length}</b><span className="tiny">{moved} USDC moved</span></div>
          <div className="stat bad"><span>Blocked</span><b>{by("blocked").length}</b><span className="tiny">hard rules, no override</span></div>
          <div className="stat warn"><span>Waiting for a human</span><b>{approvals.length}</b><span className="tiny">World App</span></div>
          <div className="stat"><span>Denied / cancelled</span><b>{by("denied").length + by("cancelled").length + by("expired").length}</b><span className="tiny">nothing moved</span></div>
          <div className="stat"><span>Stopped</span><b>{stopped}</b><span className="tiny">USDC that never left</span></div>
        </div>

        {approvals.map((a) => <ApprovalCard key={a.id} a={a} />)}

        <PolicyStrip />

        <h2 style={{ fontSize: "1.1rem", fontWeight: 500, margin: "26px 0 12px" }}>Every payment decision <span className="muted small">· stored on Arkiv as it happened</span></h2>
        {!loaded && <div className="skeleton" style={{ height: 90 }} />}
        {loaded && sorted.length === 0 && <div className="card pad muted">No payment attempts yet. Ask an AI to <span className="mono">pay acme.{team?.team.ens ?? "team.eth"} 1 USDC</span>.</div>}
        {sorted.map((p) => <PayRow key={p.intentId} p={p} />)}
      </main>
    </Shell>
  );
}

function PolicyStrip() {
  const rows = [
    ["1", "Where did the address come from?", "Trace the payee through the team's memory, not just the AI's last read."],
    ["2", "Does ENS agree?", "The vendor's own ENS record wins. A mismatch is a hard block."],
    ["3", "Any retracted or outside source?", "Retracted lineage blocks; outside content needs a human."],
    ["4", "Within the AI's ENS limits?", "Pay cap and daily limit are read live from ENS records."],
    ["5", "BrainVault re-checks on chain", "ENS owner, signed attestation, revoked roots, daily ceiling."],
  ];
  return (
    <div className="card" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", overflow: "hidden", marginTop: 14 }}>
      {rows.map(([n, t, d], i) => (
        <div key={n} style={{ padding: "14px 16px", borderLeft: i ? "1px solid var(--line)" : undefined }}>
          <div className="mono tiny" style={{ color: "var(--flow)" }}>CHECK {n}</div>
          <div style={{ fontWeight: 500, margin: "4px 0" }}>{t}</div>
          <div className="small muted">{d}</div>
        </div>
      ))}
    </div>
  );
}

function PayRow({ p }: { p: Payment }) {
  const [open, setOpen] = useState(p.decision.status === "blocked" || p.decision.status === "pending_human");
  const nodes = useStore((s) => s.nodes);
  const team = useStore((s) => s.team);
  const href = useHref();
  const d = p.decision;
  const tone = decisionTone(d.status);
  const reasons = "reasons" in d ? sortReasons(d.reasons) : [];
  const path = d.status === "blocked" ? d.path : p.lineage;
  const vendor = team?.agents.find((a) => a.label === p.agent)?.vendor ?? "human";
  return (
    <article className="pay" style={tone === "bad" ? { borderColor: "color-mix(in srgb, var(--lie) 40%, var(--line2))" } : tone === "ok" ? { borderColor: "color-mix(in srgb, var(--flow) 35%, var(--line2))" } : undefined}>
      <button className="top" style={{ width: "100%", textAlign: "left" }} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className={`chip big ${tone === "bad" ? "solid-bad" : tone}`}>{DECISION_WORD[d.status]}</span>
        <div style={{ minWidth: 0 }}>
          <div className="row" style={{ gap: 8 }}><VendorBadge vendor={vendor} /><span className="mono small">{p.agent}</span><span className="muted small">→</span><b className="ell">{p.payeeEns ?? <span className="mono">{short(p.payee, 8, 6)}</span>}</b></div>
          <div className="tiny muted ell" style={{ marginTop: 3 }}>“{p.memo}” · {clock(p.createdAt)} · {ago(p.createdAt)}{p.payeeEns ? <> · <span className="mono">{short(p.payee)}</span></> : null}</div>
        </div>
        <div className="amt tnum">{p.amount}<small>USDC</small></div>
      </button>
      {open && (
        <div className="body">
          {d.status === "paid" && <div className="callout ok"><b>Paid on chain.</b> BrainVault checked the AI&apos;s ENS name, the signed attestation and the revoked roots before moving real test USDC. <Ext href={d.txUrl}>Etherscan</Ext></div>}
          {(d.status === "denied" || d.status === "cancelled" || d.status === "expired") && <div className="callout"><b>{DECISION_WORD[d.status]}: nothing moved.</b> {d.status === "denied" ? "The human said no in World App." : d.status === "cancelled" ? "The owner cancelled before anyone approved." : "Nobody approved in time."}</div>}
          {d.status === "failed" && <div className="callout bad"><b>Failed:</b> {d.error}</div>}
          {reasons.length > 0 && (
            <div style={{ display: "grid", gap: 8 }}>
              <div className="section-t">{d.status === "blocked" ? "Why it was blocked (hard rules first)" : "Why it needed a human"}</div>
              {reasons.map((r, i) => (
                <div key={i} className="reason">
                  <span className={`chip ${isHard(r) ? "solid-bad" : "warn"}`} style={{ minWidth: 132, justifyContent: "center" }}>{reasonLabel(r)}</span>
                  <span className="grow">{reasonText(r)} <span className="tiny dim">{isHard(r) ? "hard: no override" : "soft: a human can approve"}</span></span>
                </div>
              ))}
            </div>
          )}
          {path.length > 0 && (
            <div>
              <div className="section-t">{d.status === "blocked" ? "Where the payee came from" : "What this payment rests on"}</div>
              <div className="flowpath">
                {path.map((k, i) => (
                  <span key={k + i} className="row" style={{ gap: 6 }}>
                    {i > 0 && <span className="arrow">←</span>}
                    <span className={`hop${nodes[k]?.status === "quarantined" ? " q" : ""}`} title={nodes[k]?.text}>
                      <span className="tiny mono dim">{nodes[k]?.agent ?? "memory"}{nodes[k]?.source ? ` · ${nodes[k].source!.id}` : ""}</span><br />
                      <span className="ell" style={{ display: "block" }}>{nodes[k]?.text ?? shortKey(k)}</span>
                    </span>
                  </span>
                ))}
              </div>
              <div style={{ marginTop: 10 }}><Link className="btn g xs" href={href(`/t?path=${path.join(",")}&m=${path[0]}`)}>Show this path in the graph →</Link></div>
            </div>
          )}
          <div className="tiny mono dim">intent {shortKey(p.intentId)}</div>
        </div>
      )}
    </article>
  );
}

function ApprovalCard({ a }: { a: ApprovalView }) {
  const now = useNow(1000);
  const admin = useStore((s) => s.admin);
  const [busy, setBusy] = useState(false);
  const uri = a.verificationUriComplete || a.verificationUri;
  const left = a.expiresAt - now;
  const reasons = sortReasons(a.reasons);
  return (
    <section className="approval" aria-label="Payment waiting for a human" style={{ marginBottom: 14 }}>
      <div>
        {uri ? <div className="qr"><QRCodeSVG value={uri} size={172} level="M" /></div>
          : <div className="qr locked">🔒<br />The World App QR shows only on the owner-signed-in dashboard (it carries a one-time bridge key).</div>}
      </div>
      <div style={{ display: "grid", gap: 10, alignContent: "start" }}>
        <div className="row wrapr"><span className="chip big warn">WAITING FOR A HUMAN</span><span className="countdown">{left > 0 ? until(a.expiresAt, now) : "expired"}</span><span className="tiny muted">left to approve</span></div>
        <div style={{ fontSize: "1.15rem", letterSpacing: "-.01em" }}><b className="mono">{a.agent}</b> wants to pay <b>{a.payeeEns ?? short(a.payee, 8, 6)}</b>{a.payeeEns && <span className="mono muted small"> ({short(a.payee)})</span>} <b>{a.amount} USDC</b>.</div>
        <div className="small muted">Needs a human because:</div>
        <div style={{ display: "grid", gap: 6 }}>{reasons.map((r, i) => <div key={i} className="reason"><span className={`chip ${isHard(r) ? "solid-bad" : "warn"}`}>{reasonLabel(r)}</span><span className="small">{reasonText(r)}</span></div>)}</div>
        <div className="small muted">Scan with <b>World App</b>. The proof is bound to this one payment (action <span className="mono">supabrain-pay:&lt;intent hash&gt;</span>), checked by World, accepted once, then every hard rule is re-checked before BrainVault pays. Reference <b className="mono">{a.userCode}</b>.</div>
        <div className="row wrapr">
          {uri && <a className="btn p sm" href={uri} target="_blank" rel="noreferrer noopener">Open in World App</a>}
          {uri && <Copy text={uri} label="Copy link" />}
          <button className="btn g sm" disabled={!admin || busy} onClick={async () => {
            setBusy(true);
            try { await api.cancelApproval(a.id); toast("Cancelled: nothing moved", "ok"); await refreshPayments(); }
            catch (e) { toast(e instanceof ApiError ? e.message : "Cancel failed", "bad"); }
            finally { setBusy(false); }
          }}>{admin ? (busy ? "Cancelling…" : "Cancel payment") : "🔒 Cancel"}</button>
        </div>
      </div>
    </section>
  );
}

export default function Page() { return <Suspense fallback={null}><Payments /></Suspense>; }
