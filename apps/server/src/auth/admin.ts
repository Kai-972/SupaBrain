// Owner (admin) session for the dashboard (CLAUDE.md §6.4): passphrase → httpOnly cookie.
// The UI (supabrain.blackslate.me) and API (a sibling subdomain) are the same site, so SameSite=Lax cookies work.
// The session is signed with a key derived from TOKEN_SIGNING_SECRET for this purpose only, so an MCP agent token can
// never pass as an admin session (and vice versa).
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { issueAgentToken, verifyAgentToken } from "./tokens";

const COOKIE = "sb_admin";
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 10 * 60_000;

function readCookie(req: Request, name: string): string | undefined {
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return undefined;
}

const sha = (s: string) => createHash("sha256").update(s).digest();

export function adminAuth(p: { secret: string; passphrase?: string; sessionHours: number; secureCookie: boolean; now?: () => number }) {
  const now = p.now ?? Date.now;
  const adminSecret = createHmac("sha256", p.secret).update("supabrain-admin-session-v1").digest("hex");
  const attempts = new Map<string, { count: number; resetAt: number }>();

  const isAdmin = (req: Request) => {
    const t = readCookie(req, COOKIE);
    return !!t && verifyAgentToken(t, { secret: adminSecret, knownLabels: ["owner"], now: Math.floor(now() / 1000) }).ok;
  };

  return {
    isAdmin,

    login(req: Request, res: Response) {
      if (!p.passphrase) return void res.status(503).json({ error: "admin login is not configured (DASHBOARD_ADMIN_PASSPHRASE)" });
      const ip = req.ip ?? "?";
      const a = attempts.get(ip);
      if (a && a.resetAt > now() && a.count >= MAX_ATTEMPTS) return void res.status(429).json({ error: "too many attempts; wait a few minutes" });
      const given = typeof req.body?.passphrase === "string" ? req.body.passphrase : "";
      if (!timingSafeEqual(sha(given), sha(p.passphrase))) {
        const cur = a && a.resetAt > now() ? a : { count: 0, resetAt: now() + WINDOW_MS };
        cur.count++;
        attempts.set(ip, cur);
        return void res.status(401).json({ error: "wrong passphrase" });
      }
      attempts.delete(ip);
      const maxAge = p.sessionHours * 3600;
      const token = issueAgentToken({ label: "owner", ttlSec: maxAge, secret: adminSecret, now: Math.floor(now() / 1000) });
      res.setHeader("Set-Cookie", `${COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${p.secureCookie ? "; Secure" : ""}`);
      res.json({ admin: true, expiresAt: now() + maxAge * 1000 });
    },

    logout(_req: Request, res: Response) {
      res.setHeader("Set-Cookie", `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${p.secureCookie ? "; Secure" : ""}`);
      res.json({ admin: false });
    },

    me(req: Request, res: Response) {
      res.json({ admin: isAdmin(req) });
    },

    /** Guard for owner-only endpoints (S3: dry run, revoke, keep, correct, add context, pair). */
    require(req: Request, res: Response, next: NextFunction) {
      if (!isAdmin(req)) return void res.status(401).json({ error: "owner login required" });
      next();
    },
  };
}
