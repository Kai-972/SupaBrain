// v2 brains on ENSv2 (docs/PLAN.md §3.3–3.4, Lane B). One brain = one project = its own UserRegistry under the team
// name; inside it one AI name per family (claude / gemini / openai), each with its own PermissionedResolver whose
// text records are the rules. AI wallets are derived from one server secret, so nothing is stored per wallet.
// Pure helpers + schemas here; scripts/ens/provision-brains.ts sends the transactions, Lane A's server reads the
// generated config/deployments/brains.sepolia.json through readBrainsDeployment().
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { namehash, type Hex } from "viem";
import { mnemonicToAccount, type HDAccount } from "viem/accounts";
import { z } from "zod";
import { REGISTRY_ROLES, RESOLVER_ROLES, TEAM_OWNER_REGISTRY_ROLES } from "./roles";

/** Derivation order is part of the contract with Lane A: address index = position here. */
export const BRAIN_FAMILIES = ["claude", "gemini", "openai"] as const;
export type BrainFamily = (typeof BRAIN_FAMILIES)[number];

const Label = z.string().regex(/^[a-z][a-z0-9-]{1,30}$/, "lowercase letters, digits and dashes, starting with a letter");
const Count = z.string().regex(/^\d{1,9}$/, "a whole number as a string");
const Addr = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const Hash = z.string().regex(/^0x[0-9a-fA-F]{64}$/);

export const BrainsConfigSchema = z
  .object({
    source: z.string().min(1),
    verifiedAt: z.string().min(1),
    families: z.tuple([z.literal("claude"), z.literal("gemini"), z.literal("openai")]),
    leaseDays: z.number().int().min(1).max(365),
    writeDailyKey: z.string().min(1),
    records: z.object({
      role: z.object({ claude: z.string().min(1), gemini: z.string().min(1), openai: z.string().min(1) }),
      scope: z.string().min(1),
      writeDaily: Count,
      status: z.enum(["active", "paused"]),
      payCap: z.string().regex(/^\d+(\.\d+)?$/),
      payDaily: z.string().regex(/^\d+(\.\d+)?$/),
      agentContext: z.string().min(1),
    }),
    brains: z.array(z.object({ label: Label, index: z.number().int().min(1).max(2 ** 31 - 1) })).min(1),
    /** B2: tGLM per AI wallet on Arkiv Rabdi, sized from measured write costs. */
    funding: z
      .object({
        perWalletGlm: z.string().regex(/^\d+(\.\d+)?$/),
        writesPerWallet: z.number().int().positive(),
        bytesPerWrite: z.number().int().positive(),
        topUpBelowFraction: z.number().min(0).max(1),
        sizing: z.string().min(1),
      })
      .optional(),
  })
  .superRefine((c, ctx) => {
    const labels = new Set<string>();
    const indexes = new Set<number>();
    for (const b of c.brains) {
      if (labels.has(b.label)) ctx.addIssue({ code: "custom", message: `duplicate brain label "${b.label}"` });
      if (indexes.has(b.index)) ctx.addIssue({ code: "custom", message: `duplicate brain index ${b.index}` });
      labels.add(b.label);
      indexes.add(b.index);
    }
  });
export type BrainsConfig = z.infer<typeof BrainsConfigSchema>;

const Tx = z.object({ id: z.string(), hash: Hash, url: z.string(), at: z.string() });
export type BrainTx = z.infer<typeof Tx>;

const AgentDeployment = z.object({
  ens: z.string(),
  labelhash: Hash,
  wallet: Addr,
  resolver: Addr,
  resolverSalt: z.string(),
  accountIndex: z.number().int(),
  addressIndex: z.number().int(),
  expiry: z.number().int(),
  records: z.record(z.string(), z.string()),
  txs: z.array(Tx),
  /** B2: tGLM sent on Arkiv Rabdi so this wallet can sign its own writes. */
  funding: z.object({ amountGlm: z.string(), txHash: Hash, url: z.string(), at: z.string() }).optional(),
});
export type BrainAgentDeployment = z.infer<typeof AgentDeployment>;

const BrainDeployment = z.object({
  label: z.string(),
  ens: z.string(),
  index: z.number().int(),
  registry: Addr,
  registrySalt: z.string(),
  tokenOwner: Addr, // who holds <brain>.<team>.eth in the team registry (the server's team wallet, renew-only)
  expiry: z.number().int(),
  txs: z.array(Tx),
  agents: z.object({ claude: AgentDeployment, gemini: AgentDeployment, openai: AgentDeployment }),
});
export type BrainDeployment = z.infer<typeof BrainDeployment>;

