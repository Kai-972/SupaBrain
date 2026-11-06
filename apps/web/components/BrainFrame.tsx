"use client";
// The frame every /b/[id] page shares. v4: the top bar already names the brain, so pages get only an optional
// title and lede (utility pages) and the wrong-brain guard.
import type { ReactNode } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useStore } from "@/lib/store";
import { Shell, useHref } from "./Shell";
import { Empty } from "./ui";

export function BrainFrame({ children, title, lede, wide }: { children: ReactNode; title?: string; lede?: ReactNode; wide?: boolean }) {
  const { id } = useParams<{ id: string }>();
  const brain = useStore((s) => s.brain);
  const loaded = useStore((s) => s.loaded);
  const href = useHref();
  const wrong = loaded && brain && brain.id !== id;
  return (
    <Shell wide={wide}>
      {title && (
        <div className="page4-head wrapx">
          <span className="eyebrow"><i />{brain?.ens ?? id}</span>
          <h1 className="h1-4">{title}</h1>
          {lede && <p className="lede4">{lede}</p>}
        </div>
      )}
      {wrong ? <Empty title={`“${id}” isn't served by this server`}><p>This server serves <b className="mono">{brain.ens}</b>.</p><Link className="btn p sm" href={href(`/b/${brain.id}`)}>Open {brain.id}</Link></Empty> : children}
    </Shell>
  );
}
