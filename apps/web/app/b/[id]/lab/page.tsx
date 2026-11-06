"use client";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { BrainFrame } from "@/components/BrainFrame";
import { Console, NextReads, Outcome, RulesStrip } from "@/components/Lab";
import { OwnerLogin } from "@/components/Shell";
import { Pipeline } from "@/components/Charts";
import { useStore, type LabEntry } from "@/lib/store";

function LabPage() {
  const sp = useSearchParams();
  const present = sp.get("present") === "1";
  const brain = useStore((s) => s.brain);
  const admin = useStore((s) => s.admin);
  const mode = useStore((s) => s.mode);
  const lab = useStore((s) => s.lab);
  const agents = useMemo(() => brain?.agents ?? [], [brain]);
  const byVendor = (v: string) => agents.find((a) => a.vendor === v)?.label;
  const [left, setLeft] = useState<string>();
  const [right, setRight] = useState<string>();
  const [reader, setReader] = useState<string>();
  const [pin, setPin] = useState<LabEntry>();
  const [login, setLogin] = useState(false);
  useEffect(() => {
    if (!agents.length) return;
    setLeft((l) => l ?? byVendor("claude") ?? agents[0].label);
    setRight((r) => r ?? byVendor("gemini") ?? agents[1]?.label ?? agents[0].label);
  }, [agents]); // eslint-disable-line react-hooks/exhaustive-deps
  const L = agents.find((a) => a.label === left);
  const R = agents.find((a) => a.label === right);
  useEffect(() => { setReader(left); }, [left]);
  const doneCount = lab.filter((l) => !l.pending).length;
  const lastActor = lab.find((l) => !l.pending)?.agent;
  // The panel shows the AI that did NOT just act: that's the one the handoff would reach.
  useEffect(() => { if (lastActor) setReader(lastActor === left ? right : left); }, [doneCount]); // eslint-disable-line react-hooks/exhaustive-deps
  const pinned = pin && lab.find((l) => l.id === pin.id);
  useEffect(() => { if (!present || !pinned || pinned.pending) return; const t = setTimeout(() => setPin(undefined), 6000); return () => clearTimeout(t); }, [present, pinned?.pending]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <BrainFrame title="Attack lab · real tools · real ENS · real Arkiv" lede={<>
      <b style={{ color: "var(--fg)" }}>Try to break it.</b> Act as any AI in this brain. Do normal work, or try a prompt injection, in a preset or your own words. Every result below is what the live system decided; nothing on this page is scripted.
    </>}>
      {mode !== "mock" && !admin && (
        <div className="wrapx" style={{ marginTop: 14 }}>
          <div className="callout warn row wrapr" style={{ justifyContent: "space-between" }}>
            <span className="small">The lab runs as the brain owner, because every write is a real Arkiv transaction. Sign in on the demo laptop, or watch results stream in below, read-only.</span>
            <button className="btn p sm" onClick={() => setLogin(true)}>Owner sign-in</button>
          </div>
        </div>
      )}
      <div className="wrapx" style={{ marginTop: 14 }}><Pipeline compact /></div>
      <div className="lab">
        <Console agent={L} other={R} agents={agents} onAgent={setLeft} presentPin={(e) => setPin(e)} />
        <div className="centre">
          <div data-tour="rules"><RulesStrip /></div>
          <NextReads as={agents.find((a) => a.label === reader)} agents={agents} onAs={setReader} tick={doneCount} />
        </div>
        <div data-tour="lab-attack" style={{ minWidth: 0 }}><Console agent={R} other={L} agents={agents} onAgent={setRight} presentPin={(e) => setPin(e)} /></div>
      </div>
      {present && pinned && <div className="toastpin"><Outcome e={pinned} agent={agents.find((a) => a.label === pinned.agent)} other={pinned.agent === left ? R : L} /></div>}
      {login && <OwnerLogin onClose={() => setLogin(false)} />}
    </BrainFrame>
  );
}

export default function Page() { return <Suspense fallback={null}><LabPage /></Suspense>; }
