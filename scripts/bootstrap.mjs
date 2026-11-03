import { loadRootEnv } from "./load-env.mjs";
import { spawn } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import process from "node:process";

loadRootEnv();

const yarn = process.platform === "win32" ? "yarn.cmd" : "yarn";


const retiredWaveformPaths = [
  "apps/controller/src/waveform.ts",
  "apps/controller/dist/waveform.js",
  "apps/controller/dist/waveform.js.map",
  "apps/api/src/waveform.ts",
  "apps/api/dist/waveform.js",
  "apps/api/dist/waveform.js.map",
  "apps/dashboard/app/api/public/waveform",
];
for (const path of retiredWaveformPaths) {
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

if (!existsSync("node_modules") || missingModules.length || wrongZodVersion) {
  console.log(
    `[bootstrap] Installing workspace dependencies${
      missingModules.length ? `; missing: ${missingModules.join(", ")}` : ""
    }${wrongZodVersion ? `; zod=${zodVersion ?? "missing"}, need 3.25.76` : ""}...`,
  );
  await run(yarn, ["install", "--force"]);
}

// Build exactly once per start. Uploads overlay old dist/.next output, so the
// compiled code is always rebuilt from the current source unless the host opts out.
const skipStartupBuild = /^(1|true|yes|on)$/i.test(process.env.SKIP_STARTUP_BUILD ?? "");
if (!skipStartupBuild) {
  console.log("[bootstrap] Building BOM-Bot from current source...");
  await run(yarn, ["build"]);
} else {
  console.warn("[bootstrap] SKIP_STARTUP_BUILD enabled; existing dist/.next artifacts will be used.");
}
process.env.BOM_STARTUP_BUILT = "1";

await import("./novonode.mjs");
