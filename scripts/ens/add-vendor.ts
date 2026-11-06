// pnpm ens:add-vendor <label> [--yes] — create a team VENDOR name, e.g. acme.<team>.eth (A's S5 dependency; Lane B owns
// this script). The vendor's ENS address is the ground truth `decidePayment` checks payee addresses against.
//   1. owner deploys a PermissionedResolver for this vendor only, initialised with roles for the VENDOR wallet only:
//      the team owner holds no role on it, so only the vendor can change its own payout address
//   2. owner registers <label>.<team>.eth in the team UserRegistry to the vendor wallet, resolver = (1), no roles
//   3. the vendor wallet sets its own ETH address record (coin 60) = its honest payout address
//   4. the vendor wallet sets `sb.vendor` = its display name (config/app.json vendors)
// Idempotent: finished steps are skipped. Post-checks read chain state (pinned to the last tx block) and the Universal
// Resolver, then write config/deployments/ens.sepolia.json `vendors.<label>`.
import { encodeFunctionData, zeroAddress } from "viem";
import { ALL_ROLES, AGENT_TOKEN_ROLES, RESOLVER_ROLES, createEnsAuthority, createViemEnsChain, dnsEncode, labelhashId, labelhashOf, ownedResolverSalt } from "@supabrain/ens";
import { permissionedRegistryAbi, permissionedResolverAbi, userRegistryAbi, verifiableFactoryAbi } from "@supabrain/ens/abis";
import type { Hex } from "../lib/chain";
import { nowIso, readEnsDeployment, updateEnsDeployment } from "../lib/deployments";
import { ensContext, positional, walletFor } from "../lib/ensctx";
import { readAt, requireOk, type TxStep } from "../lib/tx";

