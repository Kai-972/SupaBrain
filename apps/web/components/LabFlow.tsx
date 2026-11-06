"use client";
// The attack lab as a guided flow (UI_REDESIGN_PROMPT.md §5.4): 1 who acts · 2 what it does (any preset or your own
// words, every field editable) · 3 send and watch the four gates. Every outcome is the server's answer from
// POST /api/brains/:id/lab/act; the browser only maps the answer to the gate that decided it.
import { useEffect, useMemo, useRef, useState } from "react";
import presetsRaw from "@/content/lab-presets.json";
import { api, ApiError, type LabAction, type LabResponse, type LiveAgent, type RuleRow } from "@/lib/api";
import { brainId, getState, refreshRules, runLab, toast, useStore, type LabEntry } from "@/lib/store";
import { blockLabel, denyList, GUARD_IDS, GUARD_PLAIN, GUARD_RULES, guardList, short, vendorOf } from "@/lib/format";
import { writesToday } from "./BrainParts";
import { Ext } from "./ui";

interface Preset { id: string; mode: "normal" | "attack"; label: string; asAgent: string; action: LabAction; input: Record<string, unknown>; teaches: string; setup?: string; expected?: string; rule?: string }
const PRESETS = presetsRaw as unknown as Preset[];

interface Note { text: string; kind: string; sourceId: string }
interface FileBlock { path: string; content: string }
interface Draft { action: LabAction; summary: string; next: string; focus: string; notes: Note[]; files: FileBlock[] }
const BLANK: Draft = { action: "checkpoint", summary: "", next: "", focus: "", notes: [], files: [] };

function draftOf(p: Preset): Draft {
  const i = p.input as Record<string, unknown>;
  return {
    action: p.action, summary: String(i.summary ?? ""), next: String(i.next ?? ""), focus: String(i.focus ?? ""),
    notes: ((i.notes as { text: string; kind?: string; source?: { id: string } }[]) ?? []).map((n) => ({ text: n.text, kind: n.kind ?? "fact", sourceId: n.source?.id ?? "" })),
    files: ((i.files as { path: string; content?: string }[]) ?? []).map((f) => ({ path: f.path, content: f.content ?? "" })),
  };
}
function inputOf(d: Draft): Record<string, unknown> {
  if (d.action === "continue") return d.focus.trim() ? { focus: d.focus.trim() } : {};
  if (d.action === "checkout") return {};
  const out: Record<string, unknown> = { summary: d.summary };
  if (d.next.trim()) out.next = d.next.trim();
  const notes = d.notes.filter((n) => n.text.trim()).map((n) => ({ text: n.text, kind: n.kind, ...(n.kind === "evidence" ? { source: { type: "web", id: n.sourceId || `web:lab-${Date.now()}` } } : {}) }));
  if (notes.length) out.notes = notes;
  const files = d.files.filter((f) => f.path.trim()).map((f) => ({ path: f.path.trim(), content: f.content }));
  if (files.length) out.files = files;
  return out;
}
/** Which of the four gates decided this answer (0 identity · 1 ENS rules · 2 content · 3 record). */
function decidingGate(r?: LabResponse): { gate: number; ok: boolean } {
  if (!r) return { gate: -1, ok: true };
  if (r.outcome === "stopped") return { gate: 2, ok: false };
  if (r.outcome === "refused") {
    if (r.code === "SCOPE" || r.code === "DENIED" || r.code === "RATE_LIMIT" || (r.code === "NOT_AUTHORIZED" && r.rule === "sb.status")) return { gate: 1, ok: false };
    if (r.code === "INVALID") return { gate: 2, ok: false };
    return { gate: 0, ok: false };
  }
  return { gate: r.action === "checkpoint" ? 3 : 1, ok: true };
}
const plainScope = (s?: string) => (!s ? "—" : s === "*" ? "everywhere" : `only ${s}`);
export const agentForPreset = (p: Preset, agents: LiveAgent[]) => agents.find((a) => a.label === p.asAgent) ?? agents.find((a) => a.vendor === p.asAgent);

