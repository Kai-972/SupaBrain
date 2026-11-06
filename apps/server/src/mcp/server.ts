// The MCP server for one request (stateless: a new instance per POST, CLAUDE.md §1 / MCP SDK 1.32 stateless pattern).
// S1 spike: `whoami` with the live ENS authority check (CLAUDE.md §7 rule 8). recall/remember/explain land in S2.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AppConfig, EnsAuthority } from "@supabrain/shared";
import { agentOf } from "./auth";

export interface McpDeps {
  config: AppConfig;
  ens: EnsAuthority;
  /** last client seen per agent (from `initialize`), for whoami and the agents rail */
  clients: Map<string, { name: string; version: string; protocolVersion?: string; at: number }>;
}

const INSTRUCTIONS =
  "Supabrain is your team's shared memory across AI vendors. Call `whoami` first in every conversation: it tells you " +
  "which agent you are, which folder you may write to and whether you are allowed to act at all (checked live on ENS).";

export function buildMcpServer(deps: McpDeps): McpServer {
  const server = new McpServer({ name: "supabrain", version: "0.1.0" }, { instructions: INSTRUCTIONS });

  server.registerTool(
    "whoami",
    {
      title: "Who am I in Supabrain",
      description: "Call this FIRST. Returns your agent identity (ENS name), your role, the folder you may write to, your payment limits and whether you are currently allowed to act. Takes no arguments.",
      inputSchema: {},
      outputSchema: {
        agent: z.string(), ens: z.string(), vendor: z.string(), role: z.string(), scope: z.string(), status: z.string(),
        canWrite: z.boolean(), payCapUsdc: z.string(), payDailyUsdc: z.string(), leaseExpiresAt: z.string(), wallet: z.string(),
        client: z.string().optional(),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (_args, extra) => {
      const label = agentOf(extra.authInfo);
      if (!label) return { isError: true, content: [{ type: "text" as const, text: "Not authenticated." }] };
      let a;
      try {
        a = await deps.ens.getAgentAuthority(label);
      } catch {
        return { isError: true, content: [{ type: "text" as const, text: `ENS authority unknown for ${label}: ENS could not be read, so writes and payments are paused. Try again shortly.` }] };
      }
      const canWrite = a.registered && a.status === "active" && a.recordsOk;
      const seen = deps.clients.get(label);
      const out = {
        agent: label, ens: a.ens, vendor: a.vendor, role: a.role, scope: a.scope, status: a.status, canWrite,
        payCapUsdc: a.payCap, payDailyUsdc: a.payDaily, leaseExpiresAt: new Date(a.leaseExpiresAt).toISOString(), wallet: a.wallet,
        ...(seen ? { client: `${seen.name} ${seen.version}` } : {}),
      };
      const line = canWrite
        ? `You are ${a.ens} (${a.vendor}, ${a.role}). You may write to the "${a.scope}" folder. Pay cap ${a.payCap} USDC per payment, ${a.payDaily} USDC per day. ENS lease until ${out.leaseExpiresAt}.`
        : `You are ${a.ens}, but you are NOT allowed to act: ENS status is "${a.status}"${a.recordsOk ? "" : " (records incomplete)"}. Do not write memories or make payments.`;
      return { isError: !canWrite, content: [{ type: "text" as const, text: line }], structuredContent: out };
    },
  );

  return server;
}
