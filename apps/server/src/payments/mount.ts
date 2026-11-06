// S5: mount Lane B's createPayments with Lane A's adapters (CLAUDE.md §6.3): the live graph as GraphView, the Arkiv store
// as ArkivWriter (team wallet writes sb.payment), and the event bus. If payments cannot start (no vault deployment, a
// missing key, a failed chain check at build time), the honest disabled stub stays mounted and the reason is logged.
import { createPayments } from "@supabrain/payments";
import type { AppConfig, EnsAuthority, Payments, PaymentsDeps } from "@supabrain/shared";
import { createPaymentsDisabled } from "../payments-disabled";
import type { Runtime } from "../runtime";

export function mountPayments(p: {
  config: AppConfig;
  ens: EnsAuthority;
  runtime: Runtime;
  log?: (line: string) => void;
  factory?: (deps: PaymentsDeps) => Payments;
}): Payments & { enabled: boolean } {
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
    return createPaymentsDisabled();
  }
  log("payments enabled (BrainVault on Sepolia; World approval for new or over-cap payees)");
  return {
    ...inner,
    enabled: true,
    // The kill switch covers money too: an agent the owner revoked on Arkiv cannot pay, whatever ENS says right now.
    async pay(agent, input) {
      if (graph.isRevoked({ type: "agent", id: agent })) return { status: "failed", error: `${agent} was revoked by the team owner and cannot pay`, intentId: "" };
      return inner.pay(agent, input);
    },
  };
}
