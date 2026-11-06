// v2 B1: pre-made brains on ENSv2 (docs/PLAN.md §3.3–3.4). The pure parts: config, names, derived wallets,
// records and the role bitmaps each party gets. Authority lives in these bitmaps, so they are pinned here.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mnemonicToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import { findRootDir } from "@supabrain/shared/config";
import {
  BRAIN_FAMILIES, BRAIN_REGISTRY_ROLES, BRAIN_TOKEN_ROLES, TEAM_RESOLVER_ROLES, BrainsConfigSchema, BrainsDeploymentSchema,
  brainAgentAccount, brainAgentName, brainAgentRecords, brainName, brainResolverVersion, ruleKeys,
} from "./brains";
import { ALL_ROLES, REGISTRY_ROLES, RESOLVER_ROLES, adminOf } from "./roles";

// The well-known public test mnemonic (Hardhat/Foundry default). Never a real secret.
const TEST_MNEMONIC = "test test test test test test test test test test test junk";
const real = JSON.parse(readFileSync(join(findRootDir(), "config", "brains.json"), "utf8"));
const APP_KEYS = { role: "sb.role", scope: "sb.scope", payCap: "sb.pay.cap", payDaily: "sb.pay.daily", status: "sb.status", memoryHead: "sb.memory.head", vendor: "sb.vendor", agentContext: "agent-context" };

describe("config/brains.json", () => {
  it("parses, with three families in derivation order and unique labels and indexes", () => {
    const cfg = BrainsConfigSchema.parse(real);
    expect(cfg.families).toEqual(["claude", "gemini", "openai"]);
    expect(new Set(cfg.brains.map((b) => b.label)).size).toBe(cfg.brains.length);
    expect(new Set(cfg.brains.map((b) => b.index)).size).toBe(cfg.brains.length);
    expect(cfg.brains.every((b) => b.index >= 1)).toBe(true); // 0 is left out: it is the default account any wallet derives first
  });

  it("rejects a duplicate label or index, a family out of order, and a non-integer write limit", () => {
    const dupLabel = { ...real, brains: [{ label: "otter", index: 1 }, { label: "otter", index: 2 }] };
    const dupIndex = { ...real, brains: [{ label: "otter", index: 1 }, { label: "maple", index: 1 }] };
    expect(BrainsConfigSchema.safeParse(dupLabel).success).toBe(false);
    expect(BrainsConfigSchema.safeParse(dupIndex).success).toBe(false);
    expect(BrainsConfigSchema.safeParse({ ...real, families: ["gemini", "claude", "openai"] }).success).toBe(false);
    expect(BrainsConfigSchema.safeParse({ ...real, records: { ...real.records, writeDaily: "lots" } }).success).toBe(false);
    expect(BrainsConfigSchema.safeParse({ ...real, brains: [{ label: "Bad Label", index: 1 }] }).success).toBe(false);
  });
});

describe("names", () => {
  it("brain = <label>.<team>.eth, AI = <family>.<brain>.<team>.eth", () => {
    expect(brainName("otter", "supabrain")).toBe("otter.supabrain.eth");
    expect(brainAgentName("gemini", "otter", "supabrain")).toBe("gemini.otter.supabrain.eth");
  });

  it("each AI gets its own resolver version (namehash of its full name): unique across brains and families", () => {
    const versions = new Set<bigint>();
    for (const b of ["otter", "maple"]) for (const f of BRAIN_FAMILIES) versions.add(brainResolverVersion(brainAgentName(f, b, "supabrain")));
    expect(versions.size).toBe(6);
  });
});

describe("derived AI wallets", () => {
  it("account = brain index, address = family index (claude 0, gemini 1, openai 2), the BIP-44 path Lane A derives too", () => {
    for (const [i, f] of BRAIN_FAMILIES.entries()) {
      const a = brainAgentAccount(TEST_MNEMONIC, 3, f);
      expect(a.address).toBe(mnemonicToAccount(TEST_MNEMONIC, { path: `m/44'/60'/3'/0/${i}` }).address);
    }
  });

  it("is deterministic and distinct per brain and family", () => {
    expect(brainAgentAccount(TEST_MNEMONIC, 1, "claude").address).toBe(brainAgentAccount(TEST_MNEMONIC, 1, "claude").address);
    const all = new Set<string>();
    for (const i of [1, 2]) for (const f of BRAIN_FAMILIES) all.add(brainAgentAccount(TEST_MNEMONIC, i, f).address);
    expect(all.size).toBe(6);
  });

  it("refuses an unknown family or a bad index", () => {
    expect(() => brainAgentAccount(TEST_MNEMONIC, 1, "llama" as never)).toThrow(/family/);
    expect(() => brainAgentAccount(TEST_MNEMONIC, -1, "claude")).toThrow(/index/);
  });
});

