// decidePayment: the payment policy (docs/lanes/B-MONEY.md §3). Pure apart from the ENS/graph reads it is given.
//
// Payee lineage comes from the WHOLE team graph, never the agent's read-set: clearing a read-set or citing
// something else can't hide a poisoned address. Every ENS failure fails closed (authority unknown → blocked).
// HARD reasons block; SOFT reasons need a World approval; none → allow.
import type { AgentView, EnsAuthority, GraphView, MemoryNode, PayReason } from "@supabrain/shared";
import { formatUnits, getAddress, isAddress, keccak256, parseUnits, stringToHex } from "viem";
import { normalize } from "viem/ens";

type Hex = `0x${string}`;

export interface PolicyContext {
  ens: EnsAuthority;
  graph: GraphView;
  /** True if a "paid" decision to this payee already exists (Arkiv / payments list). */
  hasPaid(payee: Hex): boolean;
  /** Spent today by this agent, in token base units (from the vault's spentToday view). */
  spentTodayUnits: bigint;
  /** config.app.payments.maxRootsPerAttestation; must not exceed the vault's MAX_ROOTS. */
  maxRoots: number;
  /** Token decimals (USDC: 6, checked at startup). */
  decimals: number;
}

export interface PolicyRequest {
  agent: string;
  payee: string; // 0x address or ENS name
  amount: string; // decimal token amount, e.g. "5" or "3.5"
  cites?: string[];
}

export type PolicyDecision =
  | {
      outcome: "allow" | "pending_human" | "blocked";
      reasons: PayReason[]; // hard first, then soft
      hard: PayReason[];
      soft: PayReason[];
      agent?: AgentView;
      payee?: Hex;
      payeeEns?: string;
      payeeVerified: boolean;
      payeeNodes: string[];
      lineage: string[]; // payee memories that support THIS address (incl. quarantined): the intent's blast radius
      path: string[]; // the offending lineage, cite → payee memory → evidence
      rootIds: string[]; // sorted, unique, quarantined lineage excluded
      roots: Hex[]; // keccak256(utf8(rootId)), same order: the vault attestation's roots
      amountUnits: bigint;
    }
  | { outcome: "error"; error: string };

const AMOUNT = /^(0|[1-9]\d*)(\.\d+)?$/;
const NAME = /^[^\s.]+(\.[^\s.]+)+$/;

function parseAmount(s: string, decimals: number): bigint | null {
  if (!AMOUNT.test(s)) return null;
  const frac = s.split(".")[1];
  if (frac && frac.length > decimals) return null;
  const v = parseUnits(s, decimals);
  return v > 0n ? v : null;
}

function blockedEarly(reason: PayReason, amountUnits: bigint, agent?: AgentView): PolicyDecision {
  return {
    outcome: "blocked", reasons: [reason], hard: [reason], soft: [], agent, payeeVerified: false,
    payeeNodes: [], lineage: [], path: [], rootIds: [], roots: [], amountUnits,
  };
}

const notAuthorized = (detail: string): PayReason => ({ code: "AGENT_NOT_AUTHORIZED", detail });

export async function decidePayment(ctx: PolicyContext, req: PolicyRequest): Promise<PolicyDecision> {
  // ---- input (malformed input is an error, not a policy decision) ----
  const amountUnits = parseAmount(req.amount, ctx.decimals);
  if (amountUnits === null) return { outcome: "error", error: `invalid amount ${JSON.stringify(req.amount)}` };
  const isAddr = /^0x/i.test(req.payee);
  if (isAddr && !isAddress(req.payee, { strict: false })) return { outcome: "error", error: `invalid payee address ${JSON.stringify(req.payee)}` };
  let payeeName: string | undefined;
  if (!isAddr) {
    try {
      payeeName = normalize(req.payee);
    } catch {
      payeeName = undefined;
    }
    if (!payeeName || !NAME.test(payeeName)) return { outcome: "error", error: `invalid payee ${JSON.stringify(req.payee)}` };
  }

  try {
    return await decide(ctx, req, amountUnits, payeeName);
  } catch (e) {
    // any ENS read failure: authority is unknown, so payments pause (CLAUDE.md §6.2)
    return blockedEarly(notAuthorized(`ENS unavailable, authority unknown: ${(e as Error).message}`), amountUnits);
  }
}

