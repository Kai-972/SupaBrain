// pnpm run ens:verify — confirm config/ens.sepolia.json matches the live chain (CLAUDE.md §2.2, A-BRAIN S1 step 2).
//   - eth_chainId matches config
//   - getCode is non-empty at every configured address
//   - RootRegistry.getSubregistry("eth") == ETHRegistry
//   - the registrar's payment/oracle wiring, and (if set) whether the team label is available
import { erc20Abi } from "viem";
import { ethRegistrarAbi, permissionedRegistryAbi } from "@supabrain/ens/abis";
import { loadConfig } from "@supabrain/shared/config";
import { ensAddress, sepoliaClient, type Hex } from "../lib/chain";

let failures = 0;
const ok = (m: string) => console.log(`  ✓ ${m}`);
const bad = (m: string) => { failures++; console.log(`  ✗ ${m}`); };
const info = (m: string) => console.log(`  – ${m}`);

async function main() {
  const config = loadConfig();
  const { client } = await sepoliaClient(config);
  ok(`eth_chainId ${config.networks.sepolia.chainId} matches config`);
  info(`config/ens.sepolia.json: commit ${config.ens.commit?.slice(0, 8)} · redeployed ${config.ens.redeployedAt} · verified ${config.ens.verifiedAt}`);

  console.log("\nContract code");
  for (const [name, address] of Object.entries(config.ens.contracts)) {
    const code = await client.getCode({ address: address as Hex });
    if (!code || code === "0x") bad(`${name} ${address}: NO CODE (typo or stale redeploy)`);
    else ok(`${name}: code present (${(code.length - 2) / 2} bytes)`);
  }

  console.log("\nRegistry wiring");
  const sub = (await client.readContract({
    address: ensAddress(config, "RootRegistry"), abi: permissionedRegistryAbi, functionName: "getSubregistry", args: ["eth"],
  })) as Hex;
  if (sub.toLowerCase() === ensAddress(config, "ETHRegistry").toLowerCase()) ok(`RootRegistry.getSubregistry("eth") == ETHRegistry`);
  else bad(`RootRegistry.getSubregistry("eth") = ${sub}, expected ETHRegistry ${ensAddress(config, "ETHRegistry")}`);

  console.log("\nRegistrar");
  const registrar = ensAddress(config, "ETHRegistrar");
  const read = (functionName: string, args: unknown[] = []) =>
    client.readContract({ address: registrar, abi: ethRegistrarAbi, functionName, args }) as Promise<never>;
  const oracle = (await read("rentPriceOracle")) as Hex;
  if (oracle.toLowerCase() === ensAddress(config, "StandardRentPriceOracle").toLowerCase()) ok("rentPriceOracle == StandardRentPriceOracle");
  else bad(`rentPriceOracle ${oracle} != config StandardRentPriceOracle`);
  const [minCommit, maxCommit, minRegister] = await Promise.all([read("MIN_COMMITMENT_AGE"), read("MAX_COMMITMENT_AGE"), read("MIN_REGISTER_DURATION")]);
  info(`MIN_COMMITMENT_AGE ${minCommit}s · MAX_COMMITMENT_AGE ${maxCommit}s · MIN_REGISTER_DURATION ${minRegister}s (${Number(minRegister) / 86400} d)`);
  const usdc = ensAddress(config, "MockUSDC");
  const [symbol, decimals] = await Promise.all([
    client.readContract({ address: usdc, abi: erc20Abi, functionName: "symbol" }),
    client.readContract({ address: usdc, abi: erc20Abi, functionName: "decimals" }),
  ]);
  ok(`MockUSDC (registration payment token): ${symbol}, ${decimals} decimals — free to mint`);

  // Optional: `pnpm run ens:verify --label a b c` checks candidate team labels; else the configured one.
  const argv = process.argv.slice(2);
  const candidates = argv.includes("--label") ? argv.slice(argv.indexOf("--label") + 1) : config.app.ens.teamLabel ? [config.app.ens.teamLabel] : [];
  if (!candidates.length) info("ens.teamLabel not set in config/app.json (pass --label <a> <b> to check candidates)");
  for (const label of candidates) {
    const available = (await read("isAvailable", [label])) as boolean;
    info(`team label "${label}.eth": ${available ? "AVAILABLE" : "taken (or already ours: check ownership)"}`);
  }

  console.log(`\n${failures ? `✗ ${failures} failure(s)` : "✓ all ENSv2 deployments verified on chain"}`);
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
