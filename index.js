// Novonode's Node hosting waits for /home/container/index.js by default.
// 1. scripts/repo-sync.mjs pulls the newest BOM-Bot source from GitHub (BOM_REPO_SYNC=off to disable).
// 2. scripts/bootstrap.mjs installs dependencies, builds (rolling back a pull that fails to build) and starts everything.
(async () => {
  let repoSync = null;
  try {
    const { loadRootEnv } = await import("./scripts/load-env.mjs");
    loadRootEnv();
    repoSync = await import("./scripts/repo-sync.mjs");
    await repoSync.syncFromRepo();
  } catch (error) {
    console.error("[repo-sync] skipped:", error?.message ?? error);
  }
  try {
    await import("./scripts/bootstrap.mjs");
  } catch (error) {
    if (repoSync?.rollbackSync?.()) {
      console.error("[BOM-Bot] Newly pulled bootstrap failed; rolled back to previous version and retrying:", error?.message ?? error);
      await import(`./scripts/bootstrap.mjs?rollback=${Date.now()}`);
      return;
    }
    throw error;
  }
})().catch((error) => {
  console.error("[BOM-Bot] Fatal startup error:", error);
  process.exitCode = 1;
});
