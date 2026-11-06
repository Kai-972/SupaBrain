"use client";
// Node drawer: what a memory says, who wrote it, why the AI believes it, and the owner's actions on it.
import { useEffect, useState } from "react";
import type { RevocationTarget } from "@supabrain/shared";
import { api, ApiError, type MemoryDetail } from "@/lib/api";
import { getState, refreshGraph, toast, useStore } from "@/lib/store";
import { TRUST, vendorOf, short, shortKey, ago, isSourceRoot, SOURCE_ICON, clock } from "@/lib/format";
import { ExpiryRing, Ext, StatusChips, TrustChip, VendorBadge, Copy } from "./ui";

interface Props {
  k: string;
  onClose: () => void;
  onSelect: (k: string) => void;
  onWhy: (paths: string[][] | undefined) => void;
  whyOn: boolean;
  onWrong: (targets: RevocationTarget[]) => void;
}

export function Drawer({ k, onClose, onSelect, onWhy, whyOn, onWrong }: Props) {
  const node = useStore((s) => s.nodes[k]);
  const nodes = useStore((s) => s.nodes);
  const admin = useStore((s) => s.admin);
  const mode = useStore((s) => s.mode);
  const [detail, setDetail] = useState<MemoryDetail | undefined>();
  const [err, setErr] = useState<string>();
  const [correcting, setCorrecting] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<string>();

  useEffect(() => {
    setDetail(undefined); setErr(undefined); setCorrecting(false);
    if (mode === "mock") return;
    let live = true;
    api.memory(k).then((d) => live && setDetail(d)).catch((e) => live && setErr(e instanceof ApiError ? e.message : "Could not load this memory"));
    return () => { live = false; };
  }, [k, mode, node?.status]);

  if (!node) return null;
  const v = vendorOf(node.vendor);
  const q = node.status === "quarantined";
  const kids = Object.values(nodes).filter((n) => n.parents.includes(k));
  const lineage = detail?.lineage ?? mockLineage(k);
  const sourceRoots = node.roots.filter(isSourceRoot);
  const humanRoots = node.roots.filter((r) => !isSourceRoot(r));
  const dispute = detail?.dispute ?? node.dispute;

  const keep = async (days: number) => {
    setBusy(`keep${days}`);
    try { const r = await api.keep(k, days); toast(`Kept for ${r.days} days: it won't fade until ${new Date(r.expiresAt).toLocaleDateString()}`, "ok"); await refreshGraph(); }
    catch (e) { toast(e instanceof ApiError ? e.message : "Keep failed", "bad"); }
    finally { setBusy(undefined); }
  };
  const correct = async () => {
    setBusy("correct");
    try { const r = await api.correct(k, text); toast(`Corrected: the old memory is retracted from every AI and a HUMAN memory replaces it (${r.affected.length} affected)`, "ok"); setCorrecting(false); await refreshGraph(); onSelect(r.newKey); }
    catch (e) { toast(e instanceof ApiError ? e.message : "Correct failed", "bad"); }
    finally { setBusy(undefined); }
  };

  return (
    <aside className="drawer" aria-label="Memory details">
      <div className="hd">
        <VendorBadge vendor={node.vendor} big />
        <div className="grow">
          <div className="mono small ell">{node.agent === "owner" ? "a person (owner)" : node.agent}</div>
          <div className="tiny muted">{v.name} · {v.company} · {ago(node.createdAt)}</div>
        </div>
        <button className="iconbtn" onClick={onClose} aria-label="Close details">×</button>
      </div>
      <div className="bd">
        <div className="row wrapr"><StatusChips n={node} /><TrustChip trust={node.trust} /><span className="chip">{node.kind}</span><span className="chip">folder: {node.folder}</span></div>
        <p className={`memtext${q ? " q" : ""}`}>{node.text}</p>

        {q && (
          <div className="callout bad">
            <b>Quarantined in every AI.</b> {detail?.why ? `Because ${detail.why}.` : "An ancestor was revoked."} AIs that recall it get it flagged QUARANTINED with this reason, never as a fact. The original stays readable on Arkiv: undo never rewrites history.
          </div>
        )}
        {dispute?.state === "disputed" && (
          <div className={`callout ${q ? "" : "warn"}`}>
            <b>Disputed by ENS.</b> {dispute.subject}&apos;s own ENS record says <span className="mono">{short(dispute.ensAddress)}</span>, this memory claims <span className="mono">{dispute.claimed.map((c) => short(c)).join(", ")}</span>. Only the vendor&apos;s wallet can change that record. Flagged the moment it was written.
          </div>
        )}
        {dispute?.state === "unverified" && <div className="callout"><b>Unverified.</b> {dispute.reason}</div>}

        <div>
          <div className="section-t">Why the trust is {TRUST[node.trust].word}</div>
          <div className="small muted">
            {node.trust === 3 && "A person set this on the dashboard. No AI can produce HUMAN trust."}
            {node.trust === 1 && (node.source
              ? <>It came from outside content: <span className="mono">{SOURCE_ICON[node.source.type]} {node.source.id}</span>. Outside content can never authorize money.</>
              : <>It was built on outside content, so it gets the lowest trust of its parents.</>)}
            {node.trust === 2 && "An AI wrote it, built only on trusted notes. Trust is the minimum of everything it read first."}
          </div>
        </div>

        <div>
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
            <div className="section-t" style={{ margin: 0 }}>Why does my AI believe this?</div>
            <button className="btn xs g" aria-pressed={whyOn} onClick={() => onWhy(whyOn ? undefined : lineage)}>{whyOn ? "Hide path" : "Light up the path"}</button>
          </div>
          {lineage.length === 0 || (lineage.length === 1 && lineage[0].length <= 1)
            ? <div className="small muted">It rests on nothing else: it is a root.</div>
            : lineage.slice(0, 3).map((path, i) => (
              <div className="trail" key={i} style={{ marginBottom: 8 }}>
                {path.map((pk, j) => {
                  const pn = nodes[pk];
                  return (
                    <button key={pk + j} className="st" onClick={() => pn && onSelect(pk)}>
                      <span className={`vb ${vendorOf(pn?.vendor).cls}`}>{vendorOf(pn?.vendor).letter}</span>
                      <span className="txt">
                        <span style={pn?.status === "quarantined" ? { textDecoration: "line-through", color: "var(--lie)" } : undefined}>{pn ? pn.text : shortKey(pk)}</span>
                        <span className="tiny dim mono" style={{ display: "block" }}>{j === 0 ? "this memory" : j === path.length - 1 ? "root" : "built on"} · {pn?.agent ?? "expired"}{pn?.source ? ` · ${pn.source.id}` : ""}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          <div className="small muted">Roots: {sourceRoots.map((r) => <span key={r} className="chip warn" style={{ marginRight: 4 }}>{r}</span>)}{humanRoots.length ? <span className="chip ok">{humanRoots.length} human note{humanRoots.length > 1 ? "s" : ""}</span> : null}</div>
        </div>

        {(node.parents.length > 0 || kids.length > 0) && (
          <div>
            <div className="section-t">Family</div>
            <div className="pill-list">
              {node.parents.map((p) => nodes[p] && <button key={p} className="pill" onClick={() => onSelect(p)}><span className={`vb ${vendorOf(nodes[p].vendor).cls}`}>{vendorOf(nodes[p].vendor).letter}</span>parent: {nodes[p].text.slice(0, 26)}…</button>)}
              {kids.map((c) => <button key={c.key} className="pill" onClick={() => onSelect(c.key)}><span className={`vb ${vendorOf(c.vendor).cls}`}>{vendorOf(c.vendor).letter}</span>child: {c.text.slice(0, 26)}…</button>)}
            </div>
          </div>
        )}

        {node.ref && (
          <div className="lock">
            <span className="ic">🔒</span>
            <div><b>{node.ref.label}</b><div className="tiny muted">Private: open with your own access. Only this pointer is on chain.</div>
              <div className="mono tiny">{node.ref.kind}: {node.ref.locator}{node.ref.version ? ` @ ${node.ref.version.slice(0, 8)}` : ""}</div>
              {node.ref.kind !== "github" && <Ext href={node.ref.kind === "url" || node.ref.locator.includes("://") ? node.ref.locator : undefined}>Open (needs access)</Ext>}
            </div>
          </div>
        )}

        <dl className="kv">
          <dt>read by</dt><dd>{detail ? (detail.readers.length ? detail.readers.join(", ") : "no AI has read it yet") : "…"}</dd>
          <dt>signed by</dt><dd className="mono small">{node.creator ? short(node.creator, 8, 6) : "—"} {node.creator && <Copy text={node.creator} />}</dd>
          <dt>written</dt><dd>{clock(node.createdAt)} · seq {node.seq}</dd>
          <dt>lifetime</dt><dd><ExpiryRing createdAt={node.createdAt} expiresAt={node.expiresAt} kept={node.kept} /></dd>
          <dt>on Arkiv</dt><dd>{node.pending ? <span className="row"><span className="spinner" /> writing to Arkiv…</span> : <Ext href={node.proofUrl}>{node.proofUrl ? "open the signed entity" : "—"}</Ext>}</dd>
          <dt>entity key</dt><dd className="mono tiny">{shortKey(node.key)} <Copy text={node.key} /></dd>
          <dt>verify</dt><dd className="mono tiny">pnpm verify:memory {shortKey(node.key)} <Copy text={`pnpm verify:memory ${node.key}`} label="Copy cmd" /></dd>
        </dl>
        {err && <div className="callout warn small">{err}</div>}

        {correcting && (
          <div className="card pad" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div className="small"><b>Correct this.</b> The old memory is retracted from every AI, and your text becomes a HUMAN memory that supersedes it.</div>
            <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="What's actually true?" aria-label="Correct text" />
            <div className="row" style={{ justifyContent: "flex-end" }}>
              <button className="btn g xs" onClick={() => setCorrecting(false)}>Cancel</button>
              <button className="btn p xs" disabled={!text.trim() || busy === "correct"} onClick={correct}>{busy === "correct" ? "Writing to Arkiv…" : "Retract & correct"}</button>
            </div>
          </div>
        )}
      </div>
      <div className="ft">
        {!admin && mode !== "mock" && <div className="tiny muted" style={{ width: "100%" }}>🔒 Owner sign-in unlocks these actions.</div>}
        <button className="btn r sm" disabled={!admin || q} title={q ? "Already quarantined" : "Preview the blast radius first; nothing changes yet"} onClick={() => onWrong([
          ...sourceRoots.map((id) => ({ type: "source" as const, id })),
          { type: "memory" as const, id: k },
          ...(node.agent !== "owner" ? [{ type: "agent" as const, id: node.agent }] : []),
        ])}>This is wrong…</button>
        <button className="btn g sm" disabled={!admin || q || node.agent === "owner" || mode === "mock"} onClick={() => { setText(""); setCorrecting(true); }}>Correct this</button>
        <button className="btn g sm" disabled={!admin || q || !!busy || mode === "mock"} title={q ? "A quarantined memory can never be kept, so lies die on their own" : "Stop it fading after 2 days"} onClick={() => keep(7)}>{busy === "keep7" ? "Keeping…" : "Keep 7d"}</button>
        <button className="btn g sm" disabled={!admin || q || !!busy || mode === "mock"} onClick={() => keep(30)}>{busy === "keep30" ? "Keeping…" : "30d"}</button>
        {q && <div className="tiny muted" style={{ width: "100%" }}>Keep is refused for quarantined memories, so lies fade on their own.</div>}
      </div>
    </aside>
  );
}

/** Mock mode has no /api/memory; walk parents locally. */
function mockLineage(k: string): string[][] {
  const nodes = getState().nodes;
  const out: string[][] = [];
  const walk = (key: string, path: string[]) => {
    const n = nodes[key];
    const ps = n?.parents.filter((p) => nodes[p]) ?? [];
    if (!ps.length || path.length > 12) { out.push([...path, key]); return; }
    ps.forEach((p) => walk(p, [...path, key]));
  };
  walk(k, []);
  return out;
}
