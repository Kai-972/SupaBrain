"use client";
// Rules: each AI's rulebook in plain words, tied to its ENS text records, plus what's on chain and why.
import { Suspense, useState } from "react";
import { BrainFrame } from "@/components/BrainFrame";
import { Rulebook } from "@/components/Rulebook";
import { OnChain } from "@/components/OnChain";
import { RulesSheet } from "@/components/LabFlow";
import { RuleHits } from "@/components/Charts";
import { useBrainId } from "@/components/Shell";
import { explorerFromTx } from "@/lib/api";
import { useStore } from "@/lib/store";
import { vendorOf } from "@/lib/format";

function RulesPage() {
  const id = useBrainId();
  const rules = useStore((s) => s.rules);
  const heads = useStore((s) => s.heads);
  const brain = useStore((s) => s.brain);
  const admin = useStore((s) => s.admin);
  const [sheet, setSheet] = useState<string>();
  const explorer = explorerFromTx(heads.find((h) => h.txUrl)?.txUrl);
  const agent = brain?.agents.find((a) => a.label === sheet);
  return (
    <BrainFrame title="The rulebook, on ENS" lede={<>Each AI&apos;s rules are text records on its own ENSv2 resolver. Anyone can read them; the server reads them on every call and refuses with the record&apos;s name. They are limits, not suggestions: a prompt injection can&apos;t talk an AI out of them.</>}>
      <main className="wrapx rules4page">
        {rules && !rules.editable && <div className="callout">This server&apos;s rules are owner-key only (team mode). Shown read-only.</div>}
        <div className="books4">
          {!rules && [0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 320 }} />)}
          {rules?.agents.map((r) => {
            const v = vendorOf(r.vendor);
            return (
              <section key={r.agent} className="bookcard4" data-reveal>
                <header><i className={`dot4 big ${v.cls}`} /><b className="grow">{v.name}</b>
                  {rules.editable && <button className="btn g sm" disabled={!admin} title={admin ? "" : "Owner sign-in needed"} onClick={() => setSheet(r.agent)}>Change</button>}</header>
                <span className="mono ensline">{r.ens}</span>
                <Rulebook r={r} explorer={explorer} />
              </section>
            );
          })}
        </div>
        <section className="sect4" data-reveal>
          <h2 className="h2-4">What&apos;s on chain, and why</h2>
          <p className="lede4">Every link on this site points at one of these. Here is what each one is and why it exists.</p>
          <OnChain />
        </section>
        <section className="sect4"><RuleHits id={id} /></section>
      </main>
      {agent && <RulesSheet agent={agent} onClose={() => setSheet(undefined)} />}
    </BrainFrame>
  );
}
export default function Page() { return <Suspense fallback={null}><RulesPage /></Suspense>; }
