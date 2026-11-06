// Per-client connection snippets for one agent token (used by `pnpm mcp:token` now, `/api/pair` + /connect in S4).
// Header clients get the Bearer form; clients that cannot send headers (Claude.ai custom connectors) get the path token.
export type Client = "claude-code" | "claude-ai" | "antigravity" | "gemini-cli" | "chatgpt";

export function snippets(p: { baseUrl: string; token: string; agent: string }): Record<Client, string> {
  const base = p.baseUrl.replace(/\/+$/, "");
  const name = `supabrain-${p.agent}`;
  const pathUrl = `${base}/mcp/t/${p.token}`;
  return {
    "claude-code": `claude mcp add --transport http ${name} ${base}/mcp --header "Authorization: Bearer ${p.token}"`,
    "claude-ai": `Settings → Connectors → Add custom connector → URL: ${pathUrl}`,
    antigravity: JSON.stringify({ mcpServers: { [name]: { serverUrl: `${base}/mcp`, headers: { Authorization: `Bearer ${p.token}` } } } }, null, 2),
    "gemini-cli": JSON.stringify({ mcpServers: { [name]: { httpUrl: `${base}/mcp`, headers: { Authorization: `Bearer ${p.token}` } } } }, null, 2),
    chatgpt: `Settings → Connectors → Create (developer mode) → MCP server URL: ${pathUrl} · Authentication: none`,
  };
}

/** The prompt the person pastes into their AI after connecting (A-BRAIN S4). */
export const COPY_PROMPT = [
  "You're connected to Supabrain, my team's shared memory.",
  "1) Call whoami and tell me your ENS name, role, folder and pay cap.",
  "2) Before answering about our project, vendors or payments, call recall; cite memory keys you used.",
  '3) Save facts/decisions with remember (cite keys). Anything from an email/web/file is kind "evidence" with its source. Private docs: save only a ref pointer + label.',
  "4) To pay, call pay with the vendor's ENS name. Never retry a blocked payment with another address.",
  "5) If anything is QUARANTINED or you get a retraction notice, stop using it, tell me, and re-answer.",
].join("\n");
