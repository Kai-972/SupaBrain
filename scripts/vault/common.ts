// Shared setup for scripts/vault/* (Lane B). Dry run by default; `--yes` broadcasts (ASK "go" first, CLAUDE.md §3.5).
// Everything comes from config/*.json, config/deployments/*.json and env. Prints addresses only, never keys.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import type { Abi } from "viem";
import { agentKeyEnvName, type AppConfig } from "@supabrain/shared";
import { findRootDir, loadConfig, requireEnv } from "@supabrain/shared/config";
import { sepoliaClient, type Hex } from "../lib/chain";
import { Runner } from "../lib/tx";
import { readEnsDeployment } from "../lib/deployments";
import { brainVaultAbi } from "../../packages/payments/src/vault/abi";
import { VaultDeploymentSchema, type VaultDeployment } from "../../packages/payments/src/runtime";

export { brainVaultAbi };
export const hasFlag = (name: string) => process.argv.includes(`--${name}`);
export const optValue = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

const root = () => findRootDir();
const vaultFile = () => join(root(), "config", "deployments", "vault.sepolia.json");

export function readVaultDeployment(): VaultDeployment | null {
  return existsSync(vaultFile()) ? VaultDeploymentSchema.parse(JSON.parse(readFileSync(vaultFile(), "utf8"))) : null;
}

/** Write only after a confirmed broadcast. Extra proof fields (txUrl) are kept in the file. */
export function writeVaultDeployment(d: VaultDeployment & Record<string, unknown>): void {
  VaultDeploymentSchema.parse(d);
  writeFileSync(vaultFile(), JSON.stringify(d, null, 2) + "\n");
}

export function artifact(name: string): { abi: Abi; bytecode: Hex } {
  const f = join(root(), "contracts", "out", `${name}.sol`, `${name}.json`);
  if (!existsSync(f)) throw new Error(`missing ${f}: run \`forge build\` in contracts/ first`);
  const j = JSON.parse(readFileSync(f, "utf8"));
  return { abi: j.abi, bytecode: j.bytecode.object };
}

export interface VaultCtx {
  config: AppConfig;
  runner: Runner;
  broadcast: boolean;
  owner: () => PrivateKeyAccount;
  guardian: () => PrivateKeyAccount;
  policySigner: () => PrivateKeyAccount;
  agent: (label: string) => PrivateKeyAccount;
  ens: ReturnType<typeof readEnsDeployment>;
}

export async function vaultContext(): Promise<VaultCtx> {
  const config = loadConfig();
  const { client, chain, rpcUrl } = await sepoliaClient(config);
  const broadcast = hasFlag("yes");
  console.log(`${broadcast ? "BROADCAST" : "DRY RUN"} · ${chain.name} (chain ${chain.id})${broadcast ? "" : " · nothing is sent without --yes"}`);
  const key = (name: string) => () => privateKeyToAccount(requireEnv(name) as Hex);
  return {
    config,
    broadcast,
    runner: new Runner(config, client, chain, rpcUrl, broadcast),
    owner: key("OWNER_PRIVATE_KEY"),
    guardian: key("GUARDIAN_PRIVATE_KEY"),
    policySigner: key("POLICY_SIGNER_PRIVATE_KEY"),
    agent: (label) => privateKeyToAccount(requireEnv(agentKeyEnvName(label)) as Hex),
    ens: readEnsDeployment(config),
  };
}
