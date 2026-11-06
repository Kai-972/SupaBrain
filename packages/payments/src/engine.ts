// The Payments engine (CLAUDE.md §6.3, B-MONEY.md §3.2–3.3): policy → intent → World approval → live re-check →
// EIP-712 attestation → BrainVault.pay → Arkiv decision + SSE. Everything external is injected (PaymentsRuntime),
// so this file is fully table-tested; createPayments() (./index) builds the real runtime from config + env.
//
// Money only moves through vault.pay with a fresh attestation signed here, and the vault re-checks ENS ownership,
// revoked roots, replay and its daily ceiling on chain. Every failure path ends in a recorded decision where
// nothing moved.
import type { ApprovalView, DryRun, PayDecision, PayReason, Payment, Payments, PaymentsDeps, RevocationTarget } from "@supabrain/shared";
import { formatUnits, type Account, type Chain, type Transport, type WalletClient } from "viem";
import type { LocalAccount } from "viem/accounts";
import { decidePayment, type PolicyDecision, type PolicyRequest } from "./policy";
import { intentHash, newIntentId, rootHash, signAttestation, type VaultDomain, type VaultPayment } from "./vault/attestation";
import type { VaultClient } from "./vault/client";
import type { HumanDecision } from "./world/humanApproval";

type Hex = `0x${string}`;
export type Signer = WalletClient<Transport, Chain | undefined, Account>;

export interface ApprovalHandle {
  id: string;
  userCode: string;
  verificationUri: string; // carries the bridge key: owner-only dashboard, never logged
  verificationUriComplete?: string;
  expiresAtMs: number;
  wait(signal: AbortSignal): Promise<HumanDecision>;
}

export interface ApprovalProvider {
  start(input: { intentHash: Hex; description: string }): Promise<ApprovalHandle>;
}

export interface PaymentsRuntime {
  vault: Pick<VaultClient, "spentToday" | "pay" | "revokeRoot" | "pauseAgent" | "cancelIntent">;
  domain: VaultDomain;
  decimals: number;
  tokenSymbol: string;
  maxRoots: number;
  intentTtlSec: number;
  attestationTtlSec: number;
  agentSigner(label: string): Signer | undefined;
  policySigner: LocalAccount;
  guardian: Signer;
  approvals: ApprovalProvider;
  now(): number; // ms
  log?(msg: string): void; // names and public values only
}

interface Intent {
  intentId: Hex;
  agent: string;
  request: PolicyRequest;
  memo: string;
  createdAt: number;
  // snapshot at creation (what the human approves)
  payee: Hex;
  payeeEns?: string;
  amountUnits: bigint;
  roots: Hex[];
  intentExpiry: bigint; // unix seconds
  lineage: string[];
  decision: PayDecision;
  final: boolean; // a terminal decision was recorded; later outcomes are ignored
  executing: boolean; // attestation signed / vault call in flight: no longer cancellable
  approval?: ApprovalView;
  abort?: AbortController;
  done: Promise<PayDecision>;
  finish(d: PayDecision): void;
}

