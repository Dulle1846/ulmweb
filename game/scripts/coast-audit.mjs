// Reproducible 1.2.14 coastal audit. It generates a real Coastlands world,
// surveys every tile through all four seasons, builds every coastal work
// through the actual player path, gathers a coastal product, and drives the
// real annual hazard pass until a building is destroyed. The feature list is
// only an index; every row also records the field values and consumer that make
// the requirement observable.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resetState, state } from "../js/core/state.js";
import { TYPE } from "../js/core/types.js";
import { generateWorldData } from "../js/world/terrain-model.js";
import { generateResourceGeography } from "../js/systems/resource-geography.js";
import {
    COAST_FORMATIONS, COAST_REQUIREMENTS, coastProfileAt,
} from "../js/world/coast-ecology.js";
import { COAST_WORKS, COAST_WORK_IDS } from "../js/world/coast-works.js";
import { updateCoastHazards } from "../js/world/coast-hazards.js";
import {
    coastWorkAvailability, gatherNearestGrasslandProducts, performCoastWork,
} from "../js/systems/forest-gathering.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = resolve(ROOT, "..", "artifacts");
const SEED = 20261214;
const OPTIONS = Object.freeze({
    size: "small", shape: "coast", climate: "coastal", landmass: 50,
    ruggedness: 55, forests: 52, water: 48, fertility: 55, resources: 50, coastline: 65,
});
const WORLD = generateWorldData(SEED, OPTIONS);
const W = WORLD.dims.w, H = WORLD.dims.h, RES = WORLD.resolution;
const SEASONS = [50, 150, 250, 350];

const n = value => Number(value ?? 0).toFixed(3);
const pct = value => Math.round(Number(value ?? 0) * 100) + "%";
const escape = value => String(value).replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/[\r\n]+/g, " ");

