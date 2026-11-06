"use client";
import { Suspense } from "react";
import { BrainFrame } from "@/components/BrainFrame";
import { RulesStrip } from "@/components/Lab";
import { HeadsTable, RuleHits } from "@/components/Charts";
import { useBrainId } from "@/components/Shell";
import { explorerFromTx } from "@/lib/api";
import { useStore } from "@/lib/store";
import { agentStatusLabel, agentStatusTone, vendorOf } from "@/lib/format";
import { Ext, VendorBadge } from "@/components/ui";

function RulesPage() {
  const id = useBrainId();
  const rules = useStore((s) => s.rules);
  const heads = useStore((s) => s.heads);
  const admin = useStore((s) => s.admin);
  const explorer = explorerFromTx(heads.find((h) => h.txUrl)?.txUrl);
  return (
    <BrainFrame title="Rules on ENS" lede={<>Each AI&apos;s rules are text records on its own ENS resolver. Anyone can read them. The server reads them live on every call and refuses with the rule&apos;s name. Changing one is a Sepolia transaction that leaves a public trail. <b style={{ color: "var(--fg)" }}>These are limits, not suggestions:</b> an AI scoped to <span className="mono">docs/</span> cannot write anywhere else, no matter what it was told.</>}>
      <main className="page v2">
        {rules && !rules.editable && <div className="callout" style={{ marginBottom: 14 }}>This brain&apos;s rules are owner-key only (team mode). Shown read-only.</div>}
        <div className="tablewrap">
          <table className="rules">
            <thead><tr><th>AI name</th><th>sb.status</th><th>sb.scope</th><th>sb.write.daily</th><th>sb.role</th><th>Resolver</th></tr></thead>
            <tbody>
              {!rules && <tr><td colSpan={6}><div className="skeleton" style={{ height: 40 }} /></td></tr>}
              {rules?.agents.map((r) => (
                <tr key={r.agent}>
                  <td><div className="row"><VendorBadge vendor={r.vendor} /><div><div className="mono small">{r.ens}</div><div className="tiny muted">{vendorOf(r.vendor).name} · {vendorOf(r.vendor).company}</div></div></div></td>
                  <td><span className={`chip ${agentStatusTone(r.status)}`}>{agentStatusLabel(r.status)}</span></td>
                  <td className="mono">{r.scope}</td>
                  <td className="mono">{r.writeDaily ?? "—"}</td>
                  <td className="mono">{r.role}</td>
                  <td className="mono tiny">{r.resolver ? (explorer ? <Ext href={`${explorer}/address/${r.resolver}`}>{r.resolver.slice(0, 10)}…</Ext> : `${r.resolver.slice(0, 10)}…`) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="figgrid" style={{ marginTop: 16 }}>
          <div>
            <div className="section-t" style={{ margin: "4px 0 8px" }}>{admin ? "Edit the rules (writes to ENS)" : "Sign in as the owner to edit"}</div>
            <RulesStrip />
          </div>
          <RuleHits id={id} />
        </div>
        <HeadsTable id={id} heads={heads} />
      </main>
    </BrainFrame>
  );
}
export default function Page() { return <Suspense fallback={null}><RulesPage /></Suspense>; }
