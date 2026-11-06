import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { findRootDir, loadConfigFrom } from "@supabrain/shared/config";
import { createApp } from "./app";
import { createPaymentsDisabled } from "./payments-disabled";

describe("server shell", () => {
  it("serves /healthz and reports payments disabled", async () => {
    const app = createApp({ config: loadConfigFrom(findRootDir()), payments: createPaymentsDisabled() });
    const server = app.listen(0);
    try {
      const { port } = server.address() as AddressInfo;
      const res = await fetch(`http://127.0.0.1:${port}/healthz`);
      expect(await res.json()).toEqual({ ok: true, app: "supabrain-mumbai26", team: "team1", mode: "team", ens: "supabrain.eth", payments: "disabled" });
    } finally {
      server.close();
    }
  });
});

describe("createPaymentsDisabled", () => {
  it("fails honestly instead of faking a decision", async () => {
    const p = createPaymentsDisabled();
    expect(await p.pay("lead-claude", { payee: "acme.demo.eth", amount: "1", memo: "x" })).toEqual({
      status: "failed", error: "payments not enabled yet", intentId: "",
    });
    expect(p.list()).toEqual([]);
    expect((await p.onRevoke({} as never, { type: "source", id: "s" })).error).toBe("payments not enabled yet");
  });
});
