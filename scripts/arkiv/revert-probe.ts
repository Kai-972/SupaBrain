// pnpm tsx scripts/arkiv/revert-probe.ts   Repro for arkiv/friction.md: what do eth_estimateGas / eth_call / a mined tx
// say when Arkiv refuses an operation? Uses the spike's readonly memory M (needs `arkiv:spike --only s3 --yes` first).
import { createWalletClient } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { ExpirationTime } from "@arkiv-network/sdk";
import { custom, type Hex } from "viem";
import { redactUrls } from "@supabrain/shared";
import { arkivContext } from "../lib/arkivctx";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { findRootDir } from "@supabrain/shared/config";

const describe = (e: unknown) => {
  const x = e as { code?: unknown; shortMessage?: string; message?: string; details?: string; data?: unknown; cause?: { code?: unknown; data?: unknown; message?: string } };
  return redactUrls(JSON.stringify({ code: x.code ?? x.cause?.code, shortMessage: x.shortMessage, details: x.details, data: x.data ?? x.cause?.data, causeMessage: x.cause?.message?.split("\n")[0] }));
};

async function main() {
  const ctx = await arkivContext({ appSuffix: "-spike" });
  const file = join(findRootDir(), "config", "deployments", "arkiv.rabdi.json");
  const m = (JSON.parse(existsSync(file) ? readFileSync(file, "utf8") : "{}") as { spike?: { s3?: { lineage?: { m: Hex } } } }).spike?.s3?.lineage?.m;
  if (!m) throw new Error("no spike lineage yet: run `pnpm arkiv:spike --only s1,s3 --yes`");
  const agent = ctx.agentAccount("gem-research");

  // Capture the exact calldata the SDK builds for "agent extends M" (the agent no longer owns it → NotOwner).
  let captured: { from: Hex; to: Hex; data: Hex } | undefined;
  const wallet = createWalletClient({
    chain: rabdi({ accessKey: ctx.accessKey }),
    account: agent.address,
    transport: custom({ async request({ method, params }) {
      if (method === "eth_sendTransaction") {
        captured = (params as [{ from: Hex; to: Hex; data: Hex }])[0];
        throw new Error("captured");
      }
      return ctx.conn.rpc.request({ method, params } as never);
    } }, { retryCount: 0 }),
  });
  await wallet.executeBatch({ extensions: [{ entityKey: m, expiration: ExpirationTime.fromDays(7) }] }, { nonce: 0, gasPrice: 1n, gas: 1_000_000n }).catch(() => undefined);
  if (!captured) throw new Error("could not capture calldata");

  for (const method of ["eth_estimateGas", "eth_call"] as const) {
    try {
      const params = method === "eth_call" ? [captured, "latest"] : [captured];
      const out = await ctx.conn.rpc.request({ method, params } as never);
      console.log(`${method}: SUCCEEDED (${String(out)}) — unexpected for a refused operation`);
    } catch (e) {
      console.log(`${method}: ${describe(e)}`);
    }
  }
}
main().catch((e) => { console.error(redactUrls(e instanceof Error ? e.message : String(e))); process.exit(1); });
