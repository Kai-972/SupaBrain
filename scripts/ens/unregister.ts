// pnpm ens:unregister <agent> [--yes] — the kill switch (A-BRAIN S1 step 6/7), owner key.
//   1. UserRegistry.unregister(labelhash): the name is gone. getOwner -> 0x0, resolution -> null. The vault and the
//      server both key on getOwner(labelhash) == wallet, so the agent can no longer write memories or move money.
//   2. revoke the agent's sb.memory.head setter grant on its (now orphaned) resolver: defence in depth.
// Prints before / after state, and probes whether the agent could still write to its orphaned resolver.
import { labelhashOf, RESOLVER_ROLES, agentName, dnsEncode, labelhashId } from "@supabrain/ens";
import { permissionedResolverAbi, userRegistryAbi } from "@supabrain/ens/abis";
import { zeroAddress } from "viem";
import type { Hex } from "../lib/chain";
import { nowIso, readEnsDeployment, updateEnsDeployment } from "../lib/deployments";
import { ensContext, positional, walletFor } from "../lib/ensctx";
import { describeError, readAt, requireOk, type TxStep } from "../lib/tx";

async function main() {
  const ctx = await ensContext();
  const { config, runner, owner, teamLabel } = ctx;
  const pub = runner.pub;
  const label = positional()[0];
  if (!label) throw new Error("usage: pnpm ens:unregister <agent-label> [--yes]");
  const dep = readEnsDeployment(config);
  const entry = dep.agents[label];
  if (!dep.teamRegistry || !entry) throw new Error(`${label} is not deployed`);
  if (!entry.throwaway && !ctx.broadcast) console.log(`\nNOTE: ${label} is a DEMO agent. Unregistering it is the kill-switch demo; re-register later with ens:add-agent.`);
  const registry = dep.teamRegistry.address;
  const name = agentName(label, teamLabel);
  const keys = config.app.ens.textKeys;
  const agent = walletFor(config, label).account;
  const id = labelhashId(label);
  const headResource = BigInt(labelhashOf(keys.memoryHead));

  const snapshot = async (blockNumber?: bigint) => {
    const read = async (bn?: bigint) => ({
      owner: (await pub.readContract({ address: registry, abi: userRegistryAbi, functionName: "getOwner", args: [id], blockNumber: bn })) as Hex,
      status: (await pub.readContract({ address: registry, abi: userRegistryAbi, functionName: "getStatus" as never, args: [id], blockNumber: bn }).catch(() => undefined)) as number | undefined,
      addr: await pub.getEnsAddress({ name, blockNumber: bn }).catch((e) => `error: ${e.shortMessage ?? e.message}`),
      role: await pub.getEnsText({ name, key: keys.role, blockNumber: bn }).catch((e) => `error: ${e.shortMessage ?? e.message}`),
    });
    return blockNumber ? readAt(blockNumber, read) : read();
  };
  const probe = async () => {
    try {
      await pub.simulateContract({ account: agent, address: entry.resolver, abi: permissionedResolverAbi, functionName: "setText", args: [dnsEncode(name), keys.memoryHead, "post-kill-probe"] });
      return "WOULD SUCCEED (agent can still write to its orphaned resolver)";
    } catch (e) {
      return `reverts: ${describeError(permissionedResolverAbi, e)}`;
    }
  };

  const before = await snapshot();
  console.log(`\n${name}\n  before: getOwner=${before.owner} · addr=${before.addr} · ${keys.role}=${before.role}`);
  const unregistered = before.owner === zeroAddress;
  const grantPresent = (await pub.readContract({ address: entry.resolver, abi: permissionedResolverAbi, functionName: "hasRoles", args: [headResource, RESOLVER_ROLES.SET_TEXT, agent.address] })) as boolean;
  console.log(`  name ${unregistered ? "already unregistered" : "registered"} · ${keys.memoryHead} grant on its resolver ${grantPresent ? "still present" : "revoked"}`);

  const steps: TxStep[] = [];
  if (!unregistered) steps.push({ id: "unregister", title: `UNREGISTER ${name} (kill switch)`, address: registry, target: "UserRegistry", abi: userRegistryAbi, functionName: "unregister", args: [id] });
  if (grantPresent) steps.push({ id: "revokeGrant", title: `revoke the agent's ${keys.memoryHead} setter grant on its resolver`, address: entry.resolver, target: "PermissionedResolver", abi: permissionedResolverAbi, functionName: "revokeRoles", args: [headResource, RESOLVER_ROLES.SET_TEXT, agent.address] });
  if (!steps.length) console.log("nothing to do: already fully killed.");
  const txs: Record<string, { hash: Hex; url: string; at: string }> = {};
  let lastBlock = 0n;
  let i = 0;
  for (const step of steps) {
    i++;
    const r = requireOk(await runner.run(owner, "owner", step, `${i}/${steps.length}`));
    if (r.hash) txs[step.id] = { hash: r.hash, url: r.url!, at: nowIso() };
    if (r.receipt && r.receipt.blockNumber > lastBlock) lastBlock = r.receipt.blockNumber;
    if (step.id === "unregister" && ctx.broadcast) console.log(`    probe after unregister, grant still present: ${await probe()}`);
  }
  if (!ctx.broadcast) { if (steps.length) console.log("\nnothing sent. Re-run with --yes to broadcast."); return; }

  const after = await snapshot(lastBlock || (await pub.getBlockNumber()));
  console.log(`\n  after:  getOwner=${after.owner} · addr=${after.addr} · ${keys.role}=${after.role}`);
  console.log(`  probe after grant revoked: ${await probe()}`);
  const problems: string[] = [];
  if (after.owner !== zeroAddress) problems.push(`getOwner still ${after.owner}`);
  if (typeof after.addr === "string" && after.addr.toLowerCase() === agent.address.toLowerCase()) problems.push("name still resolves to the agent wallet");
  if (problems.length) throw new Error(`kill not effective:\n  ${problems.join("\n  ")}`);
  updateEnsDeployment(config, (d) => {
    const a = d.agents[label]!;
    a.unregisteredAt ??= nowIso();
    for (const [k, t] of Object.entries(txs)) a.txs[k] = t;
  });
  console.log(`✓ ${name} unregistered: getOwner = 0x0, name resolves to ${after.addr === null ? "null" : after.addr}\nwrote config/deployments/ens.sepolia.json`);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
