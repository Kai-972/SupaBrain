"use client";
// One AI's rulebook in plain words, every line tied to the ENS text record it comes from. These records live on the
// AI's own ENSv2 resolver; the server reads them on every MCP call and refuses with the record's name.
import type { RuleRow } from "@/lib/api";
import { denyList, GUARD_IDS, GUARD_PLAIN, guardList } from "@/lib/format";
import { Ext } from "./ui";

export interface RuleLine { key: string; value: string; plain: string; tone?: "ok" | "bad" | "muted" }

export function rulebookLines(r: Pick<RuleRow, "status" | "scope" | "writeDaily" | "role" | "guard" | "deny">): RuleLine[] {
  const g = guardList(r.guard);
  const d = denyList(r.deny);
  return [
    { key: "sb.status", value: r.status, plain: r.status === "active" ? "Active: it may act" : "Paused: every call is refused", tone: r.status === "active" ? "ok" : "bad" },
    { key: "sb.guard", value: r.guard ?? "not set (= every check)", plain: g.length ? `May not pass on ${g.length === GUARD_IDS.length ? "any of the 6 attack types" : `${g.length} of 6 attack types`}` : "No content checks (owner turned them all off)", tone: g.length ? "ok" : "bad" },
    { key: "sb.scope", value: r.scope, plain: r.scope === "*" ? "May write anywhere in the project" : `May write only under ${r.scope}` },
    { key: "sb.deny", value: r.deny ?? "not set", plain: d.length ? `May never write ${d.join(", ")}` : "No protected paths" },
    { key: "sb.write.daily", value: r.writeDaily ?? "not set", plain: r.writeDaily ? `At most ${r.writeDaily} commits a day` : "No daily limit" },
    { key: "sb.role", value: r.role, plain: `Role: ${r.role}` },
  ];
}

export function Rulebook({ r, explorer, compact }: { r: RuleRow; explorer?: string; compact?: boolean }) {
  const lines = rulebookLines(r);
  const g = guardList(r.guard);
  return (
    <div className={`book4${compact ? " compact" : ""}`}>
      <ul>
        {lines.map((l) => (
          <li key={l.key} className={l.tone ?? ""}>
            <span className="bk-plain">{l.plain}</span>
            <code>{l.key} = {l.value}</code>
          </li>
        ))}
      </ul>
      {!compact && g.length > 0 && (
        <div className="bk-guard">
          <b>{r.ens} may not pass on:</b>
          <ul>{GUARD_IDS.map((id) => <li key={id} className={g.includes(id) ? "on" : "off"}>{g.includes(id) ? "✕" : "○"} {GUARD_PLAIN[id]} <code>{id}</code></li>)}</ul>
        </div>
      )}
      {!compact && r.resolver && explorer && (
        <p className="bk-proof">These are text records on {r.ens}&apos;s own resolver contract. <Ext href={`${explorer}/address/${r.resolver}`}>See the resolver and every rule change on Etherscan</Ext></p>
      )}
    </div>
  );
}
