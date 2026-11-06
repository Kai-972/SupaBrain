// The v2 tools behind MCP `continue`, `checkpoint` and `checkout` (docs/PLAN.md §3.2). Every call re-checks ENS live
// (requireActive), works on the in-memory graph and writes to Arkiv as the AI's own wallet. A checkpoint with its
// tasks, notes and file versions is ONE write (store.writeMemories); the checkpoint lands last.
import { createHash } from "node:crypto";
import type { MemoryKind, MemoryNode, SourceRef } from "@supabrain/shared";
import { currentFiles, frontier, heads, LIMITS, NOTE_KINDS, renderPack, resolveTaskRef, resumePack, scanSecrets, taskRef, taskViews, validatePath, type ResumePack } from "../engine/continuity";
import { scanInjection, type InjectionHit } from "../engine/guard";
import { computeLineage, scopeAllows, validateSource } from "../engine/lineage";
import { searchMemories } from "../engine/search";
import type { Notice } from "../engine/session";
import type { BlockedEntry } from "@supabrain/shared";
import { ToolError, type MemoryService, type ServiceDeps } from "./service";
import { draftRef, type MemoryDraft } from "./store";

export interface CheckpointInput {
  summary: string;
  next?: string;
  done?: string[];
  add_tasks?: string[];
  notes?: { text: string; kind?: "fact" | "decision" | "plan" | "evidence"; source?: SourceRef }[];
  files?: { path: string; content?: string; delete?: boolean }[];
}

const FOLDER = "project"; // checkpoints, tasks and notes are brain-wide; files are scoped by path
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const utf8 = (s: string) => Buffer.byteLength(s, "utf8");
const bad = (m: string): never => { throw new ToolError("INVALID", m); };

export type ContinuityService = ReturnType<typeof createContinuityService>;

/** Refusals worth showing on the website's live "blocked" feed (an ENS rule or the guard decided them). */
const BLOCK_CODES = new Set(["NOT_AUTHORIZED", "SCOPE", "RATE_LIMIT", "STOPPED", "KEY_MISMATCH", "AUTHORITY_UNKNOWN"]);
const DAY_MS = 86_400_000;

/** The last 200 refusals and stops, newest first; each one is also streamed as `blocked`. */
export class BlockedLog {
  private readonly entries: BlockedEntry[] = [];
  constructor(private readonly emit: (b: BlockedEntry) => void, private readonly capacity = 200) {}
  record(b: BlockedEntry): BlockedEntry {
    this.entries.unshift(b);
    if (this.entries.length > this.capacity) this.entries.pop();
    this.emit(b);
    return b;
  }
  list(): BlockedEntry[] {
    return [...this.entries];
  }
}

export type StopHandler = (key: string, reason: string) => Promise<{ arkivUrl?: string }>;

