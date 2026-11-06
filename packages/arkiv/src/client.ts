import { createPublicClient as createArkivPublicClient } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { createPublicClient, http, type Hex, type PublicClient } from "viem";
import { redactUrls } from "@supabrain/shared";
import type { ArkivChainPort } from "./guarded-send";

/** The SDK client (entity queries, watchEntityEvents, predictEntityKeys). */
export type ArkivReadClient = ReturnType<typeof makeArkivClient>;

export interface ArkivConnection {
  /** SDK client for entity reads. */
  arkiv: ArkivReadClient;
  /** Plain viem client on the same chain for raw RPC (nonce, gas, balance, receipts, raw send). */
  rpc: PublicClient;
}

// Reads are safe to retry. Writes never go through http() retries (viem sends raw transactions with retries off).
const transport = () => http(undefined, { timeout: 15_000, retryCount: 2 });
function makeArkivClient(accessKey: string) {
  return createArkivPublicClient({ chain: rabdi({ accessKey }), transport: transport() });
}

/**
 * Connect to Rabdi with the access key in the RPC path (the SDK's rabdi() does that). The key is a secret:
 * server-side only, never logged. Fails closed if eth_chainId is not the configured Rabdi chain.
 */
export async function connectArkiv(p: { accessKey: string; expectedChainId: number }): Promise<ArkivConnection> {
  if (!p.accessKey) throw new Error("ARKIV_ACCESS_KEY is required (the keyless RPC is rate limited). Get one at the Hub and put it in .env.local");
  const arkiv = makeArkivClient(p.accessKey);
  const rpc = createPublicClient({ chain: rabdi({ accessKey: p.accessKey }), transport: transport() }) as PublicClient;
  try {
    const id = await rpc.getChainId();
    if (id !== p.expectedChainId) throw new Error(`eth_chainId ${id} != configured ${p.expectedChainId}`);
  } catch (e) {
    throw new Error(`Arkiv RPC check failed: ${redactUrls(e instanceof Error ? e.message : String(e))}`);
  }
  return { arkiv, rpc };
}

/** The registry the SDK sends every write to must have code, or the configured address is wrong. */
export async function registryHasCode(rpc: PublicClient, registry: Hex): Promise<boolean> {
  const code = await rpc.getCode({ address: registry });
  return code !== undefined && code !== "0x";
}

/** viem adapter for the guarded send. State reads are at "latest": Rabdi serves state at the chain head only. */
export function viemPort(rpc: PublicClient): ArkivChainPort {
  return {
    chainId: () => rpc.getChainId(),
    nonce: (address) => rpc.getTransactionCount({ address, blockTag: "latest" }),
    blockGasLimit: async () => (await rpc.getBlock({ blockTag: "latest", includeTransactions: false })).gasLimit,
    balance: (address) => rpc.getBalance({ address, blockTag: "latest" }),
    estimateGas: ({ from, to, data }) => rpc.estimateGas({ account: from, to, data, blockTag: "latest" }),
    sendRaw: (serializedTransaction) => rpc.sendRawTransaction({ serializedTransaction }),
  };
}
