// pnpm brains:fund [--only otter,maple] [--yes] — v2 B2. Tops up every brain AI wallet on Arkiv Rabdi with tGLM so
// it can sign its own writes (the server writes as each AI's derived wallet). Sends from FUNDER_PRIVATE_KEY, a
// separate faucet-funded wallet: never the team or demo-agent wallets, whose nonces Lane A's server uses on Rabdi.
// Target per wallet: config/brains.json funding.perWalletGlm (sized by pnpm brains:write-cost). A wallet is topped
// up to the target only when below topUpBelowFraction × target, so re-runs are idempotent. Dry run by default.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { rabdi } from "@arkiv-network/sdk/chains";
import { createWalletClient, formatEther, http, parseEther, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { connectArkiv } from "@supabrain/arkiv";
import { BRAIN_FAMILIES, brainAgentAccount, readBrainsConfig, readBrainsDeployment, writeBrainsDeployment } from "@supabrain/ens";
import { findRootDir, loadConfig, requireEnv } from "@supabrain/shared/config";

const hasFlag = (name: string) => process.argv.includes(`--${name}`);
const flagList = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1]?.split(",").map((s) => s.trim()) : undefined;
};

async function main() {
  const root = findRootDir();
  const config = loadConfig();
  const cfg = readBrainsConfig(root);
  if (!cfg.funding) throw new Error("config/brains.json has no funding section");
  const broadcast = hasFlag("yes");
  const net = config.networks.rabdi;
  const accessKey = requireEnv("ARKIV_ACCESS_KEY");
  const { rpc } = await connectArkiv({ accessKey, expectedChainId: net.chainId });
  const funder = privateKeyToAccount(requireEnv("FUNDER_PRIVATE_KEY") as Hex);
  const mnemonic = requireEnv("BRAIN_AGENT_MNEMONIC");

  // The funder must not be a wallet Lane A's server sends from on Rabdi (a second sender races its nonces).
  const creators = JSON.parse(readFileSync(join(root, "config", "deployments", "arkiv.rabdi.json"), "utf8")).knownCreators as Record<string, string>;
  const clash = Object.entries(creators).find(([, a]) => a.toLowerCase() === funder.address.toLowerCase());
  if (clash) throw new Error(`FUNDER_PRIVATE_KEY is the ${clash[0]} wallet, which the server uses on Rabdi; use a separate faucet-funded wallet`);

  const only = flagList("only");
  const brains = cfg.brains.filter((b) => !only || only.includes(b.label));
  const target = parseEther(cfg.funding.perWalletGlm);
  const floor = (target * BigInt(Math.round(cfg.funding.topUpBelowFraction * 1000))) / 1000n;
  const dep = readBrainsDeployment(root);
  const gasPrice = await rpc.getGasPrice();
  const txCost = 21_000n * gasPrice;

  console.log(`${broadcast ? "BROADCAST" : "DRY RUN"} · ${net.name} (chain ${net.chainId}) · funder ${funder.address} · target ${cfg.funding.perWalletGlm} tGLM per AI wallet (top up below ${formatEther(floor)})`);
  const plan: { label: string; family: (typeof BRAIN_FAMILIES)[number]; address: Hex; send: bigint }[] = [];
  for (const b of brains) {
    for (const family of BRAIN_FAMILIES) {
      const address = brainAgentAccount(mnemonic, b.index, family).address;
      const bal = await rpc.getBalance({ address });
      const send = bal < floor ? target - bal : 0n;
      console.log(`  ${`${family}.${b.label}`.padEnd(16)} ${address} · has ${formatEther(bal).padEnd(12)} → ${send ? `send ${formatEther(send)}` : "ok"}`);
      if (send) plan.push({ label: b.label, family, address, send });
    }
  }
  const total = plan.reduce((s, p) => s + p.send, 0n) + txCost * BigInt(plan.length);
  const funderBal = await rpc.getBalance({ address: funder.address });
  console.log(`\nplan: ${plan.length} transfer(s) · ${formatEther(total)} tGLM incl. gas · funder has ${formatEther(funderBal)} tGLM${funderBal < total ? "  ✗ NOT ENOUGH (fund it at the faucet or use --only)" : ""}`);
  if (!broadcast) { if (plan.length) console.log("nothing sent. Re-run with --yes to broadcast."); return; }
  if (funderBal < total) throw new Error("funder balance too low; nothing sent");
  if (plan.some((p) => !dep?.brains[p.label])) throw new Error("provision these brains on ENS first (pnpm ens:provision-brains --yes): their entries record the funding");

  const wallet = createWalletClient({ account: funder, chain: rabdi({ accessKey }), transport: http(undefined, { timeout: 20_000, retryCount: 0 }) });
  let nonce = await rpc.getTransactionCount({ address: funder.address, blockTag: "latest" });
  for (const p of plan) {
    const hash = await wallet.sendTransaction({ to: p.address, value: p.send, gas: 21_000n, gasPrice, nonce, chain: wallet.chain });
    nonce++;
    const r = await rpc.waitForTransactionReceipt({ hash, timeout: 120_000 });
    const url = net.explorer.tx.replace("{hash}", hash);
    if (r.status !== "success") throw new Error(`transfer to ${p.address} reverted: ${url}`);
    dep!.brains[p.label]!.agents[p.family].funding = { amountGlm: formatEther(p.send), txHash: hash, url, at: new Date().toISOString() };
    dep!.updatedAt = new Date().toISOString();
    writeBrainsDeployment(root, dep!);
    console.log(`  ✓ ${p.family}.${p.label} +${formatEther(p.send)} tGLM ${url}`);
  }
  dep!.fundingPlan = {
    network: net.name, funder: funder.address, perWalletGlm: cfg.funding.perWalletGlm, writesPerWallet: cfg.funding.writesPerWallet,
    costPerWriteGlm: formatEther(target / BigInt(cfg.funding.writesPerWallet)), measuredFrom: ["pnpm brains:write-cost", cfg.funding.sizing], at: new Date().toISOString(),
  };
  writeBrainsDeployment(root, dep!);
  console.log("wrote config/deployments/brains.sepolia.json (funding per AI wallet)");
}

main().catch((e) => { console.error(e instanceof Error ? e.message.replace(/https?:\/\/\S+/g, (u) => (u.includes("explorer") ? u : "<rpc>")) : e); process.exit(1); });
