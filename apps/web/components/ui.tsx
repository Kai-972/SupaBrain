"use client";
import { useEffect, useState, type ReactNode } from "react";
import type { GraphNode } from "@/lib/api";
import { vendorOf } from "@/lib/format";

export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 22 22" aria-hidden="true">
      <path d="M8 10L14 6M8 12L14 16" stroke="var(--line2)" strokeWidth="1.5" fill="none" />
      <circle cx="5" cy="11" r="3" fill="var(--flow)" />
      <circle cx="17" cy="5" r="3" fill="var(--fg)" />
      <circle cx="17" cy="17" r="3" fill="var(--fg)" />
    </svg>
  );
}

export function VendorBadge({ vendor, big }: { vendor: string; big?: boolean }) {
  const v = vendorOf(vendor);
  return <span className={`vb ${v.cls}${big ? " lg" : ""}`} title={`${v.name} (${v.company})`} aria-label={v.name}>{v.letter}</span>;
}

export const Trust = ({ t }: { t: number }) => <span className="mono tiny dim" title={t === 3 ? "trust 3: a person" : t === 2 ? "trust 2: an AI" : "trust 1: outside content"}>T{t}</span>;

/** SAVED · SAVING · STOPPED · EXPIRED (+ HEAD when the AI's ENS name points at it). */
export function NodeStatus({ n, head }: { n: Pick<GraphNode, "status" | "pending">; head?: boolean }) {
  return (
    <>
      {n.status === "quarantined" ? <span className="chip solid-bad">STOPPED</span>
        : n.status === "expired" ? <span className="chip">EXPIRED</span>
          : n.pending ? <span className="chip">SAVING</span>
            : <span className="chip ok">SAVED</span>}
      {head && <span className="chip warn">HEAD</span>}
    </>
  );
}

export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}

export function Copy({ text, label = "Copy", small = true }: { text: string; label?: string; small?: boolean }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className={`btn g ${small ? "xs" : "sm"}`} onClick={async () => {
      try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1400); } catch { /* clipboard blocked */ }
    }}>{done ? "Copied ✓" : label}</button>
  );
}

export function Ext({ href, children, className = "link" }: { href?: string; children: ReactNode; className?: string }) {
  if (!href) return <>{children}</>;
  return <a className={`${className} ext`} href={href} target="_blank" rel="noreferrer noopener">{children}</a>;
}

export function Modal({ onClose, children, wide, label }: { onClose: () => void; children: ReactNode; wide?: boolean; label: string }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`modal${wide ? " wide" : ""}`} role="dialog" aria-modal="true" aria-label={label}>{children}</div>
    </div>
  );
}

/** A "scientific" figure: number, caption, how to read it, and the live source line. */
export function Fig({ n, title, how, source, children, right }: { n: number; title: string; how?: string; source: string; children: ReactNode; right?: ReactNode }) {
  return (
    <figure className="fig">
      <figcaption className="fig-hd">
        <span className="mono tiny dim">FIG. {n}</span>
        <b>{title}</b>
        <span className="spacer" />
        {right}
      </figcaption>
      <div className="fig-bd">{children}</div>
      <div className="fig-ft">
        {how && <span className="small muted">{how}</span>}
        <span className="mono tiny dim">Source: {source} · live</span>
      </div>
    </figure>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="empty"><h3>{title}</h3>{children}</div>;
}
