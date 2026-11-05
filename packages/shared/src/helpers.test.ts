import { describe, expect, it } from "vitest";
import { agentKeyEnvName, explorerLink, redactUrl, redactUrls, vendorKeyEnvName } from "./helpers";

describe("helpers", () => {
  it("derives key env names from labels", () => {
    expect(agentKeyEnvName("gem-research")).toBe("AGENT_GEM_RESEARCH_PRIVATE_KEY");
    expect(agentKeyEnvName("lead-claude")).toBe("AGENT_LEAD_CLAUDE_PRIVATE_KEY");
    expect(vendorKeyEnvName("acme")).toBe("VENDOR_ACME_PRIVATE_KEY");
  });

  it("redacts RPC paths, queries and credentials", () => {
    expect(redactUrl("https://rpc.example.org/secret-key-123")).toBe("https://rpc.example.org/***");
    expect(redactUrl("https://rpc.example.org/?apikey=abc")).toBe("https://rpc.example.org/***");
    expect(redactUrl("https://user:pw@rpc.example.org")).toBe("https://rpc.example.org/***");
    expect(redactUrl("https://rpc.example.org")).toBe("https://rpc.example.org");
    expect(redactUrl("nope")).toBe("<invalid url>");
  });

  it("redacts URLs embedded in error messages", () => {
    const msg = 'fetch failed: https://rpc.example.org/k3y and wss://ws.example.org/k3y "x"';
    expect(redactUrls(msg)).toBe('fetch failed: https://rpc.example.org/*** and wss://ws.example.org/*** "x"');
  });

  it("fills explorer templates", () => {
    expect(explorerLink("https://scan.example.org/tx/{hash}", { hash: "0xabc" })).toBe("https://scan.example.org/tx/0xabc");
  });
});
