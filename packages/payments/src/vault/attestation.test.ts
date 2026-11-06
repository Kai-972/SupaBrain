import { encodeAbiParameters, encodePacked, keccak256, recoverTypedDataAddress, stringToHex, toHex } from "viem";
import { privateKeyToAccount, privateKeyToAddress } from "viem/accounts";
import { describe, expect, it } from "vitest";
import { attestationDigest, PAYMENT_TYPES, intentHash, newIntentId, rootHash, rootsHash, signAttestation, type VaultDomain, type VaultPayment } from "./attestation";

// Foundry's makeAddrAndKey(label): key = uint256(keccak256(label)). Same derivation as contracts/test.
const fkey = (label: string) => keccak256(stringToHex(label));
const POLICY_KEY = fkey("policy");
const AGENT = privateKeyToAddress(fkey("lead-claude"));
const PAYEE = privateKeyToAddress(fkey("acme"));

// The vector from contracts/test/BrainVaultReview.t.sol (test_vec_castSignedTypedDataAccepted), accepted on chain.
const DOMAIN: VaultDomain = { name: "BrainVault", version: "1", chainId: 31337, verifyingContract: "0xF62849F9A0B5Bf2913b396098F7c7019b51A820a" };
const VECTOR: VaultPayment = {
  agent: AGENT,
  payee: PAYEE,
  amount: 1_000_000n,
  roots: [rootHash("0xH1"), rootHash("email:acme-0611")],
  intentId: `0x${"11".repeat(32)}`,
  deadline: 1762400300n,
  humanApproved: true,
};
const VECTOR_SIG =
  "0xb66f28f402efef4eaa68c137830cee9cbea15fa27f1f2e07523471b03ef0dc8b4834884959fd2fdd1beeec62be787ae773e63c42e66511efa2b571fc12be45901c";

describe("EIP-712 attestation (must match BrainVault byte for byte)", () => {
  it("reproduces the signature the Solidity test accepts on chain", async () => {
    const sig = await signAttestation(privateKeyToAccount(POLICY_KEY), DOMAIN, VECTOR);
    expect(sig).toBe(VECTOR_SIG);
  });

  it("digest equals a hand-built EIP-712 digest (independent of viem's typed-data helper)", () => {
    const domainSep = keccak256(encodeAbiParameters(
      [{ type: "bytes32" }, { type: "bytes32" }, { type: "bytes32" }, { type: "uint256" }, { type: "address" }],
      [
        keccak256(stringToHex("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)")),
        keccak256(stringToHex(DOMAIN.name)), keccak256(stringToHex(DOMAIN.version)), BigInt(DOMAIN.chainId), DOMAIN.verifyingContract,
      ],
    ));
    const typehash = keccak256(stringToHex(
      "Payment(address agent,address payee,uint256 amount,bytes32[] roots,bytes32 intentId,uint64 deadline,bool humanApproved)",
    ));
    const structHash = keccak256(encodeAbiParameters(
      [{ type: "bytes32" }, { type: "address" }, { type: "address" }, { type: "uint256" }, { type: "bytes32" }, { type: "bytes32" }, { type: "uint64" }, { type: "bool" }],
      [typehash, VECTOR.agent, VECTOR.payee, VECTOR.amount, keccak256(encodePacked(["bytes32[]"], [VECTOR.roots])), VECTOR.intentId, VECTOR.deadline, VECTOR.humanApproved],
    ));
    const manual = keccak256(encodePacked(["bytes2", "bytes32", "bytes32"], ["0x1901", domainSep, structHash]));
    expect(attestationDigest(DOMAIN, VECTOR)).toBe(manual);
  });

  it("recovers to the policy signer, and any changed field changes the digest", async () => {
    const signer = privateKeyToAccount(POLICY_KEY);
    const sig = await signAttestation(signer, DOMAIN, VECTOR);
    expect(await recoverTypedDataAddress({ ...typed(DOMAIN, VECTOR), signature: sig })).toBe(signer.address);
    const base = attestationDigest(DOMAIN, VECTOR);
    const variants: VaultPayment[] = [
      { ...VECTOR, amount: VECTOR.amount + 1n },
      { ...VECTOR, payee: AGENT },
      { ...VECTOR, roots: [VECTOR.roots[0]!] },
      { ...VECTOR, roots: [VECTOR.roots[1]!, VECTOR.roots[0]!] },
      { ...VECTOR, humanApproved: false },
      { ...VECTOR, deadline: VECTOR.deadline + 1n },
      { ...VECTOR, intentId: `0x${"22".repeat(32)}` },
    ];
    for (const v of variants) expect(attestationDigest(DOMAIN, v)).not.toBe(base);
    expect(attestationDigest({ ...DOMAIN, chainId: 11155111 }, VECTOR)).not.toBe(base);
  });

  it("rejects malformed payments before signing", async () => {
    const s = privateKeyToAccount(POLICY_KEY);
    await expect(signAttestation(s, DOMAIN, { ...VECTOR, amount: 0n })).rejects.toThrow(/amount/);
    await expect(signAttestation(s, DOMAIN, { ...VECTOR, deadline: 2n ** 64n })).rejects.toThrow(/deadline/);
    await expect(signAttestation(s, DOMAIN, { ...VECTOR, intentId: "0x1234" })).rejects.toThrow(/intentId/);
    await expect(signAttestation(s, DOMAIN, { ...VECTOR, roots: ["0x12"] })).rejects.toThrow(/root/);
  });
});

describe("intent hash and roots", () => {
  it("rootHash is keccak256(utf8(rootId)), like the contract tests", () => {
    expect(rootHash("email:acme-0611")).toBe(keccak256(toHex("email:acme-0611")));
  });

  it("rootsHash matches the contract's keccak256(abi.encodePacked(roots))", () => {
    expect(rootsHash(VECTOR.roots)).toBe(keccak256(encodePacked(["bytes32[]"], [VECTOR.roots])));
    expect(rootsHash([])).toBe(keccak256("0x"));
  });

  it("intentHash = keccak256(abi.encode(agent, payee, amount, rootsHash, intentId, intentExpiry))", () => {
    const i = { agent: AGENT, payee: PAYEE, amount: 5_000_000n, roots: VECTOR.roots, intentId: VECTOR.intentId, intentExpiry: 1762401000n };
    const expected = keccak256(encodeAbiParameters(
      [{ type: "address" }, { type: "address" }, { type: "uint256" }, { type: "bytes32" }, { type: "bytes32" }, { type: "uint64" }],
      [i.agent, i.payee, i.amount, rootsHash(i.roots), i.intentId, i.intentExpiry],
    ));
    expect(intentHash(i)).toBe(expected);
    expect(intentHash({ ...i, amount: 5_000_001n })).not.toBe(expected);
    expect(intentHash({ ...i, intentExpiry: i.intentExpiry + 1n })).not.toBe(expected);
  });

  it("newIntentId is a fresh 32-byte id", () => {
    const a = newIntentId();
    expect(a).toMatch(/^0x[0-9a-f]{64}$/);
    expect(newIntentId()).not.toBe(a);
  });
});

function typed(domain: VaultDomain, p: VaultPayment) {
  return { domain, types: PAYMENT_TYPES, primaryType: "Payment" as const, message: { ...p } };
}
