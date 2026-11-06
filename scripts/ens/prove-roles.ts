// pnpm ens:prove <agent> [--yes] — the ENSv2 authority proof, signed by the AGENT's own wallet (A-BRAIN S1 step 6):
//   1. setText(sb.memory.head)  -> succeeds: the one key the owner delegated
//   2. setText(sb.pay.cap)      -> REVERTS on chain: an agent cannot raise its own cap
//   3. safeTransferFrom(name)   -> REVERTS on chain: the agent's name is non-transferable
// The two reverts use a fixed gas limit so they are mined and leave explorer links (demo proof, rules page).
import { agentName, dnsEncode, labelhashId } from "@supabrain/ens";
import { permissionedResolverAbi, userRegistryAbi } from "@supabrain/ens/abis";
import type { Hex } from "../lib/chain";
import { nowIso, readEnsDeployment, updateEnsDeployment } from "../lib/deployments";
import { ensContext, positional, walletFor } from "../lib/ensctx";
import { type StepResult, type TxStep } from "../lib/tx";

async function main() {
  const ctx = await ensContext();
  const { config, runner, teamLabel } = ctx;
  const pub = runner.pub;
  const label = positional()[0];
  if (!label) throw new Error("usage: pnpm ens:prove <agent-label> [--yes]");
  const dep = readEnsDeployment(config);
  const entry = dep.agents[label];
  if (!dep.teamRegistry || !entry) throw new Error(`${label} is not set up: run ens:add-agent ${label} --yes first`);
  const { account } = walletFor(config, label);
  const keys = config.app.ens.textKeys;
  const name = agentName(label, teamLabel);
  const dns = dnsEncode(name);
  const tokenId = (await pub.readContract({ address: dep.teamRegistry.address, abi: userRegistryAbi, functionName: "getState", args: [labelhashId(label)] }) as { tokenId: bigint }).tokenId;

  const head = `proof:${nowIso()}`;
  const steps: (TxStep & { key: string })[] = [
    { key: "proofSetMemoryHead", id: "setHead", title: `${name} sets ${keys.memoryHead} (allowed: the one delegated key)`, address: entry.resolver, target: "PermissionedResolver", abi: permissionedResolverAbi, functionName: "setText", args: [dns, keys.memoryHead, head] },
    { key: "proofSetPayCapReverted", id: "setCap", title: `${name} tries to raise its own ${keys.payCap} to 999 (must REVERT)`, address: entry.resolver, target: "PermissionedResolver", abi: permissionedResolverAbi, functionName: "setText", args: [dns, keys.payCap, "999"], expectRevert: true, gas: 300_000n },
    { key: "proofTransferReverted", id: "transfer", title: `${name} tries to transfer its own name to another address (must REVERT)`, address: dep.teamRegistry.address, target: "UserRegistry", abi: userRegistryAbi, functionName: "safeTransferFrom", args: [account.address, ctx.owner.address, tokenId, 1n, "0x"], expectRevert: true, gas: 400_000n },
  ];

  const results: Record<string, StepResult> = {};
  let i = 0;
  for (const s of steps) {
    i++;
    results[s.key] = await runner.run(account, label, s, `${i}/${steps.length}`);
  }
  if (!ctx.broadcast) { console.log("\nnothing sent. Re-run with --yes to broadcast."); return; }

  const bad = Object.entries(results).filter(([, r]) => !r.ok);
  const after = await pub.getEnsText({ name, key: keys.memoryHead });
  const cap = await pub.getEnsText({ name, key: keys.payCap });
  console.log(`\nread-back via Universal Resolver: ${keys.memoryHead}=${after} · ${keys.payCap}=${cap} (unchanged: ${cap === entry.records[keys.payCap]})`);
  if (after !== head) bad.push([keys.memoryHead, results.proofSetMemoryHead!]);
  if (cap !== entry.records[keys.payCap]) throw new Error(`SECURITY: ${keys.payCap} changed to ${cap}!`);
  if (bad.length) throw new Error(`proof incomplete: ${bad.map(([k]) => k).join(", ")}`);

  updateEnsDeployment(config, (d) => {
    const a = d.agents[label]!;
    for (const [k, r] of Object.entries(results)) if (r.hash) a.txs[k] = { hash: r.hash as Hex, url: r.url!, at: nowIso() };
  });
  console.log(`✓ ${name}: set head ✓ · cap raise REVERTED ✓ (${results.proofSetPayCapReverted?.revert ?? "reverted"}) · transfer REVERTED ✓ (${results.proofTransferReverted?.revert ?? "reverted"})`);
  console.log("wrote config/deployments/ens.sepolia.json");
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