function contextAt(x, y, { year = 3, dayOfYear = 150, use = {} } = {}) {
    const index = Math.floor(y * RES) * WORLD.pixW + Math.floor(x * RES);
    return {
        seed: SEED, climate: "coastal", height: WORLD.heights[index],
        moisture: WORLD.moistures[index], temperature: WORLD.temperatures[index],
        seaLevel: WORLD.sea, dayOfYear, year, hour: 12, weather: "clear", wind: 1.2, use,
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
    state.coastWorks = null;
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
    const formations = new Set();
    let coastalTiles = 0;
    for (const day of SEASONS) {
        for (let y = 0; y < H; y++) {
            for (let x = 0; x < W; x++) {
                const profile = coastProfileAt(x + 0.5, y + 0.5, contextAt(x, y, { dayOfYear: day }));
                if (day === 150 && profile.coastal) coastalTiles++;
                if (day === 150) formations.add(profile.formation);
                for (const id of profile.features) {
                    if (!samples.has(id)) samples.set(id, { x, y, day, profile });
                }
            }
        }
    }
    return { samples, formations, coastalTiles };
}

function addWorkEvidence() {
    installWorld();
    const results = {};
    const byRequirement = {};
    let foundCount = 0;
    for (const [kind, definition] of Object.entries(COAST_WORKS)) {
        let found = null;
        for (let y = 1; y < H - 1 && !found; y++) {
            for (let x = 1; x < W - 1; x++) {
                const availability = coastWorkAvailability(x, y, { year: 3, dayOfYear: 150 });
                if (availability.ok && availability.works[kind]?.ok) {
                    found = { x, y, availability };
                    break;
                }
            }
        }
        if (!found) {
            results[kind] = { ok: false, reason: "no site" };
            byRequirement[definition.requirement] = results[kind];
            continue;
        }
        const result = performCoastWork(found.x, found.y, kind, { year: 3, dayOfYear: 150 });
        results[kind] = {
            ok: result.ok, x: found.x, y: found.y,
            label: found.availability.profile.label,
            formation: found.availability.profile.formation,
            goods: result.goods?.map(good => ({ id: good.id, amount: good.amount })) || [],
            reason: result.reason || null,
        };
        byRequirement[definition.requirement] = results[kind];
        foundCount += result.ok ? 1 : 0;
    }
    const workProfile = coastProfileAt(99.5, 8.5, {
        ...contextAt(99, 8, { dayOfYear: 150 }),
        use: Object.fromEntries(COAST_WORK_IDS.map(id => [id, true])),
    });
    return {
        results, byRequirement, foundCount,
        profile: {
            x: workProfile.x, y: workProfile.y, formation: workProfile.formation,
            harbour: workProfile.workPotential.harbour,
            features: workProfile.features,
            strategicControl: workProfile.features.includes("1.2.14.63"),
        },
    };
}

function addGatherEvidence() {
    installWorld();
    let site = null;
    for (let y = 2; y < H - 2 && !site; y++) {
        for (let x = 2; x < W - 2; x++) {
            const profile = coastProfileAt(x + 0.5, y + 0.5, contextAt(x, y));
            if (profile.coastal && !profile.water.sea && profile.goods.length) {
                site = { x, y, profile };
                break;
            }
        }
    }
    if (!site) return null;
    const result = gatherNearestGrasslandProducts(site.x, site.y, { year: 3, dayOfYear: 150 });
    return {
        x: site.x, y: site.y, formation: site.profile.formation,
        ok: result.ok, goods: result.goods?.map(good => ({ id: good.id, amount: good.amount })) || [],
        reason: result.reason || null,
    };
}

function addHazardEvidence(samples) {
    installWorld();
    let target = null;
    for (const entry of samples.values()) {
        if (entry.profile.coastal && entry.profile.hazards.damage > 0.26) {
            target = entry;
            break;
        }
    }
    target = target || { x: 99, y: 8, profile: coastProfileAt(99.5, 8.5, contextAt(99, 8)) };
    const house = { id: 9914, x: target.x, y: target.y, type: TYPE.HOUSE, hp: 80, maxHp: 80, isBuilding: () => true };
    state.entities = [house];
    const hazard = updateCoastHazards({ force: true, focus: "surge" });
    return {
        target: {
            x: target.x, y: target.y, formation: target.profile.formation,
            damage: target.profile.hazards.damage,
            flood: target.profile.hazards.flood,
            erosion: target.profile.hazards.erosion,
        },
        hazard, houseDead: house.dead === true,
    };
}

const survey = surveySamples();
const workRun = addWorkEvidence();
const gather = addGatherEvidence();
const hazard = addHazardEvidence(survey.samples);

function codeFor(group) {
    return {
        landform: "js/world/coast-ecology.js#coastProfileAt + js/presentation/rendering/coast-render.js",
        beach: "js/world/coast-ecology.js#coastProfileAt + js/presentation/rendering/coast-render.js#drawCoastGround",
        vegetation: "js/world/coast-ecology.js#buildFlora + js/presentation/rendering/coast-render.js#drawCoastTrees",
        fauna: "js/world/coast-ecology.js#buildFauna + js/presentation/rendering/coast-render.js#drawCoastDetails",
        resources: "js/world/coast-ecology.js#buildGoods/coastProductsAt + js/systems/forest-gathering.js",
        weather: "js/world/coast-ecology.js#coastProfileAt + js/world/weather.js + js/world/season.js",
        works: "js/world/coast-works.js + js/systems/forest-gathering.js#performCoastWork",
        hazards: "js/world/coast-hazards.js#updateCoastHazards",
        succession: "js/world/coast-ecology.js#coastProfileAt + js/world/coast-hazards.js",
    }[group] || "js/world/coast-ecology.js";
}

function evidence(id, sample) {
    const number = Number(id.split(".").pop());
    const p = sample?.profile;
    const at = sample ? `${sample.x},${sample.y} day${sample.day}` : "worksite";
    if (number >= 54 && number <= 62) {
        const work = workRun.byRequirement[id];
        return `work=${work?.label || "missing"} at ${work?.x ?? "?"},${work?.y ?? "?"}; ` +
            `built=${work?.ok === true}; goods=${work?.goods?.map(item => item.id + ":" + item.amount).join(",") || "structural only"}`;
    }
    if (number === 63) {
        return `${at}; naturalHarbour=${n(p?.landform?.harbour)}; ` +
            `works=${workRun.foundCount}/9; strategicControl=${workRun.profile.strategicControl}; ` +
            `coastProfileAt use flags -> feature 1.2.14.63`;
    }
    if (number === 69) {
        return `target=${hazard.target.x},${hazard.target.y}; damage=${n(hazard.target.damage)}; ` +
            `surge=${n(hazard.hazard?.surge?.value)}; events=${(hazard.hazard?.events || []).join(" / ")}; ` +
            `destroyed=${hazard.hazard?.destroyed?.label || "none"}; dead=${hazard.houseDead}`;
    }
    const land = p?.landform;
    switch (number) {
        case 1: return `${at}; formation=${p.formation}; sand=${n(land.sand)}; drawCoastGround`;
        case 2: return `${at}; formation=${p.formation}; shingle=${n(land.shingle)}; drawCoastGround`;
        case 3: return `${at}; formation=${p.formation}; rock=${n(land.rock)}; drawCoastGround`;
        case 4: return `${at}; formation=${p.formation}; cliff=${n(land.cliff)}; drawCoastGround`;
        case 5: return `${at}; formation=${p.formation}; marsh=${n(land.marsh)}; drawCoastGround`;
        case 6: return `${at}; formation=${p.formation}; dune=${n(land.dune)}; drawCoastGround`;
        case 7: return `${at}; formation=${p.formation}; lagoon=${n(land.lagoon)}; drawWater`;
        case 8: return `${at}; formation=${p.formation}; tidal=${n(land.tidal)}; drawTidal`;
        case 9: return `${at}; formation=${p.formation}; fjord=${n(land.fjord)}; drawCoastGround`;
        case 10: return `${at}; formation=${p.formation}; delta=${n(land.delta)}; drawCoastGround`;
        case 11: return `${at}; grasses=${p.vegetation.grasses.map(item => item.id).join(":")}; drawCoastDetails`;
        case 12: return `${at}; grasses=${p.vegetation.grasses.map(item => item.id).join(":")}; shrubs=${p.vegetation.shrubs.map(item => item.id).join(":")}; drawCoastDetails`;
        case 13: return `${at}; shrubs=${p.vegetation.shrubs.map(item => item.id).join(":")}; drawCoastTrees`;
        case 14: return `${at}; salt=${n(p.soil.salt)}; stage=${p.vegetation.stage}; drawCoastDetails`;
        case 15: return `${at}; trees=${p.trees.map(item => item.id).join(":")}; drawCoastTrees`;
        case 16: return `${at}; grasses=${p.vegetation.grasses.map(item => item.id).join(":")}; stage=${p.vegetation.stage}`;
        case 17: return `${at}; formation=${p.formation}; saltMeadow=${p.vegetation.grasses.some(item => item.id === "salt-meadow")}`;
        case 18: return `${at}; algae=${p.vegetation.algae.map(item => item.id).join(":")}; drawWater`;
        case 19: return `${at}; formation=${p.formation}; bay=${n(land.bay)}; drawCoastGround`;
        case 20: return `${at}; formation=${p.formation}; harbour=${n(land.harbour)}; drawCoastGround`;
        case 21: return `${at}; formation=${p.formation}; delta=${n(land.delta)}; drawCoastGround`;
        case 22: return `${at}; tidal=${n(land.tidal)}; tide=${n(p.tide.level)}; drawTidal`;
        case 23: return `${at}; formation=${p.formation}; lagoon=${n(land.lagoon)}; drawWater`;
        case 24: return `${at}; outcrop=${n(land.outcrop)}; rock=${n(land.rock)}; drawCoastGround`;
        case 25: return `${at}; formation=${p.formation}; island=${n(land.island)}; drawCoastGround`;
        case 26: return `${at}; formation=${p.formation}; sandbank=${n(land.sandbank)}; drawWater`;
        case 27: return `${at}; formation=${p.formation}; reef=${n(land.reef)}; drawWater`;
        case 28: return `${at}; shallow=${p.water.sea && p.landform.waterDepth < 0.06}; depth=${n(p.landform.waterDepth)}; drawWater`;
        case 29: return `${at}; fauna=${p.fauna.filter(item => item.group === "seabird").map(item => item.id).join(":")}; drawCoastDetails`;
        case 30: return `${at}; fauna=${p.fauna.filter(item => item.group === "marine-mammal").map(item => item.id).join(":")}; drawCoastDetails`;
        case 31: return `${at}; fauna=${p.fauna.filter(item => item.group === "wader").map(item => item.id).join(":")}; drawCoastDetails`;
        case 32: return `${at}; fish=${n(p.economy.fish)}; goods=${p.goods.filter(item => item.id === "fish").map(item => item.id).join(":")}`;
        case 33: return `${at}; crustaceans=${p.fauna.filter(item => item.group === "crustacean" || item.group === "shellfish").map(item => item.id).join(":")}; goods=${p.goods.filter(item => ["shellfish", "mussels"].includes(item.id)).map(item => item.id).join(":")}`;
        case 34: return `${at}; turtle=${p.fauna.some(item => item.id === "turtle")}; temperature=${n(p.temperature)}`;
        case 35: return `${at}; predators=${p.fauna.filter(item => item.group === "predator").map(item => item.id).join(":")}; drawFauna`;
        case 36: return `${at}; migratory=${p.fauna.filter(item => item.group === "migratory").map(item => item.id).join(":")}; season=${p.season}`;
        case 37: return `${at}; fish=${n(p.economy.fish)}; goods=${p.goods.filter(item => item.id === "fish").map(item => item.id).join(":")}`;
        case 38: return `${at}; shellfish=${n(p.economy.shellfish)}; goods=${p.goods.filter(item => ["shellfish", "mussels"].includes(item.id)).map(item => item.id).join(":")}`;
        case 39: return `${at}; salt=${n(p.economy.salt)}; goods=${p.goods.filter(item => item.id === "salt").map(item => item.id).join(":")}`;
        case 40: return `${at}; seaweed=${n(p.economy.seaweed)}; algae=${p.vegetation.algae.map(item => item.id).join(":")}`;
        case 41: return `${at}; driftwood=${n(p.economy.driftwood)}; goods=${p.goods.filter(item => item.id === "driftwood").map(item => item.id).join(":")}`;
        case 42: return `${at}; minerals=${n(p.economy.minerals)}; goods=${p.goods.filter(item => item.id === "coastal-minerals").map(item => item.id).join(":")}`;
        case 43: return `${at}; trade=${n(p.economy.trade)}; goods=${p.goods.filter(item => item.id === "sea-trade-goods").map(item => item.id).join(":")}`;
        case 44: return `${at}; rare=${n(p.economy.rare)}; goods=${p.goods.filter(item => ["pearls", "amber"].includes(item.id)).map(item => item.id).join(":")}`;
        case 45: return `${at}; wind=${n(p.hazards.wind)}; wave=${n(p.landform.wave)}; drawWind`;
        case 46: return `${at}; fog=${n(p.hazards.fog)}; drawFog`;
        case 47: return `${at}; stormSurge=${n(p.hazards.stormSurge)}; flood=${n(p.hazards.flood)}; drawStorm`;
        case 48: return `${at}; waveHeightM=${n(p.hazards.waveHeightM)}; wave=${n(p.hazards.wave)}; drawWater`;
        case 49: return `${at}; tide=${n(p.tide.level)}; rangeM=${n(p.tide.rangeM)}; drawTide`;
        case 50: return `${at}; rain=${n(p.hazards.rain)}; weather=${p.visual.skyHex}; drawRain`;
        case 51: return `${at}; spray=${n(p.hazards.spray)}; salt=${n(p.soil.salt)}; drawSaltSpray`;
        case 52: return `${at}; tideChange=${n(p.hazards.tideChange)}; seasonalWater=${n(p.hazards.seasonalWater)}; drawWater`;
        case 53: return `${at}; ice=${n(p.hazards.ice)}; temperature=${n(p.temperature)}; drawIce`;
        case 64: return `${at}; storm=${n(p.hazards.stormSurge)}; flood=${n(p.hazards.flood)}; annual pass`;
        case 65: return `${at}; erosion=${n(p.hazards.erosion)}; annual pass + destroyCoastalTargetAt`;
        case 66: return `${at}; flood=${n(p.hazards.flood)}; annual pass + drawWater`;
        case 67: return `${at}; sandShift=${n(p.hazards.sandShift)}; annual pass + drawDunes`;
        case 68: return `${at}; salinisation=${n(p.hazards.salinisation)}; annual pass + drawSalt`;
        case 70: return `${at}; tide=${n(p.tide.level)}; tideChange=${n(p.hazards.tideChange)}; renderer reads level`;
        case 71: return `${at}; coastlineChange=${n(p.hazards.coastlineChange)}; longTermShift=${n(p.succession.longTermShift)}; year=${p.year}`;
        default: return `${at}; formation=${p?.formation}; group=${p ? "coastal" : "unknown"}`;
    }
}

function rowStatus(requirement, sample) {
    const number = Number(requirement.id.split(".").pop());
    if (number >= 54 && number <= 62) return workRun.byRequirement[requirement.id]?.ok ? "working" : "partial";
    if (number === 63) return workRun.profile.strategicControl ? "working" : "partial";
    if (number === 69) return hazard.houseDead ? "working" : "partial";
    return sample?.profile?.features.includes(requirement.id) ? "working" : "missing";
}

const rows = COAST_REQUIREMENTS.map(requirement => {
    const sample = survey.samples.get(requirement.id) || (Number(requirement.id.split(".").pop()) === 69
        ? { x: hazard.target.x, y: hazard.target.y, day: 150, profile: coastProfileAt(hazard.target.x + 0.5, hazard.target.y + 0.5, contextAt(hazard.target.x, hazard.target.y, { use: { settlement: true } })) }
        : null);
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
const partial = rows.filter(row => row.status === "partial").length;
const missing = rows.filter(row => row.status === "missing").length;

const report = {
    schema: 1,
    generatedAt: new Date().toISOString(),
    seed: SEED,
    world: {
        width: W, height: H, resolution: RES, seaLevel: WORLD.sea,
        coastalTiles: survey.coastalTiles, formations: Object.keys(COAST_FORMATIONS),
        observedFormations: [...survey.formations],
    },
    summary: { total: rows.length, working, partial, missing },
    works: workRun.results,
    workProfile: workRun.profile,
    gather,
    hazard,
    items: rows,
};

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(resolve(OUT_DIR, "coast-audit.json"), JSON.stringify(report, null, 2) + "\n");

const lines = [
    "# 1.2.14 Küstenregionen — Runtime Audit",
    "",
    `Generated from a real coastal world (seed \`${SEED}\`, ${W}×${H}, ` +
    `${survey.coastalTiles.toLocaleString("en-US")} coastal tiles) through the actual profile, work, gather and hazard paths. ` +
    `${working}/${rows.length} items are runtime-backed.`,
    "",
    "## Method",
    "",
    "`scripts/coast-audit.mjs` generates the Coastlands climate, surveys every tile through `coastProfileAt()` across all four seasons, " +
    "then exercises `performCoastWork()` for all nine works, `gatherNearestGrasslandProducts()` for a real sea harvest, and " +
    "`updateCoastHazards()` with a forced surge against a placed house. The feature array only locates a representative tile; " +
    "each row below records the field or downstream result that makes the requirement observable.",
    "",
    "## Works and hazard probes",
    "",
    `- Coastal works built: ${workRun.foundCount}/9, each through its own availability and resource cost.`,
    `- Strategic control feature 1.2.14.63: ${workRun.profile.strategicControl ? "present" : "missing"} on the worked harbour profile.`,
    `- Gathering: ${gather?.ok ? "ok" : "failed"} — ${gather?.goods?.map(item => item.id + ":" + item.amount).join(", ") || gather?.reason || "no site"}.`,
    `- Hazard: ${hazard.hazard.events.join(" / ") || "no event"}; destroyed ${hazard.hazard.destroyed?.label || "nothing"}; house dead: ${hazard.houseDead}.`,
    "",
    "| ID | Requirement | Status | Code location | Observed runtime evidence |",
    "|---|---|---|---|---|",
    ...rows.map(row => `| ${row.id} | ${escape(row.label)} | **${row.status}** | ${escape(row.code)} | ${escape(row.evidence)} |`),
    "",
    "## All nine works",
    "",
    "| Work | Requirement | Site | Built | Goods |",
    "|---|---|---|---|---|",
    ...Object.entries(COAST_WORKS).map(([kind, definition]) => {
        const work = workRun.results[kind];
        return `| ${escape(definition.label)} | ${definition.requirement} | ${work?.x ?? "?"},${work?.y ?? "?"} | ${work?.ok ? "yes" : "no"} | ${escape(work?.goods?.map(item => item.id + ":" + item.amount).join(", ") || "structural")} |`;
    }),
    "",
    "## Coverage",
    "",
    `Observed formations: ${[...survey.formations].map(id => COAST_FORMATIONS[id]?.label || id).join(", ")}.`,
    "",
];

writeFileSync(resolve(OUT_DIR, "COAST_1.2.14_AUDIT.md"), lines.join("\n"));
const auditOk = working === rows.length && partial === 0 && missing === 0 && gather?.ok === true && hazard.houseDead === true;
if (!auditOk) process.exitCode = 1;
console.log("COAST_AUDIT " + JSON.stringify({
    ok: auditOk, total: rows.length, working, partial, missing,
    bad: rows.filter(row => row.status !== "working").map(row => row.id),
    world: report.world,
    works: workRun.foundCount,
    gather: gather?.ok === true,
    hazard: hazard.houseDead,
    reports: [resolve(OUT_DIR, "COAST_1.2.14_AUDIT.md"), resolve(OUT_DIR, "coast-audit.json")],
}));
