// Website API v2, the "work" part (docs/API_V2.md): one brain today (the demo brain = the configured team); sign-in
// and more brains arrive in step 3. Reads are public demo data; adding a task needs the owner session.
import type { Express, Request, Response } from "express";
import type { AppConfig, EnsAuthority } from "@supabrain/shared";
import { checkpointViews, fileViews, NOTE_KINDS, renderPack, resumePack, taskViews } from "../engine/continuity";
import { ToolError } from "../memory/service";
import type { Undo } from "../memory/undo";
import type { Runtime } from "../runtime";

export function mountBrainApi(app: Express, p: { config: AppConfig; ens: EnsAuthority; runtime: Runtime; undo: Undo; owner: (req: Request, res: Response, next: () => void) => void }) {
  const { config, runtime } = p;
  const { graph, service } = runtime;
  const id = config.app.team.id;
  const teamEns = `${config.app.ens.teamLabel}.eth`;
  const known = (req: Request, res: Response) => {
    if (req.params.id === id) return true;
    res.status(404).json({ error: "NOT_FOUND", message: `no brain "${req.params.id}"` });
    return false;
  };

  app.get("/api/brains", async (_req, res) => {
    const agents = await Promise.all(config.app.agents.map(async (a) => {
      const seen = runtime.clients.get(a.label);
      const extra = { lastWriteAt: service.lastWriteAt(a.label), connectedClient: seen ? `${seen.name} ${seen.version}` : undefined };
      try { return { ...(await p.ens.getAgentAuthority(a.label)), authority: "live", ...extra }; }
      catch { return { label: a.label, ens: `${a.label}.${teamEns}`, vendor: a.vendor, status: "unknown", authority: "unavailable", ...extra }; }
    }));
    const tasks = taskViews(graph);
    res.json([{
      id, name: config.app.team.displayName, ens: teamEns, visibility: "public", active: true, stopped: false, agents,
      counts: { checkpoints: checkpointViews(graph).length, tasksOpen: tasks.filter((t) => t.status === "open").length, tasksDone: tasks.filter((t) => t.status === "done").length, files: fileViews(graph).length, notices: 0 },
    }]);
  });

  app.get("/api/brains/:id/summary", (req, res) => {
    if (!known(req, res)) return;
    const pack = resumePack(graph, { agent: "you", team: teamEns, name: config.app.team.displayName, now: Date.now() });
    res.json({ text: renderPack(pack, Date.now()), pack });
  });
  app.get("/api/brains/:id/checkpoints", (req, res) => { if (known(req, res)) res.json(checkpointViews(graph).reverse()); });
  app.get("/api/brains/:id/tasks", (req, res) => { if (known(req, res)) res.json(taskViews(graph)); });
  app.get("/api/brains/:id/files", (req, res) => { if (known(req, res)) res.json(fileViews(graph)); });
  app.get("/api/brains/:id/notes", (req, res) => { if (known(req, res)) res.json(graph.all().filter((n) => NOTE_KINDS.has(n.kind) && n.status !== "expired").reverse()); });

  app.get("/api/brains/:id/files/content", (req, res) => {
    if (!known(req, res)) return;
    const path = String(req.query.path ?? "");
    const versions = graph.all().filter((n) => n.kind === "file" && n.file?.path === path);
    if (!versions.length) return void res.status(404).json({ error: "NOT_FOUND", message: `no file "${path}"` });
    const current = fileViews(graph).find((f) => f.path === path);
    const pick = typeof req.query.key === "string" ? versions.find((n) => n.key === req.query.key) : versions.find((n) => n.key === current?.key) ?? versions[versions.length - 1];
    if (!pick) return void res.status(404).json({ error: "NOT_FOUND", message: "no such version" });
    res.json({
      path, key: pick.key, content: pick.text, status: pick.status, agent: pick.agent,
      versions: versions.reverse().map((n) => ({ key: n.key, agent: n.agent, vendor: n.vendor, at: n.createdAt, size: n.file!.size, status: n.status, deleted: !!n.file!.deleted, proofUrl: n.proofUrl })),
    });
  });

  app.post("/api/brains/:id/tasks", p.owner, async (req, res) => {
    if (!known(req, res)) return;
    const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
    if (!title || title.length > 200) return void res.status(400).json({ error: "INVALID", message: "title is required (≤ 200 characters)" });
    try {
      const r = await p.undo.addContext({ text: title, kind: "task", folder: "project" });
      res.json(taskViews(graph).find((t) => t.key === r.key) ?? { key: r.key, title, status: "open" });
    } catch (e) {
      if (e instanceof ToolError) return void res.status(e.code === "WRITE_FAILED" ? 502 : 400).json({ error: e.code, message: e.message });
      res.status(500).json({ error: "INTERNAL", message: "internal error" });
    }
  });
}
