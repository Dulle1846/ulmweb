import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import process from "node:process";
import { checkBrowser, printBrowserHelp } from "./browser-preflight.mjs";

const gameRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
process.chdir(gameRoot);

const cli = resolve(gameRoot, "node_modules/playwright/cli.js");
if (!existsSync(cli)) {
    console.error("Playwright is not installed. Run `npm install` in game/ first.");
    process.exit(1);
}

const withDeps = process.argv.includes("--with-deps");
const BROWSER_INSTALL_ATTEMPTS = 2;
const DEPENDENCY_INSTALL_ATTEMPTS = 3;

function sleep(ms) {
    return new Promise(resolveSleep => setTimeout(resolveSleep, ms));
}

function runPlaywright(args, { capture = false } = {}) {
    const result = spawnSync(process.execPath, [cli, ...args], {
        cwd: gameRoot,
        stdio: capture ? "pipe" : "inherit",
        encoding: capture ? "utf8" : undefined,
        env: process.env
    });
    if (result.error) throw result.error;
    return result;
}

function runApt(args) {
    const result = spawnSync(
        "sudo",
        ["env", "DEBIAN_FRONTEND=noninteractive", "apt-get", ...args],
        { cwd: gameRoot, stdio: "inherit", env: process.env }
    );
    if (result.error) {
        console.error("Unable to run apt-get: " + result.error.message);
        return 1;
    }
    return result.status ?? 1;
}

function refreshAptIndexes() {
    return runApt([
        "-o", "Acquire::Retries=5",
        "-o", "Acquire::http::Timeout=30",
        "update"
    ]);
}

// The browser binary is independent of the apt step. Install it first so a
// mirror failure cannot discard a completed download, then verify the exact
// capability the suite needs before touching system packages.
const existing = await checkBrowser();
if (existing.ok) {
    console.log("Chromium is already installed and passes the launch/native-input preflight.");
    console.log("System libraries and fonts are already usable; no apt install is needed.");
    process.exit(0);
}

let browserStatus = 1;
for (let attempt = 1; attempt <= BROWSER_INSTALL_ATTEMPTS; attempt += 1) {
    console.log(`Installing Chromium ${attempt}/${BROWSER_INSTALL_ATTEMPTS}...`);
    browserStatus = runPlaywright(["install", "chromium"]).status ?? 1;
    if (browserStatus === 0) break;
    if (attempt < BROWSER_INSTALL_ATTEMPTS) await sleep(attempt * 5000);
}
if (browserStatus !== 0) {
    printBrowserHelp(new Error("playwright install chromium failed after retries"));
    process.exit(browserStatus || 1);
}

const installed = await checkBrowser();
if (installed.ok) {
    console.log("Chromium passed the launch/native-input preflight with the runner's existing libraries.");
    process.exit(0);
}

if (!withDeps) {
    printBrowserHelp(installed.error);
    process.exit(1);
}

// A GitHub runner normally has the shared libraries Chromium needs. Only when
// the real browser probe fails do we ask apt for the full Playwright set.
for (let attempt = 1; attempt <= DEPENDENCY_INSTALL_ATTEMPTS; attempt += 1) {
    console.log(`Installing Chromium system dependencies ${attempt}/${DEPENDENCY_INSTALL_ATTEMPTS}...`);
    const status = runPlaywright(["install-deps", "chromium"]).status ?? 1;
    if (status === 0) break;
    if (attempt < DEPENDENCY_INSTALL_ATTEMPTS) {
        console.warn("System dependency install failed; refreshing apt indexes before retrying.");
        refreshAptIndexes();
        await sleep(attempt * 5000);
    }
}

let verified = await checkBrowser();
if (!verified.ok) {
    // A single unavailable font package (the observed mirror failure listed
    // fonts-unifont, xfonts-cyrillic and several optional font families) makes
    // the all-or-nothing apt transaction fail even though every runtime library
    // may be installable. Retry with the exact Playwright package set minus
    // optional fonts, then prove Chromium still renders a native text input.
    console.warn("Chromium is still not usable. Retrying with Playwright's dependency set minus optional fonts.");
    const dryRun = runPlaywright(["install-deps", "--dry-run", "chromium"], { capture: true });
    const dryRunText = `${dryRun.stdout || ""}\n${dryRun.stderr || ""}`;
    const installLine = dryRunText.split(/\r?\n/).find(line => line.includes("apt-get install"));
    const packagesMatch = installLine?.match(/apt-get install\s+-y(?:\s+--no-install-recommends)?\s+([^"']+)/);
    const packages = packagesMatch
        ? packagesMatch[1].trim().split(/\s+/).filter(name => name && !/^(?:fonts-|xfonts-)/.test(name))
        : [];
    if (!packages.length) {
        console.error("Could not determine Playwright's non-font system dependency set.");
        printBrowserHelp(verified.error);
        process.exit(1);
    }

    console.log(`Installing ${packages.length} non-font system packages: ${packages.join(" ")}`);
    refreshAptIndexes();
    let installedFallback = false;
    for (let attempt = 1; attempt <= DEPENDENCY_INSTALL_ATTEMPTS; attempt += 1) {
        const status = runApt(["install", "-y", "--no-install-recommends", ...packages]);
        if (status === 0) {
            installedFallback = true;
            break;
        }
        if (attempt < DEPENDENCY_INSTALL_ATTEMPTS) {
            console.warn("Font-free dependency install failed; refreshing apt indexes before retrying.");
            refreshAptIndexes();
            await sleep(attempt * 5000);
        }
    }
    if (!installedFallback) {
        printBrowserHelp(verified.error);
        process.exit(1);
    }

    // Keep one compact, text-only font when the mirror has it. The probe below
    // is authoritative either way, including on a genuinely font-free host.
    const fontStatus = runApt(["install", "-y", "--no-install-recommends", "fonts-dejavu-core"]);
    if (fontStatus !== 0) {
        console.warn("Optional fonts-dejavu-core was unavailable; continuing with the runner's existing fonts.");
    }
    verified = await checkBrowser();
}

if (!verified.ok) {
    printBrowserHelp(verified.error);
    process.exit(1);
}
console.log("Browser setup complete; Chromium and its native-input preflight are verified.");
