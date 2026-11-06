// pnpm vault:pay-proof <agent> <payee 0x…> <amountUsdc> [--yes] — the S2 "one real pay" proof, straight to the vault:
// the policy signer signs a fresh attestation (no lineage roots, humanApproved=false) and the agent's own key calls
// BrainVault.pay. The vault still checks ENS ownership, replay, deadline and the daily ceiling on chain.
// The full product path (policy + World) is createPayments; this script proves the contract wiring on Sepolia.
import { formatUnits, getAddress, isAddress, parseUnits } from "viem";
import { requireOk, type TxStep } from "../lib/tx";
import { newIntentId, signAttestation, type VaultPayment } from "../../packages/payments/src/vault/attestation";
import { brainVaultAbi, readVaultDeployment, vaultContext } from "./common";

async function main() {
  const ctx = await vaultContext();
  const { config, runner } = ctx;
  const vault = readVaultDeployment();
  if (!vault) throw new Error("no config/deployments/vault.sepolia.json: run vault:deploy first");
  const [label, payeeIn, amount] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (!label || !payeeIn || !amount || !isAddress(payeeIn)) throw new Error("usage: pnpm vault:pay-proof <agent> <payee 0x…> <amountUsdc> [--yes]");
  const agent = ctx.agent(label);
  const policy = ctx.policySigner();
  const usdc = config.tokens.usdc;
  const now = (await runner.pub.getBlock()).timestamp;

  const p: VaultPayment = {
    agent: agent.address, payee: getAddress(payeeIn), amount: parseUnits(amount, usdc.decimals), roots: [],
    intentId: newIntentId(), deadline: now + BigInt(config.app.payments.attestationTtlSec), humanApproved: false,
  };
  const sig = await signAttestation(policy, { name: vault.eip712.name, version: vault.eip712.version, chainId: vault.chainId, verifyingContract: vault.address }, p);
  console.log(`\nattestation signed by policy signer ${policy.address} · ${formatUnits(p.amount, usdc.decimals)} ${usdc.symbol} → ${p.payee}`);
  const step: TxStep = {
    id: "pay", title: `BrainVault.pay as ${label}`, address: vault.address, target: "BrainVault", abi: brainVaultAbi as never,
    functionName: "pay", args: [p, sig],
  };
  requireOk(await runner.run(agent, label, step, "1"));
}

main().catch((e) => {
  console.error(`vault:pay-proof failed: ${(e as Error).message}`);
  process.exit(1);
});
