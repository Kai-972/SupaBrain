"use client";
// The attack lab (FRONTEND_V2.md §6.3, FRONTEND_CONTENT.md §5): drive the REAL tools as one of this brain's AIs.
// Every outcome shown here is the server's answer. Nothing is decided in the browser.
import { useEffect, useMemo, useRef, useState } from "react";
import presetsRaw from "@/content/lab-presets.json";
import { api, ApiError, explorerFromTx, type LabAction, type LabResponse, type LiveAgent, type RuleRow } from "@/lib/api";
import { brainId, refreshRules, runLab, toast, useStore, type LabEntry } from "@/lib/store";
import { blockLabel, clock, short, vendorOf } from "@/lib/format";
import { Copy, Ext, VendorBadge } from "./ui";

interface Preset { id: string; mode: "normal" | "attack"; label: string; asAgent: string; action: LabAction; input: Record<string, unknown>; teaches: string; setup?: string; expected?: string }
const PRESETS = presetsRaw as unknown as Preset[];

interface NoteRow { text: string; kind: string; sourceType: string; sourceId: string }
interface FileRow { path: string; content: string; del: boolean }
interface Form { summary: string; next: string; tasks: string; notes: NoteRow[]; files: FileRow[]; focus: string; paths: string }
const EMPTY: Form = { summary: "", next: "", tasks: "", notes: [], files: [], focus: "", paths: "" };

function formFromPreset(p: Preset): Form {
  const i = p.input as Record<string, unknown>;
  return {
    summary: String(i.summary ?? ""), next: String(i.next ?? ""), tasks: ((i.add_tasks as string[]) ?? []).join("\n"),
    notes: ((i.notes as { text: string; kind?: string; source?: { type: string; id: string } }[]) ?? []).map((n) => ({ text: n.text, kind: n.kind ?? "fact", sourceType: n.source?.type ?? "web", sourceId: n.source?.id ?? "" })),
    files: ((i.files as { path: string; content?: string; delete?: boolean }[]) ?? []).map((f) => ({ path: f.path, content: f.content ?? "", del: !!f.delete })),
    focus: String(i.focus ?? ""), paths: ((i.paths as string[]) ?? []).join("\n"),
  };
}
function inputFromForm(action: LabAction, f: Form): Record<string, unknown> {
  if (action === "continue") return f.focus.trim() ? { focus: f.focus.trim() } : {};
  if (action === "checkout") { const paths = f.paths.split(/[\n,]/).map((x) => x.trim()).filter(Boolean); return paths.length ? { paths } : {}; }
  const out: Record<string, unknown> = { summary: f.summary };
  if (f.next.trim()) out.next = f.next.trim();
  const tasks = f.tasks.split("\n").map((x) => x.trim()).filter(Boolean);
  if (tasks.length) out.add_tasks = tasks;
  const notes = f.notes.filter((n) => n.text.trim()).map((n) => ({ text: n.text, kind: n.kind, ...(n.kind === "evidence" ? { source: { type: n.sourceType, id: n.sourceId || `${n.sourceType}:lab-${Date.now()}` } } : {}) }));
  if (notes.length) out.notes = notes;
  const files = f.files.filter((x) => x.path.trim()).map((x) => (x.del ? { path: x.path.trim(), delete: true } : { path: x.path.trim(), content: x.content }));
  if (files.length) out.files = files;
  return out;
}

