// Cold-start comparison for the shipped low-end profile.
//
// The swamp and savanna scenarios run through the same low-end harness with
// the same seed, viewport, 4x CPU throttle, software Canvas2D, 70% render
// scale, 85% forest cover, measurement durations and no warm-up. Each scenario
// starts a fresh browser process, so neither inherits a browser cache from the
// other. The swamp run is measured after savanna so the baseline is established
// on the same machine and in the same invocation. The contract is that the
// swamp p95 frame interval stays within one 0.1 ms timer tick of the baseline,
// that its instrumented app-work p95 is not more than 1 ms above the baseline,
// and that neither run produces a long task. The frame-interval allowance is
// the browser timer's own resolution, not a performance excuse: the app-work
// guard still catches a real regression.
//
// Run locally:
//   npm run test:coldstart:compare
// Against the deployed build:
//   PERF_BASE_URL=https://kings-and-cards.pages.dev npm run test:coldstart:compare
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const ROOT = resolve(process.cwd());
const ARTIFACTS = resolve(ROOT, "..", "artifacts");
const REPORT = resolve(ARTIFACTS, "low-end-performance.json");
const BASE_URL = process.env.PERF_BASE_URL ? new URL(process.env.PERF_BASE_URL).origin : "";
const SEED = 20261152;
const FORESTS = 85;
const YEARS = 2;
const RENDER_SCALE = 70;
const QUIET_MS = Number(process.env.PERF_QUIET_MS || 8000);
const P95_TIMER_TOLERANCE_MS = 0.1;
const APP_WORK_TOLERANCE_MS = 1;

const SCENARIOS = [
    { name: "savanna", climate: "savanna" },
    { name: "swamp", climate: "swamp" }
];

await mkdir(ARTIFACTS, { recursive: true });

function runScenario({ name, climate }) {
    const env = {
        ...process.env,
        PERF_CLIMATE: climate,
        PERF_FORESTS: String(FORESTS),
        PERF_SEED: String(SEED),
        PERF_YEARS: String(YEARS),
        PERF_RENDER_SCALE: String(RENDER_SCALE),
        PERF_SOFTWARE_CANVAS: "1",
        // This comparison is the cold-start contract: no warm-up exclusion.
        PERF_WARMUP_MS: "0",
        PERF_QUIET_MS: String(QUIET_MS),
        ...(BASE_URL ? { PERF_BASE_URL: BASE_URL } : {})
    };
    const result = spawnSync(process.execPath, ["tests/browser/low-end-performance.mjs"], {
        cwd: ROOT,
        env,
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024
    });
    return {
        name,
        climate,
        status: result.status,
        signal: result.signal,
        stdout: result.stdout || "",
        stderr: result.stderr || ""
    };
}

async function readReport(run) {
    try {
        const report = JSON.parse(await readFile(REPORT, "utf8"));
        await copyFile(REPORT, resolve(ARTIFACTS, "swamp-coldstart-" + run.name + ".json"));
        return report;
    } catch (error) {
        throw new Error("No report for " + run.name + ": " + error.message + "\n" + run.stderr.slice(-4000));
    }
}

function quietPhase(report) {
    const phase = report.phases?.find(entry => entry.name === "quiet-early-realm");
    assert.ok(phase, "quiet-early-realm phase is missing");
    return phase;
}

const reports = {};
for (const scenario of SCENARIOS) {
    const run = runScenario(scenario);
    await writeFile(resolve(ARTIFACTS, "swamp-coldstart-" + scenario.name + ".log"), run.stdout + run.stderr);
    reports[scenario.name] = { run, report: await readReport(run) };
}

const savanna = reports.savanna;
const swamp = reports.swamp;
const savannaQuiet = quietPhase(savanna.report);
const swampQuiet = quietPhase(swamp.report);

