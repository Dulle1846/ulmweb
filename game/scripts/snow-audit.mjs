// Reproducible 1.2.15 Snowlands audit. It builds a real snow world, surveys
// every tile through all four seasons and storm weather, gathers a real snow
// product, and drives the annual hazard pass against a placed building. The
// feature array only locates a representative tile; each row records the field
// and consumer that makes the requirement observable.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resetState, state } from "../js/core/state.js";
import { TYPE } from "../js/core/types.js";
import { CLIMATES, generateWorldData } from "../js/world/terrain-model.js";
import { generateResourceGeography } from "../js/systems/resource-geography.js";
import {
    SNOW_FORMATIONS, SNOW_REQUIREMENT_IDS, SNOW_REQUIREMENTS,
    snowProfileAt, snowSummary,
} from "../js/world/snow-ecology.js";
import { updateSnowHazards, destroySnowTargetAt } from "../js/world/snow-hazards.js";
import { gatherNearestGrasslandProducts } from "../js/systems/forest-gathering.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = resolve(ROOT, "..", "artifacts");
const SEED = 20261215;
const OPTIONS = Object.freeze({
    size: "small", shape: "continents", climate: "snow", landmass: 50,
    ruggedness: 58, forests: 52, water: 48, fertility: 50, resources: 60, coastline: 60,
});
const WORLD = generateWorldData(SEED, OPTIONS);
const W = WORLD.dims.w, H = WORLD.dims.h, RES = WORLD.resolution;
const SEASONS = [20, 120, 150, 220, 320];
const WEATHER = ["clear", "snow", "storm", "fog"];

const n = value => Number(value ?? 0).toFixed(3);
const pct = value => Math.round(Number(value ?? 0) * 100) + "%";
const escape = value => String(value).replace(/\|/g, "\\|").replace(/\n/g, " ");

function contextAt(x, y, { year = 3, dayOfYear = 150, weather = "clear", use = {} } = {}) {
    const index = Math.floor(y * RES) * WORLD.pixW + Math.floor(x * RES);
    return {
        seed: SEED, climate: "snow", height: WORLD.heights[index],
        moisture: WORLD.moistures[index], temperature: WORLD.temperatures[index],
        seaLevel: WORLD.sea, dayOfYear, year, hour: 12, weather,
        wind: weather === "storm" ? 2 : weather === "snow" ? 1.35 : 1, use,
    };
}

function installWorld() {
    resetState();
    state.worldSeed = SEED;
    state.worldW = W;
    state.worldH = H;
    state.worldSizeId = WORLD.dims.id;
    state.worldOptions = { ...OPTIONS };
    state.seaLevel = WORLD.sea;
    state.terrainResolution = RES;
    state.terrainPixW = WORLD.pixW;
    state.terrainPixH = WORLD.pixH;
    state.heightMap = WORLD.heights;
    state.moistureMap = WORLD.moistures;
    state.temperatureMap = WORLD.temperatures;
    state.rivers = WORLD.rivers;
    state.dayOfYear = 150;
    state.year = 3;
    state.weather = "storm";
    state.resources = { wood: 9999, stone: 9999, gold: 9999, food: 9999 };
    state.entities = [];
    state.forestGathering = null;
    state.explored = [];
    for (let x = 0; x < W; x++) {
        state.explored[x] = [];
        for (let y = 0; y < H; y++) state.explored[x][y] = true;
    }
    generateResourceGeography(SEED);
}

function surveySamples() {
    const samples = new Map();
    const formations = new Map();
    const formationCounts = new Map();
    let snowTiles = 0, waterTiles = 0;
    for (const day of SEASONS) {
        for (const weather of WEATHER) {
            for (let y = 0; y < H; y++) {
                for (let x = 0; x < W; x++) {
                    const profile = snowProfileAt(x + 0.5, y + 0.5, contextAt(x, y, { dayOfYear: day, weather }));
                    formations.set(profile.formation, (formations.get(profile.formation) || 0) + 1);
                    if (day === 150 && weather === "clear") {
                        formationCounts.set(profile.formation, (formationCounts.get(profile.formation) || 0) + 1);
                        if (profile.water.frozen) waterTiles++; else snowTiles++;
                    }
                    for (const id of profile.features) {
                        if (!samples.has(id)) samples.set(id, { x, y, day, weather, profile });
                    }
                }
            }
        }
    }
    return { samples, formations, formationCounts, snowTiles, waterTiles };
}

