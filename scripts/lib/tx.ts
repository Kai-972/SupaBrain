// Transaction runner for the deploy scripts. Dry run by default: every step prints its target, function,
// arguments and sender, and is simulated with eth_call where its preconditions already hold. `--yes` broadcasts.
// Gas: node estimate +25%; legacy gasPrice x2 (fees are tiny, underpricing is the real risk); explicit nonce.
import {
  BaseError, ContractFunctionRevertedError, createWalletClient, decodeErrorResult, encodeFunctionData, formatEther, http,
  type Abi, type Chain, type PublicClient, type TransactionReceipt,
} from "viem";
import type { PrivateKeyAccount } from "viem/accounts";
import { ensErrorsAbi } from "@supabrain/ens/abis";
import { redactUrls, type AppConfig } from "@supabrain/shared";
import { txUrl, type Hex } from "./chain";

export interface TxStep {
  id: string;
  title: string;
  address: Hex;
  target: string; // human name of the contract, for output
  abi: Abi;
  functionName: string;
  args: readonly unknown[];
  value?: bigint;
  /** false when the step only works after earlier steps (e.g. register after commit): skipped in dry runs only. */
  simulate?: boolean;
  /** Fixed gas limit. Used for deliberate-revert proofs, which must be mined (an estimate would fail first). */
  gas?: bigint;
  /** Deliberate-revert proof: a failed receipt is the expected outcome. */
  expectRevert?: boolean;
}

export interface StepResult {
  step: TxStep;
  ok: boolean; // matches expectation (success, or revert for expectRevert)
  hash?: Hex;
  url?: string;
  receipt?: TransactionReceipt;
  revert?: string; // decoded revert reason, if any
  simulated?: "ok" | "revert" | "skipped";
}

export const fmtArg = (v: unknown): string =>
  JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x), 0)!.replace(/"(0x[0-9a-fA-F]{66,})"/g, (_m, h: string) => `"${h.slice(0, 18)}…${h.slice(-6)}"`);

/** Decode a revert from a viem error (simulation or estimate), including errors from other ENS contracts. */
export function describeError(abi: Abi, e: unknown): string {
  if (e instanceof BaseError) {
    const reverted = e.walk((x) => x instanceof ContractFunctionRevertedError);
    if (reverted instanceof ContractFunctionRevertedError) {
      if (reverted.data) return `${reverted.data.errorName}(${(reverted.data.args ?? []).map(fmtArg).join(", ")})`;
      if (reverted.raw && reverted.raw !== "0x") {
        const d = decodeRevertData(reverted.raw);
        if (d) return d;
        return `unknown revert data ${reverted.raw.slice(0, 10)}`;
      }
      return reverted.reason ?? reverted.shortMessage;
    }
    return redactUrls(e.shortMessage);
  }
  return redactUrls(e instanceof Error ? e.message : String(e));
}

export function decodeRevertData(data: Hex): string | undefined {
  try {
    const d = decodeErrorResult({ abi: ensErrorsAbi, data });
    return `${d.errorName}(${(d.args ?? []).map(fmtArg).join(", ")})`;
  } catch {
    return undefined;
  }
}

export class Runner {
  /** Next nonce per sender, tracked locally: a lagging RPC node can report a stale count right after a mined tx. */
  private readonly nextNonce = new Map<string, number>();

  constructor(
    readonly config: AppConfig,
    readonly pub: PublicClient,
    readonly chain: Chain,
    readonly rpcUrl: string,
    readonly broadcast: boolean,
  ) {}

