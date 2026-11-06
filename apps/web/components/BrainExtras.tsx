"use client";
// Live feed, Add context, Before/After, and the pitch guide that checks each demo beat against live data.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { MemoryKind } from "@supabrain/shared";
import { api, ApiError, type RecallLogEntry, type GraphNode } from "@/lib/api";
import { descendants, refreshGraph, toast, useStore, type FeedItem } from "@/lib/store";
import { ago, clock, shortKey } from "@/lib/format";
import { Modal, VendorBadge } from "./ui";
import { useHref } from "./Shell";

export function Feed({ onSelect }: { onSelect: (k: string) => void }) {
  const feed = useStore((s) => s.feed);
  const [filter, setFilter] = useState<"all" | "bad" | "ok">("all");
  const items = feed.filter((f) => filter === "all" || (filter === "bad" ? f.tone === "bad" || f.tone === "warn" : f.tone === "ok"));
  return (
    <>
      <div className="hd">
        <b style={{ fontWeight: 500 }}>Live feed</b><span className="dim tiny mono">{feed.length} events</span>
        <span className="spacer" />
        <div className="segm" role="group" aria-label="Feed filter">
          {(["all", "bad", "ok"] as const).map((f) => <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)} style={{ padding: "3px 10px" }}>{f === "all" ? "All" : f === "bad" ? "Problems" : "Good"}</button>)}
        </div>
      </div>
      <div className="feedlist" aria-live="polite">
        {items.length === 0 && <div className="small muted" style={{ padding: 12 }}>Nothing yet. When an AI reads or writes, it shows up here instantly.</div>}
        {items.map((f) => <FeedRow key={f.id} f={f} onSelect={onSelect} />)}
      </div>
    </>
  );
}

function FeedRow({ f, onSelect }: { f: FeedItem; onSelect: (k: string) => void }) {
  const inner = (
    <>
      <time dateTime={new Date(f.at).toISOString()}>{clock(f.at)}</time>
      {f.vendor ? <VendorBadge vendor={f.vendor} /> : <span className="vb" style={{ background: f.tone === "bad" ? "var(--lie)" : f.tone === "ok" ? "var(--flow)" : "var(--amber)" }}>•</span>}
      <span className="t grow">{f.text}</span>
      {f.href && <span className="tiny link">proof ↗</span>}
    </>
  );
  if (f.href && !f.key) return <a className={`fi ${f.tone}`} href={f.href} target="_blank" rel="noreferrer noopener">{inner}</a>;
  return <button className={`fi ${f.tone}`} onClick={() => f.key && onSelect(f.key)}>{inner}</button>;
}

