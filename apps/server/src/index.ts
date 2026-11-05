import { loadConfig, readEnv } from "@supabrain/shared/config";
import { createApp } from "./app";
import { createPaymentsDisabled } from "./payments-disabled";

const config = loadConfig();
const env = readEnv();
const port = env.PORT ?? config.app.server.port;

const app = createApp({ config, payments: createPaymentsDisabled() });
app.listen(port, () => {
  console.log(`supabrain server listening on :${port} (app=${config.app.appNamespace}, team=${config.app.team.id})`);
});
