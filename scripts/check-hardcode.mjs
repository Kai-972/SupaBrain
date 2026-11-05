#!/usr/bin/env node
// Guard (CLAUDE.md §2.2 / §5.4): no addresses, hashes, URLs or chain IDs hard-coded in code.
// Values belong in config/*.json, config/deployments/*.json, live discovery, or env.
// Escape hatch for a deliberate literal: end the line with `// hardcode-ok: <reason>`.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const SCANNED_DIRS = ["apps/", "packages/", "contracts/src/", "scripts/"];
const CODE_EXT = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|sol)$/;
const IGNORED = [
  /(^|\/)node_modules\//,
  /(^|\/)\.next\//,
  /(^|\/)fixtures\//,
  /(^|\/)(test|tests|__tests__)\//,
  /\.(test|spec)\.[a-z]+$/,
  /\.t\.sol$/,
  /(^|\/)next-env\.d\.ts$/,
  /^config\//,
  /^docs\//,
  /\.md$/,
];

// Each rule: [name, regex]. The chain-ID rule is written so this file does not trip itself.
const RULES = [
  ["64-hex literal", /0x[0-9a-fA-F]{64}(?![0-9a-fA-F])/],
  ["address literal", /0x[0-9a-fA-F]{40}(?![0-9a-fA-F])/],
  ["URL literal", /\b(?:https?|wss?):\/\//],
  ["chain ID literal", new RegExp(`\\b(?:${["11155111", "7794095"].join("|")})\\b`)], // hardcode-ok: guard pattern
];

export function isScanned(path) {
  return SCANNED_DIRS.some((d) => path.startsWith(d)) && CODE_EXT.test(path) && !IGNORED.some((r) => r.test(path));
}

/** Returns [{ line, rule }] for one file's text. */
export function scanText(text) {
  const hits = [];
  text.split("\n").forEach((line, i) => {
    if (/hardcode-ok:\s*\S/.test(line)) return;
    for (const [rule, re] of RULES) {
      if (re.test(line)) {
        hits.push({ line: i + 1, rule });
        break;
      }
    }
  });
  return hits;
}

function listFiles() {
  // Tracked + untracked-but-not-ignored files.
  const out = execFileSync("git", ["ls-files", "-co", "--exclude-standard", "-z"], { encoding: "utf8" });
  return out.split("\0").filter(Boolean);
}

function main() {
  const files = listFiles().filter(isScanned);
  let count = 0;
  for (const f of files) {
    let text;
    try { text = readFileSync(f, "utf8"); } catch { continue; } // deleted in the working tree
    for (const h of scanText(text)) {
      console.error(`${f}:${h.line}  ${h.rule}`);
      count++;
    }
  }
  if (count) {
    console.error(`\nlint:hardcode: ${count} hard-coded value(s). Move them to config/ or env, or tag the line "// hardcode-ok: <reason>".`);
    process.exit(1);
  }
  console.log(`lint:hardcode: ok (${files.length} files scanned)`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
