// ABIs from ensdomains/contracts-v2 at the commit pinned in config/ens.sepolia.json (abiSource), `abi` field only.
// Typed loosely on purpose: the JSON artifacts are not `as const`.
import type { Abi } from "viem";
import eth from "./PermissionedRegistry.json" with { type: "json" };
import ethRegistrar from "./ETHRegistrar.json" with { type: "json" };
import userRegistry from "./UserRegistry.json" with { type: "json" };
import verifiableFactory from "./VerifiableFactory.json" with { type: "json" };
import permissionedResolver from "./PermissionedResolver.json" with { type: "json" };
import universalResolver from "./UniversalResolverV2.json" with { type: "json" };
import universalHelper from "./UniversalHelper.json" with { type: "json" };
import mockErc20 from "./MockERC20.json" with { type: "json" };
import rentPriceOracle from "./StandardRentPriceOracle.json" with { type: "json" };

export const permissionedRegistryAbi = eth as Abi;
export const ethRegistrarAbi = ethRegistrar as Abi;
export const userRegistryAbi = userRegistry as Abi;
export const verifiableFactoryAbi = verifiableFactory as Abi;
export const permissionedResolverAbi = permissionedResolver as Abi;
export const universalResolverAbi = universalResolver as Abi;
export const universalHelperAbi = universalHelper as Abi;
export const mockErc20Abi = mockErc20 as Abi;
export const rentPriceOracleAbi = rentPriceOracle as Abi;

/** Every custom error from every ENS ABI above, deduplicated by signature, for decoding reverts that bubble up. */
export const ensErrorsAbi: Abi = (() => {
  const seen = new Set<string>();
  const out: Abi[number][] = [];
  for (const abi of [
    permissionedRegistryAbi, ethRegistrarAbi, userRegistryAbi, verifiableFactoryAbi,
    permissionedResolverAbi, universalResolverAbi, universalHelperAbi, mockErc20Abi, rentPriceOracleAbi,
  ]) {
    for (const item of abi) {
      if (item.type !== "error") continue;
      const sig = `${item.name}(${item.inputs.map((i) => i.type).join(",")})`;
      if (!seen.has(sig)) { seen.add(sig); out.push(item); }
    }
  }
  return out;
})();
