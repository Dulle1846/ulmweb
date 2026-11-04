import { readFile, readdir, access } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const gameRoot = fileURLToPath(new URL("..", import.meta.url));
const sourceRoot = resolve(gameRoot, "js");

async function collectJavaScriptFiles(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    const files = [];

    for (const entry of entries) {
        const fullPath = resolve(directory, entry.name);
        if (entry.isDirectory()) {
            files.push(...await collectJavaScriptFiles(fullPath));
        } else if (entry.isFile() && entry.name.endsWith(".js")) {
            files.push(fullPath);
        }
    }

    return files;
}

async function fileExists(path) {
    try {
        await access(path);
        return true;
    } catch {
        return false;
    }
}

const files = await collectJavaScriptFiles(sourceRoot);
const failures = [];
const missingImports = [];
const missingUiIds = [];
const duplicateUiIds = [];
const missingAssets = [];

for (const file of files) {
    const result = spawnSync(process.execPath, ["--check", file], {
        encoding: "utf8"
    });

    if (result.status !== 0) {
        failures.push({ file, output: result.stderr || result.stdout || "Unknown syntax error" });
    }

    const source = await readFile(file, "utf8");
    const imports = source.matchAll(/(?:from\s*|import\s*\()\s*['"]([^'"]+)['"]/g);

    for (const match of imports) {
        const specifier = match[1];
        if (!specifier.startsWith(".")) continue;

        const target = resolve(dirname(file), specifier);
        if (!(await fileExists(target))) {
            missingImports.push({ file, specifier });
        }
    }
}

const htmlPath = resolve(gameRoot, "index.html");
const html = await readFile(htmlPath, "utf8");
const declaredIds = [...html.matchAll(/\bid\s*=\s*["']([^"']+)["']/g)].map(match => match[1]);
const declaredIdSet = new Set(declaredIds);

for (const id of new Set(declaredIds)) {
    if (declaredIds.filter(value => value === id).length > 1) {
        duplicateUiIds.push(id);
    }
}

const referencedIds = new Set();
for (const file of files) {
    const source = await readFile(file, "utf8");
    for (const match of source.matchAll(/(?:getElementById|setText)\(\s*["']([^"']+)["']/g)) {
        referencedIds.add(match[1]);
    }
}

for (const id of referencedIds) {
    if (!declaredIdSet.has(id)) missingUiIds.push(id);
}

const localAssets = [
    ...html.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi),
    ...html.matchAll(/<link\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/gi)
];

for (const match of localAssets) {
    const asset = match[1];
    if (/^(?:https?:)?\/\//i.test(asset) || asset.startsWith("data:")) continue;
    if (!(await fileExists(resolve(gameRoot, asset)))) missingAssets.push(asset);
}

if (failures.length || missingImports.length || missingUiIds.length ||
    duplicateUiIds.length || missingAssets.length) {
    for (const failure of failures) {
        console.error("Syntax error in " + failure.file + "\n" + failure.output);
    }
    for (const missing of missingImports) {
        console.error("Missing import in " + missing.file + ": " + missing.specifier);
    }
    for (const id of missingUiIds) console.error("Missing HTML id referenced by JS: " + id);
    for (const id of duplicateUiIds) console.error("Duplicate HTML id: " + id);
    for (const asset of missingAssets) console.error("Missing local HTML asset: " + asset);
    process.exitCode = 1;
} else {
    console.log(
        "Passed: syntax and relative imports for " + files.length +
        " source files; " + referencedIds.size +
        " referenced UI ids; local HTML assets."
    );
}
