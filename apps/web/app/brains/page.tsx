"use client";
import { Suspense, useEffect } from "react";
import { Shell } from "@/components/Shell";
import { RegistryMap } from "@/components/Charts";
import { explorerFromTx } from "@/lib/api";
import { loadRegistry, toast, useStore } from "@/lib/store";
import { short, until, vendorOf } from "@/lib/format";
import { Copy, Ext } from "@/components/ui";

function Registry() {
  const reg = useStore((s) => s.registry);
  const conn = useStore((s) => s.conn);
  useEffect(() => { if (conn === "open" || conn === "reconnecting") loadRegistry().catch((e) => toast(String(e), "bad")); }, [conn]);
  const explorer = explorerFromTx(reg?.brains.find((b) => b.txUrls?.length)?.txUrls[0]);
  const ais = reg ? reg.brains.reduce((n, b) => n + Object.keys(b.agents).length, 0) : 0;
  return (
    <Shell>
      <main className="page v2">
        <span className="eyebrow"><i />ENSv2 registry · Sepolia · read live</span>
        <h1>{reg ? `${reg.brains.length} projects. ${ais} AI names. All on ENSv2.` : "The ENSv2 registry"}</h1>
        <p className="lede">Every brain is its own subname registry under the team name, and every AI in it has its own resolver, records and expiry. A project gets isolated identities and rules; ending the project ends them.</p>
        {!reg && <div className="skeleton" style={{ height: 300 }} />}
        {reg && (
          <>
            <div className="stats">
              <div className="stat"><span>Team registry</span><b className="mono" style={{ fontSize: "1rem" }}>{short(reg.teamRegistry, 8, 6)}</b>{explorer && <Ext href={`${explorer}/address/${reg.teamRegistry}`}>Etherscan</Ext>}</div>
              <div className="stat"><span>Brains</span><b>{reg.brains.length}</b></div>
              <div className="stat"><span>AI names</span><b>{ais}</b></div>
              <div className="stat ok"><span>Served live</span><b className="mono" style={{ fontSize: "1.1rem" }}>{reg.served}</b></div>
              <div className="stat"><span>Updated</span><b style={{ fontSize: "1rem" }}>{new Date(reg.updatedAt).toLocaleString()}</b></div>
            </div>
            <RegistryMap reg={reg} />
            <div className="brainlist">
              {reg.brains.map((b) => (
                <article key={b.label} className={`card pad bcard${b.served ? " live" : ""}`}>
                  <div className="row wrapr"><b className="mono">{b.ens}</b>{b.served ? <span className="chip ok">LIVE</span> : <span className="chip">READY</span>}<span className="spacer" /><span className="chip">LEASE UNTIL {new Date(b.expiry * 1000).toLocaleDateString()} · {until(b.expiry * 1000)}</span></div>
                  <div className="tiny muted mono" style={{ margin: "6px 0 10px" }}>registry {short(b.registry, 8, 6)} {explorer && <Ext href={`${explorer}/address/${b.registry}`}>Etherscan</Ext>} · {b.txUrls.length} setup tx{b.txUrls.length === 1 ? "" : "s"}</div>
                  <div className="tablewrap"><table className="rules"><tbody>
                    {Object.entries(b.agents).map(([fam, a]) => (
                      <tr key={fam}>
                        <td><span className={`vb ${vendorOf(fam).cls}`}>{vendorOf(fam).letter}</span></td>
                        <td className="mono small">{a.ens}</td>
                        <td className="mono tiny">{a.records["sb.status"]} · scope {a.records["sb.scope"]} · {a.records["sb.write.daily"]}/day</td>
                        <td className="mono tiny">wallet {short(a.wallet)} <Copy text={a.wallet} /></td>
                        <td className="tiny"><span className="linkstack">{explorer && <Ext href={`${explorer}/address/${a.resolver}`}>resolver</Ext>}{a.fundingUrl && <Ext href={a.fundingUrl}>Arkiv funding{a.fundedGlm ? ` (${a.fundedGlm} tGLM)` : ""}</Ext>}</span></td>
                      </tr>
                    ))}
                  </tbody></table></div>
                </article>
              ))}
            </div>
          </>
        )}
      </main>
    </Shell>
  );
}
export default function Page() { return <Suspense fallback={null}><Registry /></Suspense>; }
