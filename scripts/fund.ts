// pnpm fund — move native tokens between our own dev wallets (ETH on Sepolia, tGLM on Rabdi).
//   pnpm fund --chain sepolia --from lead-claude --to gem-research,acme --amount 0.01          dry run (prints the plan)
//   pnpm fund --chain rabdi   --from team        --to lead-claude,gem-research --amount 5 --yes broadcast
// Wallets are named by role: owner, team, an agent label, or a vendor label. Raw 0x addresses are accepted for --to.
// Prints PUBLIC addresses only. Rabdi uses ARKIV_ACCESS_KEY in the RPC path (redacted in any output).
import { createPublicClient, createWalletClient, defineChain, formatEther, getAddress, http, isAddress, parseEther, type Chain } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { agentKeyEnvName, redactUrls, vendorKeyEnvName, type AppConfig } from "@supabrain/shared";
import { loadConfig, requireEnv } from "@supabrain/shared/config";
import { addressUrl, sepoliaChain, txUrl, type Hex } from "./lib/chain";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const need = (name: string) => arg(name) ?? (() => { throw new Error(`missing --${name}`); })();

function keyEnvFor(config: AppConfig, role: string): string {
  if (role === "owner") return "OWNER_PRIVATE_KEY";
  if (role === "team") return "TEAM_PRIVATE_KEY";
  if (config.app.agents.some((a) => a.label === role)) return agentKeyEnvName(role);
  if (config.app.vendors.some((v) => v.label === role)) return vendorKeyEnvName(role);
  throw new Error(`unknown wallet "${role}" (owner, team, an agent label, or a vendor label)`);
}
const addressOf = (config: AppConfig, who: string): Hex =>
  isAddress(who) ? getAddress(who) : privateKeyToAccount(requireEnv(keyEnvFor(config, who)) as Hex).address;

function rabdiChain(config: AppConfig): { chain: Chain; rpc: string } {
  const n = config.networks.rabdi;
  const key = process.env.ARKIV_ACCESS_KEY?.trim();
  const rpc = key ? `${n.rpc}/${key}` : n.rpc;
  const chain = defineChain({
    id: n.chainId, name: n.name,
    nativeCurrency: { name: n.nativeSymbol, symbol: n.nativeSymbol, decimals: 18 },
    rpcUrls: { default: { http: [rpc] } },
    blockExplorers: { default: { name: "Arkiv Explorer", url: n.explorer.base } },
  });
  return { chain, rpc };
}

async function main() {
  const config = loadConfig();
  const chainName = need("chain");
  const from = need("from");
  const tos = need("to").split(",").map((s) => s.trim()).filter(Boolean);
  const amount = need("amount");
  const broadcast = process.argv.includes("--yes");
  const value = parseEther(amount);

  const net = chainName === "sepolia" ? config.networks.sepolia : chainName === "rabdi" ? config.networks.rabdi : undefined;
  if (!net) throw new Error(`--chain must be sepolia or rabdi`);
  const symbol = chainName === "rabdi" ? config.networks.rabdi.nativeSymbol : "ETH";
  const { chain, rpc } =
    chainName === "rabdi" ? rabdiChain(config) : (() => { const u = requireEnv(config.networks.sepolia.rpcEnv); return { chain: sepoliaChain(config, u), rpc: u }; })();

  const account = privateKeyToAccount(requireEnv(keyEnvFor(config, from)) as Hex);
  const pub = createPublicClient({ chain, transport: http(rpc) });
  const wallet = createWalletClient({ account, chain, transport: http(rpc) });

  const id = await pub.getChainId();
  if (id !== net.chainId) throw new Error(`eth_chainId ${id} != config ${net.chainId} (fail closed)`);

  const gasPrice = await pub.getGasPrice();
  const balance = await pub.getBalance({ address: account.address });
  // Never assume 21000: sending to a brand-new empty account can cost more (a hard-coded 21000 reverted on Sepolia).
  const plan = await Promise.all(tos.map(async (to) => {
    const address = addressOf(config, to);
    const estimate = await pub.estimateGas({ account, to: address, value });
    return { to, address, gas: (estimate * 125n) / 100n, estimate };
  }));
  const gasCost = plan.reduce((sum, p) => sum + p.gas * gasPrice, 0n);
  const total = value * BigInt(plan.length) + gasCost;

  console.log(`${broadcast ? "BROADCAST" : "DRY RUN"} · ${chain.name} (chain ${id}) · gasPrice ${gasPrice} wei`);
  console.log(`from  ${from.padEnd(14)} ${account.address}  balance ${formatEther(balance)} ${symbol}`);
  for (const p of plan) console.log(`to    ${p.to.padEnd(14)} ${p.address}  +${amount} ${symbol}  (gas estimate ${p.estimate}, limit ${p.gas})`);
  console.log(`total ${formatEther(value * BigInt(plan.length))} ${symbol} + ~${formatEther(gasCost)} gas`);
  if (balance < total) throw new Error(`insufficient balance: need ~${formatEther(total)} ${symbol}`);
  if (!broadcast) { console.log("\nnothing sent. Re-run with --yes to broadcast."); return; }

  let nonce = await pub.getTransactionCount({ address: account.address, blockTag: "latest" });
  for (const p of plan) {
    const hash = await wallet.sendTransaction({ to: p.address, value, nonce: nonce++, gas: p.gas, gasPrice });
    const receipt = await pub.waitForTransactionReceipt({ hash, timeout: 120_000 });
    const link = chainName === "sepolia" ? txUrl(config, hash) : config.networks.rabdi.explorer.tx.replace("{hash}", hash);
    console.log(`${receipt.status === "success" ? "✓" : "✗ FAILED"} ${p.to}: ${link}`);
    if (receipt.status !== "success") process.exitCode = 1;
  }
  for (const p of plan) console.log(`  ${p.to.padEnd(14)} now ${formatEther(await pub.getBalance({ address: p.address }))} ${symbol}  (${chainName === "sepolia" ? addressUrl(config, p.address) : p.address})`);
}

main().catch((e) => { console.error(redactUrls(e instanceof Error ? e.message : String(e))); process.exit(1); });
