// Read / update config/deployments/ens.sepolia.json (committed: it is proof, and Lane B reads it).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { EnsDeploymentSchema, type AppConfig, type EnsDeployment } from "@supabrain/shared";
import { findRootDir } from "@supabrain/shared/config";

const file = () => join(findRootDir(), "config", "deployments", "ens.sepolia.json");

export function readEnsDeployment(config: AppConfig): EnsDeployment {
  if (existsSync(file())) return EnsDeploymentSchema.parse(JSON.parse(readFileSync(file(), "utf8")));
  return { network: "sepolia", chainId: config.networks.sepolia.chainId, agents: {}, vendors: {} };
}

/** Apply a change and write the file back, validating it. Only call after a successful broadcast. */
export function updateEnsDeployment(config: AppConfig, change: (d: EnsDeployment) => void): EnsDeployment {
  const d = readEnsDeployment(config);
  change(d);
  const valid = EnsDeploymentSchema.parse(d);
  writeFileSync(file(), JSON.stringify(valid, null, 2) + "\n");
  return valid;
}

export const nowIso = () => new Date().toISOString();