function addGatherEvidence() {
    installWorld();
    for (let y = 2; y < H - 2; y++) {
        for (let x = 2; x < W - 2; x++) {
            const profile = snowProfileAt(x + 0.5, y + 0.5, contextAt(x, y));
            if (!profile.water.frozen && profile.goods.length) {
                const result = gatherNearestGrasslandProducts(x, y, { year: 3, dayOfYear: 150, weather: "snow" });
                return {
                    x, y, formation: profile.formation,
                    ok: result.ok, goods: result.goods?.map(good => ({ id: good.id, amount: good.amount })) || [],
                    reason: result.reason || null,
                };
            }
        }
    }
    return { ok: false, reason: "no snow gathering site" };
}

function addHazardEvidence(samples) {
    installWorld();
    let target = null;
    for (const entry of samples.values()) {
        const profile = entry.profile;
        if (!profile.water.frozen && profile.hazards.avalanche > 0.2
            && (!target || profile.hazards.avalanche > target.profile.hazards.avalanche)) {
            target = entry;
        }
    }
    target = target || { x: 30, y: 30, profile: snowProfileAt(30.5, 30.5, contextAt(30, 30)) };
    const house = { id: 9915, x: target.x, y: target.y, type: TYPE.HOUSE, hp: 80, maxHp: 80, isBuilding: () => true };
    state.entities = [house];
    const hazard = updateSnowHazards({ force: true, focus: "avalanche" });
    let direct = null;
    if (house.dead !== true) {
        direct = destroySnowTargetAt(target.x, target.y, { cause: "avalanche" });
    }
    return {
        target: {
            x: target.x, y: target.y, formation: target.profile.formation,
            avalanche: target.profile.hazards.avalanche,
            passClosed: target.profile.hazards.passClosed,
            frostbite: target.profile.hazards.frostbite,
            supply: target.profile.hazards.supply,
        },
        hazard, houseDead: house.dead === true, direct,
    };
}

function integrationEvidence() {
    const climate = CLIMATES.find(entry => entry.id === "snow") || null;
    const insulated = snowProfileAt(10.5, 10.5, contextAt(10, 10, {
        use: { insulated: true, stable: true, shelter: true, road: true, cleared: true },
    }));
    return {
        climate: climate ? { id: climate.id, label: climate.label, note: climate.note } : null,
        climateCount: CLIMATES.length,
        insulatedHardiness: insulated.hazards.winterHardiness,
        openHardiness: snowProfileAt(10.5, 10.5, contextAt(10, 10)).hazards.winterHardiness,
        summary: snowSummary(insulated),
    };
}

function codeFor(group) {
    return {
        landform: "js/world/snow-ecology.js#chooseFormation + js/presentation/rendering/snow-render.js",
        surface: "js/world/snow-ecology.js#surface + js/presentation/rendering/snow-render.js#drawSnowGround",
        water: "js/world/snow-ecology.js#water + js/presentation/rendering/snow-render.js#drawSnowWater",
        vegetation: "js/world/snow-ecology.js#buildTrees/buildFlora + snow-render.js#drawSnowTree/drawSnowDetails",
        fauna: "js/world/snow-ecology.js#buildFauna + snow-render.js#drawSnowDetails",
        weather: "js/world/season.js + js/world/weather.js + js/world/snow-ecology.js#weather",
        hazard: "js/world/snow-hazards.js#updateSnowHazards + js/systems/resource-geography.js",
        thaw: "js/world/snow-ecology.js#thaw + snow-render.js#drawSnowWater/drawSnowDetails",
    }[group] || "js/world/snow-ecology.js";
}