describe("records", () => {
  const cfg = BrainsConfigSchema.parse(real);
  const keys = ruleKeys(APP_KEYS, cfg);

  it("claude leads, the others work; vendor = family; open scope, 200 writes a day, no payments", () => {
    const ens = brainAgentName("claude", "otter", "supabrain");
    const r = brainAgentRecords(cfg, APP_KEYS, "otter", "claude", ens);
    expect(r).toMatchObject({ "sb.role": "lead", "sb.vendor": "claude", "sb.scope": "*", "sb.write.daily": "200", "sb.status": "active", "sb.pay.cap": "0", "sb.pay.daily": "0" });
    expect(r["agent-context"]).toContain(ens);
    expect(r["agent-context"]).not.toMatch(/\{\w+\}/); // every placeholder filled
    expect(brainAgentRecords(cfg, APP_KEYS, "otter", "openai", "openai.otter.supabrain.eth")["sb.role"]).toBe("worker");
  });

  it("rule keys come from config: status, scope, write limit, role", () => {
    expect(keys).toEqual({ status: "sb.status", scope: "sb.scope", writeDaily: "sb.write.daily", role: "sb.role" });
  });
});

describe("who holds what (authority)", () => {
  it("brain registry: register, renew, unregister, set resolver, each with its admin; nothing else", () => {
    const want = REGISTRY_ROLES.REGISTRAR | REGISTRY_ROLES.RENEW | REGISTRY_ROLES.UNREGISTER | REGISTRY_ROLES.SET_RESOLVER;
    expect(BRAIN_REGISTRY_ROLES).toBe(want | adminOf(want));
    expect(BRAIN_REGISTRY_ROLES & REGISTRY_ROLES.UPGRADE).toBe(0n);
    expect(BRAIN_REGISTRY_ROLES & REGISTRY_ROLES.SET_SUBREGISTRY).toBe(0n);
    expect(BRAIN_REGISTRY_ROLES & REGISTRY_ROLES.CAN_TRANSFER_ADMIN).toBe(0n);
  });

  it("the server's roles on a brain's own name: renew only (no transfer, re-point, unregister or admin)", () => {
    expect(BRAIN_TOKEN_ROLES).toBe(REGISTRY_ROLES.RENEW);
  });

  it("the server on each AI resolver: set text only, no address, no admin, no upgrade", () => {
    expect(TEAM_RESOLVER_ROLES).toBe(RESOLVER_ROLES.SET_TEXT);
    expect(TEAM_RESOLVER_ROLES & RESOLVER_ROLES.SET_ADDRESS).toBe(0n);
    expect(TEAM_RESOLVER_ROLES & adminOf(ALL_ROLES)).toBe(0n);
  });
});

describe("brains.sepolia.json schema", () => {
  const agent = { ens: "claude.otter.supabrain.eth", labelhash: `0x${"1".repeat(64)}`, wallet: `0x${"2".repeat(40)}`, resolver: `0x${"3".repeat(40)}`, resolverSalt: "1", accountIndex: 1, addressIndex: 0, expiry: 1, records: {}, txs: [] };
  const brain = { label: "otter", ens: "otter.supabrain.eth", index: 1, registry: `0x${"4".repeat(40)}`, registrySalt: "2", tokenOwner: `0x${"5".repeat(40)}`, expiry: 1, txs: [], agents: { claude: agent, gemini: { ...agent, addressIndex: 1 }, openai: { ...agent, addressIndex: 2 } } };

  it("accepts a complete brain and rejects one missing a family", () => {
    const base = { network: "sepolia", chainId: 1, teamRegistry: `0x${"6".repeat(40)}`, factory: `0x${"7".repeat(40)}`, updatedAt: "x", brains: { otter: brain } };
    expect(BrainsDeploymentSchema.safeParse(base).success).toBe(true);
    const { openai: _drop, ...two } = brain.agents;
    expect(BrainsDeploymentSchema.safeParse({ ...base, brains: { otter: { ...brain, agents: two } } }).success).toBe(false);
  });
});
