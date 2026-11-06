import type { Express, Request, Response } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { hostHeaderValidation } from "@modelcontextprotocol/sdk/server/middleware/hostHeaderValidation.js";
import { agentAuth, agentOf } from "./auth";
import { buildMcpServer, type McpDeps } from "./server";

export interface McpRouteOptions extends McpDeps {
  tokenSecret: string;
  /** PUBLIC_BASE_URL: its host is the only non-local Host header accepted (DNS-rebinding protection) */
  publicBaseUrl?: string;
  log?: (line: string) => void;
}

/** Client-controlled strings are logged and stored: no control characters (log forging), bounded length. */
const clean = (v: unknown, max = 64) => String(v ?? "").replace(/[\u0000-\u001f\u007f-\u009f]/g, "?").slice(0, max);

const methodNotAllowed = (_req: Request, res: Response) =>
  void res.status(405).set("Allow", "POST").json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed (stateless server: POST only)" }, id: null });

/** POST /mcp (Bearer header) and POST /mcp/t/:token (path token). Stateless: one McpServer + transport per request. */
export function mountMcp(app: Express, o: McpRouteOptions): void {
  const log = o.log ?? ((l: string) => console.log(l));
  const hosts = ["localhost", "127.0.0.1", "::1", "[::1]"];
  if (o.publicBaseUrl) hosts.push(new URL(o.publicBaseUrl).hostname);
  const auth = agentAuth({ secret: o.tokenSecret, knownLabels: o.config.app.agents.map((a) => a.label), log });
  const guard = hostHeaderValidation(hosts);

  const handle = async (req: Request, res: Response) => {
    const t0 = Date.now();
    const agent = agentOf((req as Request & { auth?: Parameters<typeof agentOf>[0] }).auth) ?? "?";
    const body = req.body as { method?: string; params?: { name?: string; clientInfo?: { name?: string; version?: string }; protocolVersion?: string } } | undefined;
    const method = clean(body?.method ?? (Array.isArray(req.body) ? "batch" : "?"), 48);
    if (method === "initialize" && body?.params?.clientInfo) {
      const ci = body.params.clientInfo;
      o.clients.set(agent, { name: clean(ci.name ?? "unknown"), version: clean(ci.version ?? "?", 32), protocolVersion: clean(body.params.protocolVersion, 32), at: Date.now() });
    }
    // Log the route pattern (/mcp/t/:token), never the raw URL: it may carry a path token in any letter case.
    const route = `${req.method} ${req.route?.path ?? "?"}`;
    res.on("finish", () => {
      const tool = method === "tools/call" ? ` tool=${clean(body?.params?.name, 48)}` : "";
      const seen = o.clients.get(agent);
      const proto = method === "initialize" ? ` protocol=${clean(body?.params?.protocolVersion, 32)}` : "";
      log(`mcp ${route} agent=${agent} client=${seen ? `${seen.name}/${seen.version}` : "?"} method=${method}${tool}${proto} → ${res.statusCode} ${Date.now() - t0}ms`);
    });

    const server = buildMcpServer(o);
    try {
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      res.on("close", () => { void transport.close(); void server.close(); });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (e) {
      log(`mcp error: ${e instanceof Error ? e.message : String(e)}`);
      if (!res.headersSent) res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null });
    }
  };

  app.post("/mcp", guard, auth, handle);
  app.post("/mcp/t/:token", guard, auth, handle);
  app.get(["/mcp", "/mcp/t/:token"], methodNotAllowed);
  app.delete(["/mcp", "/mcp/t/:token"], methodNotAllowed);
}