// ---------------------------------------------------------------- step 1
export function WhoActs({ agents, rules, value, onPick, onRules }: { agents: LiveAgent[]; rules?: RuleRow[]; value?: string; onPick: (l: string) => void; onRules: (l: string) => void }) {
  const checkpoints = useStore((s) => s.checkpoints);
  return (
    <div className="tiles4">
      {agents.map((a) => {
        const v = vendorOf(a.vendor);
        const r = rules?.find((x) => x.agent === a.label);
        const daily = Number(r?.writeDaily ?? a.writeDaily ?? 0);
        const paused = (r?.status ?? a.status) !== "active";
        return (
          <div key={a.label} className={`tile4${value === a.label ? " on" : ""}${paused ? " off" : ""}`}>
            <button className="tile4-main" onClick={() => onPick(a.label)} aria-pressed={value === a.label}>
              <span className="row"><i className={`dot4 big ${v.cls}`} /><b>{v.name}</b>{paused && <span className="tag4 bad">PAUSED</span>}</span>
              <span className="mono small ell">{a.ens}</span>
              <span className="plain">{paused ? "Paused: every call is refused" : <>May write {plainScope(r?.scope ?? a.scope)}{denyList(r?.deny).length ? `, never ${denyList(r?.deny).join(", ")}` : ""}</>}</span>
              {!paused && <span className="plain">Blocks {guardList(r?.guard).length} of 6 attack types · {writesToday(checkpoints, a.label)} of {daily || "∞"} commits today</span>}
            </button>
            <button className="tile4-link" onClick={() => onRules(a.label)}>Change {v.name}&apos;s rules</button>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- step 2
export function WhatToTry({ picked, onPick }: { picked?: string; onPick: (p?: Preset) => void }) {
  const normal = PRESETS.filter((p) => p.mode === "normal");
  const attack = PRESETS.filter((p) => p.mode === "attack");
  const card = (p: Preset) => (
    <button key={p.id} className={`card4${picked === p.id ? " on" : ""}${p.mode === "attack" ? " atk" : ""}`} onClick={() => onPick(p)} aria-pressed={picked === p.id}>
      <b>{p.label}</b><span>{p.teaches}</span>
      {p.rule && <em className="rule4">Decided by {p.rule}</em>}
    </button>
  );
  return (
    <div className="try4">
      <div><h3>Normal work</h3><div className="cards4">{normal.map(card)}</div></div>
      <div><h3 className="bad">Attacks</h3><div className="cards4">{attack.map(card)}</div></div>
      <button className={`card4 own${picked === "own" ? " on" : ""}`} onClick={() => onPick(undefined)}><b>Write your own</b><span>Type anything an AI might pass on: a README, an issue, a note. The real system decides.</span></button>
    </div>
  );
}

export function Editor({ d, set }: { d: Draft; set: (d: Draft) => void }) {
  const upNote = (i: number, p: Partial<Note>) => set({ ...d, notes: d.notes.map((n, j) => (j === i ? { ...n, ...p } : n)) });
  const upFile = (i: number, p: Partial<FileBlock>) => set({ ...d, files: d.files.map((f, j) => (j === i ? { ...f, ...p } : f)) });
  return (
    <div className="editor4">
      <div className="seg4" role="group" aria-label="Tool">
        {(["checkpoint", "continue", "checkout"] as const).map((a) => <button key={a} aria-pressed={d.action === a} onClick={() => set({ ...d, action: a })}>{a === "checkpoint" ? "Save work (checkpoint)" : a === "continue" ? "Pick up (continue)" : "Get files (checkout)"}</button>)}
      </div>
      {d.action === "continue" && <label>What should it focus on? (optional)<input value={d.focus} onChange={(e) => set({ ...d, focus: e.target.value })} placeholder="e.g. dark mode" /></label>}
      {d.action === "checkout" && <p className="muted">Returns the current version of every project file, as the AI would receive it.</p>}
      {d.action === "checkpoint" && (
        <>
          <label>What did the AI do? (summary)<input value={d.summary} onChange={(e) => set({ ...d, summary: e.target.value })} placeholder="e.g. Added the dark mode toggle" /></label>
          {d.notes.map((n, i) => (
            <div key={i} className="block4">
              <div className="row"><b>{n.kind === "evidence" ? "Something it read (evidence)" : "A note it passes on"}</b><span className="spacer" /><button className="btn g xs" onClick={() => set({ ...d, notes: d.notes.filter((_, j) => j !== i) })}>Remove</button></div>
              <textarea rows={5} value={n.text} onChange={(e) => upNote(i, { text: e.target.value })} aria-label="Note text" />
            </div>
          ))}
          {d.files.map((f, i) => (
            <div key={i} className="block4">
              <div className="row"><b>A file it writes</b><span className="spacer" /><button className="btn g xs" onClick={() => set({ ...d, files: d.files.filter((_, j) => j !== i) })}>Remove</button></div>
              <input className="mono" value={f.path} onChange={(e) => upFile(i, { path: e.target.value })} aria-label="File path" placeholder="src/app.ts" />
              <textarea className="mono" rows={4} value={f.content} onChange={(e) => upFile(i, { content: e.target.value })} aria-label="File content" />
            </div>
          ))}
          <div className="row">
            <button className="btn g sm" onClick={() => set({ ...d, notes: [...d.notes, { text: "", kind: "evidence", sourceId: "" }] })}>+ Something it read</button>
            <button className="btn g sm" onClick={() => set({ ...d, files: [...d.files, { path: "", content: "" }] })}>+ A file</button>
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- step 3
const GATES = [
  { t: "Identity", q: "Is this AI's ENS name live, and is the server's key its ENS address?" },
  { t: "ENS rules", q: "Status, scope, protected paths (sb.deny) and commits per day, read live from ENS." },
  { t: "Content", q: "The attack checks this AI's ENS rule sb.guard requires. Real secrets are always refused." },
  { t: "Record", q: "Signed on Arkiv by the AI's own wallet." },
];

export function Gates({ e, agent, draftAction }: { e?: LabEntry; agent?: LiveAgent; draftAction: LabAction }) {
  const [lit, setLit] = useState(-1);
  const { gate, ok } = decidingGate(e?.res);
  const action = e?.action ?? draftAction;
  // While waiting, walk the gates; when the answer lands, settle on the one that decided.
  useEffect(() => {
    if (!e) { setLit(-1); return; }
    if (e.pending) { setLit(0); const t = setInterval(() => setLit((x) => (x + 1) % 4), 520); return () => clearInterval(t); }
    if (e.error) { setLit(-1); return; }
    let i = 0; setLit(0);
    const t = setInterval(() => { i++; setLit(i); if (i >= gate) clearInterval(t); }, 380);
    return () => clearInterval(t);
  }, [e?.id, e?.pending, gate]); // eslint-disable-line react-hooks/exhaustive-deps
  const settled = !!e && !e.pending && !e.error && lit >= gate;
  return (
    <div className="gates4" aria-live="polite">
      {GATES.map((g, i) => {
        const skip = action !== "checkpoint" && i >= 2;
        const state = !e ? "" : e.pending ? (i === lit ? "scan" : "") : settled && i === gate ? (ok ? "pass decide" : "fail decide") : i < Math.min(lit, gate) || (settled && i < gate) ? "pass" : settled && i > gate ? "rest" : i <= lit ? "pass" : "";
        return (
          <div key={g.t} className={`gate4 ${state}${skip ? " skip" : ""}`}>
            <span className="gn">{i + 1}</span>
            <b>{g.t}</b>
            <span className="gq">{skip ? "Not used by this tool" : g.q}</span>
            {settled && i === gate && <span className="gv">{ok ? (action === "checkpoint" ? `SAVED · signed by ${agent?.ens ?? e?.agent}` : "ANSWERED") : e?.res?.outcome === "stopped" ? `STOPPED · sb.guard · ${e.res.result.stopped.rule}` : e?.res?.outcome === "refused" ? blockLabel(e.res.code, e.res.rule) : ""}</span>}
          </div>
        );
      })}
    </div>
  );
}

export function Result({ e, agent, other }: { e?: LabEntry; agent?: LiveAgent; other?: LiveAgent }) {
  const nodes = useStore((s) => s.nodes);
  const heads = useStore((s) => s.headEvents);
  const admin = useStore((s) => s.admin);
  const [reads, setReads] = useState<string>();
  const r = e?.res;
  useEffect(() => {
    setReads(undefined);
    if (!r || r.outcome !== "stopped" || !other || !admin) return;
    let live = true;
    api.lab(brainId(), other.label, "continue", {}).then((x) => { if (live && x.outcome === "ok") setReads(String(x.result.text ?? "")); }).catch(() => {});
    return () => { live = false; };
  }, [r, other, admin]);
  if (!e) return <p className="muted center">Pick who acts and what to try, then press Send.</p>;
  if (e.pending) return <p className="muted center"><span className="spinner" /> Sending as {agent?.ens ?? e.agent}…</p>;
  if (e.error) return <div className="res4 warn"><b>Not sent</b><p>{e.error}</p></div>;
  if (!r) return null;
  if (r.outcome === "refused") {
    return (
      <div className="res4 bad">
        <b>{blockLabel(r.code, r.rule)}</b>
        <p>{r.message}</p>
        {r.rule?.startsWith("sb.") && <p className="small muted">The rule that decided this is a public ENS text record on {agent?.ens}. Change it in the rules sheet and send again.</p>}
      </div>
    );
  }
  if (r.outcome === "stopped") {
    const ex = r.result.stopped.excerpt;
    const probe = ex.replace(/…/g, "").slice(0, 28).toLowerCase();
    const received = reads ? reads.toLowerCase().includes(probe) : undefined;
    return (
      <div className="res4 bad">
        <b>STOPPED · {GUARD_RULES[r.result.stopped.rule] ?? r.result.stopped.rule}</b>
        <p className="explain4">Forbidden by {agent?.ens}&apos;s ENS rule <code>sb.guard</code>: it may not pass on {GUARD_PLAIN[r.result.stopped.rule] ?? r.result.stopped.rule}.</p>
        <blockquote>“{ex}”</blockquote>
        <p>Saved for the owner&apos;s review, signed by {agent?.ens}, and revoked on Arkiv at once. {r.result.stopped.arkivUrl && <Ext href={r.result.stopped.arkivUrl}>The revocation on Arkiv</Ext>}</p>
        {other && (
          <div className="reads4">
            <div className="row"><b>What {vendorOf(other.vendor).name} reads now</b><span className="spacer" />{received === false && <span className="tag4 ok">✓ NOT RECEIVED</span>}{received === true && <span className="tag4 bad">RECEIVED</span>}</div>
            {reads === undefined ? <p className="muted small"><span className="spinner" /> Asking {other.ens} to continue…</p> : <pre>{reads.slice(0, 900)}</pre>}
          </div>
        )}
      </div>
    );
  }
  if (e.action === "checkpoint") {
    const key = r.result.key as string | undefined;
    const n = key ? nodes[key] : undefined;
    const head = key && heads[e.agent]?.key === key ? heads[e.agent] : undefined;
    return (
      <div className="res4 ok">
        <b>SAVED · signed by {agent?.ens ?? e.agent}</b>
        {(r.result as { flagged?: { rule: string; excerpt: string } }).flagged && (() => { const f = (r.result as { flagged: { rule: string; excerpt: string } }).flagged; return (
          <p className="explain4 warn">The content check found {GUARD_PLAIN[f.rule] ?? f.rule} (“{f.excerpt}”), but {agent?.ens}&apos;s ENS rule <code>sb.guard</code> doesn&apos;t include <code>{f.rule}</code>, so the owner&apos;s rule allowed it.</p>
        ); })()}
        <p>{n && !n.pending && n.proofUrl ? <Ext href={n.proofUrl}>Open the signed entity on Arkiv</Ext> : <span className="row"><span className="spinner" /> Arkiv is confirming…</span>}</p>
        <p className="small">{head ? <>HEAD ON ENS: {agent?.ens} now points at {short(key)} · <Ext href={head.txUrl}>Sepolia tx</Ext></> : "Its ENS name is updated to point at it once Arkiv confirms (sb.memory.head)."}</p>
      </div>
    );
  }
  return <div className="res4"><b>What {agent?.ens} receives</b><pre>{String(r.result.text ?? JSON.stringify(r.result, null, 2)).slice(0, 1400)}</pre></div>;
}

// ---------------------------------------------------------------- the rules sheet
export function RulesSheet({ agent, onClose, preset }: { agent: LiveAgent; onClose: () => void; preset?: Partial<{ scope: string }> }) {
  const rules = useStore((s) => s.rules);
  const admin = useStore((s) => s.admin);
  const row = rules?.agents.find((r) => r.agent === agent.label);
  const [status, setStatus] = useState(row?.status ?? agent.status);
  const [scopeMode, setScopeMode] = useState<"all" | "docs" | "custom">(() => { const s = preset?.scope ?? row?.scope ?? agent.scope; return s === "*" ? "all" : s === "docs/" || s === "docs" ? "docs" : "custom"; });
  const [custom, setCustom] = useState(() => { const s = preset?.scope ?? row?.scope ?? ""; return s === "*" || s === "docs/" ? "" : s; });
  const [daily, setDaily] = useState(Number(row?.writeDaily ?? agent.writeDaily ?? 200));
  const [guard, setGuard] = useState<string[]>(() => guardList(row?.guard));
  const [deny, setDeny] = useState<string[]>(() => denyList(row?.deny));
  const [newDeny, setNewDeny] = useState("");
  const [phase, setPhase] = useState<{ step: 0 | 1 | 2 | 3; txUrl?: string; readBack?: string; error?: string }>({ step: 0 });
  const v = vendorOf(agent.vendor);
  const scope = scopeMode === "all" ? "*" : scopeMode === "docs" ? "docs/" : custom.trim();
  const editable = !!rules?.editable && admin;
  const save = async () => {
    setPhase({ step: 1 });
    try {
      const res = await api.setRules(brainId(), { agent: agent.label, status, scope, writeDaily: String(daily), guard: guard.length === GUARD_IDS.length ? "*" : guard.length ? guard.join(",") : "none", deny: deny.length ? deny.join(",") : "none" });
      setPhase({ step: 2, txUrl: res.txUrl });
      await refreshRules();
      const back = getState().rules?.agents.find((r) => r.agent === agent.label);
      setPhase({ step: 3, txUrl: res.txUrl, readBack: back ? `status ${back.status} · may write ${plainScope(back.scope)} · never ${denyList(back.deny).join(", ") || "—"} · blocks ${guardList(back.guard).length} of 6 attacks · ${back.writeDaily} a day` : "read back" });
      toast(res.txHash ? `${agent.ens}'s rules are on ENS` : "Nothing changed", "ok");
    } catch (e) {
      setPhase({ step: 0, error: e instanceof ApiError ? e.message : "The ENS write failed" });
    }
  };
  return (
    <>
      <div className="scrim4" onClick={onClose} />
      <aside className="panel4 sheet" role="dialog" aria-label={`Change ${v.name}'s rules`}>
        <header><span className={`dot4 big ${v.cls}`} /><div className="grow"><div className="p-who">Change {v.name}&apos;s rules</div><div className="p-meta mono">{agent.ens}</div></div><button className="iconbtn" onClick={onClose} aria-label="Close">×</button></header>
        <div className="p-body">
          {!editable && <div className="callout warn">{admin ? "This server's rules are owner-key only (team mode)." : "Owner sign-in is needed to change rules: each change is a real Sepolia transaction."}</div>}
          <section>
            <h4>Status <code>sb.status</code></h4>
            <div className="seg4">
              <button aria-pressed={status === "active"} onClick={() => setStatus("active")}>Active</button>
              <button aria-pressed={status === "paused"} onClick={() => setStatus("paused")}>Paused</button>
            </div>
          </section>
          <section>
            <h4>May write <code>sb.scope</code></h4>
            <div className="seg4">
              <button aria-pressed={scopeMode === "all"} onClick={() => setScopeMode("all")}>Everything</button>
              <button aria-pressed={scopeMode === "docs"} onClick={() => setScopeMode("docs")}>Only docs/</button>
              <button aria-pressed={scopeMode === "custom"} onClick={() => setScopeMode("custom")}>Custom</button>
            </div>
            {scopeMode === "custom" && <input className="mono" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="src/app/" aria-label="Path prefix" />}
          </section>
          <section>
            <h4>May not pass on <code>sb.guard</code></h4>
            <div className="chips4">
              {GUARD_IDS.map((id) => (
                <button key={id} aria-pressed={guard.includes(id)} onClick={() => setGuard(guard.includes(id) ? guard.filter((x) => x !== id) : [...guard, id])}>
                  {guard.includes(id) ? "✕ " : "○ "}{GUARD_PLAIN[id]}
                </button>
              ))}
            </div>
            <p className="small muted">Checked items are attacks this AI is stopped from passing on. Untick one and the same attack is saved, flagged as allowed by your rule.</p>
          </section>
          <section>
            <h4>May never write <code>sb.deny</code></h4>
            <div className="chips4">
              {deny.map((d) => <button key={d} aria-pressed onClick={() => setDeny(deny.filter((x) => x !== d))}>{d} ×</button>)}
              {[".github/", "scripts/"].filter((d) => !deny.includes(d)).map((d) => <button key={d} onClick={() => setDeny([...deny, d])}>+ {d}</button>)}
            </div>
            <div className="row"><input className="mono" value={newDeny} onChange={(e) => setNewDeny(e.target.value)} placeholder="infra/" aria-label="Add a protected path" /><button className="btn g sm" disabled={!newDeny.trim()} onClick={() => { setDeny([...new Set([...deny, newDeny.trim()])]); setNewDeny(""); }}>Add</button></div>
          </section>
          <section>
            <h4>Commits per day <code>sb.write.daily</code></h4>
            <div className="step4">
              <button onClick={() => setDaily(Math.max(0, daily - (daily > 20 ? 10 : 1)))} aria-label="Fewer">−</button>
              <input type="number" min={0} value={daily} onChange={(e) => setDaily(Math.max(0, Number(e.target.value) || 0))} aria-label="Writes per day" />
              <button onClick={() => setDaily(daily + (daily >= 20 ? 10 : 1))} aria-label="More">+</button>
            </div>
          </section>
          <section>
            <button className="btn p wide" disabled={!editable || phase.step === 1 || phase.step === 2 || (scopeMode === "custom" && !custom.trim())} onClick={save}>Write to ENS</button>
            <ol className="prog4">
              <li className={phase.step >= 1 ? (phase.step === 1 ? "now" : "done") : ""}>Writing to ENS <span>one multicall on {v.name}&apos;s own resolver, paid by the server</span></li>
              <li className={phase.step >= 2 ? (phase.step === 2 ? "now" : "done") : ""}>Confirmed on Sepolia {phase.txUrl && <Ext href={phase.txUrl}>tx</Ext>}</li>
              <li className={phase.step >= 3 ? "done" : ""}>Read back from ENS <span>{phase.readBack ?? "the next call obeys it"}</span></li>
            </ol>
            {phase.error && <div className="callout bad">{phase.error}</div>}
          </section>
        </div>
      </aside>
    </>
  );
}

// ---------------------------------------------------------------- the flow
export function LabFlow({ initialRules }: { initialRules?: string }) {
  const brain = useStore((s) => s.brain);
  const rules = useStore((s) => s.rules);
  const admin = useStore((s) => s.admin);
  const mode = useStore((s) => s.mode);
  const lab = useStore((s) => s.lab);
  const agents = useMemo(() => brain?.agents ?? [], [brain]);
  const [who, setWho] = useState<string>();
  const [preset, setPreset] = useState<string>();
  const [draft, setDraft] = useState<Draft>(BLANK);
  const [sheet, setSheet] = useState<{ agent: string; scope?: string }>();
  const [entryId, setEntryId] = useState<number>();
  const stage = useRef<HTMLDivElement>(null);
  const editRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (preset) setTimeout(() => editRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 60); }, [preset]);
  useEffect(() => { if (!who && agents.length) setWho(agents.find((a) => a.vendor === "gemini")?.label ?? agents[0]!.label); }, [agents, who]);
  useEffect(() => { if (initialRules && agents.some((a) => a.label === initialRules)) setSheet({ agent: initialRules }); }, [initialRules, agents]);
  const actor = agents.find((a) => a.label === who);
  const other = agents.find((a) => a.label !== who && a.vendor === "claude") ?? agents.find((a) => a.label !== who);
  const entry = lab.find((l) => l.id === entryId);
  const p = PRESETS.find((x) => x.id === preset);
  const canSend = mode !== "mock" && admin && !!actor && (draft.action !== "checkpoint" || !!draft.summary.trim()) && !entry?.pending;

  const pick = (x?: Preset) => {
    if (!x) { setPreset("own"); setDraft({ ...BLANK, notes: [{ text: "", kind: "evidence", sourceId: "" }] }); return; }
    setPreset(x.id); setDraft(draftOf(x));
    const a = agentForPreset(x, agents); if (a) setWho(a.label);
  };
  const send = async () => {
    if (!actor) return;
    stage.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    const e = await runLab(actor.label, draft.action, inputOf(draft));
    setEntryId(e.id);
  };
  useEffect(() => { const last = lab[0]; if (last?.pending) setEntryId(last.id); }, [lab]);

  return (
    <div className="flow4">
      <section className="step-4" data-tour="lab-who" data-reveal>
        <h2><span>1</span> Who acts?</h2>
        <WhoActs agents={agents} rules={rules?.agents} value={who} onPick={setWho} onRules={(l) => setSheet({ agent: l })} />
      </section>
      <section className="step-4" data-tour="lab-attack" data-reveal>
        <h2><span>2</span> What does it do?</h2>
        <WhatToTry picked={preset} onPick={pick} />
        {(preset || draft.summary) && (
          <div className="edit4" ref={editRef}>
            {p?.setup && <div className="callout warn row wrapr"><span>{p.setup}</span>{/sb\.scope.*docs/.test(p.setup) && actor && <button className="btn g sm" onClick={() => setSheet({ agent: agentForPreset(p, agents)?.label ?? actor.label, scope: "docs/" })}>Set it up</button>}</div>}
            <Editor d={draft} set={setDraft} />
          </div>
        )}
      </section>
      <section className="step-4" ref={stage} data-tour="lab-result" data-reveal>
        <h2><span>3</span> Send it and watch</h2>
        <div className="row wrapr">
          <button className="btn p big4" disabled={!canSend} onClick={send}>Send as {actor ? vendorOf(actor.vendor).name : "…"}</button>
          {mode === "mock" && <span className="muted">The lab needs the live server (MOCK DATA can&apos;t run real tools).</span>}
          {mode !== "mock" && !admin && <span className="muted">Owner sign-in is needed: every send is a real Arkiv write.</span>}
        </div>
        <Gates e={entry} agent={agents.find((a) => a.label === entry?.agent)} draftAction={draft.action} />
        <Result e={entry} agent={agents.find((a) => a.label === entry?.agent)} other={entry ? agents.find((a) => a.label !== entry.agent && a.vendor === "claude") ?? agents.find((a) => a.label !== entry.agent) : other} />
      </section>
      {sheet && agents.find((a) => a.label === sheet.agent) && <RulesSheet agent={agents.find((a) => a.label === sheet.agent)!} preset={sheet.scope ? { scope: sheet.scope } : undefined} onClose={() => setSheet(undefined)} />}
    </div>
  );
}
