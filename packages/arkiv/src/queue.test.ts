import { describe, expect, it } from "vitest";
import { SignerQueue } from "./queue";

const tick = () => new Promise<void>((r) => setTimeout(r, 5));

describe("SignerQueue", () => {
  it("runs jobs for one signer strictly one after another, in submission order", async () => {
    const q = new SignerQueue();
    const log: string[] = [];
    const job = (name: string) => async () => {
      log.push(`start ${name}`);
      await tick();
      log.push(`end ${name}`);
      return name;
    };
    const results = await Promise.all([q.run("0xaa", job("a")), q.run("0xaa", job("b")), q.run("0xaa", job("c"))]);
    expect(results).toEqual(["a", "b", "c"]);
    expect(log).toEqual(["start a", "end a", "start b", "end b", "start c", "end c"]);
  });

  it("does not block different signers on each other", async () => {
    const q = new SignerQueue();
    const log: string[] = [];
    const job = (name: string) => async () => {
      log.push(`start ${name}`);
      await tick();
      log.push(`end ${name}`);
    };
    await Promise.all([q.run("0xaa", job("a")), q.run("0xbb", job("b"))]);
    expect(log.slice(0, 2)).toEqual(["start a", "start b"]);
  });

  it("treats signer addresses case-insensitively", async () => {
    const q = new SignerQueue();
    const log: string[] = [];
    const job = (name: string) => async () => { log.push(`start ${name}`); await tick(); log.push(`end ${name}`); };
    await Promise.all([q.run("0xAbC", job("a")), q.run("0xabc", job("b"))]);
    expect(log).toEqual(["start a", "end a", "start b", "end b"]);
  });

  it("keeps going after a failed job and still reports the failure to its caller", async () => {
    const q = new SignerQueue();
    const failed = q.run("0xaa", async () => { throw new Error("boom"); });
    const next = q.run("0xaa", async () => "ok");
    await expect(failed).rejects.toThrow("boom");
    await expect(next).resolves.toBe("ok");
  });
});
