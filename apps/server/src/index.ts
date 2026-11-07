import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { connectArkiv } from "@supabrain/arkiv";
import { http } from "viem";
import { connectSepolia, createEnsAuthority, createRulesWriter, createViemEnsChain, readBrainsConfig, readBrainsDeployment, ruleKeys, sepoliaChain } from "@supabrain/ens";
import { agentKeyEnvName } from "@supabrain/shared";
import { findRootDir, loadConfig, readEnv, requireEnv } from "@supabrain/shared/config";
import { brainMode } from "./brain-mode";
import { createHeadPublisher } from "./ens-heads";
import { createPaymentsDisabled } from "./payments-disabled";
import { createApp } from "./app";
import { createArkivMemoryStore } from "./arkiv/store";
import { startSync } from "./memory/sync";
import { mountPayments } from "./payments/mount";
import { join } from "node:path";
import { createRuntime, fileBlockedStore } from "./runtime";

const log = (line: string) => console.log(`${new Date().toISOString().slice(11, 19)} ${line}`);

async function main() {
  const loaded = loadConfig();
  const env = readEnv();
  // SUPABRAIN_APP_NAMESPACE lets dev runs write to their own Arkiv namespace, never the demo's.
  const base = { ...loaded, app: { ...loaded.app, appNamespace: env.SUPABRAIN_APP_NAMESPACE ?? loaded.app.appNamespace } };
  // v2 brain mode: SUPABRAIN_BRAIN=<label> serves one pre-made brain (its own ENS registry, derived AI wallets).
  const root = findRootDir();
  const brainLabel = process.env.SUPABRAIN_BRAIN?.trim();
  const bm = brainLabel ? brainMode(base, root, brainLabel, process.env.BRAIN_AGENT_MNEMONIC?.trim()) : undefined;
  const config = bm ? bm.config : base;
  const port = env.PORT ?? config.app.server.port;

  // Fail closed at startup: wrong chain or missing deployment means no server, not a guess.
  const rpcUrl = requireEnv(config.networks.sepolia.rpcEnv);
  const sepolia = await connectSepolia(config, rpcUrl);
  const deployments = config.deployments.ens;
  if (!deployments?.teamRegistry) throw new Error("config/deployments/ens.sepolia.json has no team registry: run the S1 ENS scripts first");
  const ens = createEnsAuthority({ app: config.app, deployments, chain: createViemEnsChain(sepolia) });

  const rabdi = config.networks.rabdi;
  if (!rabdi.explorer.entity) throw new Error("config/networks.json rabdi.explorer.entity is missing");
  const accessKey = requireEnv("ARKIV_ACCESS_KEY");
  const conn = await connectArkiv({ accessKey, expectedChainId: rabdi.chainId });

  // The server holds the team key and each agent's key (never the owner key). Each must match ENS.
  const signers: Record<string, PrivateKeyAccount> = { team: privateKeyToAccount(requireEnv("TEAM_PRIVATE_KEY") as `0x${string}`) };
  if (bm) {
    Object.assign(signers, bm.signers);
    if (!Object.keys(bm.signers).length) log(`no BRAIN_AGENT_MNEMONIC: ${bm.brain.ens}'s AIs can connect but not write`);
    else log(`brain ${bm.brain.ens} (#${bm.brain.index}): ${Object.values(bm.brain.agents).map((a) => a.ens).join(", ")}`);
  } else for (const a of config.app.agents) {
    const k = process.env[agentKeyEnvName(a.label)];
    if (!k) { log(`no key for ${a.label}: it can connect but not write`); continue; }
    signers[a.label] = privateKeyToAccount(k as `0x${string}`);
    const want = deployments.agents[a.label]?.wallet;
    if (want && want.toLowerCase() !== signers[a.label]!.address.toLowerCase()) log(`WARNING: ${a.label} key ${signers[a.label]!.address} != ENS wallet ${want}; its writes will be refused`);
  }

  const store = createArkivMemoryStore({
    conn, accessKey, chainId: rabdi.chainId, registry: rabdi.registry.address as `0x${string}`,
    app: config.app.appNamespace, team: config.app.team.id, signers,
    vendors: Object.fromEntries(config.app.agents.map((a) => [a.label, a.vendor])),
    explorer: { tx: rabdi.explorer.tx, entity: rabdi.explorer.entity },
    lifetimeSec: { memory: config.app.arkivExpirySec.memory, evidence: config.app.arkivExpirySec.evidence, notice: config.app.arkivExpirySec.notice, paymentIntent: config.app.arkivExpirySec.paymentIntent, paymentDecision: config.app.arkivExpirySec.paymentDecision },
    log,
  });
  const runtime = createRuntime({ config, ens, store, log, blockedStore: fileBlockedStore(join(root, ".data", `blocked-${config.app.appNamespace}-${config.app.team.id}.json`)) });
  const sync = startSync({ store, graph: runtime.graph, bus: runtime.bus, notices: runtime.notices, tickMs: 30_000, log });
  const t0 = Date.now();
  const rebuilt = await sync.ready;
  log(`rebuilt from Arkiv (${config.app.appNamespace}/${config.app.team.id}): ${rebuilt.memories} memories, ${rebuilt.revocations} revocations in ${Date.now() - t0} ms`);

  const publicBaseUrl = env.PUBLIC_BASE_URL;
  // Payments stay in the demo team (PLAN §2.2); brains are for continuity and carry pay caps of 0.
  const payments = bm ? createPaymentsDisabled() : mountPayments({ config, ens, runtime, log });
  // ENS rules (read everywhere; written for brains, where the team wallet holds set-text) and head refs.
  const rules = createRulesWriter({
    keys: ruleKeys(config.app.ens.textKeys, readBrainsConfig(root)), headKey: config.app.ens.textKeys.memoryHead,
    parentName: bm?.parentName ?? `${config.app.ens.teamLabel}.eth`,
    txUrl: (h) => config.networks.sepolia.explorer.tx.replace("{hash}", h),
    account: signers.team, chain: sepoliaChain(config, rpcUrl), transport: http(rpcUrl),
  });
  const heads = bm ? createHeadPublisher({ writer: rules, bus: runtime.bus, graph: runtime.graph, ensOf: (a) => deployments.agents[a]?.ens, skip: (k) => runtime.continuity.isStopping(k), log }) : undefined;
  const app = createApp({
    config, payments, ens, runtime,
    tokenSecret: requireEnv("TOKEN_SIGNING_SECRET"), publicBaseUrl, webBaseUrl: env.PUBLIC_WEB_URL, adminPassphrase: env.DASHBOARD_ADMIN_PASSPHRASE, log,
    legacyTools: process.env.SUPABRAIN_LEGACY_TOOLS === "1" || config.app.mcp.legacyTools, // AIs see continue/checkpoint/checkout
    rules, heads, registry: readBrainsDeployment(root), brainMode: !!bm,
  });
  const server = app.listen(port, () => {
    log(`supabrain server on :${port} (app=${config.app.appNamespace}, team=${config.app.team.id})`);
    log(`MCP ${publicBaseUrl ?? `http://localhost:${port}`}/mcp (Bearer) and /mcp/t/<token> · tokens: pnpm mcp:token <agent>`); // hardcode-ok: local fallback when PUBLIC_BASE_URL is unset
  });
  // Free hosts (Render) put a server to sleep after ~15 idle minutes, which drops the refusal log and makes the next
  // visitor wait for a cold start. SUPABRAIN_KEEP_WARM_SEC=<n> pings our own public URL every n seconds (off by default).
  const keepWarmSec = Number(process.env.SUPABRAIN_KEEP_WARM_SEC ?? 0);
  const keepWarm = publicBaseUrl && keepWarmSec >= 60
    ? setInterval(() => { fetch(`${publicBaseUrl.replace(/\/+$/, "")}/healthz`).catch(() => undefined); }, keepWarmSec * 1000)
    : undefined;
  if (keepWarm) log(`keep-warm: pinging the public URL every ${keepWarmSec}s`);
  const stop = () => { sync.stop(); if (keepWarm) clearInterval(keepWarm); server.close(); process.exit(0); };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((e) => {
  console.error(`server failed to start: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