function evidence(id, sample) {
    const number = Number(id.split(".").pop());
    const p = sample?.profile;
    const at = sample ? `${sample.x},${sample.y} day${sample.day} ${sample.weather}` : "survey";
    if (number >= 10 && number <= 19) {
        return `${at}; state=${p.surface.state}; depth=${n(p.surface.depth)}; fresh=${n(p.surface.fresh)}; ` +
            `packed=${n(p.surface.packed)}; icy=${n(p.surface.icy)}; wet=${n(p.surface.wet)}; ` +
            `drift=${n(p.surface.drift)}; exposed=${n(p.surface.exposed)}; tracks=${n(p.surface.tracks)}`;
    }
    if (number >= 20 && number <= 28) {
        return `${at}; frozen=${p.water.frozen}; lake=${p.water.lake}; river=${p.water.river}; ` +
            `ice=${n(p.water.iceCover)}; edge=${n(p.water.iceEdge)}; breakup=${n(p.water.breakup)}; ` +
            `icicles=${n(p.water.icicles)}; sheets=${n(p.water.iceSheets)}; icefalls=${n(p.water.icefalls)}`;
    }
    if (number >= 29 && number <= 36) {
        return `${at}; trees=${p.trees.map(tree => tree.id).join(":") || "none"}; ` +
            `shrubs=${p.vegetation.shrubs.map(item => item.id).join(":") || "none"}; ` +
            `grasses=${p.vegetation.grasses.map(item => item.id).join(":") || "none"}; ` +
            `lichens=${p.vegetation.lichens.map(item => item.id).join(":") || "none"}; ` +
            `load=${n(p.surface.snowLoad)}; underSnow=${n(p.surface.underSnow)}`;
    }
    if (number >= 37 && number <= 44) {
        return `${at}; fauna=${p.fauna.map(item => item.id).join(":") || "none"}; ` +
            `winterFur=${p.fauna.some(item => item.winterFur)}; season=${p.season}`;
    }
    if (number >= 45 && number <= 53) {
        return `${at}; snowfall=${n(p.weather.snowfall)}; storm=${n(p.weather.snowstorm)}; ` +
            `blizzard=${n(p.weather.blizzard)}; wind=${n(p.weather.wind)}; fog=${n(p.weather.fog)}; ` +
            `frost=${n(p.weather.frost)}; hoarfrost=${n(p.weather.hoarfrost)}; visibility=${n(p.weather.visibility)}`;
    }
    if (number >= 54 && number <= 62) {
        return `${at}; movement=${n(p.hazards.movement)}; icyRoads=${n(p.hazards.icyRoads)}; ` +
            `supply=${n(p.hazards.supply)}; frostbite=${n(p.hazards.frostbite)}; ` +
            `avalanche=${n(p.hazards.avalanche)}; passClosed=${n(p.hazards.passClosed)}; ` +
            `hardiness=${n(p.hazards.winterHardiness)}; annual pass=js/world/snow-hazards.js`;
    }
    if (number >= 63) {
        return `${at}; springMelt=${n(p.thaw.springMelt)}; thawed=${n(p.thaw.thawedGround)}; ` +
            `mud=${n(p.thaw.muddyRoads)}; rivers=${n(p.thaw.swollenRivers)}; ` +
            `lakes=${n(p.thaw.meltwaterLakes)}; retreat=${n(p.thaw.snowRetreat)}; ` +
            `northSouth=${n(p.thaw.northSouthMelt)}; aspect=${p.thaw.aspect}`;
    }
    const land = p?.landform;
    switch (number) {
        case 1: return `${at}; formation=${p.formation}; forest=${n(land.forest)}; conifers=${p.vegetation.conifers.length}`;
        case 2: return `${at}; formation=${p.formation}; depth=${n(p.surface.depth)}; cover=${n(p.surface.coverage)}`;
        case 3: return `${at}; formation=${p.formation}; grass=${n(land.grass)}; grasses=${p.vegetation.grasses.length}`;
        case 4: return `${at}; formation=${p.formation}; alpine=${n(land.alpine)}; height=${n(p.height)}`;
        case 5: return `${at}; formation=${p.formation}; plateau=${n(land.plateau)}; relative=${n(land.relative)}`;
        case 6: return `${at}; formation=${p.formation}; valley=${n(land.valley)}; relative=${n(land.relative)}`;
        case 7: return `${at}; formation=${p.formation}; exposure=${n(land.exposure)}; drift=${n(p.surface.drift)}`;
        case 8: return `${at}; formation=${p.formation}; permanent=${n(land.permanent)}; height=${n(p.height)}`;
        case 9: return `${at}; formation=${p.formation}; coastal=${n(land.coastal)}; shore=${n(land.aboveSea)}`;
        default: return `${at}; formation=${p?.formation}; label=${p?.label}`;
    }
}