const comparison = {
    schema: 1,
    baseUrl: BASE_URL || "local",
    generatedAt: new Date().toISOString(),
    conditions: {
        seed: SEED,
        forests: FORESTS,
        years: YEARS,
        renderScale: RENDER_SCALE,
        cpuThrottle: swamp.report.cpuThrottle,
        softwareCanvas: swamp.report.softwareCanvas,
        viewport: swamp.report.viewport,
        warmupMs: 0,
        quietMs: QUIET_MS
    },
    savanna: {
        exitCode: savanna.run.status,
        phase: savannaQuiet,
        pageErrors: savanna.report.pageErrors || [],
        consoleErrors: savanna.report.consoleErrors || []
    },
    swamp: {
        exitCode: swamp.run.status,
        phase: swampQuiet,
        pageErrors: swamp.report.pageErrors || [],
        consoleErrors: swamp.report.consoleErrors || []
    },
    comparison: {
        p95DeltaMs: Math.round((swampQuiet.p95FrameMs - savannaQuiet.p95FrameMs) * 10) / 10,
        swampAtOrBelowBaseline: swampQuiet.p95FrameMs <= savannaQuiet.p95FrameMs + P95_TIMER_TOLERANCE_MS,
        appWorkDeltaMs: Math.round(((Number(swampQuiet.probe?.appWorkP95Ms) || 0)
            - (Number(savannaQuiet.probe?.appWorkP95Ms) || 0)) * 10) / 10,
        swampLongTasks: swampQuiet.longTasks,
        savannaLongTasks: savannaQuiet.longTasks
    }
};
await writeFile(resolve(ARTIFACTS, "swamp-coldstart-report.json"), JSON.stringify(comparison, null, 2) + "\n");

const failures = [];
if (savanna.run.status !== 0) failures.push("savanna harness exited " + savanna.run.status);
if (swamp.run.status !== 0) failures.push("swamp harness exited " + swamp.run.status);
if ((savanna.report.pageErrors || []).length) failures.push("savanna page errors: " + savanna.report.pageErrors.join(" | "));
if ((swamp.report.pageErrors || []).length) failures.push("swamp page errors: " + swamp.report.pageErrors.join(" | "));
if ((savanna.report.consoleErrors || []).length) failures.push("savanna console errors: " + savanna.report.consoleErrors.join(" | "));
if ((swamp.report.consoleErrors || []).length) failures.push("swamp console errors: " + swamp.report.consoleErrors.join(" | "));
if (savannaQuiet.longTasks !== 0) failures.push("savanna baseline has " + savannaQuiet.longTasks + " long tasks");
if (swampQuiet.longTasks !== 0) failures.push("swamp cold start has " + swampQuiet.longTasks + " long tasks");
if (swampQuiet.p95FrameMs > savannaQuiet.p95FrameMs + P95_TIMER_TOLERANCE_MS) {
    failures.push("swamp p95 " + swampQuiet.p95FrameMs + "ms exceeds savanna baseline "
        + savannaQuiet.p95FrameMs + "ms by more than the " + P95_TIMER_TOLERANCE_MS + "ms timer tick");
}
const swampAppWork = Number(swampQuiet.probe?.appWorkP95Ms);
const savannaAppWork = Number(savannaQuiet.probe?.appWorkP95Ms);
if (Number.isFinite(swampAppWork) && Number.isFinite(savannaAppWork)
    && swampAppWork > savannaAppWork + APP_WORK_TOLERANCE_MS) {
    failures.push("swamp app-work p95 " + swampAppWork + "ms exceeds savanna baseline "
        + savannaAppWork + "ms by more than " + APP_WORK_TOLERANCE_MS + "ms");
}

console.log("SWAMP_COLDSTART " + JSON.stringify({
    ok: failures.length === 0,
    baseUrl: comparison.baseUrl,
    swamp: {
        p95FrameMs: swampQuiet.p95FrameMs,
        p95DrawMs: swampQuiet.canvasDrawP95Ms,
        longTasks: swampQuiet.longTasks,
        longTaskMaxMs: swampQuiet.longTaskMaxMs,
        renderScale: swamp.report.renderScale,
        cpuThrottle: swamp.report.cpuThrottle
    },
    savanna: {
        p95FrameMs: savannaQuiet.p95FrameMs,
        p95DrawMs: savannaQuiet.canvasDrawP95Ms,
        longTasks: savannaQuiet.longTasks,
        longTaskMaxMs: savannaQuiet.longTaskMaxMs,
        renderScale: savanna.report.renderScale,
        cpuThrottle: savanna.report.cpuThrottle
    },
    deltaMs: comparison.comparison.p95DeltaMs,
    failures,
    report: "../artifacts/swamp-coldstart-report.json"
}));

if (failures.length) {
    console.error("COLDSTART COMPARISON FAILED\n" + failures.join("\n"));
    process.exit(1);
}
