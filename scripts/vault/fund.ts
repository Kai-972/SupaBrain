// pnpm vault:fund <amountUsdc> [--from owner|agent:<label>] [--yes] — move test USDC into the vault (ERC-20 transfer).
// Default sender: the owner key. Get test USDC at the faucet in config/tokens.sepolia.json first.
import { erc20Abi, formatUnits, parseUnits } from "viem";
import { requireOk, type TxStep } from "../lib/tx";
import { optValue, readVaultDeployment, vaultContext } from "./common";

async function main() {
  const ctx = await vaultContext();
  const { config, runner } = ctx;
  const vault = readVaultDeployment();
  if (!vault) throw new Error("no config/deployments/vault.sepolia.json: run vault:deploy first");
  const amount = process.argv.slice(2).find((a) => /^\d+(\.\d+)?$/.test(a));
  if (!amount) throw new Error("usage: pnpm vault:fund <amountUsdc> [--from owner|agent:<label>] [--yes]");
  const from = optValue("from") ?? "owner";
  const sender = from === "owner" ? ctx.owner() : from.startsWith("agent:") ? ctx.agent(from.slice(6)) : null;
  if (!sender) throw new Error(`unknown --from ${from}`);
  const usdc = config.tokens.usdc;
  const units = parseUnits(amount, usdc.decimals);
  const have = await runner.pub.readContract({ address: usdc.address, abi: erc20Abi, functionName: "balanceOf", args: [sender.address] });
  console.log(`\n${from} holds ${formatUnits(have, usdc.decimals)} ${usdc.symbol}`);
  if (have < units) throw new Error(`not enough ${usdc.symbol}: get test USDC at ${usdc.faucet} for ${sender.address}`);
  const step: TxStep = {
    id: "fund", title: `transfer ${amount} ${usdc.symbol} into BrainVault`, address: usdc.address, target: usdc.symbol,
    abi: erc20Abi, functionName: "transfer", args: [vault.address, units],
  };
  requireOk(await runner.run(sender, from, step, "1"));
}

main().catch((e) => {
  console.error(`vault:fund failed: ${(e as Error).message}`);
  process.exit(1);
});
