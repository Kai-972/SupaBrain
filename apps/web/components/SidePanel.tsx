"use client";
// The commit side panel (UI_REDESIGN_PROMPT.md §5.3): ≥ 480px, five plain sections. What it says · Who signed it ·
// What it built on · Files · Proof. Everything technical lives here, not in the graph rows.
import { useEffect, useState } from "react";
import { api, ApiError, type MemoryDetail } from "@/lib/api";
import { useStore } from "@/lib/store";
import { ago, clock, GUARD_RULES, short, vendorOf } from "@/lib/format";
import { FileViewer } from "./BrainParts";
import { Copy, Ext } from "./ui";

export function SidePanel({ k, onClose, onSelect, onHot }: { k: string; onClose: () => void; onSelect: (k: string) => void; onHot: (keys?: Set<string>) => void }) {
  const node = useStore((s) => s.nodes[k]);
  const nodes = useStore((s) => s.nodes);
  const tasks = useStore((s) => s.tasks);
  const mode = useStore((s) => s.mode);
  const brain = useStore((s) => s.brain);
  const blocked = useStore((s) => s.blocked);
  const headEvents = useStore((s) => s.headEvents);
  const heads = useStore((s) => s.heads);
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
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { onHot(undefined); onClose(); } };
    addEventListener("keydown", esc);
    return () => removeEventListener("keydown", esc);
  }, [onClose, onHot]);
  if (!node) return null;

  const v = vendorOf(node.vendor);
  const agent = brain?.agents.find((a) => a.label === node.agent);
  const kids = Object.values(nodes).filter((n) => n.parents.includes(k));
  const files = kids.filter((n) => n.kind === "file");
  const added = kids.filter((n) => n.kind === "task");
  const done = (node.checkpoint?.done ?? []).map((t) => tasks.find((x) => x.key === t)?.title ?? short(t));
  const signerOk = agent && node.creator ? agent.wallet.toLowerCase() === node.creator.toLowerCase() : undefined;
  const stop = blocked.find((b) => b.code === "STOPPED" && b.key === k);
  const headEv = headEvents[node.agent];
  const headRow = heads.find((h) => h.agent === node.agent);
  const head = headEv?.key === k ? headEv : headRow?.ensHead === k ? { txUrl: headRow.txUrl } : undefined;
  const chain = (d?.lineage ?? []).filter((p) => p.length > 1).sort((a, b) => b.length - a.length)[0] ?? [];
  const client = node.checkpoint?.client;

  return (
    <>
      <div className="scrim4" onClick={() => { onHot(undefined); onClose(); }} />
      <aside className="panel4" aria-label="Commit details" role="dialog">
        <header>
          <span className={`dot4 big ${v.cls}`} />
          <div className="grow">
            <div className="p-who">{agent?.ens ?? node.agent}</div>
            <div className="p-meta">{node.kind === "checkpoint" ? "Commit" : node.kind} · {clock(node.createdAt)} · {ago(node.createdAt)}{client ? ` · from ${client === "supabrain-lab" ? "the lab" : client}` : ""}</div>
          </div>
          <button className="iconbtn" onClick={() => { onHot(undefined); onClose(); }} aria-label="Close">×</button>
        </header>
        <div className="p-body">
          <section>
            <h4>What it says</h4>
            {node.status === "quarantined" && (
              <div className="p-stop">
                <b>Stopped.</b> {stop?.rule ? `${GUARD_RULES[stop.rule] ?? stop.rule}. ` : d?.why ? `${d.why}. ` : ""}Kept for the owner&apos;s review and revoked on Arkiv: no AI receives it.
                {stop?.arkivUrl && <> <Ext href={stop.arkivUrl}>Revocation on Arkiv</Ext></>}
              </div>
            )}
            <p className={`p-text${node.status === "quarantined" ? " q" : ""}`}>{node.text || node.file?.path || node.kind}</p>
            {node.checkpoint?.next && <p className="p-next"><span>Next:</span> {node.checkpoint.next}</p>}
            <div className="p-status">{node.status === "quarantined" ? "STOPPED" : node.pending ? "SAVING · writing to Arkiv…" : node.status === "expired" ? "EXPIRED" : "SAVED"}</div>
          </section>

          <section>
            <h4>Who signed it</h4>
            <div className="p-sign">
              <div><span>AI</span><b>{agent?.ens ?? node.agent}</b></div>
              <div><span>Signer wallet</span><b className="mono">{short(node.creator, 10, 8) || "—"}</b>{node.creator && <Copy text={node.creator} />}</div>
              <div><span>Check</span>{signerOk === undefined ? <b>—</b> : signerOk ? <b className="ok">✓ equals this AI&apos;s ENS address</b> : <b className="bad">✗ does not match the ENS address</b>}</div>
            </div>
          </section>

          <section>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <h4>What it built on</h4>
              {chain.length > 1 && <button className="btn g xs" onClick={() => onHot(new Set((d?.lineage ?? []).flat()))}>Show in graph</button>}
            </div>
            {!d && !err && <p className="muted">Loading the lineage…</p>}
            {d && chain.length <= 1 && <p className="muted">Nothing earlier: this is where a line starts.</p>}
            {chain.length > 1 && (
              <ol className="p-chain">
                {chain.map((pk, j) => {
                  const pn = nodes[pk];
                  const pv = vendorOf(pn?.vendor);
                  return (
                    <li key={pk + j}>
                      <button onClick={() => pn && pk !== k && onSelect(pk)} disabled={!pn || pk === k}>
                        <span className={`dot4 ${pv.cls}`} />
                        <span className="grow">
                          <span className={pn?.status === "quarantined" ? "q" : ""}>{pn ? (pn.text || pn.kind).slice(0, 80) : "expired from Arkiv"}</span>
                          <em>{j === 0 ? "this commit" : j === chain.length - 1 ? "the start" : "built on"} · {pn ? vendorOf(pn.vendor).name : "—"}</em>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
            {d && <p className="p-readers">{d.readers.length ? `Read by ${d.readers.join(", ")}` : "No AI has read it yet."}</p>}
          </section>

          {(files.length > 0 || added.length > 0 || done.length > 0) && (
            <section>
              <h4>Files and tasks</h4>
              <div className="p-files">
                {files.map((f) => <button key={f.key} onClick={() => setFile({ path: f.file?.path ?? f.folder, key: f.key })}><b>{f.file?.path ?? f.folder}</b><span>{f.file?.deleted ? "deleted" : `${f.file?.size ?? 0} bytes`} · open</span></button>)}
                {added.map((t) => <div key={t.key}><b>New task</b><span>{t.text}</span></div>)}
                {done.map((t, i) => <div key={i}><b>Done</b><span>{t}</span></div>)}
              </div>
            </section>
          )}

          <section>
            <h4>Proof, and why it exists</h4>
            <div className="p-proof">
              <div className="proofrow4">
                <b>Arkiv entity</b>
                <span>This commit itself, created by {agent?.ens ?? node.agent}&apos;s own wallet. It isn&apos;t a smart contract: it&apos;s a signed record anyone can check, nobody can edit, and it expires with the project.</span>
                {node.pending ? <span className="row"><span className="spinner" /> Arkiv is confirming…</span> : <Ext href={node.proofUrl}>{node.proofUrl ? "Open it on Arkiv" : "—"}</Ext>}
              </div>
              {head && (
                <div className="proofrow4">
                  <b>ENS transaction (HEAD)</b>
                  <span>{agent?.ens}&apos;s text record <code>sb.memory.head</code> now holds this commit&apos;s Arkiv key, like a git branch pointing at its newest commit. Anyone who resolves the name finds it without our server.</span>
                  {head.txUrl && <Ext href={head.txUrl}>Open it on Etherscan</Ext>}
                </div>
              )}
              {stop?.arkivUrl && (
                <div className="proofrow4">
                  <b>Arkiv revocation</b>
                  <span>Signed by the team wallet because the content broke {agent?.ens}&apos;s ENS rule <code>sb.guard</code>. The original stays as evidence; no AI receives it.</span>
                  <Ext href={stop.arkivUrl}>Open it on Arkiv</Ext>
                </div>
              )}
              <div className="mono small">pnpm verify:memory {short(node.key, 8, 6)} <Copy text={`pnpm verify:memory ${node.key}`} label="Copy" /></div>
              <div className="small muted">Checks the signer against ENS using Arkiv and ENS only, without trusting our server.</div>
            </div>
          </section>
          {err && <div className="callout warn small">{err}</div>}
        </div>
      </aside>
      {file && <FileViewer path={file.path} vkey={file.key} onClose={() => setFile(undefined)} />}
    </>
  );
}
