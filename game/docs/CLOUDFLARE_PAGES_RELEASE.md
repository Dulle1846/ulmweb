# Cloudflare Pages release configuration

## Canonical target

Production is Cloudflare Pages at https://kings-and-cards.pages.dev/. The production Git branch is ulmweb-branch. Vercel is not used. The workers.dev hostname is a separate/legacy Worker endpoint and must not be treated as the Pages production deployment.

## Retired deploy targets: Freebuff Sites

The two Freebuff Sites origins (preview `https://site-79c6673d168e4265a2d5609f9d77a1cb.freebuff.page`, production `https://site-4652b62d6d624022a45a118e0782bcb1.freebuff.page`, site `054512f6-1fcf-489c-8406-3ab4e49022e3`) were unpublished on 2026-11-22 at the owner's request and have answered HTTP 404 since. The saved deployments, code and data remain in the site record; nothing was deleted.

Before retirement all four origins served the same runtime. 371 of the 372 shipped files matched by SHA-256, and the only difference was `version.json`, which records each deployment's own source, branch and `builtAt`. Game version `3.34.2` and commit `8001734a838351049ec70f586cf3b49eae8bca38` were served on every origin.

Only the two GitHub-driven targets are published from now on:

| Target | URL | Deploy path |
|---|---|---|
| Production (main) | https://kings-and-cards.pages.dev/ | `.github/workflows/deploy-kings-cards-after-tests.yml` |
| Mirror | https://dulle1846.github.io/ulmweb/ | `.github/workflows/deploy-github-pages.yml` |

Do not recreate Sites deployments for Kings & Cards. A push to `ulmweb-branch` deploys both remaining targets, so "deploy everything" means those two origins and a cache-busted `version.json` fetch as proof. Development browser checks use the local dev server or the live Pages deployment instead of a Sites preview.

## Automatic deployment after green tests

`.github/workflows/deploy-kings-cards-after-tests.yml` is the production deployment path. It runs on every push to `ulmweb-branch` and on manual dispatch, runs the full `npm test` in `game/`, builds a runtime-only package with `npm run build:runtime`, and only then uploads that package to the existing Pages project `kings-and-cards` on branch `ulmweb-branch` with Wrangler Direct Upload. Running on every push is deliberate: a CI-only or documentation commit must also move the production marker to that exact HEAD instead of leaving an older runtime live.

Required repository secrets:

| Secret | Purpose |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token with **Pages: Edit** permission for the account |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID that owns the `kings-and-cards` Pages project |

The Pages project is Git-integrated. That integration is the source of the former race: Cloudflare can start its own production build for a push before the GitHub Actions test gate finishes, and that Git deployment does not contain the generated `version.json` marker. The GitHub Actions deploy now closes the race at its cause: after the tests and immediately before the Wrangler upload it runs `node game/scripts/enforce-pages-direct-upload.mjs`. That script uses the Pages API to set `source.config.production_deployments_enabled=false` and `source.config.preview_deployment_setting=none`, then performs a fresh GET and fails closed unless both settings are active. The production branch remains `ulmweb-branch`; the Pages build command/output directory settings are not used by the Direct Upload.

## Stale-deploy guard

Immediately before the Wrangler upload, the deploy job runs `node game/scripts/assert-production-head.mjs`. The script reads the current `ulmweb-branch` head from the GitHub API and exits non-zero unless `GITHUB_SHA` is exactly that commit. A manually dispatched, re-run or queued run for an older commit therefore stops after the runtime has been verified and before any Cloudflare credentials are used to upload. The workflow's existing `kings-cards-pages-production` concurrency group serializes production deploys, so the newest run can replace an older one safely after this check.

The guard is covered by `tests/ci/production-head-guard.test.js` (current head accepted, stale commit rejected, API failure rejected, missing token rejected). The workflow itself is not the only proof: run the guard locally with a current and a stale SHA to see the same decision against the real API. Historical workflow runs created before this guard use their own immutable workflow definition; do not re-run those old deploy jobs. The guard protects every deploy run from this revision onward.

### Environment isolation for pre-guard runs

The repository also isolates the deploy environment. The new workflow uses `production-current`, whose deployment branch rule allows only `ulmweb-branch`. The legacy `Production` environment is retained for deployment history but its branch rule now allows only the non-existent retired branch `retired-production`. Any pre-guard workflow run, including an old run whose YAML has no head check, therefore cannot enter the production environment from `ulmweb-branch`. Environment branch rules are matched against the workflow run's `GITHUB_REF` and are configured in repository settings, not in the workflow YAML, so this protection applies even to immutable historical workflow definitions.

The runtime build writes `version.json` into the package root with `commit`, `branch` and `builtAt`. The workflow verifies that the artifact's `commit` equals the workflow commit before upload, and after the Wrangler upload it fetches `https://kings-and-cards.pages.dev/version.json?commit=<sha>` and fails unless the served `commit` and timestamp match. It then holds the marker for three further ten-second checks so a late competing deployment makes the release job fail instead of silently overwriting the tested commit. A plain HTTP 200 is not accepted as proof of the release.

### Guarded release evidence

On 2026-11-17 the first guarded deploy observed `production_deployments_enabled=true` for the Git-integrated project. The guard changed it to `false`, a fresh GET confirmed the change, and three post-upload stability checks plus a later fetch all returned the deployed commit as `application/json`. The Git auto-build could no longer replace the tested Direct Upload.

A workflow run is not proof of a live release by itself. After a successful Wrangler upload, also confirm the deployment in the Pages project. The marker proves that the canonical URL serves the built commit; it does not prove that Cloudflare's dashboard deployment metadata names the same deployment.

## Repository facts

- The static game entry point is game/index.html.
- All browser assets and modules are under game/.
- game/package.json defines the test scripts and `build:runtime`; the runtime build is a static copy, not a framework bundler.
- The repository has no root package.json, wrangler.toml or wrangler.jsonc.
- The Pages site is static and does not need a bundler or Worker runtime.

## Branch roles and the main mirror

`ulmweb-branch` is the only production deploy branch: the deploy workflow's push trigger, the `production-current` environment branch rule and the Wrangler upload all target it. `main` is an additive mirror of the verified `ulmweb-branch` head for repository consumers. It is not a second deployment source and must not be force-pushed or rewritten.

After a production release, fast-forward `main` to the verified `ulmweb-branch` head (or use an additive merge commit only if a fast-forward is impossible), then verify that both refs resolve to the same SHA. A push to `main` does not deploy; do not add a production deployment trigger for it.

The separate `kings-and-cards` Worker is not the Pages production target. A `main`-only Workers Builds trigger must not be used for this static repository: there is no Wrangler or Worker configuration, and `npx wrangler preview` cannot deploy the Pages runtime. The obsolete main-only trigger was removed; do not recreate Workers Builds for this repository without an explicit, separate Worker deployment decision.

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
4. If the error is in repository cloning, inspect the Cloudflare Pages GitHub App installation and repository permissions.
5. If the failure is in the build step, check whether a stale npm run build or wrong output directory is configured.
6. If the Pages build succeeds but the public site is stale, inspect the deployment stage and the active production alias.
7. For workers.dev email alerts, open the separate Worker project and inspect its logs independently. Do not infer a Pages failure from a Worker failure.

## Release verification

A release is complete only when Cloudflare shows a successful production deployment for the expected commit and https://kings-and-cards.pages.dev/ serves the expected version. GitHub Actions success alone does not prove that Cloudflare deployed it.