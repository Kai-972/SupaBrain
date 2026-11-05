// pnpm doctor — environment + chain health report (CLAUDE.md §5.4).
// Prints env NAMES and derived PUBLIC values only. Exits 1 on hard failures (invalid config, chain-ID mismatch,
// missing contract code); missing env is reported but not fatal, since each stage needs different secrets.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createPublicClient, erc20Abi, formatEther, formatUnits, http, type PublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { agentKeyEnvName, redactUrls, vendorKeyEnvName, type AppConfig } from "@supabrain/shared";
import { findRootDir, loadConfig } from "@supabrain/shared/config";

type Hex = `0x${string}`;
let hardFailures = 0;
const ok = (m: string) => console.log(`  ✓ ${m}`);
const bad = (m: string) => { hardFailures++; console.log(`  ✗ ${m}`); };
const warn = (m: string) => console.log(`  ! ${m}`);
const info = (m: string) => console.log(`  – ${m}`);
const errMsg = (e: unknown) => redactUrls(e instanceof Error ? e.message.split("\n")[0]! : String(e));

function section(title: string) {
  console.log(`\n${title}`);
}

function envNames(root: string, config: AppConfig): string[] {
  const fromExample = readFileSync(join(root, ".env.example"), "utf8")
    .split("\n")
    .map((l) => l.match(/^([A-Z0-9_]+)=/)?.[1])
    .filter((x): x is string => !!x);
  const derived = [...config.app.agents.map((a) => agentKeyEnvName(a.label)), ...config.app.vendors.map((v) => vendorKeyEnvName(v.label))];
  return [...new Set([...fromExample, ...derived])];
}

function derivedAccounts(config: AppConfig): { role: string; env: string; address: Hex }[] {
  const keys = [
    { role: "owner", env: "OWNER_PRIVATE_KEY" },
    { role: "team", env: "TEAM_PRIVATE_KEY" },
    ...config.app.agents.map((a) => ({ role: `agent ${a.label}`, env: agentKeyEnvName(a.label) })),
    ...config.app.vendors.map((v) => ({ role: `vendor ${v.label}`, env: vendorKeyEnvName(v.label) })),
    { role: "policy signer", env: "POLICY_SIGNER_PRIVATE_KEY" },
    { role: "guardian", env: "GUARDIAN_PRIVATE_KEY" },
  ];
  const out: { role: string; env: string; address: Hex }[] = [];
  for (const k of keys) {
    const v = process.env[k.env]?.trim();
    if (!v) continue;
    try {
      out.push({ ...k, address: privateKeyToAccount(v as Hex).address });
    } catch {
      bad(`${k.env} is set but is not a valid private key`);
    }
  }
  return out;
}

async function checkChain(name: string, client: PublicClient, expected: number): Promise<boolean> {
  try {
    const id = await client.getChainId();
    if (id !== expected) {
      bad(`${name} eth_chainId ${id} != config ${expected} (fail closed)`);
      return false;
    }
    ok(`${name} eth_chainId ${id} matches config`);
    return true;
  } catch (e) {
    bad(`${name} RPC unreachable: ${errMsg(e)}`);
    return false;
  }
}

