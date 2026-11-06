import { createWalletClient, type ExecuteBatchParameters } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { custom, type Hex, type PublicClient } from "viem";
import type { PrivateKeyAccount } from "viem/accounts";
import { ArkivWriteError, describeError } from "./errors";
import { guardedSend, type SendReport } from "./guarded-send";
import { viemPort } from "./client";
import { SignerQueue } from "./queue";

/** Placeholder gas handed to the SDK so it does not estimate on its own; the guarded send computes the real value. */
const SDK_GAS_PLACEHOLDER = 1_000_000n;

export interface BatchResult {
  txHash: Hex;
  createdEntities: Hex[];
  extendedEntities: Hex[];
  ownershipChanges: Hex[];
  blockNumber: bigint;
  gasUsed: bigint;
  gasLimit: bigint;
  estimate: bigint;
  ops: number;
  nonce: number;
  gasPrice: bigint;
  /** wall-clock: estimate round trip, and submit → receipt */
  estimateMs: number;
  totalMs: number;
}

export interface ArkivWriter {
  address: Hex;
  /** One atomic Arkiv transaction. Serialised per signer; never retried automatically. */
  executeBatch(params: ExecuteBatchParameters): Promise<BatchResult>;
}

/**
 * A writer for one signer wallet. The SDK builds and encodes the operations; the transaction is signed and sent
 * only by `guardedSend` (custom transport), so the write-safety rules cannot be bypassed by a caller.
 * Share one SignerQueue between writers so every signer has exactly one write in flight.
 */
export function createArkivWriter(p: {
  /** plain viem client on Rabdi (ArkivConnection.rpc) */
  rpc: PublicClient;
  account: PrivateKeyAccount;
  accessKey: string;
  expectedChainId: number;
  registry: Hex;
  queue?: SignerQueue;
}): ArkivWriter {
  const { rpc: publicClient, account, expectedChainId, registry } = p;
  const queue = p.queue ?? new SignerQueue();
  const port = viemPort(publicClient);
  const deps = {
    port,
    signer: { address: account.address as Hex, signTransaction: (tx: Parameters<typeof account.signTransaction>[0]) => account.signTransaction(tx) },
    expectedChainId,
    registry,
  };

  const state: { last?: SendReport } = {};
  // read through a function: TypeScript otherwise narrows `state.last` to undefined after the reset below
  const lastReport = (): SendReport | undefined => state.last;
  const wallet = createWalletClient({
    chain: rabdi({ accessKey: p.accessKey }),
    account: account.address,
    transport: custom(
      {
        async request({ method, params }) {
          if (method !== "eth_sendTransaction") return publicClient.request({ method, params } as never);
          const [tx] = params as [{ from: Hex; to: Hex; data: Hex; nonce: Hex | number; gasPrice: Hex | bigint }];
          const report = await guardedSend(deps, {
            from: tx.from, to: tx.to, data: tx.data, nonce: Number(tx.nonce), gasPrice: BigInt(tx.gasPrice),
          });
          state.last = report;
          return report.hash;
        },
      },
      { retryCount: 0 },
    ),
  });

  return {
    address: account.address as Hex,
    executeBatch: (params) =>
      queue.run(account.address, async () => {
        const t0 = Date.now();
        state.last = undefined;
        const nonce = await publicClient.getTransactionCount({ address: account.address, blockTag: "latest" });
        const gasPrice = await publicClient.getGasPrice();
        let res;
        try {
          res = await wallet.executeBatch(params, { nonce, gasPrice, gas: SDK_GAS_PLACEHOLDER });
        } catch (e) {
          if (e instanceof ArkivWriteError) throw e;
          const hash = lastReport()?.hash;
          throw new ArkivWriteError(
            hash ? "REVERTED" : "SEND_FAILED",
            `${hash ? `tx ${hash} did not succeed` : "batch was not sent"}: ${describeError(e)}`,
          );
        }
        const receipt = await publicClient.getTransactionReceipt({ hash: res.txHash });
        if (receipt.status !== "success") throw new ArkivWriteError("REVERTED", `tx ${res.txHash} reverted`);
        const last = lastReport();
        if (!last) throw new ArkivWriteError("HASH_MISMATCH", "batch confirmed but the guarded send did not run; investigate");
        return {
          txHash: res.txHash,
          createdEntities: res.createdEntities,
          extendedEntities: res.extendedEntities,
          ownershipChanges: res.ownershipChanges,
          blockNumber: receipt.blockNumber,
          gasUsed: receipt.gasUsed,
          gasLimit: last.gas,
          estimate: last.estimate,
          ops: last.ops,
          nonce: last.nonce,
          gasPrice: last.gasPrice,
          estimateMs: last.estimateMs,
          totalMs: Date.now() - t0,
        };
      }),
  };
}
