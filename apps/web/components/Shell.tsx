"use client";
// The frame every page shares: nav, live status, owner sign-in, theme and projector size, banners, toasts.
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { api, ApiError } from "@/lib/api";
import { boot, brainId, refreshAdmin, refreshRules, toast, useStore } from "@/lib/store";
import { Logo, Modal } from "./ui";
import { startTour, Tour } from "./Tour";

/** Reveal-on-scroll for [data-reveal] (and late-rendered ones). No-op with reduced motion: they show at once. */
export function useReveal() {
  const path = usePathname();
  useEffect(() => {
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { rootMargin: "0px 0px -8% 0px" });
    const scan = () => document.querySelectorAll("[data-reveal]:not(.in)").forEach((el) => (reduce ? el.classList.add("in") : io.observe(el)));
    scan();
    const mo = new MutationObserver(scan);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => { io.disconnect(); mo.disconnect(); };
  }, [path]);
}

export function useBoot() {
  const sp = useSearchParams();
  const mock = sp.get("mock") === "1";
  useEffect(() => { boot(mock); }, [mock]);
  return mock;
}

/** Keep ?mock=1 on internal links so a mock session never silently becomes live data, or the reverse. */
export function useHref() {
  const sp = useSearchParams();
  const mock = sp.get("mock") === "1";
  return (path: string) => (mock ? `${path}${path.includes("?") ? "&" : "?"}mock=1` : path);
}

export function useBrainId() {
  return useStore((s) => s.brain?.id ?? s.health?.team ?? "");
}

function Pref() {
  const [theme, setTheme] = useState("light");
  const [big, setBig] = useState(false);
  useEffect(() => { setTheme(document.documentElement.dataset.theme ?? "light"); setBig(document.documentElement.dataset.big === "1"); }, []);
  const save = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };
  return (
    <>
      <button className="btn g sm hide-sm" aria-pressed={big} title="Present: everything larger for a projector" onClick={() => {
        const n = !big; setBig(n); if (n) document.documentElement.dataset.big = "1"; else delete document.documentElement.dataset.big; save("sb-big", n ? "1" : "0");
      }}>{big ? "Presenting" : "Present"}</button>
      <button className="iconbtn" title={theme === "dark" ? "Light theme" : "Dark theme"} aria-label="Toggle theme" onClick={() => {
        const n = theme === "dark" ? "light" : "dark"; setTheme(n); if (n === "dark") document.documentElement.dataset.theme = "dark"; else delete document.documentElement.dataset.theme; save("sb-theme", n);
      }}>{theme === "dark" ? "☀" : "☾"}</button>
    </>
  );
}

export function OwnerButton() {
  const admin = useStore((s) => s.admin);
  const mode = useStore((s) => s.mode);
  const [open, setOpen] = useState(false);
  if (mode === "mock") return <span className="chip warn">READ-ONLY (MOCK)</span>;
  return (
    <>
      {admin
        ? <button className="btn g sm" title="Signed in as the brain owner" onClick={async () => { await api.logout().catch(() => {}); await refreshAdmin(); toast("Signed out"); }}><span className="dot ok" /> Owner</button>
        : <button className="btn g sm" title="Owner sign-in: drive the lab, change ENS rules" onClick={() => setOpen(true)}>Sign in</button>}
      {open && <OwnerLogin onClose={() => setOpen(false)} />}
    </>
  );
}

export function OwnerLogin({ onClose }: { onClose: () => void }) {
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal onClose={onClose} label="Owner sign-in">
      <h2>Owner sign-in</h2>
      <p className="muted small" style={{ margin: 0 }}>The owner can drive the attack lab, edit ENS rules, add tasks and pair apps. The passphrase sets an httpOnly cookie on the Supabrain server; this page never stores it.</p>
      <form onSubmit={async (e) => {
        e.preventDefault(); setBusy(true); setErr("");
        try { await api.login(pass); await refreshAdmin(); await refreshRules().catch(() => {}); toast("Signed in as the brain owner", "ok"); onClose(); }
        catch (x) { setErr(x instanceof ApiError ? x.message : "Sign-in failed"); }
        finally { setBusy(false); }
      }} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <input type="password" autoFocus autoComplete="current-password" placeholder="Owner passphrase" value={pass} onChange={(e) => setPass(e.target.value)} aria-label="Owner passphrase" />
        {err && <div className="callout bad">{err}</div>}
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn g sm" onClick={onClose}>Cancel</button>
          <button className="btn p sm" disabled={!pass || busy}>{busy ? "Checking…" : "Sign in"}</button>
        </div>
      </form>
    </Modal>
  );
}

export function LiveDot() {
  const conn = useStore((s) => s.conn);
  const label = { connecting: "connecting…", open: "LIVE", reconnecting: "reconnecting…", noserver: "OFFLINE", mock: "MOCK" }[conn];
  const tone = conn === "open" ? "ok pulse" : conn === "noserver" ? "bad" : "warn";
  return <span className="live" role="status"><span className={`dot ${tone}`} />{label}</span>;
}

