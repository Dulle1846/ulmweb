// Build the runtime-only static package consumed by the Pages deployment.
// The game is intentionally static: no bundler or Worker runtime is involved.
import { execFileSync } from "node:child_process";
import { cp, mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const GAME_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_ROOT = join(GAME_ROOT, "artifacts", "kings-and-cards-deploy", "public");
const RUNTIME_DIRS = ["css", "js", "assets"];
const EXCLUDED = /(^|[\\/])(?:node_modules|tests?|docs?|\.git)(?:[\\/]|$)|\.(?:md|map)$/i;

function gitValue(args) {
    try {
        return execFileSync("git", args, {
            cwd: GAME_ROOT,
            encoding: "utf8",
            stdio: ["ignore", "pipe", "ignore"]
        }).trim();
    } catch {
        return "";
    }
}

const buildInfo = {
    commit: process.env.GITHUB_SHA || process.env.CF_PAGES_COMMIT_SHA || process.env.BUILD_COMMIT || gitValue(["rev-parse", "HEAD"]) || "unknown",
    branch: process.env.GITHUB_REF_NAME || process.env.CF_PAGES_BRANCH || process.env.BUILD_BRANCH || gitValue(["rev-parse", "--abbrev-ref", "HEAD"]) || "unknown",
    builtAt: new Date().toISOString(),
    source: process.env.GITHUB_ACTIONS === "true" ? "github-actions" : process.env.CF_PAGES === "1" ? "cloudflare-pages" : "local"
};

async function listFiles(directory, root = directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
        const fullPath = join(directory, entry.name);
        if (entry.isDirectory()) {
            files.push(...await listFiles(fullPath, root));
        } else if (entry.isFile()) {
            files.push(relative(root, fullPath).split("\\").join("/"));
        }
    }
    return files;
}

await rm(OUTPUT_ROOT, { recursive: true, force: true });
await mkdir(OUTPUT_ROOT, { recursive: true });

await cp(join(GAME_ROOT, "index.html"), join(OUTPUT_ROOT, "index.html"));
await writeFile(join(OUTPUT_ROOT, "version.json"), `${JSON.stringify(buildInfo, null, 2)}\n`);
for (const directory of RUNTIME_DIRS) {
    await cp(join(GAME_ROOT, directory), join(OUTPUT_ROOT, directory), {
        recursive: true,
        filter(source) {
            const rel = relative(GAME_ROOT, source).split("\\").join("/");
            return !EXCLUDED.test(rel);
        }
    });
}

const files = await listFiles(OUTPUT_ROOT);
if (!files.includes("index.html")) {
    throw new Error("Runtime package is missing index.html");
}

const forbidden = files.filter(file =>
    /(^|\/)(?:node_modules|tests?|docs?)(?:\/|$)|\.(?:md|map)$/i.test(file)
);
if (forbidden.length) {
    throw new Error(`Runtime package contains non-public files:\n${forbidden.join("\n")}`);
}

const bytes = (await Promise.all(files.map(file => stat(join(OUTPUT_ROOT, file)))))
    .reduce((total, entry) => total + entry.size, 0);
console.log(`Built ${files.length} runtime files (${(bytes / 1024 / 1024).toFixed(2)} MiB) in ${relative(GAME_ROOT, OUTPUT_ROOT)}`);
console.log(`Version marker: commit=${buildInfo.commit} branch=${buildInfo.branch} builtAt=${buildInfo.builtAt}`);