export function AddContext({ onClose }: { onClose: () => void }) {
  const team = useStore((s) => s.team);
  const nodes = useStore((s) => s.nodes);
  const folders = useMemo(() => [...new Set(Object.values(nodes).map((n) => n.folder))].sort(), [nodes]);
  const [text, setText] = useState("");
  const [kind, setKind] = useState<MemoryKind>("fact");
  const [folder, setFolder] = useState(folders[0] ?? "general");
  const [subject, setSubject] = useState("");
  const [refOn, setRefOn] = useState(false);
  const [ref, setRef] = useState({ kind: "notion" as "github" | "notion" | "url", locator: "", version: "", label: "" });
  const [busy, setBusy] = useState(false);
  return (
    <Modal onClose={onClose} label="Add context">
      <h2>Add context</h2>
      <p className="muted small" style={{ margin: 0 }}>A note from a person gets <b>HUMAN</b> trust (the highest). No AI can write this level, and everything built on it inherits it until something less trusted joins in.</p>
      <textarea rows={3} autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Acme is paid only at acme.supabrain.eth" aria-label="Text" />
      <div className="row wrapr" style={{ gap: 8 }}>
        <label className="grow small">Kind<select value={kind} onChange={(e) => setKind(e.target.value as MemoryKind)}>{(["fact", "decision", "plan", "ref"] as MemoryKind[]).map((k) => <option key={k}>{k}</option>)}</select></label>
        <label className="grow small">Folder<input list="sb-folders" value={folder} onChange={(e) => setFolder(e.target.value)} /><datalist id="sb-folders">{folders.map((f) => <option key={f} value={f} />)}</datalist></label>
        <label className="grow small">About (optional)<select value={subject} onChange={(e) => setSubject(e.target.value)}><option value="">nothing specific</option>{team?.vendors.map((v) => <option key={v}>{v}</option>)}</select></label>
      </div>
      <label className="row small"><input type="checkbox" checked={refOn} onChange={(e) => setRefOn(e.target.checked)} style={{ width: "auto" }} /> Point at private content instead of putting it on chain</label>
      {refOn && (
        <div className="card pad" style={{ display: "grid", gap: 8 }}>
          <div className="segm">{(["notion", "github", "url"] as const).map((k) => <button key={k} aria-pressed={ref.kind === k} onClick={() => setRef({ ...ref, kind: k })}>{k}</button>)}</div>
          <input value={ref.label} onChange={(e) => setRef({ ...ref, label: e.target.value })} placeholder="Label anyone may see (e.g. Brand guide v3)" />
          <input value={ref.locator} onChange={(e) => setRef({ ...ref, locator: e.target.value })} placeholder={ref.kind === "github" ? "owner/repo:path" : ref.kind === "notion" ? "Notion page URL or id" : "URL"} />
          {ref.kind === "github" && <input value={ref.version} onChange={(e) => setRef({ ...ref, version: e.target.value })} placeholder="commit SHA (required)" />}
          <div className="tiny muted">Only this pointer and label go on Arkiv. AIs open it with their own access.</div>
        </div>
      )}
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button className="btn g sm" onClick={onClose}>Cancel</button>
        <button className="btn p sm" disabled={!text.trim() || !folder || busy} onClick={async () => {
          setBusy(true);
          try {
            await api.addContext({ text, kind, folder, ...(subject ? { subject } : {}), ...(refOn && ref.locator ? { ref: { kind: ref.kind, locator: ref.locator, label: ref.label || ref.locator, ...(ref.version ? { version: ref.version } : {}) } } : {}) });
            toast("Saved as a HUMAN memory. Signing it on Arkiv…", "ok"); await refreshGraph(); onClose();
          } catch (e) { toast(e instanceof ApiError ? e.message : "Could not save", "bad"); }
          finally { setBusy(false); }
        }}>{busy ? "Saving…" : "Save for every AI"}</button>
      </div>
    </Modal>
  );
}

