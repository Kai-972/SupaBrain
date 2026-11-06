// Shared setup for scripts/arkiv/*: config, Rabdi connection, wallets, one write queue, the --yes flag.
import { connectArkiv, createArkivWriter, registryHasCode, SignerQueue, type ArkivConnection, type ArkivWriter } from "@supabrain/arkiv";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { agentKeyEnvName, explorerLink, type AppConfig } from "@supabrain/shared";
import { loadConfig, requireEnv } from "@supabrain/shared/config";
import type { Hex } from "./chain";

export interface ArkivCtx {
  config: AppConfig;
  conn: ArkivConnection;
  accessKey: string;
  chainId: number;
  registry: Hex;
  /** `app` attribute written on every entity and filtered on every query */
  app: string;
  team: string;
  teamAccount: PrivateKeyAccount;
  agentAccount: (label: string) => PrivateKeyAccount;
  /** One writer per signer; all share one queue, so each wallet has exactly one write in flight. */
  writer: (account: PrivateKeyAccount) => ArkivWriter;
  /** Wallets whose entities we trust: configured agents + the team wallet. Always filter by these ($creator). */
  knownCreators: Record<string, Hex>;
  txUrl: (hash: string) => string;
  broadcast: boolean;
}

export const hasFlag = (name: string) => process.argv.includes(`--${name}`);
export const flagValue = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

export async function arkivContext(opts: { appSuffix?: string } = {}): Promise<ArkivCtx> {
  const config = loadConfig();
  const net = config.networks.rabdi;
  const accessKey = requireEnv("ARKIV_ACCESS_KEY");
  const conn = await connectArkiv({ accessKey, expectedChainId: net.chainId });
  if (!(await registryHasCode(conn.rpc, net.registry.address))) {
    console.log(`note: eth_getCode at the Arkiv registry ${net.registry.address} is empty (it is not a normal contract); writes are verified by simulating execute() instead`);
  }
  const queue = new SignerQueue();
  const teamAccount = privateKeyToAccount(requireEnv("TEAM_PRIVATE_KEY") as Hex);
  const agentAccount = (label: string) => privateKeyToAccount(requireEnv(agentKeyEnvName(label)) as Hex);

  // Known creators: the configured agents' wallets plus the team wallet.
  const knownCreators: Record<string, Hex> = { team: teamAccount.address };
  for (const a of config.app.agents) knownCreators[a.label] = agentAccount(a.label).address;

  const broadcast = hasFlag("yes");
  console.log(`${broadcast ? "BROADCAST" : "DRY RUN"} · ${net.name} (chain ${net.chainId})${broadcast ? "" : " · nothing is signed or sent without --yes"}`);
  return {
    config, conn, accessKey, chainId: net.chainId, registry: net.registry.address as Hex, broadcast,
    app: config.app.appNamespace + (opts.appSuffix ?? ""),
    team: config.app.team.id,
    teamAccount, agentAccount, knownCreators,
    writer: (account) => createArkivWriter({ rpc: conn.rpc, account, accessKey, expectedChainId: net.chainId, registry: net.registry.address as Hex, queue }),
    txUrl: (hash) => explorerLink(net.explorer.tx, { hash }),
  };
}
