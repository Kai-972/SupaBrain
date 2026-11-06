import { describe, expect, it } from "vitest";
import { issueAgentToken, redactTokenPath, verifyAgentToken } from "./tokens";

const SECRET = "s".repeat(32);
const OTHER = "o".repeat(32);
const KNOWN = ["lead-claude", "gem-research"];
const NOW = 1_800_000_000;

const b64 = (s: string) => Buffer.from(s).toString("base64url");
const unb64 = (s: string) => Buffer.from(s, "base64url").toString();

describe("agent tokens", () => {
  it("round-trips: the token names the agent and its expiry", () => {
    const t = issueAgentToken({ label: "gem-research", ttlSec: 3600, secret: SECRET, now: NOW });
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/); // safe in a URL path and a header
    expect(verifyAgentToken(t, { secret: SECRET, knownLabels: KNOWN, now: NOW + 10 })).toEqual({ ok: true, label: "gem-research", exp: NOW + 3600 });
  });

  it("rejects a token whose label or expiry was edited (signature no longer matches)", () => {
    const t = issueAgentToken({ label: "gem-research", ttlSec: 3600, secret: SECRET, now: NOW });
    const [, exp, sig] = unb64(t).split("|");
    expect(verifyAgentToken(b64(`lead-claude|${exp}|${sig}`), { secret: SECRET, knownLabels: KNOWN, now: NOW })).toEqual({ ok: false, reason: "bad_signature" });
    expect(verifyAgentToken(b64(`gem-research|${Number(exp) + 99999}|${sig}`), { secret: SECRET, knownLabels: KNOWN, now: NOW })).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("rejects a token signed with another secret", () => {
    const t = issueAgentToken({ label: "gem-research", ttlSec: 3600, secret: OTHER, now: NOW });
    expect(verifyAgentToken(t, { secret: SECRET, knownLabels: KNOWN, now: NOW })).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("rejects an expired token, and accepts it up to the last second", () => {
    const t = issueAgentToken({ label: "gem-research", ttlSec: 60, secret: SECRET, now: NOW });
    expect(verifyAgentToken(t, { secret: SECRET, knownLabels: KNOWN, now: NOW + 60 }).ok).toBe(true);
    expect(verifyAgentToken(t, { secret: SECRET, knownLabels: KNOWN, now: NOW + 61 })).toEqual({ ok: false, reason: "expired" });
  });

  it("rejects a validly signed token for an agent that is not configured", () => {
    const t = issueAgentToken({ label: "gpt-writer", ttlSec: 60, secret: SECRET, now: NOW });
    expect(verifyAgentToken(t, { secret: SECRET, knownLabels: KNOWN, now: NOW })).toEqual({ ok: false, reason: "unknown_agent" });
  });

  it("rejects malformed input without throwing", () => {
    for (const bad of ["", "abc", b64("a|b"), b64("a|b|c|d"), b64("gem-research|soon|x"), "%%%", "x".repeat(2000)]) {
      expect(verifyAgentToken(bad, { secret: SECRET, knownLabels: KNOWN, now: NOW })).toEqual({ ok: false, reason: "malformed" });
    }
  });

  it("refuses weak secrets and labels that could smuggle a separator", () => {
    expect(() => issueAgentToken({ label: "gem-research", ttlSec: 60, secret: "short", now: NOW })).toThrow(/32/);
    expect(() => verifyAgentToken("x", { secret: "short", knownLabels: KNOWN, now: NOW })).toThrow(/32/);
    expect(() => issueAgentToken({ label: "a|b", ttlSec: 60, secret: SECRET, now: NOW })).toThrow(/label/);
    expect(() => issueAgentToken({ label: "gem-research", ttlSec: 0, secret: SECRET, now: NOW })).toThrow(/ttl/);
  });

  it("redacts the token from a request path for logs", () => {
    expect(redactTokenPath("/mcp/t/abcDEF123_-")).toBe("/mcp/t/***");
    expect(redactTokenPath("/mcp/t/abc/extra?x=1")).toBe("/mcp/t/***/extra?x=1");
    expect(redactTokenPath("/mcp")).toBe("/mcp");
  });
});
