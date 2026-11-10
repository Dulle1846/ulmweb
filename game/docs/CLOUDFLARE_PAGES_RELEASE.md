# Cloudflare Pages release configuration

## Canonical target

Production is Cloudflare Pages at https://kings-and-cards.pages.dev/. The production Git branch is ulmweb-branch. Vercel is not used. The workers.dev hostname is a separate/legacy Worker endpoint and must not be treated as the Pages production deployment.

## Automatic deployment after green tests

`.github/workflows/deploy-kings-cards-after-tests.yml` is the production deployment path. It runs on pushes to `ulmweb-branch` and on manual dispatch, runs the full `npm test` in `game/`, builds a runtime-only package with `npm run build:runtime`, and only then uploads that package to the existing Pages project `kings-and-cards` on branch `ulmweb-branch` with Wrangler Direct Upload.

Required repository secrets:

| Secret | Purpose |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token with **Pages: Edit** permission for the account |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID that owns the `kings-and-cards` Pages project |

Because the Pages project is Git-integrated, disable **Enable automatic production branch deployments** in Cloudflare Dashboard → Workers & Pages → `kings-and-cards` → Settings → Builds & deployments before relying on this workflow. Otherwise a push to `ulmweb-branch` can deploy before the test job finishes. The production branch remains `ulmweb-branch`; the workflow performs a Direct Upload after the test gate, and the Pages build command/output directory settings are not used by that upload.

The runtime build writes `version.json` into the package root with `commit`, `branch` and `builtAt`. The workflow verifies that the artifact's `commit` equals the workflow commit before upload, and after the Wrangler upload it fetches `https://kings-and-cards.pages.dev/version.json?commit=<sha>` and fails unless the served `commit` and timestamp match. A plain HTTP 200 is not accepted as proof of the release.

A workflow run is not proof of a live release by itself. After a successful Wrangler upload, also confirm the deployment in the Pages project. The marker proves that the canonical URL serves the built commit; it does not prove that Cloudflare's dashboard deployment metadata names the same deployment.

## Repository facts

- The static game entry point is game/index.html.
- All browser assets and modules are under game/.
- game/package.json defines the test scripts and `build:runtime`; the runtime build is a static copy, not a framework bundler.
- The repository has no root package.json, wrangler.toml or wrangler.jsonc.
- The Pages site is static and does not need a bundler or Worker runtime.

## Tokenless Git-integration fallback

If no Cloudflare API token can be stored in GitHub, the existing Pages Git integration can run the same gate without GitHub secrets. This requires an owner with Cloudflare dashboard access:

1. Open Workers & Pages -> `kings-and-cards` -> Settings -> Builds & deployments -> Edit configuration.
2. Set the production branch to `ulmweb-branch`.
3. Set the root directory to `game`.
4. Set the build command to `npm test && npm run build:runtime`.
5. Set the build output directory to `artifacts/kings-and-cards-deploy/public`.
6. Add the environment variable `NODE_VERSION=22` (the test suite requires Node 20 or newer).
7. Save and trigger a new deployment.

This path has no `CLOUDFLARE_API_TOKEN` or `CLOUDFLARE_ACCOUNT_ID` requirement and cannot be configured from the repository. It replaces the Wrangler Direct Upload workflow for production; do not run both paths against the same branch. The repository's current settings cannot be checked without dashboard access, so this fallback is documented but not claimed as active.

## Expected Pages project settings for Direct Upload

When the GitHub Actions workflow performs Wrangler Direct Upload, the Pages Git build settings are not used for the uploaded content. The production branch must still match so the direct upload receives the production alias.

| Setting | Value |
|---|---|
| Production branch | ulmweb-branch |
| Automatic production deployments | Off |
| Framework preset | None |
| Root directory | game |
| Build command | Blank; if the UI requires a command, use exit 0 |
| Build output directory | . |
| Environment variables | None required for the static site |

Cloudflare's current Pages documentation says that projects without a framework/build step should leave the build command blank (or use exit 0 when a command is required), and the root directory should point to the folder containing the site. The output directory is relative to the configured root directory.

## Why a Pages build may fail

1. A preset may be configured even though this is not a Vite/React/Next app.
2. The root directory may be the repository root instead of game.
3. The output directory may be dist, build or public even though the real static site root is game.
4. A stale custom build command such as npm run build will fail because game/package.json has no build script.
5. A Pages Git integration permission or role issue can prevent repository cloning or deployment even when the source code is valid.

## Workers are separate

The workers.dev endpoint is not the same deployment target as Pages. The repository currently has no Wrangler configuration or Worker entry point. Do not add a Worker deployment or run npx wrangler deploy just to fix Pages. If the separate Worker project is still required, inspect its exact build log, project name, build command and asset configuration first. A static-assets Worker configuration would be a separate explicit deployment decision.

## Safe diagnostic sequence

1. In Cloudflare Dashboard → Workers & Pages → select the Pages project.
2. Open Deployments → failed deployment → View details → Build log.
3. Confirm the root directory, build command, output directory and production branch against the table above.
4. If the error is in repository cloning, inspect the GitHub Pages app installation and repository permissions.
5. If the failure is in the build step, check whether a stale npm run build or wrong output directory is configured.
6. If the Pages build succeeds but the public site is stale, inspect the deployment stage and the active production alias.
7. For workers.dev email alerts, open the separate Worker project and inspect its logs independently. Do not infer a Pages failure from a Worker failure.

## Release verification

A release is complete only when Cloudflare shows a successful production deployment for the expected commit and https://kings-and-cards.pages.dev/ serves the expected version. GitHub Actions success alone does not prove that Cloudflare deployed it.