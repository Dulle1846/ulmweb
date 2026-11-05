# Cloudflare Pages release configuration

## Canonical target

Production is Cloudflare Pages at https://kings-and-cards.pages.dev/. The production Git branch is ulmweb-branch. Vercel is not used. The workers.dev hostname is a separate/legacy Worker endpoint and must not be treated as the Pages production deployment.

## Repository facts

- The static game entry point is game/index.html.
- All browser assets and modules are under game/.
- game/package.json defines only the test script; it does not define a build script.
- The repository has no root package.json, wrangler.toml or wrangler.jsonc.
- The Pages site is static and does not need a bundler or Worker runtime.

## Expected Pages project settings

| Setting | Value |
|---|---|
| Production branch | ulmweb-branch |
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