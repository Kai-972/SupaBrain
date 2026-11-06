// EnsAuthority (CLAUDE.md §6.2): who an agent is and what it may do, read LIVE from ENSv2.
// Fails closed: if any ENS read fails the call throws EnsUnavailableError, so writes and payments pause and the UI
// says "authority unknown". A cached answer is reused only within a short TTL and never after a failed refresh.
import { zeroAddress } from "viem";
import { GUARD_CHECKS, type AgentView, type AppConfig, type EnsAuthority, type EnsDeployment, type Role, type Vendor } from "@supabrain/shared";
import { agentName, labelhashId } from "./names";

type Hex = `0x${string}`;
const ZERO = zeroAddress;

/** The ENS reads the authority needs. The viem implementation is in ./viem-chain; tests use a fake. */
export interface EnsChain {
  /** registry.getOwner(anyId): the wallet that owns the name right now, 0x0 when unregistered or expired. */
  getOwner(registry: Hex, labelhash: bigint): Promise<Hex>;
  /** registry.getExpiry(anyId) in unix seconds (0 if the label never existed). */
  getExpiry(registry: Hex, labelhash: bigint): Promise<number>;
  /** Forward resolution through the Universal Resolver; null when the name has no address. */
  getEnsAddress(name: string): Promise<Hex | null>;
  getEnsText(name: string, key: string): Promise<string | null>;
}

export class EnsUnavailableError extends Error {
  constructor(what: string, cause: unknown) {
    super(`ENS unavailable (${what}): ${cause instanceof Error ? cause.message.split("\n")[0] : String(cause)}`);
    this.name = "EnsUnavailableError";
  }
}

export interface EnsAuthorityDeps {
  app: AppConfig["app"];
  deployments: EnsDeployment;
  chain: EnsChain;
  /** Clock in ms; injectable for tests. */
  now?: () => number;
}

const ROLES: readonly Role[] = ["owner", "lead", "worker", "observer"];
const VENDORS: readonly Vendor[] = ["claude", "gemini", "openai", "human"];
const USDC = /^\d+(\.\d{1,6})?$/;
const ALL_CHECKS = [...GUARD_CHECKS] as string[];
function parseList(raw: string | null | undefined): string[] {
  if (!raw || raw.trim() === "none") return [];
  return [...new Set(raw.split(",").map((x) => x.trim()).filter(Boolean))];
}
function parseGuard(raw: string | null | undefined): string[] {
  if (!raw || raw.trim() === "*") return ALL_CHECKS;
  const list = parseList(raw);
  return list.every((x) => ALL_CHECKS.includes(x)) ? list : ALL_CHECKS;
}
/** sb.status values a valid record may hold ("paused" is the website's Pause, v2). */
const STATUSES: readonly string[] = ["active", "paused", "quarantined"];

export function createEnsAuthority(deps: EnsAuthorityDeps): EnsAuthority {
  const { app, deployments, chain } = deps;
  const now = deps.now ?? Date.now;
  const ttl = app.ens.cacheTtlSec * 1000;
  const team = app.ens.teamLabel;
  if (!team) throw new Error("ens.teamLabel is not set");
  const keys = app.ens.textKeys;

  const cache = new Map<string, { at: number; value: unknown }>();
  async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
    const hit = cache.get(key);
    if (hit && now() - hit.at < ttl) return hit.value as T;
    cache.delete(key); // never serve past the TTL, even if the refresh below fails
    try {
      const value = await load();
      cache.set(key, { at: now(), value });
      return value;
    } catch (e) {
      throw e instanceof EnsUnavailableError ? e : new EnsUnavailableError(key, e);
    }
  }

  function agentRef(label: string) {
    const known = app.agents.some((a) => a.label === label);
    const dep = deployments.agents[label];
    if (!known || !dep) throw new Error(`unknown agent "${label}"`);
    if (!deployments.teamRegistry) throw new Error("team registry not deployed");
    return { dep, registry: deployments.teamRegistry.address as Hex };
  }

  return {
    async getAgentAuthority(label) {
      const { dep, registry } = agentRef(label);
      return cached(`agent:${label}`, async () => {
        const id = labelhashId(label);
        const name = agentName(label, team);
        const [owner, expiry] = await Promise.all([chain.getOwner(registry, id), chain.getExpiry(registry, id)]);
        const wallet = dep.wallet as Hex;
        const registered = owner !== ZERO && owner.toLowerCase() === wallet.toLowerCase();
        const optional = [keys.writeDaily, keys.guard, keys.deny];
        const [role, scope, payCap, payDaily, status, vendor, writeDaily, guardRaw, denyRaw] = await Promise.all(
          [keys.role, keys.scope, keys.payCap, keys.payDaily, keys.status, keys.vendor, ...optional].map((k) => (k ? chain.getEnsText(name, k) : Promise.resolve(null))),
        );
        const recordsOk =
          registered && ROLES.includes(role as Role) && !!scope && USDC.test(payCap ?? "") && USDC.test(payDaily ?? "") &&
          STATUSES.includes(status ?? "") && VENDORS.includes(vendor as Vendor);
        const lease = expiry * 1000;
        let view: AgentView["status"];
        if (!registered) view = owner === ZERO && expiry > 0 && lease <= now() ? "expired" : "unregistered";
        else view = status === "quarantined" ? "quarantined" : status === "paused" ? "paused" : "active";
        // Restrictive defaults when records are unusable: an agent with unreadable rules gets no rights.
        return {
          label, ens: name, wallet, registered, leaseExpiresAt: lease, status: view, recordsOk,
          vendor: (VENDORS.includes(vendor as Vendor) ? vendor : "human") as Vendor,
          role: (ROLES.includes(role as Role) ? role : "observer") as Role,
          scope: scope ?? "", payCap: USDC.test(payCap ?? "") ? payCap! : "0", payDaily: USDC.test(payDaily ?? "") ? payDaily! : "0",
          // v2 writes per day: unset → no limit; unreadable or malformed → 0 (fail closed)
          ...(writeDaily === undefined || writeDaily === null ? {} : { writeDaily: /^\d{1,9}$/.test(writeDaily) ? String(Number(writeDaily)) : "0" }),
          // v2 rulebook: sb.guard (absent / * / unknown names → every check: fail closed; none → no checks), sb.deny
          ...(keys.guard ? { guard: parseGuard(guardRaw) } : {}),
          ...(keys.deny ? { deny: parseList(denyRaw) } : {}),
        };
      });
    },

    invalidate(label) {
      cache.delete(`agent:${label}`);
    },

    async resolveEns(name) {
      return cached(`addr:${name}`, () => chain.getEnsAddress(name));
    },

    async findVendorEns(address) {
      for (const v of this.teamVendors()) {
        const resolved = await this.resolveEns(v);
        if (resolved && resolved.toLowerCase() === address.toLowerCase()) return v;
      }
      return null;
    },

    teamVendors() {
      return app.vendors.map((v) => `${v.label}.${team}.eth`);
    },

    agentRegistryRef(label) {
      const { dep, registry } = agentRef(label);
      return { registry, labelhash: dep.labelhash as Hex };
    },
  };
}
