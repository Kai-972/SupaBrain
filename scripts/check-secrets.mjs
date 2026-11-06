#!/usr/bin/env node
// Guard (CLAUDE.md §2.3 / §5.4): fail if a secret is about to be committed or shipped in the web bundle.
//   node scripts/check-secrets.mjs            scan tracked + untracked (not ignored) files
//   node scripts/check-secrets.mjs --staged   scan staged content only (pre-commit)
// Prints file:line and the rule name only. Never prints a value.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const MAX_BYTES = 5 * 1024 * 1024;

// Matches real assignments only: `KEY=value` (env / shell) or `"KEY": "value"` (JSON). Not TS keys or prose.
const assign = (key, value) => new RegExp(`(?:\\b[A-Z0-9_]*${key}\\s*=\\s*["']?|"[A-Z0-9_]*${key}"\\s*:\\s*")${value}`);
const val = (min) => `[^\\s"'#\`(),;]{${min},}`;
const RULES = [
  ["private key assignment", assign("PRIVATE_KEY", "0x[0-9a-fA-F]{64}")],
  ["Arkiv access key value", assign("ARKIV_ACCESS_KEY", val(16))],
  ["World client secret value", assign("WORLD_CLIENT_SECRET", val(8))],
  ["World signing key value", assign("WORLD_SIGNING_KEY", val(8))],
  ["Notion token value", assign("NOTION_TOKEN", `(?:secret_|ntn_)${val(8)}`)],
  ["signing secret value", assign("TOKEN_SIGNING_SECRET", val(8))],
  ["admin passphrase value", assign("DASHBOARD_ADMIN_PASSPHRASE", val(4))],
];
// Pattern rules skip test files (they hold deliberate fakes); real .env.local values are still checked everywhere.
const isTestFile = (path) => /\.(test|spec)\.[a-z]+$/.test(path) || /\.t\.sol$/.test(path);

export function isForbiddenPath(path) {
  return /(^|\/)\.env(\.[^/]+)?$/.test(path) && !path.endsWith(".env.example");
}

// Env values that are public by design (every client and doc shows them).
const PUBLIC_ENV = new Set(["PORT", "PUBLIC_BASE_URL", "SUPABRAIN_APP_NAMESPACE"]);

/** Secret values from .env.local (never NEXT_PUBLIC_* or PUBLIC_ENV), used to catch a pasted secret anywhere. */
export function secretValues(envText) {
  const vals = [];
  for (const raw of envText.split("\n")) {
    const m = raw.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    const [, name, rest] = m;
    const value = rest.replace(/\s+#.*$/, "").trim().replace(/^["']|["']$/g, "");
    if (name.startsWith("NEXT_PUBLIC_") || PUBLIC_ENV.has(name) || value.length < 12) continue;
    vals.push({ name, value });
  }
  return vals;
}

/** Returns [{ line, rule }] for one file's text. */
export function scanText(text, secrets = [], { patterns = true } = {}) {
  const hits = [];
  text.split("\n").forEach((line, i) => {
    if (patterns) {
      for (const [rule, re] of RULES) {
        if (re.test(line)) { hits.push({ line: i + 1, rule }); return; }
      }
    }
    for (const s of secrets) {
      if (line.includes(s.value)) { hits.push({ line: i + 1, rule: `value of ${s.name}` }); return; }
    }
  });
  return hits;
}

const git = (args) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

function* walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else yield p;
  }
}

function main() {
  const staged = process.argv.includes("--staged");
  const secrets = existsSync(".env.local") ? secretValues(readFileSync(".env.local", "utf8")) : [];
  const findings = [];

  const files = staged
    ? git(["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"]).split("\0").filter(Boolean)
    : git(["ls-files", "-co", "--exclude-standard", "-z"]).split("\0").filter(Boolean);

  for (const f of files) {
    if (isForbiddenPath(f)) { findings.push(`${f}  env file must never be committed`); continue; }
    let text;
    try {
      if (staged) text = git(["show", `:${f}`]);
      else {
        if (statSync(f).size > MAX_BYTES) continue;
        text = readFileSync(f, "utf8");
      }
    } catch { continue; }
    for (const h of scanText(text, secrets, { patterns: !isTestFile(f) })) findings.push(`${f}:${h.line}  ${h.rule}`);
  }

  // The browser bundle must never contain a server secret (NEXT_PUBLIC_* is public by design).
  const nextDir = join("apps", "web", ".next");
  if (secrets.length && existsSync(nextDir)) {
    for (const f of walk(nextDir)) {
      if (!/\.(js|html|json|txt|map)$/.test(f) || statSync(f).size > MAX_BYTES) continue;
      const text = readFileSync(f, "utf8");
      for (const s of secrets) if (text.includes(s.value)) findings.push(`${f}  value of ${s.name} in web build`);
    }
  }

  if (findings.length) {
    for (const x of findings) console.error(x);
    console.error(`\ncheck:secrets: ${findings.length} finding(s). Remove the secret; it belongs in .env.local or the host's secret store.`);
    process.exit(1);
  }
  console.log(`check:secrets: ok (${files.length} files${staged ? " staged" : ""}, ${secrets.length} local secret values checked)`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
