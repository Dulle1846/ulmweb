// Make the tested Wrangler Direct Upload the only production deployment path.
//
// The Pages project is Git-integrated. Cloudflare can therefore start its own
// production build for a push before the GitHub Actions test-and-deploy job has
// finished. That competing deployment does not contain the build-generated
// version.json marker and can become the newest production deployment.
//
// This script runs immediately before the Wrangler upload. It disables the
// Git-triggered production and preview deployments through the Pages API and
// verifies the setting from a fresh GET. It never prints the API token.
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

const DEFAULT_API = "https://api.cloudflare.com/client/v4";
const DEFAULT_PROJECT = "kings-and-cards";

async function cloudflareRequest({ api, token, accountId, project, method = "GET", body }) {
    const response = await fetch(
        `${api}/accounts/${encodeURIComponent(accountId)}/pages/projects/${encodeURIComponent(project)}`,
        {
            method,
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json"
            },
            body: body ? JSON.stringify(body) : undefined,
            signal: AbortSignal.timeout(20000)
        }
    );
    let payload;
    try {
        payload = await response.json();
    } catch {
        throw new Error(`Cloudflare Pages API returned non-JSON HTTP ${response.status}`);
    }
    if (!response.ok || payload.success === false) {
        const errors = (payload.errors || []).map(error => error.message || error.code).join("; ");
        throw new Error(`Cloudflare Pages API HTTP ${response.status}: ${errors || "unknown error"}`);
    }
    assert.ok(payload.result && typeof payload.result === "object", "Cloudflare response has no project result");
    return payload.result;
}

export async function enforcePagesDirectUpload({
    api = process.env.CLOUDFLARE_API_URL || DEFAULT_API,
    token = process.env.CLOUDFLARE_API_TOKEN,
    accountId = process.env.CLOUDFLARE_ACCOUNT_ID,
    project = process.env.PAGES_PROJECT || DEFAULT_PROJECT
} = {}) {
    if (!token || !accountId) {
        throw new Error("CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are required");
    }
    const normalizedApi = api.replace(/\/+$/, "");
    const before = await cloudflareRequest({ api: normalizedApi, token, accountId, project });
    const sourceType = before.source?.type;
    if (sourceType !== "github") {
        console.log(`Cloudflare Pages project ${project} has no Git auto-build (source=${sourceType || "none"}); Wrangler Direct Upload is authoritative.`);
        return { sourceType: sourceType || "none", changed: false };
    }

    const current = before.source.config || {};
    console.log("Cloudflare Pages Git settings before deploy: " + JSON.stringify({
        production_branch: current.production_branch,
        production_deployments_enabled: current.production_deployments_enabled,
        preview_deployment_setting: current.preview_deployment_setting
    }));

    const alreadySafe = current.production_deployments_enabled === false
        && current.preview_deployment_setting === "none";
    if (alreadySafe) {
        console.log("Cloudflare Pages Git auto-deployments are already disabled; the tested Wrangler Direct Upload is authoritative.");
        return { sourceType, changed: false };
    }

    await cloudflareRequest({
        api: normalizedApi,
        token,
        accountId,
        project,
        method: "PATCH",
        body: {
            source: {
                config: {
                    production_deployments_enabled: false,
                    preview_deployment_setting: "none"
                }
            }
        }
    });

    const after = await cloudflareRequest({ api: normalizedApi, token, accountId, project });
    const settings = after.source?.config || {};
    assert.equal(settings.production_deployments_enabled, false,
        "Cloudflare production deployments must be disabled for direct uploads");
    assert.equal(settings.preview_deployment_setting, "none",
        "Cloudflare preview auto-deployments must be disabled for direct uploads");
    console.log("Cloudflare Pages Git auto-deployments are disabled; the tested Wrangler Direct Upload is authoritative.");
    return { sourceType, changed: true };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    enforcePagesDirectUpload().catch(error => {
        console.error("::error::" + error.message);
        process.exitCode = 1;
    });
}
