// v2 B3: the server's ENS rules writer (docs/PLAN.md §3.4). Rules are text records on each AI's own resolver; the
// website's Rules form changes them through the server's team key. Authority check: tests first, with a fake chain.
import { decodeFunctionData, type Hex } from "viem";
import { describe, expect, it } from "vitest";
import { permissionedResolverAbi } from "./abis";
import { dnsEncode } from "./names";
import { RulesError, createRulesWriter, validateRules, type RulesChainIO } from "./rules";

const KEYS = { status: "sb.status", scope: "sb.scope", writeDaily: "sb.write.daily", role: "sb.role" };
const NAME = "gemini.otter.supabrain.eth";
const RESOLVER = "0x45dcbD9755d51747416aB52287aA7Eb6520e69Ca" as const;
const HASH = `0x${"ab".repeat(32)}` as Hex;

function fakeChain(o: { texts?: Record<string, string>; resolver?: Hex | null; status?: "success" | "reverted" } = {}) {
  const texts: Record<string, string> = { "sb.status": "active", "sb.scope": "*", "sb.write.daily": "200", "sb.role": "worker", ...o.texts };
  const log: string[] = [];
  const sent: { resolver: Hex; calls: Hex[] }[] = [];
  const reads: { key: string; atLeastBlock?: bigint }[] = [];
  let block = 100n;
  let n = 0;
  const io: RulesChainIO = {
    async findResolver(name) { log.push(`find ${name}`); return o.resolver === undefined ? RESOLVER : o.resolver; },
    async getText(_name, key, atLeastBlock) { reads.push({ key, atLeastBlock }); return texts[key] ?? null; },
    async send(resolver, calls) { log.push(`send ${++n}`); sent.push({ resolver, calls }); return HASH; },
    async waitForReceipt() {
      await new Promise((r) => setTimeout(r, 5));
      log.push(`receipt ${n}`);
      block += 1n;
      if ((o.status ?? "success") === "success") for (const s of sent.at(-1)!.calls) { const d = decodeFunctionData({ abi: permissionedResolverAbi, data: s }); texts[d.args![1] as string] = d.args![2] as string; }
      return { status: o.status ?? "success", blockNumber: block };
    },
  };
  return { io, log, sent, reads, texts };
}

const writer = (io: RulesChainIO) => createRulesWriter({ keys: KEYS, parentName: "supabrain.eth", txUrl: (h) => `explorer/tx/${h}`, io });
const decoded = (data: Hex) => decodeFunctionData({ abi: permissionedResolverAbi, data });

describe("validateRules", () => {
  it("accepts the four rules and normalises the write limit", () => {
    expect(validateRules({ status: "paused", scope: "src/app/", writeDaily: 50, role: "lead" })).toEqual({ status: "paused", scope: "src/app/", writeDaily: "50", role: "lead" });
    expect(validateRules({ writeDaily: "007" })).toEqual({ writeDaily: "7" });
    expect(validateRules({ scope: "*" })).toEqual({ scope: "*" });
  });

  it.each([
    [{ status: "stopped" }, /status/],
    [{ scope: "../etc" }, /scope/],
    [{ scope: "/abs/path" }, /scope/],
    [{ scope: "src/*" }, /scope/],
    [{ scope: "" }, /scope/],
    [{ writeDaily: -1 }, /writeDaily/],
    [{ writeDaily: "1.5" }, /writeDaily/],
    [{ writeDaily: "lots" }, /writeDaily/],
    [{ writeDaily: 100_001 }, /writeDaily/],
    [{ role: "owner" }, /role/],
    [{ payCap: "1000" }, /unknown rule/],
    [{}, /nothing to change/],
  ])("refuses %j", (patch, why) => {
    expect(() => validateRules(patch as never)).toThrow(why);
  });
});

