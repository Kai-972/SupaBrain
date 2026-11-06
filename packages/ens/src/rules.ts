// v2 B3: the server's ENS rules writer (docs/PLAN.md §3.4). An AI's rules are text records on its own
// PermissionedResolver (sb.status, sb.scope, sb.write.daily, sb.role); the team wallet holds set-text there (B1).
// setRules: validate → find the resolver live through the Universal Resolver → read the current values → send ONE
// resolver.multicall with a setText per changed key (DNS-encoded name) → wait for the receipt. Writes from one
// writer are serialised (one signer, one nonce sequence), and reads after a write wait until the node has seen it.
import { createPublicClient, createWalletClient, encodeFunctionData, http, zeroAddress, type Account, type Chain, type Hex, type PublicClient, type Transport } from "viem";
import { permissionedResolverAbi } from "./abis";
import type { RuleKeys } from "./brains";
import { dnsEncode } from "./names";
import { GUARD_CHECKS } from "@supabrain/shared";

export type RuleName = "status" | "scope" | "writeDaily" | "role" | "guard" | "deny";
export interface RulesPatch {
  status?: "active" | "paused";
  scope?: string;
  writeDaily?: string | number;
  role?: "lead" | "worker" | "observer";
  /** sb.guard: the attacks this AI may not pass on ("*" = every check, [] / "none" = no checks) */
  guard?: string | string[];
  /** sb.deny: paths it may never write, even inside its scope ([] / "none" = none) */
  deny?: string | string[];
}
export type Rules = Record<RuleName, string | null>;
export interface SetRulesResult {
  txHash: Hex | null;
  txUrl: string | null;
  changed: Partial<Record<RuleName | "head", { from: string | null; to: string }>>;
}

export class RulesError extends Error {
  constructor(readonly code: "INVALID" | "NOT_OURS" | "NO_RESOLVER" | "REVERTED", message: string) {
    super(message);
    this.name = "RulesError";
  }
}

/** What the writer needs from the chain; tests pass a fake, createRulesWriter builds a viem one by default. */
export interface RulesChainIO {
  /** The resolver serving `name` now (Universal Resolver); null or the zero address when none. */
  findResolver(name: string): Promise<Hex | null>;
  /** A text record now (Universal Resolver); null when unset. Must reflect at least block `atLeastBlock`. */
  getText(name: string, key: string, atLeastBlock?: bigint): Promise<string | null>;
  /** Send resolver.multicall(calls) from the team account; returns the tx hash. */
  send(resolver: Hex, calls: Hex[]): Promise<Hex>;
  waitForReceipt(hash: Hex): Promise<{ status: "success" | "reverted"; blockNumber: bigint }>;
}

export interface RulesWriterOptions {
  keys: RuleKeys;
  /** The text key that holds an AI's newest checkpoint (app.json textKeys.memoryHead), for setHead. */
  headKey?: string;
  /** Only names strictly under this one may be changed, e.g. "supabrain.eth". */
  parentName: string;
  txUrl: (hash: Hex) => string;
  /** The team (server) account and the chain carrying the ENSv2 Universal Resolver. Ignored when `io` is given. */
  account?: Account;
  chain?: Chain;
  transport?: Transport;
  io?: RulesChainIO;
}

const RULES: readonly RuleName[] = ["status", "scope", "writeDaily", "role", "guard", "deny"];
const CHECKS: readonly string[] = GUARD_CHECKS;
const listOf = (v: string | string[]) => [...new Set((Array.isArray(v) ? v : v.split(",")).map((x) => String(x).trim()).filter(Boolean))];
function pathOk(p: string): boolean {
  if (!p || p.length > 200 || p.startsWith("/") || /[*?]/.test(p)) return false;
  const parts = p.endsWith("/") ? p.slice(0, -1).split("/") : p.split("/");
  return parts.every((x) => SEGMENT.test(x) && x !== "." && x !== "..");
}
const SEGMENT = /^[A-Za-z0-9._-]+$/;
const MAX_WRITES_PER_DAY = 100_000;

function scopeOk(s: string): boolean {
  if (s === "*") return true;
  if (!s || s.length > 200 || s.startsWith("/")) return false;
  const parts = s.endsWith("/") ? s.slice(0, -1).split("/") : s.split("/");
  return parts.every((p) => SEGMENT.test(p) && p !== "." && p !== "..");
}

