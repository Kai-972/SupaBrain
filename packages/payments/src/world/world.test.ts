import { createHash } from "node:crypto";
import { SignJWT, exportJWK, generateKeyPair, createLocalJWKSet, type JWK, type JWTPayload } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import { discover, DiscoveryError } from "./discovery";
import { startDeviceAuthorization, pollOnce, waitForDecision } from "./deviceFlow";
import { IdTokenValidator } from "./idToken";

// Test-only values. Real values come from config/world.json + discovery + env.
const ISSUER = "https://idp.test";
const CLIENT_ID = "app_test_client";
const CLIENT_SECRET = "worldidp_client_secret_test";
const DISCOVERY = {
  issuer: ISSUER,
  device_authorization_endpoint: `${ISSUER}/api/v1/device_authorization`,
  token_endpoint: `${ISSUER}/api/v1/token`,
  jwks_uri: `${ISSUER}/.well-known/jwks.json`,
  grant_types_supported: ["authorization_code", "urn:ietf:params:oauth:grant-type:device_code"],
  token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post"],
  id_token_signing_alg_values_supported: ["RS256"],
};

type Route = (req: Request) => Response | Promise<Response>;
function fakeFetch(routes: Record<string, Route>, log: Request[] = []): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const req = new Request(input, init);
    log.push(req.clone());
    const route = routes[req.url];
    if (!route) return new Response("not found", { status: 404 });
    return route(req);
  }) as typeof fetch;
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

let privateKey: CryptoKey;
let jwk: JWK;
let otherKey: CryptoKey;

beforeAll(async () => {
  const kp = await generateKeyPair("RS256", { extractable: true });
  privateKey = kp.privateKey;
  jwk = { ...(await exportJWK(kp.publicKey)), kid: "k1", alg: "RS256", use: "sig" };
  otherKey = (await generateKeyPair("RS256")).privateKey;
});

async function idToken(claims: Record<string, unknown> = {}, opts: { key?: CryptoKey; kid?: string; alg?: string } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const { iss = ISSUER, aud = CLIENT_ID, sub = "pairwise-sub-1", exp = now + 300, iat = now, auth_time = now, jti = crypto.randomUUID(), ...rest } = claims;
  return new SignJWT({ auth_time, jti, amr: ["pop"], ...rest } as JWTPayload)
    .setProtectedHeader({ alg: opts.alg ?? "RS256", kid: opts.kid ?? "k1" } as { alg: string; kid: string })
    .setIssuer(iss as string)
    .setAudience(aud as string)
    .setSubject(sub as string)
    .setIssuedAt(iat as number)
    .setExpirationTime(exp as number)
    .sign(opts.key ?? privateKey);
}

function validator(extra: Partial<ConstructorParameters<typeof IdTokenValidator>[0]> = {}) {
  return new IdTokenValidator({
    issuer: ISSUER,
    clientId: CLIENT_ID,
    jwks: createLocalJWKSet({ keys: [jwk] }),
    algorithms: ["RS256"],
    authTimeSkewSec: 5,
    ...extra,
  });
}

// ---------------------------------------------------------------- discovery
describe("discover", () => {
  it("reads endpoints from the discovery document", async () => {
    const d = await discover(ISSUER, fakeFetch({ [`${ISSUER}/.well-known/openid-configuration`]: () => json(DISCOVERY) }));
    expect(d.deviceAuthorizationEndpoint).toBe(DISCOVERY.device_authorization_endpoint);
    expect(d.tokenEndpoint).toBe(DISCOVERY.token_endpoint);
    expect(d.jwksUri).toBe(DISCOVERY.jwks_uri);
    expect(d.algorithms).toEqual(["RS256"]);
  });

  it("stops if the device grant is not advertised", async () => {
    const doc = { ...DISCOVERY, grant_types_supported: ["authorization_code"] };
    await expect(discover(ISSUER, fakeFetch({ [`${ISSUER}/.well-known/openid-configuration`]: () => json(doc) }))).rejects.toThrow(
      DiscoveryError,
    );
  });

  it("rejects a document whose issuer differs from the configured issuer", async () => {
    const doc = { ...DISCOVERY, issuer: "https://evil.test" };
    await expect(discover(ISSUER, fakeFetch({ [`${ISSUER}/.well-known/openid-configuration`]: () => json(doc) }))).rejects.toThrow(
      /issuer/,
    );
  });

  it("rejects client_secret_basic being unsupported", async () => {
    const doc = { ...DISCOVERY, token_endpoint_auth_methods_supported: ["private_key_jwt"] };
    await expect(discover(ISSUER, fakeFetch({ [`${ISSUER}/.well-known/openid-configuration`]: () => json(doc) }))).rejects.toThrow(
      /client_secret_basic/,
    );
  });

  it("never allows alg=none even if advertised", async () => {
    const doc = { ...DISCOVERY, id_token_signing_alg_values_supported: ["none", "RS256"] };
    const d = await discover(ISSUER, fakeFetch({ [`${ISSUER}/.well-known/openid-configuration`]: () => json(doc) }));
    expect(d.algorithms).toEqual(["RS256"]);
  });
});

