// World ID OIDC discovery. Endpoints are NEVER hard-coded: they come from ${issuer}/.well-known/openid-configuration.
import { z } from "zod";

export const DEVICE_GRANT = "urn:ietf:params:oauth:grant-type:device_code";

const DiscoveryDoc = z.looseObject({
  issuer: z.string().url(),
  device_authorization_endpoint: z.string().url().optional(),
  token_endpoint: z.string().url(),
  jwks_uri: z.string().url(),
  grant_types_supported: z.array(z.string()).optional(),
  token_endpoint_auth_methods_supported: z.array(z.string()).optional(),
  id_token_signing_alg_values_supported: z.array(z.string()).optional(),
});

export interface Discovery {
  issuer: string;
  deviceAuthorizationEndpoint: string;
  tokenEndpoint: string;
  jwksUri: string;
  /** allowed id_token algorithms (never "none") */
  algorithms: string[];
}

export class DiscoveryError extends Error {}

export async function discover(issuer: string, fetchFn: typeof fetch = fetch): Promise<Discovery> {
  const base = issuer.replace(/\/+$/, "");
  const res = await fetchFn(`${base}/.well-known/openid-configuration`, { headers: { accept: "application/json" } });
  if (!res.ok) throw new DiscoveryError(`world discovery failed: HTTP ${res.status}`);
  const parsed = DiscoveryDoc.safeParse(await res.json());
  if (!parsed.success) throw new DiscoveryError(`world discovery: invalid document: ${z.prettifyError(parsed.error)}`);
  const d = parsed.data;

  if (d.issuer.replace(/\/+$/, "") !== base) {
    throw new DiscoveryError(`world discovery: issuer mismatch (configured ${base}, document says ${d.issuer})`);
  }
  if (!d.device_authorization_endpoint || !(d.grant_types_supported ?? []).includes(DEVICE_GRANT)) {
    throw new DiscoveryError("world discovery: device authorization grant is not advertised. STOP and ask the World booth.");
  }
  const methods = d.token_endpoint_auth_methods_supported ?? ["client_secret_basic"]; // RFC 8414 default
  if (!methods.includes("client_secret_basic")) {
    throw new DiscoveryError("world discovery: client_secret_basic is not supported by this issuer");
  }
  const algorithms = (d.id_token_signing_alg_values_supported ?? ["RS256"]).filter((a) => a.toLowerCase() !== "none");
  if (algorithms.length === 0) throw new DiscoveryError("world discovery: no usable id_token signing algorithm");

  return {
    issuer: d.issuer,
    deviceAuthorizationEndpoint: d.device_authorization_endpoint,
    tokenEndpoint: d.token_endpoint,
    jwksUri: d.jwks_uri,
    algorithms,
  };
}
