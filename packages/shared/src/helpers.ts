// Small browser-safe helpers shared by every lane.

/** Agent key env names derive from labels (CLAUDE.md §5.3). */
export function agentKeyEnvName(label: string): string {
  return `AGENT_${label.toUpperCase().replace(/-/g, "_")}_PRIVATE_KEY`;
}

/** Vendor key env names follow the same rule, e.g. VENDOR_ACME_PRIVATE_KEY. */
export function vendorKeyEnvName(label: string): string {
  return `VENDOR_${label.toUpperCase().replace(/-/g, "_")}_PRIVATE_KEY`;
}

/**
 * Redact an RPC URL for logs and errors: keep scheme + host, drop path, query and credentials
 * (the Arkiv access key rides in the URL path).
 */
export function redactUrl(url: string): string {
  try {
    const u = new URL(url);
    const hidden = u.pathname.length > 1 || u.search !== "" || u.username !== "" || u.password !== "";
    return `${u.protocol}//${u.host}${hidden ? "/***" : ""}`;
  } catch {
    return "<invalid url>";
  }
}

/** Redact every URL inside a message (for error strings that embed RPC URLs). */
export function redactUrls(message: string): string {
  return message.replace(/\b(?:https?|wss?):\/\/[^\s"'<>)]+/g, (m) => redactUrl(m));
}

/** Fill an explorer template such as ".../tx/{hash}". */
export function explorerLink(template: string, values: { hash?: string; address?: string }): string {
  return template.replace("{hash}", values.hash ?? "").replace("{address}", values.address ?? "");
}
