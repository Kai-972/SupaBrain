// pnpm ens:deploy-registry [--yes] — deploy the team's UserRegistry and attach it to <team>.eth (A-BRAIN S1 step 4).
//   1. VerifiableFactory.deployProxy(UserRegistryImpl, salt, initialize(grants)); the owner gets register / renew /
//      unregister / set-resolver (+ admins) on the registry root; agents get nothing.
//   2. ETHRegistry.setSubregistry(<team>, registry): the Universal Resolver now walks into our registry.
// Idempotent: the proxy address is predicted from (deployer, salt); steps already done are skipped.
import { encodeFunctionData } from "viem";
import { TEAM_OWNER_REGISTRY_ROLES, labelhashId, teamName, userRegistrySalt } from "@supabrain/ens";
import { permissionedRegistryAbi, userRegistryAbi, verifiableFactoryAbi } from "@supabrain/ens/abis";
import type { Hex } from "../lib/chain";
import { nowIso, updateEnsDeployment } from "../lib/deployments";
import { ensContext } from "../lib/ensctx";
import { requireOk, type TxStep } from "../lib/tx";

async function main() {
  const ctx = await ensContext();
  const { config, runner, owner, teamLabel, addr } = ctx;
  const pub = runner.pub;
  const name = teamName(teamLabel);
  const factory = addr("VerifiableFactory");
  const impl = addr("UserRegistryImpl");
  const ethRegistry = addr("ETHRegistry");
  const salt = userRegistrySalt(name, 0n);

  const team = await pub.readContract({ address: ethRegistry, abi: permissionedRegistryAbi, functionName: "getState", args: [labelhashId(teamLabel)] }) as { status: number; latestOwner: Hex };
  if (team.status !== 2 || team.latestOwner.toLowerCase() !== owner.address.toLowerCase()) throw new Error(`${name} is not registered to our owner: run ens:register-team first`);

  const predicted = await pub.readContract({ address: factory, abi: verifiableFactoryAbi, functionName: "predictProxyAddress", args: [owner.address, salt] }) as Hex;
  const code = await pub.getCode({ address: predicted });
  const deployed = !!code && code !== "0x";
  const currentSub = await pub.readContract({ address: ethRegistry, abi: permissionedRegistryAbi, functionName: "getSubregistry", args: [teamLabel] }) as Hex;
  console.log(`\n${name} registry: predicted ${predicted} · ${deployed ? "already deployed" : "not deployed"} · attached subregistry ${currentSub}`);
  console.log(`owner roles on the registry root: ${TEAM_OWNER_REGISTRY_ROLES.toString(16)} (register, renew, unregister, set-resolver + admins)`);

  const initData = encodeFunctionData({ abi: userRegistryAbi, functionName: "initialize", args: [[{ account: owner.address, roleBitmap: TEAM_OWNER_REGISTRY_ROLES }]] });
  const steps: TxStep[] = [];
  if (!deployed) steps.push({ id: "deployRegistry", title: `deploy the ${name} UserRegistry proxy`, address: factory, target: "VerifiableFactory", abi: verifiableFactoryAbi, functionName: "deployProxy", args: [impl, salt, initData] });
  if (currentSub.toLowerCase() !== predicted.toLowerCase()) steps.push({ id: "setSubregistry", title: `attach the registry to ${name} (setSubregistry)`, address: ethRegistry, target: "ETHRegistry", abi: permissionedRegistryAbi, functionName: "setSubregistry", args: [labelhashId(teamLabel), predicted] });
  if (!steps.length) console.log("nothing to do for step 4.");

  const txs: Record<string, { hash: Hex; url: string; at: string }> = {};
  let i = 0;
  for (const step of steps) {
    i++;
    const r = requireOk(await runner.run(owner, "owner", step, `${i}/${steps.length}`));
    if (r.hash) txs[step.id] = { hash: r.hash, url: r.url!, at: nowIso() };
  }
  if (!ctx.broadcast) { if (steps.length) console.log("\nnothing sent. Re-run with --yes to broadcast."); return; }

  // --- verify, from chain state
  const proven = await pub.readContract({ address: factory, abi: verifiableFactoryAbi, functionName: "verifyContract", args: [predicted] }) as Hex;
  const sub = await pub.readContract({ address: ethRegistry, abi: permissionedRegistryAbi, functionName: "getSubregistry", args: [teamLabel] }) as Hex;
  const roles = await pub.readContract({ address: predicted, abi: userRegistryAbi, functionName: "roles", args: [0n, owner.address] }) as bigint;
  const problems: string[] = [];
  if (proven.toLowerCase() !== impl.toLowerCase()) problems.push(`factory says implementation ${proven}, expected ${impl}`);
  if (sub.toLowerCase() !== predicted.toLowerCase()) problems.push(`getSubregistry = ${sub}, expected ${predicted}`);
  if (roles !== TEAM_OWNER_REGISTRY_ROLES) problems.push(`owner roles ${roles.toString(16)} != ${TEAM_OWNER_REGISTRY_ROLES.toString(16)}`);
  if (problems.length) throw new Error(`post-check failed:\n  ${problems.join("\n  ")}`);
  updateEnsDeployment(config, (d) => {
    d.teamRegistry = { address: predicted, implementation: impl, factory, salt: salt.toString(), owner: owner.address, txs: { ...(d.teamRegistry?.txs ?? {}), ...txs } };
  });
  console.log(`\n✓ verified on chain: factory-proven proxy of UserRegistryImpl · getSubregistry("${teamLabel}") = registry · owner roles correct`);
  console.log(`  registry ${predicted}\nwrote config/deployments/ens.sepolia.json`);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
