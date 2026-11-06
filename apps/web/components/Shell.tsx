"use client";
// Top bar shared by every dashboard page: team, live status, counts, owner login, theme and projector size.
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { api, ApiError } from "@/lib/api";
import { boot, refreshAdmin, refreshPayments, toast, useStore } from "@/lib/store";
import { Logo, Modal } from "./ui";

export function useBoot() {
  const sp = useSearchParams();
  const mock = sp.get("mock") === "1";
  useEffect(() => { boot(mock); }, [mock]);
  return mock;
}

/** Keep ?mock=1 on internal links so a mock session never silently switches to real data (or back). */
export function useHref() {
  const sp = useSearchParams();
  const mock = sp.get("mock") === "1";
  return (path: string) => (mock ? `${path}${path.includes("?") ? "&" : "?"}mock=1` : path);
}

function Pref() {
  const [theme, setTheme] = useState<string>("dark");
  const [big, setBig] = useState(false);
  useEffect(() => { setTheme(document.documentElement.dataset.theme ?? "dark"); setBig(document.documentElement.dataset.big === "1"); }, []);
  const save = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };
  return (
    <>
      <button className="iconbtn" aria-pressed={big} title="Projector size (bigger text)" onClick={() => {
        const n = !big; setBig(n); if (n) document.documentElement.dataset.big = "1"; else delete document.documentElement.dataset.big; save("sb-big", n ? "1" : "0");
      }}>A<span style={{ fontSize: ".7em" }}>A</span></button>
      <button className="iconbtn" title={theme === "light" ? "Dark theme" : "Light theme"} aria-label="Toggle theme" onClick={() => {
        const n = theme === "light" ? "dark" : "light"; setTheme(n); document.documentElement.dataset.theme = n; save("sb-theme", n);
      }}>{theme === "light" ? "☾" : "☀"}</button>
    </>
  );
}

export function OwnerButton() {
  const admin = useStore((s) => s.admin);
  const mode = useStore((s) => s.mode);
  const [open, setOpen] = useState(false);
  if (mode === "mock") return <span className="chip warn" title="Mock mode acts as owner locally">OWNER (MOCK)</span>;
  return (
    <>
      {admin
        ? <button className="btn g sm" title="Signed in as the team owner" onClick={async () => { await api.logout().catch(() => {}); await refreshAdmin(); toast("Signed out"); }}><span className="dot ok" /> Owner</button>
        : <button className="btn g sm" onClick={() => setOpen(true)}>🔒 Owner sign-in</button>}
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
      <p className="muted small" style={{ margin: 0 }}>Revoke, Keep, Correct, Add context, pairing and the World QR are owner-only. The passphrase sets an httpOnly cookie on the Supabrain server; it is never stored in this page.</p>
      <form onSubmit={async (e) => {
        e.preventDefault(); setBusy(true); setErr("");
        try { await api.login(pass); await refreshAdmin(); await refreshPayments().catch(() => {}); toast("Signed in as owner", "ok"); onClose(); }
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
  const label = { connecting: "connecting…", open: "live", reconnecting: "reconnecting…", noserver: "server offline", mock: "mock replay" }[conn];
  const tone = conn === "open" ? "ok pulse" : conn === "noserver" ? "bad" : "warn";
  return <span className="live" role="status"><span className={`dot ${tone}`} />{label}</span>;
}

export function Toasts() {
  const t = useStore((s) => s.toast);
  const [shown, setShown] = useState<typeof t>();
  useEffect(() => { if (!t) return; setShown(t); const h = setTimeout(() => setShown(undefined), 4200); return () => clearTimeout(h); }, [t]);
  if (!shown) return null;
  return <div className={`toast ${shown.tone}`} role="status">{shown.text}<button className="iconbtn" style={{ width: 26, height: 26 }} onClick={() => setShown(undefined)} aria-label="Dismiss">×</button></div>;
}

export function Shell({ children, right }: { children: ReactNode; right?: ReactNode }) {
  const mock = useBoot();
  const href = useHref();
  const path = usePathname();
  const team = useStore((s) => s.team);
  const conn = useStore((s) => s.conn);
  const error = useStore((s) => s.error);
  const health = useStore((s) => s.health);
  const nav = [
    { p: "/t", l: "Brain" },
    ...(health?.payments === "disabled" ? [] : [{ p: "/t/payments", l: "Payments" }]),
    { p: "/t/rules", l: "Rules" },
    { p: "/connect", l: "Connect" },
    { p: "/how", l: "How it works" },
  ];
  return (
    <div className="app">
      {mock && <div className="banner mock" role="alert">MOCK DATA · replaying a saved snapshot · nothing here is live · remove ?mock=1 for the real team</div>}
      {!mock && conn === "noserver" && <div className="banner off" role="alert">SERVER OFFLINE · {error} · retrying</div>}
      {!mock && conn === "reconnecting" && <div className="banner warn" role="status">Reconnecting to the live stream…</div>}
      <header className="topbar">
        <div className="in">
          <Link className="logo" href={href("/")}><Logo /> <span className="hide-sm">Supabrain</span></Link>
          {team && (
            <div className="teamname hide-sm">
              <b>{team.team.displayName}</b>
              <span>{team.team.ens}</span>
            </div>
          )}
          <nav className="tabs hide-sm" aria-label="Sections">
            {nav.map((n) => <Link key={n.p} href={href(n.p)} aria-current={path === n.p ? "page" : undefined}>{n.l}</Link>)}
          </nav>
          <span className="spacer" />
          {right}
          <LiveDot />
          <Pref />
          <OwnerButton />
        </div>
        <MobileNav nav={nav} href={href} path={path} />
      </header>
      {children}
      <Toasts />
    </div>
  );
}

function MobileNav({ nav, href, path }: { nav: { p: string; l: string }[]; href: (p: string) => string; path: string }) {
  return (
    <div className="mnav" style={{ overflowX: "auto", borderTop: "1px solid var(--line)" }}>
      <nav className="tabs" style={{ border: 0, background: "transparent", padding: "6px 10px", width: "max-content" }} aria-label="Sections">
        {nav.map((n) => <Link key={n.p} href={href(n.p)} aria-current={path === n.p ? "page" : undefined}>{n.l}</Link>)}
      </nav>
      <style>{`.mnav{display:none}@media(max-width:820px){.mnav{display:block}}`}</style>
    </div>
  );
}

