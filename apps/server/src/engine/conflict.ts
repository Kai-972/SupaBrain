// "Disputed by ENS" (docs/research/supermemory-plan.md #2). Supermemory-style memory resolves a contradiction
// latest-wins, which is exactly what a "bank details changed" email exploits. Here a memory that claims an address
// for a team vendor that differs from the vendor's own live ENS record is FLAGGED. Machines flag, humans retract:
// nothing is blocked or rewritten (the pay-time ENS check is the hard block). Computed on read, so a restart, a
// rebuild from Arkiv or a watcher merge never loses the flag.
import type { MemoryNode } from "@supabrain/shared";

/** Team vendor ENS name (lowercase) → its live ENS address, null if it has none, "unavailable" if ENS failed. */
export type VendorAddresses = ReadonlyMap<string, `0x${string}` | null | "unavailable">;

export type Dispute =
  | { state: "disputed"; subject: string; ensAddress: `0x${string}`; claimed: string[] }
  | { state: "unverified"; subject: string; reason: string };

// exactly 40 hex digits between word boundaries: 64-hex memory keys and tx hashes never match
const ADDRESS = /\b0x[0-9a-fA-F]{40}\b/g;

/** Every address a memory claims: its `address` field plus the addresses stated in its text (lowercase, unique). */
export function claimedAddresses(n: Pick<MemoryNode, "text" | "address">): string[] {
  const found = [...(n.address ? [n.address] : []), ...(n.text.match(ADDRESS) ?? [])];
  return [...new Set(found.map((a) => a.toLowerCase()))];
}

export function disputeOf(n: MemoryNode, vendors: VendorAddresses): Dispute | undefined {
  if (n.kind === "payment" || n.status === "expired" || !n.subject) return undefined;
  const subject = n.subject.toLowerCase();
  if (!vendors.has(subject)) return undefined; // only team vendors have a ground truth to compare with
  const claimed = claimedAddresses(n);
  if (claimed.length === 0) return undefined;
  const ens = vendors.get(subject);
  if (ens === "unavailable") return { state: "unverified", subject, reason: "ENS could not be read" };
  if (!ens) return { state: "unverified", subject, reason: "no address record on ENS" };
  const off = claimed.filter((a) => a !== ens.toLowerCase());
  return off.length ? { state: "disputed", subject, ensAddress: ens, claimed: off } : undefined;
}

export function disputeText(d: Dispute): string {
  return d.state === "disputed"
    ? `DISPUTED by ENS: ${d.subject}'s own ENS record says ${d.ensAddress}, but this memory claims ${d.claimed.join(", ")}. Do not pay it; pay ${d.subject} by name, and a human decides whether this memory is retracted.`
    : `UNVERIFIED: ${d.reason} for ${d.subject}; treat the address as unconfirmed.`;
}
