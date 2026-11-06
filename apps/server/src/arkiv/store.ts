// MemoryStore on Arkiv (A-BRAIN S2): one batch per memory, signed by the agent's own wallet, every entity handed to the
// team wallet in the same transaction (proven in the S1 spike), readonly, expiring. Startup rebuild + live watcher.
import { ExpirationTime, MAX_LIFETIME, type ExecuteBatchParameters } from "@arkiv-network/sdk";
import { addr, i32, key as keyValue, u64 } from "@arkiv-network/sdk/schema";
import { and, eq } from "@arkiv-network/sdk/query";
import type { Hex } from "viem";
import type { PrivateKeyAccount } from "viem/accounts";
import { createArkivWriter, decodeBody, Edge, encodeBody, Memory, Notice, Payment as PaymentSchema, Revocation, SignerQueue, Taint, type ArkivConnection } from "@supabrain/arkiv";
import { explorerLink, redactUrls, type CheckpointInfo, type FileInfo, type MemoryKind, type MemoryNode, type PayDecision, type Payment, type PrivateRef, type RevocationTarget, type SourceRef, type Trust, type Vendor } from "@supabrain/shared";
import { SELF_ROOT } from "../engine/lineage";
import type { MemoryDraft, MemoryStore, NoticeRecord, RevocationRecord, StoreWatchHandlers, WriteReceipt } from "../memory/store";

/** 17 creates + 17 ownership transfers = 34 ops → gas floor 1M + 33×400k = 14.2M, within half of Rabdi's 30M block. */
const MAX_CREATES_PER_BATCH = 17;
/** File contents ride in memory bodies: keep each transaction's bodies small (Arkiv caps bytes at 128 KiB per create). */
const MAX_BODY_BYTES_PER_TX = 100 * 1024;
const PAGE = 100;

export interface ArkivStoreDeps {
  conn: ArkivConnection;
  accessKey: string;
  chainId: number;
  registry: Hex;
  app: string;
  team: string;
  /** agent labels + "team" → their keys (the owner key is never here) */
  signers: Record<string, PrivateKeyAccount>;
  /** agent label → vendor, for memories loaded from Arkiv */
  vendors: Record<string, Vendor>;
  explorer: { tx: string; entity: string };
  lifetimeSec: { memory: number; evidence: number; notice: number; paymentIntent: number; paymentDecision: number };
  log?: (line: string) => void;
}

interface Body { text: string; parents: string[]; roots: string[]; createdAt: number; source?: SourceRef; ref?: PrivateRef; supersedes?: string; checkpoint?: CheckpointInfo; file?: FileInfo }

const val = (x: unknown): unknown => (x && typeof x === "object" && "value" in (x as object) ? (x as { value: unknown }).value : x);
const lower = (s: string) => s.toLowerCase();
const chunk = <T>(xs: T[], n: number): T[][] => (xs.length ? [xs.slice(0, n), ...chunk(xs.slice(n), n)] : []);