// ---------------------------------------------------------------- device flow
const disc = {
  issuer: ISSUER,
  deviceAuthorizationEndpoint: DISCOVERY.device_authorization_endpoint,
  tokenEndpoint: DISCOVERY.token_endpoint,
  jwksUri: DISCOVERY.jwks_uri,
  algorithms: ["RS256"],
};
const creds = { clientId: CLIENT_ID, clientSecret: CLIENT_SECRET };
const basic = `Basic ${Buffer.from(`${encodeURIComponent(CLIENT_ID)}:${encodeURIComponent(CLIENT_SECRET)}`).toString("base64")}`;

describe("startDeviceAuthorization", () => {
  it("POSTs scope with client_secret_basic and returns the handle", async () => {
    const log: Request[] = [];
    const f = fakeFetch(
      {
        [disc.deviceAuthorizationEndpoint]: () =>
          json({
            device_code: "dc-1",
            user_code: "WXYZ-1234",
            verification_uri: `${ISSUER}/device`,
            verification_uri_complete: `${ISSUER}/device?user_code=WXYZ-1234`,
            expires_in: 1200,
            interval: 5,
          }),
      },
      log,
    );
    const h = await startDeviceAuthorization(disc, creds, "openid", f, () => 1_000_000);
    expect(h).toMatchObject({ deviceCode: "dc-1", userCode: "WXYZ-1234", intervalSec: 5, startedAtMs: 1_000_000, expiresAtMs: 1_000_000 + 1_200_000 });
    const req = log[0]!;
    expect(req.method).toBe("POST");
    expect(req.headers.get("authorization")).toBe(basic);
    expect(req.headers.get("content-type")).toContain("application/x-www-form-urlencoded");
    const body = new URLSearchParams(await req.text());
    expect(body.get("scope")).toBe("openid");
    expect(body.get("client_secret")).toBeNull(); // never in the body with client_secret_basic
  });

  it("defaults interval to 5s when omitted", async () => {
    const f = fakeFetch({
      [disc.deviceAuthorizationEndpoint]: () => json({ device_code: "d", user_code: "u", verification_uri: `${ISSUER}/device`, expires_in: 600 }),
    });
    const h = await startDeviceAuthorization(disc, creds, "openid", f);
    expect(h.intervalSec).toBe(5);
  });

  it("throws on an error response without leaking the secret", async () => {
    const f = fakeFetch({ [disc.deviceAuthorizationEndpoint]: () => json({ error: "invalid_client" }, 401) });
    const err = await startDeviceAuthorization(disc, creds, "openid", f).catch((e: Error) => e);
    expect(String(err)).toMatch(/invalid_client/);
    expect(String(err)).not.toContain(CLIENT_SECRET);
  });
});

