// The pure core of `pnpm verify:memory` (supermemory-plan.md #4): walk a memory and its parents as stored on Arkiv and
// check each hop against ENSv2, with no Supabrain server in the loop. What it proves: each entity's $creator is the
// wallet that owns the agent's ENS name RIGHT NOW (owner memories: the team wallet), each is held by the team wallet,
// and which team-signed revocations cover it. What it cannot prove: that the wallet owned the name at write time.

export type Hex = `0x${string}`;

export interface EntityView {
  key: string;
  creator: Hex; // $creator: who signed the create
  owner?: Hex; // $owner: should be the team wallet after the in-batch handover
  agent: string; // the `agent` attribute: an agent label, or "owner" for human memories
  kind: string;
  trust: number;
  parents: string[];
  roots: string[];
  expiresAtBlock?: bigint;
}

export interface RevocationView {
  type: "source" | "agent" | "memory";
  id: string;
}

export interface VerifyDeps {
  fetch(key: string): Promise<EntityView | undefined>;
  /** ENSv2 `getOwner(labelhash)` of `<agent>.<team>.eth` now; null when unregistered or expired. */
  ensOwner(agent: string): Promise<Hex | null>;
  teamWallet: Hex;
  revocations: RevocationView[];
  maxHops?: number;
}

export interface HopResult {
  key: string;
  agent: string;
  kind: string;
  trust: number;
  creator: Hex;
  ensOwner: Hex | null;
  signedBy: "agent" | "owner";
  ownerIsTeam: boolean;
  revokedBy: string[];
  ok: boolean;
  problem?: string;
}

export interface VerifyResult {
  ok: boolean;
  revoked: boolean;
  hops: HopResult[];
  missing: string[]; // parents not on Arkiv any more (expired) or never found
}

const same = (a?: string | null, b?: string | null) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

export async function verifyLineage(key: string, d: VerifyDeps): Promise<VerifyResult> {
  const max = d.maxHops ?? 25;
  const hops: HopResult[] = [];
  const missing: string[] = [];
  const seen = new Set<string>();
  const queue = [key];
  while (queue.length && hops.length < max) {
    const k = queue.shift()!;
    if (seen.has(k)) continue;
    seen.add(k);
    const ent = await d.fetch(k);
    if (!ent) {
      missing.push(k);
      continue;
    }
    const isOwner = ent.agent === "owner";
    const ensOwner = isOwner ? null : await d.ensOwner(ent.agent);
    let problem: string | undefined;
    if (isOwner) {
      if (!same(ent.creator, d.teamWallet)) problem = `owner memories must be signed by the team wallet ${d.teamWallet}, not ${ent.creator}`;
    } else if (!ensOwner) {
      problem = `${ent.agent} is not registered on ENS now`;
    } else if (!same(ent.creator, ensOwner)) {
      problem = `signed by ${ent.creator}, which is not the wallet ENS says owns ${ent.agent} (${ensOwner})`;
    }
    const ownerIsTeam = same(ent.owner, d.teamWallet);
    if (!problem && !ownerIsTeam) problem = `held by ${ent.owner ?? "nobody"}, not the team wallet`;
    const revokedBy = d.revocations
      .filter((r) => (r.type === "agent" ? r.id === ent.agent : r.id === ent.key || ent.roots.includes(r.id)))
      .map((r) => `${r.type}:${r.id}`);
    hops.push({
      key: ent.key, agent: ent.agent, kind: ent.kind, trust: ent.trust, creator: ent.creator, ensOwner,
      signedBy: isOwner ? "owner" : "agent", ownerIsTeam, revokedBy, ok: !problem, ...(problem ? { problem } : {}),
    });
    queue.push(...ent.parents);
  }
  return { ok: hops.length > 0 && hops.every((h) => h.ok), revoked: hops.some((h) => h.revokedBy.length > 0), hops, missing };
}
