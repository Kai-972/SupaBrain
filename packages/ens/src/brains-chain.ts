// Read-only checks of one provisioned brain against live chain state (v2 B1). Used by `pnpm ens:brains-status`,
// by provision-brains after each brain, and available to Lane A's server. Every check names what it expected.
import type { PublicClient } from "viem";
import { permissionedResolverAbi, userRegistryAbi } from "./abis";
import { BRAIN_FAMILIES, BRAIN_REGISTRY_ROLES, BRAIN_TOKEN_ROLES, TEAM_RESOLVER_ROLES, type BrainDeployment, type BrainFamily } from "./brains";
import { labelhashId, labelhashOf } from "./names";
import { RESOLVER_ROLES } from "./roles";

type Hex = `0x${string}`;
const same = (a?: string | null, b?: string | null) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

export interface BrainCheckInput {
  brain: BrainDeployment;
  teamRegistry: Hex;
  team: Hex; // the server's team wallet
  owner: Hex; // the offline owner wallet
  memoryHeadKey: string;
  /** Text keys to read back through the Universal Resolver (current values are reported, empties are problems). */
  textKeys: string[];
  /** Wallets derived from BRAIN_AGENT_MNEMONIC, when the caller has it: must equal the recorded ones. */
  derived?: Partial<Record<BrainFamily, Hex>>;
  /** Pin reads to this block (right after a broadcast a lagging node can show pre-tx state). */
  blockNumber?: bigint;
  now?: number; // unix seconds
}

export interface AgentCheck {
  family: BrainFamily;
  ens: string;
  wallet: Hex;
  owner: Hex | null;
  expiry: number;
  addr: string | null;
  texts: Record<string, string | null>;
  problems: string[];
}

export interface BrainCheck {
  label: string;
  ens: string;
  ok: boolean;
  expiry: number;
  problems: string[];
  agents: AgentCheck[];
}