  /** Run one step as `account`. Prints the plan; simulates; broadcasts only when `this.broadcast`. */
  async run(account: PrivateKeyAccount, who: string, step: TxStep, index?: string): Promise<StepResult> {
    const { pub } = this;
    const tag = index ? `[${index}] ` : "";
    console.log(`\n${tag}${step.title}`);
    console.log(`    from  ${who} ${account.address}`);
    console.log(`    to    ${step.target} ${step.address}`);
    console.log(`    call  ${step.functionName}(${step.args.map(fmtArg).join(", ")})${step.value ? `  value ${formatEther(step.value)} ETH` : ""}`);

    let simulated: StepResult["simulated"] = "skipped";
    let simReason: string | undefined;
    let estimate: bigint | undefined;
    // When broadcasting, earlier steps are already mined, so even "depends on earlier steps" steps can be simulated.
    if (step.simulate !== false || this.broadcast) {
      try {
        // Public RPCs are load-balanced: right after a deploy a lagging node answers "returned no data" (no code
        // yet). That is not a revert; retry a few times before believing it.
        for (let attempt = 1; ; attempt++) {
          try {
            await pub.simulateContract({ account, address: step.address, abi: step.abi, functionName: step.functionName, args: step.args as unknown[], value: step.value });
            estimate = await pub.estimateContractGas({ account, address: step.address, abi: step.abi, functionName: step.functionName, args: step.args as unknown[], value: step.value });
            break;
          } catch (e) {
            const lagging = e instanceof Error && /returned no data/.test(e.message);
            if (!lagging || attempt >= 5) throw e;
            await new Promise((r) => setTimeout(r, 3_000));
          }
        }
        simulated = "ok";
        console.log(`    sim   ok (gas estimate ${estimate})`);
      } catch (e) {
        simulated = "revert";
        const why = describeError(step.abi, e);
        simReason = why;
        console.log(`    sim   REVERT ${why}${step.expectRevert ? "  (expected for this proof)" : ""}`);
        if (!step.expectRevert) return { step, ok: false, revert: why, simulated };
      }
    } else {
      console.log(`    sim   skipped (depends on earlier steps)`);
    }

    if (!this.broadcast) return { step, ok: true, simulated };

    const gas = step.gas ?? (estimate !== undefined ? (estimate * 125n) / 100n : undefined);
    if (gas === undefined) throw new Error(`${step.id}: no gas limit (simulation skipped or failed and no fixed gas set)`);
    const gasPrice = (await pub.getGasPrice()) * 2n;
    const fetched = await pub.getTransactionCount({ address: account.address, blockTag: "latest" });
    const nonce = Math.max(fetched, this.nextNonce.get(account.address) ?? 0);
    const wallet = createWalletClient({ account, chain: this.chain, transport: http(this.rpcUrl) });
    const hash = await wallet.writeContract({
      address: step.address, abi: step.abi, functionName: step.functionName, args: step.args as unknown[],
      value: step.value, gas, gasPrice, nonce, chain: this.chain,
    });
    this.nextNonce.set(account.address, nonce + 1);
    const receipt = await pub.waitForTransactionReceipt({ hash, timeout: 180_000 });
    const url = txUrl(this.config, hash);
    const success = receipt.status === "success";
    let revert: string | undefined;
    if (!success) {
      // Re-run the call at the parent block to recover the revert reason (receipts carry none).
      try {
        await pub.call({
          account, to: step.address, value: step.value, blockNumber: receipt.blockNumber - 1n,
          data: encodeFunctionData({ abi: step.abi, functionName: step.functionName, args: step.args as unknown[] }),
        });
      } catch (e) {
        revert = describeError(step.abi, e);
      }
      // Receipts carry no reason and a re-run can be generic; the pre-flight simulation usually decoded it.
      if ((!revert || /unknown reason/.test(revert)) && simReason) revert = simReason;
    }
    const ok = step.expectRevert ? !success : success;
    console.log(`    ${ok ? "✓" : "✗"} ${success ? "mined" : "mined, REVERTED"}${revert ? ` (${revert})` : ""}  gas ${receipt.gasUsed}  ${url}`);
    return { step, ok, hash, url, receipt, revert, simulated };
  }
}

export function requireOk(r: StepResult): StepResult {
  if (!r.ok) throw new Error(`step "${r.step.id}" failed${r.revert ? `: ${r.revert}` : ""}`);
  return r;
}

/**
 * Run a read pinned to `blockNumber`, retrying while a lagging node says it has not seen that block yet.
 * Public RPCs are load-balanced: an unpinned read right after a mined tx can return pre-tx state.
 */
export async function readAt<T>(blockNumber: bigint, read: (blockNumber: bigint) => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await read(blockNumber);
    } catch (e) {
      const behind = e instanceof Error && /not found|header|returned no data|unknown block|too new|missing trie/i.test(e.message);
      if (!behind || attempt >= 8) throw e;
      await new Promise((r) => setTimeout(r, 2_500));
    }
  }
}
