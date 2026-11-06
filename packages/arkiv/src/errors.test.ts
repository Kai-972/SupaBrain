import { describe, expect, it } from "vitest";
import { ArkivWriteError, findCause } from "./errors";

describe("findCause", () => {
  it("finds our own error inside wrappers (the SDK rewraps errors thrown from a custom transport)", () => {
    const ours = new ArkivWriteError("ESTIMATE_FAILED", "batch would revert: NotOwner(...)");
    const sdk = Object.assign(new Error("Transaction failed: Execution error without revert data"), { cause: Object.assign(new Error("viem"), { cause: ours }) });
    expect(findCause(sdk, ArkivWriteError)).toBe(ours);
  });

  it("returns undefined when absent, and survives cycles", () => {
    const a = new Error("a") as Error & { cause?: unknown };
    a.cause = a;
    expect(findCause(a, ArkivWriteError)).toBeUndefined();
    expect(findCause("not an error", ArkivWriteError)).toBeUndefined();
  });
});