describe("pollOnce", () => {
  const handle = { deviceCode: "dc-1", userCode: "U", verificationUri: `${ISSUER}/device`, intervalSec: 5, startedAtMs: 0, expiresAtMs: Number.MAX_SAFE_INTEGER };
  const poll = (r: Route, log?: Request[]) => pollOnce(disc, creds, handle, fakeFetch({ [disc.tokenEndpoint]: r }, log));

  it("sends the device_code grant with basic auth", async () => {
    const log: Request[] = [];
    await poll(() => json({ error: "authorization_pending" }, 400), log);
    const body = new URLSearchParams(await log[0]!.text());
    expect(body.get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:device_code");
    expect(body.get("device_code")).toBe("dc-1");
    expect(log[0]!.headers.get("authorization")).toBe(basic);
  });

  it.each([
    ["authorization_pending", "pending"],
    ["slow_down", "slow_down"],
    ["access_denied", "denied"],
    ["expired_token", "expired"],
    ["invalid_grant", "error"],
  ])("maps %s → %s", async (error, kind) => {
    expect((await poll(() => json({ error }, 400))).kind).toBe(kind);
  });

  it("returns the id_token on success", async () => {
    const r = await poll(() => json({ id_token: "a.b.c", access_token: "x", token_type: "Bearer", expires_in: 300 }));
    expect(r).toEqual({ kind: "approved", idToken: "a.b.c" });
  });

  it("treats 503 as unavailable, never as approval", async () => {
    expect((await poll(() => new Response("busy", { status: 503 }))).kind).toBe("unavailable");
  });

  it("treats 429 as a terminal error", async () => {
    expect((await poll(() => new Response("slow", { status: 429 }))).kind).toBe("error");
  });

  it("treats a 200 without id_token as an error", async () => {
    expect((await poll(() => json({ access_token: "x" }))).kind).toBe("error");
  });
});

// ---------------------------------------------------------------- id_token validation
describe("IdTokenValidator", () => {
  const startedAtSec = () => Math.floor(Date.now() / 1000) - 10;

  it("accepts a fresh, correctly signed token and returns claims", async () => {
    const c = await validator().validate(await idToken(), { startedAtSec: startedAtSec() });
    expect(c.sub).toBe("pairwise-sub-1");
    expect(c.iss).toBe(ISSUER);
  });

  it("rejects a wrong issuer", async () => {
    await expect(validator().validate(await idToken({ iss: "https://evil.test" }), { startedAtSec: startedAtSec() })).rejects.toThrow();
  });

  it("rejects a wrong audience", async () => {
    await expect(validator().validate(await idToken({ aud: "someone-else" }), { startedAtSec: startedAtSec() })).rejects.toThrow();
  });

  it("rejects an expired token", async () => {
    const now = Math.floor(Date.now() / 1000);
    await expect(validator().validate(await idToken({ exp: now - 60, iat: now - 400 }), { startedAtSec: now - 500 })).rejects.toThrow();
  });

  it("rejects a token signed by an unknown key", async () => {
    await expect(validator().validate(await idToken({}, { key: otherKey }), { startedAtSec: startedAtSec() })).rejects.toThrow();
  });

  it("rejects a stale auth_time (approval older than this request)", async () => {
    const now = Math.floor(Date.now() / 1000);
    await expect(validator().validate(await idToken({ auth_time: now - 3600 }), { startedAtSec: now - 10 })).rejects.toThrow(/auth_time/);
  });

  it("allows auth_time within the configured skew", async () => {
    const now = Math.floor(Date.now() / 1000);
    await validator().validate(await idToken({ auth_time: now - 13 }), { startedAtSec: now - 10 });
  });

  it("rejects a missing auth_time or jti", async () => {
    const now = Math.floor(Date.now() / 1000);
    const noAuthTime = await new SignJWT({ jti: "j" }).setProtectedHeader({ alg: "RS256", kid: "k1" }).setIssuer(ISSUER).setAudience(CLIENT_ID).setSubject("s").setIssuedAt(now).setExpirationTime(now + 60).sign(privateKey);
    await expect(validator().validate(noAuthTime, { startedAtSec: now - 10 })).rejects.toThrow();
    const noJti = await new SignJWT({ auth_time: now }).setProtectedHeader({ alg: "RS256", kid: "k1" }).setIssuer(ISSUER).setAudience(CLIENT_ID).setSubject("s").setIssuedAt(now).setExpirationTime(now + 60).sign(privateKey);
    await expect(validator().validate(noJti, { startedAtSec: now - 10 })).rejects.toThrow();
  });

  it("accepts a jti only once (replay)", async () => {
    const v = validator();
    const t = await idToken({ jti: "once" });
    await v.validate(t, { startedAtSec: startedAtSec() });
    await expect(v.validate(t, { startedAtSec: startedAtSec() })).rejects.toThrow(/jti/);
  });

  it("enforces the enrolled approver when requireEnrolledSub is on", async () => {
    const hash = createHash("sha256").update(`${ISSUER}|owner-sub`).digest("hex");
    const v = validator({ requireEnrolledSub: true, approverSubHash: hash });
    await v.validate(await idToken({ sub: "owner-sub" }), { startedAtSec: startedAtSec() });
    await expect(v.validate(await idToken({ sub: "stranger" }), { startedAtSec: startedAtSec() })).rejects.toThrow(/approver/);
  });

  it("refuses to start with requireEnrolledSub but no hash", () => {
    expect(() => validator({ requireEnrolledSub: true })).toThrow(/approver/);
  });
});

// ---------------------------------------------------------------- full wait loop
describe("waitForDecision", () => {
  const baseHandle = () => ({ deviceCode: "dc", userCode: "U", verificationUri: `${ISSUER}/device`, intervalSec: 1, startedAtMs: Date.now(), expiresAtMs: Date.now() + 60_000 });
  const noSleep = async () => {};

  function sequence(responses: (() => Response | Promise<Response>)[]) {
    let i = 0;
    return fakeFetch({ [disc.tokenEndpoint]: () => (responses[Math.min(i++, responses.length - 1)]!)() });
  }

  it("pending → approved returns validated claims", async () => {
    const tok = await idToken();
    const f = sequence([() => json({ error: "authorization_pending" }, 400), () => json({ id_token: tok })]);
    const r = await waitForDecision({ discovery: disc, creds, handle: baseHandle(), fetchFn: f, validator: validator(), sleep: noSleep });
    expect(r.status).toBe("approved");
    if (r.status === "approved") expect(r.claims.sub).toBe("pairwise-sub-1");
  });

  it("access_denied → denied", async () => {
    const f = sequence([() => json({ error: "access_denied" }, 400)]);
    expect((await waitForDecision({ discovery: disc, creds, handle: baseHandle(), fetchFn: f, validator: validator(), sleep: noSleep })).status).toBe("denied");
  });

  it("expired_token → expired", async () => {
    const f = sequence([() => json({ error: "expired_token" }, 400)]);
    expect((await waitForDecision({ discovery: disc, creds, handle: baseHandle(), fetchFn: f, validator: validator(), sleep: noSleep })).status).toBe("expired");
  });

  it("local expiry wins even if the IdP keeps saying pending", async () => {
    const h = { ...baseHandle(), expiresAtMs: Date.now() - 1 };
    const f = sequence([() => json({ error: "authorization_pending" }, 400)]);
    expect((await waitForDecision({ discovery: disc, creds, handle: h, fetchFn: f, validator: validator(), sleep: noSleep })).status).toBe("expired");
  });

  it("an app-side cancel → cancelled, with no further polling", async () => {
    const ac = new AbortController();
    let polls = 0;
    const f = fakeFetch({ [disc.tokenEndpoint]: () => { polls++; ac.abort(); return json({ error: "authorization_pending" }, 400); } });
    const r = await waitForDecision({ discovery: disc, creds, handle: baseHandle(), fetchFn: f, validator: validator(), sleep: noSleep, signal: ac.signal });
    expect(r.status).toBe("cancelled");
    expect(polls).toBe(1);
  });

  it("slow_down adds 5s to the interval", async () => {
    const sleeps: number[] = [];
    const tok = await idToken();
    const f = sequence([() => json({ error: "slow_down" }, 400), () => json({ error: "authorization_pending" }, 400), () => json({ id_token: tok })]);
    await waitForDecision({ discovery: disc, creds, handle: baseHandle(), fetchFn: f, validator: validator(), sleep: async (ms) => { sleeps.push(ms); } });
    expect(sleeps).toEqual([1000, 6000, 6000]);
  });

  it("an invalid id_token is a failure, never an approval", async () => {
    const bad = await idToken({}, { key: otherKey });
    const f = sequence([() => json({ id_token: bad })]);
    const r = await waitForDecision({ discovery: disc, creds, handle: baseHandle(), fetchFn: f, validator: validator(), sleep: noSleep });
    expect(r.status).toBe("failed");
  });

  it("503 keeps waiting, then resolves", async () => {
    const f = sequence([() => new Response("busy", { status: 503 }), () => json({ error: "access_denied" }, 400)]);
    expect((await waitForDecision({ discovery: disc, creds, handle: baseHandle(), fetchFn: f, validator: validator(), sleep: noSleep })).status).toBe("denied");
  });
});