async function decide(ctx: PolicyContext, req: PolicyRequest, amountUnits: bigint, payeeName?: string): Promise<PolicyDecision> {
  const { ens, graph } = ctx;
  const hard: PayReason[] = [];
  const soft: PayReason[] = [];

  // ---- 1. agent authority (live ENS) ----
  const a = await ens.getAgentAuthority(req.agent);
  let cap: bigint;
  let daily: bigint;
  try {
    cap = parseUnits(a.payCap, ctx.decimals);
    daily = parseUnits(a.payDaily, ctx.decimals);
  } catch {
    return blockedEarly(notAuthorized("pay cap records are not numbers"), amountUnits, a);
  }
  const why = !a.registered ? "agent is not registered in ENS"
    : a.status !== "active" ? `agent status is ${a.status}`
    : a.role === "observer" ? "observers can't pay"
    : !a.recordsOk ? "agent ENS records are inconsistent"
    : cap === 0n ? "agent pay cap is 0"
    : null;
  if (why) return blockedEarly(notAuthorized(why), amountUnits, a);

  // ---- 2. resolve the payee ----
  const vendors = new Set(ens.teamVendors().map((v) => v.toLowerCase()));
  let payee: Hex;
  let payeeEns: string | undefined;
  if (payeeName) {
    const resolved = await ens.resolveEns(payeeName);
    if (!resolved) return blockedEarly({ code: "UNKNOWN_PAYEE" }, amountUnits, a);
    payee = getAddress(resolved);
    payeeEns = payeeName;
  } else {
    payee = getAddress(req.payee);
  }

  const addrNodes = graph.memoriesByAddress(payee);
  const subjects = new Set<string>();
  if (payeeName) subjects.add(payeeName);
  for (const n of addrNodes) if (n.subject) subjects.add(n.subject.toLowerCase());
  const vendorName = await ens.findVendorEns(payee);
  if (vendorName) subjects.add(vendorName.toLowerCase());

  // Mismatch runs for names too (stricter than the lane spec): if memories tie this address to a name whose
  // own ENS record says otherwise, block however the payee was written.
  let payeeVerified = false;
  for (const s of subjects) {
    const r = await ens.resolveEns(s);
    if (!r) continue;
    if (r.toLowerCase() !== payee.toLowerCase()) {
      hard.push({ code: "ENS_MISMATCH", ensName: s, ensAddress: getAddress(r), claimedAddress: payee });
    } else if (vendors.has(s)) {
      payeeVerified = true;
      payeeEns ??= s;
    }
  }
  if (hard.length) payeeVerified = false;

  const nodes = new Map<string, MemoryNode>();
  for (const n of addrNodes) nodes.set(n.key, n);
  for (const s of subjects) for (const n of graph.memoriesBySubject(s)) nodes.set(n.key, n);
  const payeeNodes = [...nodes.values()];

  const quarantined = (k: string) => graph.status(k) === "quarantined";
  const lineage = (n: MemoryNode) => [n, ...graph.ancestors(n.key)];

  // ---- 3. quarantined lineage ----
  const revoked = new Set<string>();
  for (const n of payeeNodes) for (const m of lineage(n)) if (quarantined(m.key)) revoked.add(m.key);
  if (!payeeVerified && revoked.size) hard.push({ code: "QUARANTINED_LINEAGE", revoked: [...revoked] });

  // ---- 4. outside content (a trust-1 root behind the payee) ----
  const outside = payeeNodes.filter((n) => lineage(n).some((m) => m.trust === 1));
  if (!payeeVerified && outside.length) {
    const sources = new Set<string>();
    for (const n of outside) {
      for (const m of lineage(n)) {
        if (m.trust === 1 && m.parents.length === 0) for (const id of m.source ? [m.source.id] : m.roots) sources.add(id);
      }
    }
    soft.push({ code: "OUTSIDE_CONTENT_PAYEE", sources: [...sources] });
  }

  // ---- 5. new / unknown payee ----
  if (!payeeVerified && !ctx.hasPaid(payee)) soft.push({ code: "NEW_PAYEE" });
  if (!payeeVerified && payeeNodes.length === 0) soft.push({ code: "UNKNOWN_PAYEE" });

  // ---- 6. caps (from ENS records, never from config) ----
  if (amountUnits > cap) soft.push({ code: "OVER_CAP", cap: formatUnits(cap, ctx.decimals), amount: formatUnits(amountUnits, ctx.decimals) });
  if (ctx.spentTodayUnits + amountUnits > daily) {
    soft.push({ code: "OVER_DAILY", daily: formatUnits(daily, ctx.decimals), spentToday: formatUnits(ctx.spentTodayUnits, ctx.decimals) });
  }

  // ---- attestation roots: clean payee lineage ∪ clean cited lineage ----
  // Only memories that support THIS address count: a memory about the same subject that claims another address
  // isn't this payee's lineage (otherwise revoking a phishing email would block the honest vendor on chain).
  const supports = (n: MemoryNode) => !n.address || n.address.toLowerCase() === payee.toLowerCase();
  const rootSet = new Set<string>();
  for (const n of payeeNodes) if (supports(n) && !quarantined(n.key)) for (const r of n.roots) rootSet.add(r);
  const cites = (req.cites ?? []).filter((c) => !quarantined(c));
  for (const c of cites) for (const m of graph.ancestors(c)) if (!quarantined(m.key)) for (const r of m.roots) rootSet.add(r);
  const rootIds = [...rootSet].sort();
  if (rootIds.length > ctx.maxRoots) {
    return { outcome: "error", error: `payment has ${rootIds.length} lineage roots, max ${ctx.maxRoots} per attestation` };
  }
  const roots = rootIds.map((id) => keccak256(stringToHex(id)));

  // ---- path: the offending lineage, for the UI to highlight ----
  const offending = (m: MemoryNode) => m.trust === 1 || quarantined(m.key);
  const path: string[] = [];
  const seen = new Set<string>();
  const push = (k: string) => {
    if (!seen.has(k)) {
      seen.add(k);
      path.push(k);
    }
  };
  const bad = new Set(payeeNodes.filter((n) => lineage(n).some(offending)).map((n) => n.key));
  for (const c of req.cites ?? []) {
    const anc = graph.ancestors(c);
    if (!anc.some((m) => bad.has(m.key))) continue;
    push(c);
    for (const m of anc) if (offending(m)) push(m.key);
  }
  for (const n of payeeNodes) {
    if (!bad.has(n.key)) continue;
    for (const m of lineage(n)) if (offending(m)) push(m.key);
  }

  // ---- 7. outcome ----
  const reasons = [...hard, ...soft];
  const outcome = hard.length ? "blocked" : soft.length ? "pending_human" : "allow";
  return {
    outcome, reasons, hard, soft, agent: a, payee, payeeEns, payeeVerified,
    payeeNodes: payeeNodes.map((n) => n.key), lineage: payeeNodes.filter(supports).map((n) => n.key), path, rootIds, roots, amountUnits,
  };
}
