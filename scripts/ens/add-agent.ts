// pnpm ens:add-agent <label> [--throwaway] [--yes] — create <label>.<team>.eth (A-BRAIN S1 step 5), owner key.
//   1. deploy a PermissionedResolver proxy for this agent only (one resolver per agent), initialised with the
//      owner's roles and the agent's records (sb.role, sb.scope, sb.pay.cap, sb.pay.daily, sb.status, sb.vendor,
//      agent-context) plus addr(60) = the agent's wallet
//   2. grantSetterRoles: the agent may set exactly one text key, sb.memory.head
//   3. UserRegistry.register(label, agentWallet, no subregistry, resolver, roleBitmap 0, expiry = now + lease):
//      a zero bitmap means the agent cannot transfer, renew, unregister or re-point its own name
// Idempotent. --throwaway registers a label that is not in config/app.json (key AGENT_<LABEL>_PRIVATE_KEY),
// used to prove the unregister kill switch without touching the demo agents.
import { encodeFunctionData, zeroAddress } from "viem";
import { ALL_ROLES, AGENT_TOKEN_ROLES, RESOLVER_ROLES, agentName, dnsEncode, labelhashId, labelhashOf, ownedResolverSalt } from "@supabrain/ens";
import { permissionedRegistryAbi, permissionedResolverAbi, userRegistryAbi, verifiableFactoryAbi } from "@supabrain/ens/abis";
import type { Hex } from "../lib/chain";
import { nowIso, readEnsDeployment, updateEnsDeployment } from "../lib/deployments";
import { ensContext, hasFlag, positional, walletFor } from "../lib/ensctx";
import { readAt, requireOk, type TxStep } from "../lib/tx";

