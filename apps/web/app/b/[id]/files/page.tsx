"use client";
import { Suspense, useMemo, useState } from "react";
import { BrainFrame } from "@/components/BrainFrame";
import { FileViewer } from "@/components/BrainParts";
import { useStore } from "@/lib/store";
import { ago, vendorOf } from "@/lib/format";
import { Ext, VendorBadge } from "@/components/ui";

function Files() {
  const files = useStore((s) => s.files);
  const loaded = useStore((s) => s.loaded);
  const [open, setOpen] = useState<string>();
  const tree = useMemo(() => {
    const m: Record<string, typeof files> = {};
    for (const f of [...files].sort((a, b) => a.path.localeCompare(b.path))) { const dir = f.path.includes("/") ? f.path.slice(0, f.path.lastIndexOf("/") + 1) : "./"; (m[dir] ??= []).push(f); }
    return Object.entries(m);
  }, [files]);
  return (
    <BrainFrame title="Files" lede="The current version of each path, with the AI that wrote it. Open a file to see its content and every version (blame), each signed on Arkiv.">
      <main className="page v2">
        {!loaded && <div className="skeleton" style={{ height: 120 }} />}
        {loaded && files.length === 0 && <div className="card pad muted">No files yet. A checkpoint with files creates them here.</div>}
        {tree.map(([dir, fs]) => (
          <section key={dir} style={{ marginBottom: 14 }}>
            <div className="section-t mono">{dir}</div>
            <div className="tablewrap">
              <table className="rules">
                <tbody>
                  {fs.map((f) => (
                    <tr key={f.path} style={{ cursor: "pointer" }} onClick={() => setOpen(f.path)}>
                      <td className="mono small">▤ {f.path.slice(dir === "./" ? 0 : dir.length)}</td>
                      <td><span className="row" style={{ gap: 6 }}><VendorBadge vendor={f.vendor} /><span className="mono tiny">{f.agent}</span></span></td>
                      <td className="mono tiny">{f.size} B</td>
                      <td className="tiny muted">{f.versions} version{f.versions === 1 ? "" : "s"} · {ago(f.at)}</td>
                      <td onClick={(e) => e.stopPropagation()}>{f.proofUrl && <Ext href={f.proofUrl}>Arkiv</Ext>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
        {open && <FileViewer path={open} onClose={() => setOpen(undefined)} />}
        <p className="tiny muted">Vendor colours: {["claude", "gemini", "openai"].map((v) => `${vendorOf(v).letter} = ${vendorOf(v).name}`).join(" · ")}</p>
      </main>
    </BrainFrame>
  );
}
export default function Page() { return <Suspense fallback={null}><Files /></Suspense>; }
