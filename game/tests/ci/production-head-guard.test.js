import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const GUARD = resolve(dirname(fileURLToPath(import.meta.url)), "../../scripts/assert-production-head.mjs");
const HEAD = "f9168560973ece5afd2266b2c08e0b71a2dce119";
const STALE = "d79b23a67e137247bca6979f9fe602a0db2997e6";

function runGuard(env) {
    return new Promise(resolveRun => {
        execFile(process.execPath, [GUARD], {
            env: { ...process.env, ...env },
            timeout: 10000
        }, (error, stdout, stderr) => {
            resolveRun({ code: error?.code ?? 0, stdout, stderr });
        });
    });
}

async function withGitHubHead(sha, callback) {
    const server = createServer((request, response) => {
        assert.equal(request.url, "/repos/Dulle1846/ulmweb/git/ref/heads/ulmweb-branch");
        assert.equal(request.headers.authorization, "Bearer test-token");
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ ref: "refs/heads/ulmweb-branch", object: { sha } }));
    });
    await new Promise(resolveListen => server.listen(0, "127.0.0.1", resolveListen));
    const { port } = server.address();
    try {
        return await callback(`http://127.0.0.1:${port}`);
    } finally {
        await new Promise(resolveClose => server.close(resolveClose));
    }
}

test("production head guard accepts the current production commit", async () => {
    await withGitHubHead(HEAD, async apiUrl => {
        const result = await runGuard({
            GITHUB_API_URL: apiUrl,
            GITHUB_REPOSITORY: "Dulle1846/ulmweb",
            GITHUB_SHA: HEAD,
            GH_TOKEN: "test-token",
            GITHUB_TOKEN: "",
            PRODUCTION_BRANCH: "ulmweb-branch"
        });
        assert.equal(result.code, 0, result.stderr);
        assert.match(result.stdout, /guard passed/);
    });
});

test("production head guard rejects a stale deploy before any upload", async () => {
    await withGitHubHead(HEAD, async apiUrl => {
        const result = await runGuard({
            GITHUB_API_URL: apiUrl,
            GITHUB_REPOSITORY: "Dulle1846/ulmweb",
            GITHUB_SHA: STALE,
            GH_TOKEN: "test-token",
            GITHUB_TOKEN: "",
            PRODUCTION_BRANCH: "ulmweb-branch"
        });
        assert.equal(result.code, 1);
        assert.match(result.stderr, /refusing to deploy stale commit/);
        assert.match(result.stderr, new RegExp(STALE));
        assert.match(result.stderr, new RegExp(HEAD));
    });
});

test("production head guard fails closed when the API is unavailable", async () => {
    const result = await runGuard({
        GITHUB_API_URL: "http://127.0.0.1:1",
        GITHUB_REPOSITORY: "Dulle1846/ulmweb",
        GITHUB_SHA: HEAD,
        GH_TOKEN: "test-token",
        GITHUB_TOKEN: "",
        PRODUCTION_BRANCH: "ulmweb-branch"
    });
    assert.equal(result.code, 1);
    assert.match(result.stderr, /could not verify/);
});

test("production head guard fails closed without a token", async () => {
    const result = await runGuard({
        GITHUB_REPOSITORY: "Dulle1846/ulmweb",
        GITHUB_SHA: HEAD,
        GH_TOKEN: "",
        GITHUB_TOKEN: "",
        PRODUCTION_BRANCH: "ulmweb-branch"
    });
    assert.equal(result.code, 1);
    assert.match(result.stderr, /GH_TOKEN/);
});