async function main() {
  const ctx = await ensContext();
  const { config, runner, owner, teamLabel, addr } = ctx;
  const pub = runner.pub;
  const label = positional()[0];
  if (!label) throw new Error("usage: pnpm ens:add-vendor <label> [--yes]");
  const cfg = config.app.vendors.find((v) => v.label === label);
  if (!cfg) throw new Error(`"${label}" is not in config/app.json vendors`);
  const w = walletFor(config, label);
  if (w.kind !== "vendor") throw new Error(`${label} is not a vendor`);
  const vendor = w.account;

  const dep = readEnsDeployment(config);
  if (!dep.teamRegistry || !dep.team) throw new Error("team name/registry not deployed: run the S1 ENS scripts first");
  const registry = dep.teamRegistry.address;
  const name = `${label}.${teamLabel}.eth`;
  const dns = dnsEncode(name);
  const keys = config.app.ens.textKeys;
  const factory = addr("VerifiableFactory");
  const id = labelhashId(label);
  const salt = ownedResolverSalt(owner.address, id); // deployer = owner (pays gas); roles go to the vendor only

  const predicted = (await pub.readContract({ address: factory, abi: verifiableFactoryAbi, functionName: "predictProxyAddress", args: [owner.address, salt] })) as Hex;
  const code = await pub.getCode({ address: predicted });
  const resolverDeployed = !!code && code !== "0x";
  const state = (await pub.readContract({ address: registry, abi: userRegistryAbi, functionName: "getState", args: [id] })) as { status: number; latestOwner: Hex; expiry: bigint };
  // current records via the Universal Resolver (the resolver has no direct getters); only meaningful once registered
  const live = resolverDeployed && state.status === 2;
  const currentAddr = live ? ((await pub.getEnsAddress({ name }).catch(() => null)) ?? zeroAddress) : zeroAddress;
  const currentVendor = live ? ((await pub.getEnsText({ name, key: keys.vendor }).catch(() => null)) ?? "") : "";
  const records = { [keys.vendor]: cfg.displayName };
  const balance = await pub.getBalance({ address: vendor.address });

  console.log(`\n${name} (vendor ${cfg.displayName})`);
  console.log(`  vendor wallet ${vendor.address} (balance ${Number(balance) / 1e18} ETH: it sends steps 3–4 itself)`);
  console.log(`  resolver      ${predicted} (${resolverDeployed ? "deployed" : "to deploy"}; roles: vendor only)`);
  console.log(`  registry      ${registry} · entry ${["AVAILABLE", "RESERVED", "REGISTERED"][state.status]}`);
  console.log(`  records       addr(60)=${vendor.address} · ${JSON.stringify(records)}`);

  const initData = encodeFunctionData({ abi: permissionedResolverAbi, functionName: "initialize", args: [[{ account: vendor.address, roleBitmap: ALL_ROLES }], []] });
  const expiryCap = BigInt(dep.team.expiry);
  const wanted = BigInt((await pub.getBlock()).timestamp) + BigInt(config.app.ens.teamNameDurationDays) * 86_400n;
  const expiry = wanted < expiryCap ? wanted : expiryCap; // a subname can't outlive the team name

  const ownerSteps: TxStep[] = [];
  if (!resolverDeployed) ownerSteps.push({ id: "deployResolver", title: `deploy ${name}'s own resolver (roles: vendor wallet only)`, address: factory, target: "VerifiableFactory", abi: verifiableFactoryAbi, functionName: "deployProxy", args: [addr("PermissionedResolverImpl"), salt, initData] });
  if (state.status !== 2) ownerSteps.push({ id: "register", title: `register ${name} to the vendor wallet (no roles on the name)`, address: registry, target: "UserRegistry", abi: userRegistryAbi, functionName: "register", args: [label, vendor.address, zeroAddress, predicted, AGENT_TOKEN_ROLES, expiry] });
  const vendorSteps: TxStep[] = [];
  if (currentAddr.toLowerCase() !== vendor.address.toLowerCase()) vendorSteps.push({ id: "setAddr", title: `${label} sets its own payout address (ETH addr record)`, address: predicted, target: "PermissionedResolver", abi: permissionedResolverAbi, functionName: "setAddress", args: [dns, 60n, vendor.address], simulate: resolverDeployed });
  if (currentVendor !== cfg.displayName) vendorSteps.push({ id: "setVendor", title: `${label} sets ${keys.vendor} = "${cfg.displayName}"`, address: predicted, target: "PermissionedResolver", abi: permissionedResolverAbi, functionName: "setText", args: [dns, keys.vendor, cfg.displayName], simulate: resolverDeployed });
  const total = ownerSteps.length + vendorSteps.length;
  if (!total) console.log("\nnothing to do: already set up.");

  const txs: Record<string, { hash: Hex; url: string; at: string }> = {};
  let lastBlock = 0n;
  let i = 0;
  const run = async (who: "owner" | typeof label, acct: typeof owner, step: TxStep) => {
    const r = requireOk(await runner.run(acct, who, step, `${++i}/${total}`));
    if (r.hash) txs[step.id] = { hash: r.hash, url: r.url!, at: nowIso() };
    if (r.receipt && r.receipt.blockNumber > lastBlock) lastBlock = r.receipt.blockNumber;
  };
  for (const s of ownerSteps) await run("owner", owner, s);
  for (const s of vendorSteps) await run(label, vendor, s);
  if (!ctx.broadcast) {
    if (total) console.log("\nnothing sent. Re-run with --yes to broadcast.");
    return;
  }

  // --- post-checks, pinned to the block of our last tx
  const at = lastBlock || (await pub.getBlockNumber());
  const problems: string[] = [];
  const read = <T>(f: (blockNumber: bigint) => Promise<unknown>) => readAt(at, f) as Promise<T>;
  const after = await read<{ status: number; expiry: bigint }>((blockNumber) => pub.readContract({ address: registry, abi: userRegistryAbi, functionName: "getState", args: [id], blockNumber }));
  const liveOwner = await read<Hex>((blockNumber) => pub.readContract({ address: registry, abi: userRegistryAbi, functionName: "getOwner", args: [id], blockNumber }));
  if (liveOwner.toLowerCase() !== vendor.address.toLowerCase()) problems.push(`getOwner = ${liveOwner}, expected ${vendor.address}`);
  const rolesOnName = await read<bigint>((blockNumber) => pub.readContract({ address: registry, abi: permissionedRegistryAbi, functionName: "roles", args: [id, vendor.address], blockNumber }));
  if (rolesOnName !== 0n) problems.push(`vendor holds roles ${rolesOnName.toString(16)} on its name; expected none`);
  const has = (who: Hex, role: bigint) => read<boolean>((blockNumber) => pub.readContract({ address: predicted, abi: permissionedResolverAbi, functionName: "hasRoles", args: [0n, role, who], blockNumber }));
  if (!(await has(vendor.address, RESOLVER_ROLES.SET_ADDRESS))) problems.push("vendor cannot set its own address");
  if (await has(owner.address, RESOLVER_ROLES.SET_ADDRESS)) problems.push("team owner can set the vendor's address (resolver should be vendor-owned)");
  const viaUr = {
    addr: await readAt(at, (blockNumber) => pub.getEnsAddress({ name, blockNumber })).catch((e) => `error: ${e.shortMessage ?? e.message}`),
    vendor: await readAt(at, (blockNumber) => pub.getEnsText({ name, key: keys.vendor, blockNumber })).catch((e) => `error: ${e.shortMessage ?? e.message}`),
  };
  console.log(`\nUniversal Resolver read-back: addr=${viaUr.addr} · ${keys.vendor}=${viaUr.vendor}`);
  if (String(viaUr.addr).toLowerCase() !== vendor.address.toLowerCase()) problems.push(`UR addr ${viaUr.addr} != vendor wallet ${vendor.address}`);
  if (viaUr.vendor !== cfg.displayName) problems.push(`UR ${keys.vendor} ${viaUr.vendor} != ${cfg.displayName}`);
  // what the payment policy will see
  const auth = createEnsAuthority({ app: config.app, deployments: dep, chain: createViemEnsChain(pub) });
  const found = await auth.findVendorEns(vendor.address).catch(() => null);
  if (found !== name) problems.push(`EnsAuthority.findVendorEns(vendor) = ${found}, expected ${name}`);
  if (problems.length) throw new Error(`post-check failed:\n  ${problems.join("\n  ")}`);

  updateEnsDeployment(config, (d) => {
    const prev = d.vendors[label] as { txs?: Record<string, unknown> } | undefined;
    d.vendors[label] = {
      label, ens: name, displayName: cfg.displayName, labelhash: labelhashOf(label), wallet: vendor.address, resolver: predicted,
      resolverSalt: salt.toString(), resolverOwner: vendor.address, expiry: Number(after.expiry), txs: { ...(prev?.txs ?? {}), ...txs },
      records: { addr60: vendor.address, ...records },
    };
  });
  console.log(`✓ ${name} → ${vendor.address} (set by the vendor itself; the team owner holds no role on its resolver)\nwrote config/deployments/ens.sepolia.json`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
