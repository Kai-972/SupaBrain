// pnpm brains:write-cost [0xtx …] — v2 B2, READ-ONLY. What does one Arkiv write cost on Rabdi? Fetches real receipts
// (the given hashes, else every Rabdi tx link in docs/ and config/), fits gasUsed ≈ base + perByte × input bytes by
// least squares, and prints the cost of a write of a given size and the tGLM an AI wallet needs for N writes.
// Rabdi charges a flat gas price, so the fit is the whole story. No keys needed besides ARKIV_ACCESS_KEY.
import { execFileSync } from "node:child_process";
import { formatEther, formatGwei, parseEther, type Hex } from "viem";
import { connectArkiv } from "@supabrain/arkiv";
import { readBrainsConfig } from "@supabrain/ens";
import { findRootDir, loadConfig, requireEnv } from "@supabrain/shared/config";

async function main() {
  const root = findRootDir();
  const config = loadConfig();
  const cfg = readBrainsConfig(root);
  const { rpc } = await connectArkiv({ accessKey: requireEnv("ARKIV_ACCESS_KEY"), expectedChainId: config.networks.rabdi.chainId });
  const explorerTx = config.networks.rabdi.explorer.tx.replace("{hash}", "");
  let hashes = process.argv.slice(2).filter((a) => /^0x[0-9a-fA-F]{64}$/.test(a)) as Hex[];
  if (!hashes.length) {
    const out = execFileSync("git", ["grep", "-h", "-o", "-E", `${explorerTx.replace(/[.]/g, "\\.")}0x[0-9a-f]{64}`, "--", "docs", "config", "arkiv"], { cwd: root, encoding: "utf8" });
    hashes = [...new Set(out.split("\n").filter(Boolean).map((l) => l.slice(explorerTx.length) as Hex))];
  }
  const rows: { hash: Hex; bytes: number; gas: bigint; limit: bigint; price: bigint }[] = [];
  for (const hash of hashes) {
    const [tx, r] = await Promise.all([rpc.getTransaction({ hash }), rpc.getTransactionReceipt({ hash })]);
    const bytes = (tx.input.length - 2) / 2;
    if (bytes === 0 || r.status !== "success") continue; // plain transfers and failures say nothing about writes
    rows.push({ hash, bytes, gas: r.gasUsed, limit: tx.gas, price: r.effectiveGasPrice });
  }
  if (rows.length < 2) throw new Error("need at least two successful write receipts");
  const n = rows.length;
  const mx = rows.reduce((s, r) => s + r.bytes, 0) / n;
  const my = rows.reduce((s, r) => s + Number(r.gas), 0) / n;
  const perByte = rows.reduce((s, r) => s + (r.bytes - mx) * (Number(r.gas) - my), 0) / rows.reduce((s, r) => s + (r.bytes - mx) ** 2, 0);
  const base = my - perByte * mx;
  const price = rows.reduce((m, r) => (r.price > m ? r.price : m), 0n);
  const gasFor = (bytes: number) => BigInt(Math.ceil(base + perByte * bytes));
  const glm = (gas: bigint) => formatEther(gas * price);

  console.log(`${n} write receipts · input ${Math.min(...rows.map((r) => r.bytes))}–${Math.max(...rows.map((r) => r.bytes))} bytes · gas price ${formatGwei(price)} gwei (max seen)`);
  console.log(`fit: gasUsed ≈ ${Math.round(base)} + ${perByte.toFixed(1)} × input bytes`);
  for (const b of [3_000, 6_000, 20_000, 64_000, 128_000]) console.log(`  ${String(b).padStart(7)} B write ≈ ${gasFor(b)} gas ≈ ${glm(gasFor(b))} tGLM`);
  const f = cfg.funding;
  if (f) {
    const blockLimit = (await rpc.getBlock()).gasLimit;
    const headroom = (blockLimit / 2n) * price; // the largest single write's upfront gas limit must still be covered
    const need = gasFor(f.bytesPerWrite) * price * BigInt(f.writesPerWallet) + headroom;
    console.log(`\nper AI wallet for ${f.writesPerWallet} writes of ${f.bytesPerWrite} B + one max-size write's upfront gas: ${formatEther(need)} tGLM`);
    console.log(`config/brains.json funding.perWalletGlm = ${f.perWalletGlm}${parseEther(f.perWalletGlm) < need ? "  ✗ BELOW the measured need" : "  ✓ covers it"}`);
    console.log(`all ${cfg.brains.length * cfg.families.length} AI wallets: ${formatEther(parseEther(f.perWalletGlm) * BigInt(cfg.brains.length * cfg.families.length))} tGLM`);
  }
}

main().catch((e) => { console.error(e instanceof Error ? e.message.replace(/https?:\/\/\S+/g, "<rpc>") : e); process.exit(1); });
