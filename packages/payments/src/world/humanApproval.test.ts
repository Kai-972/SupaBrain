import { hashSignal } from "@worldcoin/idkit-core/hashing";
import { describe, expect, it, vi } from "vitest";
import {
  approvalAction,
  InMemoryReplayStore,
  startHumanApproval,
  verifyApprovalResult,
  waitForHumanApproval,
  type BridgeRequest,
  type BridgeStatus,
  type CreateBridgeRequest,
  type HumanApprovalDeps,
  type PendingApproval,
} from "./humanApproval";
import { parseWorldConfig, type IdkitConfig } from "./config";

// Test-only values. Real ones come from config/world.json + env (WORLD_APP_ID, WORLD_RP_ID, WORLD_SIGNING_KEY).
const VERIFY_BASE = "https://verify.test";
const APP_ID = "app_test" as const;
const RP_ID = "rp_test0000000001";
const INTENT = `0x${"ab".repeat(32)}` as const;
const OTHER_INTENT = `0x${"cd".repeat(32)}` as const;
const T0 = 1_762_400_000_000;

const CFG: IdkitConfig = {
  environment: "production",
  verifyBaseUrl: VERIFY_BASE,
  rpSignatureTtlSec: 300,
  allowLegacyProofs: false,
  credentials: ["proof_of_human", "selfie"],
  actionPrefix: "supabrain-pay",
  pollIntervalMs: 1000,
};

