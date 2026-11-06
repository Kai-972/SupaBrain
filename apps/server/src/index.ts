import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { connectArkiv } from "@supabrain/arkiv";
import { connectSepolia, createEnsAuthority, createViemEnsChain } from "@supabrain/ens";
import { agentKeyEnvName } from "@supabrain/shared";
import { loadConfig, readEnv, requireEnv } from "@supabrain/shared/config";
import { createApp } from "./app";
import { createArkivMemoryStore } from "./arkiv/store";
import { startSync } from "./memory/sync";
import { createPaymentsDisabled } from "./payments-disabled";
import { createRuntime } from "./runtime";

const log = (line: string) => console.log(`${new Date().toISOString().slice(11, 19)} ${line}`);

async function main() {
  const loaded = loadConfig();
  const env = readEnv();
  // SUPABRAIN_APP_NAMESPACE lets dev runs write to their own Arkiv namespace, never the demo's.
  const config = { ...loaded, app: { ...loaded.app, appNamespace: env.SUPABRAIN_APP_NAMESPACE ?? loaded.app.appNamespace } };
  const port = env.PORT ?? config.app.server.port;

  // Fail closed at startup: wrong chain or missing deployment means no server, not a guess.
  const sepolia = await connectSepolia(config, requireEnv(config.networks.sepolia.rpcEnv));
  const deployments = config.deployments.ens;
  if (!deployments?.teamRegistry) throw new Error("config/deployments/ens.sepolia.json has no team registry: run the S1 ENS scripts first");
  const ens = createEnsAuthority({ app: config.app, deployments, chain: createViemEnsChain(sepolia) });

  const rabdi = config.networks.rabdi;
  if (!rabdi.explorer.entity) throw new Error("config/networks.json rabdi.explorer.entity is missing");
  const accessKey = requireEnv("ARKIV_ACCESS_KEY");
  const conn = await connectArkiv({ accessKey, expectedChainId: rabdi.chainId });

  // The server holds the team key and each agent's key (never the owner key). Each must match ENS.
  const signers: Record<string, PrivateKeyAccount> = { team: privateKeyToAccount(requireEnv("TEAM_PRIVATE_KEY") as `0x${string}`) };
  for (const a of config.app.agents) {
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
    lifetimeSec: { memory: config.app.arkivExpirySec.memory, evidence: config.app.arkivExpirySec.evidence },
    log,
  });
  const runtime = createRuntime({ config, ens, store, log });
  const sync = startSync({ store, graph: runtime.graph, bus: runtime.bus, tickMs: 30_000, log });
  const t0 = Date.now();
  const rebuilt = await sync.ready;
  log(`rebuilt from Arkiv (${config.app.appNamespace}/${config.app.team.id}): ${rebuilt.memories} memories, ${rebuilt.revocations} revocations in ${Date.now() - t0} ms`);

  const publicBaseUrl = env.PUBLIC_BASE_URL;
  const app = createApp({
    config, payments: createPaymentsDisabled(), ens, runtime,
    tokenSecret: requireEnv("TOKEN_SIGNING_SECRET"), publicBaseUrl, adminPassphrase: env.DASHBOARD_ADMIN_PASSPHRASE, log,
  });
  const server = app.listen(port, () => {
    log(`supabrain server on :${port} (app=${config.app.appNamespace}, team=${config.app.team.id})`);
    log(`MCP ${publicBaseUrl ?? `http://localhost:${port}`}/mcp (Bearer) and /mcp/t/<token> · tokens: pnpm mcp:token <agent>`); // hardcode-ok: local fallback when PUBLIC_BASE_URL is unset
  });
  const stop = () => { sync.stop(); server.close(); process.exit(0); };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((e) => {
  console.error(`server failed to start: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
