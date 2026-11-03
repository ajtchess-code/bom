// Novonode's Node hosting waits for /home/container/index.js by default.
// BOM-Bot's real startup orchestration lives in scripts/bootstrap.mjs.
import("./scripts/bootstrap.mjs").catch((error) => {
  console.error("[BOM-Bot] Fatal startup error:", error);
  process.exitCode = 1;
});
