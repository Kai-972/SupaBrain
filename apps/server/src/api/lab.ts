// v2 attack lab (docs/FRONTEND_V2.md §6.3): POST /api/brains/:id/lab/act { agent, action, input } runs the SAME
// continue / checkpoint / checkout an AI calls over MCP, as one of this brain's AIs, so judges can type any content
// or change any rule (or do nothing) and the real ENS rules, guard and Arkiv writes decide. Owner session only, and
// capped per brain, because every write spends that AI's tGLM on Arkiv.
import type { Express, Request, Response } from "express";
import type { AppConfig } from "@supabrain/shared";
import { ToolError } from "../memory/service";
import type { Runtime } from "../runtime";

const ACTIONS = new Set(["continue", "checkpoint", "checkout"]);
const WINDOW_MS = 10 * 60_000;
const MAX_WRITES_PER_WINDOW = 40; // lab checkpoints per brain per 10 minutes (ENS sb.write.daily still applies per AI)

export function mountLabApi(app: Express, p: { config: AppConfig; runtime: Runtime; owner: (req: Request, res: Response, next: () => void) => void }) {
  const { config, runtime } = p;
  const id = config.app.team.id;
  const writes: number[] = [];

  app.post("/api/brains/:id/lab/act", p.owner, async (req, res) => {
    if (req.params.id !== id) return void res.status(404).json({ error: "NOT_FOUND", message: `no brain "${req.params.id}" on this server` });
    const agent = typeof req.body?.agent === "string" ? req.body.agent : "";
    const action = typeof req.body?.action === "string" ? req.body.action : "";
    const input = (req.body?.input ?? {}) as Record<string, unknown>;
    if (!config.app.agents.some((a) => a.label === agent)) return void res.status(400).json({ error: "INVALID", message: `agent must be one of ${config.app.agents.map((a) => a.label).join(", ")}` });
    if (!ACTIONS.has(action)) return void res.status(400).json({ error: "INVALID", message: "action must be continue, checkpoint or checkout" });
    if (typeof input !== "object" || Array.isArray(input)) return void res.status(400).json({ error: "INVALID", message: "input must be an object" });
    if (action === "checkpoint") {
      const now = Date.now();
      while (writes.length && writes[0]! < now - WINDOW_MS) writes.shift();
      if (writes.length >= MAX_WRITES_PER_WINDOW) return void res.status(429).json({ error: "RATE_LIMIT", message: `the lab allows ${MAX_WRITES_PER_WINDOW} checkpoints per 10 minutes on this brain; wait a moment` });
      writes.push(now);
    }
    try {
      const client = "supabrain-lab";
      const result =
        action === "continue" ? await runtime.continuity.resume(agent, { focus: typeof input.focus === "string" ? input.focus : undefined, client })
        : action === "checkout" ? await runtime.continuity.checkout(agent, { paths: Array.isArray(input.paths) ? (input.paths as string[]) : undefined })
        : await runtime.continuity.checkpoint(agent, input as never, client);
      const stopped = action === "checkpoint" && (result as { stopped?: unknown }).stopped;
      res.json({ agent, action, outcome: stopped ? "stopped" : "ok", result });
    } catch (e) {
      // Refusals are the point of the lab: show them like the AI sees them, with the rule that decided.
      if (e instanceof ToolError) return void res.json({ agent, action, outcome: "refused", code: e.code, ...(e.rule ? { rule: e.rule } : {}), message: e.message });
      res.status(500).json({ error: "INTERNAL", message: "internal error" });
    }
  });
}
