// The real IDKit wiring behind HumanApprovalDeps. Kept thin so humanApproval.ts stays unit-testable.
import { IDKit, CredentialRequest, any, isRetryableBridgeError, signRequest } from "@worldcoin/idkit-core";
import type { CreateBridgeRequest, HumanApprovalDeps, ReplayStore, RpSigner } from "./humanApproval";
import type { IdkitConfig } from "./config";

/** Signs rp_context server-side. The signing key never leaves the server process. */
export function idkitSigner(signingKeyHex: string): RpSigner {
  const key = signingKeyHex.replace(/^0x/, "");
  if (!/^[0-9a-fA-F]{64}$/.test(key)) throw new Error("WORLD_SIGNING_KEY must be a 32-byte hex key");
  return ({ action, ttlSec }) => signRequest({ signingKeyHex: key, action, ttl: ttlSec });
}

export const idkitBridge: CreateBridgeRequest = async (a) => {
  const reqs = a.credentials.map((c) => CredentialRequest(c, { signal: a.signal }));
  const constraints = reqs.length === 1 ? reqs[0]! : any(...reqs);
  return IDKit.request({
    app_id: a.appId,
    action: a.action,
    rp_context: a.rpContext,
    allow_legacy_proofs: a.allowLegacyProofs,
    environment: a.environment,
    action_description: a.description,
  }).constraints(constraints);
};

export function idkitDeps(args: {
  appId: string;
  rpId: string;
  signingKeyHex: string;
  cfg: IdkitConfig;
  replay: ReplayStore;
}): HumanApprovalDeps {
  if (!/^app_[A-Za-z0-9_]+$/.test(args.appId)) throw new Error("WORLD_APP_ID must look like app_…");
  if (!/^rp_[A-Za-z0-9_]+$/.test(args.rpId)) throw new Error("WORLD_RP_ID must look like rp_…");
  return {
    appId: args.appId as `app_${string}`,
    rpId: args.rpId,
    cfg: args.cfg,
    sign: idkitSigner(args.signingKeyHex),
    createRequest: idkitBridge,
    replay: args.replay,
    isRetryable: isRetryableBridgeError,
  };
}
