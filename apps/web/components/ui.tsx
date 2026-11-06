"use client";
import { useEffect, useState, type ReactNode } from "react";
import type { GraphNode } from "@/lib/api";
import { TRUST, vendorOf, until } from "@/lib/format";

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

export function TrustChip({ trust }: { trust: GraphNode["trust"] }) {
  return <span className={`chip${trust === 3 ? " ok" : trust === 1 ? " warn" : ""}`} title={TRUST[trust].long}>{TRUST[trust].word}</span>;
}

export function StatusChips({ n }: { n: GraphNode }) {
  const out: ReactNode[] = [];
  if (n.status === "quarantined") out.push(<span key="q" className="chip solid-bad">QUARANTINED</span>);
  else if (n.dispute?.state === "disputed") out.push(<span key="d" className="chip warn">DISPUTED BY ENS</span>);
  else if (n.dispute?.state === "unverified") out.push(<span key="u" className="chip" title={n.dispute.reason}>UNVERIFIED</span>);
  if (n.status === "stale") out.push(<span key="s" className="chip warn">STALE</span>);
  if (n.status === "expired") out.push(<span key="e" className="chip">EXPIRED</span>);
  if (n.status === "active" && !n.dispute) out.push(<span key="a" className="chip ok">ACTIVE</span>);
  if (n.pending) out.push(<span key="p" className="chip">WRITING TO ARKIV…</span>);
  if (n.kept) out.push(<span key="k" className="chip ok">KEPT</span>);
  return <>{out}</>;
}

/** A ring that drains as expiresAt nears, plus words. */
export function ExpiryRing({ createdAt, expiresAt, kept }: { createdAt: number; expiresAt: number; kept?: boolean }) {
  const now = useNow(1000);
  const total = Math.max(1, expiresAt - createdAt);
  const left = Math.max(0, Math.min(1, (expiresAt - now) / total));
  const r = 9, c = 2 * Math.PI * r;
  const tone = left < 0.15 ? "var(--amber)" : "var(--flow)";
  return (
    <span className="ringtime">
      <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r={r} fill="none" stroke="var(--line2)" strokeWidth="2.5" />
        <circle cx="12" cy="12" r={r} fill="none" stroke={tone} strokeWidth="2.5" strokeDasharray={c} strokeDashoffset={c * (1 - left)} transform="rotate(-90 12 12)" strokeLinecap="round" />
      </svg>
      <span className="small">{expiresAt <= now ? "expired" : `fades in ${until(expiresAt, now)}`}{kept ? " · kept" : ""}</span>
    </span>
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
    <button className={`btn g ${small ? "xs" : "sm"}`} onClick={async () => {
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
