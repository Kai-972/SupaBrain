"use client";
// Left rail: each AI is an ENS name with rules read live from ENS (C-UI.md §3.1).
import { useMemo } from "react";
import type { LiveAgent } from "@/lib/api";
import { useStore } from "@/lib/store";
import { ago, until, vendorOf, short } from "@/lib/format";
import { VendorBadge, useNow } from "./ui";
import { useHref } from "./Shell";
import Link from "next/link";

function statusChip(a: LiveAgent) {
  if (a.authority === "unavailable" || a.status === "unknown") return <span className="chip warn" title="ENS could not be read, so writes and payments are paused (fail closed)">AUTHORITY UNKNOWN</span>;
  if (a.status === "active") return <span className="chip ok">ACTIVE ON ENS</span>;
  return <span className="chip solid-bad">{a.status.toUpperCase()}</span>;
}

export function AgentsRail({ onRevokeAgent, onPick, picked }: { onRevokeAgent: (label: string) => void; onPick: (label: string | undefined) => void; picked?: string }) {
  const team = useStore((s) => s.team);
  const nodes = useStore((s) => s.nodes);
  const notices = useStore((s) => s.notices);
  const connected = useStore((s) => s.connected);
  const admin = useStore((s) => s.admin);
  const href = useHref();
  const now = useNow(15000);
  const stats = useMemo(() => {
    const m: Record<string, { n: number; q: number; last: number }> = {};
    for (const n of Object.values(nodes)) {
      const s = (m[n.agent] ??= { n: 0, q: 0, last: 0 });
      s.n++; if (n.status === "quarantined") s.q++; s.last = Math.max(s.last, n.createdAt);
    }
    return m;
  }, [nodes]);

  if (!team) return <div className="rail">{[0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 170 }} />)}</div>;
  const human = stats.owner;
  return (
    <>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="eyebrow"><i />Team · {team.agents.length} AIs</span>
        <Link className="btn g xs" href={href("/connect")}>+ Connect</Link>
      </div>
      {human && (
        <button className={`agent${picked === "owner" ? " on" : ""}`} style={{ textAlign: "left" }} onClick={() => onPick(picked === "owner" ? undefined : "owner")} aria-pressed={picked === "owner"}>
          <div className="row"><VendorBadge vendor="human" big /><div className="grow"><div className="ens">People on the team</div><div className="tiny muted">Only people can write HUMAN trust, from this dashboard</div></div></div>
          <div className="tiny muted">{human.n} memories · last {ago(human.last, now)}</div>
        </button>
      )}
      {team.agents.map((a) => {
        const v = vendorOf(a.vendor);
        const st = stats[a.label];
        const client = connected[a.label] ?? a.connectedClient;
        const unread = notices[a.label];
        const ok = a.status === "active" && a.authority !== "unavailable";
        return (
          <div key={a.label} className={`agent${client ? " on" : ""}${!ok ? " off" : ""}`} style={picked === a.label ? { borderColor: "var(--amber)" } : undefined}>
            {unread ? <span className="badge" title={`${unread} retraction notice(s) waiting for this AI`}>{unread}</span> : null}
            <button className="row" style={{ textAlign: "left" }} onClick={() => onPick(picked === a.label ? undefined : a.label)} aria-pressed={picked === a.label} title="Show only this AI's memories">
              <VendorBadge vendor={a.vendor} big />
              <div className="grow">
                <div className="ens">{a.ens}</div>
                <div className="tiny muted">{v.name} · {v.company} · {a.role}</div>
              </div>
            </button>
            <div className="meta">
              {statusChip(a)}
              <span className="chip" title="Folders this AI may write to (ENS record sb.scope)">writes: {a.scope === "*" ? "everything" : a.scope}</span>
            </div>
            <div className="caps" title="Read live from this AI's ENS records (sb.pay.cap, sb.pay.daily)">
              <div>pay cap<b>{a.payCap} USDC</b></div>
              <div>daily<b>{a.payDaily} USDC</b></div>
            </div>
            <div className="tiny muted" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span>{client ? <><span className="dot ok" /> connected via <b style={{ color: "var(--fg)" }}>{client}</b></> : "not connected in this session"}</span>
              <span>{st ? `${st.n} memories${st.q ? ` · ${st.q} quarantined` : ""} · last ${ago(st.last, now)}` : "no memories yet"}</span>
              {a.leaseExpiresAt ? <span>ENS lease ends in {until(a.leaseExpiresAt, now)}</span> : null}
              {a.wallet && <span className="mono" title="This AI's own wallet signs its memories on Arkiv">signer {short(a.wallet)}</span>}
            </div>
            <div className="row">
              <span className="chip" title="Rules are records on the ENS name; only the owner can change them">rules from ENS</span>
              <span className="spacer" />
              <button className="btn g xs" disabled={!admin} title={admin ? "Preview everything this AI wrote, then take it back" : "Owner sign-in needed"} onClick={() => onRevokeAgent(a.label)}>{admin ? "Revoke AI…" : "🔒 Revoke AI"}</button>
            </div>
          </div>
        );
      })}
    </>
  );
}
