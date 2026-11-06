import express, { type Express } from "express";
import type { AppConfig, EnsAuthority, Payments } from "@supabrain/shared";
import { mountApi } from "./api/routes";
import { adminAuth } from "./auth/admin";
import { mountMcp } from "./mcp/routes";
import { mountPairing } from "./api/pair";
import { createUndo } from "./memory/undo";
import type { Runtime } from "./runtime";

export interface AppDeps {
  config: AppConfig;
  payments: Payments & { enabled?: boolean };
  /** live ENS authority; MCP and the API are off without it */
  ens?: EnsAuthority;
  /** graph, memory service, event bus (see ./runtime) */
  runtime?: Runtime;
  /** TOKEN_SIGNING_SECRET; MCP is off (503) without it */
  tokenSecret?: string;
  /** PUBLIC_BASE_URL */
  publicBaseUrl?: string;
  /** the dashboard's base URL for /connect QR links (PUBLIC_WEB_URL, else config web.baseUrl) */
  webBaseUrl?: string;
  /** DASHBOARD_ADMIN_PASSPHRASE; admin login is off (503) without it */
  adminPassphrase?: string;
  log?: (line: string) => void;
}

export function createApp({ config, payments, ens, runtime, tokenSecret, publicBaseUrl, webBaseUrl, adminPassphrase, log }: AppDeps): Express {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1); // behind ngrok / Render: req.ip and req.secure come from the proxy
  app.use(express.json({ limit: "64kb" }));

  app.get("/healthz", (_req, res) => {
    res.json({
      ok: true,
      app: config.app.appNamespace,
      team: config.app.team.id,
      payments: payments.enabled === false ? "disabled" : "enabled",
    });
  });

  if (ens && runtime && tokenSecret) {
    mountMcp(app, { config, service: runtime.service, clients: runtime.clients, payments, tokenSecret, publicBaseUrl, log });
    const admin = adminAuth({ secret: tokenSecret, passphrase: adminPassphrase, sessionHours: config.app.server.adminSessionHours, secureCookie: !!publicBaseUrl?.startsWith("https://") }); // hardcode-ok: protocol prefix check, not an endpoint
    mountApi(app, { config, ens, runtime, admin, payments, undo: createUndo({ config, runtime, payments, log }) });
    mountPairing(app, { config, tokenSecret, publicBaseUrl, webBaseUrl: webBaseUrl ?? config.app.web.baseUrl, owner: admin.require });
  } else {
    app.all(["/mcp", "/mcp/t/:token", "/api/{*rest}"], (_req, res) => {
      res.status(503).json({ jsonrpc: "2.0", error: { code: -32000, message: "Not configured on this server (needs TOKEN_SIGNING_SECRET, ENS and the memory runtime)" }, id: null });
    });
  }

  // Errors never leak a stack trace or file paths (Lane B review F2): malformed JSON is a JSON-RPC parse error.
  app.use((err: { type?: string; message?: string }, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (res.headersSent) return;
    if (err?.type === "entity.parse.failed") return void res.status(400).json({ jsonrpc: "2.0", error: { code: -32700, message: "Parse error: the body is not valid JSON" }, id: null });
    if (err?.type === "entity.too.large") return void res.status(413).json({ jsonrpc: "2.0", error: { code: -32600, message: "Request too large" }, id: null });
    log?.(`unhandled error on ${req.method} ${req.route?.path ?? "?"}: ${String(err?.message ?? err).split("\n")[0]}`);
    res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal error" }, id: null });
  });

  return app;
}
