import { decodeErrorResult, parseAbi, type Hex } from "viem";
import { redactUrls } from "@supabrain/shared";

export type ArkivWriteErrorCode =
  | "CHAIN_MISMATCH"       // eth_chainId is not the configured Rabdi chain
  | "UNEXPECTED_TX"        // not a plain execute() to the Arkiv registry from the signer
  | "ESTIMATE_FAILED"      // the node says the batch would revert (nothing was signed)
  | "ESTIMATE_INVALID"
  | "OPS_INVALID"
  | "GAS_LIMIT_EXCEEDED"   // gas would exceed half the block gas limit
  | "INSUFFICIENT_FUNDS"
  | "NONCE_CHANGED"        // the signer's nonce moved since the request was built
  | "SEND_FAILED"          // outcome unknown: reconcile by reading the chain, never resend blindly
  | "HASH_MISMATCH"
  | "REVERTED"             // mined, but status != success
  | "REGISTRY_MISSING";    // no code at the configured registry address

/** Every Arkiv write failure. The message is already free of RPC URLs (the access key rides in the path). */
export class ArkivWriteError extends Error {
  constructor(readonly code: ArkivWriteErrorCode, message: string) {
    super(redactUrls(message));
    this.name = "ArkivWriteError";
  }
}

// Copied from @arkiv-network/sdk 1.0.1 src/utils/arkivTransactions.ts (the SDK does not export its decoder).
export const ARKIV_ERRORS_ABI = parseAbi([
  "error EmptyBatch()",
  "error InvalidOpType(uint8 operation)",
  "error NonCanonicalOperationData(uint8 operation)",
  "error AttributesNotSorted()",
  "error TooManyAttributes(uint256 count, uint256 maxCount)",
  "error EmptyMutations(bytes32 entityKey)",
  "error TombstoneInCreate(bytes32 name)",
  "error TombstoneValueNotEmpty(bytes32 name)",
  "error SystemAttributeNotWritable(bytes32 name)",
  "error InvalidValueType(bytes32 name, uint8 typeId)",
  "error Ident32Empty()",
  "error Ident32InvalidByte(uint256 position, bytes1 value)",
  "error EntityNotFound(bytes32 entityKey)",
  "error EntityExpired(bytes32 entityKey, uint64 expiresAt)",
  "error NotOwner(bytes32 entityKey, address caller, address owner)",
  "error ReadOnlyEntity(bytes32 entityKey)",
  "error ReservedCreationFlags(uint8 creationFlags)",
  "error ExpiryDeadOnArrival(uint64 target, uint64 currentBlock)",
  "error ExpiryBeyondMaxLifetime(uint64 target, uint64 currentBlock, uint64 maxLifetime)",
  "error ExpiryNotExtended(bytes32 entityKey, uint64 newExpiresAt, uint64 currentExpiresAt)",
  "error TransferToZeroAddress(bytes32 entityKey)",
  "error TransferToSelf(bytes32 entityKey)",
]);

/** Walk an error's cause chain for revert data (`data: 0x…`), the way viem nests it. */
export function revertDataOf(error: unknown): Hex | undefined {
  const seen = new Set<unknown>();
  for (let e: unknown = error; e && typeof e === "object" && !seen.has(e); e = (e as { cause?: unknown }).cause) {
    seen.add(e);
    const data = (e as { data?: unknown }).data;
    if (typeof data === "string" && /^0x[0-9a-fA-F]{8,}$/.test(data)) return data as Hex;
    const nested = (data as { data?: unknown } | undefined)?.data;
    if (typeof nested === "string" && /^0x[0-9a-fA-F]{8,}$/.test(nested)) return nested as Hex;
  }
  return undefined;
}

/** A short, URL-free description of a failure; names the Arkiv error when the node returned revert data. */
export function describeError(error: unknown): string {
  const data = revertDataOf(error);
  if (data) {
    try {
      const d = decodeErrorResult({ abi: ARKIV_ERRORS_ABI, data });
      return d.args && d.args.length > 0 ? `${d.errorName}(${d.args.map(String).join(", ")})` : `${d.errorName}()`;
    } catch { /* unknown selector: fall through to the message */ }
  }
  const msg = error instanceof Error ? ((error as { shortMessage?: string }).shortMessage ?? error.message) : String(error);
  return redactUrls(msg).split("\n")[0] ?? "unknown error";
}

/** Walk the cause chain for an instance of `ctor`. The SDK and viem wrap errors thrown from our guarded transport. */
export function findCause<T extends Error>(error: unknown, ctor: new (...args: never[]) => T): T | undefined {
  const seen = new Set<unknown>();
  for (let e: unknown = error; e && typeof e === "object" && !seen.has(e); e = (e as { cause?: unknown }).cause) {
    seen.add(e);
    if (e instanceof ctor) return e;
  }
  return undefined;
}