// ---------------------------------------------------------------- outcome
export function Outcome({ e, agent, other }: { e: LabEntry; agent?: LiveAgent; other?: LiveAgent }) {
  const nodes = useStore((s) => s.nodes);
  const heads = useStore((s) => s.headEvents);
  const blocked = useStore((s) => s.blocked);
  const rules = useStore((s) => s.rules);
  const admin = useStore((s) => s.admin);
  const [otherText, setOtherText] = useState<string>();
  const ens = agent?.ens ?? e.agent;
  const r = e.res;
  // After a stop, prove the other AI doesn't receive it: run a real `continue` as that AI.
  useEffect(() => {
    if (!r || r.outcome !== "stopped" || !other || !admin) return;
    let live = true;
    api.lab(brainId(), other.label, "continue", {}).then((x) => { if (live && x.outcome === "ok") setOtherText(String(x.result.text ?? "")); }).catch(() => {});
    return () => { live = false; };
  }, [r, other, admin]);

  if (e.pending) return <div className="outcome"><div className="row"><span className="spinner" /><span className="small">Sending as <b className="mono">{ens}</b>: ENS check, rules, content check, then Arkiv…</span></div></div>;
  if (e.error) return <div className="outcome warn"><div className="big">NOT SENT</div><div className="small">{e.error}</div></div>;
  if (!r) return null;

  if (r.outcome === "ok") {
    if (e.action === "checkpoint") {
      const key = r.result.key as string | undefined;
      const n = key ? nodes[key] : undefined;
      const confirmed = n && !n.pending && n.proofUrl;
      const head = key && heads[e.agent]?.key === key ? heads[e.agent] : undefined;
      return (
        <div className="outcome ok">
          <div className="big">SAVED · signed by {ens}</div>
          <div className="small">{confirmed ? <>On Arkiv: <Ext href={n.proofUrl}>open the signed entity</Ext></> : <span className="row"><span className="spinner" /> waiting for Arkiv to confirm…</span>}</div>
          {head ? <div className="small"><span className="chip warn">HEAD ON ENS</span> {ens} now points at {short(key)} · <Ext href={head.txUrl}>Sepolia tx</Ext></div> : confirmed ? <div className="tiny muted">The HEAD tag appears when its ENS name is updated (sb.memory.head).</div> : null}
          {key && <div className="mono tiny dim">key {short(key, 10, 8)}</div>}
        </div>
      );
    }
    const text = String(r.result.text ?? JSON.stringify(r.result, null, 2));
    return (
      <div className="outcome ok">
        <div className="big">{e.action === "continue" ? `WHAT ${ens} READS NOW` : `FILES FOR ${ens}`}</div>
        <pre className="code" style={{ maxHeight: 260, overflow: "auto", fontSize: ".72rem" }}>{text}</pre>
      </div>
    );
  }
  if (r.outcome === "stopped") {
    const s = r.result.stopped;
    const arkivUrl = s.arkivUrl ?? blocked.find((b) => b.key === r.result.key)?.arkivUrl;
    const probe = s.excerpt.replace(/^…|…$/g, "").slice(0, 40);
    const absent = otherText !== undefined ? !otherText.includes(probe) : undefined;
    return (
      <div className="outcome bad">
        <div className="big">STOPPED · INJECTION · {s.rule}</div>
        <div className="excerpt">{s.excerpt}</div>
        <div className="small">Saved for review, signed by {ens}, and revoked on Arkiv {arkivUrl ? <Ext href={arkivUrl}>revocation</Ext> : "(link arrives with the revocation)"}. <b>No other AI will receive this.</b></div>
        {other && (absent === undefined
          ? <div className="tiny muted">{admin ? <>Checking what <b className="mono">{other.ens}</b> reads now…</> : "Sign in to check what the other AI reads."}</div>
          : absent ? <div className="small"><span className="chip ok">✓ NOT IN WHAT {other.label.toUpperCase()} READS</span> checked with a live <span className="mono">continue</span> as {other.ens}</div>
            : <div className="small"><span className="chip solid-bad">FOUND IN {other.label.toUpperCase()}&apos;S CONTINUE</span> This would be a bug: the stopped text reached another AI.</div>)}
      </div>
    );
  }
  const ensRule = r.rule?.startsWith("sb.");
  const row = rules?.agents.find((x) => x.agent === e.agent);
  const live = r.rule === "sb.scope" ? row?.scope : r.rule === "sb.write.daily" ? row?.writeDaily : r.rule === "sb.status" ? row?.status : undefined;
  const invalid = r.code === "INVALID";
  return (
    <div className={`outcome ${invalid ? "warn" : "bad"}`}>
      <div className="big">{blockLabel(r.code, r.rule)}</div>
      <div className="small">{r.message}</div>
      {ensRule && live !== undefined && <div className="small">Live ENS record: <span className="mono">{r.rule} = {live}</span> on <span className="mono">{ens}</span>.</div>}
      <div className="tiny muted">{invalid ? "Nothing reached the chain." : "Nothing was written."}</div>
    </div>
  );
}

