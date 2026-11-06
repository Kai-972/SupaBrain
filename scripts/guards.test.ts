import { describe, expect, it } from "vitest";
import { isScanned, scanText as scanHardcode } from "./check-hardcode.mjs";
import { isForbiddenPath, scanText as scanSecrets, secretValues } from "./check-secrets.mjs";

const ADDR = "0x" + "ab".repeat(20);
const HASH = "0x" + "cd".repeat(32);

describe("check-hardcode", () => {
  it("flags addresses, 32-byte hex, URLs and chain IDs", () => {
    const text = [`const a = "${ADDR}";`, `const h = "${HASH}";`, `fetch("https://x.example")`, `chainId: ${"1115" + "5111"}`, "const ok = 1;"].join("\n");
    expect(scanHardcode(text)).toEqual([
      { line: 1, rule: "address literal" },
      { line: 2, rule: "64-hex literal" },
      { line: 3, rule: "URL literal" },
      { line: 4, rule: "chain ID literal" },
    ]);
  });

  it("honours hardcode-ok tags with a reason", () => {
    expect(scanHardcode(`const a = "${ADDR}"; // hardcode-ok: zero address sentinel`)).toEqual([]);
    expect(scanHardcode(`const a = "${ADDR}"; // hardcode-ok:`)).toHaveLength(1);
  });

  it("scans code dirs only and skips tests, fixtures, config and docs", () => {
    expect(isScanned("apps/server/src/index.ts")).toBe(true);
    expect(isScanned("contracts/src/BrainVault.sol")).toBe(true);
    expect(isScanned("contracts/test/BrainVault.t.sol")).toBe(false);
    expect(isScanned("apps/server/src/app.test.ts")).toBe(false);
    expect(isScanned("apps/web/fixtures/demo.ts")).toBe(false);
    expect(isScanned("config/app.json")).toBe(false);
    expect(isScanned("docs/IDEA.md")).toBe(false);
  });
});

describe("check-secrets", () => {
  it("flags secret assignments but not empty example lines", () => {
    expect(scanSecrets(`OWNER_PRIVATE_KEY=${HASH}`)).toEqual([{ line: 1, rule: "private key assignment" }]);
    expect(scanSecrets("WORLD_CLIENT_SECRET=                  # B")).toEqual([]);
    expect(scanSecrets("OWNER_PRIVATE_KEY=                # dev machines only")).toEqual([]);
    expect(scanSecrets("NOTION_TOKEN=ntn_abc123def456")).toEqual([{ line: 1, rule: "Notion token value" }]);
    expect(scanSecrets("WORLD_SIGNING_KEY=abcdefgh12345678")).toEqual([{ line: 1, rule: "World signing key value" }]);
    expect(scanSecrets("WORLD_SIGNING_KEY=             # B, SECRET")).toEqual([]);
    expect(scanSecrets(`{ "WORLD_CLIENT_SECRET": "abcdefgh123" }`)).toEqual([{ line: 1, rule: "World client secret value" }]);
  });

  it("ignores TS schema keys and prose that only name a variable", () => {
    expect(scanSecrets("  ARKIV_ACCESS_KEY: opt(z.string().min(1)),")).toEqual([]);
    expect(scanSecrets("fails on a `WORLD_CLIENT_SECRET=` value or `NOTION_TOKEN=secret_…`")).toEqual([]);
  });

  it("catches a local secret value pasted anywhere, never public values (NEXT_PUBLIC_*, PUBLIC_BASE_URL)", () => {
    const secrets = secretValues(["ARKIV_ACCESS_KEY=sk_live_abcdefghijkl  # note", "NEXT_PUBLIC_SERVER_URL=https://public.example.org", "PUBLIC_BASE_URL=https://tunnel.example.org", "SUPABRAIN_APP_NAMESPACE=supabrain-mumbai26-dev", "NGROK_AUTHTOKEN=abcdefghijklmnop"].join("\n"));
    expect(secrets.map((s) => s.name)).toEqual(["ARKIV_ACCESS_KEY", "NGROK_AUTHTOKEN"]);
    expect(scanSecrets("const rpc = base + 'sk_live_abcdefghijkl'", secrets)).toEqual([{ line: 1, rule: "value of ARKIV_ACCESS_KEY" }]);
  });

  it("forbids env files except .env.example", () => {
    expect(isForbiddenPath(".env.local")).toBe(true);
    expect(isForbiddenPath("apps/web/.env")).toBe(true);
    expect(isForbiddenPath(".env.example")).toBe(false);
  });
});