type Route = (req: Request) => Response | Promise<Response>;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function harness(opts: { statuses?: Array<BridgeStatus | Error>; verify?: Route; cfg?: Partial<IdkitConfig> } = {}) {
  let clock = T0;
  const requests: Request[] = [];
  const created: Parameters<CreateBridgeRequest>[0][] = [];
  const signed: Array<{ action: string; ttlSec: number }> = [];
  const statuses = [...(opts.statuses ?? [])];
  let polls = 0;
  const verify: Route = opts.verify ?? (async (req) => {
    const body = (await req.json()) as { action: string; environment: string };
    return json({ success: true, action: body.action, environment: body.environment, nullifier: "0x1" });
  });
  const bridge: BridgeRequest = {
    connectorURI: "https://world.test/verify?t=wld&i=req-1&k=secretkey",
    requestId: "8f3c2a71-0000-4000-8000-000000000000",
    pollOnce: async () => {
      polls++;
      const s = statuses.shift() ?? { type: "awaiting_confirmation" };
      if (s instanceof Error) throw s;
      return s;
    },
  };
  const deps: HumanApprovalDeps = {
    appId: APP_ID,
    rpId: RP_ID,
    cfg: { ...CFG, ...opts.cfg },
    sign: ({ action, ttlSec }) => {
      signed.push({ action, ttlSec });
      const createdAt = Math.floor(clock / 1000);
      return { sig: `0x${"11".repeat(65)}`, nonce: `0x00${"22".repeat(31)}`, createdAt, expiresAt: createdAt + ttlSec };
    },
    createRequest: async (args) => {
      created.push(args);
      return bridge;
    },
    replay: new InMemoryReplayStore(),
    now: () => clock,
    sleep: async (ms) => {
      clock += ms;
    },
    isRetryable: (e) => e instanceof Error && e.name === "RetryableBridgeError",
    fetchFn: (async (input: string | URL | Request, init?: RequestInit) => {
      const req = new Request(input, init);
      requests.push(req.clone());
      if (req.url !== `${VERIFY_BASE}/api/v4/verify/${RP_ID}`) return new Response("not found", { status: 404 });
      return verify(req);
    }) as typeof fetch,
  };
  return {
    deps,
    requests,
    created,
    signed,
    polls: () => polls,
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

function resultFor(p: PendingApproval, over: Record<string, unknown> = {}, item: Record<string, unknown> = {}) {
  return {
    protocol_version: "4.0",
    nonce: p.nonce,
    action: p.action,
    environment: "production",
    responses: [
      {
        identifier: "proof_of_human",
        signal_hash: p.expectedSignalHash,
        proof: ["1", "2", "3", "4", "5"],
        nullifier: "123456789",
        issuer_schema_id: 1,
        expires_at_min: 0,
        ...item,
      },
    ],
    ...over,
  };
}

const retryable = () => Object.assign(new Error("bridge 502"), { name: "RetryableBridgeError" });

describe("approvalAction", () => {
  it("binds the action string to the exact intent hash", () => {
    expect(approvalAction("supabrain-pay", INTENT)).toBe(`supabrain-pay:${INTENT}`);
  });
  it("lowercases the hash so one intent has exactly one action", () => {
    expect(approvalAction("supabrain-pay", INTENT.toUpperCase().replace("0X", "0x") as `0x${string}`)).toBe(
      `supabrain-pay:${INTENT}`,
    );
  });
  it.each(["0x1234", "ab".repeat(32), `0x${"zz".repeat(32)}`])("rejects a non-32-byte hash %s", (h) => {
    expect(() => approvalAction("supabrain-pay", h as `0x${string}`)).toThrow(/intent hash/);
  });
});

describe("startHumanApproval", () => {
  it("signs the per-intent action server-side and opens a bridge request bound to it", async () => {
    const h = harness();
    const p = await startHumanApproval(h.deps, { intentHash: INTENT, description: "Pay 5 USDC to acme.supabrain.eth" });

    expect(h.signed).toEqual([{ action: `supabrain-pay:${INTENT}`, ttlSec: 300 }]);
    expect(h.created).toHaveLength(1);
    const c = h.created[0]!;
    expect(c.appId).toBe(APP_ID);
    expect(c.action).toBe(p.action);
    expect(c.signal).toBe(INTENT);
    expect(c.environment).toBe("production");
    expect(c.allowLegacyProofs).toBe(false);
    expect(c.credentials).toEqual(["proof_of_human", "selfie"]);
    expect(c.description).toBe("Pay 5 USDC to acme.supabrain.eth");
    expect(c.rpContext).toEqual({
      rp_id: RP_ID,
      nonce: p.nonce,
      created_at: Math.floor(T0 / 1000),
      expires_at: Math.floor(T0 / 1000) + 300,
      signature: `0x${"11".repeat(65)}`,
    });

    expect(p.intentHash).toBe(INTENT);
    expect(p.expectedSignalHash).toBe(hashSignal(INTENT));
    expect(p.connectorURI).toBe("https://world.test/verify?t=wld&i=req-1&k=secretkey");
    expect(p.userCode).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    expect(p.expiresAtMs).toBe((Math.floor(T0 / 1000) + 300) * 1000);
  });
});

describe("verifyApprovalResult", () => {
  it("accepts a proof bound to this intent after World's verify API agrees", async () => {
    const h = harness();
    const p = await startHumanApproval(h.deps, { intentHash: INTENT });
    const r = await verifyApprovalResult(h.deps, p, resultFor(p));
    expect(r).toEqual({ ok: true, credential: "proof_of_human", nullifier: "75bcd15" });

    expect(h.requests).toHaveLength(1);
    const req = h.requests[0]!;
    expect(req.method).toBe("POST");
    expect(req.headers.get("authorization")).toBeNull();
    expect(await req.json()).toEqual(resultFor(p)); // forwarded as-is
  });

  const cases: Array<[string, (p: PendingApproval) => unknown, RegExp]> = [
    ["a proof for another intent's action", (p) => resultFor(p, { action: approvalAction("supabrain-pay", OTHER_INTENT) }), /action/],
    ["a different nonce", (p) => resultFor(p, { nonce: "0x0099" }), /nonce/],
    ["a staging proof when production is pinned", (p) => resultFor(p, { environment: "staging" }), /environment/],
    ["a missing signal hash", (p) => resultFor(p, {}, { signal_hash: undefined }), /signal/],
    ["a signal hash for another intent", (p) => resultFor(p, {}, { signal_hash: hashSignal(OTHER_INTENT) }), /signal/],
    ["a credential that is not allowed", (p) => resultFor(p, {}, { identifier: "passport" }), /credential/],
    ["a legacy 3.0 proof when legacy is off", (p) => resultFor(p, { protocol_version: "3.0" }), /protocol/],
    ["no responses", (p) => resultFor(p, { responses: [] }), /response/],
    ["a non-object", () => "approved", /result/],
  ];
  it.each(cases)("rejects %s without calling World", async (_n, make, err) => {
    const h = harness();
    const p = await startHumanApproval(h.deps, { intentHash: INTENT });
    const r = await verifyApprovalResult(h.deps, p, make(p));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(err);
    expect(h.requests).toHaveLength(0);
  });

  it("rejects when World's verify API says 400", async () => {
    const h = harness({ verify: () => json({ code: "invalid_proof", detail: "bad" }, 400) });
    const p = await startHumanApproval(h.deps, { intentHash: INTENT });
    const r = await verifyApprovalResult(h.deps, p, resultFor(p));
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/verify.*400.*invalid_proof/) });
  });

  it("rejects a 200 without success:true", async () => {
    const h = harness({ verify: () => json({ success: false }) });
    const p = await startHumanApproval(h.deps, { intentHash: INTENT });
    expect((await verifyApprovalResult(h.deps, p, resultFor(p))).ok).toBe(false);
  });

  it("rejects when World reports another environment", async () => {
    const h = harness({ verify: () => json({ success: true, environment: "sandbox" }) });
    const p = await startHumanApproval(h.deps, { intentHash: INTENT });
    const r = await verifyApprovalResult(h.deps, p, resultFor(p));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/environment/);
  });

  it("rejects when World reports another action", async () => {
    const h = harness({ verify: () => json({ success: true, environment: "production", action: "other" }) });
    const p = await startHumanApproval(h.deps, { intentHash: INTENT });
    expect((await verifyApprovalResult(h.deps, p, resultFor(p))).ok).toBe(false);
  });

  it("fails closed on a network error", async () => {
    const h = harness({ verify: () => { throw new TypeError("fetch failed"); } });
    const p = await startHumanApproval(h.deps, { intentHash: INTENT });
    const r = await verifyApprovalResult(h.deps, p, resultFor(p));
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/verify request failed/) });
  });

  it("rejects a result that arrives after the request expired", async () => {
    const h = harness();
    const p = await startHumanApproval(h.deps, { intentHash: INTENT });
    h.advance(301_000);
    const r = await verifyApprovalResult(h.deps, p, resultFor(p));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/expired/);
    expect(h.requests).toHaveLength(0);
  });

  it("accepts each proof once: a replayed nullifier for the same action fails", async () => {
    const h = harness();
    const p = await startHumanApproval(h.deps, { intentHash: INTENT });
    expect((await verifyApprovalResult(h.deps, p, resultFor(p))).ok).toBe(true);
    const again = await verifyApprovalResult(h.deps, p, resultFor(p));
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error).toMatch(/already used/);
  });

  it("a verified-but-replayed nullifier on a second pending approval also fails", async () => {
    const h = harness();
    const p1 = await startHumanApproval(h.deps, { intentHash: INTENT });
    expect((await verifyApprovalResult(h.deps, p1, resultFor(p1))).ok).toBe(true);
    const p2 = await startHumanApproval(h.deps, { intentHash: INTENT });
    expect((await verifyApprovalResult(h.deps, p2, resultFor(p2))).ok).toBe(false);
  });

  it("accepts a legacy 3.0 proof (hex nullifier) only when legacy is on", async () => {
    const h = harness({ cfg: { allowLegacyProofs: true } });
    const p = await startHumanApproval(h.deps, { intentHash: INTENT });
    const r = await verifyApprovalResult(
      h.deps,
      p,
      resultFor(p, { protocol_version: "3.0" }, { nullifier: "0x0ABC", proof: "0x01", merkle_root: "0x02" }),
    );
    expect(r).toEqual({ ok: true, credential: "proof_of_human", nullifier: "abc" });
  });

  it("does not consume the nullifier when World rejects the proof", async () => {
    let calls = 0;
    const h = harness({
      verify: async (req) => {
        calls++;
        if (calls === 1) return json({ code: "temporary" }, 400);
        const body = (await req.json()) as { action: string };
        return json({ success: true, environment: "production", action: body.action });
      },
    });
    const p = await startHumanApproval(h.deps, { intentHash: INTENT });
    expect((await verifyApprovalResult(h.deps, p, resultFor(p))).ok).toBe(false);
    expect((await verifyApprovalResult(h.deps, p, resultFor(p))).ok).toBe(true);
  });
});

