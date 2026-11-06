// pnpm ens:brains-status [--only otter,maple] — v2 B1, READ-ONLY. For every brain in config/deployments/brains.sepolia.json,
// check live chain state: the brain name is held by the team wallet (renew only) and points at its registry; owner
// and team hold the brain-registry roles; each AI name is owned by its wallet (and, when BRAIN_AGENT_MNEMONIC is
// set, that wallet is the derived one), holds no roles, resolves addr = wallet through the Universal Resolver, the
// team can set its rules and the AI can set only its memory head. Prints the current rules. Exit 1 on any problem.
import { formatEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { BRAIN_FAMILIES, brainAgentAccount, checkBrainOnChain, readBrainsConfig, readBrainsDeployment, type BrainFamily } from "@supabrain/ens";
import { findRootDir, loadConfig, requireEnv } from "@supabrain/shared/config";
import { sepoliaClient, type Hex } from "../lib/chain";

async function main() {
  const root = findRootDir();
  const config = loadConfig();
  const cfg = readBrainsConfig(root);
  const dep = readBrainsDeployment(root);
  if (!dep) throw new Error("config/deployments/brains.sepolia.json not found: run pnpm ens:provision-brains --yes first");
  const { client: pub } = await sepoliaClient(config);
  const team = privateKeyToAccount(requireEnv("TEAM_PRIVATE_KEY") as Hex).address;
  const owner = privateKeyToAccount(requireEnv("OWNER_PRIVATE_KEY") as Hex).address;
  const mnemonic = process.env.BRAIN_AGENT_MNEMONIC?.trim();
  const keys = config.app.ens.textKeys;
  const ruleKeys = [keys.status, keys.role, keys.scope, cfg.writeDailyKey];
  const i = process.argv.indexOf("--only");
  const only = i >= 0 ? process.argv[i + 1]?.split(",") : undefined;
  const labels = Object.keys(dep.brains).filter((l) => !only || only.includes(l));
  const missing = cfg.brains.filter((b) => !dep.brains[b.label]).map((b) => b.label);

  console.log(`brains on ENSv2 Sepolia · team registry ${dep.teamRegistry} · team (server) ${team} · owner ${owner}`);
  console.log(`team wallet ${formatEther(await pub.getBalance({ address: team }))} ETH (pays for rule changes)${mnemonic ? "" : " · BRAIN_AGENT_MNEMONIC not set: derived-wallet check skipped"}\n`);
  let bad = 0;
  for (const label of labels) {
    const brain = dep.brains[label]!;
    const derived = mnemonic ? Object.fromEntries(BRAIN_FAMILIES.map((f) => [f, brainAgentAccount(mnemonic, brain.index, f).address])) as Record<BrainFamily, Hex> : undefined;
    const c = await checkBrainOnChain(pub, { brain, teamRegistry: dep.teamRegistry as Hex, team, owner, memoryHeadKey: keys.memoryHead, textKeys: ruleKeys, ...(derived ? { derived } : {}) });
    if (!c.ok) bad++;
    console.log(`${c.ok ? "✓" : "✗"} ${c.ens.padEnd(24)} #${brain.index} · registry ${brain.registry} · until ${new Date(c.expiry * 1000).toISOString().slice(0, 10)}`);
    for (const a of c.agents) {
      const rules = ruleKeys.map((k) => `${k}=${a.texts[k] ?? "∅"}`).join(" ");
      console.log(`    ${a.problems.length ? "✗" : "✓"} ${a.ens.padEnd(32)} ${a.wallet} · ${rules}`);
    }
    for (const p of c.problems) console.log(`      problem: ${p}`);
  }
  if (missing.length) console.log(`\nnot provisioned yet: ${missing.join(", ")}`);
  console.log(`\n${bad ? `✗ ${bad} brain(s) with problems` : `✓ ${labels.length} brain(s) verified on chain`}`);
  process.exit(bad ? 1 : 0);
}

main().catch((e) => { console.error(e instanceof Error ? e.message.replace(/https?:\/\/\S+/g, "<rpc>") : e); process.exit(2); });
