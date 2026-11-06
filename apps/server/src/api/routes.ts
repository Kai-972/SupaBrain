// Dashboard API part 1 (CLAUDE.md §6.4, A-BRAIN S2 step 6). Read endpoints are public demo data; owner actions (S3)
// go behind admin.require.
import type { Express, NextFunction, Request, Response } from "express";
import type { AppConfig, EnsAuthority } from "@supabrain/shared";
import type { Runtime } from "../runtime";
import type { adminAuth } from "../auth/admin";

export function cors(allowed: readonly string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    if (origin && allowed.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Vary", "Origin");
      if (req.method === "OPTIONS") {
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "content-type, last-event-id");
        res.setHeader("Access-Control-Max-Age", "600");
        return void res.status(204).end();
      }
    } else if (req.method === "OPTIONS") {
      return void res.status(204).end();
    }
    next();
  };
}

export function mountApi(app: Express, p: { config: AppConfig; ens: EnsAuthority; runtime: Runtime; admin: ReturnType<typeof adminAuth> }) {
  const { config, ens, runtime } = p;
  const { graph, bus, service } = runtime;
  const teamEns = `${config.app.ens.teamLabel}.eth`;

  app.use("/api", cors(config.app.server.allowedOrigins));

  app.get("/api/team", async (_req, res) => {
    const agents = await Promise.all(
      config.app.agents.map(async (a) => {
        const seen = runtime.clients.get(a.label);
        const extra = { lastWriteAt: service.lastWriteAt(a.label), connectedClient: seen ? `${seen.name} ${seen.version}` : undefined };
        try {
          return { ...(await ens.getAgentAuthority(a.label)), authority: "live", ...extra };
        } catch {
          // Fail closed and say so: the UI shows "authority unknown", never a guessed status.
          return { label: a.label, ens: `${a.label}.${teamEns}`, vendor: a.vendor, role: a.role, scope: a.scope, registered: false, status: "unknown", payCap: a.payCapUsdc, payDaily: a.payDailyUsdc, authority: "unavailable", ...extra };
        }
      }),
    );
    res.json({ team: { id: config.app.team.id, displayName: config.app.team.displayName, ens: teamEns }, agents, vendors: ens.teamVendors(), counts: graph.counts() });
  });

  app.get("/api/graph", (req, res) => {
    const since = Number(req.query.since ?? 0) || 0;
    const nodes = graph.since(since);
    res.json({ nodes, edges: nodes.flatMap((n) => n.parents.map((parent) => ({ parent, child: n.key }))), seq: graph.maxSeq() });
  });

  app.get("/api/memory/:key", (req, res) => {
    const n = graph.get(req.params.key);
    if (!n) return void res.status(404).json({ error: "no such memory (it may have expired)" });
    const why = n.status === "quarantined" ? graph.why(n.key) : undefined;
    res.json({ ...n, lineage: graph.lineagePaths(n.key), readers: service.readers([n.key]), ...(why ? { why } : {}) });
  });

  app.get("/api/recall-log", (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q.toLowerCase() : "";
    const agent = typeof req.query.agent === "string" ? req.query.agent : undefined;
    res.json(service.recallLog(agent).filter((r) => !q || r.query.toLowerCase().includes(q)));
  });

  app.get("/api/stream", (req, res) => {
    const since = Number(req.query.since ?? req.headers["last-event-id"] ?? 0) || 0;
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" });
    res.write("retry: 2000\n\n");
    const send = (s: { seq: number; event: unknown }) => res.write(`id: ${s.seq}\ndata: ${JSON.stringify(s.event)}\n\n`);
    for (const s of bus.since(since)) send(s);
    const off = bus.subscribe(send);
    const ping = setInterval(() => res.write(": ping\n\n"), 15_000);
    req.on("close", () => { off(); clearInterval(ping); });
  });

  app.post("/api/admin/login", p.admin.login);
  app.post("/api/admin/logout", p.admin.logout);
  app.get("/api/admin/me", p.admin.me);
}
