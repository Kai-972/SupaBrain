// Onboarding (A-BRAIN S4): the owner pairs an AI client with an agent. POST /api/pair returns the agent token, a snippet
// per client and the copy prompt, plus a QR payload pointing at the web app's /connect?code=…. The code is short and
// short-lived, so the long-lived token never sits in a QR image or a browser history entry.
import { randomBytes } from "node:crypto";
import type { Express, Request, RequestHandler } from "express";
import type { AppConfig } from "@supabrain/shared";
import { COPY_PROMPT, snippets, type Client } from "../auth/pairing";
import { issueAgentToken } from "../auth/tokens";

const CLIENTS: readonly Client[] = ["claude-code", "claude-ai", "antigravity", "gemini-cli", "chatgpt"];
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
const code8 = () => [...randomBytes(8)].map((b) => ALPHABET[b % ALPHABET.length]).join("");

interface Pairing { agent: string; ens: string; client?: Client; token: string; snippets: Record<Client, string>; prompt: string; expiresAt: number; codeExpiresAt: number }

export function mountPairing(app: Express, p: { config: AppConfig; tokenSecret: string; publicBaseUrl?: string; webBaseUrl: string; owner: RequestHandler; now?: () => number }) {
  const now = p.now ?? Date.now;
  const codes = new Map<string, Pairing>();
  const labels = new Set(p.config.app.agents.map((a) => a.label));
  const teamEns = `${p.config.app.ens.teamLabel}.eth`;
  const baseOf = (req: Request) => (p.publicBaseUrl ?? `${req.protocol}://${req.get("host")}`).replace(/\/+$/, "");
  const sweep = () => { for (const [c, v] of codes) if (v.codeExpiresAt <= now()) codes.delete(c); };

  app.post("/api/pair", p.owner, (req, res) => {
    const label = typeof req.body?.label === "string" ? req.body.label : "";
    const client = req.body?.client as Client | undefined;
    if (!labels.has(label)) return void res.status(400).json({ error: "INVALID", message: `label must be one of ${[...labels].join(", ")}` });
    if (client !== undefined && !CLIENTS.includes(client)) return void res.status(400).json({ error: "INVALID", message: `client must be one of ${CLIENTS.join(", ")}` });
    sweep();
    const ttlSec = p.config.app.mcp.tokenTtlDays * 86_400;
    const token = issueAgentToken({ label, ttlSec, secret: p.tokenSecret, now: Math.floor(now() / 1000) });
    const code = code8();
    const pairing: Pairing = {
      agent: label, ens: `${label}.${teamEns}`, ...(client ? { client } : {}), token,
      snippets: snippets({ baseUrl: baseOf(req), token, agent: label }), prompt: COPY_PROMPT,
      expiresAt: now() + ttlSec * 1000, codeExpiresAt: now() + p.config.app.mcp.pairCodeTtlSec * 1000,
    };
    codes.set(code, pairing);
    res.json({ ...pairing, code, qrPayload: `${p.webBaseUrl.replace(/\/+$/, "")}/connect?code=${code}` });
  });

  // Public on purpose: the person holding the phone opens /connect from the QR. The code is the capability; it expires.
  app.get("/api/pair/:code", (req, res) => {
    sweep();
    const pairing = codes.get(String(req.params.code).toUpperCase());
    if (!pairing) return void res.status(404).json({ error: "NOT_FOUND", message: "this pairing code is unknown or expired; ask the owner for a new QR" });
    const { codeExpiresAt: _c, ...out } = pairing;
    res.json(out);
  });
}
