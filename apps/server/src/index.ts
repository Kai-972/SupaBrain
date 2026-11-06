import { connectSepolia, createEnsAuthority, createViemEnsChain } from "@supabrain/ens";
import { loadConfig, readEnv, requireEnv } from "@supabrain/shared/config";
import { createApp } from "./app";
import { createPaymentsDisabled } from "./payments-disabled";

async function main() {
  const config = loadConfig();
  const env = readEnv();
  const port = env.PORT ?? config.app.server.port;

  // Fail closed at startup: wrong chain or missing deployment means no MCP, not a guess.
  const sepolia = await connectSepolia(config, requireEnv(config.networks.sepolia.rpcEnv));
  const deployments = config.deployments.ens;
  if (!deployments?.teamRegistry) throw new Error("config/deployments/ens.sepolia.json has no team registry: run the S1 ENS scripts first");
  const ens = createEnsAuthority({ app: config.app, deployments, chain: createViemEnsChain(sepolia) });

  const tokenSecret = requireEnv("TOKEN_SIGNING_SECRET");
  const publicBaseUrl = env.PUBLIC_BASE_URL;
  const app = createApp({ config, payments: createPaymentsDisabled(), ens, tokenSecret, publicBaseUrl });
  app.listen(port, () => {
    console.log(`supabrain server listening on :${port} (app=${config.app.appNamespace}, team=${config.app.team.id})`);
    console.log(`MCP: ${publicBaseUrl ?? `http://localhost:${port}`}/mcp (Bearer) and /mcp/t/<token>; issue tokens with \`pnpm mcp:token <agent>\``); // hardcode-ok: local fallback when PUBLIC_BASE_URL is unset
  });
}

main().catch((e) => {
  console.error(`server failed to start: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
