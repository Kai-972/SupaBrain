"use client";
// Rules (C-UI.md §3.6): every AI's identity and limits are ENS records only the owner can change, read live.
import { Suspense } from "react";
import { Shell } from "@/components/Shell";
import { useStore } from "@/lib/store";
import { short, until, vendorOf } from "@/lib/format";
import { Copy, VendorBadge, useNow } from "@/components/ui";

const ROLES = [
  { r: "owner", who: "A person (dashboard + owner wallet)", write: "HUMAN-trust notes, Keep, Correct, Revoke", pay: "Approves risky payments in World App", off: "Owns every name; the only one who can change records or unregister" },
  { r: "lead", who: "The AI that runs the work", write: "Any folder its sb.scope allows (\"*\" = all)", pay: "Up to its ENS pay cap; above it, a human decides", off: "Unregister the name: writes stop, BrainVault reverts" },
  { r: "worker", who: "Helper AIs", write: "Only its folder (e.g. research, comms)", pay: "Its own (smaller) cap; 0 means never", off: "Same switch, per AI" },
  { r: "observer", who: "Read-only AIs", write: "Nothing (can propose)", pay: "Never", off: "—" },
];

function Rules() {
  const team = useStore((s) => s.team);
  const now = useNow(30000);
  return (
    <Shell>
      <main className="page">
        <span className="eyebrow"><i />Enforced by ENS · read live</span>
        <h1>Every AI is a name with rules.</h1>
        <p className="lede">Each AI is an ENSv2 subname of <b className="mono">{team?.team.ens ?? "your team"}</b>. Its role, the folders it may write to and how much it may pay are text records on that name, and only the owner can set them. The server re-reads them on every <span className="mono">whoami</span>, <span className="mono">remember</span> and <span className="mono">pay</span>; if ENS can&apos;t be read it fails closed. The money contract reads ENS on chain too.</p>

        <div className="tablewrap">
          <table className="rules">
            <thead><tr><th>AI (ENS name)</th><th>Status</th><th>sb.role</th><th>sb.scope</th><th>sb.pay.cap</th><th>sb.pay.daily</th><th>Lease</th><th>Signer wallet</th></tr></thead>
            <tbody>
              {!team && <tr><td colSpan={8}><div className="skeleton" style={{ height: 40 }} /></td></tr>}
              {team?.agents.map((a) => (
                <tr key={a.label}>
                  <td><div className="row"><VendorBadge vendor={a.vendor} /><div><div className="mono small">{a.ens}</div><div className="tiny muted">{vendorOf(a.vendor).name} · {vendorOf(a.vendor).company}</div></div></div></td>
                  <td>{a.authority === "unavailable" || a.status === "unknown" ? <span className="chip warn">AUTHORITY UNKNOWN</span> : a.status === "active" ? <span className="chip ok">ACTIVE</span> : <span className="chip solid-bad">{a.status.toUpperCase()}</span>}{a.recordsOk === false && <div className="tiny" style={{ color: "var(--amber)" }}>records incomplete</div>}</td>
                  <td className="mono">{a.role}</td>
                  <td className="mono">{a.scope}</td>
                  <td className="mono">{a.payCap} USDC</td>
                  <td className="mono">{a.payDaily} USDC</td>
                  <td className="small">{a.leaseExpiresAt ? `${until(a.leaseExpiresAt, now)} left` : "—"}</td>
                  <td className="mono small">{a.wallet ? <>{short(a.wallet)} <Copy text={a.wallet} /></> : "—"}</td>
                </tr>
              ))}
              {team?.vendors.map((v) => (
                <tr key={v}>
                  <td><div className="row"><span className="vb" style={{ background: "var(--amber)" }}>V</span><div><div className="mono small">{v}</div><div className="tiny muted">vendor · owns its own payout record</div></div></div></td>
                  <td><span className="chip">VENDOR</span></td>
                  <td colSpan={6} className="small muted">Its <span className="mono">addr</span> record is set by the vendor&apos;s own wallet on its own resolver, so no AI, email or teammate can change where it gets paid. Payments to it are checked against this record.</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2 style={{ fontSize: "1.1rem", fontWeight: 500, margin: "28px 0 12px" }}>What each role may do</h2>
        <div className="tablewrap">
          <table className="rules">
            <thead><tr><th>Role</th><th>Who</th><th>May write</th><th>May pay</th><th>Off switch</th></tr></thead>
            <tbody>{ROLES.map((r) => <tr key={r.r}><td><span className="chip">{r.r}</span></td><td>{r.who}</td><td className="small">{r.write}</td><td className="small">{r.pay}</td><td className="small">{r.off}</td></tr>)}</tbody>
          </table>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12, marginTop: 24 }}>
          <div className="card pad"><div className="mono tiny" style={{ color: "var(--flow)" }}>ON EVERY CALL</div><h3 style={{ margin: "6px 0", fontWeight: 500 }}>The server checks ENS</h3><p className="small muted" style={{ margin: 0 }}><span className="mono">getOwner(labelhash)</span> must be the AI&apos;s own wallet, its status active, and the folder inside <span className="mono">sb.scope</span>. Otherwise the write is refused.</p></div>
          <div className="card pad"><div className="mono tiny" style={{ color: "var(--flow)" }}>ON CHAIN</div><h3 style={{ margin: "6px 0", fontWeight: 500 }}>BrainVault checks again</h3><p className="small muted" style={{ margin: 0 }}>An unregistered AI reverts <span className="mono">AgentNotRegistered</span>; money resting on a retracted source reverts <span className="mono">RootRevoked</span>. The guardian can only tighten.</p></div>
          <div className="card pad"><div className="mono tiny" style={{ color: "var(--lie)" }}>KILL SWITCH</div><h3 style={{ margin: "6px 0", fontWeight: 500 }}>Unregister the name</h3><p className="small muted" style={{ margin: 0 }}>Needs the owner key, which is never on the server. Demo: <span className="mono">pnpm demo:step-kill gem-research</span>. This table turns red live.</p></div>
        </div>
      </main>
    </Shell>
  );
}

export default function Page() { return <Suspense fallback={null}><Rules /></Suspense>; }
