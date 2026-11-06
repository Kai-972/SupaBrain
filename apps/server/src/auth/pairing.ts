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
