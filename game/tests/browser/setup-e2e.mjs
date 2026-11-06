import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import process from "node:process";
import { checkBrowser, printBrowserHelp } from "./browser-preflight.mjs";

const gameRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
process.chdir(gameRoot);

const existing = await checkBrowser();
if (existing.ok) {
    console.log("Chromium is already installed and can render native text inputs.");
    process.exit(0);
}

const cli = resolve(gameRoot, "node_modules/playwright/cli.js");
if (!existsSync(cli)) {
    console.error("Playwright is not installed. Run `npm install` in game/ first.");
    process.exit(1);
}

const withDeps = process.argv.includes("--with-deps");
const args = [cli, "install"];
if (withDeps) args.push("--with-deps");
args.push("chromium");
console.log("Installing Chromium" + (withDeps ? " with system dependencies" : "") + "...");
const result = spawnSync(process.execPath, args, { cwd: gameRoot, stdio: "inherit", env: process.env });
if (result.error) {
    console.error(result.error.message);
    process.exit(1);
}
if (result.status !== 0) {
    printBrowserHelp(new Error("playwright install exited with code " + result.status));
    process.exit(result.status || 1);
}

const verified = await checkBrowser();
if (!verified.ok) {
    printBrowserHelp(verified.error);
    process.exit(1);
}
console.log("Browser setup complete. Run `npm run test:e2e`.");
