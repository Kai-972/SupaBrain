// Shared setup for scripts/ens/*: config, Sepolia client, owner account, the --yes flag.
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { agentKeyEnvName, vendorKeyEnvName, type AppConfig } from "@supabrain/shared";
import { loadConfig, requireEnv } from "@supabrain/shared/config";
import { ensAddress, sepoliaClient, type Hex } from "./chain";
import { Runner } from "./tx";

export interface EnsCtx {
  config: AppConfig;
  runner: Runner;
  owner: PrivateKeyAccount;
  teamLabel: string;
  addr: (contract: string) => Hex;
  broadcast: boolean;
}

export const hasFlag = (name: string) => process.argv.includes(`--${name}`);
export const positional = () => process.argv.slice(2).filter((a, i, all) => !a.startsWith("--") && !(all[i - 1] ?? "").startsWith("--"));

export async function ensContext(): Promise<EnsCtx> {
  const config = loadConfig();
  const teamLabel = config.app.ens.teamLabel;
  if (!teamLabel) throw new Error("config/app.json ens.teamLabel is not set");
  const { client, chain, rpcUrl } = await sepoliaClient(config);
  const broadcast = hasFlag("yes");
  console.log(`${broadcast ? "BROADCAST" : "DRY RUN"} · ${chain.name} (chain ${chain.id}) · team ${teamLabel}.eth${broadcast ? "" : " · nothing is sent without --yes"}`);
  return {
    config, teamLabel, broadcast,
    runner: new Runner(config, client, chain, rpcUrl, broadcast),
    owner: privateKeyToAccount(requireEnv("OWNER_PRIVATE_KEY") as Hex),
    addr: (c) => ensAddress(config, c),
  };
}

/** Key env name for an agent (configured or throwaway) or vendor label. */
export function walletFor(config: AppConfig, label: string): { env: string; account: PrivateKeyAccount; kind: "agent" | "vendor" } {
  const isVendor = config.app.vendors.some((v) => v.label === label);
  const env = isVendor ? vendorKeyEnvName(label) : agentKeyEnvName(label);
  return { env, kind: isVendor ? "vendor" : "agent", account: privateKeyToAccount(requireEnv(env) as Hex) };
}
