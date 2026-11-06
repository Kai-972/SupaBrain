// pnpm ens:provision-brains [--yes] [--only otter,maple] [--init-mnemonic] — v2 B1 (docs/PLAN.md §3.3–3.4), owner key.
// Pre-makes the brains in config/brains.json on ENSv2 Sepolia so creating a brain on the website is instant:
//   per brain  1. deploy a UserRegistry for <brain>.<team>.eth; the owner AND the team wallet (server) get register,
//                 renew, unregister and set-resolver (+ admins) on its root (admin roles can only be set here)
//              2. register <brain> in the team registry: owner = team wallet with renew only, subregistry = (1)
//   per AI     3. deploy its own PermissionedResolver with the default rules + addr(60) = its derived wallet;
//                 the owner gets every role, the team wallet gets set-text (rule changes from the website)
//              4. grantSetterRoles: the AI wallet may set exactly one text key, sb.memory.head
//              5. register <family> in the brain registry to the AI wallet, role bitmap 0, lease from config
// AI wallets come from BRAIN_AGENT_MNEMONIC (account = brain index, address = family index); nothing is stored per
// wallet. Dry run by default; --yes broadcasts. Idempotent: done steps are skipped, so a re-run resumes.
// --init-mnemonic writes a new BRAIN_AGENT_MNEMONIC into .env.local when it is absent (never printed).
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { encodeFunctionData, formatEther, zeroAddress } from "viem";
import { english, generateMnemonic } from "viem/accounts";
import {
  ALL_ROLES, AGENT_TOKEN_ROLES, BRAIN_FAMILIES, BRAIN_REGISTRY_ROLES, BRAIN_TOKEN_ROLES, RESOLVER_ROLES, TEAM_RESOLVER_ROLES,
  brainAgentAccount, brainAgentName, brainAgentRecords, brainName, brainResolverVersion, checkBrainOnChain, dnsEncode,
  labelhashId, labelhashOf, ownedResolverSalt, readBrainsConfig, readBrainsDeployment, userRegistrySalt, writeBrainsDeployment,
  type BrainAgentDeployment, type BrainDeployment, type BrainFamily, type BrainTx, type BrainsDeployment,
} from "@supabrain/ens";
import { permissionedResolverAbi, userRegistryAbi, verifiableFactoryAbi } from "@supabrain/ens/abis";
import { findRootDir, requireEnv } from "@supabrain/shared/config";
import { accountFromEnv, type Hex } from "../lib/chain";
import { nowIso, readEnsDeployment } from "../lib/deployments";
import { ensContext, hasFlag } from "../lib/ensctx";
import { readAt, requireOk, type TxStep } from "../lib/tx";

const MNEMONIC_ENV = "BRAIN_AGENT_MNEMONIC";
// Gas per step, measured from our receipts with headroom: used as each step's fixed gas limit (never trust a single
// estimate from a load-balanced RPC) and to size the dry-run cost. Sepolia gas is cheap; under-gassing is the risk.
const GAS_GUESS: Record<string, bigint> = { deployRegistry: 1_040_000n, registerBrain: 850_000n, deployResolver: 3_600_000n, grantMemoryHead: 300_000n, registerAgent: 850_000n };

function flagList(name: string): string[] | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]!.split(",").map((s) => s.trim()).filter(Boolean) : undefined;
}

function initMnemonic(root: string): void {
  if (process.env[MNEMONIC_ENV]?.trim()) throw new Error(`${MNEMONIC_ENV} is already set; refusing to replace it (every brain wallet derives from it)`);
  const file = join(root, ".env.local");
  const text = existsSync(file) ? readFileSync(file, "utf8") : "";
  if (new RegExp(`^\\s*${MNEMONIC_ENV}\\s*=`, "m").test(text)) throw new Error(`${MNEMONIC_ENV} already appears in .env.local; refusing to add a second one`);
  const mnemonic = generateMnemonic(english);
  appendFileSync(file, `${text.endsWith("\n") || !text ? "" : "\n"}# v2 brains: AI wallets derive from this (account = brain index, address = family index). Server secret; never log.\n${MNEMONIC_ENV}="${mnemonic}"\n`);
  process.env[MNEMONIC_ENV] = mnemonic;
  console.log(`wrote ${MNEMONIC_ENV} to .env.local (12 words, not shown). Share it with Lane A privately; the server derives the same wallets.`);
}

