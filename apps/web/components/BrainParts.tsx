"use client";
import { useEffect, useMemo, useState } from "react";
import type { CheckpointView } from "@supabrain/shared";
import { api, ApiError, explorerFromTx, type FileContent, type HeadRow, type LiveAgent, type MemoryDetail, type RuleRow } from "@/lib/api";
import { brainId, useStore, type FeedItem } from "@/lib/store";
import { agentStatusLabel, agentStatusTone, ago, classOf, clock, isToday, short, vendorOf } from "@/lib/format";
import { Copy, Ext, Modal, NodeStatus, Trust, useNow, VendorBadge } from "./ui";

// ---------- derived numbers (counting rules: docs/FRONTEND_CONTENT.md §6) ----------
export function useCounts() {
  const checkpoints = useStore((s) => s.checkpoints);
  const blocked = useStore((s) => s.blocked);
  const brain = useStore((s) => s.brain);
  const heads = useStore((s) => s.heads);
  return useMemo(() => {
    const saved = checkpoints.filter((c) => c.status !== "quarantined").length;
    const stopped = checkpoints.filter((c) => c.status === "quarantined").length;
    const ens = blocked.filter((b) => classOf(b) === "ens").length;
    const identity = blocked.filter((b) => classOf(b) === "identity").length;
    const headsOk = heads.filter((h) => h.match).length;
    return { saved, stopped, ens, identity, attempts: saved + stopped + ens + identity, headsOk, headsTotal: heads.length,
      tasksOpen: brain?.counts.tasksOpen ?? 0, tasksDone: brain?.counts.tasksDone ?? 0, files: brain?.counts.files ?? 0, checkpoints: checkpoints.length };
  }, [checkpoints, blocked, brain, heads]);
}
export function writesToday(checkpoints: CheckpointView[], agent: string) {
  return checkpoints.filter((c) => c.agent === agent && isToday(c.createdAt)).length;
}

export function Meters() {
  const c = useCounts();
  const cells: [string, string | number, string?][] = [
    ["Checkpoints", c.checkpoints], ["Tasks done / open", `${c.tasksDone} / ${c.tasksOpen}`], ["Files", c.files],
    ["Stopped", c.stopped, "bad"], ["Blocked by ENS", c.ens, "bad"], ["Heads on ENS", `${c.headsOk} / ${c.headsTotal}`, c.headsTotal && c.headsOk === c.headsTotal ? "ok" : "warn"],
  ];
  return (
    <div className="meters" aria-label="Brain meters">
      {cells.map(([l, v, t]) => <div key={l} className={t ?? ""}><span>{l}</span><b className="tnum">{v}</b></div>)}
    </div>
  );
}