async function main() {
  const ctx = await ensContext();
  const { config, runner, owner, teamLabel, addr } = ctx;
  const pub = runner.pub;
  const label = positional()[0];
  if (!label) throw new Error("usage: pnpm ens:add-agent <label> [--throwaway] [--yes]");
  const throwaway = hasFlag("throwaway");
  const cfg = config.app.agents.find((a) => a.label === label);
  if (!cfg && !throwaway) throw new Error(`"${label}" is not in config/app.json agents (use --throwaway for a test agent)`);
  const agent = { vendor: cfg?.vendor ?? "claude", role: cfg?.role ?? "worker", scope: cfg?.scope ?? "test", payCap: cfg?.payCapUsdc ?? "0", payDaily: cfg?.payDailyUsdc ?? "0" };
  const wallet = walletFor(config, label).account;

  const dep = readEnsDeployment(config);
  if (!dep.teamRegistry) throw new Error("team registry not deployed: run ens:deploy-registry first");
  const registry = dep.teamRegistry.address;
  const name = agentName(label, teamLabel);
  const dns = dnsEncode(name);
  const keys = config.app.ens.textKeys;
  const factory = addr("VerifiableFactory");
  const salt = ownedResolverSalt(owner.address, labelhashId(label));

  const predicted = await pub.readContract({ address: factory, abi: verifiableFactoryAbi, functionName: "predictProxyAddress", args: [owner.address, salt] }) as Hex;
  const resolverCode = await pub.getCode({ address: predicted });
  const resolverDeployed = !!resolverCode && resolverCode !== "0x";
  const state = await pub.readContract({ address: registry, abi: userRegistryAbi, functionName: "getState", args: [labelhashId(label)] }) as { status: number; latestOwner: Hex; expiry: bigint };
  const setter = encodeFunctionData({ abi: permissionedResolverAbi, functionName: "setText", args: ["0x", keys.memoryHead, ""] });
  const memoryHeadResource = BigInt(labelhashOf(keys.memoryHead)); // resource of a text key = keccak256(bytes(key))
  const agentCanSetHead = resolverDeployed && (await pub.readContract({ address: predicted, abi: permissionedResolverAbi, functionName: "hasRoles", args: [memoryHeadResource, RESOLVER_ROLES.SET_TEXT, wallet.address] }) as boolean);

  const records: Record<string, string> = {
    [keys.role]: agent.role, [keys.scope]: agent.scope, [keys.payCap]: agent.payCap, [keys.payDaily]: agent.payDaily,
    [keys.status]: "active", [keys.vendor]: agent.vendor,
    [keys.agentContext]: `Supabrain agent ${name}: ${agent.role} (${agent.vendor}) writing to "${agent.scope}". Rules are ENS records only the team owner can change.`,
  };
  console.log(`\n${name}${throwaway ? " (throwaway)" : ""}`);
  console.log(`  wallet   ${wallet.address}\n  resolver ${predicted} (${resolverDeployed ? "deployed" : "to deploy"})\n  registry ${registry} · entry ${["AVAILABLE", "RESERVED", "REGISTERED"][state.status]}`);
  console.log(`  records  ${JSON.stringify(records)}`);

  const initCalls = [
    ...Object.entries(records).map(([k, v]) => encodeFunctionData({ abi: permissionedResolverAbi, functionName: "setText", args: [dns, k, v] })),
    encodeFunctionData({ abi: permissionedResolverAbi, functionName: "setAddress", args: [dns, 60n, wallet.address] }),
  ];
  const initData = encodeFunctionData({ abi: permissionedResolverAbi, functionName: "initialize", args: [[{ account: owner.address, roleBitmap: ALL_ROLES }], initCalls] });
  const expiry = BigInt((await pub.getBlock()).timestamp) + BigInt(config.app.ens.leaseDays) * 86_400n;

  const steps: TxStep[] = [];
  if (!resolverDeployed) steps.push({ id: "deployResolver", title: `deploy ${name}'s own resolver, with its records`, address: factory, target: "VerifiableFactory", abi: verifiableFactoryAbi, functionName: "deployProxy", args: [addr("PermissionedResolverImpl"), salt, initData] });
  if (!agentCanSetHead) steps.push({ id: "grantMemoryHead", title: `let the agent set only the "${keys.memoryHead}" text key`, address: predicted, target: "PermissionedResolver", abi: permissionedResolverAbi, functionName: "grantSetterRoles", args: [setter, wallet.address], simulate: resolverDeployed });
  if (state.status !== 2) steps.push({ id: "register", title: `register ${name} to the agent wallet (lease ${config.app.ens.leaseDays} d, no roles)`, address: registry, target: "UserRegistry", abi: userRegistryAbi, functionName: "register", args: [label, wallet.address, zeroAddress, predicted, AGENT_TOKEN_ROLES, expiry] });
  if (!steps.length) console.log("\nnothing to do: already set up.");

  const txs: Record<string, { hash: Hex; url: string; at: string }> = {};
  let lastBlock = 0n;
  let i = 0;
  for (const step of steps) {
    i++;
    const r = requireOk(await runner.run(owner, "owner", step, `${i}/${steps.length}`));
    if (r.hash) txs[step.id] = { hash: r.hash, url: r.url!, at: nowIso() };
    if (r.receipt && r.receipt.blockNumber > lastBlock) lastBlock = r.receipt.blockNumber;
  }
  if (!ctx.broadcast) { if (steps.length) console.log("\nnothing sent. Re-run with --yes to broadcast."); return; }

  // --- verify from chain state, through the Universal Resolver where possible. Reads are pinned to the block of
  // our last tx (or head, when nothing was sent) so a lagging RPC node cannot show pre-transaction state.
  const at = lastBlock || (await pub.getBlockNumber());
  const problems: string[] = [];
  const after = await readAt(at, (blockNumber) => pub.readContract({ address: registry, abi: userRegistryAbi, functionName: "getState", args: [labelhashId(label)], blockNumber })) as { status: number; latestOwner: Hex; expiry: bigint };
  const liveOwner = await readAt(at, (blockNumber) => pub.readContract({ address: registry, abi: userRegistryAbi, functionName: "getOwner", args: [labelhashId(label)], blockNumber })) as Hex;
  if (liveOwner.toLowerCase() !== wallet.address.toLowerCase()) problems.push(`getOwner = ${liveOwner}, expected ${wallet.address}`);
  const rolesOnName = await readAt(at, (blockNumber) => pub.readContract({ address: registry, abi: permissionedRegistryAbi, functionName: "roles", args: [labelhashId(label), wallet.address], blockNumber })) as bigint;
  if (rolesOnName !== 0n) problems.push(`agent holds roles ${rolesOnName.toString(16)} on its name; expected none`);
  const canSetHead = await readAt(at, (blockNumber) => pub.readContract({ address: predicted, abi: permissionedResolverAbi, functionName: "hasRoles", args: [memoryHeadResource, RESOLVER_ROLES.SET_TEXT, wallet.address], blockNumber })) as boolean;
  if (!canSetHead) problems.push(`agent cannot set ${keys.memoryHead}`);
  const canSetCap = await pub.readContract({ address: predicted, abi: permissionedResolverAbi, functionName: "hasRoles", args: [BigInt(labelhashOf(keys.payCap)), RESOLVER_ROLES.SET_TEXT, wallet.address] }) as boolean;
  const rootText = await pub.readContract({ address: predicted, abi: permissionedResolverAbi, functionName: "hasRoles", args: [0n, RESOLVER_ROLES.SET_TEXT, wallet.address] }) as boolean;
  if (canSetCap || rootText) problems.push("agent can set more than its memory head key");
  const urRead = <T>(f: (blockNumber: bigint) => Promise<T>) => readAt(at, f).catch((e) => `error: ${e.shortMessage ?? e.message}`);
  const viaUr = { addr: await urRead((blockNumber) => pub.getEnsAddress({ name, blockNumber })), role: await urRead((blockNumber) => pub.getEnsText({ name, key: keys.role, blockNumber })), cap: await urRead((blockNumber) => pub.getEnsText({ name, key: keys.payCap, blockNumber })) };
  console.log(`\nUniversal Resolver read-back: addr=${viaUr.addr} · ${keys.role}=${viaUr.role} · ${keys.payCap}=${viaUr.cap}`);
  if (String(viaUr.addr).toLowerCase() !== wallet.address.toLowerCase()) problems.push(`UR addr ${viaUr.addr} != wallet ${wallet.address}`);
  if (viaUr.cap !== agent.payCap) problems.push(`UR ${keys.payCap} ${viaUr.cap} != ${agent.payCap}`);
  if (problems.length) throw new Error(`post-check failed:\n  ${problems.join("\n  ")}`);

  updateEnsDeployment(config, (d) => {
    const prev = d.agents[label];
    d.agents[label] = { label, ens: name, labelhash: labelhashOf(label), wallet: wallet.address, resolver: predicted, resolverSalt: salt.toString(), expiry: Number(after.expiry), txs: { ...(prev?.txs ?? {}), ...txs }, records, ...(throwaway ? { throwaway: true } : {}) };
  });
  console.log(`✓ ${name} ready: owner=${wallet.address}, lease until ${new Date(Number(after.expiry) * 1000).toISOString()}, can set only ${keys.memoryHead}\nwrote config/deployments/ens.sepolia.json`);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