export const BrainsDeploymentSchema = z.object({
  network: z.string(),
  chainId: z.number().int(),
  teamRegistry: Addr,
  factory: Addr,
  updatedAt: z.string(),
  brains: z.record(z.string(), BrainDeployment),
  /** B2: how the per-wallet tGLM amount was sized (measured write cost × planned writes). */
  fundingPlan: z
    .object({ network: z.string(), funder: Addr, perWalletGlm: z.string(), writesPerWallet: z.number(), costPerWriteGlm: z.string(), measuredFrom: z.array(z.string()), at: z.string() })
    .optional(),
});
export type BrainsDeployment = z.infer<typeof BrainsDeploymentSchema>;

// --- authority: what each party holds (pinned by brains.test.ts) ---

/** Team wallet (server) and owner on every brain registry root: register, renew, unregister, set resolver + admins. */
export const BRAIN_REGISTRY_ROLES = TEAM_OWNER_REGISTRY_ROLES;
/** Team wallet on the brain's own name in the team registry: renew only, so the server can extend a brain. */
export const BRAIN_TOKEN_ROLES = REGISTRY_ROLES.RENEW;
/** Team wallet on each AI resolver (root resource of a one-name resolver): set text records, i.e. the rules. */
export const TEAM_RESOLVER_ROLES = RESOLVER_ROLES.SET_TEXT;

// --- names and derivation ---

export const brainName = (brain: string, teamLabel: string): string => `${brain}.${teamLabel}.eth`;
export const brainAgentName = (family: BrainFamily, brain: string, teamLabel: string): string => `${family}.${brain}.${teamLabel}.eth`;

/** Resolver salt version for an AI: namehash of its full name (unique per brain and family; clear of version 0). */
export const brainResolverVersion = (fullName: string): bigint => BigInt(namehash(fullName));

export function familyIndex(family: BrainFamily): number {
  const i = BRAIN_FAMILIES.indexOf(family);
  if (i < 0) throw new Error(`unknown AI family "${family}" (expected ${BRAIN_FAMILIES.join(", ")})`);
  return i;
}

/** The AI wallet of `family` in brain `brainIndex`: m/44'/60'/<brainIndex>'/0/<familyIndex>. Never log the mnemonic. */
export function brainAgentAccount(mnemonic: string, brainIndex: number, family: BrainFamily): HDAccount {
  const addressIndex = familyIndex(family);
  if (!Number.isInteger(brainIndex) || brainIndex < 0 || brainIndex >= 2 ** 31) throw new Error(`bad brain index ${brainIndex}`);
  return mnemonicToAccount(mnemonic, { accountIndex: brainIndex, addressIndex });
}

// --- records ---

export interface AppTextKeys {
  role: string;
  scope: string;
  payCap: string;
  payDaily: string;
  status: string;
  vendor: string;
  agentContext: string;
  memoryHead: string;
}
export interface RuleKeys {
  status: string;
  scope: string;
  writeDaily: string;
  role: string;
}

/** The four rule keys the website can change, from config (app.json textKeys + brains.json writeDailyKey). */
export function ruleKeys(app: Pick<AppTextKeys, "status" | "scope" | "role">, brains: Pick<BrainsConfig, "writeDailyKey">): RuleKeys {
  return { status: app.status, scope: app.scope, writeDaily: brains.writeDailyKey, role: app.role };
}

/** The records a fresh AI name starts with. `vendor` is the family. */
export function brainAgentRecords(cfg: BrainsConfig, keys: AppTextKeys, brain: string, family: BrainFamily, ens: string): Record<string, string> {
  const r = cfg.records;
  const role = r.role[family];
  const context = r.agentContext.replaceAll("{ens}", ens).replaceAll("{family}", family).replaceAll("{brain}", brain).replaceAll("{role}", role);
  return {
    [keys.role]: role,
    [keys.scope]: r.scope,
    [cfg.writeDailyKey]: r.writeDaily,
    [keys.status]: r.status,
    [keys.vendor]: family,
    [keys.payCap]: r.payCap,
    [keys.payDaily]: r.payDaily,
    [keys.agentContext]: context,
  };
}

// --- files ---

export const brainsConfigFile = (root: string) => join(root, "config", "brains.json");
export const brainsDeploymentFile = (root: string) => join(root, "config", "deployments", "brains.sepolia.json");

export function readBrainsConfig(root: string): BrainsConfig {
  return BrainsConfigSchema.parse(JSON.parse(readFileSync(brainsConfigFile(root), "utf8")));
}

/** The provisioned brains, or undefined before the first `pnpm ens:provision-brains --yes`. */
export function readBrainsDeployment(root: string): BrainsDeployment | undefined {
  const f = brainsDeploymentFile(root);
  return existsSync(f) ? BrainsDeploymentSchema.parse(JSON.parse(readFileSync(f, "utf8"))) : undefined;
}

export function writeBrainsDeployment(root: string, d: BrainsDeployment): void {
  writeFileSync(brainsDeploymentFile(root), JSON.stringify(BrainsDeploymentSchema.parse(d), null, 2) + "\n");
}