export function BeforeAfter({ onClose }: { onClose: () => void }) {
  const team = useStore((s) => s.team);
  const nodes = useStore((s) => s.nodes);
  const mode = useStore((s) => s.mode);
  const [agent, setAgent] = useState("");
  const [q, setQ] = useState("");
  const [log, setLog] = useState<RecallLogEntry[]>();
  const [err, setErr] = useState<string>();
  useEffect(() => {
    if (mode === "mock") { setLog([]); return; }
    const t = setTimeout(() => api.recallLog(agent || undefined, q || undefined).then(setLog).catch((e) => setErr(e instanceof ApiError ? e.message : "Could not load")), 250);
    return () => clearTimeout(t);
  }, [agent, q, mode]);
  const groups = useMemo(() => {
    const m: Record<string, RecallLogEntry[]> = {};
    for (const e of log ?? []) (m[`${e.agent}|${e.query}`] ??= []).push(e);
    return Object.entries(m).map(([k, es]) => ({ k, es: es.sort((a, b) => a.at - b.at) })).filter((g) => g.es.length);
  }, [log]);
  const Res = ({ e }: { e: RecallLogEntry }) => (
    <div style={{ display: "grid", gap: 6 }}>
      <div className="tiny dim mono">{clock(e.at)} · {ago(e.at)}</div>
      {e.results.length === 0 && <div className="small muted">no results</div>}
      {e.results.map((r) => (
        <div key={r.key} className="small" style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
          <span className={`chip ${r.status === "quarantined" ? "solid-bad" : r.status === "active" ? "ok" : ""}`}>{r.status.toUpperCase()}</span>
          <span style={r.status === "quarantined" ? { textDecoration: "line-through", color: "var(--lie)" } : undefined}>{nodes[r.key]?.text ?? shortKey(r.key)}</span>
        </div>
      ))}
    </div>
  );
  return (
    <Modal onClose={onClose} wide label="Before and after">
      <div className="row"><h2 className="grow">Before / after: what the AI was given</h2><button className="iconbtn" onClick={onClose} aria-label="Close">×</button></div>
      <p className="muted small" style={{ margin: 0 }}>Every <span className="mono">recall</span> an AI makes is logged. Pick an AI and a question to compare what it was handed before and after a revoke. Our server can&apos;t see the AI&apos;s own words, so show its live answer next to this.</p>
      <div className="row wrapr">
        <select value={agent} onChange={(e) => setAgent(e.target.value)} style={{ maxWidth: 240 }} aria-label="Agent"><option value="">every AI</option>{team?.agents.map((a) => <option key={a.label} value={a.label}>{a.label}</option>)}</select>
        <input className="grow" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by question, e.g. acme wallet" aria-label="Query filter" style={{ minWidth: 180, flex: 1 }} />
      </div>
      {err && <div className="callout bad">{err}</div>}
      {!log && !err && <div className="row muted small"><span className="spinner" /> loading…</div>}
      {log && groups.length === 0 && <div className="callout">No recalls logged{agent ? ` for ${agent}` : ""} yet. Ask an AI something like <span className="mono">“What is Acme&apos;s wallet?”</span> before and after the revoke, and both answers appear here side by side.</div>}
      {groups.map(({ k, es }) => {
        const [ag, query] = k.split("|");
        const first = es[0], last = es[es.length - 1];
        return (
          <div key={k} className="card pad" style={{ display: "grid", gap: 10 }}>
            <div className="row"><VendorBadge vendor={team?.agents.find((a) => a.label === ag)?.vendor ?? "human"} /><b className="mono small">{ag}</b><span className="muted small">asked “{query}”</span><span className="spacer" /><span className="tiny dim">{es.length} time{es.length > 1 ? "s" : ""}</span></div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
              <div><div className="section-t">Before</div><Res e={first} /></div>
              <div><div className="section-t">{es.length > 1 ? "After" : "Only one recall so far"}</div>{es.length > 1 ? <Res e={last} /> : <div className="small muted">Ask again after the revoke.</div>}</div>
            </div>
          </div>
        );
      })}
    </Modal>
  );
}

// ---------------- pitch guide ----------------
interface Beat { title: string; say: string; how: string; done: boolean; detail?: string; act?: { label: string; run: () => void } | { label: string; href: string } }

