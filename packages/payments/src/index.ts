// Lane B owns this package. Fill in createPayments (CLAUDE.md §6.3, docs/lanes/B-MONEY.md).
// Until it is implemented the server mounts createPaymentsDisabled() instead.
import type { CreatePayments } from "@supabrain/shared";

export type { Payments, PaymentsDeps, GraphView, ArkivWriter } from "@supabrain/shared";

export const createPayments: CreatePayments = () => {
  throw new Error("createPayments is not implemented yet (Lane B)");
};

// World ID OIDC device flow (fallback)
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
export { parseWorldConfig, WorldConfigSchema, type WorldConfig } from "./world/config";
export { IdkitConfigSchema, OidcConfigSchema, type IdkitConfig, type OidcConfig } from "./world/config";

// World ID 4 human approval (primary; IDKit / Human-in-the-loop pattern)
export {
  approvalAction,
  startHumanApproval,
  verifyApprovalResult,
  waitForHumanApproval,
  InMemoryReplayStore,
  type HumanApprovalDeps,
  type HumanDecision,
  type PendingApproval,
  type ReplayStore,
  type VerifyResult,
} from "./world/humanApproval";
export { idkitDeps, idkitSigner, idkitBridge } from "./world/idkitAdapter";

// Payment policy (B-MONEY.md §3)
export { decidePayment, type PolicyContext, type PolicyDecision, type PolicyRequest } from "./policy";
