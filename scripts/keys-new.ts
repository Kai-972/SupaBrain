// pnpm keys:new — generate missing testnet keys into .env.local (gitignored, mode 600).
//   pnpm keys:new                          owner, team, agents, vendors, TOKEN_SIGNING_SECRET
//   pnpm keys:new --set NAME=VALUE ...     also write non-key env values (e.g. SEPOLIA_RPC_URL)
//   pnpm keys:new --with-b                 also POLICY_SIGNER / GUARDIAN keys (Lane B normally runs this)
// Never overwrites a value that is already set. Prints names and PUBLIC addresses only.
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { agentKeyEnvName, vendorKeyEnvName } from "@supabrain/shared";
import { findRootDir, loadConfig } from "@supabrain/shared/config";

const args = process.argv.slice(2);
const sets = args.flatMap((a, i) => (args[i - 1] === "--set" ? [a] : []));
const withB = args.includes("--with-b");

const config = loadConfig();
const file = join(findRootDir(), ".env.local");
let text = existsSync(file) ? readFileSync(file, "utf8") : "";

function currentValue(name: string): string | undefined {
  const m = text.match(new RegExp(`^${name}=(.*)$`, "m"));
  const v = m?.[1]?.replace(/\s+#.*$/, "").trim();
  return v ? v : undefined;
}
function write(name: string, value: string) {
  const line = `${name}=${value}`;
  const re = new RegExp(`^${name}=.*$`, "m");
  text = re.test(text) ? text.replace(re, line) : `${text}${text && !text.endsWith("\n") ? "\n" : ""}${line}\n`;
}

const keyNames = [
  { role: "owner", env: "OWNER_PRIVATE_KEY" },
  { role: "team", env: "TEAM_PRIVATE_KEY" },
  ...config.app.agents.map((a) => ({ role: `agent ${a.label}`, env: agentKeyEnvName(a.label) })),
  ...config.app.vendors.map((v) => ({ role: `vendor ${v.label}`, env: vendorKeyEnvName(v.label) })),
  ...(withB ? [{ role: "policy signer", env: "POLICY_SIGNER_PRIVATE_KEY" }, { role: "guardian", env: "GUARDIAN_PRIVATE_KEY" }] : []),
];

console.log("keys:new");
for (const k of keyNames) {
  let pk = currentValue(k.env);
  const fresh = !pk;
  if (!pk) { pk = generatePrivateKey(); write(k.env, pk); }
  console.log(`  ${fresh ? "generated" : "kept     "} ${k.role.padEnd(22)} ${privateKeyToAccount(pk as `0x${string}`).address}  (${k.env})`);
}
if (!currentValue("TOKEN_SIGNING_SECRET")) {
  write("TOKEN_SIGNING_SECRET", randomBytes(32).toString("hex"));
  console.log("  generated TOKEN_SIGNING_SECRET");
}
for (const kv of sets) {
  const i = kv.indexOf("=");
  if (i < 1) { console.error(`  bad --set argument (expected NAME=VALUE)`); process.exit(1); }
  const name = kv.slice(0, i);
  if (currentValue(name)) { console.log(`  kept      ${name} (already set; edit .env.local to change)`); continue; }
  write(name, kv.slice(i + 1));
  console.log(`  set       ${name}`);
}

writeFileSync(file, text, { mode: 0o600 });
chmodSync(file, 0o600);
console.log(`\nwrote ${file} (mode 600, gitignored). Fund the addresses above, then run: pnpm run doctor`);
