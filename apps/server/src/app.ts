import express, { type Express } from "express";
import type { AppConfig, EnsAuthority, Payments } from "@supabrain/shared";
import { mountMcp } from "./mcp/routes";
import type { McpDeps } from "./mcp/server";

export interface AppDeps {
  config: AppConfig;
  payments: Payments & { enabled?: boolean };
  /** live ENS authority; MCP is off (503) without it */
  ens?: EnsAuthority;
  /** TOKEN_SIGNING_SECRET; MCP is off (503) without it */
  tokenSecret?: string;
  /** PUBLIC_BASE_URL */
  publicBaseUrl?: string;
  log?: (line: string) => void;
}

// MCP (/mcp, /mcp/t/:token) since S1; the dashboard API (§6.4) lands in S2.
export function createApp({ config, payments, ens, tokenSecret, publicBaseUrl, log }: AppDeps): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "64kb" }));
  const clients: McpDeps["clients"] = new Map();

  app.get("/healthz", (_req, res) => {
    res.json({
      ok: true,
      app: config.app.appNamespace,
      team: config.app.team.id,
      payments: payments.enabled === false ? "disabled" : "enabled",
    });
  });

  if (ens && tokenSecret) {
    mountMcp(app, { config, ens, clients, tokenSecret, publicBaseUrl, log });
  } else {
    app.all(["/mcp", "/mcp/t/:token"], (_req, res) => {
      res.status(503).json({ jsonrpc: "2.0", error: { code: -32000, message: "MCP is not configured on this server (needs TOKEN_SIGNING_SECRET and ENS)" }, id: null });
    });
  }

  return app;
}
