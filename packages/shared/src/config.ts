// Node-only config loader: config/*.json validated with zod, plus env (secrets only).
// Throws on missing or invalid values. Import from "@supabrain/shared/config".
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { z } from "zod";
import {
  AppFileSchema, DemoScenarioFileSchema, DeploymentFileSchema, EnsFileSchema, EnvSchema,
  NetworksFileSchema, TokensFileSchema, WorldFileSchema,
  type AppConfig, type Env,
} from "./config-schema";

export * from "./config-schema";

/** Repo root: SUPABRAIN_ROOT, else the nearest ancestor of cwd that has config/app.json. */
export function findRootDir(start = process.cwd()): string {
  if (process.env.SUPABRAIN_ROOT) return resolve(process.env.SUPABRAIN_ROOT);
  let dir = resolve(start);
  for (;;) {
    if (existsSync(join(dir, "config", "app.json"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) throw new Error(`config/app.json not found above ${start}; set SUPABRAIN_ROOT`);
    dir = parent;
  }
}

function readJson<T extends z.ZodType>(file: string, schema: T): z.infer<T>;
function readJson<T extends z.ZodType>(file: string, schema: T, optional: true): z.infer<T> | null;
function readJson<T extends z.ZodType>(file: string, schema: T, optional = false): z.infer<T> | null {
  if (!existsSync(file)) {
    if (optional) return null;
    throw new Error(`config: missing ${file}`);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    throw new Error(`config: ${file} is not valid JSON (${(e as Error).message})`);
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`).join("\n");
    throw new Error(`config: ${file} is invalid\n${issues}`);
  }
  return parsed.data;
}

export function loadConfigFrom(rootDir: string): AppConfig {
  const c = (f: string) => join(rootDir, "config", f);
  return {
    app: readJson(c("app.json"), AppFileSchema),
    networks: readJson(c("networks.json"), NetworksFileSchema),
    tokens: readJson(c("tokens.sepolia.json"), TokensFileSchema),
    ens: readJson(c("ens.sepolia.json"), EnsFileSchema),
    world: readJson(c("world.json"), WorldFileSchema, true),
    demo: readJson(c("demo-scenario.json"), DemoScenarioFileSchema),
    deployments: {
      ens: readJson(c("deployments/ens.sepolia.json"), DeploymentFileSchema, true),
      vault: readJson(c("deployments/vault.sepolia.json"), DeploymentFileSchema, true),
    },
  };
}

let cached: AppConfig | undefined;
/** Load (and cache) config from the repo root, after loading .env.local into process.env. */
export function loadConfig(): AppConfig {
  if (!cached) {
    const root = findRootDir();
    loadEnvLocal(root);
    cached = loadConfigFrom(root);
  }
  return cached;
}

/** Loads <root>/.env.local if present. Existing process env wins (hosts set secrets directly). */
export function loadEnvLocal(rootDir = findRootDir()): void {
  const file = join(rootDir, ".env.local");
  if (existsSync(file)) process.loadEnvFile(file);
}

/** Validate env formats. Never log the result: it contains secrets. */
export function readEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    // Name the variable and the rule, never the value.
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`env is invalid\n${issues}`);
  }
  return parsed.data;
}

/** Get one env value or throw with its name (never its value). */
export function requireEnv(name: string, source: NodeJS.ProcessEnv = process.env): string {
  const v = source[name];
  if (v === undefined || v.trim() === "") throw new Error(`missing env ${name} (see .env.example; put it in .env.local)`);
  return v.trim();
}
