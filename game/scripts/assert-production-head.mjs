// Refuse to deploy a commit that is not the current production branch head.
// The deploy workflow runs this immediately before the Wrangler upload. A
// manually dispatched or re-run stale workflow therefore stops before it can
// touch production, even when the runtime package and tests are valid.
const expected = String(process.env.GITHUB_SHA || "").trim();
const repository = String(process.env.GITHUB_REPOSITORY || "").trim();
const branch = String(process.env.PRODUCTION_BRANCH || "ulmweb-branch").trim();
const token = String(process.env.GH_TOKEN || process.env.GITHUB_TOKEN || "").trim();
const apiBase = String(process.env.GITHUB_API_URL || "https://api.github.com").replace(/\/+$/, "");

function fail(message) {
    console.error(message);
    process.exitCode = 1;
}

if (!expected) {
    fail("Production head guard: GITHUB_SHA is required.");
} else if (!repository || !repository.includes("/")) {
    fail("Production head guard: GITHUB_REPOSITORY must be owner/repository.");
} else if (!branch) {
    fail("Production head guard: PRODUCTION_BRANCH must not be empty.");
} else if (!token) {
    fail("Production head guard: GH_TOKEN (or GITHUB_TOKEN) is required.");
} else {
    const url = `${apiBase}/repos/${repository}/git/ref/heads/${branch}`;
    try {
        const response = await fetch(url, {
            headers: {
                Accept: "application/vnd.github+json",
                Authorization: `Bearer ${token}`,
                "X-GitHub-Api-Version": "2022-11-28",
                "User-Agent": "kings-and-cards-production-head-guard"
            },
            signal: AbortSignal.timeout(15000)
        });
        if (!response.ok) {
            fail(`Production head guard: GitHub returned HTTP ${response.status} for ${repository}/${branch}.`);
        } else {
            const payload = await response.json();
            const current = String(payload?.object?.sha || "").trim();
            if (!/^[0-9a-f]{40}$/i.test(current)) {
                fail("Production head guard: GitHub did not return a valid branch head SHA.");
            } else if (expected.toLowerCase() !== current.toLowerCase()) {
                fail(`Production head guard: refusing to deploy stale commit ${expected}; ${branch} is ${current}.`);
            } else {
                console.log(`Production head guard passed: ${expected} is the current ${branch} head.`);
            }
        }
    } catch (error) {
        fail(`Production head guard: could not verify ${repository}/${branch}: ${error?.message || error}`);
    }
}
