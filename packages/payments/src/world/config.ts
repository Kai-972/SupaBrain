// Strict view of config/world.json (the shared loader accepts it loosely; Lane B owns the shape).
import { z } from "zod";

export const IDKIT_ENVIRONMENTS = ["production", "staging", "sandbox"] as const;
export const IDKIT_CREDENTIALS = ["proof_of_human", "selfie", "passport", "mnc"] as const;

/** World ID 4 / IDKit human approval (Human-in-the-loop pattern). Primary mode. */
export const IdkitConfigSchema = z.object({
  environment: z.enum(IDKIT_ENVIRONMENTS), // pinned: staging/sandbox accept test proofs
  verifyBaseUrl: z.url(), // POST {verifyBaseUrl}/api/v4/verify/{rp_id}
  rpSignatureTtlSec: z.number().int().positive().max(3600), // also the human's window to answer
  allowLegacyProofs: z.boolean(),
  credentials: z.array(z.enum(IDKIT_CREDENTIALS)).min(1),
  actionPrefix: z.string().regex(/^[a-z0-9-]+$/), // action = `${prefix}:${intentHash}`
  pollIntervalMs: z.number().int().positive(),
});
export type IdkitConfig = z.infer<typeof IdkitConfigSchema>;

/** OIDC device flow (auth.world.org). Fallback: its portal needs an enterprise Google Workspace account. */
export const OidcConfigSchema = z.object({
  issuer: z.url(),
  scope: z.string().min(1),
  requireEnrolledSub: z.boolean(),
  authTimeSkewSec: z.number().int().nonnegative(),
  pollMaxIntervalSec: z.number().int().positive(),
});
export type OidcConfig = z.infer<typeof OidcConfigSchema>;

export const WorldConfigSchema = z.object({
  mode: z.enum(["idkit", "oidc"]),
  approvalTtlSec: z.number().int().positive(),
  idkit: IdkitConfigSchema,
  oidc: OidcConfigSchema,
});
export type WorldConfig = z.infer<typeof WorldConfigSchema>;

export function parseWorldConfig(raw: unknown): WorldConfig {
  if (raw == null) throw new Error("config/world.json is missing");
  const r = WorldConfigSchema.safeParse(raw);
  if (!r.success) throw new Error(`config/world.json is invalid: ${z.prettifyError(r.error)}`);
  return r.data;
}