async function main() {
  const root = findRootDir();
  console.log("Supabrain doctor");

  section("Config");
  let config: AppConfig;
  try {
    config = loadConfig();
    ok(`config/*.json valid (app=${config.app.appNamespace}, team=${config.app.team.id})`);
  } catch (e) {
    bad(errMsg(e));
    process.exit(1);
  }
  if (config.app.ens.teamLabel) ok(`team ENS label: ${config.app.ens.teamLabel}.eth`);
  else warn("ens.teamLabel not set (ASK in S1)");
  const ensContracts = Object.keys(config.ens.contracts);
  if (ensContracts.length) ok(`config/ens.sepolia.json: ${ensContracts.length} contracts (verified ${config.ens.verifiedAt ?? "never"})`);
  else warn("config/ens.sepolia.json has no contracts yet (S1)");
  info(`world.json: ${config.world ? "present" : "absent (Lane B, S4)"} · deployments: ens=${config.deployments.ens ? "yes" : "no"} vault=${config.deployments.vault ? "yes" : "no"}`);

  section("Env (.env.local / process env; names only)");
  const names = envNames(root, config);
  const present = names.filter((n) => process.env[n]?.trim());
  const missing = names.filter((n) => !process.env[n]?.trim());
  info(`present (${present.length}): ${present.join(", ") || "none"}`);
  info(`missing (${missing.length}): ${missing.join(", ") || "none"}`);

  section("Derived addresses");
  const accounts = derivedAccounts(config);
  if (!accounts.length) info("no private keys set yet (pnpm keys:new in S1, after an ASK)");
  for (const a of accounts) info(`${a.role.padEnd(22)} ${a.address}  (${a.env})`);

  section("Sepolia");
  const sepoliaUrl = process.env[config.networks.sepolia.rpcEnv]?.trim();
  if (!sepoliaUrl) warn(`${config.networks.sepolia.rpcEnv} not set: skipping Sepolia checks`);
  else {
    const sepolia = createPublicClient({ transport: http(sepoliaUrl) });
    if (await checkChain("Sepolia", sepolia, config.networks.sepolia.chainId)) {
      const usdc = config.tokens.usdc.address;
      try {
        const code = await sepolia.getCode({ address: usdc });
        if (!code || code === "0x") bad(`USDC ${usdc}: no code`);
        else {
          const decimals = await sepolia.readContract({ address: usdc, abi: erc20Abi, functionName: "decimals" });
          if (decimals === config.tokens.usdc.decimals) ok(`USDC ${usdc}: code present, decimals ${decimals}`);
          else bad(`USDC decimals ${decimals} != ${config.tokens.usdc.decimals}`);
        }
      } catch (e) {
        bad(`USDC check failed: ${errMsg(e)}`);
      }
      for (const [name, address] of Object.entries(config.ens.contracts)) {
        try {
          const code = await sepolia.getCode({ address });
          if (!code || code === "0x") bad(`ENS ${name} ${address}: no code`);
          else ok(`ENS ${name}: code present`);
        } catch (e) {
          bad(`ENS ${name}: ${errMsg(e)}`);
        }
      }
      for (const a of accounts) {
        try {
          info(`${a.role.padEnd(22)} ${formatEther(await sepolia.getBalance({ address: a.address }))} ETH`);
        } catch (e) {
          warn(`${a.role} balance: ${errMsg(e)}`);
        }
      }
      const vaultAddr = (config.deployments.vault as { address?: Hex } | null)?.address;
      if (vaultAddr) {
        try {
          const bal = await sepolia.readContract({ address: usdc, abi: erc20Abi, functionName: "balanceOf", args: [vaultAddr] });
          info(`vault ${vaultAddr} ${formatUnits(bal, config.tokens.usdc.decimals)} USDC`);
        } catch (e) {
          warn(`vault balance: ${errMsg(e)}`);
        }
      }
    }
  }

  section("Arkiv (Rabdi)");
  const rabdi = createPublicClient({ transport: http(config.networks.rabdi.rpc) });
  if (await checkChain("Rabdi (keyless RPC)", rabdi, config.networks.rabdi.chainId)) {
    for (const a of accounts.filter((x) => x.role === "team" || x.role.startsWith("agent"))) {
      try {
        info(`${a.role.padEnd(22)} ${formatEther(await rabdi.getBalance({ address: a.address }))} ${config.networks.rabdi.nativeSymbol}`);
      } catch (e) {
        warn(`${a.role} balance: ${errMsg(e)} (keyless RPC may rate-limit)`);
      }
    }
  }
  info(`ARKIV_ACCESS_KEY ${process.env.ARKIV_ACCESS_KEY?.trim() ? "set" : "not set"} (authenticated RPC check lands in S2)`);

  section("World");
  const issuer = config.world?.issuer;
  if (!issuer) info("no issuer in config/world.json yet (Lane B, S4)");
  else {
    try {
      const res = await fetch(new URL(".well-known/openid-configuration", issuer.endsWith("/") ? issuer : `${issuer}/`));
      const doc = (await res.json()) as { grant_types_supported?: string[] };
      const device = doc.grant_types_supported?.includes("urn:ietf:params:oauth:grant-type:device_code");
      if (res.ok) ok(`discovery reachable; device grant ${device ? "listed" : "NOT listed"}`);
      else bad(`discovery HTTP ${res.status}`);
    } catch (e) {
      bad(`discovery unreachable: ${errMsg(e)}`);
    }
  }

  console.log(`\n${hardFailures ? `✗ ${hardFailures} hard failure(s)` : "✓ no hard failures"}`);
  process.exit(hardFailures ? 1 : 0);
}

main().catch((e) => {
  console.error(`doctor crashed: ${errMsg(e)}`);
  process.exit(1);
});