export function PitchGuide({ left, onClose, onFocus, onWhy, onWrong, onBeforeAfter }: {
  left?: boolean; onClose: () => void; onFocus: (k: string) => void; onWhy: (p: string[][]) => void;
  onWrong: (id: string) => void; onBeforeAfter: () => void;
}) {
  const nodes = useStore((s) => s.nodes);
  const team = useStore((s) => s.team);
  const payments = useStore((s) => s.payments);
  const approvals = useStore((s) => s.approvals);
  const notices = useStore((s) => s.notices);
  const admin = useStore((s) => s.admin);
  const href = useHref();
  const all = Object.values(nodes);
  const vendors = new Set(all.filter((n) => n.vendor !== "human").map((n) => n.vendor));
  const evidence = all.filter((n) => n.trust === 1 && n.source).sort((a, b) => a.seq - b.seq);
  const ev = evidence[0];
  const spread = ev ? [...descendants(nodes, ev.key)].map((k) => nodes[k]).filter(Boolean) as GraphNode[] : [];
  const spreadVendors = new Set(spread.map((n) => n.vendor));
  const deepest = spread.sort((a, b) => b.seq - a.seq)[0];
  const blocked = payments.find((p) => p.decision.status === "blocked");
  const quarantined = all.filter((n) => n.status === "quarantined");
  const humanPaid = payments.find((p) => p.decision.status === "paid");
  const denied = payments.find((p) => ["denied", "cancelled", "expired"].includes(p.decision.status));
  const off = team?.agents.find((a) => a.status === "unregistered");
  const noticeCount = Object.values(notices).reduce((a, b) => a + b, 0);

  const beats: Beat[] = [
    { title: "Three AIs, one memory", done: vendors.size >= 2, detail: `${vendors.size} AI compan${vendors.size === 1 ? "y" : "ies"} writing · ${all.length} memories`,
      how: "Each column is one AI. Each dot is a memory it wrote, signed by its own wallet on Arkiv.",
      say: "Claude, Gemini and ChatGPT share one memory, like a team notebook. Every note says who wrote it and where it came from." },
    { title: "One fake email gets in", done: !!ev, detail: ev ? `${ev.source?.id} saved by ${ev.agent}` : "waiting for outside content",
      how: "Dashed dots are outside content. Amber “DISPUTED BY ENS” means the address already disagrees with the vendor's own ENS record.",
      say: "Machines flag in milliseconds: the moment Gemini saved it, Supabrain saw it disagrees with Acme's ENS name.",
      act: ev ? { label: "Show the email", run: () => onFocus(ev.key) } : undefined },
    { title: "The lie spreads", done: spreadVendors.size >= 2, detail: ev ? `${spread.length} memories by ${spreadVendors.size} other AIs built on it` : undefined,
      how: "Follow the curves: every memory points back to what the AI read before writing it.",
      say: "One email, and now all three AIs believe it. In a normal setup you'd never know which answers are poisoned.",
      act: deepest ? { label: "Trace it back", run: () => { onFocus(deepest.key); } } : undefined },
    { title: "Pay → BLOCKED", done: !!blocked, detail: blocked ? `${blocked.amount} USDC to ${shortKey(blocked.payee)} blocked` : "no payment attempt yet",
      how: "Before money moves, Supabrain traces where the payee address came from and checks the vendor's ENS record.",
      say: "The AI was fooled, but the money wasn't. ENS says a different address, so there's no override.",
      act: blocked?.decision.status === "blocked" ? { label: "Light up the path", run: () => onWhy([blocked.decision.status === "blocked" ? blocked.decision.path : []]) } : undefined },
    { title: "“This is wrong” → one revoke", done: quarantined.length > 0, detail: quarantined.length ? `${quarantined.length} memories quarantined` : undefined,
      how: "Dry run first: the blast radius lights up red. Then one click takes it back from every AI. Human notes stay green.",
      say: "One click shows how far the lie spread. One more takes it back from every AI. Only the bad parts; good work stays.",
      act: ev && admin && ev.status !== "quarantined" ? { label: "Open the dry run", run: () => onWrong(ev.key) } : ev ? { label: "Show the email", run: () => onFocus(ev.key) } : undefined },
    { title: "AIs correct themselves", done: noticeCount > 0 || quarantined.length > 0, detail: noticeCount ? `${noticeCount} retraction notices waiting` : "ask an AI the same question again",
      how: "The AI's next tool call carries a retraction notice; recall flags the old memory QUARANTINED with the reason.",
      say: "Same question, different answer. Nobody retrained or re-prompted anything.",
      act: { label: "Before / after", run: onBeforeAfter } },
    { title: "A human approves the money", done: !!humanPaid || approvals.length > 0, detail: humanPaid ? `PAID ${humanPaid.amount} USDC to ${humanPaid.payeeEns ?? shortKey(humanPaid.payee)}${denied ? ` · ${denied.decision.status.toUpperCase()} too` : ""}` : approvals.length ? "waiting in World App" : undefined,
      how: "Over the AI's ENS pay cap, or a new payee: it waits for a real person in World App, bound to this one payment.",
      say: "World proves a real person approved this exact payment. It's not a button a hacked AI could click.",
      act: { label: "Open payments", href: href("/t/payments") } },
    { title: "The off switch", done: !!off, detail: off ? `${off.ens} unregistered` : "run: pnpm demo:step-kill gem-research",
      how: "Remove the AI's ENS name: the server stops its writes, and BrainVault refuses its payments on chain.",
      say: "Delete the name and the AI is out: no writing, no paying, even on chain.",
      act: { label: "See the rules", href: href("/t/rules") } },
  ];
  return <GuideView beats={beats} onClose={onClose} left={left} />;
}

