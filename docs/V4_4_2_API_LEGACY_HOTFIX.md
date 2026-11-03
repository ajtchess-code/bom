# BOM v4.4.2 — API Legacy Wiki Build Hotfix

Apply this cumulative update over v4.3.0, v4.4.0 or v4.4.1. All v4.4 features and v4.4.1 reply fixes are included.

Stop the server. Extract into `/home/container`, allowing file replacement. In particular, the archive must replace **both** `apps/api/src/knowledge.ts` and `apps/controller/src/knowledge.ts`. Keep existing environment files, then restart with the usual source-build bootstrap. No additional migration is introduced beyond v4.4.0's migration 031.

The latest log confirms the controller compile succeeded and the API compile then failed on a separate leftover Wiki module. The previous patch covered only the controller copy. This package adds an explicit replacement for the obsolete API file as well, so an overlay cannot leave those old database-helper imports behind. The active API continues registering its Wiki routes through the existing Wiki modules in `index.ts`.

Validation: API TypeScript build passed; all 14 repository tests passed, with the legacy-module regression check expanded to cover both API and controller copies. The maintained workspace sources were searched for the removed helper imports; none remain. Files that exist only on the host cannot be inventoried from here. Live startup verification remains after deployment.
