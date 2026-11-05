import express, { type Express } from "express";
import type { AppConfig, Payments } from "@supabrain/shared";

export interface AppDeps {
  config: AppConfig;
  payments: Payments & { enabled?: boolean };
}

// S0 shell. MCP (/mcp, /mcp/t/:token) lands in S1/S3, the dashboard API (§6.4) in S2.
export function createApp({ config, payments }: AppDeps): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "64kb" }));

  app.get("/healthz", (_req, res) => {
    res.json({
      ok: true,
      app: config.app.appNamespace,
      team: config.app.team.id,
      payments: payments.enabled === false ? "disabled" : "enabled",
    });
  });

  return app;
}