describe("createRulesWriter.setRules", () => {
  it("looks the resolver up live, writes only changed keys in one multicall, waits for the receipt", async () => {
    const c = fakeChain();
    const r = await writer(c.io).setRules(NAME, { status: "paused", scope: "*", writeDaily: "200" });
    expect(c.log).toEqual([`find ${NAME}`, "send 1", "receipt 1"]);
    expect(c.sent).toHaveLength(1);
    expect(c.sent[0]!.resolver).toBe(RESOLVER);
    expect(c.sent[0]!.calls.map((x) => decoded(x).args)).toEqual([[dnsEncode(NAME), "sb.status", "paused"]]); // DNS-encoded name, only the changed key
    expect(r).toEqual({ txHash: HASH, txUrl: `explorer/tx/${HASH}`, changed: { status: { from: "active", to: "paused" } } });
  });

  it("nothing changed → no transaction", async () => {
    const c = fakeChain();
    const r = await writer(c.io).setRules(NAME, { status: "active", role: "worker" });
    expect(c.sent).toHaveLength(0);
    expect(r).toEqual({ txHash: null, txUrl: null, changed: {} });
  });

  it("an unset record counts as changed", async () => {
    const c = fakeChain({ texts: { "sb.write.daily": "" } });
    delete c.texts["sb.write.daily"];
    const r = await writer(c.io).setRules(NAME, { writeDaily: 20 });
    expect(r.changed).toEqual({ writeDaily: { from: null, to: "20" } });
  });

  it("refuses a name outside the team, or the team name itself, before touching the chain", async () => {
    const c = fakeChain();
    await expect(writer(c.io).setRules("claude.otter.evil.eth", { status: "paused" })).rejects.toMatchObject({ code: "NOT_OURS" });
    await expect(writer(c.io).setRules("supabrain.eth", { status: "paused" })).rejects.toMatchObject({ code: "NOT_OURS" });
    await expect(writer(c.io).setRules("Gemini.Otter.supabrain.eth", { status: "paused" })).rejects.toMatchObject({ code: "INVALID" });
    expect(c.log).toEqual([]);
  });

  it("no resolver on ENS → NO_RESOLVER, nothing sent (fail closed)", async () => {
    for (const resolver of [null, "0x0000000000000000000000000000000000000000" as Hex]) {
      const c = fakeChain({ resolver });
      await expect(writer(c.io).setRules(NAME, { status: "paused" })).rejects.toMatchObject({ code: "NO_RESOLVER" });
      expect(c.sent).toHaveLength(0);
    }
  });

  it("a reverted receipt is an error that names the transaction", async () => {
    const c = fakeChain({ status: "reverted" });
    const e = await writer(c.io).setRules(NAME, { status: "paused" }).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(RulesError);
    expect(e).toMatchObject({ code: "REVERTED" });
    expect((e as Error).message).toContain(`explorer/tx/${HASH}`);
  });

  it("serialises writes from one signer: the second send waits for the first receipt", async () => {
    const c = fakeChain();
    const w = writer(c.io);
    await Promise.all([w.setRules(NAME, { status: "paused" }), w.setRules(NAME, { scope: "docs/" })]);
    expect(c.log.filter((x) => !x.startsWith("find"))).toEqual(["send 1", "receipt 1", "send 2", "receipt 2"]);
  });

  it("after a write, reads ask for at least that block (a lagging node must not undo a pause)", async () => {
    const c = fakeChain();
    const w = writer(c.io);
    await w.setRules(NAME, { status: "paused" });
    await w.setRules(NAME, { status: "active" });
    expect(c.reads.at(-1)).toEqual({ key: "sb.status", atLeastBlock: 101n });
    expect(c.texts["sb.status"]).toBe("active");
  });

  it("readRules returns the four rules as they are now", async () => {
    const c = fakeChain({ texts: { "sb.scope": "src/" } });
    expect(await writer(c.io).readRules(NAME)).toEqual({ status: "active", scope: "src/", writeDaily: "200", role: "worker" });
  });
});