export async function checkBrainOnChain(pub: PublicClient, i: BrainCheckInput): Promise<BrainCheck> {
  const { brain, blockNumber } = i;
  const now = i.now ?? Math.floor(Date.now() / 1000);
  const read = <T>(address: Hex, abi: typeof userRegistryAbi, functionName: string, args: readonly unknown[]) =>
    pub.readContract({ address, abi, functionName, args: args as unknown[], ...(blockNumber ? { blockNumber } : {}) }) as Promise<T>;
  const problems: string[] = [];
  const id = labelhashId(brain.label);

  const [tokenOwner, sub, tokenRoles, expiry, teamRoot, ownerRoot] = await Promise.all([
    read<Hex>(i.teamRegistry, userRegistryAbi, "getOwner", [id]),
    read<Hex>(i.teamRegistry, userRegistryAbi, "getSubregistry", [brain.label]),
    read<bigint>(i.teamRegistry, userRegistryAbi, "roles", [id, i.team]),
    read<bigint>(i.teamRegistry, userRegistryAbi, "getExpiry", [id]),
    read<bigint>(brain.registry as Hex, userRegistryAbi, "roles", [0n, i.team]),
    read<bigint>(brain.registry as Hex, userRegistryAbi, "roles", [0n, i.owner]),
  ]);
  if (!same(tokenOwner, i.team)) problems.push(`${brain.ens} owner ${tokenOwner}, expected the team wallet ${i.team}`);
  if (!same(sub, brain.registry)) problems.push(`${brain.ens} subregistry ${sub}, expected ${brain.registry}`);
  if (tokenRoles !== BRAIN_TOKEN_ROLES) problems.push(`team roles on ${brain.ens} = 0x${tokenRoles.toString(16)}, expected renew only (0x${BRAIN_TOKEN_ROLES.toString(16)})`);
  if (Number(expiry) <= now) problems.push(`${brain.ens} expired at ${new Date(Number(expiry) * 1000).toISOString()}`);
  if (teamRoot !== BRAIN_REGISTRY_ROLES) problems.push(`team roles on the brain registry = 0x${teamRoot.toString(16)}, expected 0x${BRAIN_REGISTRY_ROLES.toString(16)}`);
  if (ownerRoot !== BRAIN_REGISTRY_ROLES) problems.push(`owner roles on the brain registry = 0x${ownerRoot.toString(16)}, expected 0x${BRAIN_REGISTRY_ROLES.toString(16)}`);

  const agents: AgentCheck[] = [];
  for (const family of BRAIN_FAMILIES) {
    const a = brain.agents[family];
    const p: string[] = [];
    const fid = labelhashId(family);
    const resolver = a.resolver as Hex;
    const hasRole = (resource: bigint, account: Hex) =>
      pub.readContract({ address: resolver, abi: permissionedResolverAbi, functionName: "hasRoles", args: [resource, RESOLVER_ROLES.SET_TEXT, account], ...(blockNumber ? { blockNumber } : {}) }) as Promise<boolean>;
    const ur = <T>(f: () => Promise<T>) => f().catch(() => null);
    const [owner, nameRoles, regResolver, aExpiry, teamText, headText, rootText, addr, ...texts] = await Promise.all([
      read<Hex>(brain.registry as Hex, userRegistryAbi, "getOwner", [fid]),
      read<bigint>(brain.registry as Hex, userRegistryAbi, "roles", [fid, a.wallet as Hex]),
      read<Hex>(brain.registry as Hex, userRegistryAbi, "getResolver", [family]),
      read<bigint>(brain.registry as Hex, userRegistryAbi, "getExpiry", [fid]),
      hasRole(0n, i.team),
      hasRole(BigInt(labelhashOf(i.memoryHeadKey)), a.wallet as Hex),
      hasRole(0n, a.wallet as Hex),
      ur(() => pub.getEnsAddress({ name: a.ens, ...(blockNumber ? { blockNumber } : {}) })),
      ...i.textKeys.map((key) => ur(() => pub.getEnsText({ name: a.ens, key, ...(blockNumber ? { blockNumber } : {}) }))),
    ]);
    const textMap = Object.fromEntries(i.textKeys.map((k, n) => [k, (texts[n] as string | null) ?? null]));
    if (!same(owner as Hex, a.wallet)) p.push(`owner ${owner}, expected the AI wallet ${a.wallet}`);
    if (i.derived?.[family] && !same(i.derived[family], a.wallet)) p.push(`recorded wallet ${a.wallet} != wallet derived from BRAIN_AGENT_MNEMONIC ${i.derived[family]}`);
    if (nameRoles !== 0n) p.push(`AI wallet holds roles 0x${(nameRoles as bigint).toString(16)} on its own name; expected none`);
    if (!same(regResolver as Hex, resolver)) p.push(`registry resolver ${regResolver}, expected ${resolver}`);
    if (Number(aExpiry) <= now) p.push(`expired at ${new Date(Number(aExpiry) * 1000).toISOString()}`);
    if (!teamText) p.push("the team wallet cannot set text on the resolver (rule changes would fail)");
    if (!headText) p.push(`the AI wallet cannot set ${i.memoryHeadKey}`);
    if (rootText) p.push("the AI wallet can set every text key (it must hold only its memory-head key)");
    if (!same(addr as string | null, a.wallet)) p.push(`addr via Universal Resolver ${addr ?? "unreadable"}, expected ${a.wallet}`);
    for (const [k, v] of Object.entries(textMap)) if (!v) p.push(`text ${k} is empty or unreadable`);
    agents.push({ family, ens: a.ens, wallet: a.wallet as Hex, owner: owner as Hex, expiry: Number(aExpiry), addr: addr as string | null, texts: textMap, problems: p });
  }
  const all = [...problems, ...agents.flatMap((a) => a.problems.map((x) => `${a.ens}: ${x}`))];
  return { label: brain.label, ens: brain.ens, ok: all.length === 0, expiry: Number(expiry), problems: all, agents };
}
