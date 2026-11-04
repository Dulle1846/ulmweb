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

const files = await collectJavaScriptFiles(sourceRoot);
const failures = [];
const missingImports = [];

for (const file of files) {
    const result = spawnSync(process.execPath, ["--check", file], {
        encoding: "utf8"
    });

    if (result.status !== 0) {
        failures.push({ file, output: result.stderr || result.stdout || "Unknown syntax error" });
    }

    const source = await readFile(file, "utf8");
    const imports = source.matchAll(/(?:from\\s*|import\\s*\\()\\s*['"]([^'"]+)['"]/g);

    for (const match of imports) {
        const specifier = match[1];
        if (!specifier.startsWith(".")) continue;

        const target = resolve(dirname(file), specifier);
        try {
            await access(target);
        } catch {
            missingImports.push({ file, specifier, target });
        }
    }
}

if (failures.length > 0 || missingImports.length > 0) {
    for (const failure of failures) {
        console.error("Syntax error in " + failure.file + "\\n" + failure.output);
    }
    for (const missing of missingImports) {
        console.error("Missing import in " + missing.file + ": " + missing.specifier);
    }
    process.exitCode = 1;
} else {
    console.log("Syntax and relative-import checks passed for " + files.length + " JavaScript source files.");
}
