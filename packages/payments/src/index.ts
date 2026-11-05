// Lane B owns this package. Fill in createPayments (CLAUDE.md §6.3, docs/lanes/B-MONEY.md).
// Until it is implemented the server mounts createPaymentsDisabled() instead.
import type { CreatePayments } from "@supabrain/shared";

export type { Payments, PaymentsDeps, GraphView, ArkivWriter } from "@supabrain/shared";

export const createPayments: CreatePayments = () => {
  throw new Error("createPayments is not implemented yet (Lane B)");
};

// World ID device-flow approvals (S1 spike → S6 pending-human flow)
export { discover, DiscoveryError, DEVICE_GRANT, type Discovery } from "./world/discovery";
export {
  startDeviceAuthorization,
  pollOnce,
  waitForDecision,
  type ClientCredentials,
  type DeviceHandle,
  type Decision,
  type PollResult,
} from "./world/deviceFlow";
export { IdTokenValidator, type IdTokenClaims } from "./world/idToken";