describe("waitForHumanApproval", () => {
  async function run(statuses: Array<BridgeStatus | Error | ((p: PendingApproval) => BridgeStatus)>, extra: { signal?: AbortSignal; verify?: Route } = {}) {
    const resolved: Array<BridgeStatus | Error> = [];
    const h = harness({ statuses: resolved, verify: extra.verify });
    const p = await startHumanApproval(h.deps, { intentHash: INTENT });
    // materialize statuses that need the pending approval (nonce/action)
    const live = statuses.map((s) => (typeof s === "function" ? s(p) : s));
    const original = p.request.pollOnce;
    let i = 0;
    p.request.pollOnce = async (o) => {
      if (i < live.length) {
        const s = live[i++]!;
        await original(o).catch(() => undefined); // keep the harness poll counter honest
        if (s instanceof Error) throw s;
        return s;
      }
      return original(o);
    };
    const d = await waitForHumanApproval(h.deps, p, { signal: extra.signal });
    return { d, h, p };
  }
  const confirmed = (p: PendingApproval): BridgeStatus => ({ type: "confirmed", result: resultFor(p) });

  it("waits through connection and confirmation, then returns a validated approval", async () => {
    const { d } = await run([{ type: "waiting_for_connection" }, { type: "awaiting_confirmation" }, confirmed]);
    expect(d).toEqual({ status: "approved", credential: "proof_of_human", nullifier: "75bcd15" });
  });

  it("sleeps the poll interval before every poll", async () => {
    const sleeps: number[] = [];
    const h = harness({ statuses: [{ type: "waiting_for_connection" }] });
    h.deps.sleep = async (ms) => {
      sleeps.push(ms);
      h.advance(ms);
    };
    const p = await startHumanApproval(h.deps, { intentHash: INTENT });
    const ac = new AbortController();
    let n = 0;
    p.request.pollOnce = async () => {
      if (++n === 3) ac.abort();
      return { type: "waiting_for_connection" };
    };
    await waitForHumanApproval(h.deps, p, { signal: ac.signal });
    expect(sleeps).toEqual([1000, 1000, 1000]);
  });

  it.each(["user_rejected", "verification_rejected"])("treats %s as a human deny", async (code) => {
    const { d } = await run([{ type: "awaiting_confirmation" }, { type: "failed", error: code }]);
    expect(d).toEqual({ status: "denied", reason: code });
  });

  it("treats the bridge timeout as expired", async () => {
    const { d } = await run([{ type: "failed", error: "timeout" }]);
    expect(d).toEqual({ status: "expired" });
  });

  it("treats a bridge cancel as cancelled", async () => {
    const { d } = await run([{ type: "failed", error: "cancelled" }]);
    expect(d).toEqual({ status: "cancelled" });
  });

  it("expires on our clock when the human never answers", async () => {
    const { d, h } = await run([]);
    expect(d).toEqual({ status: "expired" });
    expect(h.polls()).toBeLessThanOrEqual(300);
  });

  it("an app-side abort cancels", async () => {
    const ac = new AbortController();
    ac.abort();
    const { d } = await run([], { signal: ac.signal });
    expect(d).toEqual({ status: "cancelled" });
  });

  it("keeps polling through a retryable bridge error", async () => {
    const { d } = await run([retryable(), confirmed]);
    expect(d.status).toBe("approved");
  });

  it("fails on a non-retryable poll error", async () => {
    const { d } = await run([new Error("boom")]);
    expect(d).toEqual({ status: "failed", error: expect.stringMatching(/boom/) });
  });

  it("fails on any other World error code", async () => {
    const { d } = await run([{ type: "failed", error: "invalid_rp_signature" }]);
    expect(d).toEqual({ status: "failed", error: "invalid_rp_signature" });
  });

  it("never approves a confirmed result that fails validation", async () => {
    const { d } = await run([(p) => ({ type: "confirmed", result: resultFor(p, { action: "supabrain-pay:other" }) })]);
    expect(d.status).toBe("failed");
  });

  it("never approves when World's verify API rejects", async () => {
    const { d } = await run([confirmed], { verify: () => json({ code: "invalid_proof" }, 400) });
    expect(d.status).toBe("failed");
  });
});

