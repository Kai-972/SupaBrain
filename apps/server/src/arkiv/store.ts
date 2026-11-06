// MemoryStore on Arkiv (A-BRAIN S2): one batch per memory, signed by the agent's own wallet, every entity handed to the
// team wallet in the same transaction (proven in the S1 spike), readonly, expiring. Startup rebuild + live watcher.
import { ExpirationTime, type ExecuteBatchParameters } from "@arkiv-network/sdk";
import { addr, i32, key as keyValue, u64 } from "@arkiv-network/sdk/schema";
import { and, eq } from "@arkiv-network/sdk/query";
import type { Hex } from "viem";
import type { PrivateKeyAccount } from "viem/accounts";
import { createArkivWriter, decodeBody, Edge, encodeBody, Memory, Revocation, SignerQueue, Taint, type ArkivConnection } from "@supabrain/arkiv";
import { explorerLink, redactUrls, type MemoryKind, type MemoryNode, type PrivateRef, type RevocationTarget, type SourceRef, type Trust, type Vendor } from "@supabrain/shared";
import { SELF_ROOT } from "../engine/lineage";
import type { MemoryDraft, MemoryStore, StoreWatchHandlers, WriteReceipt } from "../memory/store";

/** 17 creates + 17 ownership transfers = 34 ops → gas floor 1M + 33×400k = 14.2M, within half of Rabdi's 30M block. */
const MAX_CREATES_PER_BATCH = 17;
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
  lifetimeSec: { memory: number; evidence: number };
  log?: (line: string) => void;
}

interface Body { text: string; parents: string[]; roots: string[]; createdAt: number; source?: SourceRef; ref?: PrivateRef; supersedes?: string }

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

  return {
    walletOf: (signer) => d.signers[signer]?.address as Hex | undefined,
    entityUrl: (key) => explorerLink(d.explorer.entity, { key }),

    async writeMemory(signer: string, draft: MemoryDraft) {
      const account = d.signers[signer];
      const writer = writers[signer];
      if (!account || !writer) throw new Error(`no signing key for ${signer}`);
      let resolveKey!: (v: { key: Hex; roots: string[] }) => void;
      let rejectKey!: (e: unknown) => void;
      const keyKnown = new Promise<{ key: Hex; roots: string[] }>((res, rej) => { resolveKey = res; rejectKey = rej; });

      const committed = planQueue.run(signer, async (): Promise<WriteReceipt> => {
        const lifetime = draft.kind === "evidence" ? d.lifetimeSec.evidence : d.lifetimeSec.memory;
        const expiration = ExpirationTime.fromSeconds(lifetime);
        const flags = { readonly: true };
        const total = 1 + draft.parents.length + draft.roots.length;
        let firstKeys;
        try {
          firstKeys = await d.conn.arkiv.predictEntityKeys({ owner: account.address, count: Math.min(total, MAX_CREATES_PER_BATCH) });
        } catch (e) {
          rejectKey(e);
          throw e;
        }
        const memoryKey = firstKeys[0]!.key;
        const roots = draft.roots.map((r) => (r === SELF_ROOT ? memoryKey : r));
        resolveKey({ key: memoryKey, roots });

        const memoryValues = {
          app: d.app, team: d.team, kind: draft.kind, folder: draft.folder, trust: i32(draft.trust), agent: draft.agent, vendor: draft.vendor, seq: u64(draft.seq),
          ...(draft.source ? { source: draft.source.id } : {}), ...(draft.subject ? { subject: draft.subject } : {}),
          ...(draft.address ? { address: addr(draft.address) } : {}), ...(draft.ref ? { refKind: draft.ref.kind } : {}),
          body: encodeBody({ text: draft.text, parents: draft.parents, roots, createdAt: draft.createdAt, ...(draft.source ? { source: draft.source } : {}), ...(draft.ref ? { ref: draft.ref } : {}), ...(draft.supersedes ? { supersedes: draft.supersedes } : {}) } satisfies Body),
        };
        const items: { schema: unknown; values: unknown }[] = [
          { schema: Memory, values: memoryValues },
          ...draft.parents.map((parent) => ({ schema: Edge, values: { app: d.app, team: d.team, parent: keyValue(parent as Hex), child: keyValue(memoryKey) } })),
          ...roots.map((root) => ({ schema: Taint, values: { app: d.app, team: d.team, root, memory: keyValue(memoryKey) } })),
        ];

        let first: Awaited<ReturnType<typeof writer.executeBatch>> | undefined;
        for (const [i, part] of chunk(items, MAX_CREATES_PER_BATCH).entries()) {
          const keys = i === 0 ? firstKeys : await d.conn.arkiv.predictEntityKeys({ owner: account.address, count: part.length });
          const params = {
            creates: part.map((it, j) => ({ ...it, expiration, flags, salt: keys[j]!.salt })),
            ...(signer === "team" ? {} : { ownershipChanges: keys.map((k) => ({ entityKey: k.key, newOwner: team.address as Hex })) }),
          } as unknown as ExecuteBatchParameters;
          const r = await writer.executeBatch(params);
          if (i === 0) {
            if (lower(r.createdEntities[0] ?? "") !== lower(memoryKey)) throw new Error(`memory key moved (predicted ${memoryKey}, minted ${r.createdEntities[0]}): another writer used this wallet`);
            first = r;
          }
          log(`arkiv: ${signer} wrote ${part.length} entities (${r.ops} ops, gas ${r.gasUsed}) in ${r.totalMs} ms tx ${r.txHash}`);
        }
        return { txHash: first!.txHash, proofUrl: explorerLink(d.explorer.tx, { hash: first!.txHash }), expiresAt: draft.createdAt + lifetime * 1000 };
      });
      committed.catch((e: Error) => log(`arkiv: write by ${signer} failed: ${redactUrls(e.message)}`));
      const { key, roots } = await keyKnown;
      return { key, roots, committed };
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
      return { memories, revocations };
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
