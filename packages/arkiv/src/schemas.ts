// Arkiv entity schemas (docs/lanes/A-BRAIN.md "Arkiv schemas", arkiv/schema.md). Every schema indexes `app` and
// `team`; only columns a query filters on are indexed. `body` is JSON bytes (not indexed, not filterable).
// SDK 1.0.1 reserves some words as attribute names (`by`, `key`, `addr`, …): see arkiv/friction.md.
import { addr, bytes, defineSchema, i32, key, str, u64 } from "@arkiv-network/sdk/schema";

export const Memory = defineSchema("sb.memory", {
  app: str().indexed(),
  team: str().indexed(),
  kind: str().indexed(),
  folder: str().indexed(),
  trust: i32().indexed(),
  agent: str().indexed(),
  vendor: str().indexed(),
  seq: u64().indexed(),
  source: str().indexed().optional(),
  subject: str().indexed().optional(),
  address: addr().indexed().optional(),
  refKind: str().indexed().optional(),
  body: bytes(), // { text, parents[], roots[], ref?, supersedes? }
});

export const Edge = defineSchema("sb.edge", {
  app: str().indexed(),
  team: str().indexed(),
  parent: key().indexed(),
  child: key().indexed(),
});

export const Taint = defineSchema("sb.taint", {
  app: str().indexed(),
  team: str().indexed(),
  root: str().indexed(), // a source id or a human-root memory key (<= 128 bytes)
  memory: key().indexed(),
});

export const Revocation = defineSchema("sb.revocation", {
  app: str().indexed(),
  team: str().indexed(),
  targetType: str().indexed(), // source | agent | memory
  target: str().indexed(),
  revokedBy: str().indexed(),  // `by` is a reserved attribute name in SDK 1.0.1
  seq: u64().indexed(),
  body: bytes(),               // { reason, dryRun (incl. readers), vaultTx?, ensTx? }
});

export const Notice = defineSchema("sb.notice", {
  app: str().indexed(),
  team: str().indexed(),
  toAgent: str().indexed(),
  revocation: key().indexed(),
  body: bytes(),               // { text, affected[] }
});

export const Payment = defineSchema("sb.payment", {
  app: str().indexed(),
  team: str().indexed(),
  agent: str().indexed(),
  payee: addr().indexed(),
  status: str().indexed(),
  intent: str().indexed(),
  seq: u64().indexed(),
  body: bytes(),               // { amount, memo, reasons, path, txHash, approval }
});

export const ALL_SCHEMAS = [Memory, Edge, Taint, Revocation, Notice, Payment] as const;