function GuideView({ beats, onClose, left }: { beats: Beat[]; onClose: () => void; left?: boolean }) {
  const firstOpen = beats.findIndex((b) => !b.done);
  const [i, setI] = useState(firstOpen < 0 ? 0 : firstOpen);
  const [all, setAll] = useState(false);
  const [mini, setMini] = useState(!!left);
  useEffect(() => setMini(!!left), [left]);
  const b = beats[Math.min(i, beats.length - 1)];
  if (mini) return (
    <section className={`guide${left ? " left" : ""}`} aria-label="Pitch guide" style={{ width: "auto" }}>
      <button className="row" style={{ padding: "10px 14px", gap: 10 }} onClick={() => setMini(false)}>
        <span className="eyebrow"><i />Guide</span><span className="mono tiny">step {i + 1}/{beats.length} · {b.title}</span><span className="muted">▴</span>
      </button>
    </section>
  );
  const act = (x: Beat["act"]) => x && ("href" in x ? <Link className="btn f xs" href={x.href}>{x.label} →</Link> : <button className="btn f xs" onClick={x.run}>{x.label} →</button>);
  return (
    <section className={`guide${left ? " left" : ""}`} aria-label="Pitch guide">
      <div className="hd">
        <span className="eyebrow"><i />Pitch guide · live checks</span><span className="spacer" />
        <button className="btn g xs" onClick={() => setAll((a) => !a)}>{all ? "One step" : "All steps"}</button>
        <button className="iconbtn" style={{ width: 28, height: 28 }} onClick={() => setMini(true)} aria-label="Minimise guide">▾</button>
        <button className="iconbtn" style={{ width: 28, height: 28 }} onClick={onClose} aria-label="Close guide">×</button>
      </div>
      <div className="gdots" role="tablist" aria-label="Demo steps">
        {beats.map((x, j) => <button key={x.title} role="tab" aria-selected={j === i} title={`${j + 1}. ${x.title}${x.done ? " (seen live)" : ""}`} className={`${x.done ? "done" : ""}${j === i ? " on" : ""}`} onClick={() => { setI(j); setAll(false); }}>{x.done ? "✓" : j + 1}</button>)}
      </div>
      {!all && (
        <div className="beat cur" style={{ borderBottom: 0 }}>
          <div className="grow">
            <div className="row"><span className="tiny mono dim">STEP {i + 1} OF {beats.length}</span>{b.done ? <span className="chip ok">SEEN LIVE</span> : <span className="chip">NOT YET</span>}</div>
            <b style={{ fontSize: "1rem", marginTop: 6 }}>{b.title}</b>
            {b.detail && <div className="tiny mono" style={{ color: b.done ? "var(--flow)" : "var(--dim)", marginTop: 2 }}>{b.detail}</div>}
            <p>{b.how}</p>
            <q>{b.say}</q>
            <div className="row" style={{ marginTop: 12 }}>
              <button className="btn g xs" disabled={i === 0} onClick={() => setI(i - 1)}>← Back</button>
              {act(b.act)}
              <span className="spacer" />
              <button className="btn g xs" disabled={i === beats.length - 1} onClick={() => setI(i + 1)}>Next →</button>
            </div>
          </div>
        </div>
      )}
      {all && beats.map((x, j) => (
        <div key={x.title} className={`beat${x.done ? " done" : ""}${j === i ? " cur" : ""}`}>
          <span className="n">{x.done ? "✓" : j + 1}</span>
          <div className="grow">
            <b>{x.title}</b>
            {x.detail && <div className="tiny mono" style={{ color: x.done ? "var(--flow)" : "var(--dim)", marginTop: 2 }}>{x.detail}</div>}
            <p>{x.how}</p>
            <q>{x.say}</q>
            {x.act && <div style={{ marginTop: 8 }}>{act(x.act)}</div>}
          </div>
        </div>
      ))}
      <div className="tiny muted" style={{ padding: "8px 14px 12px" }}>Each ✓ is read from the live team. Fallback: <span className="mono">pnpm demo:step blocked|approve</span> runs the same tools and identities.</div>
    </section>
  );
}

