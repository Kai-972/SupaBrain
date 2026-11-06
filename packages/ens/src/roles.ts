// Role bitmaps from the ENSv2 docs (Permissioned Registry / Permissioned Resolver / Enhanced Access Control).
// Each role is one 4-bit slot; its ADMIN counterpart sits 128 bits higher.

/** Admin variant of a role (role << 128). */
export const adminOf = (role: bigint): bigint => role << 128n;
/** A role plus its admin. */
export const withAdmin = (role: bigint): bigint => role | adminOf(role);

/** Roles on a PermissionedRegistry / UserRegistry (ROOT_RESOURCE unless noted). */
export const REGISTRY_ROLES = {
  REGISTRAR: 1n << 0n,
  REGISTER_RESERVED: 1n << 4n,
  SET_PARENT: 1n << 8n,
  UNREGISTER: 1n << 12n,
  RENEW: 1n << 16n,
  SET_SUBREGISTRY: 1n << 20n,
  SET_RESOLVER: 1n << 24n,
  CAN_TRANSFER_ADMIN: (1n << 28n) << 128n, // admin-only: no non-admin variant
  SET_URI: 1n << 36n,
  UPGRADE: 1n << 124n,
} as const;

/** Roles on a PermissionedResolver. */
export const RESOLVER_ROLES = {
  SET_ADDRESS: 1n << 0n,
  SET_TEXT: 1n << 4n,
  SET_CONTENTHASH: 1n << 8n,
  SET_ABI: 1n << 12n,
  SET_INTERFACE: 1n << 16n,
  SET_NAME: 1n << 20n,
  SET_DATA: 1n << 24n,
  LINK: 1n << 28n,
  CAN_NAME: 1n << 120n,
  UPGRADE: 1n << 124n,
} as const;

/** Every role and every admin role (the docs' ALL_ROLES). */
export const ALL_ROLES = BigInt("0x" + "1".repeat(64));

/**
 * What the team owner holds on the team UserRegistry (A-BRAIN S1 step 4): register, renew, unregister and
 * set-resolver, each with its admin so the owner can re-delegate. No UPGRADE role: the registry is not upgradable.
 */
export const TEAM_OWNER_REGISTRY_ROLES = withAdmin(
  REGISTRY_ROLES.REGISTRAR | REGISTRY_ROLES.RENEW | REGISTRY_ROLES.UNREGISTER | REGISTRY_ROLES.SET_RESOLVER,
);

/** Agents get no roles on their own registry entry: they cannot transfer, renew, unregister or re-point the name. */
export const AGENT_TOKEN_ROLES = 0n;