type Decided = Exclude<PolicyDecision, { outcome: "error" }>;
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function createPaymentsEngine(deps: PaymentsDeps, rt: PaymentsRuntime): Payments & { settled(intentId: string): Promise<PayDecision> } {
  const intents = new Map<string, Intent>();
  const order: string[] = [];
  const log = rt.log ?? (() => undefined);

  const record = (i: Intent): Payment => ({
    intentId: i.intentId, agent: i.agent, payee: i.payee, payeeEns: i.payeeEns,
    amount: formatUnits(i.amountUnits, rt.decimals), memo: i.memo, decision: i.decision, createdAt: i.createdAt, lineage: i.lineage,
  });

  async function publish(i: Intent): Promise<void> {
    const p = record(i);
    deps.emit({ t: "payment", payment: p });
    try {
      await deps.arkiv.writePayment(p);
    } catch (e) {
      log(`arkiv writePayment failed for intent ${i.intentId}: ${errMsg(e)}`);
    }
  }

  async function settle(i: Intent, d: PayDecision): Promise<PayDecision> {
    if (i.final) return i.decision; // first terminal decision wins
    i.final = true;
    i.decision = d;
    i.abort?.abort();
    i.approval = undefined;
    await publish(i);
    i.finish(d);
    return d;
  }

  const hasPaid = (payee: Hex) =>
    [...intents.values()].some((i) => i.decision.status === "paid" && i.payee.toLowerCase() === payee.toLowerCase());

  async function evaluate(agent: string, req: PolicyRequest, signer: Signer): Promise<Decided | { failed: string }> {
    let spent: bigint;
    try {
      spent = await rt.vault.spentToday(signer.account.address);
    } catch (e) {
      return { failed: `vault read failed: ${errMsg(e)}` };
    }
    const d = await decidePayment(
      { ens: deps.ens, graph: deps.graph, hasPaid, spentTodayUnits: spent, maxRoots: rt.maxRoots, decimals: rt.decimals },
      req,
    );
    if (d.outcome === "error") return { failed: d.error };
    if (d.agent && d.agent.wallet.toLowerCase() !== signer.account.address.toLowerCase()) {
      const reason: PayReason = { code: "AGENT_NOT_AUTHORIZED", detail: `agent key is not the ENS-registered wallet of ${agent}` };
      return { ...d, outcome: "blocked", reasons: [reason], hard: [reason], soft: [] };
    }
    return d;
  }

  async function execute(i: Intent, signer: Signer, humanApproved: boolean): Promise<PayDecision> {
    i.executing = true;
    const p: VaultPayment = {
      agent: signer.account.address,
      payee: i.payee,
      amount: i.amountUnits,
      roots: i.roots,
      intentId: i.intentId,
      deadline: BigInt(Math.floor(rt.now() / 1000) + rt.attestationTtlSec),
      humanApproved,
    };
    try {
      const sig = await signAttestation(rt.policySigner, rt.domain, p);
      const tx = await rt.vault.pay(signer, p, sig);
      return { status: "paid", txHash: tx.hash, txUrl: tx.txUrl, intentId: i.intentId };
    } catch (e) {
      return { status: "failed", error: `vault pay failed: ${errMsg(e)}`, intentId: i.intentId };
    }
  }

  function newIntent(agent: string, req: PolicyRequest, memo: string): Intent {
    let finish!: (d: PayDecision) => void;
    const done = new Promise<PayDecision>((r) => (finish = r));
    const intentId = newIntentId();
    const i: Intent = {
      intentId, agent, request: req, memo, createdAt: rt.now(), payee: "0x0000000000000000000000000000000000000000", // hardcode-ok: zero address placeholder until resolved
      amountUnits: 0n, roots: [], intentExpiry: 0n, lineage: [], decision: { status: "failed", error: "not decided yet", intentId }, final: false, executing: false, done, finish,
    };
    intents.set(intentId, i);
    order.push(intentId);
    return i;
  }

  async function onHuman(i: Intent, h: HumanDecision): Promise<void> {
    if (i.final) return; // cancelled meanwhile
    if (h.status !== "approved") {
      const d: PayDecision = h.status === "failed"
        ? { status: "failed", error: `World approval failed: ${h.error}`, intentId: i.intentId }
        : { status: h.status, intentId: i.intentId };
      await settle(i, d);
      return;
    }
    if (rt.now() > Number(i.intentExpiry) * 1000) {
      await settle(i, { status: "expired", intentId: i.intentId });
      return;
    }
    // Approval clears SOFT reasons only. Every HARD check runs again, live.
    const signer = rt.agentSigner(i.agent);
    if (!signer) {
      await settle(i, { status: "failed", error: `no signing key for agent ${i.agent}`, intentId: i.intentId });
      return;
    }
    const live = await evaluate(i.agent, i.request, signer);
    if ("failed" in live) {
      await settle(i, { status: "failed", error: live.failed, intentId: i.intentId });
      return;
    }
    if (live.payee && live.payee.toLowerCase() !== i.payee.toLowerCase()) {
      const reason: PayReason = { code: "ENS_MISMATCH", ensName: i.payeeEns ?? i.request.payee, ensAddress: live.payee, claimedAddress: i.payee };
      await settle(i, { status: "blocked", reasons: [reason, ...live.hard], path: live.path, intentId: i.intentId });
      return;
    }
    if (live.outcome === "blocked") {
      await settle(i, { status: "blocked", reasons: live.hard, path: live.path, intentId: i.intentId });
      return;
    }
    await settle(i, await execute(i, signer, true));
  }

  async function pay(agent: string, input: { payee: string; amount: string; memo: string; cites?: string[] }): Promise<PayDecision> {
    const req: PolicyRequest = { agent, payee: input.payee, amount: input.amount, cites: input.cites };
    const i = newIntent(agent, req, input.memo);
    const signer = rt.agentSigner(agent);
    if (!signer) return settle(i, { status: "failed", error: `no signing key for agent ${agent}`, intentId: i.intentId });

    const d = await evaluate(agent, req, signer);
    if ("failed" in d) return settle(i, { status: "failed", error: d.failed, intentId: i.intentId });

    i.payee = d.payee ?? i.payee;
    i.payeeEns = d.payeeEns;
    i.amountUnits = d.amountUnits;
    i.roots = d.roots;
    i.lineage = [...new Set([...d.lineage, ...(input.cites ?? []), ...d.path])];

    if (d.outcome === "blocked") return settle(i, { status: "blocked", reasons: d.reasons, path: d.path, intentId: i.intentId });
    if (d.outcome === "allow") return settle(i, await execute(i, signer, false));

    // pending_human: snapshot, bind the approval to the intent hash, return at once; a waiter finishes it
    i.intentExpiry = BigInt(Math.floor(rt.now() / 1000) + rt.intentTtlSec);
    const hash = intentHash({ agent: signer.account.address, payee: i.payee, amount: i.amountUnits, roots: i.roots, intentId: i.intentId, intentExpiry: i.intentExpiry });
    const amount = formatUnits(i.amountUnits, rt.decimals);
    let handle: ApprovalHandle;
    try {
      handle = await rt.approvals.start({ intentHash: hash, description: `Pay ${amount} ${rt.tokenSymbol} to ${i.payeeEns ?? i.payee} (agent ${agent})` });
    } catch (e) {
      return settle(i, { status: "failed", error: `could not start World approval: ${errMsg(e)}`, intentId: i.intentId });
    }
    i.approval = {
      id: handle.id, intentId: i.intentId, agent, payee: i.payee, payeeEns: i.payeeEns, amount, reasons: d.reasons,
      userCode: handle.userCode, verificationUri: handle.verificationUri, verificationUriComplete: handle.verificationUriComplete,
      expiresAt: handle.expiresAtMs,
    };
    i.decision = { status: "pending_human", reasons: d.reasons, approval: i.approval, intentId: i.intentId };
    i.abort = new AbortController();
    await publish(i);
    deps.emit({ t: "approval", approval: i.approval });
    handle.wait(i.abort.signal).then(
      (h) => onHuman(i, h),
      (e) => settle(i, { status: "failed", error: `World approval failed: ${errMsg(e)}`, intentId: i.intentId }),
    ).catch((e) => log(`approval waiter crashed for intent ${i.intentId}: ${errMsg(e)}`));
    return i.decision;
  }

  async function cancelIntent(i: Intent): Promise<boolean> {
    if (i.final || i.executing || i.decision.status !== "pending_human") return false;
    await settle(i, { status: "cancelled", intentId: i.intentId });
    return true;
  }

  return {
    pay,

    async status(intentId) {
      return intents.get(intentId)?.decision ?? { status: "failed", error: "unknown intent", intentId };
    },

    settled(intentId) {
      const i = intents.get(intentId);
      if (!i) return Promise.resolve({ status: "failed", error: "unknown intent", intentId });
      return i.final ? Promise.resolve(i.decision) : i.done;
    },

    async onRevoke(dry: DryRun, target: RevocationTarget) {
      const out: { vaultTxUrl?: string; cancelled: string[]; error?: string } = { cancelled: [] };
      const hit = new Set(dry.memories);
      const listed = new Set(dry.pendingPayments);
      for (const i of intents.values()) {
        const affected = listed.has(i.intentId)
          || i.lineage.some((k) => hit.has(k))
          || (target.type === "agent" && i.agent === target.id);
        if (affected && (await cancelIntent(i))) out.cancelled.push(i.intentId);
      }
      try {
        if (target.type === "source") {
          out.vaultTxUrl = (await rt.vault.revokeRoot(rt.guardian, rootHash(target.id))).txUrl;
        } else if (target.type === "agent") {
          out.vaultTxUrl = (await rt.vault.pauseAgent(rt.guardian, await agentWallet(target.id))).txUrl;
        }
      } catch (e) {
        out.error = `vault not updated: ${errMsg(e)}`;
      }
      return out;
    },

    async pauseAgent(label: string) {
      try {
        return { txUrl: (await rt.vault.pauseAgent(rt.guardian, await agentWallet(label))).txUrl };
      } catch (e) {
        return { error: errMsg(e) };
      }
    },

    list() {
      return order.map((id) => record(intents.get(id)!)).reverse(); // newest first
    },

    approvals() {
      return [...intents.values()].filter((i) => !i.final && i.approval).map((i) => i.approval!);
    },

    async cancel(approvalId: string) {
      const i = [...intents.values()].find((x) => x.approval?.id === approvalId);
      if (i) await cancelIntent(i);
    },
  };

  async function agentWallet(label: string): Promise<Hex> {
    try {
      return (await deps.ens.getAgentAuthority(label)).wallet;
    } catch {
      const s = rt.agentSigner(label);
      if (s) return s.account.address;
      throw new Error(`unknown agent ${label}`);
    }
  }
}