export function createArkivMemoryStore(d: ArkivStoreDeps): MemoryStore {
  const log = d.log ?? (() => undefined);
  const writeQueue = new SignerQueue();
  const planQueue = new SignerQueue(); // predict-then-write is atomic per signer, so predicted keys stay valid
  const writers = Object.fromEntries(
    Object.entries(d.signers).map(([label, account]) => [label, createArkivWriter({ rpc: d.conn.rpc, account, accessKey: d.accessKey, expectedChainId: d.chainId, registry: d.registry, queue: writeQueue })]),
  );
  const teamSigner = d.signers.team;
  if (!teamSigner) throw new Error("ArkivMemoryStore needs the team signer");
  const team: PrivateKeyAccount = teamSigner;
  const walletToLabel = new Map(Object.entries(d.signers).map(([label, a]) => [lower(a.address), label]));
  let blockSeconds: number | undefined;
  const secondsPerBlock = async () => (blockSeconds ??= (await d.conn.arkiv.getBlockTiming()).blockDuration);

  /** A row is ours only if $creator is the wallet of the agent it names (team wallet writes human "owner" memories). */
  function rowToNode(row: Record<string, unknown>, head: bigint, spb: number): MemoryNode | undefined {
    const key = String(val(row.$key));
    const creator = String(val(row.$creator));
    const agent = String(val(row.agent));
    const signer = walletToLabel.get(lower(creator));
    if (!signer || (signer === "team" ? agent !== "owner" : signer !== agent)) {
      log(`arkiv: skipping ${key}: agent "${agent}" was not written by its own wallet (creator ${creator})`);
      return undefined;
    }
    let body: Body;
    try {
      body = decodeBody<Body>(val(row.body) as Uint8Array);
      if (typeof body.text !== "string" || !Array.isArray(body.parents) || !Array.isArray(body.roots)) throw new Error("shape");
    } catch {
      log(`arkiv: skipping ${key}: body is not a Supabrain memory`);
      return undefined;
    }
    const expiresAtBlock = BigInt(val(row.$expiresAt) as bigint);
    const n: MemoryNode = {
      key: key as Hex, text: body.text, kind: String(val(row.kind)) as MemoryKind, folder: String(val(row.folder)),
      trust: Number(val(row.trust)) as Trust, agent, vendor: agent === "owner" ? "human" : (d.vendors[agent] ?? "claude"),
      seq: Number(val(row.seq)), createdAt: body.createdAt, expiresAt: Date.now() + Number(expiresAtBlock - head) * spb * 1000,
      parents: body.parents, roots: body.roots, status: "active", creator: creator as Hex, proofUrl: explorerLink(d.explorer.entity, { key }),
    };
    const subject = val(row.subject);
    const address = val(row.address);
    if (subject) n.subject = String(subject);
    if (address) n.address = String(address) as Hex;
    if (body.source) n.source = body.source;
    if (body.ref) n.ref = body.ref;
    if (body.supersedes) n.supersedes = body.supersedes;
    if (body.checkpoint) n.checkpoint = body.checkpoint;
    if (body.file) n.file = body.file;
    return n;
  }

  const memorySelect = { $key: true, $creator: true, $expiresAt: true, kind: true, folder: true, trust: true, agent: true, seq: true, subject: true, address: true, body: true } as const;

  async function fetchMemory(key: string): Promise<MemoryNode | undefined> {
    const page = await d.conn.arkiv.select(memorySelect).from(Memory).where(and(eq("$key", keyValue(key as Hex)), eq("app", d.app), eq("team", d.team))).limit(1).fetch();
    const row = page.entities[0] as Record<string, unknown> | undefined;
    return row ? rowToNode(row, page.blockNumber, await secondsPerBlock()) : undefined;
  }

  async function fetchRevocation(key: string): Promise<RevocationTarget | undefined> {
    const page = await d.conn.arkiv.select({ $key: true, targetType: true, target: true }).from(Revocation)
      .where(and(eq("$key", keyValue(key as Hex)), eq("app", d.app), eq("team", d.team))).createdBy(team.address).limit(1).fetch();
    const row = page.entities[0] as Record<string, unknown> | undefined;
    return row ? { type: String(val(row.targetType)) as RevocationTarget["type"], id: String(val(row.target)) } : undefined;
  }

  const teamWriter = writers.team!;
  const txUrl = (hash: string) => explorerLink(d.explorer.tx, { hash });

  type Row = { $key: unknown; $expiresAt: unknown };
  /** A memory's edge rows (as child) and taint rows, owned by the team (everything we write ends up there). */
  async function lineageRows(key: string): Promise<Row[]> {
    const k = keyValue(key as Hex);
    const [edges, taints] = await Promise.all([
      d.conn.arkiv.select({ $key: true, $expiresAt: true }).from(Edge).where(and(eq("app", d.app), eq("team", d.team), eq("child", k))).ownedBy(team.address).limit(PAGE).fetch(),
      d.conn.arkiv.select({ $key: true, $expiresAt: true }).from(Taint).where(and(eq("app", d.app), eq("team", d.team), eq("memory", k))).ownedBy(team.address).limit(PAGE).fetch(),
    ]);
    return [...(edges.entities as unknown as Row[]), ...(taints.entities as unknown as Row[])];
  }

  /**
   * One or more memories (+ edges, + taint rows except for file versions) signed by `signer`, owned by the team, in
   * order. Every key is predicted up front (owner, entity nonce + index, salt), so drafts can name each other with
   * "@<i>" and the caller gets all keys before anything is sent. Split into transactions of at most
   * MAX_CREATES_PER_BATCH creates and MAX_BODY_BYTES_PER_TX of bodies; the last draft lands last.
   */
  async function writeMemories(signer: string, drafts: MemoryDraft[]): Promise<{ keys: Hex[]; roots: string[][]; committed: Promise<WriteReceipt> }> {
    const account = d.signers[signer];
    const writer = writers[signer];
    if (!account || !writer) throw new Error(`no signing key for ${signer}`);
    if (!drafts.length) throw new Error("writeMemories needs at least one draft");
    let resolveKeys!: (v: { keys: Hex[]; roots: string[][] }) => void;
    let rejectKeys!: (e: unknown) => void;
    const known = new Promise<{ keys: Hex[]; roots: string[][] }>((res, rej) => { resolveKeys = res; rejectKeys = rej; });

    const committed = planQueue.run(signer, async (): Promise<WriteReceipt> => {
      const flags = { readonly: true };
      const counts = drafts.map((dr) => 1 + dr.parents.length + (dr.kind === "file" ? 0 : dr.roots.length));
      let predicted;
      try {
        predicted = await d.conn.arkiv.predictEntityKeys({ owner: account.address, count: counts.reduce((x, y) => x + y, 0) });
      } catch (e) {
        rejectKeys(e);
        throw e;
      }
      const offsets = counts.map((_, i) => counts.slice(0, i).reduce((x, y) => x + y, 0));
      const keys = offsets.map((o) => predicted[o]!.key as Hex);
      const swap = (x: string) => (/^@\d+$/.test(x) ? keys[Number(x.slice(1))]! : x);
      const roots = drafts.map((dr, i) => dr.roots.map((r) => (r === SELF_ROOT ? keys[i]! : swap(r))));
      resolveKeys({ keys, roots });

      type Item = { schema: unknown; values: unknown; bytes: number; expiration: ReturnType<typeof ExpirationTime.fromSeconds>; draft?: number };
      const items: Item[] = [];
      const lifetimes = drafts.map((dr) => (dr.kind === "evidence" ? d.lifetimeSec.evidence : d.lifetimeSec.memory));
      drafts.forEach((dr, i) => {
        const expiration = ExpirationTime.fromSeconds(lifetimes[i]!);
        const parents = dr.parents.map(swap);
        const body = encodeBody({
          text: dr.text, parents, roots: roots[i]!, createdAt: dr.createdAt, ...(dr.source ? { source: dr.source } : {}), ...(dr.ref ? { ref: dr.ref } : {}),
          ...(dr.supersedes ? { supersedes: dr.supersedes } : {}), ...(dr.checkpoint ? { checkpoint: dr.checkpoint } : {}), ...(dr.file ? { file: dr.file } : {}),
        } satisfies Body);
        items.push({
          schema: Memory, bytes: body.length, expiration, draft: i,
          values: {
            app: d.app, team: d.team, kind: dr.kind, folder: dr.folder, trust: i32(dr.trust), agent: dr.agent, vendor: dr.vendor, seq: u64(dr.seq),
            ...(dr.source ? { source: dr.source.id } : {}), ...(dr.subject ? { subject: dr.subject } : {}),
            ...(dr.address ? { address: addr(dr.address) } : {}), ...(dr.ref ? { refKind: dr.ref.kind } : {}), body,
          },
        });
        for (const parent of parents) items.push({ schema: Edge, bytes: 0, expiration, values: { app: d.app, team: d.team, parent: keyValue(parent as Hex), child: keyValue(keys[i]!) } });
        if (dr.kind !== "file") for (const root of roots[i]!) items.push({ schema: Taint, bytes: 0, expiration, values: { app: d.app, team: d.team, root, memory: keyValue(keys[i]!) } });
      });

      type Placed = Item & { key: Hex; salt: unknown };
      const parts: Placed[][] = [];
      let cur: Placed[] = [];
      let curBytes = 0;
      items.forEach((it, idx) => {
        if (cur.length && (cur.length >= MAX_CREATES_PER_BATCH || curBytes + it.bytes > MAX_BODY_BYTES_PER_TX)) { parts.push(cur); cur = []; curBytes = 0; }
        cur.push({ ...it, key: predicted[idx]!.key as Hex, salt: predicted[idx]!.salt });
        curBytes += it.bytes;
      });
      if (cur.length) parts.push(cur);

      const txOf: Hex[] = [];
      for (const part of parts) {
        const params = {
          creates: part.map((it) => ({ schema: it.schema, values: it.values, expiration: it.expiration, flags, salt: it.salt })),
          ...(signer === "team" ? {} : { ownershipChanges: part.map((it) => ({ entityKey: it.key, newOwner: team.address as Hex })) }),
        } as unknown as ExecuteBatchParameters;
        const r = await writer.executeBatch(params);
        const minted = r.createdEntities.map((k) => lower(String(k)));
        if (minted.length !== part.length || part.some((it, j) => lower(it.key) !== minted[j])) {
          throw new Error(`entity keys moved (predicted ${part[0]!.key}, minted ${minted[0]}): another writer used this wallet`);
        }
        for (const it of part) if (it.draft !== undefined) txOf[it.draft] = r.txHash as Hex;
        log(`arkiv: ${signer} wrote ${part.length} entities (${r.ops} ops, gas ${r.gasUsed}) in ${r.totalMs} ms tx ${r.txHash}`);
      }
      const lastI = drafts.length - 1;
      return {
        txHash: txOf[lastI]!, proofUrl: txUrl(txOf[lastI]!), expiresAt: drafts[lastI]!.createdAt + lifetimes[lastI]! * 1000,
        ...(drafts.length > 1 ? { proofUrls: txOf.map(txUrl), expiresAts: drafts.map((dr, i) => dr.createdAt + lifetimes[i]! * 1000) } : {}),
      };
    });
    committed.catch((e: Error) => log(`arkiv: write by ${signer} failed: ${redactUrls(e.message)}`));
    const { keys, roots } = await known;
    return { keys, roots, committed };
  }

  return {
    walletOf: (signer) => d.signers[signer]?.address as Hex | undefined,

    writeRevocation: (r: RevocationRecord) =>
      planQueue.run("team", async () => {
        const res = await teamWriter.executeBatch({
          creates: [{
            schema: Revocation,
            values: { app: d.app, team: d.team, targetType: r.target.type, target: r.target.id, revokedBy: r.revokedBy, seq: u64(r.seq), body: encodeBody({ reason: r.reason, dryRun: r.dryRun, at: r.at }) },
            expiration: ExpirationTime.max(), flags: { readonly: true },
          }],
        } as unknown as ExecuteBatchParameters);
        log(`arkiv: team wrote revocation ${r.target.type}:${r.target.id} (gas ${res.gasUsed}) tx ${res.txHash}`);
        return { key: res.createdEntities[0]! as Hex, txHash: res.txHash, proofUrl: txUrl(res.txHash), expiresAt: r.at + Number(MAX_LIFETIME) * (await secondsPerBlock()) * 1000 };
      }),

    writePayment: (p: Payment) =>
      planQueue.run("team", async () => {
        const pending = p.decision.status === "pending_human";
        const sec = pending ? d.lifetimeSec.paymentIntent : d.lifetimeSec.paymentDecision;
        const decision = p.decision as Record<string, unknown>;
        const res = await teamWriter.executeBatch({
          creates: [{
            schema: PaymentSchema,
            values: {
              app: d.app, team: d.team, agent: p.agent, payee: addr(p.payee), status: p.decision.status, intent: p.intentId, seq: u64(p.createdAt),
              body: encodeBody({
                amount: p.amount, memo: p.memo, payeeEns: p.payeeEns, lineage: p.lineage, reasons: decision.reasons ?? [], path: decision.path ?? [],
                txHash: decision.txHash, txUrl: decision.txUrl, error: decision.error,
                approval: decision.approval ? { id: (decision.approval as { id: string }).id, expiresAt: (decision.approval as { expiresAt: number }).expiresAt } : undefined, at: p.createdAt,
              }),
            },
            expiration: ExpirationTime.fromSeconds(sec), flags: { readonly: true },
          }],
        } as unknown as ExecuteBatchParameters);
        log(`arkiv: team recorded payment ${p.intentId} (${p.decision.status}) tx ${res.txHash}`);
        return { key: res.createdEntities[0]!, txHash: res.txHash, proofUrl: txUrl(res.txHash), expiresAt: Date.now() + sec * 1000 };
      }),

    writeNotices: (notices: NoticeRecord[]) =>
      planQueue.run("team", async () => {
        const expiration = ExpirationTime.fromSeconds(d.lifetimeSec.notice);
        let last;
        for (const part of chunk(notices, MAX_CREATES_PER_BATCH)) {
          last = await teamWriter.executeBatch({
            creates: part.map((n) => ({
              schema: Notice,
              values: { app: d.app, team: d.team, toAgent: n.toAgent, revocation: keyValue(n.revocation as Hex), body: encodeBody({ text: n.text, affected: n.affected, at: n.at }) },
              expiration, flags: { readonly: true },
            })),
          } as unknown as ExecuteBatchParameters);
        }
        return { txHash: last!.txHash, proofUrl: txUrl(last!.txHash), expiresAt: Date.now() + d.lifetimeSec.notice * 1000 };
      }),

    extendMemory: (key: string, seconds: number) =>
      planQueue.run("team", async () => {
        const spb = await secondsPerBlock();
        const mem = await d.conn.arkiv.select({ $key: true, $expiresAt: true, $owner: true }).from(Memory)
          .where(and(eq("$key", keyValue(key as Hex)), eq("app", d.app), eq("team", d.team))).limit(1).fetch();
        const m = mem.entities[0] as Record<string, unknown> | undefined;
        if (!m) throw new Error(`memory ${key} is not on Arkiv (expired?)`);
        if (lower(String(val(m.$owner))) !== lower(team.address)) throw new Error("the team wallet does not own this memory, so it cannot extend it");
        const target = mem.blockNumber + BigInt(Math.ceil(seconds / spb));
        const rows = await lineageRows(key);
        // Only rows that would actually live longer: the chain rejects an extension that shortens (ExpiryNotExtended).
        const keys = [{ $key: m.$key, $expiresAt: m.$expiresAt }, ...rows]
          .filter((r) => BigInt(val(r.$expiresAt) as bigint) < target).map((r) => String(val(r.$key)) as Hex);
        const expiresAt = Date.now() + seconds * 1000;
        if (keys.length === 0) return { txHash: "0x" as Hex, proofUrl: "", expiresAt: Date.now() + Number(BigInt(val(m.$expiresAt) as bigint) - mem.blockNumber) * spb * 1000, extended: 0 };
        let last;
        for (const part of chunk(keys, 34)) {
          last = await teamWriter.executeBatch({ extensions: part.map((entityKey) => ({ entityKey, expiration: ExpirationTime.fromSeconds(seconds) })) });
        }
        log(`arkiv: team kept ${key} (${keys.length} rows incl. edges/taints) for ${seconds}s tx ${last!.txHash}`);
        return { txHash: last!.txHash, proofUrl: txUrl(last!.txHash), expiresAt, extended: keys.length };
      }),
    entityUrl: (key) => explorerLink(d.explorer.entity, { key }),

    writeMemories,
    async writeMemory(signer: string, draft: MemoryDraft) {
      const r = await writeMemories(signer, [draft]);
      return { key: r.keys[0]!, roots: r.roots[0]!, committed: r.committed };
    },

    async loadPayments() {
      type Row = Record<string, unknown>;
      type Body = { amount: string; memo: string; payeeEns?: string; lineage?: string[]; reasons?: unknown[]; path?: string[]; txHash?: string; txUrl?: string; error?: string; approval?: { id: string; expiresAt: number }; at: number };
      const rows: { p: Payment; final: boolean; order: number }[] = [];
      let order = 0;
      for (let offset = 0; ; ) {
        const page = await d.conn.arkiv.select({ $key: true, agent: true, payee: true, status: true, intent: true, seq: true, body: true }).from(PaymentSchema)
          .where(and(eq("app", d.app), eq("team", d.team))).createdBy(team.address).limit(PAGE).offset(offset).fetch();
        for (const row of page.entities as unknown as Row[]) {
          let b: Body;
          try { b = decodeBody<Body>(val(row.body) as Uint8Array); } catch { continue; } // not ours
          const status = String(val(row.status)) as PayDecision["status"];
          const intentId = String(val(row.intent));
          const decision = (
            status === "paid" ? { status, txHash: b.txHash as Hex, txUrl: b.txUrl ?? "", intentId }
            : status === "blocked" ? { status, reasons: b.reasons ?? [], path: b.path ?? [], intentId }
            : status === "failed" ? { status, error: b.error ?? "", intentId }
            : status === "pending_human" ? { status, reasons: b.reasons ?? [], intentId, approval: { id: b.approval?.id ?? "", intentId, agent: String(val(row.agent)), payee: String(val(row.payee)) as Hex, amount: b.amount, reasons: b.reasons ?? [], userCode: "", verificationUri: "", expiresAt: b.approval?.expiresAt ?? 0 } }
            : { status, intentId }
          ) as PayDecision;
          rows.push({
            final: status !== "pending_human", order: order++,
            p: { intentId, agent: String(val(row.agent)), payee: String(val(row.payee)) as Hex, payeeEns: b.payeeEns, amount: b.amount, memo: b.memo, decision, createdAt: b.at ?? Number(val(row.seq)), lineage: b.lineage ?? [] },
          });
        }
        const covered = page.entities.length + page.skipped;
        if (covered < PAGE) break;
        offset += covered;
      }
      // one per intent: a final decision beats its pending row, whatever order the query returned them in
      const best = new Map<string, { p: Payment; final: boolean; order: number }>();
      for (const r of rows) {
        const have = best.get(r.p.intentId);
        if (!have || (r.final && !have.final) || (r.final === have.final && r.order > have.order)) best.set(r.p.intentId, r);
      }
      log(`arkiv: loaded ${best.size} payment decisions`);
      return [...best.values()].map((r) => r.p);
    },

    async loadAll() {
      const spb = await secondsPerBlock();
      const memories: MemoryNode[] = [];
      for (const [label, account] of Object.entries(d.signers)) {
        for (let offset = 0; ; ) {
          const page = await d.conn.arkiv.select(memorySelect).from(Memory).where(and(eq("app", d.app), eq("team", d.team)))
            .createdBy(account.address).limit(PAGE).offset(offset).fetch();
          for (const row of page.entities) {
            const n = rowToNode(row as Record<string, unknown>, page.blockNumber, spb);
            if (n) memories.push(n);
          }
          const covered = page.entities.length + page.skipped;
          if (covered < PAGE) break;
          offset += covered;
        }
        log(`arkiv: loaded memories created by ${label}`);
      }
      const revocations: RevocationTarget[] = [];
      for (let offset = 0; ; ) {
        const page = await d.conn.arkiv.select({ $key: true, targetType: true, target: true }).from(Revocation)
          .where(and(eq("app", d.app), eq("team", d.team))).createdBy(team.address).limit(PAGE).offset(offset).fetch();
        for (const row of page.entities as unknown as Record<string, unknown>[]) revocations.push({ type: String(val(row.targetType)) as RevocationTarget["type"], id: String(val(row.target)) });
        const covered = page.entities.length + page.skipped;
        if (covered < PAGE) break;
        offset += covered;
      }
      const notices: NoticeRecord[] = [];
      for (let offset = 0; ; ) {
        const page = await d.conn.arkiv.select({ $key: true, toAgent: true, revocation: true, body: true }).from(Notice)
          .where(and(eq("app", d.app), eq("team", d.team))).createdBy(team.address).limit(PAGE).offset(offset).fetch();
        for (const row of page.entities as unknown as Record<string, unknown>[]) {
          try {
            const b = decodeBody<{ text: string; affected: string[]; at: number }>(val(row.body) as Uint8Array);
            notices.push({ toAgent: String(val(row.toAgent)), revocation: String(val(row.revocation)), text: b.text, affected: b.affected ?? [], at: b.at });
          } catch { /* not ours */ }
        }
        const covered = page.entities.length + page.skipped;
        if (covered < PAGE) break;
        offset += covered;
      }
      return { memories, revocations, notices };
    },

    watch(h: StoreWatchHandlers) {
      const known = new Set(Object.values(d.signers).map((a) => lower(a.address)));
      return d.conn.arkiv.watchEntityEvents({
        pollingInterval: 1000,
        onEntityCreated: (e) => {
          if (!known.has(lower(e.owner))) return; // chain-wide stream: only our wallets can create our entities
          void (async () => {
            for (let attempt = 0; attempt < 3; attempt++) {
              try {
                const m = await fetchMemory(e.entityKey);
                if (m) return h.onMemory(m);
                if (lower(e.owner) === lower(team.address)) {
                  const r = await fetchRevocation(e.entityKey);
                  if (r) return h.onRevocation(r);
                }
                return; // an edge, taint or notice row: the graph does not need it
              } catch {
                await new Promise((r) => setTimeout(r, 1000));
              }
            }
          })();
        },
        onExpiryExtended: (e) => {
          void secondsPerBlock().then((spb) => h.onExtended(e.entityKey, Date.now() + Number(e.expiresAt - e.blockNumber) * spb * 1000));
        },
        onError: (err) => h.onError(new Error(redactUrls(err.message.split("\n")[0] ?? "watcher error"))),
      });
    },
  };
}