async function main() {
  const root = findRootDir();
  const ctx = await ensContext();
  const { config, runner, owner, teamLabel, addr } = ctx;
  const pub = runner.pub;
  if (hasFlag("init-mnemonic")) initMnemonic(root);
  const mnemonic = requireEnv(MNEMONIC_ENV);
  const team = accountFromEnv("TEAM_PRIVATE_KEY");
  const cfg = readBrainsConfig(root);
  const only = flagList("only");
  const brains = only ? cfg.brains.filter((b) => only.includes(b.label)) : cfg.brains;
  if (only && brains.length !== only.length) throw new Error(`--only names a brain that is not in config/brains.json: ${only.filter((l) => !cfg.brains.some((b) => b.label === l)).join(", ")}`);

  const ens = readEnsDeployment(config);
  if (!ens.teamRegistry) throw new Error("team registry not deployed (config/deployments/ens.sepolia.json)");
  const teamRegistry = ens.teamRegistry.address as Hex;
  const factory = addr("VerifiableFactory");
  const keys = config.app.ens.textKeys;
  const taken = new Set([...Object.keys(ens.agents), ...Object.keys(ens.vendors)]);
  const clash = brains.filter((b) => taken.has(b.label));
  if (clash.length) throw new Error(`brain labels clash with existing team names: ${clash.map((b) => b.label).join(", ")}`);

  const head = await pub.getBlock();
  const expiry = head.timestamp + BigInt(cfg.leaseDays) * 86_400n;
  const parentExpiry = BigInt(ens.team?.expiry ?? 0);
  if (parentExpiry && expiry > parentExpiry) console.log(`! lease ends after ${teamLabel}.eth itself (${new Date(Number(parentExpiry) * 1000).toISOString()}); names stop resolving when the parent expires`);
  console.log(`\nowner ${owner.address} · team (server) ${team.address} · team registry ${teamRegistry}`);
  console.log(`brains ${brains.map((b) => `${b.label}#${b.index}`).join(", ")} · lease ${cfg.leaseDays} d (until ${new Date(Number(expiry) * 1000).toISOString()})`);

  const dep: BrainsDeployment = readBrainsDeployment(root) ?? { network: "sepolia", chainId: config.networks.sepolia.chainId, teamRegistry, factory, updatedAt: nowIso(), brains: {} };
  const memoryHeadResource = BigInt(labelhashOf(keys.memoryHead));
  const setter = encodeFunctionData({ abi: permissionedResolverAbi, functionName: "setText", args: ["0x", keys.memoryHead, ""] });
  const gasPrice = (await pub.getGasPrice()) * 2n; // the runner pays 2x the node price
  let plannedTxs = 0;
  let plannedGas = 0n;

  for (const b of brains) {
    const bName = brainName(b.label, teamLabel);
    const regSalt = userRegistrySalt(bName, 0n);
    const registry = (await pub.readContract({ address: factory, abi: verifiableFactoryAbi, functionName: "predictProxyAddress", args: [owner.address, regSalt] })) as Hex;
    const regCode = await pub.getCode({ address: registry });
    const regDeployed = !!regCode && regCode !== "0x";
    const bState = (await pub.readContract({ address: teamRegistry, abi: userRegistryAbi, functionName: "getState", args: [labelhashId(b.label)] })) as { status: number; latestOwner: Hex; expiry: bigint };
    if (bState.status === 2) {
      const sub = (await pub.readContract({ address: teamRegistry, abi: userRegistryAbi, functionName: "getSubregistry", args: [b.label] })) as Hex;
      if (sub.toLowerCase() !== registry.toLowerCase()) throw new Error(`${bName} is registered but points at ${sub}, not our predicted registry ${registry}: not touching it`);
    }
    console.log(`\n=== ${bName} (index ${b.index}) · registry ${registry} (${regDeployed ? "deployed" : "to deploy"}) · name ${["AVAILABLE", "RESERVED", "REGISTERED"][bState.status]}`);

    const steps: (TxStep & { family?: BrainFamily })[] = [];
    if (!regDeployed) {
      const init = encodeFunctionData({ abi: userRegistryAbi, functionName: "initialize", args: [[{ account: owner.address, roleBitmap: BRAIN_REGISTRY_ROLES }, { account: team.address, roleBitmap: BRAIN_REGISTRY_ROLES }]] });
      steps.push({ id: "deployRegistry", title: `deploy ${bName}'s UserRegistry (owner + team: register, renew, unregister, set resolver + admins)`, address: factory, target: "VerifiableFactory", abi: verifiableFactoryAbi, functionName: "deployProxy", args: [addr("UserRegistryImpl"), regSalt, init] });
    }
    if (bState.status !== 2) steps.push({ id: "registerBrain", title: `register ${bName} to the team wallet (renew only), subregistry = its registry`, address: teamRegistry, target: "team UserRegistry", abi: userRegistryAbi, functionName: "register", args: [b.label, team.address, registry, zeroAddress, BRAIN_TOKEN_ROLES, expiry] });

    const agents = {} as Record<BrainFamily, BrainAgentDeployment>;
    for (const family of BRAIN_FAMILIES) {
      const name = brainAgentName(family, b.label, teamLabel);
      const wallet = brainAgentAccount(mnemonic, b.index, family).address;
      const salt = ownedResolverSalt(owner.address, brainResolverVersion(name));
      const resolver = (await pub.readContract({ address: factory, abi: verifiableFactoryAbi, functionName: "predictProxyAddress", args: [owner.address, salt] })) as Hex;
      const rCode = await pub.getCode({ address: resolver });
      const rDeployed = !!rCode && rCode !== "0x";
      const canHead = rDeployed && ((await pub.readContract({ address: resolver, abi: permissionedResolverAbi, functionName: "hasRoles", args: [memoryHeadResource, RESOLVER_ROLES.SET_TEXT, wallet] })) as boolean);
      const aState = regDeployed ? ((await pub.readContract({ address: registry, abi: userRegistryAbi, functionName: "getState", args: [labelhashId(family)] })) as { status: number }) : { status: 0 };
      const records = brainAgentRecords(cfg, keys, b.label, family, name);
      const dns = dnsEncode(name);
      console.log(`  ${name.padEnd(30)} wallet ${wallet} · resolver ${resolver} (${rDeployed ? "deployed" : "to deploy"}) · name ${["AVAILABLE", "RESERVED", "REGISTERED"][aState.status]}`);
      if (!rDeployed) {
        const calls = [
          ...Object.entries(records).map(([k, v]) => encodeFunctionData({ abi: permissionedResolverAbi, functionName: "setText", args: [dns, k, v] })),
          encodeFunctionData({ abi: permissionedResolverAbi, functionName: "setAddress", args: [dns, 60n, wallet] }),
        ];
        const init = encodeFunctionData({ abi: permissionedResolverAbi, functionName: "initialize", args: [[{ account: owner.address, roleBitmap: ALL_ROLES }, { account: team.address, roleBitmap: TEAM_RESOLVER_ROLES }], calls] });
        steps.push({ family, id: "deployResolver", title: `deploy ${name}'s resolver with its rules (team may set text)`, address: factory, target: "VerifiableFactory", abi: verifiableFactoryAbi, functionName: "deployProxy", args: [addr("PermissionedResolverImpl"), salt, init] });
      }
      if (!canHead) steps.push({ family, id: "grantMemoryHead", title: `let ${family}'s wallet set only "${keys.memoryHead}"`, address: resolver, target: "PermissionedResolver", abi: permissionedResolverAbi, functionName: "grantSetterRoles", args: [setter, wallet], simulate: rDeployed });
      if (aState.status !== 2) steps.push({ family, id: "registerAgent", title: `register ${name} to its wallet (no roles, lease ${cfg.leaseDays} d)`, address: registry, target: `${bName} UserRegistry`, abi: userRegistryAbi, functionName: "register", args: [family, wallet, zeroAddress, resolver, AGENT_TOKEN_ROLES, expiry], simulate: regDeployed && rDeployed });
      const prev = dep.brains[b.label]?.agents[family];
      agents[family] = {
        ens: name, labelhash: labelhashOf(family), wallet, resolver, resolverSalt: salt.toString(), accountIndex: b.index, addressIndex: BRAIN_FAMILIES.indexOf(family),
        expiry: Number(prev?.expiry ?? expiry), records: prev?.records ?? records, txs: prev?.txs ?? [], ...(prev?.funding ? { funding: prev.funding } : {}),
      };
    }

    // Fixed gas limits above the measured use: right after a deploy a lagging RPC node can simulate against the
    // pre-deploy state and return a tiny estimate (tundra's grant got 38k instead of 258k and ran out of gas).
    for (const s of steps) s.gas ??= GAS_GUESS[s.id];
    plannedTxs += steps.length;
    const brainGas = steps.reduce((s, x) => s + (GAS_GUESS[x.id] ?? 500_000n), 0n);
    plannedGas += brainGas;
    if (!steps.length) { console.log("  nothing to do: already provisioned."); }
    if (ctx.broadcast && steps.length) {
      const bal = await pub.getBalance({ address: owner.address });
      const need = brainGas * (await pub.getGasPrice()) * 2n;
      if (bal < need) throw new Error(`owner balance ${formatEther(bal)} ETH < ~${formatEther(need)} ETH needed for ${bName}; stopping (re-run resumes)`);
    }

    const brainTxs: BrainTx[] = [...(dep.brains[b.label]?.txs ?? [])];
    let lastBlock = 0n;
    let n = 0;
    for (const step of steps) {
      n++;
      const r = requireOk(await runner.run(owner, "owner", step, `${b.label} ${n}/${steps.length}`));
      if (r.receipt && r.receipt.blockNumber > lastBlock) lastBlock = r.receipt.blockNumber;
      if (r.hash) {
        const tx = { id: step.id, hash: r.hash, url: r.url!, at: nowIso() };
        if (step.family) agents[step.family].txs.push(tx);
        else brainTxs.push(tx);
      }
    }
    if (!ctx.broadcast) continue;

    const bExpiry = (await readAt(lastBlock || (await pub.getBlockNumber()), (blockNumber) => pub.readContract({ address: teamRegistry, abi: userRegistryAbi, functionName: "getExpiry", args: [labelhashId(b.label)], blockNumber }))) as bigint;
    const entry: BrainDeployment = { label: b.label, ens: bName, index: b.index, registry, registrySalt: regSalt.toString(), tokenOwner: team.address, expiry: Number(bExpiry), txs: brainTxs, agents };
    const check = await checkBrainOnChain(pub, {
      brain: entry, teamRegistry, team: team.address, owner: owner.address, memoryHeadKey: keys.memoryHead,
      textKeys: [keys.role, keys.status, keys.scope, cfg.writeDailyKey], ...(lastBlock ? { blockNumber: lastBlock } : {}),
    });
    dep.brains[b.label] = entry;
    dep.updatedAt = nowIso();
    writeBrainsDeployment(root, dep); // written even on problems: the txs are real; status shows what is wrong
    if (!check.ok) throw new Error(`${bName} post-check failed:\n  ${check.problems.join("\n  ")}`);
    console.log(`✓ ${bName}: verified on chain (owners, roles, resolvers, addr + rules via the Universal Resolver)`);
  }

  const cost = plannedGas * gasPrice;
  console.log(`\n${ctx.broadcast ? "sent" : "plan"}: ${plannedTxs} transaction(s) from the owner · ~${plannedGas} gas · ~${formatEther(cost)} ETH at 2x the current gas price`);
  const bal = await pub.getBalance({ address: owner.address });
  console.log(`owner balance ${formatEther(bal)} ETH${cost > bal ? "  ✗ NOT ENOUGH: provision fewer brains (--only)" : ""}`);
  if (!ctx.broadcast) { if (plannedTxs) console.log("nothing sent. Re-run with --yes to broadcast."); return; }
  console.log(`wrote config/deployments/brains.sepolia.json · check any time with pnpm ens:brains-status`);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
