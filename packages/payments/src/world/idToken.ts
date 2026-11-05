// Backend validation of the World ID id_token (never trust a client-side signal).
import { createHash } from "node:crypto";
import { jwtVerify, type JWTVerifyGetKey } from "jose";

export interface IdTokenClaims {
  iss: string;
  sub: string;
  aud: string | string[];
  exp: number;
  iat: number;
  auth_time: number;
  jti: string;
  acr?: string;
  amr?: string[];
}

export interface IdTokenValidatorOptions {
  issuer: string;
  clientId: string;
  jwks: JWTVerifyGetKey;
  algorithms: string[];
  authTimeSkewSec: number;
  /** stretch: only the enrolled owner may approve */
  requireEnrolledSub?: boolean;
  /** sha256(iss|sub) hex of the enrolled approver */
  approverSubHash?: string;
  now?: () => number;
}

export class IdTokenValidator {
  private readonly usedJti = new Map<string, number>(); // jti → exp (sec)

  constructor(private readonly o: IdTokenValidatorOptions) {
    if (o.requireEnrolledSub && !o.approverSubHash) {
      throw new Error("world: requireEnrolledSub is on but no approver sub hash is configured (WORLD_APPROVER_SUB_HASH)");
    }
    if (o.algorithms.some((a) => a.toLowerCase() === "none")) throw new Error("world: alg none is never allowed");
  }

  static subHash(iss: string, sub: string): string {
    return createHash("sha256").update(`${iss}|${sub}`).digest("hex");
  }

  /** @param ctx.startedAtSec when this approval request started; auth_time must not predate it */
  async validate(token: string, ctx: { startedAtSec: number }): Promise<IdTokenClaims> {
    const { payload } = await jwtVerify(token, this.o.jwks, {
      issuer: this.o.issuer,
      audience: this.o.clientId,
      algorithms: this.o.algorithms,
      requiredClaims: ["sub", "exp", "iat", "auth_time", "jti"],
      currentDate: this.o.now ? new Date(this.o.now()) : undefined,
    });
    const c = payload as unknown as IdTokenClaims;
    if (typeof c.auth_time !== "number" || c.auth_time < ctx.startedAtSec - this.o.authTimeSkewSec) {
      throw new Error("world: auth_time predates this approval request (stale authentication)");
    }
    if (typeof c.jti !== "string" || !c.jti) throw new Error("world: missing jti");

    this.prune();
    if (this.usedJti.has(c.jti)) throw new Error("world: jti already used (replay)");

    if (this.o.requireEnrolledSub && IdTokenValidator.subHash(c.iss, c.sub) !== this.o.approverSubHash) {
      throw new Error("world: approval came from a World ID that is not the enrolled approver");
    }
    this.usedJti.set(c.jti, c.exp);
    return c;
  }

  private prune() {
    const nowSec = Math.floor((this.o.now?.() ?? Date.now()) / 1000);
    for (const [j, exp] of this.usedJti) if (exp < nowSec - 60) this.usedJti.delete(j);
  }
}
