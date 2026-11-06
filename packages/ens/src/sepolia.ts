// The Sepolia chain object carrying the live ENSv2 Universal Resolver (config/ens.sepolia.json), shared by the server
// and scripts, so viem's getEnsAddress / getEnsText read the redeployed ENSv2 contracts. Nothing hard-coded.
import { createPublicClient, defineChain, http, type Chain, type PublicClient } from "viem";
import { redactUrls, type AppConfig } from "@supabrain/shared";

export function ensAddress(config: AppConfig, name: string): `0x${string}` {
  const a = config.ens.contracts[name];
  if (!a) throw new Error(`config/ens.sepolia.json has no contract "${name}"`);
  return a as `0x${string}`;
}

export function sepoliaChain(config: AppConfig, rpcUrl: string): Chain {
  const n = config.networks.sepolia;
  return defineChain({
    id: n.chainId,
    name: n.name,
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
    blockExplorers: { default: { name: "Etherscan", url: n.explorer.base } },
    contracts: { ensUniversalResolver: { address: ensAddress(config, "UpgradableUniversalResolverProxy") } },
    testnet: true,
  });
}

/** Sepolia public client; verifies eth_chainId against config first (fail closed). */
export async function connectSepolia(config: AppConfig, rpcUrl: string): Promise<PublicClient> {
  const client = createPublicClient({ chain: sepoliaChain(config, rpcUrl), transport: http(rpcUrl, { retryCount: 2, timeout: 15_000 }) }) as PublicClient;
  try {
    const id = await client.getChainId();
    if (id !== config.networks.sepolia.chainId) throw new Error(`eth_chainId ${id} != config ${config.networks.sepolia.chainId}`);
  } catch (e) {
    throw new Error(`Sepolia RPC check failed: ${redactUrls(e instanceof Error ? e.message : String(e))}`);
  }
  return client;
}
