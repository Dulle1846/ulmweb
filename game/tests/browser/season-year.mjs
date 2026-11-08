// Full-year seasonal audit in the browser.
//
// The unit tests check the curves; this run drives the real game modules
// through a complete 400-day realm year with the actual seeded weather stream
// and records every day: weather, snow cover and the foliage state of six
// species across seven tree seeds. It also compares all five climate profiles.
//
// Usage: npm run test:season-year
// Output: docs/terrain-reference/season-year.json (override with SEASON_YEAR_OUT)

import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { browserLaunchOptions, checkBrowser, printBrowserHelp } from "./browser-preflight.mjs";

const gameRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
process.chdir(gameRoot);

const outputPath = path.resolve(process.env.SEASON_YEAR_OUT || path.join(gameRoot, "docs/terrain-reference/season-year.json"));
const seed = Number(process.env.SEASON_YEAR_SEED || 20261104);
const species = ["broadleaf", "birch", "oak", "beech", "conifer", "shrub"];
const treeSeeds = [0.08, 0.22, 0.36, 0.5, 0.64, 0.78, 0.92];

const mimeTypes = {
    ".js": "text/javascript",
    ".html": "text/html",
    ".css": "text/css",
    ".json": "application/json",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".woff2": "font/woff2",
};

function createServer() {
    return http.createServer(async (request, response) => {
        const url = new URL(request.url || "/", "http://localhost");
        const file = path.join(gameRoot, decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname));
        if (!file.startsWith(gameRoot)) {
            response.statusCode = 403;
            response.end("forbidden");
            return;
        }
        try {
            const data = await fs.readFile(file);
            response.setHeader("content-type", mimeTypes[path.extname(file)] || "application/octet-stream");
            response.end(data);
        } catch {
            response.statusCode = 404;
            response.end("missing");
        }
    });
}

const probe = await checkBrowser();
if (!probe.ok) {
    printBrowserHelp(probe.error);
    process.exit(1);
}

const { chromium } = await import("playwright");
const server = createServer();
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
await fs.mkdir(path.dirname(outputPath), { recursive: true });

