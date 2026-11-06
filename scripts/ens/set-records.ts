// pnpm ens:set-records <agent> key=value [key=value ...] [--yes] — owner updates an agent's ENS text records
// (A-BRAIN S1 step 6): raise a cap, quarantine an agent (sb.status=quarantined), publish agent-endpoint[mcp].
// The agent can never do this itself: only the owner holds ROLE_SET_TEXT on the resolver root.
import { agentName, dnsEncode } from "@supabrain/ens";
import { permissionedResolverAbi } from "@supabrain/ens/abis";
import type { Hex } from "../lib/chain";
import { nowIso, readEnsDeployment, updateEnsDeployment } from "../lib/deployments";
import { ensContext, positional } from "../lib/ensctx";
import { readAt, requireOk, type TxStep } from "../lib/tx";

async function main() {
  const ctx = await ensContext();
  const { config, runner, owner, teamLabel } = ctx;
  const pub = runner.pub;
  const [label, ...pairs] = positional();
  if (!label || !pairs.length) throw new Error("usage: pnpm ens:set-records <agent> key=value [key=value ...] [--yes]");
  const entry = readEnsDeployment(config).agents[label];
  if (!entry) throw new Error(`${label} is not deployed`);
  const keys = config.app.ens.textKeys;
  const name = agentName(label, teamLabel);
  const dns = dnsEncode(name);
  const updates = pairs.map((p) => {
    const i = p.indexOf("=");
    if (i < 1) throw new Error(`bad argument "${p}" (expected key=value)`);
    return [p.slice(0, i), p.slice(i + 1)] as const;
  });
  for (const [k, v] of updates) {
    if (k === keys.memoryHead) throw new Error(`${k} belongs to the agent: it writes it itself`);
    if ((k === keys.payCap || k === keys.payDaily) && !/^\d+(\.\d{1,6})?$/.test(v)) throw new Error(`${k} must be a USDC decimal, got "${v}"`);
    if (k === keys.status && !["active", "quarantined"].includes(v)) throw new Error(`${k} must be active or quarantined`);
    if (k === keys.role && !["lead", "worker", "observer"].includes(v)) throw new Error(`${k} must be lead, worker or observer`);
  }
  const steps: TxStep[] = updates.map(([k, v]) => ({ id: k, title: `${name}: set ${k}`, address: entry.resolver, target: "PermissionedResolver", abi: permissionedResolverAbi, functionName: "setText", args: [dns, k, v] }));
  let lastBlock = 0n;
  const txs: Record<string, { hash: Hex; url: string; at: string }> = {};
  let i = 0;
  for (const s of steps) {
    i++;
    const r = requireOk(await runner.run(owner, "owner", s, `${i}/${steps.length}`));
    if (r.hash) txs[`setRecord:${s.id}`] = { hash: r.hash, url: r.url!, at: nowIso() };
    if (r.receipt && r.receipt.blockNumber > lastBlock) lastBlock = r.receipt.blockNumber;
  }
  if (!ctx.broadcast) { console.log("\nnothing sent. Re-run with --yes to broadcast."); return; }
  for (const [k, v] of updates) {
    const got = await readAt(lastBlock, (blockNumber) => pub.getEnsText({ name, key: k, blockNumber }));
    if (got !== v) throw new Error(`read-back mismatch for ${k}: ${got}`);
  }
  updateEnsDeployment(config, (d) => {
    const a = d.agents[label]!;
    for (const [k, v] of updates) a.records[k] = v;
    for (const [k, t] of Object.entries(txs)) a.txs[k] = t;
  });
  console.log(`✓ ${name}: ${updates.map(([k, v]) => `${k}=${v}`).join(", ")} (read back via Universal Resolver)\nwrote config/deployments/ens.sepolia.json`);
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
