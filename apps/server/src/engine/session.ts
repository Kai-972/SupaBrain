// Per-agent session state (in memory, lost on restart by design: the server is stateless MCP keyed by agent token).

/**
 * What each agent has read recently: the parents of its next memory (CLAUDE.md §7 rule 2).
 * Keyed by agent label; entries expire after `readSet.ttlSec`; reset after each `remember`.
 */
export class ReadSets {
  private readonly sets = new Map<string, Map<string, number>>(); // agent → key → readAt(ms)

  constructor(private readonly ttlSec: number, private readonly now: () => number = Date.now) {}

  private live(agent: string): Map<string, number> {
    const s = this.sets.get(agent) ?? new Map<string, number>();
    const cutoff = this.now() - this.ttlSec * 1000;
    for (const [k, at] of s) if (at < cutoff) s.delete(k);
    this.sets.set(agent, s);
    return s;
  }

  add(agent: string, keys: string[]): void {
    const s = this.live(agent);
    for (const k of keys) s.set(k, this.now());
  }

  keys(agent: string): string[] {
    return [...this.live(agent).keys()];
  }

  /** Non-empty `cites` must all have been read; otherwise the whole read-set becomes the parents. */
  parentsFor(agent: string, cites?: string[]): { ok: true; parents: string[] } | { ok: false; missing: string[] } {
    const s = this.live(agent);
    if (!cites || cites.length === 0) return { ok: true, parents: [...s.keys()] };
    const byLower = new Map([...s.keys()].map((k) => [k.toLowerCase(), k]));
    const missing: string[] = [];
    const parents: string[] = [];
    for (const c of cites) {
      const k = byLower.get(c.toLowerCase());
      if (!k) missing.push(c);
      else if (!parents.includes(k)) parents.push(k);
    }
    return missing.length ? { ok: false, missing } : { ok: true, parents };
  }

  reset(agent: string): void {
    this.sets.delete(agent);
  }

  /** On revoke: quarantined keys never stay in (or enter) a read-set. */
  purge(keys: string[]): void {
    for (const s of this.sets.values()) for (const k of keys) s.delete(k);
  }
}

/** memory key → agents that read it. Never reset by writes; feeds DryRun.readers and notices. */
export class ReadLog {
  private readonly log = new Map<string, Set<string>>();

  record(agent: string, keys: string[]): void {
    for (const k of keys) {
      if (!this.log.has(k)) this.log.set(k, new Set());
      this.log.get(k)!.add(agent);
    }
  }

  readers(keys: string[]): string[] {
    const out = new Set<string>();
    for (const k of keys) for (const a of this.log.get(k) ?? []) out.add(a);
    return [...out];
  }
}

export interface Notice { revocation: string; text: string; affected: string[]; at: number }

/** Retraction notices per agent. Every tool result carries the unread ones until `check_notices` marks them read. */
export class NoticeBox {
  private readonly box = new Map<string, { notice: Notice; read: boolean }[]>();

  add(agent: string, notice: Notice): void {
    if (!this.box.has(agent)) this.box.set(agent, []);
    this.box.get(agent)!.push({ notice, read: false });
  }

  has(agent: string, revocation: string): boolean {
    return (this.box.get(agent) ?? []).some((x) => x.notice.revocation === revocation);
  }

  unread(agent: string): Notice[] {
    return (this.box.get(agent) ?? []).filter((x) => !x.read).map((x) => x.notice);
  }

  markRead(agent: string): Notice[] {
    const items = (this.box.get(agent) ?? []).filter((x) => !x.read);
    for (const x of items) x.read = true;
    return items.map((x) => x.notice);
  }
}
