// The MCP `pay` and `pay_status` tools (CLAUDE.md §6.3, S5). Lane A mounts them in apps/server/src/mcp/server.ts with
// one call: registerPaymentTools(server, { payments, agentOf }). The agent identity comes ONLY from the authenticated
// token (never from tool arguments); everything else is decided by `payments` (policy → World → vault).
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { PayDecision, PayReason, Payments } from "@supabrain/shared";
import { z } from "zod";

export interface PaymentToolDeps {
  payments: Pick<Payments, "pay" | "status">;
  agentOf: (auth: AuthInfo | undefined) => string | undefined;
}

function reasonText(r: PayReason): string {
  switch (r.code) {
    case "ENS_MISMATCH":
      return `the address ${r.claimedAddress} disagrees with ${r.ensName}, whose ENS record says ${r.ensAddress} (hard block: ENS wins)`;
    case "QUARANTINED_LINEAGE":
      return `the payee comes from revoked memories (${r.revoked.join(", ")})`;
    case "OUTSIDE_CONTENT_PAYEE":
      return `the payee address came from outside content (${r.sources.join(", ")}), not from the team's ENS`;
    case "NEW_PAYEE":
      return "this payee has never been paid before";
    case "UNKNOWN_PAYEE":
      return "nothing in the team's memory or ENS vouches for this payee";
    case "OVER_CAP":
      return `${r.amount} USDC is over your per-payment cap of ${r.cap} USDC (set in ENS)`;
    case "OVER_DAILY":
      return `this would exceed your daily limit of ${r.daily} USDC (already spent ${r.spentToday} today)`;
    case "AGENT_NOT_AUTHORIZED":
      return r.detail;
    default:
      return JSON.stringify(r);
  }
}

/** One paragraph an agent can relay to its user. */
export function describeDecision(d: PayDecision): string {
  switch (d.status) {
    case "paid":
      return `PAID. Transaction: ${d.txUrl}`;
    case "blocked":
      return `BLOCKED, nothing was paid. Why: ${d.reasons.map(reasonText).join("; ")}.` +
        (d.path.length ? ` Lineage behind the payee: ${d.path.join(" → ")}.` : "") +
        " Do not retry with another address from memory; ask the user to check the vendor's ENS name.";
    case "pending_human": {
      const a = d.approval;
      return `PENDING HUMAN APPROVAL, nothing paid yet. Why a human is needed: ${d.reasons.map(reasonText).join("; ")}. ` +
        `Ask the user to approve in World App: open ${a.verificationUri} (reference ${a.userCode}). ` +
        `Then call pay_status with intentId ${d.intentId}.`;
    }
    case "denied":
      return "DENIED by the human approver. Nothing was paid.";
    case "expired":
      return "EXPIRED: no approval in time. Nothing was paid.";
    case "cancelled":
      return "CANCELLED. Nothing was paid.";
    case "failed":
      return `FAILED, nothing was paid: ${d.error}`;
  }
}

const notAuthenticated = { isError: true, content: [{ type: "text" as const, text: "Not authenticated." }] };

export function registerPaymentTools(server: McpServer, deps: PaymentToolDeps): void {
  server.registerTool(
    "pay",
    {
      title: "Pay from the team vault",
      description:
        "Pay a payee from the team's vault in USDC. Use the payee's ENS name (e.g. acme.<team>.eth) when you know it; never " +
        "invent or guess an address. Pass `cites` = the memory keys you relied on. The result is PAID, BLOCKED, or " +
        "PENDING HUMAN APPROVAL (then tell the user to approve in World App and call pay_status). Do not work around a block.",
      inputSchema: {
        payee: z.string().min(1).max(256).describe("ENS name (preferred) or 0x address"),
        amount: z.string().regex(/^\d+(\.\d{1,6})?$/).describe("USDC amount, e.g. \"5\" or \"2.5\""),
        memo: z.string().max(200).describe("what the payment is for"),
        cites: z.array(z.string().max(80)).max(32).optional().describe("memory keys this payment relies on"),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    },
    async (args, extra) => {
      const agent = deps.agentOf(extra.authInfo);
      if (!agent) return notAuthenticated;
      const d = await deps.payments.pay(agent, { payee: args.payee, amount: args.amount, memo: args.memo, cites: args.cites });
      return { isError: d.status === "failed", content: [{ type: "text" as const, text: describeDecision(d) }], structuredContent: { decision: d } };
    },
  );

  server.registerTool(
    "pay_status",
    {
      title: "Status of a payment",
      description: "Check a payment started with `pay` (e.g. while it waits for human approval in World App).",
      inputSchema: { intentId: z.string().min(1).max(80) },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args, extra) => {
      if (!deps.agentOf(extra.authInfo)) return notAuthenticated;
      const d = await deps.payments.status(args.intentId);
      return { content: [{ type: "text" as const, text: describeDecision(d) }], structuredContent: { decision: d } };
    },
  );
}