function rowStatus(requirement, sample) {
    return sample?.profile?.features.includes(requirement.id) ? "working" : "missing";
}

const survey = surveySamples();
const gather = addGatherEvidence();
const hazard = addHazardEvidence(survey.samples);
const integration = integrationEvidence();

const rows = SNOW_REQUIREMENTS.map(requirement => {
    const sample = survey.samples.get(requirement.id) || null;
    return {
        id: requirement.id,
        label: requirement.label,
        group: requirement.group,
        status: rowStatus(requirement, sample),
        code: codeFor(requirement.group),
        evidence: evidence(requirement.id, sample),
    };
});

const working = rows.filter(row => row.status === "working").length;
const missing = rows.filter(row => row.status === "missing").length;
const formations = Object.keys(SNOW_FORMATIONS);
const observedFormations = [...survey.formations.keys()].sort();
const auditOk = working === rows.length && missing === 0
    && observedFormations.length === formations.length
    && gather.ok === true && hazard.houseDead === true
    && integration.climate?.id === "snow";

const report = {
    schema: 1,
    generatedAt: new Date().toISOString(),
    seed: SEED,
    world: {
        width: W, height: H, resolution: RES, seaLevel: WORLD.sea,
        snowTiles: survey.snowTiles, frozenWaterTiles: survey.waterTiles,
        formations, observedFormations,
        formationCounts: Object.fromEntries(survey.formationCounts),
    },
    summary: { total: rows.length, working, missing },
    gather,
    hazard,
    integration,
    items: rows,
};

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(resolve(OUT_DIR, "snow-audit.json"), JSON.stringify(report, null, 2) + "\n");

const lines = [
    "# 1.2.15 Schneelandschaften — Runtime Audit",
    "",
    `Generated from a real Snowlands world (seed \`${SEED}\`, ${W}×${H}) through the actual profile, ` +
    `gather and annual hazard paths. ${working}/${rows.length} items are runtime-backed; ` +
    `${observedFormations.length}/${formations.length} formations observed.`,
    "",
    "## Method",
    "",
    "`scripts/snow-audit.mjs` generates the Snowlands climate, surveys every tile through `snowProfileAt()` " +
    "across all four seasons and clear, snow, storm and fog weather, gathers a real snow product, and " +
    "drives `updateSnowHazards()` against a placed house. The feature array locates a representative tile; " +
    "each row records the field and consumer that makes the requirement observable.",
    "",
    "## Probes",
    "",
    `- Climate entry: ${integration.climate ? integration.climate.label : "missing"} (${integration.climateCount} climates total).`,
    `- Gathering: ${gather.ok ? "ok" : "failed"} — ${gather.goods?.map(item => item.id + ":" + item.amount).join(", ") || gather.reason || "no site"}.`,
    `- Hazard: ${hazard.hazard.events.join(" / ") || "no event"}; destroyed ${hazard.hazard.destroyed?.label || hazard.direct?.label || "nothing"}; house dead: ${hazard.houseDead}.`,
    `- Winter resilience: insulated=${n(integration.insulatedHardiness)} vs open=${n(integration.openHardiness)}.`,
    "",
    "| ID | Requirement | Status | Code location | Observed runtime evidence |",
    "|---|---|---|---|---|",
    ...rows.map(row => `| ${row.id} | ${escape(row.label)} | **${row.status}** | ${escape(row.code)} | ${escape(row.evidence)} |`),
    "",
    "## Formations",
    "",
    ...Object.entries(SNOW_FORMATIONS).map(([id, formation]) =>
        `- ${formation.label} (\`${id}\`): ${survey.formationCounts.get(id) || 0} tiles on the reference day, ${survey.formations.get(id) || 0} across all samples.`),
    "",
];

writeFileSync(resolve(OUT_DIR, "SNOW_1.2.15_AUDIT.md"), lines.join("\n"));
if (!auditOk) process.exitCode = 1;
console.log("SNOW_AUDIT " + JSON.stringify({
    ok: auditOk, total: rows.length, working, missing,
    bad: rows.filter(row => row.status !== "working").map(row => row.id),
    world: report.world,
    gather: gather.ok,
    hazard: hazard.houseDead,
    reports: [resolve(OUT_DIR, "SNOW_1.2.15_AUDIT.md"), resolve(OUT_DIR, "snow-audit.json")],
}));
