// Mounted until Lane B delivers createPayments (CLAUDE.md §6.3). Honest, not faked: every pay fails visibly.
import type { Payments } from "@supabrain/shared";

const DISABLED = "payments not enabled yet";

export function createPaymentsDisabled(): Payments & { enabled: false } {
  return {
    enabled: false,
    async pay() {
      return { status: "failed", error: DISABLED, intentId: "" };
    },
    async status(intentId) {
      return { status: "failed", error: DISABLED, intentId };
    },
    async onRevoke() {
      return { cancelled: [], error: DISABLED };
    },
    async pauseAgent() {
      return { error: DISABLED };
    },
    list: () => [],
    approvals: () => [],
    async cancel() {},
  };
}
