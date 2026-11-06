// EnsChain over a viem PublicClient: registry reads + the Universal Resolver (viem getEnsAddress / getEnsText).
// The client's chain must carry the ENSv2 Universal Resolver (see scripts/lib/chain.ts sepoliaChain).
import type { PublicClient } from "viem";
import { userRegistryAbi } from "./abis";
import type { EnsChain } from "./authority";

/** Retry a read a couple of times: right after a write, a load-balanced RPC can fail one call (it still fails closed). */
async function retry<T>(f: () => Promise<T>, attempts: number, delayMs: number): Promise<T> {
  for (let i = 1; ; i++) {
    try { return await f(); }
    catch (e) { if (i >= attempts) throw e; await new Promise((r) => setTimeout(r, delayMs * i)); }
  }
}

export function createViemEnsChain(client: PublicClient, o: { attempts?: number; retryDelayMs?: number } = {}): EnsChain {
  const attempts = o.attempts ?? 3;
  const delay = o.retryDelayMs ?? 700;
  const r = <T>(f: () => Promise<T>) => retry(f, attempts, delay);
  return {
    async getOwner(registry, labelhash) {
      return r(async () => (await client.readContract({ address: registry, abi: userRegistryAbi, functionName: "getOwner", args: [labelhash] })) as `0x${string}`);
    },
    async getExpiry(registry, labelhash) {
      return r(async () => Number((await client.readContract({ address: registry, abi: userRegistryAbi, functionName: "getExpiry", args: [labelhash] })) as bigint));
    },
    async getEnsAddress(name) {
      return r(async () => (await client.getEnsAddress({ name })) ?? null);
    },
    async getEnsText(name, key) {
      return r(async () => (await client.getEnsText({ name, key })) ?? null);
    },
  };
}
