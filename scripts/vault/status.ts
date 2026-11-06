// pnpm vault:status — read-only fund check: vault USDC, ETH for every key that sends transactions, each agent's
// vault entry, live ENS ownership (getOwner) and spend today. Never sends anything.
import { erc20Abi, formatEther, formatUnits, parseAbi } from "viem";
import type { Hex } from "../lib/chain";
import { addressUrl } from "../lib/chain";
import { brainVaultAbi, readVaultDeployment, vaultContext } from "./common";

const getOwnerAbi = parseAbi(["function getOwner(uint256 anyId) view returns (address)"]);

async function main() {
  const ctx = await vaultContext();
  const { config, runner, ens } = ctx;
  const pub = runner.pub;
  const usdc = config.tokens.usdc;
  const vault = readVaultDeployment();
  const eth = async (a: Hex) => `${formatEther(await pub.getBalance({ address: a }))} ETH`;
  const tok = async (a: Hex) => `${formatUnits(await pub.readContract({ address: usdc.address, abi: erc20Abi, functionName: "balanceOf", args: [a] }), usdc.decimals)} ${usdc.symbol}`;
  const tryAddr = (f: () => { address: Hex }) => {
    try {
      return f().address;
    } catch {
      return undefined;
    }
  };

  console.log("\nkeys (gas)");
  for (const [who, a] of [["owner", tryAddr(ctx.owner)], ["guardian", tryAddr(ctx.guardian)], ["policy signer (signs only)", tryAddr(ctx.policySigner)]] as const) {
    console.log(`  ${who.padEnd(28)} ${a ?? "(env missing)"}${a ? `  ${await eth(a)}` : ""}`);
  }

  if (!vault) {
    console.log("\nvault: not deployed yet (run vault:deploy)");
    return;
  }
  console.log(`\nvault ${vault.address}  ${addressUrl(config, vault.address)}`);
  console.log(`  balance ${await tok(vault.address)}`);
  console.log(`  policySigner ${await pub.readContract({ address: vault.address, abi: brainVaultAbi, functionName: "policySigner" })}`);
  console.log(`  guardian     ${await pub.readContract({ address: vault.address, abi: brainVaultAbi, functionName: "guardian" })}`);

  console.log("\nagents");
  for (const a of config.app.agents) {
    const e = ens.agents[a.label];
    if (!e) {
      console.log(`  ${a.label.padEnd(14)} not in ens.sepolia.json`);
      continue;
    }
    const v = (await pub.readContract({ address: vault.address, abi: brainVaultAbi, functionName: "agentOf", args: [e.wallet as Hex] })) as {
      registry: Hex; paused: boolean; labelhash: bigint; dailyCeiling: bigint;
    };
    const set = v.registry !== "0x0000000000000000000000000000000000000000"; // hardcode-ok: zero address = unset
    const ensOwner = set ? await pub.readContract({ address: v.registry, abi: getOwnerAbi, functionName: "getOwner", args: [v.labelhash] }) : undefined;
    const spent = await pub.readContract({ address: vault.address, abi: brainVaultAbi, functionName: "spentToday", args: [e.wallet as Hex] });
    console.log(
      `  ${a.label.padEnd(14)} ${e.wallet}  ${await eth(e.wallet as Hex)}  vault: ${set ? `ceiling ${formatUnits(v.dailyCeiling, usdc.decimals)}, spent today ${formatUnits(spent as bigint, usdc.decimals)}${v.paused ? ", PAUSED" : ""}` : "NOT SET"}` +
        (ensOwner ? `  ENS getOwner ${ensOwner.toLowerCase() === e.wallet.toLowerCase() ? "= wallet ✓" : `≠ wallet (${ensOwner})`}` : ""),
    );
  }
}

main().catch((e) => {
  console.error(`vault:status failed: ${(e as Error).message}`);
  process.exit(1);
});
