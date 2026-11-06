// Builds the real PaymentsRuntime from config + env (secrets only from env, never logged), then verifies the chain
// before the first payment: eth_chainId matches config, the vault and token have code, the token has the configured
// decimals, and the vault's policySigner is our key. Any mismatch fails closed.
import type { PaymentsDeps } from "@supabrain/shared";
import { agentKeyEnvName, explorerLink, redactUrls } from "@supabrain/shared";
import { requireEnv } from "@supabrain/shared/config";
import { createPublicClient, createWalletClient, erc20Abi, http, type Chain, type PublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { z } from "zod";
import type { ApprovalProvider, PaymentsRuntime, Signer } from "./engine";
import { createVaultClient } from "./vault/client";
import { parseWorldConfig } from "./world/config";
import { InMemoryReplayStore, startHumanApproval, waitForHumanApproval } from "./world/humanApproval";
import { idkitDeps } from "./world/idkitAdapter";

const Addr = z.string().regex(/^0x[0-9a-fA-F]{40}$/).transform((v) => v as `0x${string}`);

/** config/deployments/vault.sepolia.json, written by scripts/vault/deploy. */
export const VaultDeploymentSchema = z.object({
  chainId: z.number().int().positive(),
  address: Addr,
  token: Addr,
  owner: Addr,
  guardian: Addr,
  policySigner: Addr,
  maxRoots: z.number().int().positive(),
  eip712: z.object({ name: z.string().min(1), version: z.string().min(1) }),
  txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  deployedAt: z.string(),
});
export type VaultDeployment = z.infer<typeof VaultDeploymentSchema>;

export interface BuiltRuntime {
  runtime: PaymentsRuntime;
  /** Resolves once the chain checks pass; rejects (fail closed) otherwise. */
  ready: Promise<void>;
}

export function buildRuntime(deps: PaymentsDeps, env: NodeJS.ProcessEnv = process.env): BuiltRuntime {
  const cfg = deps.config;
  if (!cfg.deployments.vault) throw new Error("payments disabled: config/deployments/vault.sepolia.json is missing (vault not deployed)");
  const dep = VaultDeploymentSchema.parse(cfg.deployments.vault);
  const net = cfg.networks.sepolia;
  const usdc = cfg.tokens.usdc;
  const pay = cfg.app.payments;
  if (dep.chainId !== net.chainId) throw new Error(`vault deployment chainId ${dep.chainId} != config ${net.chainId}`);
  if (dep.token.toLowerCase() !== usdc.address.toLowerCase()) throw new Error("vault token differs from config/tokens USDC");
  if (dep.eip712.name !== pay.eip712.name || dep.eip712.version !== pay.eip712.version) throw new Error("vault EIP-712 domain differs from config");
  if (pay.maxRootsPerAttestation > dep.maxRoots) throw new Error("maxRootsPerAttestation exceeds the vault's MAX_ROOTS");

  const rpc = requireEnv(net.rpcEnv, env);
  const chain: Chain = {
    id: net.chainId, name: net.name, nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [rpc] } },
  };
  const transport = http(rpc);
  const publicClient = createPublicClient({ chain, transport }) as PublicClient;
  const wallet = (key: string): Signer => createWalletClient({ chain, transport, account: privateKeyToAccount(key as `0x${string}`) });

  const policySigner = privateKeyToAccount(requireEnv("POLICY_SIGNER_PRIVATE_KEY", env) as `0x${string}`);
  const guardian = wallet(requireEnv("GUARDIAN_PRIVATE_KEY", env));
  const agents = new Map<string, Signer>();
  for (const a of cfg.app.agents) {
    const k = env[agentKeyEnvName(a.label)];
    if (k) agents.set(a.label, wallet(k));
  }

  const world = parseWorldConfig(cfg.world);
  const worldDeps = idkitDeps({
    appId: requireEnv("WORLD_APP_ID", env),
    rpId: requireEnv("WORLD_RP_ID", env),
    signingKeyHex: requireEnv("WORLD_SIGNING_KEY", env),
    cfg: world.idkit,
    replay: new InMemoryReplayStore(), // one process; nullifiers are per-intent actions, so a restart can't reuse an approval for another payment
  });
  const approvals: ApprovalProvider = {
    async start({ intentHash, description }) {
      const p = await startHumanApproval(worldDeps, { intentHash, description });
      return {
        id: p.requestId, userCode: p.userCode, verificationUri: p.connectorURI, expiresAtMs: p.expiresAtMs,
        wait: (signal) => waitForHumanApproval(worldDeps, p, { signal }),
      };
    },
  };

  // Never payees (V3 red team R1/R2): money sent to a server-held key or to the vault/token leaves the vault's controls.
  // The owner is deliberately NOT here: refunds go to the owner, whose key never touches the server.
  const protectedPayees = new Map<string, string>([
    [dep.address.toLowerCase(), "BrainVault"],
    [usdc.address.toLowerCase(), `${usdc.symbol} token`],
    [policySigner.address.toLowerCase(), "policy signer"],
    [guardian.account.address.toLowerCase(), "guardian"],
  ]);
  for (const [label, a] of Object.entries(cfg.deployments.ens?.agents ?? {})) protectedPayees.set(a.wallet.toLowerCase(), `agent wallet ${label}`);
  for (const [label, s] of agents) protectedPayees.set(s.account.address.toLowerCase(), `agent wallet ${label}`);

  const vault = createVaultClient({ publicClient, address: dep.address, txUrl: (hash) => explorerLink(net.explorer.tx, { hash }) });

  const ready = (async () => {
    const id = await publicClient.getChainId();
    if (id !== net.chainId) throw new Error(`RPC chainId ${id} != config ${net.chainId}`);
    for (const [what, a] of [["vault", dep.address], ["USDC", usdc.address]] as const) {
      const code = await publicClient.getCode({ address: a });
      if (!code || code === "0x") throw new Error(`${what} has no code at ${a}`);
    }
    const dec = await publicClient.readContract({ address: usdc.address, abi: erc20Abi, functionName: "decimals" });
    if (dec !== usdc.decimals) throw new Error(`USDC decimals ${dec} != config ${usdc.decimals}`);
    const onchainSigner = await vault.policySigner();
    if (onchainSigner.toLowerCase() !== policySigner.address.toLowerCase()) {
      throw new Error(`vault policySigner ${onchainSigner} is not POLICY_SIGNER (${policySigner.address})`);
    }
  })().catch((e) => {
    throw new Error(redactUrls(`payments chain check failed: ${(e as Error).message}`));
  });
  ready.catch(() => undefined); // surfaced on use, not as an unhandled rejection

  const runtime: PaymentsRuntime = {
    vault,
    domain: { name: dep.eip712.name, version: dep.eip712.version, chainId: dep.chainId, verifyingContract: dep.address },
    decimals: usdc.decimals,
    tokenSymbol: usdc.symbol,
    maxRoots: pay.maxRootsPerAttestation,
    intentTtlSec: pay.intentTtlSec,
    attestationTtlSec: pay.attestationTtlSec,
    agentSigner: (label) => agents.get(label),
    policySigner,
    guardian,
    approvals,
    protectedPayees,
    now: () => Date.now(),
    log: (m) => console.warn(`[payments] ${redactUrls(m)}`),
  };
  return { runtime, ready };
}
