// Thin, typed BrainVault client. Every write is simulated first, so a revert surfaces as the contract's own error
// name (RootRevoked, AgentNotRegistered, …) instead of a mined failure, and writes are serialised per signer.
import { BaseError, ContractFunctionRevertedError, type Account, type Chain, type PublicClient, type Transport, type WalletClient } from "viem";
import { brainVaultAbi } from "./abi";
import type { VaultPayment } from "./attestation";

type Hex = `0x${string}`;
type Signer = WalletClient<Transport, Chain | undefined, Account>;

export class VaultRevert extends Error {
  constructor(readonly errorName: string, readonly args: readonly unknown[] = []) {
    super(`BrainVault reverted: ${errorName}${args.length ? `(${args.map(String).join(", ")})` : ""}`);
    this.name = "VaultRevert";
  }
}

export interface VaultTx {
  hash: Hex;
  txUrl: string;
}

export interface VaultClient {
  readonly address: Hex;
  spentToday(wallet: Hex): Promise<bigint>;
  isRootRevoked(root: Hex): Promise<boolean>;
  isIntentUsed(intentId: Hex): Promise<boolean>;
  policySigner(): Promise<Hex>;
  pay(agent: Signer, p: VaultPayment, signature: Hex): Promise<VaultTx>;
  revokeRoot(by: Signer, root: Hex): Promise<VaultTx>;
  pauseAgent(by: Signer, wallet: Hex): Promise<VaultTx>;
  cancelIntent(by: Signer, intentId: Hex): Promise<VaultTx>;
}

function decodeRevert(e: unknown): never {
  if (e instanceof BaseError) {
    const r = e.walk((x) => x instanceof ContractFunctionRevertedError);
    if (r instanceof ContractFunctionRevertedError && r.data?.errorName) throw new VaultRevert(r.data.errorName, r.data.args ?? []);
  }
  throw e;
}

export function createVaultClient(deps: { publicClient: PublicClient; address: Hex; txUrl: (hash: Hex) => string }): VaultClient {
  const { publicClient, address } = deps;
  const queues = new Map<string, Promise<unknown>>();

  // one in-flight write per signer (nonce safety)
  function serial<T>(signer: Hex, fn: () => Promise<T>): Promise<T> {
    const key = signer.toLowerCase();
    const prev = queues.get(key) ?? Promise.resolve();
    const next = prev.catch(() => undefined).then(fn);
    queues.set(key, next);
    return next;
  }

  async function write(by: Signer, functionName: string, args: readonly unknown[]): Promise<VaultTx> {
    return serial(by.account.address, async () => {
      let request;
      try {
        ({ request } = await publicClient.simulateContract({
          address, abi: brainVaultAbi, functionName: functionName as never, args: args as never, account: by.account,
        }));
      } catch (e) {
        decodeRevert(e);
      }
      const hash = await by.writeContract(request as never);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new VaultRevert("TransactionReverted", [hash]);
      return { hash, txUrl: deps.txUrl(hash) };
    });
  }

  const read = <T>(functionName: string, args: readonly unknown[] = []) =>
    publicClient.readContract({ address, abi: brainVaultAbi, functionName: functionName as never, args: args as never }) as Promise<T>;

  return {
    address,
    spentToday: (wallet) => read<bigint>("spentToday", [wallet]),
    isRootRevoked: (root) => read<boolean>("revokedRoot", [root]),
    isIntentUsed: (id) => read<boolean>("usedIntent", [id]),
    policySigner: () => read<Hex>("policySigner"),
    pay: (agent, p, signature) => write(agent, "pay", [p, signature]),
    revokeRoot: (by, root) => write(by, "revokeRoot", [root]),
    pauseAgent: (by, wallet) => write(by, "pauseAgent", [wallet]),
    cancelIntent: (by, intentId) => write(by, "cancelIntent", [intentId]),
  };
}
