import { ArkivWriteError } from "./errors";

// Rabdi write-safety rule (Arkiv MCP guides/quickstart, SDK 1.0.1): the node's estimate can be too small, so
//   gas = max(1_000_000 + 400_000 × (ops − 1), 2 × estimate)   and   gas <= block gas limit / 2.
// Stop (never guess) when the estimate fails or either bound cannot be met.
const FLOOR_BASE = 1_000_000n;
const FLOOR_PER_EXTRA_OP = 400_000n;

export function arkivGas(p: { ops: number; estimate: bigint; blockGasLimit: bigint }): bigint {
  if (!Number.isInteger(p.ops) || p.ops < 1) throw new ArkivWriteError("OPS_INVALID", `batch must carry at least one operation, got ${p.ops}`);
  if (typeof p.estimate !== "bigint" || p.estimate <= 0n) throw new ArkivWriteError("ESTIMATE_INVALID", "gas estimate is not a positive number");
  const floor = FLOOR_BASE + FLOOR_PER_EXTRA_OP * BigInt(p.ops - 1);
  const doubled = p.estimate * 2n;
  const gas = doubled > floor ? doubled : floor;
  if (p.blockGasLimit <= 0n || gas * 2n > p.blockGasLimit) {
    throw new ArkivWriteError("GAS_LIMIT_EXCEEDED", `gas ${gas} exceeds half the block gas limit (${p.blockGasLimit}); split the batch`);
  }
  return gas;
}
