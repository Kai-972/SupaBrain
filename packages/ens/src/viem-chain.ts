// EnsChain over a viem PublicClient: registry reads + the Universal Resolver (viem getEnsAddress / getEnsText).
// The client's chain must carry the ENSv2 Universal Resolver (see scripts/lib/chain.ts sepoliaChain).
import type { PublicClient } from "viem";
import { userRegistryAbi } from "./abis";
import type { EnsChain } from "./authority";

export function createViemEnsChain(client: PublicClient): EnsChain {
  return {
    async getOwner(registry, labelhash) {
      return (await client.readContract({ address: registry, abi: userRegistryAbi, functionName: "getOwner", args: [labelhash] })) as `0x${string}`;
    },
    async getExpiry(registry, labelhash) {
      return Number((await client.readContract({ address: registry, abi: userRegistryAbi, functionName: "getExpiry", args: [labelhash] })) as bigint);
    },
    async getEnsAddress(name) {
      return (await client.getEnsAddress({ name })) ?? null;
    },
    async getEnsText(name, key) {
      return (await client.getEnsText({ name, key })) ?? null;
    },
  };
}