/** Check and normalise a patch. Throws RulesError("INVALID") naming the field. */
export function validateRules(patch: RulesPatch): Partial<Record<RuleName, string>> {
  const bad = (m: string): never => { throw new RulesError("INVALID", m); };
  if (!patch || typeof patch !== "object") bad("rules must be an object");
  const unknown = Object.keys(patch).filter((k) => !(RULES as readonly string[]).includes(k));
  if (unknown.length) bad(`unknown rule ${unknown.join(", ")} (allowed: ${RULES.join(", ")})`);
  const out: Partial<Record<RuleName, string>> = {};
  if (patch.status !== undefined) {
    if (patch.status !== "active" && patch.status !== "paused") bad(`status must be "active" or "paused"`);
    out.status = patch.status;
  }
  if (patch.scope !== undefined) {
    if (typeof patch.scope !== "string" || !scopeOk(patch.scope)) bad(`scope must be "*" or a relative path prefix like "src/app/" (no "..", no leading "/", no wildcards)`);
    out.scope = patch.scope;
  }
  if (patch.writeDaily !== undefined) {
    const s = String(patch.writeDaily);
    if (!/^\d{1,9}$/.test(s) || Number(s) > MAX_WRITES_PER_DAY) bad(`writeDaily must be a whole number from 0 to ${MAX_WRITES_PER_DAY}`);
    out.writeDaily = String(Number(s));
  }
  if (patch.role !== undefined) {
    if (!["lead", "worker", "observer"].includes(patch.role)) bad(`role must be "lead", "worker" or "observer"`);
    out.role = patch.role;
  }
  if (patch.guard !== undefined) {
    if (patch.guard === "*") out.guard = "*";
    else {
      const list = patch.guard === "none" ? [] : listOf(patch.guard);
      const unknown = list.filter((x) => !CHECKS.includes(x));
      if (unknown.length) bad(`guard: unknown check ${unknown.join(", ")} (known: ${CHECKS.join(", ")}, or "*" for all)`);
      out.guard = list.length ? list.join(",") : "none";
    }
  }
  if (patch.deny !== undefined) {
    const list = patch.deny === "none" ? [] : listOf(patch.deny);
    const badPath = list.find((x) => !pathOk(x));
    if (badPath) bad(`deny: "${badPath}" must be a relative path or prefix like ".github/" or ".env" (no "..", no leading "/", no wildcards)`);
    out.deny = list.length ? list.join(",") : "none";
  }
  if (!Object.keys(out).length) bad("nothing to change: give at least one of status, scope, writeDaily, role, guard, deny");
  return out;
}

function checkName(name: string, parent: string): void {
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(name)) throw new RulesError("INVALID", `"${name}" is not a normalised ENS name (lowercase labels)`);
  if (!name.endsWith(`.${parent}`)) throw new RulesError("NOT_OURS", `${name} is not under ${parent}; refusing to change it`);
}

/** viem-backed chain access: reads through the chain's Universal Resolver, writes from `account`. */
export function viemRulesIO(account: Account, chain: Chain, transport: Transport = http()): RulesChainIO {
  const pub = createPublicClient({ chain, transport }) as PublicClient;
  const wallet = createWalletClient({ account, chain, transport });
  const pinned = async (atLeastBlock?: bigint): Promise<bigint | undefined> => {
    if (atLeastBlock === undefined) return undefined;
    for (let i = 0; i < 10; i++) {
      const head = await pub.getBlockNumber();
      if (head >= atLeastBlock) return head;
      await new Promise((r) => setTimeout(r, 2_000));
    }
    return atLeastBlock;
  };
  return {
    async findResolver(name) {
      const r = await pub.getEnsResolver({ name }).catch(() => null);
      return r ?? null;
    },
    async getText(name, key, atLeastBlock) {
      const blockNumber = await pinned(atLeastBlock);
      return (await pub.getEnsText({ name, key, ...(blockNumber ? { blockNumber } : {}) })) ?? null;
    },
    async send(resolver, calls) {
      return wallet.writeContract({ address: resolver, abi: permissionedResolverAbi, functionName: "multicall", args: [calls], account, chain });
    },
    async waitForReceipt(hash) {
      const r = await pub.waitForTransactionReceipt({ hash, timeout: 180_000 });
      return { status: r.status, blockNumber: r.blockNumber };
    },
  };
}

