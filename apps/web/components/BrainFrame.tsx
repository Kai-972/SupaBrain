"use client";
// Header shared by every /b/[id] page: brain identity, status chips, and the sub-tabs.
import type { ReactNode } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useStore } from "@/lib/store";
import { until } from "@/lib/format";
import { BrainTabs, Shell, useHref } from "./Shell";
import { Empty } from "./ui";

export function BrainFrame({ children, title, lede, wide }: { children: ReactNode; title?: string; lede?: ReactNode; wide?: boolean }) {
  const { id } = useParams<{ id: string }>();
  const brain = useStore((s) => s.brain);
  const health = useStore((s) => s.health);
  const loaded = useStore((s) => s.loaded);
  const href = useHref();
  const wrong = loaded && brain && brain.id !== id;
  return (
    <Shell wide={wide}>
      <div className="bhead">
        <div className="row wrapr" style={{ gap: 12 }}>
          <div className="grow" style={{ minWidth: 0 }}>
            <span className="eyebrow"><i />{title ?? "Live brain"}</span>
            <h1 className="mono">{brain?.ens ?? health?.ens ?? "…"}</h1>
          </div>
          <div className="row wrapr">
            {brain && <span className={`chip big ${brain.stopped ? "solid-bad" : "ok"}`}>{brain.stopped ? "STOPPED" : "LIVE"}</span>}
            {brain?.expiresAt ? <span className="chip big">LEASE UNTIL {new Date(brain.expiresAt).toLocaleDateString()} · {until(brain.expiresAt)}</span> : null}
            {brain && <span className="chip big">{brain.visibility.toUpperCase()}</span>}
            {health && <span className="chip big">{health.mode === "brain" ? "BRAIN MODE" : "TEAM MODE"}</span>}
          </div>
        </div>
        {lede && <p className="lede small">{lede}</p>}
        <BrainTabs />
      </div>
      {wrong ? <Empty title={`“${id}” isn't served by this server`}><p>This server serves <b className="mono">{brain.ens}</b>.</p><Link className="btn p sm" href={href(`/b/${brain.id}`)}>Open {brain.id}</Link></Empty> : children}
    </Shell>
  );
}
