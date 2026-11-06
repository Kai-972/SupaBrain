// v2 website API, the "rules and safety" part (docs/API_V2.md, docs/FRONTEND_V2.md):
//   GET  /api/registry                 the pre-made brains on ENS (public: names, registries, AI wallets, funding)
//   GET  /api/brains/:id/rules         each AI's rules, read live from its ENS records
//   POST /api/brains/:id/rules         change one AI's rules on ENS (owner; the server's team key pays the gas)
//   GET  /api/brains/:id/blocked       refusals and stops, newest first (also streamed as `blocked`)
//   GET  /api/brains/:id/heads         each AI's newest checkpoint: on ENS (sb.memory.head) vs what the server knows
import type { Express, Request, Response } from "express";
import type { BrainsDeployment, RulesPatch, RulesWriter } from "@supabrain/ens";
import { RulesError } from "@supabrain/ens";
import type { AppConfig, EnsAuthority } from "@supabrain/shared";
import { heads as headsOf } from "../engine/continuity";
import type { HeadPublisher } from "../ens-heads";
import type { Runtime } from "../runtime";

const STATUS: Record<string, number> = { INVALID: 400, NOT_OURS: 403, NO_RESOLVER: 409, REVERTED: 502 };

export function mountRulesApi(app: Express, p: {
  config: AppConfig; ens: EnsAuthority; runtime: Runtime; owner: (req: Request, res: Response, next: () => void) => void;
  rules?: RulesWriter; heads?: HeadPublisher; registry?: BrainsDeployment; brainMode: boolean;
}) {
  const { config, runtime } = p;
  const id = config.app.team.id;
  const known = (req: Request, res: Response) => {
    if (req.params.id === id) return true;
    res.status(404).json({ error: "NOT_FOUND", message: `no brain "${req.params.id}" on this server` });
    return false;
  };
  const ensOf = (agent: string) => p.config.deployments.ens?.agents[agent]?.ens;

  app.get("/api/registry", (_req, res) => {
    if (!p.registry) return void res.json({ brains: [] });
    res.json({
      teamRegistry: p.registry.teamRegistry, updatedAt: p.registry.updatedAt, served: p.brainMode ? id : null,
      brains: Object.values(p.registry.brains).sort((a, b) => a.index - b.index).map((b) => ({
        label: b.label, ens: b.ens, index: b.index, registry: b.registry, expiry: b.expiry, served: p.brainMode && b.label === id,
        txUrls: b.txs.map((t) => t.url),
        agents: Object.fromEntries(Object.entries(b.agents).map(([f, a]) => [f, {
          ens: a.ens, wallet: a.wallet, resolver: a.resolver, expiry: a.expiry, records: a.records,
          ...(a.funding ? { fundingUrl: a.funding.url, fundedGlm: a.funding.amountGlm } : {}),
        }])),
      })),
    });
  });

  app.get("/api/brains/:id/rules", async (req, res) => {
    if (!known(req, res)) return;
    if (!p.rules) return void res.status(503).json({ error: "UNAVAILABLE", message: "the rules reader is not configured on this server" });
    try {
      const out = await Promise.all(config.app.agents.map(async (a) => {
        const ens = ensOf(a.label) ?? a.label;
        const rules = await p.rules!.readRules(ens);
        return { agent: a.label, vendor: a.vendor, ens, resolver: p.config.deployments.ens?.agents[a.label]?.resolver, ...rules };
      }));
      res.json({ editable: p.brainMode, agents: out });
    } catch (e) {
      res.status(502).json({ error: "ENS_UNAVAILABLE", message: `ENS could not be read: ${(e as Error).message.split("\n")[0]}` });
    }
  });

  app.post("/api/brains/:id/rules", p.owner, async (req, res) => {
    if (!known(req, res)) return;
    if (!p.rules || !p.brainMode) return void res.status(409).json({ error: "NOT_EDITABLE", message: "only brains' rules can be changed from the website; the demo team's records are owner-key only" });
    const agent = typeof req.body?.agent === "string" ? req.body.agent : "";
    if (!config.app.agents.some((a) => a.label === agent)) return void res.status(400).json({ error: "INVALID", message: `agent must be one of ${config.app.agents.map((a) => a.label).join(", ")}` });
    const { agent: _a, ...patch } = (req.body ?? {}) as Record<string, unknown>;
    try {
      const r = await p.rules.setRules(ensOf(agent)!, patch as RulesPatch);
      p.ens.invalidate?.(agent); // the next call reads the new rule
      res.json({ agent, ens: ensOf(agent), ...r });
    } catch (e) {
      if (e instanceof RulesError) return void res.status(STATUS[e.code] ?? 400).json({ error: e.code, message: e.message });
      res.status(502).json({ error: "ENS_WRITE_FAILED", message: (e as Error).message.split("\n")[0] });
    }
  });

  app.get("/api/brains/:id/blocked", (req, res) => {
    if (known(req, res)) res.json(runtime.blocked.list());
  });

  app.get("/api/brains/:id/heads", async (req, res) => {
    if (!known(req, res)) return;
    const server = headsOf(runtime.graph); // agent → newest checkpoint node the server knows
    const published = new Map((p.heads?.list() ?? []).map((h) => [h.agent, h]));
    const out = await Promise.all(config.app.agents.map(async (a) => {
      const ens = ensOf(a.label) ?? a.label;
      let onEns: string | null = null;
      try { onEns = p.rules ? await p.rules.readHead(ens) : null; } catch { onEns = null; }
      const latest = server.get(a.label);
      const pub = published.get(a.label);
      return { agent: a.label, ens, serverHead: latest?.key ?? null, ensHead: onEns, match: !!latest && onEns?.toLowerCase() === latest.key.toLowerCase(), ...(pub?.txUrl ? { txUrl: pub.txUrl } : {}), ...(pub?.error ? { error: pub.error } : {}) };
    }));
    res.json(out);
  });
}
