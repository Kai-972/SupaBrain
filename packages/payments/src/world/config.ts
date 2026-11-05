// Strict view of config/world.json (the shared loader accepts it loosely; Lane B owns the shape).
import { z } from "zod";

export const WorldConfigSchema = z.object({
  issuer: z.string().url(),
  scope: z.string().min(1),
  requireEnrolledSub: z.boolean(),
  approvalTtlSec: z.number().int().positive(),
  authTimeSkewSec: z.number().int().nonnegative(),
  pollMaxIntervalSec: z.number().int().positive(),
});
export type WorldConfig = z.infer<typeof WorldConfigSchema>;

export function parseWorldConfig(raw: unknown): WorldConfig {
  if (raw == null) throw new Error("config/world.json is missing");
  const r = WorldConfigSchema.safeParse(raw);
  if (!r.success) throw new Error(`config/world.json is invalid: ${z.prettifyError(r.error)}`);
  return r.data;
}