describe("parseWorldConfig", () => {
  const base = {
    mode: "idkit",
    approvalTtlSec: 900,
    idkit: { ...CFG, verifyBaseUrl: "https://developer.world.org" },
    oidc: { issuer: "https://auth.world.org", scope: "openid", requireEnrolledSub: false, authTimeSkewSec: 5, pollMaxIntervalSec: 30 },
    source: "x",
    verifiedAt: "2026-11-06",
  };
  it("parses the idkit + oidc blocks", () => {
    const c = parseWorldConfig(base);
    expect(c.mode).toBe("idkit");
    expect(c.idkit.credentials).toEqual(["proof_of_human", "selfie"]);
    expect(c.oidc.issuer).toBe("https://auth.world.org");
  });
  it.each([
    ["unknown environment", { idkit: { ...base.idkit, environment: "dev" } }],
    ["empty credentials", { idkit: { ...base.idkit, credentials: [] } }],
    ["unknown credential", { idkit: { ...base.idkit, credentials: ["orb"] } }],
    ["bad action prefix", { idkit: { ...base.idkit, actionPrefix: "Pay Now" } }],
    ["rp signature ttl over an hour", { idkit: { ...base.idkit, rpSignatureTtlSec: 7200 } }],
    ["unknown mode", { mode: "magic" }],
  ])("rejects %s", (_n, patch) => {
    expect(() => parseWorldConfig({ ...base, ...patch })).toThrow(/world\.json is invalid/);
  });
});

vi.setConfig({ testTimeout: 10_000 });
