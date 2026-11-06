// pnpm arkiv:spike [--yes] [--only s1,s2,…]   S1 Arkiv spike (docs/lanes/A-BRAIN.md "S2. Arkiv").
// Dry run by default: every write is simulated (all safety checks + gas estimate) and nothing is signed.
// Entities are written under a separate `app` value (<appNamespace>-spike) so they never mix with the real graph.
//   s1 preflight          chain id, registry, balances, gas price, block timing
//   s2 one-tx ownership   agent creates a readonly memory and hands it to the team wallet in the SAME batch
//   s3 lineage batches    evidence+taint, then memory + 2 edges + 2 taints, all handed to the team wallet
//   s4 queries            app+team+folder, taint.root = X, edges by parent, $creator filter, indexing lag
//   s5 extend (Keep)      owner extends a readonly entity; Keep batch; negative controls (simulated reverts)
//   s6 watcher            watchEntityEvents sees creates/transfers, with latency
//   s7 expiry             a 60-second memory really disappears from queries; does the watcher say anything?
import { writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { decodeBody, encodeBody, Edge, Memory, Notice, Taint, ArkivWriteError, type BatchResult } from "@supabrain/arkiv";
import { ExpirationTime, MAX_LIFETIME } from "@arkiv-network/sdk";
import { addr, i32, key as keyValue, str, u64 } from "@arkiv-network/sdk/schema";
import { and, eq } from "@arkiv-network/sdk/query";
import { formatEther, type Hex } from "viem";
import { findRootDir } from "@supabrain/shared/config";
import { arkivContext, flagValue, hasFlag, type ArkivCtx } from "../lib/arkivctx";

const PROOF = () => join(findRootDir(), "config", "deployments", "arkiv.rabdi.json");
type Proof = Record<string, unknown> & { spike?: Record<string, unknown> };
const loadProof = (): Proof => (existsSync(PROOF()) ? (JSON.parse(readFileSync(PROOF(), "utf8")) as Proof) : {});
const bi = (_: string, v: unknown) => (typeof v === "bigint" ? v.toString() : v);
const save = (p: Proof) => writeFileSync(PROOF(), JSON.stringify(p, bi, 2) + "\n");
const ms = (n: number) => `${(n / 1000).toFixed(1)}s`;
const sleep = (n: number) => new Promise((r) => setTimeout(r, n));
/** Query rows wrap attribute values as { value }; system fields are plain. Tolerate both. */
const val = (x: unknown): unknown => (x && typeof x === "object" && "value" in (x as object) ? (x as { value: unknown }).value : x);

let maxFeeTglm = 0.25;
const log = (m: string) => console.log(m);

/** Simulate, print the plan, enforce the fee budget, and broadcast only with --yes. */
async function write(ctx: ArkivCtx, label: string, signer: "team" | string, params: Parameters<ReturnType<ArkivCtx["writer"]>["executeBatch"]>[0]): Promise<BatchResult | undefined> {
  const account = signer === "team" ? ctx.teamAccount : ctx.agentAccount(signer);
  const w = ctx.writer(account);
  const plan = await w.simulateBatch(params);
  const maxFee = Number(formatEther(plan.gas * plan.gasPrice));
  log(`  plan · ${label} · signer ${signer} (${account.address}) · ${plan.ops} ops · estimate ${plan.estimate} · gas ${plan.gas} · gasPrice ${plan.gasPrice} wei · worst-case fee ${maxFee.toFixed(6)} ${ctx.config.networks.rabdi.nativeSymbol} · estimate took ${plan.estimateMs} ms`);
  if (maxFee > maxFeeTglm) throw new Error(`worst-case fee ${maxFee} exceeds the --max-fee budget ${maxFeeTglm}`);
  if (!ctx.broadcast) return undefined;
  const r = await w.executeBatch(params);
  log(`  sent · ${label} · tx ${r.txHash}\n         ${ctx.txUrl(r.txHash)}\n         block ${r.blockNumber} · gasUsed ${r.gasUsed} of ${r.gasLimit} · total ${ms(r.totalMs)} · nonce ${r.nonce}`);
  return r;
}

function memoryValues(ctx: ArkivCtx, o: { kind: string; trust: 1 | 2 | 3; agent: string; vendor: string; seq: number; folder: string; source?: string; text: string; parents: string[]; roots: string[] }) {
  return {
    app: ctx.app, team: ctx.team, kind: o.kind, folder: o.folder, trust: i32(o.trust), agent: o.agent, vendor: o.vendor, seq: u64(o.seq),
    ...(o.source ? { source: o.source } : {}),
    body: encodeBody({ text: o.text, parents: o.parents, roots: o.roots }),
  };
}

const expiry = (ctx: ArkivCtx) => ExpirationTime.fromSeconds(ctx.config.app.arkivExpirySec.memory);
const READONLY = { readonly: true } as const;
const FOLDER = "research";
const AGENT = "gem-research";

// ───────────────────────────────────────────────────────────────────────────── s1
async function s1(ctx: ArkivCtx, proof: Proof) {
  log("\n── s1 preflight");
  const { rpc, arkiv } = ctx.conn;
  const sym = ctx.config.networks.rabdi.nativeSymbol;
  const [block, gasPrice, head, timing] = await Promise.all([rpc.getBlockNumber(), rpc.getGasPrice(), rpc.getBlock({ includeTransactions: false }), arkiv.getBlockTiming()]);
  log(`  chain ${ctx.chainId} ✓ (matches config) · block ${block} · gasPrice ${gasPrice} wei · block gas limit ${head.gasLimit} · block time ${timing.blockDuration}s`);
  log(`  max entity lifetime ${MAX_LIFETIME} blocks ≈ ${(Number(MAX_LIFETIME) * timing.blockDuration / 86400).toFixed(1)} days · memory lease ${ctx.config.app.arkivExpirySec.memory}s = ${ctx.config.app.arkivExpirySec.memory / timing.blockDuration} blocks`);
  for (const [name, address] of Object.entries(ctx.knownCreators)) log(`  creator ${name.padEnd(13)} ${address} · ${formatEther(await rpc.getBalance({ address, blockTag: "latest" }))} ${sym}`);
  log(`  app namespace for this spike: "${ctx.app}" · team "${ctx.team}"`);
  proof.network = ctx.config.networks.rabdi.name;
  proof.chainId = ctx.chainId;
  proof.registry = ctx.registry;
  proof.knownCreators = ctx.knownCreators;
  proof.limits = { maxLifetimeBlocks: MAX_LIFETIME, blockSeconds: timing.blockDuration, blockGasLimit: head.gasLimit, gasPriceWei: gasPrice };
}

// ───────────────────────────────────────────────────────────────────────────── s2
async function s2(ctx: ArkivCtx, proof: Proof) {
  log("\n── s2 create + hand to the team wallet in ONE batch");
  const agent = ctx.agentAccount(AGENT).address as Hex;
  const [m] = await ctx.conn.arkiv.predictEntityKeys({ owner: agent, count: 1 });
  const params = {
    creates: [{ schema: Memory, values: memoryValues(ctx, { kind: "fact", trust: 2, agent: AGENT, vendor: "gemini", seq: 1, folder: FOLDER, text: "spike: single-tx create + transfer", parents: [], roots: [] }), expiration: expiry(ctx), flags: READONLY, salt: m.salt }],
    ownershipChanges: [{ entityKey: m.key, newOwner: ctx.teamAccount.address as Hex }],
  };
  const r = await write(ctx, "memory + transfer", AGENT, params);
  if (!r) return;
  const row = await readBack(ctx, m.key);
  const same = String(row.creator).toLowerCase() === agent.toLowerCase() && String(row.owner).toLowerCase() === ctx.teamAccount.address.toLowerCase();
  log(`  $creator ${row.creator} (${AGENT})\n  $owner   ${row.owner} (team)\n  → creator ≠ owner after ONE transaction: ${same ? "YES ✓" : "NO ✗"} · expiresAt block ${row.expiresAt}`);
  (proof.spike ??= {}).s2 = { key: m.key, tx: r.txHash, creator: row.creator, owner: row.owner, sameBatchTransfer: same, expiresAtBlock: row.expiresAt, gas: { used: r.gasUsed, limit: r.gasLimit, estimate: r.estimate, ops: r.ops }, totalMs: r.totalMs };
}

async function readBack(ctx: ArkivCtx, entityKey: Hex, tries = 10) {
  for (let i = 0; i < tries; i++) {
    const page = await ctx.conn.arkiv.select({ $key: true, $creator: true, $owner: true, $expiresAt: true }).where(eq("$key", keyValue(entityKey))).fetch();
    const row = page.entities[0] as Record<string, unknown> | undefined;
    if (row) return { creator: val(row.$creator) as string, owner: val(row.$owner) as string, expiresAt: val(row.$expiresAt) as bigint, attempts: i + 1 };
    await sleep(1000);
  }
  throw new Error(`entity ${entityKey} not visible to queries after ${tries}s`);
}

// ───────────────────────────────────────────────────────────────────────────── s3
interface Lineage { e1: Hex; e2: Hex; t1: Hex; t2: Hex; m: Hex; edge1: Hex; edge2: Hex; tm1: Hex; tm2: Hex; r1: string; r2: string; txs: Record<string, string> }
async function s3(ctx: ArkivCtx, proof: Proof) {
  log("\n── s3 lineage: two evidence memories (+taint), then a memory derived from both (+2 edges, +2 taints)");
  const agent = ctx.agentAccount(AGENT).address as Hex;
  const team = ctx.teamAccount.address as Hex;
  const stamp = Date.now().toString(36);
  const r1 = `spike-email-${stamp}`, r2 = `spike-web-${stamp}`;
  const ex = expiry(ctx);

  // batch A: E1, T1, E2, T2 (+4 transfers)
  const [e1, t1, e2, t2] = await ctx.conn.arkiv.predictEntityKeys({ owner: agent, count: 4 });
  const batchA = {
    creates: [
      { schema: Memory, values: memoryValues(ctx, { kind: "evidence", trust: 1, agent: AGENT, vendor: "gemini", seq: 2, folder: FOLDER, source: r1, text: "spike evidence: email says vendor wallet changed", parents: [], roots: [r1] }), expiration: ex, flags: READONLY, salt: e1.salt },
      { schema: Taint, values: { app: ctx.app, team: ctx.team, root: r1, memory: keyValue(e1.key) }, expiration: ex, flags: READONLY, salt: t1.salt },
      { schema: Memory, values: memoryValues(ctx, { kind: "evidence", trust: 1, agent: AGENT, vendor: "gemini", seq: 3, folder: FOLDER, source: r2, text: "spike evidence: web page lists the vendor address", parents: [], roots: [r2] }), expiration: ex, flags: READONLY, salt: e2.salt },
      { schema: Taint, values: { app: ctx.app, team: ctx.team, root: r2, memory: keyValue(e2.key) }, expiration: ex, flags: READONLY, salt: t2.salt },
    ],
    ownershipChanges: [e1, t1, e2, t2].map((x) => ({ entityKey: x.key, newOwner: team })),
  };
  const a = await write(ctx, "evidence ×2 + taint ×2 + transfers", AGENT, batchA);
  if (!a) { await dryPlanB(ctx, e1.key, e2.key, r1, r2); return; }

  // batch B: M (parents E1,E2), edge E1→M, edge E2→M, taint r1→M, taint r2→M (+5 transfers)
  const [m, ed1, ed2, tm1, tm2] = await ctx.conn.arkiv.predictEntityKeys({ owner: agent, count: 5 });
  const batchB = {
    creates: [
      { schema: Memory, values: memoryValues(ctx, { kind: "fact", trust: 1, agent: AGENT, vendor: "gemini", seq: 4, folder: FOLDER, text: "spike: vendor wallet changed (derived from the email and the web page)", parents: [e1.key, e2.key], roots: [r1, r2] }), expiration: ex, flags: READONLY, salt: m.salt },
      { schema: Edge, values: { app: ctx.app, team: ctx.team, parent: keyValue(e1.key), child: keyValue(m.key) }, expiration: ex, flags: READONLY, salt: ed1.salt },
      { schema: Edge, values: { app: ctx.app, team: ctx.team, parent: keyValue(e2.key), child: keyValue(m.key) }, expiration: ex, flags: READONLY, salt: ed2.salt },
      { schema: Taint, values: { app: ctx.app, team: ctx.team, root: r1, memory: keyValue(m.key) }, expiration: ex, flags: READONLY, salt: tm1.salt },
      { schema: Taint, values: { app: ctx.app, team: ctx.team, root: r2, memory: keyValue(m.key) }, expiration: ex, flags: READONLY, salt: tm2.salt },
    ],
    ownershipChanges: [m, ed1, ed2, tm1, tm2].map((x) => ({ entityKey: x.key, newOwner: team })),
  };
  const b = await write(ctx, "memory + 2 edges + 2 taints + transfers", AGENT, batchB);
  if (!b) return;
  const lineage: Lineage = { e1: e1.key, e2: e2.key, t1: t1.key, t2: t2.key, m: m.key, edge1: ed1.key, edge2: ed2.key, tm1: tm1.key, tm2: tm2.key, r1, r2, txs: { evidence: a.txHash, derived: b.txHash } };
  const sp = (proof.spike ??= {});
  sp.s3 = { lineage, gas: { batchA: { used: a.gasUsed, limit: a.gasLimit, estimate: a.estimate, ops: a.ops, totalMs: a.totalMs }, batchB: { used: b.gasUsed, limit: b.gasLimit, estimate: b.estimate, ops: b.ops, totalMs: b.totalMs } } };
  log(`  gas per op: batch A ${a.gasUsed / BigInt(a.ops)} (${a.ops} ops) · batch B ${b.gasUsed / BigInt(b.ops)} (${b.ops} ops)`);
}

/** Dry run only: show the plan for the second batch with placeholder parents so the op count and gas are visible. */
async function dryPlanB(ctx: ArkivCtx, p1: Hex, p2: Hex, r1: string, r2: string) {
  const agent = ctx.agentAccount(AGENT).address as Hex;
  const team = ctx.teamAccount.address as Hex;
  const ex = expiry(ctx);
  const [m, ed1, ed2, tm1, tm2] = await ctx.conn.arkiv.predictEntityKeys({ owner: agent, count: 5 });
  await write(ctx, "memory + 2 edges + 2 taints + transfers (plan only: parents not created yet)", AGENT, {
    creates: [
      { schema: Memory, values: memoryValues(ctx, { kind: "fact", trust: 1, agent: AGENT, vendor: "gemini", seq: 4, folder: FOLDER, text: "plan", parents: [p1, p2], roots: [r1, r2] }), expiration: ex, flags: READONLY, salt: m.salt },
      { schema: Edge, values: { app: ctx.app, team: ctx.team, parent: keyValue(p1), child: keyValue(m.key) }, expiration: ex, flags: READONLY, salt: ed1.salt },
      { schema: Edge, values: { app: ctx.app, team: ctx.team, parent: keyValue(p2), child: keyValue(m.key) }, expiration: ex, flags: READONLY, salt: ed2.salt },
      { schema: Taint, values: { app: ctx.app, team: ctx.team, root: r1, memory: keyValue(m.key) }, expiration: ex, flags: READONLY, salt: tm1.salt },
      { schema: Taint, values: { app: ctx.app, team: ctx.team, root: r2, memory: keyValue(m.key) }, expiration: ex, flags: READONLY, salt: tm2.salt },
    ],
    ownershipChanges: [m, ed1, ed2, tm1, tm2].map((x) => ({ entityKey: x.key, newOwner: team })),
  });
}

// ───────────────────────────────────────────────────────────────────────────── s4
async function s4(ctx: ArkivCtx, proof: Proof) {
  log("\n── s4 queries");
  const lineage = (proof.spike?.s3 as { lineage?: Lineage } | undefined)?.lineage;
  if (!lineage) return log("  needs s3 results (run s3 with --yes first)");
  const { arkiv } = ctx.conn;
  const agent = ctx.agentAccount(AGENT).address as Hex;
  const timed = async <T>(name: string, fn: () => Promise<T>) => { const t = Date.now(); const out = await fn(); log(`  ${name}: ${Date.now() - t} ms`); return out; };
  const results: Record<string, unknown> = {};

  const mem = await timed("memories  app+team+folder", () =>
    arkiv.select({ $key: true, $creator: true, $owner: true, $expiresAt: true, kind: true, trust: true, agent: true, seq: true, body: true })
      .from(Memory).where(and(eq("app", ctx.app), eq("team", ctx.team), eq("folder", FOLDER))).limit(100).fetch());
  const keys = mem.entities.map((r) => String(val((r as Record<string, unknown>).$key)).toLowerCase());
  const want = [lineage.e1, lineage.e2, lineage.m].map((k) => k.toLowerCase());
  const memOk = want.every((k) => keys.includes(k));
  log(`    → ${mem.entities.length} rows, block ${mem.blockNumber}; contains E1, E2 and M: ${memOk ? "YES ✓" : "NO ✗"}`);
  const mrow = mem.entities.find((r) => String(val((r as Record<string, unknown>).$key)).toLowerCase() === lineage.m.toLowerCase()) as Record<string, unknown> | undefined;
  if (mrow) log(`    → M body decodes: ${JSON.stringify(decodeBody(val(mrow.body) as Uint8Array))}`);
  results.memories = { rows: mem.entities.length, containsAll: memOk };

  const taint = await timed(`taint     root = ${lineage.r1}`, () =>
    arkiv.select({ $key: true, memory: true }).from(Taint).where(and(eq("app", ctx.app), eq("team", ctx.team), eq("root", lineage.r1))).limit(100).fetch());
  const tmems = taint.entities.map((r) => String(val((r as Record<string, unknown>).memory)).toLowerCase());
  const tOk = tmems.includes(lineage.e1.toLowerCase()) && tmems.includes(lineage.m.toLowerCase()) && tmems.length === 2;
  log(`    → ${taint.entities.length} rows (expect E1 and M, nothing else): ${tOk ? "YES ✓" : "NO ✗"}`);
  results.taintByRoot = { rows: taint.entities.length, ok: tOk };

  const edges = await timed("edges     parent = E1", () =>
    arkiv.select({ $key: true, child: true }).from(Edge).where(and(eq("app", ctx.app), eq("team", ctx.team), eq("parent", keyValue(lineage.e1)))).limit(100).fetch());
  const eOk = edges.entities.length === 1 && String(val((edges.entities[0] as Record<string, unknown>).child)).toLowerCase() === lineage.m.toLowerCase();
  log(`    → ${edges.entities.length} row(s), child is M: ${eOk ? "YES ✓" : "NO ✗"}`);
  results.edgesByParent = { rows: edges.entities.length, ok: eOk };

  const byCreator = await timed("memories  createdBy(agent)", () =>
    arkiv.select({ $key: true }).from(Memory).where(and(eq("app", ctx.app), eq("team", ctx.team))).createdBy(agent).limit(100).fetch());
  const stranger = ctx.knownCreators["lead-claude"] as Hex;
  const none = await timed("memories  createdBy(other known wallet)", () =>
    arkiv.select({ $key: true }).from(Memory).where(and(eq("app", ctx.app), eq("team", ctx.team))).createdBy(stranger).limit(100).fetch());
  log(`    → agent: ${byCreator.entities.length} rows · other wallet: ${none.entities.length} rows (creator filter separates writers: ${byCreator.entities.length > 0 && none.entities.length === 0 ? "YES ✓" : "NO ✗"})`);
  results.creatorFilter = { agentRows: byCreator.entities.length, otherRows: none.entities.length };

  const owned = await timed("memories  ownedBy(team)", () =>
    arkiv.select({ $key: true }).from(Memory).where(and(eq("app", ctx.app), eq("team", ctx.team))).ownedBy(ctx.teamAccount.address as Hex).limit(100).fetch());
  log(`    → team owns ${owned.entities.length} of the memories`);
  results.ownedByTeam = owned.entities.length;

  const typed = await timed("memories  trust = 1 (typed i32 filter)", () =>
    arkiv.select({ $key: true }).from(Memory).where(and(eq("app", ctx.app), eq("team", ctx.team), eq("trust", i32(1)))).limit(100).fetch());
  log(`    → ${typed.entities.length} rows`);
  results.trustFilter = typed.entities.length;

  (proof.spike ??= {}).s4 = results;
  void addr; void str;
}

// ───────────────────────────────────────────────────────────────────────────── s5
async function expectFail(ctx: ArkivCtx, name: string, signer: string, params: Parameters<ReturnType<ArkivCtx["writer"]>["simulateBatch"]>[0], expect: string) {
  const account = signer === "team" ? ctx.teamAccount : ctx.agentAccount(signer);
  try {
    await ctx.writer(account).simulateBatch(params);
    log(`  ✗ ${name}: simulation SUCCEEDED but should have been refused (${expect})`);
    return { name, refused: false };
  } catch (e) {
    const msg = e instanceof ArkivWriteError ? e.message : String(e);
    const ok = msg.includes(expect);
    log(`  ${ok ? "✓" : "✗"} ${name}: refused as ${expect}? ${ok ? "yes" : "NO"}  (${msg.slice(0, 150)})`);
    return { name, refused: true, expected: expect, matched: ok, message: msg.slice(0, 300) };
  }
}

async function s5(ctx: ArkivCtx, proof: Proof) {
  log("\n── s5 extend / Keep on readonly entities, plus negative controls");
  const lineage = (proof.spike?.s3 as { lineage?: Lineage } | undefined)?.lineage;
  if (!lineage) return log("  needs s3 results (run s3 with --yes first)");
  const results: Record<string, unknown> = {};
  const keepSec = ctx.config.app.keep.defaultDays * 86400;
  const before = await readBack(ctx, lineage.m as Hex);
  log(`  M: creator ${before.creator} · owner ${before.owner} · expiresAt block ${before.expiresAt}`);

  // negative controls first (simulation only: a refusal costs nothing)
  log("  negative controls (simulated; each must be refused by the chain):");
  results.controls = [
    await expectFail(ctx, "creator (agent) extends after handing over ownership", AGENT, { extensions: [{ entityKey: lineage.m as Hex, expiration: ExpirationTime.fromSeconds(keepSec) }] }, "NotOwner"),
    await expectFail(ctx, "owner (team) patches a readonly memory", "team", { patches: [{ schema: Memory, entityKey: lineage.m as Hex, set: { kind: "decision" } }] }, "ReadOnlyEntity"),
    await expectFail(ctx, "owner shortens the lifetime", "team", { extensions: [{ entityKey: lineage.m as Hex, expiration: ExpirationTime.fromSeconds(120) }] }, "ExpiryNotExtended"),
    await expectFail(ctx, "creator (agent) takes ownership back", AGENT, { ownershipChanges: [{ entityKey: lineage.m as Hex, newOwner: ctx.agentAccount(AGENT).address as Hex }] }, "NotOwner"),
  ];

  // the real answer: can the owner extend a readonly entity?
  const r = await write(ctx, "owner extends readonly M", "team", { extensions: [{ entityKey: lineage.m as Hex, expiration: ExpirationTime.fromSeconds(keepSec) }] });
  if (!r) return;
  const after = await readBack(ctx, lineage.m as Hex);
  const grew = after.expiresAt > before.expiresAt;
  const gained = Number(after.expiresAt - before.expiresAt) * 2;
  log(`  expiresAt block ${before.expiresAt} → ${after.expiresAt} (+${(gained / 86400).toFixed(2)} days): extend on a READONLY entity by its owner ${grew ? "WORKS ✓" : "DID NOT EXTEND ✗"}`);
  results.extendReadonly = { works: grew, before: before.expiresAt, after: after.expiresAt, tx: r.txHash, gas: { used: r.gasUsed, limit: r.gasLimit, ops: r.ops }, totalMs: r.totalMs };

  // Keep = memory + its edges + its taint rows in ONE owner-signed batch (CLAUDE.md §7 rule 6)
  const ex = ExpirationTime.fromSeconds(keepSec * 2);
  const k = await write(ctx, "Keep: memory + 2 edges + 2 taints", "team", {
    extensions: [lineage.m, lineage.edge1, lineage.edge2, lineage.tm1, lineage.tm2].map((entityKey) => ({ entityKey: entityKey as Hex, expiration: ex })),
  });
  if (k) {
    const rows = await Promise.all([lineage.m, lineage.edge1, lineage.edge2, lineage.tm1, lineage.tm2].map((x) => readBack(ctx, x as Hex)));
    const allGrew = rows.every((x) => x.expiresAt > after.expiresAt);
    log(`  Keep batch: all five rows now expire later: ${allGrew ? "YES ✓" : "NO ✗"} (block ${rows[0]!.expiresAt})`);
    results.keepBatch = { allExtended: allGrew, tx: k.txHash, ops: k.ops, gas: { used: k.gasUsed, limit: k.gasLimit }, totalMs: k.totalMs };
  }
  (proof.spike ??= {}).s5 = results;
}

// ───────────────────────────────────────────────────────────────────────────── s6
async function s6(ctx: ArkivCtx, proof: Proof) {
  log("\n── s6 watchEntityEvents");
  const events: { type: string; key: string; at: number; block: bigint }[] = [];
  const errors: string[] = [];
  const t0 = Date.now();
  const unwatch = ctx.conn.arkiv.watchEntityEvents({
    pollingInterval: 1000,
    onEvent: (e) => events.push({ type: e.type, key: String((e as { entityKey: string }).entityKey), at: Date.now(), block: e.blockNumber }),
    onError: (e) => errors.push(e.message.split("\n")[0] ?? "error"),
  });
  log("  watcher started (it only sees events after its first poll)");
  await sleep(2500);
  const agent = ctx.agentAccount(AGENT).address as Hex;
  const [n] = await ctx.conn.arkiv.predictEntityKeys({ owner: agent, count: 1 });
  const sentAt = Date.now();
  const r = await write(ctx, "notice + transfer (watcher target)", AGENT, {
    creates: [{ schema: Notice, values: { app: ctx.app, team: ctx.team, toAgent: "lead-claude", revocation: keyValue(n.key), body: encodeBody({ text: "spike notice", affected: [] }) }, expiration: expiry(ctx), flags: READONLY, salt: n.salt }],
    ownershipChanges: [{ entityKey: n.key, newOwner: ctx.teamAccount.address as Hex }],
  });
  if (r) {
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline && !(events.some((e) => e.key.toLowerCase() === n.key.toLowerCase() && e.type === "EntityCreated") && events.some((e) => e.key.toLowerCase() === n.key.toLowerCase() && e.type === "OwnershipTransferred"))) await sleep(500);
  }
  unwatch();
  const mine = events.filter((e) => r && e.key.toLowerCase() === n.key.toLowerCase());
  for (const e of mine) log(`  event ${e.type.padEnd(21)} block ${e.block} · seen ${ms(e.at - sentAt)} after submit`);
  const fired = mine.some((e) => e.type === "EntityCreated");
  if (r) log(`  watcher fired for the create: ${fired ? "YES ✓" : "NO ✗"} · ${events.length} events total in ${ms(Date.now() - t0)} · errors: ${errors.length}${errors[0] ? ` (${errors[0]})` : ""}`);
  (proof.spike ??= {}).s6 = r ? { fired, events: mine.map((e) => ({ type: e.type, block: e.block, latencyMsFromSubmit: e.at - sentAt })), errors } : { skipped: "dry run" };
}

