// Shared helpers for scripts: chain + clients built from config/*.json and env. Nothing hard-coded.
import { createPublicClient, defineChain, http, type Chain, type PublicClient } from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { redactUrls, type AppConfig } from "@supabrain/shared";
import { requireEnv } from "@supabrain/shared/config";

export type Hex = `0x${string}`;

export function sepoliaChain(config: AppConfig, rpcUrl: string): Chain {
  const n = config.networks.sepolia;
  return defineChain({
    id: n.chainId,
    name: n.name,
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
    blockExplorers: { default: { name: "Etherscan", url: n.explorer.base } },
    contracts: {
      // ENSv2 Universal Resolver proxy (config/ens.sepolia.json) so viem's ENS actions use the live deployment.
      ensUniversalResolver: { address: ensAddress(config, "UpgradableUniversalResolverProxy") },
    },
    testnet: true,
  });
}

export function ensAddress(config: AppConfig, name: string): Hex {
  const a = config.ens.contracts[name];
  if (!a) throw new Error(`config/ens.sepolia.json has no contract "${name}"`);
  return a as Hex;
}

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
