// Lane B: Payments (CLAUDE.md §6.3, docs/lanes/B-MONEY.md).
// createPayments builds the real runtime from config + env and verifies the chain before the first payment.
// It throws while the vault isn't deployed, so the server keeps mounting createPaymentsDisabled() until then.
import type { CreatePayments, PayDecision, Payments } from "@supabrain/shared";
import { createPaymentsEngine } from "./engine";
import { buildRuntime } from "./runtime";

export type { Payments, PaymentsDeps, GraphView, ArkivWriter } from "@supabrain/shared";

export const createPayments: CreatePayments = (deps) => {
  const { runtime, ready } = buildRuntime(deps);
  const engine = createPaymentsEngine(deps, runtime);
  const gated = async <T>(fn: () => Promise<T>, onFail: (error: string) => T): Promise<T> => {
    try {
      await ready;
    } catch (e) {
      return onFail((e as Error).message);
    }
    return fn();
  };
  const p: Payments = {
    pay: (agent, input) => gated(() => engine.pay(agent, input), (error): PayDecision => ({ status: "failed", error, intentId: "" })),
    status: (id) => engine.status(id),
    onRevoke: (dry, target) => gated(() => engine.onRevoke(dry, target), (error) => ({ cancelled: [], error })),
    pauseAgent: (label) => gated(() => engine.pauseAgent(label), (error) => ({ error })),
    list: () => engine.list(),
    approvals: () => engine.approvals(),
    cancel: (id) => engine.cancel(id),
  };
  return p;
};

export { createPaymentsEngine, type ApprovalHandle, type ApprovalProvider, type PaymentsRuntime, type Signer } from "./engine";
export { buildRuntime, VaultDeploymentSchema, type VaultDeployment } from "./runtime";

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

// BrainVault: EIP-712 attestation + typed client
export { attestationDigest, intentHash, newIntentId, rootHash, rootsHash, signAttestation, PAYMENT_TYPES, type VaultDomain, type VaultPayment } from "./vault/attestation";
export { createVaultClient, VaultRevert, type VaultClient, type VaultTx } from "./vault/client";
export { brainVaultAbi } from "./vault/abi";

// MCP pay / pay_status tools (Lane A mounts: registerPaymentTools(server, { payments, agentOf }))
export { registerPaymentTools, describeDecision, type PaymentToolDeps } from "./mcp-tools";
