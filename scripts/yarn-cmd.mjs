// Resolves a working Yarn 1 command. Hosts such as Novonode may ship pnpm/npm
// but no global yarn, so fall back to Corepack, then npx.
import { spawnSync } from "node:child_process";

const win = process.platform === "win32";
const candidates = [
  { command: win ? "yarn.cmd" : "yarn", prefixArgs: [] },
  { command: win ? "corepack.cmd" : "corepack", prefixArgs: ["yarn"] },
  { command: win ? "npx.cmd" : "npx", prefixArgs: ["--yes", "yarn@1.22.22"] },
];

let cached;
export function resolveYarn() {
  if (cached) return cached;
  for (const c of candidates) {
    const r = spawnSync(c.command, [...c.prefixArgs, "--version"], {
      stdio: "pipe", encoding: "utf8", shell: win, env: { ...process.env, COREPACK_ENABLE_DOWNLOAD_PROMPT: "0" },
    });
    if (r.status === 0) {
      cached = c;
      console.log(`[startup] using yarn via: ${[c.command, ...c.prefixArgs].join(" ")} (v${String(r.stdout).trim()})`);
      return c;
    }
  }
  throw new Error("No Yarn available (tried yarn, corepack yarn, npx yarn@1.22.22). Install Node.js with npm.");
}

export function yarnArgs(args) {
  const y = resolveYarn();
  return { command: y.command, args: [...y.prefixArgs, ...args] };
}
