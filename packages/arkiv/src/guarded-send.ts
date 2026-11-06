import { decodeFunctionData, getAddress, keccak256, parseAbi, type Hex } from "viem";
import { ArkivWriteError, describeError, revertDataOf } from "./errors";
import { arkivGas } from "./gas";

const EXECUTE_ABI = parseAbi(["function execute((uint8 operation, bytes operationData)[] ops) external returns (bytes32[] keys)"]);

/** The few chain reads/writes the safety rules need. A seam so every rule is unit-tested without a network. */
export interface ArkivChainPort {
  chainId(): Promise<number>;
  nonce(address: Hex): Promise<number>;            // at "latest": Rabdi serves state at the head only
  blockGasLimit(): Promise<bigint>;
  balance(address: Hex): Promise<bigint>;
  estimateGas(call: { from: Hex; to: Hex; data: Hex }): Promise<bigint>; // throws if the batch would revert
  /** eth_call: used only to recover revert data, because Rabdi's eth_estimateGas reports "Execution error without revert data". */
  call(call: { from: Hex; to: Hex; data: Hex }): Promise<unknown>;
  sendRaw(serialized: Hex): Promise<Hex>;
}

export interface LegacyTx { type: "legacy"; chainId: number; to: Hex; data: Hex; value: 0n; gas: bigint; gasPrice: bigint; nonce: number }
export interface TxSigner { address: Hex; signTransaction(tx: LegacyTx): Promise<Hex> }

/** What the SDK asks the wallet to send (nonce and gasPrice were set explicitly by the writer). */
export interface TxRequest { from: Hex; to: Hex; data: Hex; nonce: number; gasPrice: bigint }

/** `dryRun`: run every check and the estimate, then stop (DryRunStop) without signing or sending. */
export interface GuardedSendDeps { port: ArkivChainPort; signer: TxSigner; expectedChainId: number; registry: Hex; dryRun?: boolean }
export interface GasPlan { gas: bigint; estimate: bigint; ops: number; nonce: number; gasPrice: bigint; estimateMs: number }
export interface SendReport extends GasPlan { hash: Hex }

/** Thrown by a dry run instead of signing. Carries what the real run would have used. */
export class DryRunStop extends Error {
  constructor(readonly plan: GasPlan) {
    super("dry run: nothing was signed or sent");
    this.name = "DryRunStop";
  }
}

/**
 * Every Arkiv write passes through here before it is signed (MCP guides/quickstart, CLAUDE.md §5 write rules):
 * right chain, a plain execute() to the Arkiv registry from this signer, estimate first (a revert stops us before
 * anything is signed), gas = max(floor, 2×estimate) within half the block, wallet can pay the worst case, and the
 * nonce is still the one the request was built with. No automatic retry: an unknown outcome is reconciled by
 * reading the chain, never by sending again.
 */
export async function guardedSend(deps: GuardedSendDeps, req: TxRequest): Promise<SendReport> {
  const { port, signer, expectedChainId, registry } = deps;

  const chainId = await port.chainId();
  if (chainId !== expectedChainId) throw new ArkivWriteError("CHAIN_MISMATCH", `eth_chainId ${chainId} != configured ${expectedChainId}; refusing to sign`);

  if (getAddress(req.from) !== getAddress(signer.address) || getAddress(req.to) !== getAddress(registry)) {
    throw new ArkivWriteError("UNEXPECTED_TX", "request is not from the signer to the Arkiv registry; refusing to sign");
  }
  let ops: number;
  try {
    const decoded = decodeFunctionData({ abi: EXECUTE_ABI, data: req.data });
    ops = decoded.args[0].length;
  } catch {
    throw new ArkivWriteError("UNEXPECTED_TX", "calldata is not execute(ops); refusing to sign");
  }
  if (ops < 1) throw new ArkivWriteError("UNEXPECTED_TX", "empty batch; refusing to sign");

  const started = Date.now();
  let estimate: bigint;
  try {
    estimate = await port.estimateGas({ from: req.from, to: req.to, data: req.data });
  } catch (e) {
    let reason = describeError(e);
    if (!revertDataOf(e)) {
      // Rabdi's estimate carries no revert data; the same call through eth_call usually does.
      try { await port.call({ from: req.from, to: req.to, data: req.data }); }
      catch (c) { if (revertDataOf(c)) reason = describeError(c); }
    }
    throw new ArkivWriteError("ESTIMATE_FAILED", `batch would revert: ${reason} (nothing was signed)`);
  }
  const estimateMs = Date.now() - started;

  const gas = arkivGas({ ops, estimate, blockGasLimit: await port.blockGasLimit() });
  if ((await port.balance(req.from)) < gas * req.gasPrice) {
    throw new ArkivWriteError("INSUFFICIENT_FUNDS", `wallet cannot cover the worst case (${gas} gas × ${req.gasPrice} wei)`);
  }
  const latestNonce = await port.nonce(req.from);
  if (latestNonce !== req.nonce) {
    throw new ArkivWriteError("NONCE_CHANGED", `signer nonce moved ${req.nonce} -> ${latestNonce} since the request was built; not signing`);
  }

  const plan: GasPlan = { gas, estimate, ops, nonce: req.nonce, gasPrice: req.gasPrice, estimateMs };
  if (deps.dryRun) throw new DryRunStop(plan);

  const serialized = await signer.signTransaction({
    type: "legacy", chainId, to: req.to, data: req.data, value: 0n, gas, gasPrice: req.gasPrice, nonce: req.nonce,
  });
  const expectedHash = keccak256(serialized);

  let hash: Hex;
  try {
    hash = await port.sendRaw(serialized);
  } catch (e) {
    throw new ArkivWriteError("SEND_FAILED", `submission outcome unknown (${describeError(e)}); check the chain before any new write, do not resend`);
  }
  if (hash.toLowerCase() !== expectedHash.toLowerCase()) {
    throw new ArkivWriteError("HASH_MISMATCH", "the node returned a different transaction hash than the one signed; investigate before any new write");
  }
  return { ...plan, hash };
}