export function Toasts() {
  const t = useStore((s) => s.toast);
  const [shown, setShown] = useState<typeof t>();
  useEffect(() => { if (!t) return; setShown(t); const h = setTimeout(() => setShown(undefined), 4500); return () => clearTimeout(h); }, [t]);
  if (!shown) return null;
  return <div className={`toast ${shown.tone}`} role="status">{shown.text}<button className="iconbtn" style={{ width: 26, height: 26 }} onClick={() => setShown(undefined)} aria-label="Dismiss">×</button></div>;
}

/** Utilities that used to be top-level tabs (UI_REDESIGN_PROMPT.md §5.2): one menu. */
function MoreMenu({ id, href, path }: { id: string; href: (p: string) => string; path: string }) {
  const [open, setOpen] = useState(false);
  const review = useStore((s) => s.review.length);
  useEffect(() => { setOpen(false); }, [path]);
  const items: [string, string, string][] = [
    [id ? `/b/${id}/rules` : "/brains", "Rules", "Each AI's ENS rules"],
    [id ? `/b/${id}/history` : "/brains", "History", "Every commit, newest first"],
    [id ? `/b/${id}/files` : "/brains", "Files", "Project files and who wrote them"],
    [id ? `/b/${id}/tasks` : "/brains", "Tasks", "Open and done"],
    [id ? `/b/${id}/review` : "/brains", `Review${review ? ` · ${review}` : ""}`, "Stopped items for the owner"],
    ["/brains", "Registry", "Every brain on ENS"],
    ["/verify", "Verify", "Check everything without us"],
    ["/connect", "Connect", "Add Supabrain to your AI app"],
  ];
  return (
    <div className="more4">
      <button className="navlink" aria-expanded={open} onClick={() => setOpen(!open)}>More ▾</button>
      {open && (
        <>
          <div className="scrim4 clear" onClick={() => setOpen(false)} />
          <div className="menu4" role="menu">
            {items.map(([p, l, d]) => <Link key={l} role="menuitem" href={href(p)} aria-current={path === p ? "page" : undefined}><b>{l}</b><span>{d}</span></Link>)}
          </div>
        </>
      )}
    </div>
  );
}

export function Shell({ children, right, wide }: { children: ReactNode; right?: ReactNode; wide?: boolean }) {
  const mock = useBoot();
  useReveal();
  const href = useHref();
  const path = usePathname();
  const health = useStore((s) => s.health);
  const conn = useStore((s) => s.conn);
  const error = useStore((s) => s.error);
  const id = useBrainId();
  const nav = [
    { p: "/", l: "Story", match: (x: string) => x === "/" },
    { p: id ? `/b/${id}` : "/brains", l: "Live", match: (x: string) => /^\/b\/[^/]+$/.test(x) },
    { p: id ? `/b/${id}/lab` : "/brains", l: "Try it", match: (x: string) => x.endsWith("/lab") },
  ];
  return (
    <div className={`app${wide ? " wide" : ""}`}>
      {mock && <div className="banner mock" role="alert">MOCK DATA · a saved snapshot is replaying · nothing here is live · remove ?mock=1 for the real system</div>}
      {!mock && conn === "noserver" && <div className="banner off" role="alert">SERVER OFFLINE · {error} · retrying</div>}
      {!mock && conn === "reconnecting" && <div className="banner warn" role="status">Reconnecting to the live stream…</div>}
      <header className="topbar4">
        <div className="in">
          <Link className="logo" href={href("/")}><Logo /> <span>Supabrain</span></Link>
          {health && <span className="brainchip hide-sm mono" title={health.mode === "brain" ? "The brain this server serves" : "The demo team"}>{health.ens}</span>}
          <nav className="nav4" aria-label="Main">
            {nav.map((n) => <Link key={n.l} className="navlink" href={href(n.p)} aria-current={n.match(path) ? "page" : undefined}>{n.l}</Link>)}
            <MoreMenu id={id} href={href} path={path} />
          </nav>
          <span className="spacer" />
          {right}
          <button className="btn ink sm hide-sm" onClick={startTour} title="A guided 4-minute walk-through with what to say and click">Tour</button>
          <LiveDot />
          <Pref />
          <OwnerButton />
        </div>
      </header>
      {children}
      <Toasts />
      <Tour />
    </div>
  );
}

/** Second-level tabs inside a brain. */
export function BrainTabs() {
  const href = useHref();
  const path = usePathname();
  const id = useBrainId();
  const review = useStore((s) => s.review.length);
  const tabs = [
    ["", "Graph"], ["/lab", "Attack lab"], ["/rules", "Rules"], ["/history", "History"], ["/files", "Files"], ["/tasks", "Tasks"], ["/review", `Review${review ? ` · ${review}` : ""}`],
  ];
  return (
    <nav className="subtabs" aria-label="Brain sections">
      {tabs.map(([p, l]) => { const to = `/b/${id}${p}`; return <Link key={p} href={href(to)} aria-current={path === to ? "page" : undefined}>{l}</Link>; })}
    </nav>
  );
}
