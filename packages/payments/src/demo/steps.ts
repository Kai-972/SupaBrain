// Demo fallbacks (CLAUDE.md §9 / §14 "never depend on a model being fooled live"): the same MCP `pay` / `pay_status`
// tools a live model calls, driven by a script as a real agent with fixed inputs. Same server, same createPayments,
// same ENS, World and vault.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { ApprovalView, PayDecision } from "@supabrain/shared";
import { describeDecision } from "../mcp-tools";

export interface StepInput {
  payee: string;
  amount: string;
  memo: string;
  cites?: string[];
}

export interface StepOptions {
  log?: (line: string) => void;
  pollMs?: number;
  sleep?: (ms: number) => Promise<void>;
  /** P3: called once with the approval card data (show the QR / link on screen). */
  onPending?: (a: ApprovalView) => void;
}

type ToolClient = Pick<Client, "callTool">;

export async function connectAsAgent(p: { url: string; token: string }): Promise<Client> {
  const client = new Client({ name: "supabrain-demo-step", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(p.url), { requestInit: { headers: { Authorization: `Bearer ${p.token}` } } }));
  return client;
}

async function call(c: ToolClient, name: string, args: Record<string, unknown>): Promise<PayDecision> {
  const r = await c.callTool({ name, arguments: args });
  const d = (r.structuredContent as { decision?: PayDecision } | undefined)?.decision;
  if (!d) {
    const text = ((r.content as { text?: string }[] | undefined) ?? []).map((x) => x.text).join(" ");
    throw new Error(`${name} returned no decision: ${text || "empty result"}`);
  }
  return d;
}

/** P1: the email's address → must be BLOCKED by the ENS mismatch. ok=false if it wasn't (the stage beat broke). */
export async function stepBlocked(c: ToolClient, input: StepInput, o: StepOptions = {}): Promise<{ ok: boolean; decision: PayDecision }> {
  const log = o.log ?? console.log;
  log(`pay(${input.payee}, ${input.amount} USDC, "${input.memo}")${input.cites?.length ? ` citing ${input.cites.join(", ")}` : ""}`);
  const d = await call(c, "pay", { ...input });
  log(describeDecision(d));
  const ok = d.status === "blocked" && d.reasons.some((r) => r.code === "ENS_MISMATCH");
  if (!ok) log(`✗ expected BLOCKED with ENS_MISMATCH, got ${d.status}`);
  return { ok, decision: d };
}

const TERMINAL = new Set(["paid", "blocked", "denied", "expired", "cancelled", "failed"]);

/** P3: over cap → PENDING HUMAN → World approve → PAID. ok only when it ends PAID. */
export async function stepApprove(c: ToolClient, input: StepInput, o: StepOptions = {}): Promise<{ ok: boolean; decision: PayDecision }> {
  const log = o.log ?? console.log;
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  log(`pay(${input.payee}, ${input.amount} USDC, "${input.memo}")`);
  let d = await call(c, "pay", { ...input });
  log(describeDecision(d));
  if (d.status !== "pending_human") {
    log(`✗ expected PENDING HUMAN (over cap), got ${d.status}`);
    return { ok: d.status === "paid", decision: d };
  }
  const deadline = d.approval.expiresAt + 60_000;
  o.onPending?.(d.approval);
  const intentId = d.intentId;
  while (!TERMINAL.has(d.status)) {
    if (Date.now() > deadline) {
      log("✗ gave up waiting for the approval");
      break;
    }
    await sleep(o.pollMs ?? 3_000);
    d = await call(c, "pay_status", { intentId });
  }
  log(describeDecision(d));
  return { ok: d.status === "paid", decision: d };
}