export function createContinuityService(d: ServiceDeps & { service: MemoryService; blocked: BlockedLog }) {
  const now = d.now ?? Date.now;
  const log = d.log ?? (() => undefined);
  const { graph, readSets, readLog, store, bus } = d;
  const brainName = d.config.app.team.displayName;
  const teamEns = `${d.config.app.ens.teamLabel}.eth`;

  /** File versions travel without their content in events and lists (the content can be large). */
  const lean = (n: MemoryNode): MemoryNode => (n.kind === "file" ? { ...n, text: "" } : n);

  function notesFor(focus: string | undefined): MemoryNode[] | undefined {
    if (!focus?.trim()) return undefined;
    const pool = graph.all().filter((n) => NOTE_KINDS.has(n.kind) && n.status === "active");
    const hits = searchMemories(pool, focus, { limit: LIMITS.packNotes });
    const recent = pool.slice(-LIMITS.packNotes).reverse().filter((n) => !hits.some((h) => h.key === n.key));
    return [...hits, ...recent].slice(0, LIMITS.packNotes);
  }

  /** `continue`: where things stand. What it shows becomes the agent's read-set, so its next checkpoint descends from it. */
  let stopHandler: StopHandler | undefined;
  async function guarded<T>(agent: string, tool: BlockedEntry["tool"], fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof ToolError && BLOCK_CODES.has(e.code)) {
        d.blocked.record({ at: now(), agent, tool, code: e.code, ...(e.rule ? { rule: e.rule } : {}), message: e.message });
      }
      throw e;
    }
  }

  async function resume(agent: string, o: { focus?: string; tokenId?: string; client?: string } = {}): Promise<{ text: string; pack: ResumePack; notices: Notice[] }> {
    return guarded(agent, "continue", () => resumeInner(agent, o));
  }
  async function resumeInner(agent: string, o: { focus?: string; tokenId?: string; client?: string }): Promise<{ text: string; pack: ResumePack; notices: Notice[] }> {
    const a = await d.service.requireActive(agent);
    await d.service.whoami(agent, { tokenId: o.tokenId, client: o.client }); // announces `connected` once per token
    const pack = resumePack(graph, { agent: a.ens, team: teamEns, name: brainName, now: now(), notes: notesFor(o.focus) });
    readSets.add(agent, pack.readKeys);
    readLog.record(agent, pack.readKeys);
    // `continue` delivers unread notices once and marks them read (v1's check_notices is hidden from the AIs);
    // checkpoint and checkout still carry any that arrive later.
    return { text: renderPack(pack, now()), pack, notices: d.notices.markRead(agent) };
  }

  function checkpoint(agent: string, i: CheckpointInput, client?: string) {
    return guarded(agent, "checkpoint", () => checkpointInner(agent, i, client));
  }
  async function checkpointInner(agent: string, i: CheckpointInput, client?: string) {
    const a = await d.service.requireActive(agent);
    if (a.role === "observer") throw new ToolError("NOT_AUTHORIZED", `${a.ens} is an observer and cannot save checkpoints`, d.config.app.ens.textKeys.role);
    // ENS sb.write.daily: checkpoints in the last 24 h (an absent record means no limit)
    if (a.writeDaily !== undefined) {
      const limit = Number(a.writeDaily);
      const since = now() - DAY_MS;
      const count = graph.all().filter((n) => n.kind === "checkpoint" && n.agent === agent && n.createdAt > since).length;
      const key = d.config.app.ens.textKeys.writeDaily ?? "sb.write.daily";
      if (count >= limit) throw new ToolError("RATE_LIMIT", `${a.ens} reached its ENS limit ${key}=${limit} (${count} checkpoints in the last 24 h). Stop and tell the user; the owner can raise it on the Rules page.`, key);
    }

    // ---- validate everything before anything is written
    const summary = (i.summary ?? "").trim();
    if (!summary) bad("summary is required: one or two lines on what you did");
    if (summary.length > LIMITS.summaryChars) bad(`summary is over ${LIMITS.summaryChars} characters`);
    if (i.next && i.next.length > LIMITS.nextChars) bad(`next is over ${LIMITS.nextChars} characters`);
    const tasks = taskViews(graph);
    const done: string[] = [];
    for (const ref of i.done ?? []) {
      const key = resolveTaskRef(tasks.filter((t) => t.status !== "quarantined"), ref);
      if (!key) bad(`no task "${ref}"; use the task ids from continue (e.g. ${tasks.find((t) => t.status === "open") ? taskRef(tasks.find((t) => t.status === "open")!.key) : "t:1a2b3c4d"})`);
      if (!done.includes(key!)) done.push(key!);
    }
    const addTasks = (i.add_tasks ?? []).map((t) => t.trim()).filter(Boolean);
    if (addTasks.length > LIMITS.tasksPerCheckpoint) bad(`at most ${LIMITS.tasksPerCheckpoint} new tasks per checkpoint`);
    for (const t of addTasks) if (t.length > LIMITS.titleChars) bad(`task title over ${LIMITS.titleChars} characters: "${t.slice(0, 40)}…"`);
    const notes = i.notes ?? [];
    if (notes.length > 10) bad("at most 10 notes per checkpoint");
    for (const n of notes) {
      if (!n.text?.trim() || n.text.length > 4000) bad("each note needs text (≤ 4000 characters)");
      if (n.kind === "evidence" && !n.source) bad('a note of kind "evidence" needs source {type, id}: where did it come from?');
      if (n.source) { try { validateSource(n.source); } catch (e) { bad((e as Error).message); } }
      const leak = scanSecrets(n.text);
      if (leak) bad(`a note was refused: ${leak}. Supabrain is stored on a public chain; never save secrets`);
    }
    const files = i.files ?? [];
    if (files.length > LIMITS.filesPerCheckpoint) bad(`at most ${LIMITS.filesPerCheckpoint} files per checkpoint; save the rest in another checkpoint`);
    let total = 0;
    const current = currentFiles(graph);
    const fileDrafts: { path: string; content: string; deleted: boolean }[] = [];
    const unchanged: string[] = [];
    for (const f of files) {
      try { validatePath(f.path); } catch (e) { bad((e as Error).message); }
      if (!scopeAllows(a.scope, f.path)) throw new ToolError("SCOPE", `${a.ens} may only write files under "${a.scope.replace(/\/+$/, "")}/" (its ENS sb.scope record), not "${f.path}"`, d.config.app.ens.textKeys.scope);
      if (f.delete) { if (current.has(f.path)) fileDrafts.push({ path: f.path, content: "", deleted: true }); continue; }
      if (typeof f.content !== "string") bad(`file "${f.path}" needs its full content (or delete: true)`);
      if (f.content!.includes("\u0000")) bad(`"${f.path}" is binary; only text files are stored`);
      const size = utf8(f.content!);
      if (size > LIMITS.fileBytes) bad(`"${f.path}" is ${size} bytes; the limit is ${LIMITS.fileBytes} per file`);
      const leak = scanSecrets(f.content!);
      if (leak) bad(`"${f.path}" was refused: ${leak}. Supabrain is stored on a public chain; never save secrets`);
      total += size;
      if (current.get(f.path)?.file?.sha256 === sha256(f.content!)) { unchanged.push(f.path); continue; }
      fileDrafts.push({ path: f.path, content: f.content!, deleted: false });
    }
    if (total > LIMITS.checkpointBytes) bad(`files total ${total} bytes; the limit is ${LIMITS.checkpointBytes} per checkpoint`);

    // ---- Stop: injected instructions travelling between AIs are saved for review but stopped for every other AI
    let hit: InjectionHit | undefined;
    for (const t of [summary, i.next ?? "", ...addTasks, ...notes.map((n) => n.text), ...fileDrafts.filter((f) => !f.deleted).map((f) => f.content)]) {
      hit = scanInjection(t);
      if (hit) break;
    }

    // ---- lineage: my previous checkpoint + what I read since (other AIs' commits, notes, evidence) + the tasks I ticked
    const own = heads(graph).get(agent);
    const read = readSets.parentsFor(agent);
    const readKeys = (read.ok ? read.parents : []).filter((k) => { const n = graph.get(k); return !!n && n.status === "active" && n.kind !== "task" && n.kind !== "file"; });
    // Commits link to commits (the commit graph stays readable); what else was read (notes, evidence) and the ticked
    // tasks are parents too, so stopping one of them still reaches this work. Each group is reduced on its own.
    const isCp = (k: string) => graph.get(k)?.kind === "checkpoint";
    const cpKeys = [...(own ? [own.key] : []), ...readKeys.filter(isCp)];
    let parentKeys = [...new Set([...frontier(graph, cpKeys), ...frontier(graph, readKeys.filter((k) => !isCp(k))), ...done])];
    const max = d.config.app.readSet.maxParents + 4;
    if (parentKeys.length > max) parentKeys = [...parentKeys.filter((k) => k === own?.key || done.includes(k)), ...parentKeys.filter((k) => k !== own?.key && !done.includes(k)).slice(-max)].slice(0, max);
    const parents = parentKeys.map((k) => graph.get(k)!).filter(Boolean);
    const cpLineage = computeLineage({ kind: "checkpoint", author: "agent", parents });

    // ---- drafts: tasks, notes, files (children of the checkpoint), then the checkpoint itself, last
    const createdAt = now();
    const cpIndex = addTasks.length + notes.length + fileDrafts.length;
    const cpParent = { key: draftRef(cpIndex) as `0x${string}`, trust: cpLineage.trust, roots: cpLineage.roots };
    const base = { agent, vendor: a.vendor, createdAt };
    const drafts: MemoryDraft[] = [];
    for (const title of addTasks) {
      const l = computeLineage({ kind: "task", author: "agent", parents: [cpParent] });
      drafts.push({ ...base, text: title, kind: "task", folder: FOLDER, trust: l.trust, seq: graph.nextSeq(), parents: [cpParent.key], roots: l.roots });
    }
    for (const n of notes) {
      const kind: MemoryKind = n.kind ?? "fact";
      const l = computeLineage({ kind, author: "agent", parents: [cpParent], ...(n.source ? { source: n.source } : {}) });
      drafts.push({ ...base, text: n.text.trim(), kind, folder: FOLDER, trust: l.trust, seq: graph.nextSeq(), parents: [cpParent.key], roots: l.roots, ...(n.source ? { source: n.source } : {}) });
    }
    for (const f of fileDrafts) {
      drafts.push({
        ...base, text: f.content, kind: "file", folder: f.path, trust: cpLineage.trust, seq: graph.nextSeq(), parents: [cpParent.key], roots: cpLineage.roots,
        file: { path: f.path, size: utf8(f.content), sha256: f.deleted ? "" : sha256(f.content), ...(f.deleted ? { deleted: true } : {}) },
      });
    }
    drafts.push({
      ...base, text: summary, kind: "checkpoint", folder: FOLDER, trust: cpLineage.trust, seq: graph.nextSeq(), parents: parentKeys, roots: cpLineage.roots,
      checkpoint: { done, ...(i.next?.trim() ? { next: i.next.trim() } : {}), ...(client ? { client } : {}) },
    });

    let written;
    try { written = await store.writeMemories(agent, drafts); }
    catch (e) { throw new ToolError("WRITE_FAILED", `the checkpoint was not written: ${(e as Error).message}`); }

    const swap = (k: string) => (/^@\d+$/.test(k) ? written.keys[Number(k.slice(1))]! : k);
    const lifetime = d.config.app.arkivExpirySec.memory * 1000;
    const nodes: MemoryNode[] = drafts.map((dr, idx) => ({
      ...dr, key: written.keys[idx]!, parents: dr.parents.map(swap), roots: written.roots[idx]!, expiresAt: createdAt + lifetime,
      status: "active", pending: true, creator: a.wallet,
    }));
    for (const n of nodes) graph.upsert(n);
    for (const n of nodes) bus.emit({ t: "memory", node: lean(graph.get(n.key)!), edges: n.parents.map((parent) => ({ parent, child: n.key })) });
    readSets.reset(agent);
    written.committed.then(
      (r) => nodes.forEach((n, idx) => {
        const proofUrl = r.proofUrls?.[idx] ?? r.proofUrl;
        graph.patch(n.key, { pending: false, proofUrl, expiresAt: r.expiresAts?.[idx] ?? r.expiresAt });
        bus.emit({ t: "confirmed", key: n.key, proofUrl });
      }),
      (e: Error) => {
        for (const n of nodes) { graph.remove(n.key); bus.emit({ t: "write_failed", key: n.key, error: e.message }); }
        log(`checkpoint by ${agent} failed: ${e.message}`);
      },
    );
    const cp = nodes[nodes.length - 1]!;
    let stopped: { rule: string; excerpt: string; arkivUrl?: string } | undefined;
    if (hit) {
      // Revoke the checkpoint at once: it and everything under it (its tasks, notes, files) is quarantined for every AI.
      const reason = `stopped: ${hit.rule}`;
      let arkivUrl: string | undefined;
      try { arkivUrl = stopHandler ? (await stopHandler(cp.key, reason)).arkivUrl : undefined; }
      catch (e) { log(`stop of ${cp.key} could not be written to Arkiv: ${(e as Error).message}`); }
      if (!graph.isRevoked({ type: "memory", id: cp.key })) graph.applyRevocation({ type: "memory", id: cp.key }); // in memory at least
      stopped = { rule: hit.rule, excerpt: hit.excerpt, ...(arkivUrl ? { arkivUrl } : {}) };
      d.blocked.record({ at: now(), agent, ens: a.ens, tool: "checkpoint", code: "STOPPED", rule: hit.rule, key: cp.key, excerpt: hit.excerpt, message: `${a.ens} saved content that looks like ${hit.rule.replace(/-/g, " ")}; it is stopped and waits for the owner's review`, ...(arkivUrl ? { arkivUrl } : {}) });
    }
    return {
      ...(stopped ? { stopped } : {}),
      key: cp.key, trust: cp.trust, parents: cp.parents, done, pending: true as const,
      tasksAdded: nodes.filter((n) => n.kind === "task").map((n) => ({ key: n.key, id: taskRef(n.key), title: n.text })),
      files: { saved: fileDrafts.filter((f) => !f.deleted).map((f) => f.path), deleted: fileDrafts.filter((f) => f.deleted).map((f) => f.path), unchanged },
      notes: nodes.filter((n) => NOTE_KINDS.has(n.kind)).map((n) => n.key),
      notices: d.notices.unread(agent),
    };
  }

  /** `checkout`: the current version of each file (or the ones asked for). Reading them puts their checkpoints in the read-set. */
  function checkout(agent: string, o: { paths?: string[] } = {}) {
    return guarded(agent, "checkout", () => checkoutInner(agent, o));
  }
  async function checkoutInner(agent: string, o: { paths?: string[] }) {
    await d.service.requireActive(agent);
    const all = [...currentFiles(graph).values()].sort((x, y) => x.file!.path.localeCompare(y.file!.path));
    const wanted = o.paths?.length ? all.filter((n) => o.paths!.some((p) => n.file!.path === p || n.file!.path.startsWith(`${p.replace(/\/+$/, "")}/`))) : all;
    const size = wanted.reduce((s, n) => s + n.file!.size, 0);
    const manifest = all.map((n) => ({ path: n.file!.path, size: n.file!.size, agent: n.agent, at: n.createdAt }));
    if (!o.paths?.length && size > LIMITS.checkoutBytes) {
      return { files: [], manifest, tooBig: true as const, notices: d.notices.unread(agent) };
    }
    const cps = [...new Set(wanted.map((n) => n.parents[0]).filter((k): k is string => !!k))];
    readSets.add(agent, cps);
    readLog.record(agent, wanted.map((n) => n.key));
    return {
      files: wanted.map((n) => ({ path: n.file!.path, content: n.text, size: n.file!.size, agent: n.agent, vendor: n.vendor, at: n.createdAt, key: n.key })),
      manifest, tooBig: false as const, notices: d.notices.unread(agent),
    };
  }

  /** app.ts wires this to undo.revoke, so a stop is a team-signed revocation on Arkiv. */
  function onStop(fn: StopHandler) { stopHandler = fn; }

  return { resume, checkpoint, checkout, lean, onStop };
}
