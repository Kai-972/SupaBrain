// Pure helpers for ENS names, DNS encoding and the Verifiable Factory salt schemes (ENSv2 docs).
import { encodeAbiParameters, keccak256, namehash, stringToHex, toHex, type Hex } from "viem";
import { labelhash as viemLabelhash, packetToBytes } from "viem/ens";

export const labelhashOf = (label: string): Hex => viemLabelhash(label);
export const namehashOf = (name: string): Hex => namehash(name);
/** uint256 form of a labelhash: what registries take as `anyId` and what BrainVault stores. */
export const labelhashId = (label: string): bigint => BigInt(labelhashOf(label));

export const teamName = (teamLabel: string): string => `${teamLabel}.eth`;
export const agentName = (agentLabel: string, teamLabel: string): string => `${agentLabel}.${teamLabel}.eth`;

/** DNS wire-format name, as Permissioned Resolver setters take it. */
export function dnsEncode(name: string): Hex {
  return toHex(packetToBytes(name));
}

/** UserRegistry salt: uint256(keccak256(abi.encode(keccak256("UserRegistry"), namehash(name), version))). */
export function userRegistrySalt(name: string, version = 0n): bigint {
  return BigInt(
    keccak256(
      encodeAbiParameters(
        [{ type: "bytes32" }, { type: "bytes32" }, { type: "uint256" }],
        [keccak256(stringToHex("UserRegistry")), namehash(name), version],
      ),
    ),
  );
}

/**
 * PermissionedResolver salt: uint256(keccak256(abi.encode(keccak256("OwnedResolver"), owner, version))).
 * The docs use version 0 for an owner's default resolver; we deploy one resolver per agent, so `version` is the
 * agent's labelhash (deterministic, collision-free, and clear of the default version 0).
 */
export function ownedResolverSalt(owner: Hex, version: bigint): bigint {
  return BigInt(
    keccak256(
      encodeAbiParameters(
        [{ type: "bytes32" }, { type: "address" }, { type: "uint256" }],
        [keccak256(stringToHex("OwnedResolver")), owner, version],
      ),
    ),
  );
}