// ---------------------------------------------------------------- console
export function Console({ agent, other, agents, onAgent, presentPin }: { agent?: LiveAgent; other?: LiveAgent; agents: LiveAgent[]; onAgent: (l: string) => void; presentPin: (e: LabEntry) => void }) {
  const lab = useStore((s) => s.lab);
  const nodes = useStore((s) => s.nodes);
  const blocked = useStore((s) => s.blocked);
  const admin = useStore((s) => s.admin);
  const mode = useStore((s) => s.mode);
  const pulse = useStore((s) => s.pulse);
  const [action, setAction] = useState<LabAction>("checkpoint");
  const [kind, setKind] = useState<"normal" | "attack">("normal");
  const [preset, setPreset] = useState<string>();
  const [f, setF] = useState<Form>(EMPTY);
  const [busy, setBusy] = useState(false);
  const label = agent?.label ?? "";
  const fam = agent?.vendor ?? "";
  const presets = PRESETS.filter((p) => p.mode === kind);
  const mine = lab.filter((l) => l.agent === label);
  const latest = mine[0];
  const now = Date.now();
  const hot = pulse && pulse.agent === label && now - pulse.at < 2500;

  // Activity: real MCP traffic (nodes, blocks) merged with lab actions from this session.
  const activity = useMemo(() => {
    const labKeys = new Set(lab.map((l) => (l.res && "result" in l.res ? (l.res.result as { key?: string }).key : undefined)).filter(Boolean) as string[]);
    const fromNodes = Object.values(nodes).filter((n) => n.agent === label && (n.kind === "checkpoint")).map((n) => ({
      id: n.key, at: n.createdAt, tone: n.status === "quarantined" ? "bad" : "ok",
      label: n.status === "quarantined" ? "STOPPED" : n.pending ? "SAVING" : "SAVED", text: n.text,
      src: n.checkpoint?.client === "supabrain-lab" || labKeys.has(n.key) ? "LAB" : n.checkpoint?.client ? `MCP · ${n.checkpoint.client}` : "MCP", href: n.proofUrl,
    }));
    const fromBlocks = blocked.filter((b) => b.agent === label && b.code !== "STOPPED").map((b) => ({ id: `b${b.at}${b.code}`, at: b.at, tone: "bad", label: blockLabel(b.code, b.rule), text: b.message, src: b.tool, href: undefined as string | undefined }));
    const fromLab = mine.filter((l) => l.action !== "checkpoint" || !l.res || l.res.outcome === "refused" || l.error).map((l) => ({
      id: `l${l.id}`, at: l.at, tone: l.error ? "warn" : l.res?.outcome === "refused" ? (l.res.code === "INVALID" ? "warn" : "bad") : "ok",
      label: l.pending ? "SENDING" : l.error ? "NOT SENT" : l.res?.outcome === "refused" ? blockLabel(l.res.code, l.res.rule) : l.action.toUpperCase(),
      text: l.error ?? (l.res?.outcome === "refused" ? l.res.message : l.action === "continue" ? "read the brain (continue)" : "got files (checkout)"), src: "LAB", href: undefined as string | undefined,
    }));
    const seen = new Set<string>();
    return [...fromNodes, ...fromBlocks, ...fromLab].filter((x) => (seen.has(x.id) ? false : (seen.add(x.id), true))).sort((a, b) => b.at - a.at).slice(0, 30);
  }, [nodes, blocked, mine, lab, label]);

  const pick = (p: Preset) => { setPreset(p.id); setAction(p.action); setF(formFromPreset(p)); if (p.asAgent !== fam) { const a = agents.find((x) => x.vendor === p.asAgent); if (a) onAgent(a.label); } };
  const cur = PRESETS.find((p) => p.id === preset);
  const send = async () => {
    if (!agent) return;
    setBusy(true);
    const e = await runLab(agent.label, action, inputFromForm(action, f));
    setBusy(false);
    presentPin(e);
  };
  const upd = (patch: Partial<Form>) => { setF((x) => ({ ...x, ...patch })); setPreset(undefined); };

  return (
    <section className={`console${hot ? " hot" : ""}`} aria-label={`Console for ${agent?.ens ?? "an AI"}`}>
      <div className="chd">
        {agent && <VendorBadge vendor={agent.vendor} big />}
        <div className="grow" style={{ minWidth: 0 }}>
          <select value={label} onChange={(e) => onAgent(e.target.value)} aria-label="Act as" style={{ fontFamily: "var(--mono)", fontSize: ".8rem", padding: "6px 8px" }}>
            {agents.map((a) => <option key={a.label} value={a.label}>{a.ens}</option>)}
          </select>
        </div>
        {agent && <span className={`chip ${agent.status === "active" ? "ok" : "solid-bad"}`}>{agent.status.toUpperCase()}</span>}
      </div>
      <div className="acts" aria-live="polite">
        {activity.length === 0 && <div className="small muted" style={{ padding: 8 }}>No activity yet. Real MCP calls from {vendorOf(fam).name} apps appear here too.</div>}
        {activity.map((x) => (
          <div key={x.id} className={`act ${x.tone}`}>
            <div className="top"><span className="mono tiny dim">{clock(x.at)}</span><span className={`chip ${x.tone === "bad" ? "solid-bad" : x.tone === "warn" ? "warn" : "ok"}`}>{x.label}</span><span className="chip">{x.src}</span>{x.href && <Ext href={x.href}>Arkiv</Ext>}</div>
            <div className="small" style={{ overflowWrap: "anywhere" }}>{x.text.length > 160 ? x.text.slice(0, 160) + "…" : x.text}</div>
          </div>
        ))}
      </div>
      <div className="actionbox">
        <div className="row wrapr" style={{ justifyContent: "space-between" }}>
          <span className="mode-switch" role="group" aria-label="Preset list">
            <button className="n" aria-pressed={kind === "normal"} onClick={() => setKind("normal")}>Work normally</button>
            <button className="a" aria-pressed={kind === "attack"} onClick={() => setKind("attack")}>Attack</button>
          </span>
          <span className="segm" role="group" aria-label="Tool">
            {(["continue", "checkpoint", "checkout"] as LabAction[]).map((a) => <button key={a} aria-pressed={action === a} onClick={() => { setAction(a); setPreset(undefined); }}>{a}</button>)}
          </span>
        </div>
        <div className="presets">{presets.map((p) => <button key={p.id} className={p.mode} aria-pressed={preset === p.id} onClick={() => pick(p)} title={p.teaches}>{p.label}</button>)}</div>
        {cur && <div className="tiny muted">{cur.teaches}{cur.setup && <><br /><b style={{ color: "var(--amber)" }}>Setup:</b> {cur.setup}</>}</div>}

        {action === "continue" && <label className="field">focus (optional)<input value={f.focus} onChange={(e) => upd({ focus: e.target.value })} placeholder="e.g. dark mode" /></label>}
        {action === "checkout" && <label className="field">paths (optional, one per line)<textarea rows={2} value={f.paths} onChange={(e) => upd({ paths: e.target.value })} placeholder="src/theme.ts" /></label>}
        {action === "checkpoint" && (
          <>
            <label className="field">summary<input value={f.summary} onChange={(e) => upd({ summary: e.target.value })} placeholder="What was done (required)" /></label>
            <div className="row" style={{ gap: 6 }}>
              <label className="field grow">next<input value={f.next} onChange={(e) => upd({ next: e.target.value })} placeholder="What comes next" /></label>
              <label className="field grow">new tasks (one per line)<textarea rows={1} value={f.tasks} onChange={(e) => upd({ tasks: e.target.value })} /></label>
            </div>
            {f.notes.map((n, i) => (
              <div key={`n${i}`} className="subrow">
                <div style={{ display: "grid", gap: 6 }}>
                  <textarea rows={3} value={n.text} onChange={(e) => upd({ notes: f.notes.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })} aria-label="Note text" placeholder="Note text (what this AI read or decided)" />
                  <div className="row" style={{ gap: 6 }}>
                    <select value={n.kind} onChange={(e) => upd({ notes: f.notes.map((x, j) => (j === i ? { ...x, kind: e.target.value } : x)) })} aria-label="Note kind" style={{ width: 120 }}>{["fact", "decision", "plan", "evidence"].map((k) => <option key={k}>{k}</option>)}</select>
                    {n.kind === "evidence" && <>
                      <select value={n.sourceType} onChange={(e) => upd({ notes: f.notes.map((x, j) => (j === i ? { ...x, sourceType: e.target.value } : x)) })} aria-label="Source type" style={{ width: 100 }}>{["web", "email", "file", "github", "tool", "chat"].map((k) => <option key={k}>{k}</option>)}</select>
                      <input value={n.sourceId} onChange={(e) => upd({ notes: f.notes.map((x, j) => (j === i ? { ...x, sourceId: e.target.value } : x)) })} placeholder="source id, e.g. web:readme" aria-label="Source id" />
                    </>}
                  </div>
                </div>
                <button className="iconbtn" onClick={() => upd({ notes: f.notes.filter((_, j) => j !== i) })} aria-label="Remove note">×</button>
              </div>
            ))}
            {f.files.map((x, i) => (
              <div key={`f${i}`} className="subrow">
                <div style={{ display: "grid", gap: 6 }}>
                  <input value={x.path} onChange={(e) => upd({ files: f.files.map((y, j) => (j === i ? { ...y, path: e.target.value } : y)) })} placeholder="path, e.g. src/app.ts" aria-label="File path" style={{ fontFamily: "var(--mono)" }} />
                  {!x.del && <textarea rows={3} value={x.content} onChange={(e) => upd({ files: f.files.map((y, j) => (j === i ? { ...y, content: e.target.value } : y)) })} aria-label="File content" placeholder="file content" />}
                  <label className="row tiny muted"><input type="checkbox" checked={x.del} onChange={(e) => upd({ files: f.files.map((y, j) => (j === i ? { ...y, del: e.target.checked } : y)) })} style={{ width: "auto" }} /> delete this file</label>
                </div>
                <button className="iconbtn" onClick={() => upd({ files: f.files.filter((_, j) => j !== i) })} aria-label="Remove file">×</button>
              </div>
            ))}
            <div className="row">
              <button className="btn g xs" onClick={() => upd({ notes: [...f.notes, { text: "", kind: "fact", sourceType: "web", sourceId: "" }] })}>+ note</button>
              <button className="btn g xs" onClick={() => upd({ files: [...f.files, { path: "", content: "", del: false }] })}>+ file</button>
              <span className="spacer" />
              <button className="btn g xs" onClick={() => { setF(EMPTY); setPreset(undefined); }}>Clear</button>
            </div>
          </>
        )}
        <button className={`btn ${kind === "attack" ? "r" : "p"} wide`} disabled={!agent || busy || mode === "mock" || !admin || (action === "checkpoint" && !f.summary.trim())} onClick={send}>
          {busy ? <><span className="spinner" /> Sending…</> : mode === "mock" ? "Lab needs the live server" : !admin ? "Owner sign-in to send" : `Send as ${agent?.ens ?? "…"}`}
        </button>
        {latest && <Outcome e={latest} agent={agent} other={other} />}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- rules strip
export function RulesStrip() {
  const rules = useStore((s) => s.rules);
  const admin = useStore((s) => s.admin);
  const heads = useStore((s) => s.heads);
  const initial = useRef<Record<string, RuleRow>>({});
  useEffect(() => { if (rules && !Object.keys(initial.current).length) for (const r of rules.agents) initial.current[r.agent] = { ...r }; }, [rules]);
  const explorer = explorerFromTx(heads.find((h) => h.txUrl)?.txUrl);
  const changed = rules?.agents.filter((r) => { const i = initial.current[r.agent]; return i && (i.status !== r.status || i.scope !== r.scope || i.writeDaily !== r.writeDaily || i.role !== r.role); }) ?? [];
  return (
    <section className="rstrip" aria-label="Live ENS rules">
      <div className="fig-hd"><span className="eyebrow"><i />Rules on ENS · live</span><span className="spacer" />{!rules?.editable && rules && <span className="chip">READ-ONLY</span>}</div>
      {!rules && <div className="rrow"><div className="skeleton" style={{ height: 80 }} /></div>}
      {rules?.agents.map((r) => <RuleRowEdit key={r.agent} r={r} explorer={explorer} editable={!!rules.editable && admin} />)}
      {admin && changed.length > 0 && (
        <div className="rrow">
          <button className="btn g sm" onClick={async () => {
            for (const r of changed) { const i = initial.current[r.agent]; try { await api.setRules(brainId(), { agent: r.agent, status: i.status, scope: i.scope, writeDaily: i.writeDaily, role: i.role }); } catch (e) { toast(e instanceof ApiError ? e.message : "Reset failed", "bad"); } }
            await refreshRules(); toast("Rules restored on ENS", "ok");
          }}>Reset rules to how they were when you opened the lab</button>
        </div>
      )}
      <div className="rrow tiny muted">These are text records on each AI&apos;s own ENS resolver. The server reads them on every call. A change is a Sepolia transaction the server pays for.</div>
    </section>
  );
}

function RuleRowEdit({ r, explorer, editable }: { r: RuleRow; explorer?: string; editable: boolean }) {
  const [v, setV] = useState({ status: r.status, scope: r.scope, writeDaily: r.writeDaily ?? "", role: r.role });
  const [state, setState] = useState<{ phase: "idle" | "writing" | "done" | "error"; txUrl?: string; msg?: string }>({ phase: "idle" });
  useEffect(() => { if (state.phase !== "writing") setV({ status: r.status, scope: r.scope, writeDaily: r.writeDaily ?? "", role: r.role }); }, [r.status, r.scope, r.writeDaily, r.role]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = v.status !== r.status || v.scope !== r.scope || v.writeDaily !== (r.writeDaily ?? "") || v.role !== r.role;
  const save = async (patch?: Partial<typeof v>) => {
    const next = { ...v, ...patch };
    setV(next); setState({ phase: "writing" });
    try {
      const body: Record<string, string> = { agent: r.agent };
      if (next.status !== r.status) body.status = next.status;
      if (next.scope !== r.scope) body.scope = next.scope;
      if (next.writeDaily !== (r.writeDaily ?? "")) body.writeDaily = next.writeDaily;
      if (next.role !== r.role) body.role = next.role;
      const res = await api.setRules(brainId(), body as never);
      await refreshRules();
      setState({ phase: "done", txUrl: res.txUrl, msg: res.txHash ? Object.entries(res.changed).map(([k, c]) => `${k}: ${c.from} → ${c.to}`).join(" · ") : "nothing changed" });
    } catch (e) { setState({ phase: "error", msg: e instanceof ApiError ? e.message : "ENS write failed" }); }
  };
  const v2 = vendorOf(r.vendor);
  return (
    <div className="rrow">
      <div className="row"><span className={`vb ${v2.cls}`}>{v2.letter}</span><span className="mono small grow ell">{r.ens}</span>{r.resolver && explorer && <Ext href={`${explorer}/address/${r.resolver}`}>resolver</Ext>}</div>
      <div className="rgrid">
        <label className="field">sb.status
          <button className={`btn xs ${v.status === "active" ? "f" : "r"}`} disabled={!editable || state.phase === "writing"} onClick={() => save({ status: v.status === "active" ? "paused" : "active" })} title="Toggle on ENS">{v.status === "active" ? "ACTIVE · pause" : "PAUSED · resume"}</button>
        </label>
        <label className="field">sb.role
          <select value={v.role} disabled={!editable} onChange={(e) => setV({ ...v, role: e.target.value })}>{["lead", "worker", "observer"].map((x) => <option key={x}>{x}</option>)}</select>
        </label>
        <label className="field">sb.scope<input className="mono" value={v.scope} disabled={!editable} onChange={(e) => setV({ ...v, scope: e.target.value })} placeholder="* or docs/" /></label>
        <label className="field">sb.write.daily<input className="mono" inputMode="numeric" value={v.writeDaily} disabled={!editable} onChange={(e) => setV({ ...v, writeDaily: e.target.value.replace(/\D/g, "") })} /></label>
      </div>
      {editable && dirty && state.phase !== "writing" && <button className="btn p xs" onClick={() => save()}>Write to ENS</button>}
      {state.phase === "writing" && <div className="small row"><span className="spinner" /> Writing to ENS… (10–20 s, server pays gas)</div>}
      {state.phase === "done" && <div className="small"><span className="chip ok">{state.txUrl ? "CONFIRMED ON SEPOLIA" : "NO CHANGE"}</span> {state.txUrl && <Ext href={state.txUrl}>tx</Ext>} <span className="mono tiny">read back: {state.msg}</span></div>}
      {state.phase === "error" && <div className="small" style={{ color: "var(--lie)" }}>{state.msg}</div>}
    </div>
  );
}

// ---------------------------------------------------------------- what the next AI reads
export function NextReads({ as, agents, onAs, tick }: { as?: LiveAgent; agents: LiveAgent[]; onAs: (l: string) => void; tick: number }) {
  const admin = useStore((s) => s.admin);
  const mode = useStore((s) => s.mode);
  const blocked = useStore((s) => s.blocked);
  const [text, setText] = useState<string>();
  const [prev, setPrev] = useState<string>();
  const [busy, setBusy] = useState(false);
  const load = async () => {
    if (!as) return;
    setBusy(true);
    try {
      if (mode === "mock") { const fx = (await import("@/fixtures/v2-demo.json")).default as { summary: { text: string } }; setText(fx.summary.text); return; }
      const t = admin ? await api.lab(brainId(), as.label, "continue", {}).then((x) => (x.outcome === "ok" ? String(x.result.text ?? "") : `${blockLabel((x as { code: string }).code, (x as { rule?: string }).rule)}: ${(x as { message?: string }).message ?? ""}`))
        : (await api.summary(brainId())).text;
      setPrev((p) => (text ?? p)); setText(t);
    } catch (e) { setText(e instanceof ApiError ? e.message : "Could not load"); } finally { setBusy(false); }
  };
  useEffect(() => { load(); }, [as?.label, tick, admin]); // eslint-disable-line react-hooks/exhaustive-deps
  const old = new Set((prev ?? "").split("\n"));
  const stopped = blocked.filter((b) => b.code === "STOPPED" && b.excerpt).map((b) => b.excerpt!.replace(/^…|…$/g, "").slice(0, 40));
  const leak = text ? stopped.find((s) => s && text.includes(s)) : undefined;
  return (
    <section className="rstrip readpanel" aria-label="What the next AI reads">
      <div className="fig-hd">
        <b>What the next AI reads</b><span className="spacer" />
        <select value={as?.label ?? ""} onChange={(e) => onAs(e.target.value)} aria-label="As" style={{ width: "auto", fontSize: ".76rem", padding: "4px 6px" }}>{agents.map((a) => <option key={a.label} value={a.label}>{a.label}</option>)}</select>
        <button className="btn g xs" onClick={load} disabled={busy}>{busy ? "…" : "Refresh"}</button>
      </div>
      <div className="rrow">
        <div className="tiny muted">{admin ? <>A live <span className="mono">continue</span> as <b className="mono">{as?.ens}</b>: exactly what that AI would be handed now.</> : <>The brain summary that <span className="mono">continue</span> builds (sign in to read it as a specific AI).</>}</div>
        {leak && <div className="callout bad small">A stopped excerpt appears in this text. That would be a real bug; report it.</div>}
        {text === undefined ? <div className="skeleton" style={{ height: 120 }} /> : (
          <pre className="code">{text.split("\n").map((line, i) => <span key={i} style={prev && !old.has(line) ? { background: "var(--flow-soft)", color: "var(--flow)" } : undefined}>{line}{"\n"}</span>)}</pre>
        )}
        {text && <Copy text={text} label="Copy text" />}
      </div>
    </section>
  );
}

export type { LabResponse };
