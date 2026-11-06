// pnpm demo:step-kill <agent> [--yes] [--revive] — the on-chain kill proof (B-MONEY.md §4 step-kill, demo step 8).
//   1. While <agent> is registered: sign a valid 1-USDC attestation for it and simulate BrainVault.pay → ok.
//   2. Unregister <agent>.<team>.eth with Lane A's own script (`pnpm ens:unregister <agent> --yes`, owner key).
//   3. Send the SAME pay from the agent's own wallet with a FIXED gas limit, so the failed tx is mined and
//      Etherscan shows AgentNotRegistered. Nothing moves.
//   4. Print both links. --revive re-registers the agent afterwards (`pnpm ens:add-agent <agent> --yes`).
// Dry run (no --yes): steps 1 and the plan for 2–3 only; nothing is sent.
import { spawnSync } from "node:child_process";
import { getAddress, parseUnits } from "viem";
import { requireOk, type TxStep } from "../lib/tx";
import { newIntentId, signAttestation, type VaultPayment } from "../../packages/payments/src/vault/attestation";
import { brainVaultAbi, hasFlag, readVaultDeployment, vaultContext } from "../vault/common";

const PAY_GAS = 300_000n; // fixed: an estimate would fail first and nothing would be mined

async function main() {
  const ctx = await vaultContext();
  const { config, runner, ens } = ctx;
  const vault = readVaultDeployment();
  if (!vault) throw new Error("no config/deployments/vault.sepolia.json");
  const label = process.argv.slice(2).find((a) => !a.startsWith("--"));
  if (!label) throw new Error("usage: pnpm demo:step-kill <agent> [--yes] [--revive]");
  const e = ens.agents[label];
  if (!e) throw new Error(`${label} is not in ens.sepolia.json`);
  const agent = ctx.agent(label);
  if (agent.address.toLowerCase() !== e.wallet.toLowerCase()) throw new Error(`${label} key is not its ENS wallet`);
  const policy = ctx.policySigner();
  const usdc = config.tokens.usdc;
  const payee = getAddress(ctx.owner().address);
  const run = (args: string[]) => {
    const r = spawnSync("pnpm", ["-s", ...args], { stdio: "inherit" });
    if (r.status !== 0) throw new Error(`pnpm ${args.join(" ")} failed`);
  };

  // 1. a valid attestation while the agent is registered
  const now = (await runner.pub.getBlock()).timestamp;
  const p: VaultPayment = {
    agent: agent.address, payee, amount: parseUnits("1", usdc.decimals), roots: [], intentId: newIntentId(),
    deadline: now + BigInt(config.app.payments.attestationTtlSec), humanApproved: false,
  };
  const sig = await signAttestation(policy, { name: vault.eip712.name, version: vault.eip712.version, chainId: vault.chainId, verifyingContract: vault.address }, p);
  const pay: TxStep = {
    id: "pay-after-kill", title: `BrainVault.pay as ${label} (same attestation, after unregister; fixed gas ${PAY_GAS})`,
    address: vault.address, target: "BrainVault", abi: brainVaultAbi as never, functionName: "pay", args: [p, sig],
    gas: PAY_GAS, expectRevert: true,
  };
  console.log(`\n[1] while registered: the same pay simulates`);
  await runner.pub.simulateContract({ account: agent, address: vault.address, abi: brainVaultAbi, functionName: "pay", args: [p, sig] });
  console.log(`    sim   ok: ${label} could pay 1 ${usdc.symbol} right now (attestation valid until ${new Date(Number(p.deadline) * 1000).toISOString()})`);

  console.log(`\n[2] owner unregisters ${e.ens}  (pnpm ens:unregister ${label} --yes)`);
  console.log(`[3] ${label} sends the same pay with a fixed gas limit → expect a MINED revert AgentNotRegistered`);
  if (!ctx.broadcast) {
    console.log(`\nDRY RUN: nothing sent. Run with --yes after the ASK go${hasFlag("revive") ? " (then re-registers it)" : ""}.`);
    return;
  }

  run(["ens:unregister", label, "--yes"]);
  const r = await runner.run(agent, label, pay, "3");
  requireOk(r);
  if (!/AgentNotRegistered/.test(r.revert ?? "")) throw new Error(`expected AgentNotRegistered, got ${r.revert ?? "no revert reason"}`);
  console.log(`\n✓ kill proven on chain: ${label} held a valid attestation, its ENS name was unregistered, and the vault refused.`);
  console.log(`    revert tx  ${r.url}`);
  console.log(`    unregister tx: see the ens:unregister output above (also in config/deployments/ens.sepolia.json)`);
  if (hasFlag("revive")) run(["ens:add-agent", label, "--yes"]);
}

main().catch((err) => {
  console.error(`demo:step-kill failed: ${(err as Error).message}`);
  process.exit(1);
});
