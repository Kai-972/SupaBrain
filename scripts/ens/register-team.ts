// pnpm ens:register-team [--yes] — register <teamLabel>.eth on ENSv2 Sepolia (A-BRAIN S1 step 3), owner key.
//   1. mint ENS MockUSDC (the registration payment token; free to mint) and approve the ETHRegistrar
//   2. commit -> wait MIN_COMMITMENT_AGE -> register (commit-reveal)
// Idempotent: skips what is already done. The commit secret lives in .secrets/ (gitignored) so a crash after
// `commit` can resume instead of waiting out a stuck commitment.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { erc20Abi, zeroAddress, zeroHash } from "viem";
import { labelhashId, labelhashOf, teamName } from "@supabrain/ens";
import { ethRegistrarAbi, mockErc20Abi, permissionedRegistryAbi } from "@supabrain/ens/abis";
import { findRootDir } from "@supabrain/shared/config";
import type { Hex } from "../lib/chain";
import { nowIso, updateEnsDeployment } from "../lib/deployments";
import { ensContext } from "../lib/ensctx";
import { requireOk, type TxStep } from "../lib/tx";

const STATUS = ["AVAILABLE", "RESERVED", "REGISTERED"] as const;

async function main() {
  const ctx = await ensContext();
  const { config, runner, owner, teamLabel, addr } = ctx;
  const pub = runner.pub;
  const label = teamLabel;
  const name = teamName(label);
  const registrar = addr("ETHRegistrar");
  const ethRegistry = addr("ETHRegistry");
  const usdc = addr("MockUSDC");

  const read = <T>(address: Hex, abi: typeof ethRegistrarAbi, functionName: string, args: unknown[] = []) =>
    pub.readContract({ address, abi, functionName, args }) as Promise<T>;

  // --- current state
  const state = await read<{ status: number; expiry: bigint; latestOwner: Hex }>(ethRegistry, permissionedRegistryAbi, "getState", [labelhashId(label)]);
  console.log(`\n${name}: ${STATUS[state.status]}${state.status === 2 ? ` · owner ${state.latestOwner} · expires ${new Date(Number(state.expiry) * 1000).toISOString()}` : ""}`);
  if (state.status === 2) {
    if (state.latestOwner.toLowerCase() !== owner.address.toLowerCase()) throw new Error(`${name} is registered to ${state.latestOwner}, not our owner ${owner.address}`);
    console.log("already registered to our owner: nothing to do for step 3.");
    updateEnsDeployment(config, (d) => {
      d.team ??= { label, name, labelhash: labelhashOf(label), owner: owner.address, expiry: Number(state.expiry), txs: {} };
      d.team.expiry = Number(state.expiry);
    });
    return;
  }
  if (state.status !== 0) throw new Error(`${name} is ${STATUS[state.status]}, cannot register`);

  // --- parameters, all read from the contracts
  const [minCommit, maxCommit, minRegister] = await Promise.all([
    read<bigint>(registrar, ethRegistrarAbi, "MIN_COMMITMENT_AGE"),
    read<bigint>(registrar, ethRegistrarAbi, "MAX_COMMITMENT_AGE"),
    read<bigint>(registrar, ethRegistrarAbi, "MIN_REGISTER_DURATION"),
  ]);
  const wanted = BigInt(config.app.ens.teamNameDurationDays) * 86_400n;
  const duration = wanted > minRegister ? wanted : minRegister;
  const [base, premium] = await read<[bigint, bigint]>(registrar, ethRegistrarAbi, "getRegisterPrice", [label, duration, usdc]);
  const price = base + premium;
  const decimals = await read<number>(usdc, erc20Abi as never, "decimals");
  console.log(`duration ${duration}s (${Number(duration) / 86400} d) · price ${price} (${Number(price) / 10 ** Number(decimals)} MockUSDC: base ${base} + premium ${premium})`);
  console.log(`commit-reveal: MIN ${minCommit}s, MAX ${maxCommit}s`);

  const balance = await read<bigint>(usdc, erc20Abi as never, "balanceOf", [owner.address]);
  const allowance = await read<bigint>(usdc, erc20Abi as never, "allowance", [owner.address, registrar]);

  // --- commit secret (resume-able)
  const secretFile = join(findRootDir(), ".secrets", `commit-${label}.json`);
  mkdirSync(join(findRootDir(), ".secrets"), { recursive: true });
  let secret: Hex;
  if (existsSync(secretFile)) secret = JSON.parse(readFileSync(secretFile, "utf8")).secret as Hex;
  else {
    secret = `0x${randomBytes(32).toString("hex")}`;
    if (ctx.broadcast) writeFileSync(secretFile, JSON.stringify({ label, secret, createdAt: nowIso() }), { mode: 0o600 });
  }
  const referrer = zeroHash;
  const subregistry = zeroAddress; // attached in step 4 (setSubregistry)
  const resolver = zeroAddress; // the team name needs no records; agents have their own resolvers
  const commitment = await read<Hex>(registrar, ethRegistrarAbi, "makeCommitment", [label, owner.address, secret, subregistry, resolver, duration, referrer]);
  const committedAt = await read<bigint>(registrar, ethRegistrarAbi, "commitmentAt", [commitment]);

  const steps: TxStep[] = [];
  if (balance < price) steps.push({ id: "mint", title: `mint ${Number(price - balance) / 10 ** Number(decimals)} test USDC (registration payment token)`, address: usdc, target: "MockUSDC", abi: mockErc20Abi, functionName: "mint", args: [owner.address, price - balance] });
  if (allowance < price) steps.push({ id: "approve", title: "approve the ETHRegistrar to spend the registration fee", address: usdc, target: "MockUSDC", abi: mockErc20Abi, functionName: "approve", args: [registrar, price], simulate: balance >= price });
  if (committedAt === 0n) steps.push({ id: "commit", title: `commit to registering ${name} (commit-reveal)`, address: registrar, target: "ETHRegistrar", abi: ethRegistrarAbi, functionName: "commit", args: [commitment] });
  steps.push({ id: "register", title: `register ${name} for ${Number(duration) / 86400} days`, address: registrar, target: "ETHRegistrar", abi: ethRegistrarAbi, functionName: "register", args: [label, owner.address, secret, subregistry, resolver, duration, usdc, referrer], simulate: committedAt !== 0n && balance >= price && allowance >= price });

  const txs: Record<string, { hash: Hex; url: string; at: string }> = {};
  let i = 0;
  for (const step of steps) {
    i++;
    if (step.id === "register" && ctx.broadcast) {
      // wait for the commitment to age, using chain time
      const at = committedAt !== 0n ? committedAt : BigInt((await pub.getBlock()).timestamp);
      for (;;) {
        const now = BigInt((await pub.getBlock()).timestamp);
        if (now >= at + minCommit + 2n) break;
        console.log(`\n… waiting for the commitment to age (${(at + minCommit + 2n - now).toString()}s left)`);
        await new Promise((r) => setTimeout(r, 8_000));
      }
    }
    const r = requireOk(await runner.run(owner, "owner", step, `${i}/${steps.length}`));
    if (r.hash) txs[step.id] = { hash: r.hash, url: r.url!, at: nowIso() };
    if (step.id === "commit" && ctx.broadcast) {
      // commit must be mined before makeCommitment/commitmentAt reflect it; nothing else to do here
    }
  }

  if (!ctx.broadcast) { console.log("\nnothing sent. Re-run with --yes to broadcast."); return; }

  const after = await read<{ status: number; expiry: bigint; latestOwner: Hex }>(ethRegistry, permissionedRegistryAbi, "getState", [labelhashId(label)]);
  if (after.status !== 2 || after.latestOwner.toLowerCase() !== owner.address.toLowerCase()) throw new Error(`post-check failed: ${name} is ${STATUS[after.status]}`);
  updateEnsDeployment(config, (d) => {
    d.team = { label, name, labelhash: labelhashOf(label), owner: owner.address, expiry: Number(after.expiry), txs: { ...(d.team?.txs ?? {}), ...txs } };
  });
  console.log(`\n✓ ${name} registered to ${owner.address}, expires ${new Date(Number(after.expiry) * 1000).toISOString()}`);
  console.log("wrote config/deployments/ens.sepolia.json");
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
