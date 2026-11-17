import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { enforcePagesDirectUpload } from "../../scripts/enforce-pages-direct-upload.mjs";

function projectPayload({ sourceType = "github", production = true, preview = "all" } = {}) {
    if (sourceType === "none") return { success: true, result: { name: "kings-and-cards" } };
    return {
        success: true,
        result: {
            name: "kings-and-cards",
            source: {
                type: sourceType,
                config: {
                    production_branch: "ulmweb-branch",
                    production_deployments_enabled: production,
                    preview_deployment_setting: preview
                }
            }
        }
    };
}

async function withPagesApi(handler, callback) {
    const requests = [];
    const server = createServer(async (request, response) => {
        let raw = "";
        for await (const chunk of request) raw += chunk;
        const entry = {
            method: request.method,
            url: request.url,
            authorization: request.headers.authorization,
            body: raw ? JSON.parse(raw) : null
        };
        requests.push(entry);
        const result = await handler(entry, requests);
        response.writeHead(result.status || 200, { "content-type": "application/json" });
        response.end(JSON.stringify(result.body));
    });
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address();
    try {
        return await callback({
            api: `http://127.0.0.1:${port}`,
            requests
        });
    } finally {
        await new Promise(resolve => server.close(resolve));
    }
}

test("disables the competing Git production and preview deployments", async () => {
    let production = true;
    let preview = "all";
    await withPagesApi((request, requests) => {
        assert.equal(request.url, "/accounts/account/pages/projects/kings-and-cards");
        assert.equal(request.authorization, "Bearer secret");
        if (request.method === "PATCH") {
            assert.deepEqual(request.body, {
                source: {
                    config: {
                        production_deployments_enabled: false,
                        preview_deployment_setting: "none"
                    }
                }
            });
            production = false;
            preview = "none";
        }
        return { body: projectPayload({ production, preview }) };
    }, async ({ api, requests }) => {
        const result = await enforcePagesDirectUpload({
            api,
            token: "secret",
            accountId: "account",
            project: "kings-and-cards"
        });
        assert.equal(result.changed, true);
        assert.equal(production, false);
        assert.equal(preview, "none");
        assert.deepEqual(requests.map(entry => entry.method), ["GET", "PATCH", "GET"]);
    });
});

test("does not patch an already-safe Git project", async () => {
    await withPagesApi((request, requests) => {
        return { body: projectPayload({ production: false, preview: "none" }) };
    }, async ({ api, requests }) => {
        const result = await enforcePagesDirectUpload({
            api,
            token: "secret",
            accountId: "account",
            project: "kings-and-cards"
        });
        assert.equal(result.changed, false);
        assert.deepEqual(requests.map(entry => entry.method), ["GET"]);
    });
});

test("accepts a project without Git integration", async () => {
    await withPagesApi((request, requests) => {
        return { body: projectPayload({ sourceType: "none" }) };
    }, async ({ api, requests }) => {
        const result = await enforcePagesDirectUpload({
            api,
            token: "secret",
            accountId: "account",
            project: "kings-and-cards"
        });
        assert.equal(result.sourceType, "none");
        assert.equal(result.changed, false);
        assert.deepEqual(requests.map(entry => entry.method), ["GET"]);
    });
});

test("fails closed without Cloudflare credentials", async () => {
    await assert.rejects(
        enforcePagesDirectUpload({ api: "http://127.0.0.1:1", token: "", accountId: "", project: "kings-and-cards" }),
        /required/
    );
});

test("fails closed when Cloudflare rejects the project update", async () => {
    await withPagesApi(() => ({
        status: 403,
        body: { success: false, errors: [{ message: "Authentication error" }] }
    }), async ({ api }) => {
        await assert.rejects(
            enforcePagesDirectUpload({ api, token: "secret", accountId: "account", project: "kings-and-cards" }),
            /HTTP 403.*Authentication error/
        );
    });
});
