// S5: mount Lane B's createPayments with Lane A's adapters (CLAUDE.md §6.3): the live graph as GraphView, the Arkiv store
// as ArkivWriter (team wallet writes sb.payment), and the event bus. If payments cannot start (no vault deployment, a
// missing key, a failed chain check at build time), the honest disabled stub stays mounted and the reason is logged.
import { createPayments } from "@supabrain/payments";
import type { AppConfig, EnsAuthority, Payment, Payments, PaymentsDeps } from "@supabrain/shared";
import { createPaymentsDisabled } from "../payments-disabled";
import type { Runtime } from "../runtime";

export function mountPayments(p: {
  config: AppConfig;
  ens: EnsAuthority;
  runtime: Runtime;
  log?: (line: string) => void;
  factory?: (deps: PaymentsDeps) => Payments;
}): Payments & { enabled: boolean; historyLoaded: Promise<void> } {
  const log = p.log ?? (() => undefined);
  const { graph, bus, store, service } = p.runtime;
  const recorded = new Set<string>();

  const deps: PaymentsDeps = {
    config: p.config,
    ens: p.ens,
    graph,
    arkiv: { writePayment: (pay) => store.writePayment(pay) },
    emit: (e) => {
      bus.emit(e);
      // A paid decision becomes a memory written by the paying agent's wallet (A-BRAIN S5 step 4), once per intent.
      if (e.t === "payment" && e.payment.decision.status === "paid" && !recorded.has(e.payment.intentId)) {
        recorded.add(e.payment.intentId);
        void service.recordPayment(e.payment).catch((err: Error) => log(`payment memory for ${e.payment.intentId} not written: ${err.message}`));
      }
    },
  };

  let inner: Payments;
  try {
    inner = (p.factory ?? createPayments)(deps);
  } catch (e) {
    log(`payments disabled: ${(e as Error).message}`);
    return { ...createPaymentsDisabled(), historyLoaded: Promise.resolve() };
  }

  // Decisions recorded on Arkiv by earlier server processes (QA P7): the engine keeps intents in memory only.
  // A pending approval from before a restart can no longer complete (its World waiter is gone): shown as expired.
  const history = new Map<string, Payment>();
  const historyLoaded = store.loadPayments().then(
    (ps) => {
      for (const p of ps) {
        history.set(p.intentId, p.decision.status === "pending_human" ? { ...p, decision: { status: "expired", intentId: p.intentId } } : p);
      }
      if (ps.length) log(`payments: ${ps.length} earlier decisions loaded from Arkiv`);
    },
    (e: Error) => log(`payment history not loaded: ${e.message}`),
  );
  log("payments enabled (BrainVault on Sepolia; World approval for new or over-cap payees)");
  return {
    ...inner,
    enabled: true,
    historyLoaded,
    list() {
      const live = inner.list();
      const seen = new Set(live.map((p) => p.intentId));
      return [...live, ...[...history.values()].filter((p) => !seen.has(p.intentId))].sort((a, b) => b.createdAt - a.createdAt);
    },
    async status(intentId) {
      const d = await inner.status(intentId);
      if (d.status === "failed" && d.error === "unknown intent") return history.get(intentId)?.decision ?? d;
      return d;
    },
    // The kill switch covers money too: an agent the owner revoked on Arkiv cannot pay, whatever ENS says right now.
    async pay(agent, input) {
      if (graph.isRevoked({ type: "agent", id: agent })) return { status: "failed", error: `${agent} was revoked by the team owner and cannot pay`, intentId: "" };
      return inner.pay(agent, input);
    },
  };
}
