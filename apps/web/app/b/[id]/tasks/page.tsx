"use client";
import { Suspense, useState } from "react";
import { BrainFrame } from "@/components/BrainFrame";
import { api, ApiError } from "@/lib/api";
import { brainId, refreshWork, toast, useStore } from "@/lib/store";
import { ago, short } from "@/lib/format";
import { Trust, VendorBadge } from "@/components/ui";

function Tasks() {
  const tasks = useStore((s) => s.tasks);
  const admin = useStore((s) => s.admin);
  const loaded = useStore((s) => s.loaded);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const cols: [string, string, typeof tasks][] = [
    ["OPEN", "", tasks.filter((t) => t.status === "open")],
    ["DONE", "ok", tasks.filter((t) => t.status === "done")],
    ["STOPPED", "bad", tasks.filter((t) => t.status === "quarantined")],
  ];
  return (
    <BrainFrame title="Tasks" lede="A task is done while a live checkpoint ticks it. If that checkpoint is stopped, the task reopens.">
      <main className="page v2">
        {admin && (
          <form className="row" style={{ marginBottom: 14 }} onSubmit={async (e) => {
            e.preventDefault(); if (!title.trim()) return; setBusy(true);
            try { await api.addTask(brainId(), title.trim()); setTitle(""); toast("Task added: every AI sees it on its next continue", "ok"); await refreshWork(); }
            catch (x) { toast(x instanceof ApiError ? x.message : "Could not add the task", "bad"); } finally { setBusy(false); }
          }}>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a task for the AIs (owner)" aria-label="Task title" />
            <button className="btn p sm" disabled={busy || !title.trim()}>{busy ? "Adding…" : "Add task"}</button>
          </form>
        )}
        {!loaded && <div className="skeleton" style={{ height: 120 }} />}
        <div className="kanban">
          {cols.map(([l, tone, list]) => (
            <section key={l} className="kcol">
              <div className="row"><span className={`chip ${tone === "bad" ? "solid-bad" : tone}`}>{l}</span><span className="mono tiny dim">{list.length}</span></div>
              {list.length === 0 && <div className="tiny muted">none</div>}
              {list.map((t) => (
                <div key={t.key} className="kcard">
                  <div className="small" style={{ textDecoration: t.status === "quarantined" ? "line-through" : undefined }}>{t.title}</div>
                  <div className="row tiny muted" style={{ gap: 6 }}><VendorBadge vendor={t.vendor} /> added by {t.createdBy} · {ago(t.createdAt)} <Trust t={t.trust} /></div>
                  {t.status === "done" && <div className="tiny" style={{ color: "var(--flow)" }}>done by {t.doneBy} {t.doneAt ? ago(t.doneAt) : ""}{t.doneIn ? ` in ${short(t.doneIn)}` : ""}</div>}
                  {t.why && <div className="tiny" style={{ color: "var(--lie)" }}>{t.why}</div>}
                </div>
              ))}
            </section>
          ))}
        </div>
      </main>
    </BrainFrame>
  );
}
export default function Page() { return <Suspense fallback={null}><Tasks /></Suspense>; }
