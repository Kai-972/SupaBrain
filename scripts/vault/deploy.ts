// pnpm vault:deploy [--yes] [--redeploy] — deploy BrainVault on Sepolia (B-MONEY.md S2). Owner key deploys and owns.
//   constructor(token = config USDC, owner = OWNER, guardian = GUARDIAN, policySigner = POLICY_SIGNER,
//               maxRoots = app.payments.maxRootsPerAttestation, name/version = app.payments.eip712)
// Dry run prints the plan, the deployer balance and a gas estimate. With --yes it deploys, reads every immutable back,
// and writes config/deployments/vault.sepolia.json (committed: proof).
import { createWalletClient, encodeDeployData, formatEther, formatGwei, http, type Hex } from "viem";
import { addressUrl, txUrl } from "../lib/chain";
import { artifact, brainVaultAbi, hasFlag, readVaultDeployment, vaultContext, writeVaultDeployment } from "./common";

// EIP-7825 per-transaction gas cap (protocol constant). Deploying ~11 KB of init code on Sepolia estimates ~15.5M gas
// today, so a +25% buffer would exceed the cap and be rejected: use +5%, never above the cap.
const TX_GAS_CAP = 16_777_216n;
const gasLimit = (estimate: bigint) => {
  if (estimate > TX_GAS_CAP) throw new Error(`deploy needs ${estimate} gas, above the per-tx cap ${TX_GAS_CAP}`);
  const padded = (estimate * 105n) / 100n;
  return padded > TX_GAS_CAP ? TX_GAS_CAP : padded;
};

async function main() {
  const ctx = await vaultContext();
  const { config, runner } = ctx;
  const pub = runner.pub;
  const existing = readVaultDeployment();
  if (existing && !hasFlag("redeploy")) {
    console.log(`\nBrainVault already deployed at ${existing.address} (${addressUrl(config, existing.address)}). Use --redeploy to deploy a new one.`);
    return;
  }

  const owner = ctx.owner();
  const guardian = ctx.guardian().address;
  const policySigner = ctx.policySigner().address;
  const usdc = config.tokens.usdc;
  const pay = config.app.payments;
  const args = [usdc.address, owner.address, guardian, policySigner, BigInt(pay.maxRootsPerAttestation), pay.eip712.name, pay.eip712.version] as const;

  const code = await pub.getCode({ address: usdc.address });
  if (!code || code === "0x") throw new Error(`USDC ${usdc.address} has no code on this chain`);

  const { bytecode } = artifact("BrainVault");
  const data = encodeDeployData({ abi: brainVaultAbi, bytecode, args });
  const balance = await pub.getBalance({ address: owner.address });
  const estimate = await pub.estimateGas({ account: owner, data });
  const gasPrice = (await pub.getGasPrice()) * 2n;

  console.log(`\nDeploy BrainVault`);
  console.log(`    from      owner ${owner.address}  (balance ${formatEther(balance)} ETH)`);
  console.log(`    token     ${usdc.symbol} ${usdc.address}`);
  console.log(`    owner     ${owner.address}`);
  console.log(`    guardian  ${guardian}`);
  console.log(`    policy    ${policySigner}`);
  console.log(`    maxRoots  ${pay.maxRootsPerAttestation} · EIP-712 ${pay.eip712.name} v${pay.eip712.version}`);
  console.log(`    gas       estimate ${estimate} → limit ${gasLimit(estimate)} (cap ${TX_GAS_CAP}) @ ${formatGwei(gasPrice)} gwei (node price x2)`);
  console.log(`    max cost  ${formatEther(gasLimit(estimate) * gasPrice)} ETH`);
  if (!ctx.broadcast) return;

  const wallet = createWalletClient({ account: owner, chain: runner.chain, transport: http(runner.rpcUrl) });
  const nonce = await pub.getTransactionCount({ address: owner.address, blockTag: "latest" });
  const hash = await wallet.sendTransaction({ data, gas: gasLimit(estimate), gasPrice, nonce, chain: runner.chain });
  console.log(`    sent      ${txUrl(config, hash)}`);
  const receipt = await pub.waitForTransactionReceipt({ hash, timeout: 180_000 });
  if (receipt.status !== "success" || !receipt.contractAddress) throw new Error(`deploy reverted: ${txUrl(config, hash)}`);
  const address = receipt.contractAddress as Hex;

  // read every immutable back from the chain before recording it
  const read = <T>(functionName: string) =>
    pub.readContract({ address, abi: brainVaultAbi, functionName: functionName as never, blockNumber: receipt.blockNumber }) as Promise<T>;
  const got = {
    token: await read<Hex>("token"), owner: await read<Hex>("owner"), guardian: await read<Hex>("guardian"),
    policySigner: await read<Hex>("policySigner"), maxRoots: await read<bigint>("MAX_ROOTS"),
  };
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  if (!same(got.token, usdc.address) || !same(got.owner, owner.address) || !same(got.guardian, guardian) || !same(got.policySigner, policySigner) || got.maxRoots !== BigInt(pay.maxRootsPerAttestation)) {
    throw new Error(`deployed vault state does not match the plan: ${JSON.stringify(got, (_k, v) => (typeof v === "bigint" ? v.toString() : v))}`);
  }

  writeVaultDeployment({
    chainId: config.networks.sepolia.chainId, address, token: usdc.address, owner: owner.address, guardian, policySigner,
    maxRoots: pay.maxRootsPerAttestation, eip712: pay.eip712, txHash: hash, deployedAt: new Date().toISOString(),
    txUrl: txUrl(config, hash), addressUrl: addressUrl(config, address), blockNumber: Number(receipt.blockNumber),
  });
  console.log(`    ✓ BrainVault ${address}  ${addressUrl(config, address)}`);
  console.log(`    wrote config/deployments/vault.sepolia.json`);
}

main().catch((e) => {
  console.error(`vault:deploy failed: ${(e as Error).message}`);
  process.exit(1);
});