// ───────────────────────────────────────────────────────────────────────────── s7
async function s7(ctx: ArkivCtx, proof: Proof) {
  log("\n── s7 expiry: a 60-second memory must vanish from queries by itself");
  const agent = ctx.agentAccount(AGENT).address as Hex;
  const [n] = await ctx.conn.arkiv.predictEntityKeys({ owner: agent, count: 1 });
  const events: { type: string; key: string; block: bigint }[] = [];
  const unwatch = ctx.conn.arkiv.watchEntityEvents({
    pollingInterval: 1000,
    onEvent: (e) => events.push({ type: e.type, key: String((e as { entityKey: string }).entityKey), block: e.blockNumber }),
    onError: () => undefined,
  });
  const r = await write(ctx, "60 s memory + transfer", AGENT, {
    creates: [{ schema: Memory, values: memoryValues(ctx, { kind: "fact", trust: 2, agent: AGENT, vendor: "gemini", seq: 90, folder: FOLDER, text: "spike: expires in 60 seconds", parents: [], roots: [] }), expiration: ExpirationTime.fromSeconds(60), flags: READONLY, salt: n.salt }],
    ownershipChanges: [{ entityKey: n.key, newOwner: ctx.teamAccount.address as Hex }],
  });
  if (!r) { unwatch(); return; }
  const row = await readBack(ctx, n.key);
  log(`  created at block ${r.blockNumber}, expiresAt block ${row.expiresAt} (+${Number(row.expiresAt - r.blockNumber)} blocks)`);
  const gone = async () => (await ctx.conn.arkiv.select({ $key: true }).where(eq("$key", keyValue(n.key))).fetch()).entities.length === 0;
  const deadline = Date.now() + 150_000;
  let goneAtHead: bigint | undefined;
  let polls = 0;
  while (Date.now() < deadline) {
    polls++;
    if (await gone()) { goneAtHead = await ctx.conn.rpc.getBlockNumber(); break; }
    await sleep(2000);
  }
  await sleep(6000); // give the watcher time to say something at expiry, if it ever does
  unwatch();
  const mine = events.filter((e) => e.key.toLowerCase() === n.key.toLowerCase());
  const expiryEvents = mine.filter((e) => e.type !== "EntityCreated" && e.type !== "OwnershipTransferred");
  const vanished = goneAtHead !== undefined;
  log(`  vanished from queries: ${vanished ? `YES ✓ (first seen gone at head block ${goneAtHead}, expiry block was ${row.expiresAt}, after ${polls} polls)` : "NO ✗ within 150 s"}`);
  log(`  events for this key: ${mine.map((e) => `${e.type}@${e.block}`).join(", ")} · extra event at expiry: ${expiryEvents.length ? expiryEvents.map((e) => e.type).join(",") : "none (the server must emit `expired` itself)"}`);
  (proof.spike ??= {}).s7 = { key: n.key, tx: r.txHash, createdBlock: r.blockNumber, expiresAtBlock: row.expiresAt, vanished, goneAtHeadBlock: goneAtHead, eventsForKey: mine.map((e) => ({ type: e.type, block: e.block })), eventAtExpiry: expiryEvents.length > 0 };
}

// ───────────────────────────────────────────────────────────────────────────── main
const STEPS: Record<string, (ctx: ArkivCtx, proof: Proof) => Promise<void>> = { s1, s2, s3, s4, s5, s6, s7 };

async function main() {
  const only = flagValue("only")?.split(",") ?? Object.keys(STEPS);
  const fee = flagValue("max-fee");
  if (fee) maxFeeTglm = Number(fee);
  const ctx = await arkivContext({ appSuffix: "-spike" });
  const proof = loadProof();
  for (const name of only) {
    const step = STEPS[name];
    if (!step) throw new Error(`unknown step ${name}; have ${Object.keys(STEPS).join(", ")}`);
    await step(ctx, proof);
    if (ctx.broadcast) save(proof);
  }
  if (ctx.broadcast) log(`\nproof written to config/deployments/arkiv.rabdi.json`);
  else log(`\n(dry run: nothing written. Re-run with --yes to broadcast${hasFlag("only") ? "" : "; use --only s1,s2 to go step by step"}.)`);
}

main().catch((e) => { console.error(`\n✗ ${e instanceof Error ? e.message : e}`); process.exit(1); });
