// Shared helpers for scripts: chain + clients built from config/*.json and env. Nothing hard-coded.
import { createPublicClient, http, type Chain, type PublicClient } from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { redactUrls, type AppConfig } from "@supabrain/shared";
import { ensAddress, sepoliaChain } from "@supabrain/ens";
export { ensAddress, sepoliaChain };
import { requireEnv } from "@supabrain/shared/config";

export type Hex = `0x${string}`;

/** Sepolia public client. Verifies eth_chainId against config first (fail closed). */
export async function sepoliaClient(config: AppConfig): Promise<{ client: PublicClient; chain: Chain; rpcUrl: string }> {
  const rpcUrl = requireEnv(config.networks.sepolia.rpcEnv);
  const chain = sepoliaChain(config, rpcUrl);
  const client = createPublicClient({ chain, transport: http(rpcUrl) }) as PublicClient;
  try {
    const id = await client.getChainId();
    if (id !== config.networks.sepolia.chainId) throw new Error(`eth_chainId ${id} != config ${config.networks.sepolia.chainId}`);
  } catch (e) {
    throw new Error(`Sepolia RPC check failed: ${redactUrls(e instanceof Error ? e.message : String(e))}`);
  }
  return { client, chain, rpcUrl };
}

export function accountFromEnv(name: string): PrivateKeyAccount {
  return privateKeyToAccount(requireEnv(name) as Hex);
}

export function txUrl(config: AppConfig, hash: string): string {
  return config.networks.sepolia.explorer.tx.replace("{hash}", hash);
}
export function addressUrl(config: AppConfig, address: string): string {
  return config.networks.sepolia.explorer.address.replace("{address}", address);
}