// ---------- AI card ----------
export function AgentCard({ a, rule, head, compact }: { a: LiveAgent; rule?: RuleRow; head?: HeadRow; compact?: boolean }) {
  const checkpoints = useStore((s) => s.checkpoints);
  const connected = useStore((s) => s.connected);
  const pulse = useStore((s) => s.pulse);
  const notices = useStore((s) => s.notices);
  const now = useNow(2000);
  const v = vendorOf(a.vendor);
  const daily = Number(rule?.writeDaily ?? a.writeDaily ?? 0);
  const today = writesToday(checkpoints, a.label);
  const pct = daily ? Math.min(100, Math.round((today / daily) * 100)) : 0;
  const client = connected[a.label] ?? a.connectedClient;
  const status = rule?.status ?? a.status;
  const hot = pulse && pulse.agent === a.label && now - pulse.at < 2500;
  const explorer = explorerFromTx(head?.txUrl);
  return (
    <div className={`agent${client ? " on" : ""}${status !== "active" ? " off" : ""}${hot ? " hot" : ""}`}>
      {notices[a.label] ? <span className="badge" title="retraction notices waiting">{notices[a.label]}</span> : null}
      <div className="row">
        <VendorBadge vendor={a.vendor} big />
        <div className="grow">
          <div className="ens">{a.ens}</div>
          <div className="tiny muted">{v.name} · {v.company} · {rule?.role ?? a.role}</div>
        </div>
      </div>
      <div className="meta">
        <span className={`chip ${agentStatusTone(status, a.authority)}`}>{agentStatusLabel(status, a.authority)}</span>
        <span className="chip" title="ENS record sb.scope: which paths this AI may write">scope {rule?.scope ?? a.scope}</span>
        {client && <span className="chip ok">CONNECTED · {client}</span>}
      </div>
      {!compact && (
        <>
          <div title="Checkpoints today vs the ENS record sb.write.daily">
            <div className="row tiny muted" style={{ justifyContent: "space-between" }}><span>writes today</span><span className="mono">{today} / {daily || "—"}{pct >= 100 ? " · AT LIMIT" : ""}</span></div>
            <div className="wbar"><i style={{ width: `${pct}%`, background: pct >= 100 ? "var(--lie)" : pct >= 80 ? "var(--amber)" : "var(--flow)" }} /></div>
          </div>
          <div className="tiny muted" style={{ display: "grid", gap: 3 }}>
            <span className="mono" title="This AI's own wallet signs its checkpoints on Arkiv">signer {short(a.wallet, 6, 4)} <Copy text={a.wallet} /></span>
            <span>{a.lastWriteAt ? `last write ${ago(a.lastWriteAt, now)}` : "no writes yet"}</span>
            {head && (
              <span>
                {head.match ? <span className="chip ok">HEAD ✓ ENS = ARKIV</span> : head.ensHead && head.serverHead ? <span className="chip solid-bad">HEAD ✗ MISMATCH</span> : head.ensHead ? <span className="chip" title="ENS points at an Arkiv commit; this server has no newer commit by this AI in this session">HEAD ON ENS</span> : <span className="chip">NO HEAD YET</span>}
                {" "}{head.txUrl ? <Ext href={head.txUrl}>Sepolia tx</Ext> : rule?.resolver && explorer ? <Ext href={`${explorer}/address/${rule.resolver}`}>resolver</Ext> : null}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ---------- security / live feed ----------
export function LiveLog({ onSelect, limit = 120 }: { onSelect?: (k: string) => void; limit?: number }) {
  const feed = useStore((s) => s.feed);
  const [f, setF] = useState<"all" | "sec">("all");
  const items = feed.filter((x) => f === "all" || x.tone === "bad").slice(0, limit);
  return (
    <div className="log">
      <div className="hd">
        <b>Live log</b>
        <span className="segm" role="group" aria-label="Filter">
          <button aria-pressed={f === "all"} onClick={() => setF("all")}>All</button>
          <button aria-pressed={f === "sec"} onClick={() => setF("sec")}>Security</button>
        </span>
      </div>
      <div className="feed" aria-live="polite">
        {items.length === 0 && <div className="small muted" style={{ padding: 12 }}>Waiting for the first event. When an AI saves, is stopped or is blocked, it appears here instantly.</div>}
        {items.map((it) => <LogItem key={it.id} it={it} onSelect={onSelect} />)}
      </div>
    </div>
  );
}
function LogItem({ it, onSelect }: { it: FeedItem; onSelect?: (k: string) => void }) {
  const v = it.vendor ? vendorOf(it.vendor) : undefined;
  return (
    <div className={`it ${it.tone}`} onClick={() => it.key && onSelect?.(it.key)} role={it.key && onSelect ? "button" : undefined} tabIndex={it.key && onSelect ? 0 : undefined}>
      <time className="mono">{clock(it.at)}</time>
      {v ? <span className={`vb ${v.cls}`}>{v.letter}</span> : <span className="vb" style={{ background: it.tone === "bad" ? "var(--lie)" : "var(--flow)" }}>•</span>}
      <span className="grow">
        {it.label && <span className={`chip ${it.tone === "bad" ? "solid-bad" : it.tone === "ok" ? "ok" : it.tone === "warn" ? "warn" : ""}`} style={{ marginRight: 6 }}>{it.label}</span>}
        {it.source && <span className="chip" style={{ marginRight: 6 }}>{it.source}</span>}
        <span>{it.text}</span>
        {it.href && <> <a className="link ext" href={it.href} target="_blank" rel="noreferrer noopener" onClick={(e) => e.stopPropagation()}>proof</a></>}
      </span>
    </div>
  );
}

// ---------- drawer ----------
export function Drawer({ k, onClose, onSelect, onHot }: { k: string; onClose: () => void; onSelect: (k: string) => void; onHot: (keys: Set<string> | undefined) => void }) {
  const node = useStore((s) => s.nodes[k]);
  const nodes = useStore((s) => s.nodes);
  const tasks = useStore((s) => s.tasks);
  const mode = useStore((s) => s.mode);
  const brain = useStore((s) => s.brain);
  const [d, setD] = useState<MemoryDetail>();
  const [err, setErr] = useState<string>();
  const [file, setFile] = useState<{ path: string; key: string }>();
  useEffect(() => {
    setD(undefined); setErr(undefined);
    if (mode === "mock") return;
    let live = true;
    api.memory(k).then((x) => live && setD(x)).catch((e) => live && setErr(e instanceof ApiError ? e.message : "Could not load"));
    return () => { live = false; };
  }, [k, mode, node?.status, node?.pending]);
  if (!node) return null;
  const agent = brain?.agents.find((a) => a.label === node.agent);
  const kids = Object.values(nodes).filter((n) => n.parents.includes(k));
  const files = kids.filter((n) => n.kind === "file");
  const added = kids.filter((n) => n.kind === "task");
  const done = (node.checkpoint?.done ?? []).map((t) => tasks.find((x) => x.key === t)?.title ?? short(t));
  const lineage = d?.lineage ?? [];
  const signerOk = agent && node.creator ? agent.wallet.toLowerCase() === node.creator.toLowerCase() : undefined;
  return (
    <aside className="drawer" aria-label="Commit details">
      <div className="hd">
        <VendorBadge vendor={node.vendor} big />
        <div className="grow"><div className="mono small ell">{agent?.ens ?? node.agent}</div><div className="tiny muted">{node.kind} · {clock(node.createdAt)} · {ago(node.createdAt)}</div></div>
        <button className="iconbtn" onClick={() => { onHot(undefined); onClose(); }} aria-label="Close">×</button>
      </div>
      <div className="bd">
        <div className="row wrapr"><NodeStatus n={node} /><Trust t={node.trust} />{node.checkpoint?.client && <span className="chip">{node.checkpoint.client === "supabrain-lab" ? "LAB" : `MCP · ${node.checkpoint.client}`}</span>}</div>
        <p className={`memtext${node.status === "quarantined" ? " q" : ""}`}>{node.text || (node.file ? node.file.path : node.kind)}</p>
        {node.checkpoint?.next && <div className="small"><span className="muted">next:</span> {node.checkpoint.next}</div>}
        {node.status === "quarantined" && <div className="callout bad"><b>Stopped.</b> {d?.why ? `${d.why}. ` : ""}It is kept for the owner's review and revoked on Arkiv. No AI receives it in <span className="mono">continue</span>.</div>}

        <dl className="kv">
          <dt>author</dt><dd className="mono small">{agent?.ens ?? node.agent}</dd>
          <dt>signer</dt><dd className="mono small">{short(node.creator, 8, 6) || "—"} {node.creator && <Copy text={node.creator} />} {signerOk !== undefined && (signerOk ? <span className="chip ok">= ENS ADDRESS</span> : <span className="chip solid-bad">≠ ENS ADDRESS</span>)}</dd>
          <dt>on Arkiv</dt><dd>{node.pending ? <span className="row"><span className="spinner" /> writing to Arkiv…</span> : <Ext href={node.proofUrl}>{node.proofUrl ? "open the signed entity" : "—"}</Ext>}</dd>
          <dt>entity key</dt><dd className="mono tiny">{short(node.key, 10, 8)} <Copy text={node.key} /></dd>
          <dt>read by</dt><dd>{d ? (d.readers.length ? d.readers.join(", ") : "no AI has read it yet") : "…"}</dd>
          <dt>verify</dt><dd className="mono tiny">pnpm verify:memory {short(node.key)} <Copy text={`pnpm verify:memory ${node.key}`} label="Copy cmd" /></dd>
        </dl>

        {(files.length > 0 || added.length > 0 || done.length > 0) && (
          <div>
            <div className="section-t">In this checkpoint</div>
            {files.map((f) => <button key={f.key} className="pill" style={{ margin: "0 6px 6px 0" }} onClick={() => setFile({ path: f.file?.path ?? f.folder, key: f.key })}>▤ {f.file?.path ?? f.folder} · {f.file?.size ?? 0} B{f.file?.deleted ? " · deleted" : ""}</button>)}
            {added.map((t) => <div key={t.key} className="small">☐ added task: {t.text}</div>)}
            {done.map((t, i) => <div key={i} className="small">✓ ticked: {t}</div>)}
          </div>
        )}

        <div>
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
            <div className="section-t" style={{ margin: 0 }}>Lineage: what this rests on</div>
            {lineage.length > 0 && <button className="btn xs g" onClick={() => onHot(new Set(lineage.flat()))}>Light up</button>}
          </div>
          {!d && !err && <div className="small muted">loading…</div>}
          {d && lineage.every((p) => p.length <= 1) && <div className="small muted">A root: it rests on nothing earlier.</div>}
          {lineage.filter((p) => p.length > 1).slice(0, 3).map((p, i) => (
            <div className="trail" key={i} style={{ marginBottom: 8 }}>
              {p.map((pk, j) => { const pn = nodes[pk]; return (
                <button key={pk + j} className="st" onClick={() => pn && onSelect(pk)}>
                  <span className={`vb ${vendorOf(pn?.vendor).cls}`}>{vendorOf(pn?.vendor).letter}</span>
                  <span className="txt"><span style={pn?.status === "quarantined" ? { textDecoration: "line-through", color: "var(--lie)" } : undefined}>{pn ? (pn.text || pn.kind).slice(0, 90) : short(pk)}</span>
                    <span className="tiny dim mono" style={{ display: "block" }}>{j === 0 ? "this" : j === p.length - 1 ? "root" : "built on"} · {pn?.agent ?? "expired"} · {pn?.kind}</span></span>
                </button>); })}
            </div>
          ))}
        </div>
        {err && <div className="callout warn small">{err}</div>}
      </div>
      {file && <FileViewer path={file.path} vkey={file.key} onClose={() => setFile(undefined)} />}
    </aside>
  );
}

export function FileViewer({ path, vkey, onClose }: { path: string; vkey?: string; onClose: () => void }) {
  const [f, setF] = useState<FileContent>();
  const [key, setKey] = useState(vkey);
  const [err, setErr] = useState<string>();
  useEffect(() => { setF(undefined); api.fileContent(brainId(), path, key).then(setF).catch((e) => setErr(e instanceof ApiError ? e.message : "Could not load")); }, [path, key]);
  return (
    <Modal onClose={onClose} wide label={`File ${path}`}>
      <div className="row"><h2 className="grow mono" style={{ fontSize: "1rem" }}>{path}</h2><button className="iconbtn" onClick={onClose} aria-label="Close">×</button></div>
      {err && <div className="callout bad">{err}</div>}
      {!f && !err && <div className="row muted small"><span className="spinner" /> loading from the brain…</div>}
      {f && (
        <div className="fileview">
          <pre className="code" style={{ maxHeight: 360, overflow: "auto" }}>{f.content || "(empty)"}</pre>
          <div>
            <div className="section-t">Versions (blame)</div>
            {f.versions.map((v) => (
              <button key={v.key} className={`verrow${v.key === f.key ? " on" : ""}`} onClick={() => setKey(v.key)}>
                <span className={`vb ${vendorOf(v.vendor).cls}`}>{vendorOf(v.vendor).letter}</span>
                <span className="grow"><span className="mono tiny">{v.agent}</span> · {ago(v.at)} · {v.size} B{v.deleted ? " · deleted" : ""}</span>
                {v.status === "quarantined" ? <span className="chip solid-bad">STOPPED</span> : <span className="chip ok">SAVED</span>}
                {v.proofUrl && <a className="link ext tiny" href={v.proofUrl} target="_blank" rel="noreferrer noopener" onClick={(e) => e.stopPropagation()}>Arkiv</a>}
              </button>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}

export function OwnerOnly({ children, fallback }: { children: React.ReactNode; fallback?: React.ReactNode }) {
  const admin = useStore((s) => s.admin);
  return <>{admin ? children : fallback ?? null}</>;
}

export function useHeadMap() {
  const heads = useStore((s) => s.heads);
  const ev = useStore((s) => s.headEvents);
  return useMemo(() => {
    const m: Record<string, string | undefined> = {};
    for (const h of heads) m[h.agent] = h.match ? h.ensHead ?? undefined : h.ensHead ?? undefined;
    for (const [a, h] of Object.entries(ev)) if (!h.error) m[a] = h.key;
    return m;
  }, [heads, ev]);
}

