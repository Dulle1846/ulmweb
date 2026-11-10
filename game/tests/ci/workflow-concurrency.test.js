import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

async function readWorkflow(file) {
    return readFile(resolve(ROOT, ".github/workflows", file), "utf8");
}

const perCommitWorkflows = [
    ["game-quality.yml", /group:\s*game-quality-\$\{\{\s*github\.sha\s*\}\}/],
    ["kings-cards-2-1-ci.yml", /group:\s*kings-cards-\$\{\{\s*github\.workflow\s*\}\}-\$\{\{\s*github\.sha\s*\}\}/],
    ["game-browser-e2e.yml", /group:\s*game-browser-e2e-\$\{\{\s*github\.sha\s*\}\}/]
];

for (const [file, expectedGroup] of perCommitWorkflows) {
    test(`${file} never cancels checks and uses a per-commit group`, async () => {
        const workflow = await readWorkflow(file);
        assert.doesNotMatch(workflow, /cancel-in-progress:\s*true/, `${file} must not cancel checks from another commit`);
        assert.match(workflow, expectedGroup, `${file} must isolate concurrency by commit`);
    });
}

test("deploy workflow serializes production without cancelling checks", async () => {
    const workflow = await readWorkflow("deploy-kings-cards-after-tests.yml");
    assert.doesNotMatch(workflow, /cancel-in-progress:\s*true/, "production deploys must never cancel a check");
    assert.match(workflow, /group:\s*kings-cards-pages-production/);
});
