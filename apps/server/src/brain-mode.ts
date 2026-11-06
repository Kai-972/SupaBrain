// v2 brain mode (docs/PLAN.md §3.3–3.4): SUPABRAIN_BRAIN=<label> serves one pre-made brain from
// config/deployments/brains.sepolia.json instead of the v1 demo team. The brain's AIs are claude / gemini / openai,
// named <family>.<brain>.supabrain.eth in the brain's own ENSv2 subname registry, and each signs its Arkiv writes with
// its own wallet derived from BRAIN_AGENT_MNEMONIC (account = brain index, address = family index). Arkiv entities
// carry team = <brain>, so every brain is its own history. Payments stay in the demo team only.
import { toHex } from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { BRAIN_FAMILIES, brainAgentAccount, readBrainsConfig, readBrainsDeployment, type BrainDeployment, type BrainsDeployment } from "@supabrain/ens";
import type { AppConfig, EnsDeployment } from "@supabrain/shared";

export interface BrainMode {
  brain: BrainDeployment;
  all: BrainsDeployment;
  /** The config the rest of the server runs on: agents = the brain's AIs, team = the brain. */
  config: AppConfig;
  /** What EnsAuthority reads: the brain registry and its AI names. */
  deployments: EnsDeployment;
  /** One signing key per AI, derived (never stored). Empty when the mnemonic is absent: AIs can read, not write. */
  signers: Record<string, PrivateKeyAccount>;
  /** The parent every rule change must stay under, e.g. supabrain.eth. */
  parentName: string;
}

export function brainMode(config: AppConfig, root: string, label: string, mnemonic?: string): BrainMode {
  const all = readBrainsDeployment(root);
  if (!all) throw new Error("config/deployments/brains.sepolia.json not found: run pnpm ens:provision-brains --yes first");
  const brain = all.brains[label];
  if (!brain) throw new Error(`no brain "${label}" in brains.sepolia.json (have: ${Object.keys(all.brains).join(", ")})`);
  const cfg = readBrainsConfig(root);
  const base = config.app.agents[0];
  if (!base) throw new Error("config/app.json has no agents to take defaults from");
  const ens = config.deployments.ens;
  if (!ens?.teamRegistry) throw new Error("config/deployments/ens.sepolia.json has no team registry");

  const agents = BRAIN_FAMILIES.map((family) => {
    const role = cfg.records.role[family];
    if (role !== "lead" && role !== "worker" && role !== "observer") throw new Error(`brains.json role for ${family} must be lead, worker or observer`);
    return { ...base, label: family, vendor: family, role, scope: cfg.records.scope, payCapUsdc: "0", payDailyUsdc: "0", vaultDailyCeilingUsdc: "0" } as AppConfig["app"]["agents"][number];
  });
  const deployments: EnsDeployment = {
    network: ens.network,
    chainId: ens.chainId,
    ...(ens.team ? { team: ens.team } : {}),
    teamRegistry: { address: brain.registry, implementation: ens.teamRegistry.implementation, factory: all.factory, salt: brain.registrySalt, owner: brain.tokenOwner, txs: {} },
    agents: Object.fromEntries(BRAIN_FAMILIES.map((f) => {
      const a = brain.agents[f];
      return [f, { label: f, ens: a.ens, labelhash: a.labelhash, wallet: a.wallet, resolver: a.resolver, resolverSalt: a.resolverSalt, expiry: a.expiry, txs: {}, records: a.records }];
    })),
    vendors: {},
  } as EnsDeployment;
  const teamLabel = config.app.ens.teamLabel;
  const overlay: AppConfig = {
    ...config,
    app: {
      ...config.app,
      team: { id: brain.label, displayName: brain.label },
      ens: { ...config.app.ens, teamLabel: `${brain.label}.${teamLabel}` }, // names resolve as <family>.<brain>.<team>.eth
      agents,
      vendors: [],
    },
    deployments: { ...config.deployments, ens: deployments },
  };
  const signers: Record<string, PrivateKeyAccount> = {};
  if (mnemonic) {
    for (const f of BRAIN_FAMILIES) {
      const hd = brainAgentAccount(mnemonic, brain.index, f).getHdKey();
      const account = privateKeyToAccount(toHex(hd.privateKey!));
      if (account.address.toLowerCase() !== brain.agents[f].wallet.toLowerCase()) throw new Error(`BRAIN_AGENT_MNEMONIC does not derive ${brain.agents[f].ens}'s wallet ${brain.agents[f].wallet}; wrong mnemonic`);
      signers[f] = account;
    }
  }
  return { brain, all, config: overlay, deployments, signers, parentName: `${teamLabel}.eth` };
}
