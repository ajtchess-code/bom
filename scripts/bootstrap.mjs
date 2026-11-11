import { loadRootEnv } from "./load-env.mjs";
import { spawn } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import process from "node:process";

loadRootEnv();
// /tmp may be a 100 MB tmpfs even when the server disk has ample free space.
const buildTmp = process.env.BOM_BUILD_TMP_DIR || `${process.cwd()}/build-tmp`;
// Start each boot with an empty temp folder so leftovers from interrupted builds
// can't pile up and fill the disk (nothing is running yet at this point).
// Only ever clear a folder named build-tmp, never a shared temp directory.
if (/(^|[\\/])build-tmp[\\/]?$/.test(buildTmp)) { try { rmSync(buildTmp, { recursive: true, force: true }); } catch {} }
mkdirSync(buildTmp, { recursive: true });
process.env.TMPDIR = buildTmp;
process.env.TMP = buildTmp;
process.env.TEMP = buildTmp;

import { yarnArgs } from "./yarn-cmd.mjs";
const runYarn = (args) => { const y = yarnArgs(args); return run(y.command, y.args); };


const retiredWaveformPaths = [
  "apps/controller/src/waveform.ts",
  "apps/controller/dist/waveform.js",
  "apps/controller/dist/waveform.js.map",
  "apps/api/src/waveform.ts",
  "apps/api/dist/waveform.js",
  "apps/api/dist/waveform.js.map",
  "apps/dashboard/app/api/public/waveform",
];
// Removed features. Zip deploys add/overwrite files but never delete them, and a
// leftover source file importing removed code would break the build.
const retiredFeaturePaths = [
  "apps/dashboard/components/BattleCoordination.tsx",
  "apps/api/src/permissionPresets.ts", "apps/api/dist/permissionPresets.js",
  "apps/controller/src/channelAccessLayout.ts", "apps/controller/dist/channelAccessLayout.js",
  "apps/dashboard/app/dashboard/admin/permission-presets", "apps/dashboard/components/PermissionPresetsDashboard.tsx",
  "apps/dashboard/components/RecruitmentDashboard.tsx", "scripts/tests/permission-presets-437.test.mjs", "scripts/tests/wiki-builder-redesign.test.mjs",
  // Minecraft and Clash of Clans game hubs
  "apps/api/src/clashTools.ts", "apps/api/src/gameHubCore.ts", "apps/api/src/gameHubs.ts",
  "apps/api/dist/clashTools.js", "apps/api/dist/gameHubCore.js", "apps/api/dist/gameHubs.js",
  "apps/controller/src/clashToolReminders.ts", "apps/controller/src/gameHubNotifications.ts",
  "apps/controller/dist/clashToolReminders.js", "apps/controller/dist/gameHubNotifications.js",
  "apps/dashboard/app/api/games", "apps/dashboard/app/api/minecraft-map",
  "apps/dashboard/app/dashboard/clash", "apps/dashboard/app/dashboard/minecraft",
  "apps/dashboard/components/game-hubs",
  "packages/shared/src/clashToolkit.ts", "packages/shared/dist/clashToolkit.js", "packages/shared/dist/clashToolkit.d.ts", "packages/shared/dist/clashToolkit.js.map",
  "scripts/tests/clash-toolkit.test.mjs", "scripts/tests/game-hub-browser.mjs", "scripts/tests/game-hubs-lifecycle.test.mjs",
];
// Next.js build cache: safe to delete (the next build just takes a little
// longer) and often the largest folder on a small panel disk.
retiredFeaturePaths.push("apps/dashboard/.next/cache");
for (const path of [...retiredWaveformPaths, ...retiredFeaturePaths]) {
  try { rmSync(path, { recursive: true, force: true }); } catch {}
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", env: process.env });
    child.once("error", reject);
    child.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`${command} ${args.join(" ")} failed (${code})`)),
    );
  });
}

const requiredModules = [
  "zod",
  "pg",
  "ioredis",
  "discord.js",
  "shoukaku",
  "fastify",
  "jose",
  "next",
  "react",
  "react-dom",
];

const missingModules = requiredModules.filter(
  (name) => !existsSync(`node_modules/${name}/package.json`),
);

let zodVersion = null;
try {
  zodVersion = JSON.parse(readFileSync("node_modules/zod/package.json", "utf8")).version;
} catch {}
const wrongZodVersion = zodVersion !== "3.25.76";

// A completed install writes this stamp. If the host's own installer or a full
// disk left node_modules half-written, the stamp is missing and we reinstall.
const manifestFiles = ["package.json", ...["apps", "packages"].flatMap((dir) => {
  try { return readdirSync(dir).map((name) => `${dir}/${name}/package.json`).filter((f) => existsSync(f)); } catch { return []; }
})];
const manifestHash = createHash("sha256").update(manifestFiles.map((f) => f + "\n" + readFileSync(f, "utf8")).join("\n")).digest("hex");
const stampPath = "node_modules/.bom-install-stamp";
let stampOk = false;
try { stampOk = readFileSync(stampPath, "utf8").trim() === manifestHash; } catch {}
const missingBins = ["tsc", "next"].filter((bin) => !existsSync(`node_modules/.bin/${bin}`));
if (!stampOk) missingModules.push("(no completed-install stamp)");
missingModules.push(...missingBins.map((bin) => `.bin/${bin}`));

if (!existsSync("node_modules") || missingModules.length || wrongZodVersion) {
  console.log(
    `[bootstrap] Installing workspace dependencies${
      missingModules.length ? `; missing: ${missingModules.join(", ")}` : ""
    }${wrongZodVersion ? `; zod=${zodVersion ?? "missing"}, need 3.25.76` : ""}...`,
  );
  await runYarn(["install", "--force", "--production=false"]);
  // The download cache lives inside the server's disk quota and duplicates
  // node_modules; drop it so small hosts don't run out of space.
  writeFileSync(stampPath, manifestHash + "\n");
  await runYarn(["cache", "clean"]).catch((err) => console.warn(`[bootstrap] yarn cache clean skipped: ${err.message}`));
}

// Build exactly once per start. Uploads overlay old dist/.next output, so the
// compiled code is always rebuilt from the current source unless the host opts out.
const skipStartupBuild = /^(1|true|yes|on)$/i.test(process.env.SKIP_STARTUP_BUILD ?? "");
if (!skipStartupBuild) {
  console.log("[bootstrap] Building BOM-Bot from current source...");
  await runYarn(["build"]);
} else {
  console.warn("[bootstrap] SKIP_STARTUP_BUILD enabled; existing dist/.next artifacts will be used.");
}
process.env.BOM_STARTUP_BUILT = "1";

await import("./novonode.mjs");
