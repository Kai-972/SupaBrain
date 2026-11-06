"use client";
import { Suspense, useState } from "react";
import faq from "@/content/faq.json";
import { Shell, useBrainId } from "@/components/Shell";
import { HeadsTable } from "@/components/Charts";
import { useStore } from "@/lib/store";
import { short } from "@/lib/format";
import { Copy, Ext } from "@/components/ui";

function Verify() {
  const id = useBrainId();
  const heads = useStore((s) => s.heads);
  const brain = useStore((s) => s.brain);
  const nodes = useStore((s) => s.nodes);
  const [open, setOpen] = useState<number | null>(0);
  const a = brain?.agents[0];
  const head = heads.find((h) => h.agent === a?.label && h.ensHead);
  const n = head?.ensHead ? nodes[head.ensHead] : undefined;
  const key = head?.ensHead ?? "<key>";
  return (
    <Shell>
      <main className="page v2">
        <span className="eyebrow"><i />Verify without us</span>
        <h1>Don&apos;t trust us. Check it.</h1>
        <p className="lede">Everything this site shows can be checked against ENS on Sepolia and Arkiv directly, without our server. Here is how, with live values filled in.</p>
        <div className="checks">
          <div className="card pad">
            <div className="mono tiny" style={{ color: "var(--flow)" }}>CHECK 1</div>
            <h3>Resolve the AI&apos;s ENS name to its latest commit</h3>
            <p className="small muted">Read the text record <span className="mono">sb.memory.head</span> on <b className="mono">{a?.ens ?? "<ai>.<brain>.supabrain.eth"}</b> through the ENS Universal Resolver.</p>
            <div className="row wrapr"><span className="mono small">{head?.ensHead ? short(head.ensHead, 10, 8) : "no head yet"}</span>{n?.proofUrl && <Ext href={n.proofUrl}>open that Arkiv entity</Ext>}</div>
          </div>
          <div className="card pad">
            <div className="mono tiny" style={{ color: "var(--flow)" }}>CHECK 2</div>
            <h3>The signer is the AI&apos;s ENS address</h3>
            <p className="small muted">The entity&apos;s <span className="mono">$creator</span> must equal the address <b className="mono">{a?.ens ?? "the AI's name"}</b> resolves to.</p>
            <div className="small mono">ENS address {short(a?.wallet, 8, 6) || "—"} · signer {short(n?.creator, 8, 6) || "—"} {a && n?.creator ? (a.wallet.toLowerCase() === n.creator.toLowerCase() ? <span className="chip ok">MATCH</span> : <span className="chip solid-bad">MISMATCH</span>) : null}</div>
          </div>
          <div className="card pad">
            <div className="mono tiny" style={{ color: "var(--flow)" }}>CHECK 3</div>
            <h3>Run the verifier yourself</h3>
            <p className="small muted">It uses only Arkiv and ENS: authorship, the signer&apos;s ENS name and the lineage walk.</p>
            <div className="codewrap"><pre className="code">pnpm verify:memory {key}</pre><Copy text={`pnpm verify:memory ${key}`} /></div>
          </div>
        </div>
        <div data-tour="heads"><HeadsTable id={id} heads={heads} /></div>
        <h2 className="h2">Honest limits</h2>
        <div className="card pad" style={{ display: "grid", gap: 10 }}>{faq.limits.map((l, i) => <p key={i} className="small" style={{ margin: 0 }}>{l}</p>)}</div>
        <h2 className="h2">Questions judges ask</h2>
        <div className="card">
          {faq.faq.map((q, i) => (
            <div key={q.q} style={{ borderTop: i ? "1px solid var(--line)" : undefined }}>
              <button className="row" style={{ width: "100%", textAlign: "left", padding: "14px 16px", fontWeight: 500 }} aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)}><span className="grow">{q.q}</span><span className="muted mono">{open === i ? "−" : "+"}</span></button>
              {open === i && <div className="small muted" style={{ padding: "0 16px 16px", maxWidth: "75ch", lineHeight: 1.6 }}>{q.a}</div>}
            </div>
          ))}
        </div>
      </main>
    </Shell>
  );
}
export default function Page() { return <Suspense fallback={null}><Verify /></Suspense>; }
