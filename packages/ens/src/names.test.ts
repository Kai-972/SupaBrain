import { describe, expect, it } from "vitest";
import { encodeAbiParameters, keccak256, stringToHex } from "viem";
import { agentName, dnsEncode, labelhashId, labelhashOf, namehashOf, ownedResolverSalt, teamName, userRegistrySalt } from "./names";
import { ALL_ROLES, REGISTRY_ROLES, RESOLVER_ROLES, TEAM_OWNER_REGISTRY_ROLES, adminOf, withAdmin } from "./roles";

describe("names", () => {
  it("builds team and agent names", () => {
    expect(teamName("supabrain")).toBe("supabrain.eth");
    expect(agentName("lead-claude", "supabrain")).toBe("lead-claude.supabrain.eth");
  });

  it("hashes match well-known ENS vectors", () => {
    expect(namehashOf("eth")).toBe("0x93cdeb708b7545dc668eb9280176169d1c33cfd8ed6f04690a0bcc88a93fc4ae");
    expect(labelhashOf("eth")).toBe("0x4f5b812789fc606be1b3b16908db13fc7a9adf7ca72641f84d75b47069d3d7f0");
    expect(labelhashId("eth")).toBe(BigInt("0x4f5b812789fc606be1b3b16908db13fc7a9adf7ca72641f84d75b47069d3d7f0"));
  });

  it("DNS-encodes names (length-prefixed labels, zero terminator)", () => {
    expect(dnsEncode("eth")).toBe("0x03657468" + "00");
    expect(dnsEncode("a.eth")).toBe("0x0161" + "03657468" + "00");
    // lead-claude(11) supabrain(9) eth(3)
    expect(dnsEncode("lead-claude.supabrain.eth")).toBe(
      "0x0b" + Buffer.from("lead-claude").toString("hex") + "09" + Buffer.from("supabrain").toString("hex") + "03657468" + "00",
    );
  });

  it("UserRegistry salt follows the documented scheme", () => {
    const expected = BigInt(
      keccak256(
        encodeAbiParameters(
          [{ type: "bytes32" }, { type: "bytes32" }, { type: "uint256" }],
          [keccak256(stringToHex("UserRegistry")), namehashOf("supabrain.eth"), 0n],
        ),
      ),
    );
    expect(userRegistrySalt("supabrain.eth")).toBe(expected);
    expect(userRegistrySalt("supabrain.eth", 1n)).not.toBe(expected);
    expect(userRegistrySalt("other.eth")).not.toBe(expected);
  });

  it("resolver salts differ per version and per owner", () => {
    const a = "0x000000000000000000000000000000000000dEaD" as const;
    const b = "0x000000000000000000000000000000000000bEEF" as const;
    expect(ownedResolverSalt(a, 0n)).not.toBe(ownedResolverSalt(a, 1n));
    expect(ownedResolverSalt(a, 7n)).not.toBe(ownedResolverSalt(b, 7n));
    expect(ownedResolverSalt(a, 7n)).toBe(ownedResolverSalt(a, 7n));
  });
});

describe("roles", () => {
  it("matches the documented bit positions", () => {
    expect(REGISTRY_ROLES.REGISTRAR).toBe(1n);
    expect(REGISTRY_ROLES.RENEW).toBe(1n << 16n);
    expect(REGISTRY_ROLES.UNREGISTER).toBe(1n << 12n);
    expect(REGISTRY_ROLES.SET_RESOLVER).toBe(1n << 24n);
    expect(RESOLVER_ROLES.SET_TEXT).toBe(1n << 4n);
    expect(adminOf(RESOLVER_ROLES.SET_TEXT)).toBe((1n << 4n) << 128n);
  });

  it("ALL_ROLES covers every role slot and every admin slot, and nothing else", () => {
    expect(ALL_ROLES.toString(16)).toBe("1".repeat(64));
    for (const r of [...Object.values(RESOLVER_ROLES), REGISTRY_ROLES.REGISTRAR, REGISTRY_ROLES.SET_RESOLVER]) {
      expect(ALL_ROLES & r).toBe(r);
    }
  });

  it("the team owner can register, renew, unregister and set resolvers, with admins, but cannot upgrade", () => {
    const need = REGISTRY_ROLES.REGISTRAR | REGISTRY_ROLES.RENEW | REGISTRY_ROLES.UNREGISTER | REGISTRY_ROLES.SET_RESOLVER;
    expect(TEAM_OWNER_REGISTRY_ROLES).toBe(withAdmin(need));
    expect(TEAM_OWNER_REGISTRY_ROLES & REGISTRY_ROLES.UPGRADE).toBe(0n);
    expect(TEAM_OWNER_REGISTRY_ROLES & adminOf(REGISTRY_ROLES.UPGRADE)).toBe(0n);
  });
});