export function createRulesWriter(o: RulesWriterOptions) {
  const io = o.io ?? (o.account && o.chain ? viemRulesIO(o.account, o.chain, o.transport) : undefined);
  if (!io) throw new Error("createRulesWriter needs { account, chain } or { io }");
  let queue: Promise<unknown> = Promise.resolve();
  let seenBlock: bigint | undefined; // the newest block one of our writes landed in

  const configured = (r: RuleName) => !!o.keys[r];
  async function current(name: string, which: readonly RuleName[]): Promise<Partial<Rules>> {
    which = which.filter(configured);
    const values = await Promise.all(which.map((r) => io!.getText(name, o.keys[r]!, seenBlock)));
    return Object.fromEntries(which.map((r, i) => [r, values[i] ? values[i] : null]));
  }

  async function write(name: string, want: Partial<Record<RuleName, string>>): Promise<SetRulesResult> {
    const rules = Object.keys(want) as RuleName[];
    const missing = rules.filter((r) => !configured(r));
    if (missing.length) throw new RulesError("INVALID", `no ENS text key is configured for ${missing.join(", ")}`);
    return writeRecords(name, rules.map((r) => ({ id: r, key: o.keys[r]!, value: want[r]! })));
  }

  /** Set some text records on `name`'s live resolver: only the ones that differ, in one multicall. */
  async function writeRecords(name: string, records: { id: RuleName | "head"; key: string; value: string }[]): Promise<SetRulesResult> {
    const resolver = await io!.findResolver(name);
    if (!resolver || resolver.toLowerCase() === zeroAddress) throw new RulesError("NO_RESOLVER", `${name} has no resolver on ENS; nothing changed`);
    const values = await Promise.all(records.map((r) => io!.getText(name, r.key, seenBlock)));
    const changed: SetRulesResult["changed"] = {};
    const todo: typeof records = [];
    records.forEach((r, i) => {
      const from = values[i] ? values[i]! : null;
      if (from !== r.value) { changed[r.id] = { from, to: r.value }; todo.push(r); }
    });
    if (!todo.length) return { txHash: null, txUrl: null, changed: {} };
    const dns = dnsEncode(name);
    const calls = todo.map((r) => encodeFunctionData({ abi: permissionedResolverAbi, functionName: "setText", args: [dns, r.key, r.value] }));
    const hash = await io!.send(resolver, calls);
    const receipt = await io!.waitForReceipt(hash);
    const url = o.txUrl(hash);
    if (receipt.status !== "success") throw new RulesError("REVERTED", `rule change for ${name} reverted: ${url}`);
    if (seenBlock === undefined || receipt.blockNumber > seenBlock) seenBlock = receipt.blockNumber;
    return { txHash: hash, txUrl: url, changed };
  }

  return {
    /** Change some of an AI's rules. Returns the tx (null when nothing changed) and what changed from what. */
    async setRules(agentEns: string, patch: RulesPatch): Promise<SetRulesResult> {
      // async: a bad name or patch becomes a rejected promise, like a chain error. Validation runs before queueing.
      checkName(agentEns, o.parentName);
      const want = validateRules(patch);
      const run = queue.then(() => write(agentEns, want));
      queue = run.catch(() => undefined);
      return run;
    },
    /** Publish an AI's newest checkpoint key to its ENS name (sb.memory.head): refs on ENS, objects on Arkiv. */
    async setHead(agentEns: string, key: Hex): Promise<SetRulesResult> {
      checkName(agentEns, o.parentName);
      if (!o.headKey) throw new RulesError("INVALID", "headKey is not configured for this writer");
      if (!/^0x[0-9a-fA-F]{64}$/.test(key)) throw new RulesError("INVALID", `"${key}" is not an Arkiv entity key (0x + 64 hex)`);
      const run = queue.then(() => writeRecords(agentEns, [{ id: "head", key: o.headKey!, value: key }]));
      queue = run.catch(() => undefined);
      return run;
    },
    /** An AI's published head (sb.memory.head) as ENS shows it now; null when unset or headKey is not configured. */
    async readHead(agentEns: string): Promise<string | null> {
      checkName(agentEns, o.parentName);
      if (!o.headKey) return null;
      return (await io!.getText(agentEns, o.headKey, seenBlock)) || null;
    },
    /** The four rules as ENS shows them now (null when a record is unset). */
    async readRules(agentEns: string): Promise<Rules> {
      checkName(agentEns, o.parentName);
      return (await current(agentEns, RULES)) as Rules;
    },
  };
}
export type RulesWriter = ReturnType<typeof createRulesWriter>;
