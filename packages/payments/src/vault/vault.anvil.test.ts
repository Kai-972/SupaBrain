// Integration: the TypeScript policy signer + vault client against the REAL compiled BrainVault on a local anvil.
// Skips (with a reason) when Foundry isn't installed. Random throwaway keys; nothing touches a real network.
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, createWalletClient, http, keccak256, parseUnits, stringToHex, type Abi, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { intentHash, newIntentId, rootHash, signAttestation, type VaultDomain, type VaultPayment } from "./attestation";
import { createVaultClient, VaultRevert, type VaultClient } from "./client";

const CONTRACTS = join(dirname(fileURLToPath(import.meta.url)), "../../../../contracts");
const has = (bin: string) => spawnSync("which", [bin]).status === 0;
const FOUNDRY = has("anvil") && has("forge");
const PORT = 18545 + Math.floor(Math.random() * 1000);
const RPC = `http://127.0.0.1:${PORT}`;
const U = (x: string) => parseUnits(x, 6);

function artifact(file: string, name: string): { abi: Abi; bytecode: Hex } {
  const j = JSON.parse(readFileSync(join(CONTRACTS, "out", file, `${name}.json`), "utf8"));
  return { abi: j.abi, bytecode: j.bytecode.object };
}

describe.skipIf(!FOUNDRY)("BrainVault on anvil (TS signer → real contract)", () => {
  let anvil: ChildProcess;
  const keys = { owner: generatePrivateKey(), guardian: generatePrivateKey(), policy: generatePrivateKey(), agent: generatePrivateKey(), payee: generatePrivateKey() };
  const acct = Object.fromEntries(Object.entries(keys).map(([k, v]) => [k, privateKeyToAccount(v)])) as Record<keyof typeof keys, ReturnType<typeof privateKeyToAccount>>;
  const pub = createPublicClient({ chain: foundry, transport: http(RPC) });
  const wallet = (k: keyof typeof keys) => createWalletClient({ chain: foundry, transport: http(RPC), account: acct[k] });
  const LABELHASH = BigInt(keccak256(stringToHex("lead-claude")));
  let usdc: Hex, registry: Hex, vault: Hex;
  let client: VaultClient;
  let domain: VaultDomain;
  const usdcArt = () => artifact("MockUSDC.sol", "MockUSDC");
  const regArt = () => artifact("MockAgentRegistry.sol", "MockAgentRegistry");

  async function deploy(k: keyof typeof keys, a: { abi: Abi; bytecode: Hex }, args: unknown[] = []): Promise<Hex> {
    const hash = await wallet(k).deployContract({ abi: a.abi, bytecode: a.bytecode, args });
    const r = await pub.waitForTransactionReceipt({ hash });
    return r.contractAddress!;
  }
  async function send(k: keyof typeof keys, address: Hex, abi: Abi, functionName: string, args: unknown[]) {
    const hash = await wallet(k).writeContract({ address, abi, functionName, args } as never);
    await pub.waitForTransactionReceipt({ hash });
  }
  async function attest(amount: string, roots: Hex[], humanApproved = true): Promise<{ p: VaultPayment; sig: Hex }> {
    const now = (await pub.getBlock()).timestamp;
    const p: VaultPayment = { agent: acct.agent.address, payee: acct.payee.address, amount: U(amount), roots, intentId: newIntentId(), deadline: now + 300n, humanApproved };
    return { p, sig: await signAttestation(acct.policy, domain, p) };
  }
  const balance = (a: Hex) => pub.readContract({ address: usdc, abi: usdcArt().abi, functionName: "balanceOf", args: [a] }) as Promise<bigint>;

  beforeAll(async () => {
    if (!existsSync(join(CONTRACTS, "out/BrainVault.sol/BrainVault.json"))) spawnSync("forge", ["build", "--silent"], { cwd: CONTRACTS });
    anvil = spawn("anvil", ["--port", String(PORT), "--silent"], { stdio: "ignore" });
    for (let i = 0; i < 50; i++) {
      try { await pub.getChainId(); break; } catch { await new Promise((r) => setTimeout(r, 100)); }
    }
    for (const a of Object.values(acct)) await pub.request({ method: "anvil_setBalance" as never, params: [a.address, "0x56BC75E2D63100000"] as never });

    usdc = await deploy("owner", usdcArt());
    registry = await deploy("owner", regArt());
    vault = await deploy("owner", artifact("BrainVault.sol", "BrainVault"), [usdc, acct.owner.address, acct.guardian.address, acct.policy.address, 8n, "BrainVault", "1"]);
    const now = (await pub.getBlock()).timestamp;
    await send("owner", registry, regArt().abi, "register", [LABELHASH, acct.agent.address, now + 7n * 86400n]);
    const vAbi = artifact("BrainVault.sol", "BrainVault").abi;
    await send("owner", vault, vAbi, "setAgent", [acct.agent.address, registry, LABELHASH, U("30")]);
    await send("owner", usdc, usdcArt().abi, "mint", [vault, U("100")]);

    domain = { name: "BrainVault", version: "1", chainId: foundry.id, verifyingContract: vault };
    client = createVaultClient({ publicClient: pub as never, address: vault, txUrl: (h) => `local://tx/${h}` });
  }, 60_000);

  afterAll(() => {
    anvil?.kill();
  });

  it("pays with a TS-signed attestation, and spentToday moves", async () => {
    const { p, sig } = await attest("5", [rootHash("0xH1")]);
    const tx = await client.pay(wallet("agent"), p, sig);
    expect(tx.txUrl).toBe(`local://tx/${tx.hash}`);
    expect(await balance(acct.payee.address)).toBe(U("5"));
    expect(await client.spentToday(acct.agent.address)).toBe(U("5"));
    expect(await client.isIntentUsed(p.intentId)).toBe(true);
    expect(await client.policySigner()).toBe(acct.policy.address);
  });

  it("a replayed attestation reverts Replay before anything is sent", async () => {
    const { p, sig } = await attest("1", []);
    await client.pay(wallet("agent"), p, sig);
    await expect(client.pay(wallet("agent"), p, sig)).rejects.toMatchObject({ errorName: "Replay" });
  });

  it("an attestation signed by anyone but the policy signer reverts BadAttestation", async () => {
    const { p } = await attest("1", []);
    const forged = await signAttestation(acct.agent, domain, p);
    await expect(client.pay(wallet("agent"), p, forged)).rejects.toMatchObject({ errorName: "BadAttestation" });
  });

  it("guardian revokeRoot makes any payment carrying that root revert RootRevoked", async () => {
    const root = rootHash("email:acme-0611");
    await client.revokeRoot(wallet("guardian"), root);
    expect(await client.isRootRevoked(root)).toBe(true);
    const { p, sig } = await attest("1", [rootHash("0xH1"), root]);
    const err = await client.pay(wallet("agent"), p, sig).catch((e) => e);
    expect(err).toBeInstanceOf(VaultRevert);
    expect(err.errorName).toBe("RootRevoked");
  });

  it("guardian cancelIntent burns a signed-but-unused attestation", async () => {
    const { p, sig } = await attest("1", []);
    await client.cancelIntent(wallet("guardian"), p.intentId);
    await expect(client.pay(wallet("agent"), p, sig)).rejects.toMatchObject({ errorName: "Replay" });
  });

  it("the intent hash is stable for the World binding", () => {
    const i = { agent: acct.agent.address, payee: acct.payee.address, amount: U("5"), roots: [rootHash("0xH1")], intentId: `0x${"ab".repeat(32)}` as Hex, intentExpiry: 1n };
    expect(intentHash(i)).toBe(intentHash({ ...i }));
  });

  it("unregistering the agent in the registry kills payments on chain (AgentNotRegistered)", async () => {
    await send("owner", registry, regArt().abi, "unregister", [LABELHASH]);
    const { p, sig } = await attest("1", []);
    await expect(client.pay(wallet("agent"), p, sig)).rejects.toMatchObject({ errorName: "AgentNotRegistered" });
  });

  it("guardian pauseAgent on an unknown wallet reverts AgentUnknown", async () => {
    await expect(client.pauseAgent(wallet("guardian"), acct.payee.address)).rejects.toMatchObject({ errorName: "AgentUnknown" });
  });
});
