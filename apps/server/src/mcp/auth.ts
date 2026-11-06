import type { NextFunction, Request, Response } from "express";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { verifyAgentToken } from "../auth/tokens";

/** The agent this request acts as, set by `agentAuth`, read by tools from `extra.authInfo.extra.agent`. */
export const agentOf = (auth: AuthInfo | undefined): string | undefined => auth?.extra?.agent as string | undefined;

/**
 * Bearer token from `Authorization: Bearer <t>` or the path (`/mcp/t/:token`, for clients that cannot send headers,
 * such as Claude.ai custom connectors). 401 + WWW-Authenticate on any failure; never echoes the token.
 */
export function agentAuth(p: { secret: string; knownLabels: readonly string[] }) {
  return (req: Request, res: Response, next: NextFunction) => {
    const fromPath = typeof req.params.token === "string" ? req.params.token : undefined;
    const header = req.headers.authorization;
    const fromHeader = header?.match(/^Bearer\s+(\S+)$/i)?.[1];
    const token = fromPath ?? fromHeader;
    const check = token ? verifyAgentToken(token, { secret: p.secret, knownLabels: p.knownLabels }) : ({ ok: false, reason: "missing" } as const);
    if (!check.ok) {
      const description = check.reason === "missing" ? "Missing bearer token" : `Token rejected: ${check.reason}`;
      res.set("WWW-Authenticate", `Bearer error="invalid_token", error_description="${description}"`);
      res.status(401).json({ error: "invalid_token", error_description: description });
      return;
    }
    (req as Request & { auth?: AuthInfo }).auth = { token: token!, clientId: check.label, scopes: [], expiresAt: check.exp, extra: { agent: check.label } };
    next();
  };
}
