"use client";
// Try it (UI_REDESIGN_PROMPT.md §5.4): a guided three-step flow. Real tools, real ENS rules, real Arkiv writes.
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { BrainFrame } from "@/components/BrainFrame";
import { LabFlow } from "@/components/LabFlow";
import { OwnerLogin } from "@/components/Shell";
import { useStore } from "@/lib/store";
import { vendorOf } from "@/lib/format";

/** Real MCP traffic from connected apps, as a slim ticker (not a feed). */
function Ticker() {
  const feed = useStore((s) => s.feed);
  const items = feed.filter((f) => f.source && f.source !== "LAB").slice(0, 3);
  if (!items.length) return null;
  return (
    <div className="ticker4" aria-live="polite">
      <b>Live from connected apps</b>
      {items.map((f) => <span key={f.id}><i className={`dot4 ${vendorOf(f.vendor).cls}`} />{f.source?.replace("MCP · ", "")}: {f.label === "STOPPED" ? "STOPPED" : "saved"} “{f.text.split("“")[1]?.replace("”", "").slice(0, 48) ?? ""}”</span>)}
    </div>
  );
}

function LabPage() {
  const sp = useSearchParams();
  const admin = useStore((s) => s.admin);
  const mode = useStore((s) => s.mode);
  const [login, setLogin] = useState(false);
  return (
    <BrainFrame>
      <section className="page4-head wrapx">
        <h1 className="h1-4">Try to break it.</h1>
        <p className="lede4">Act as any AI in this brain. Do normal work, or pass on a prompt injection, from a preset or in your own words. Every result is the live system&apos;s answer: real ENS rules, real Arkiv writes.</p>
        {mode !== "mock" && !admin && (
          <div className="callout warn row wrapr" style={{ justifyContent: "space-between" }}>
            <span>Every send is a real Arkiv write, so the lab runs as the brain owner. Sign in on the demo laptop.</span>
            <button className="btn p sm" onClick={() => setLogin(true)}>Owner sign-in</button>
          </div>
        )}
        <Ticker />
      </section>
      <div className="wrapx"><LabFlow initialRules={sp.get("rules") ?? undefined} /></div>
      {login && <OwnerLogin onClose={() => setLogin(false)} />}
    </BrainFrame>
  );
}

export default function Page() { return <Suspense fallback={null}><LabPage /></Suspense>; }