const browser = await chromium.launch(browserLaunchOptions());
const context = await browser.newContext({ viewport: { width: 800, height: 800 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const diagnostics = [];
page.on("pageerror", error => diagnostics.push("pageerror: " + error.message));
page.on("console", message => {
    if (message.type() === "error") diagnostics.push("console: " + message.text());
});

try {
    await page.goto("http://127.0.0.1:" + port + "/", { waitUntil: "networkidle" });
    await page.locator("#world-seed-input").fill(String(seed));
    await page.locator("#player-name-input").fill("Season Audit");
    await page.locator("#start-new-game-btn").click();
    await page.locator("#start-screen").waitFor({ state: "hidden", timeout: 30000 });
    await page.waitForTimeout(800);

    const report = await page.evaluate(async ({ seed, species, treeSeeds }) => {
        const { state } = await import("./js/core/state.js");
        const { updateWeather } = await import("./js/world/weather.js");
        const { foliageState } = await import("./js/presentation/rendering/seasonal-foliage.js");
        const { seasonalState } = await import("./js/world/season.js");

        state.isPaused = true;
        state.weather = "clear";
        state.weatherTimer = 0;
        if (!state.randomStreams || typeof state.randomStreams !== "object") state.randomStreams = {};
        // Start the weather stream at zero so the log is reproducible.
        state.randomStreams.weather = 0;

        const climate = state.worldOptions?.climate || "temperate";
        const round = value => Math.round(value * 1000) / 1000;
        const average = values => values.reduce((sum, value) => sum + value, 0) / values.length;

        const days = [];
        const weatherEvents = [];
        let previousWeather = state.weather;

        for (let day = 0; day < 400; day++) {
            state.dayOfYear = day;
            state.seasonIndex = Math.floor(day / 100) % 4;
            updateWeather();

            if (state.weather !== previousWeather) {
                weatherEvents.push({ day, from: previousWeather, to: state.weather });
                previousWeather = state.weather;
            }

            const climateState = seasonalState(day, climate);
            const trees = {};
            for (const kind of species) {
                const samples = treeSeeds.map(seedValue => foliageState(day, {
                    seed: seedValue,
                    species: kind,
                    climate,
                }));
                trees[kind] = {
                    leaf: round(average(samples.map(sample => sample.leaf))),
                    turn: round(average(samples.map(sample => sample.turn))),
                    snow: round(average(samples.map(sample => sample.snow))),
                    bare: samples.filter(sample => sample.bare).length,
                    holding: samples.filter(sample => sample.holding).length,
                };
            }

            days.push({
                day,
                season: climateState.season,
                weather: state.weather,
                weatherTimer: state.weatherTimer,
                snowCover: round(climateState.snowCover),
                foliageTurn: round(climateState.foliageTurn),
                trees,
            });
        }

        const weatherCounts = days.reduce((counts, entry) => {
            counts[entry.weather] = (counts[entry.weather] || 0) + 1;
            return counts;
        }, {});
        const summerSnowDays = days.filter(entry => entry.day >= 100 && entry.day < 200 && entry.weather === "snow").length;
        const winterSnowDays = days.filter(entry => entry.day >= 300 && entry.day < 400 && entry.weather === "snow").length;
        const firstBroadleafBare = days.find(entry => entry.day >= 250 && entry.trees.broadleaf.bare === treeSeeds.length)?.day ?? null;
        const coniferBareDays = days.filter(entry => entry.trees.conifer.bare > 0).length;
        const oakHoldingDays = days.filter(entry => entry.trees.oak.holding > 0).length;

        const climates = ["temperate", "northern", "mediterranean", "arid", "enchanted"].map(name => {
            let maxSnow = 0;
            let autumnFirstSnow = null;
            let springLastSnow = null;
            let summerSnowDays = 0;
            let broadleafBareDay = null;
            let oakHoldingDays = 0;
            let coniferSnowAtMelt = 0;
            let birchSnowAtMelt = 0;

            for (let day = 0; day < 400; day++) {
                const stateAtDay = seasonalState(day, name);
                maxSnow = Math.max(maxSnow, stateAtDay.snowCover);
                if (stateAtDay.snowCover > 0.02) {
                    if (day >= 200 && autumnFirstSnow === null) autumnFirstSnow = day;
                    if (day < 200) springLastSnow = day;
                }
                if (day >= 100 && day < 200 && stateAtDay.snowCover > 0.02) summerSnowDays++;

                const broadleaf = foliageState(day, { seed: 0.5, species: "broadleaf", climate: name });
                if (day >= 250 && broadleaf.bare && broadleafBareDay === null) broadleafBareDay = day;
                const oak = foliageState(day, { seed: 0.5, species: "oak", climate: name });
                if (oak.holding) oakHoldingDays++;
                if (day === 30) {
                    coniferSnowAtMelt = foliageState(day, { seed: 0.5, species: "conifer", climate: name }).snow;
                    birchSnowAtMelt = foliageState(day, { seed: 0.5, species: "birch", climate: name }).snow;
                }
            }

            return {
                climate: name,
                maxSnow: round(maxSnow),
                autumnFirstSnow,
                springLastSnow,
                summerSnowDays,
                broadleafBareDay,
                oakHoldingDays,
                meltDay30: { coniferSnow: round(coniferSnowAtMelt), birchSnow: round(birchSnowAtMelt) },
            };
        });

        return {
            seed: Number(state.worldSeed) || seed,
            climate,
            generatedAt: new Date().toISOString(),
            summary: {
                days: days.length,
                weatherCounts,
                weatherChanges: weatherEvents.length,
                summerSnowDays,
                winterSnowDays,
                firstBroadleafBare,
                coniferBareDays,
                oakHoldingDays,
            },
            weatherEvents,
            climates,
            days,
        };
    }, { seed, species, treeSeeds });

    const summary = report.summary;
    console.log("Climate comparison: " + JSON.stringify(report.climates.map(entry => ({
        climate: entry.climate,
        maxSnow: entry.maxSnow,
        autumnFirstSnow: entry.autumnFirstSnow,
        springLastSnow: entry.springLastSnow,
        summerSnowDays: entry.summerSnowDays,
    }))));
    const failures = [];
    if (report.days.length !== 400) failures.push("expected 400 days, got " + report.days.length);
    if (summary.summerSnowDays !== 0) failures.push("summer had " + summary.summerSnowDays + " snow days");
    if (!summary.weatherCounts.snow) failures.push("the year had no snowfall at all");
    if (summary.weatherChanges < 20) failures.push("weather changed only " + summary.weatherChanges + " times");
    if (summary.coniferBareDays !== 0) failures.push("conifers were bare on " + summary.coniferBareDays + " days");
    if (summary.oakHoldingDays === 0) failures.push("oaks never held leaves into winter");
    if (summary.firstBroadleafBare === null) failures.push("broadleaf trees never went bare");
    const northern = report.climates.find(entry => entry.climate === "northern");
    const arid = report.climates.find(entry => entry.climate === "arid");
    const temperate = report.climates.find(entry => entry.climate === "temperate");
    if (!northern || northern.springLastSnow === null || northern.springLastSnow <= temperate.springLastSnow) failures.push("northern snow does not melt later");
    if (!northern || northern.autumnFirstSnow === null || northern.autumnFirstSnow >= temperate.autumnFirstSnow) failures.push("northern snow does not arrive earlier");
    if (!arid || arid.maxSnow >= temperate.maxSnow) failures.push("arid climate does not hold less snow");
    if (!arid || arid.summerSnowDays !== 0) failures.push("arid summer carries snow cover");
    if (failures.length) throw new Error("Season audit failed:\n" + failures.join("\n"));

    await fs.writeFile(outputPath, JSON.stringify(report, null, 2) + "\n");
    if (diagnostics.length) throw new Error("Browser diagnostics were emitted:\n" + diagnostics.join("\n"));

    console.log("Climate: " + report.climate + " · seed " + report.seed);
    console.log("Weather: " + JSON.stringify(summary.weatherCounts) + " · " + summary.weatherChanges + " changes");
    console.log("Summer snow days: " + summary.summerSnowDays + " · winter snow days: " + summary.winterSnowDays);
    console.log("First broadleaf bare day: " + summary.firstBroadleafBare + " · oak holding days: " + summary.oakHoldingDays + " · conifer bare days: " + summary.coniferBareDays);
    for (const climate of report.climates) {
        console.log(climate.climate + ": max snow " + climate.maxSnow + " · autumn first " + climate.autumnFirstSnow + " · spring last " + climate.springLastSnow + " · broadleaf bare " + climate.broadleafBareDay + " · melt day 30 conifer/birch " + climate.meltDay30.coniferSnow + "/" + climate.meltDay30.birchSnow);
    }
    console.log("Year log: " + path.relative(gameRoot, outputPath));
} finally {
    await browser.close().catch(() => {});
    await new Promise(resolve => server.close(resolve));
}
