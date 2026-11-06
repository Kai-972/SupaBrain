// The policy signer's EIP-712 attestation for BrainVault.pay (contracts/src/BrainVault.sol).
// Field names, order and types must match PAYMENT_TYPEHASH exactly; attestation.test.ts pins a vector the
// Solidity tests accept on chain.
import { encodeAbiParameters, encodePacked, hashTypedData, keccak256, stringToHex } from "viem";
import type { LocalAccount } from "viem/accounts";

type Hex = `0x${string}`;

export interface VaultDomain {
  name: string; // config.app.payments.eip712.name
  version: string; // config.app.payments.eip712.version
  chainId: number; // from config/networks.json, checked against eth_chainId at startup
  verifyingContract: Hex; // from config/deployments/vault.sepolia.json
}

export interface VaultPayment {
  agent: Hex;
  payee: Hex;
  amount: bigint; // token base units
  roots: Hex[]; // keccak256(utf8(rootId))
  intentId: Hex; // 32 bytes, one-time on chain
  deadline: bigint; // unix seconds (uint64)
  humanApproved: boolean;
}

export const PAYMENT_TYPES = {
  Payment: [
    { name: "agent", type: "address" },
    { name: "payee", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "roots", type: "bytes32[]" },
    { name: "intentId", type: "bytes32" },
    { name: "deadline", type: "uint64" },
    { name: "humanApproved", type: "bool" },
  ],
} as const;

const B32 = /^0x[0-9a-fA-F]{64}$/;
const U64_MAX = 2n ** 64n - 1n;

export const rootHash = (rootId: string): Hex => keccak256(stringToHex(rootId));
export const rootsHash = (roots: Hex[]): Hex => keccak256(encodePacked(["bytes32[]"], [roots]));

export function newIntentId(): Hex {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return `0x${Buffer.from(b).toString("hex")}`;
}

/** Binds a World approval to one intent: keccak256(abi.encode(agent, payee, amount, rootsHash, intentId, intentExpiry)). */
export function intentHash(i: { agent: Hex; payee: Hex; amount: bigint; roots: Hex[]; intentId: Hex; intentExpiry: bigint }): Hex {
  return keccak256(encodeAbiParameters(
    [{ type: "address" }, { type: "address" }, { type: "uint256" }, { type: "bytes32" }, { type: "bytes32" }, { type: "uint64" }],
    [i.agent, i.payee, i.amount, rootsHash(i.roots), i.intentId, i.intentExpiry],
  ));
}

function check(p: VaultPayment): void {
  if (p.amount <= 0n) throw new Error("attestation amount must be > 0");
  if (p.deadline <= 0n || p.deadline > U64_MAX) throw new Error("attestation deadline out of uint64 range");
  if (!B32.test(p.intentId)) throw new Error("attestation intentId must be 32 bytes");
  for (const r of p.roots) if (!B32.test(r)) throw new Error("attestation root must be 32 bytes");
}

const typed = (domain: VaultDomain, message: VaultPayment) =>
  ({ domain, types: PAYMENT_TYPES, primaryType: "Payment", message }) as const;

export function attestationDigest(domain: VaultDomain, p: VaultPayment): Hex {
  return hashTypedData(typed(domain, p));
}

/** Signs with the policy signer. The key lives only in the server process (POLICY_SIGNER_PRIVATE_KEY). */
export async function signAttestation(signer: LocalAccount, domain: VaultDomain, p: VaultPayment): Promise<Hex> {
  check(p);
  return signer.signTypedData(typed(domain, p));
}
