// Lane B owns this package. Fill in createPayments (CLAUDE.md §6.3, docs/lanes/B-MONEY.md).
// Until it is implemented the server mounts createPaymentsDisabled() instead.
import type { CreatePayments } from "@supabrain/shared";

export type { Payments, PaymentsDeps, GraphView, ArkivWriter } from "@supabrain/shared";

export const createPayments: CreatePayments = () => {
  throw new Error("createPayments is not implemented yet (Lane B)");
};
