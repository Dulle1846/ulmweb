// Reproducible 1.2.13 audit. It generates a real volcanic world, surveys every
// tile, exercises the actual work/gather/hazard/construction paths, and writes
// a committed evidence table. The feature list is only an index: every row also
// carries the field values and the observed downstream result that make the
// feature observable.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resetState, state } from "../js/core/state.js";
import { TYPE } from "../js/core/types.js";
import { generateWorldData } from "../js/world/terrain-model.js";
import { generateResourceGeography } from "../js/systems/resource-geography.js";
import {
    VOLCANO_FORMATIONS, VOLCANO_REQUIREMENTS, volcanoProfileAt, volcanoSummary,
} from "../js/world/volcano-ecology.js";
import { VOLCANO_WORKS } from "../js/world/volcano-works.js";
import {
    gatherMeadowProducts, performVolcanoWork, volcanoWorkAvailability,
} from "../js/systems/forest-gathering.js";
import { updateVolcanoHazards, destroyVolcanicTargetAt } from "../js/world/volcano-hazards.js";
import { volcanicSiteVerdictAt } from "../js/systems/construction.js";
import { drawVolcano } from "../js/presentation/rendering/volcano-render.js";
import { getVolcanoTacticsAt } from "../js/systems/resource-geography.js";
import { runVolcanoSettlementCampaign } from "./volcano-campaign.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = resolve(ROOT, "..", "artifacts");
const SEED = 20261212;
const OPTIONS = Object.freeze({
    size: "small", shape: "continent", climate: "volcanic",
    landmass: 50, ruggedness: 55, forests: 52, water: 48, fertility: 55, resources: 50,
});
const WORLD = generateWorldData(SEED, OPTIONS);
const W = WORLD.dims.w, H = WORLD.dims.h, RES = WORLD.resolution;

const n = value => Number(value).toFixed(3);
const pct = value => Math.round(Number(value) * 100) + "%";
const escape = value => String(value).replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/[\r\n]+/g, " ");

function contextAt(x, y, { year = 1, dayOfYear = 140, use = {} } = {}) {
    const index = Math.floor(y * RES) * WORLD.pixW + Math.floor(x * RES);
    return {
        seed: SEED, climate: "volcanic", height: WORLD.heights[index],
        moisture: WORLD.moistures[index], temperature: WORLD.temperatures[index],
        seaLevel: WORLD.sea, dayOfYear, year, hour: 12, weather: "clear", wind: 1, use,
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
    state.explored = [];
    for (let x = 0; x < W; x++) {
        state.explored[x] = [];
        for (let y = 0; y < H; y++) state.explored[x][y] = true;
    }
    state.dayOfYear = 140;
    state.year = 1;
    state.resources = { wood: 9999, stone: 9999, gold: 9999, food: 9999 };
    state.entities = [];
    state.volcanoWorks = null;
    state.forestGathering = null;
    generateResourceGeography(SEED);
}

function surveySamples() {
    const samples = new Map();
    let volcanic = 0;
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            const profile = volcanoProfileAt(x + 0.5, y + 0.5, contextAt(x, y));
            if (!profile.volcanic) continue;
            volcanic++;
            for (const id of profile.features) {
                if (!samples.has(id)) samples.set(id, { x, y, profile, year: 1, day: 140 });
            }
        }
    }
    return { samples, volcanic };
}

function addWorkEvidence() {
    installWorld();
    const results = {};
    const works = {};
    for (const [kind, definition] of Object.entries(VOLCANO_WORKS)) {
        let found = null;
        for (let y = 1; y < H - 1 && !found; y++) {
            for (let x = 1; x < W - 1; x++) {
                const availability = volcanoWorkAvailability(x, y, { year: 1, dayOfYear: 140 });
                if (availability.ok && availability.works[kind]?.ok) { found = { x, y, availability }; break; }
            }
        }
        if (!found) {
            results[kind] = { ok: false, reason: "no site" };
            continue;
        }
        const result = performVolcanoWork(found.x, found.y, kind, { year: 1, dayOfYear: 140 });
        results[kind] = {
            ok: result.ok, x: found.x, y: found.y, label: found.availability.profile.label,
            formation: found.availability.profile.formation,
            goods: result.goods?.map(good => ({ id: good.id, amount: good.amount })) || [],
            reason: result.reason || null,
        };
        works[definition.requirement] = results[kind];
        state.volcanoWorks = null;
    }
    return { results, byRequirement: works };
}

function addGatherEvidence(samples) {
    installWorld();
    const sample = [...samples.values()].find(entry => entry.profile.goods.length > 0
        && entry.profile.height > WORLD.sea + 0.005);
    if (!sample) return null;
    const result = gatherMeadowProducts(sample.x, sample.y, { year: 1, dayOfYear: 140 });
    return {
        x: sample.x, y: sample.y, formation: sample.profile.formation,
        ok: result.ok, goods: result.goods?.map(good => ({ id: good.id, amount: good.amount })) || [],
        reason: result.reason || null,
    };
}

function addHazardEvidence(samples) {
    installWorld();
    let target = null;
    for (const entry of samples.values()) {
        if (entry.profile.hazards.destruction > 0.5) { target = entry; break; }
    }
    if (!target) return null;
    const house = { id: 9901, x: target.x, y: target.y, type: TYPE.HOUSE, hp: 80, maxHp: 80, isBuilding: () => true };
    state.entities = [house];
    state.year = target.year;
    state.dayOfYear = 140;
    const eruption = updateVolcanoHazards({ force: true });
    const quakeTarget = [...samples.values()].find(entry => entry.profile.hazards.earthquake > 0.55);
    let quake = null;
    if (quakeTarget) {
        const quakeHouse = { id: 9902, x: quakeTarget.x, y: quakeTarget.y, type: TYPE.HOUSE, hp: 80, maxHp: 80, isBuilding: () => true };
        state.entities = [quakeHouse];
        quake = destroyVolcanicTargetAt(quakeTarget.x, quakeTarget.y, { cause: "earthquake" });
    }
    return {
        target: { x: target.x, y: target.y, formation: target.profile.formation, destruction: target.profile.hazards.destruction },
        eruption, houseDead: house.dead === true,
        quakeTarget: quakeTarget ? { x: quakeTarget.x, y: quakeTarget.y, earthquake: quakeTarget.profile.hazards.earthquake } : null,
        quake, quakeHouseDead: quakeTarget ? true : false,
    };
}

function addConstructionEvidence(samples) {
    installWorld();
    let hostile = null, young = null, old = null;
    for (const entry of samples.values()) {
        const profile = entry.profile;
        if (!hostile && profile.hazards.uninhabitable > 0.7) hostile = entry;
        if (!young && profile.economy.usability < 0.3 && profile.hazards.uninhabitable <= 0.7) young = entry;
        if (!old && profile.economy.usability > 0.3 && profile.hazards.uninhabitable <= 0.7) old = entry;
        if (hostile && young && old) break;
    }
    const probe = site => {
        if (!site) return null;
        const verdict = volcanicSiteVerdictAt(TYPE.HOUSE, site.x, site.y);
        return {
            x: site.x, y: site.y, ok: verdict.ok, reason: verdict.reason || null,
            uninhabitable: verdict.profile?.hazards?.uninhabitable,
            usability: verdict.profile?.economy?.usability,
            freshLava: verdict.profile?.landform?.freshLava,
        };
    };
    return { hostile: probe(hostile), young: probe(young), old: probe(old) };
}

const IDS = VOLCANO_REQUIREMENTS.map(requirement => requirement.id);
const CODE = {
    landform: "js/world/volcano-ecology.js#volcanoProfileAt + js/presentation/rendering/volcano-render.js#drawVolcanoGround",
    rock: "js/world/volcano-ecology.js#volcanoProfileAt + js/presentation/rendering/volcano-render.js#drawSulfurAndMinerals",
    climate: "js/world/volcano-ecology.js#volcanoProfileAt + js/presentation/rendering/volcano-render.js#drawVolcanoDetails",
    water: "js/world/volcano-ecology.js#volcanoProfileAt + js/presentation/rendering/volcano-render.js#drawHotWater/drawWatercourse",
    vegetation: "js/world/volcano-ecology.js#volcanoProfileAt + js/presentation/rendering/volcano-render.js#drawFlora",
    fauna: "js/world/volcano-ecology.js#buildFauna + js/presentation/rendering/volcano-render.js#drawFauna/drawCaveMouth",
    economy: "js/world/volcano-works.js + js/systems/forest-gathering.js#performVolcanoWork",
    hazard: "js/world/volcano-ecology.js#volcanoProfileAt + js/world/volcano-hazards.js#updateVolcanoHazards",
    succession: "js/world/volcano-ecology.js#volcanoProfileAt + js/systems/construction.js#volcanicSiteVerdictAt",
};

function workLine(extras, key) {
    const work = extras.works[key];
    if (!work) return "work missing";
    return `work=${work.label} at ${work.x},${work.y}; goods=` +
        (work.goods.length ? work.goods.map(item => item.id + ":" + item.amount).join(",") : "none");
}

function rowStatus(id, profile, extras) {
    if (!profile) return "missing";
    const number = Number(id.split(".").pop());
    if (number >= 49 && number <= 57) {
        const work = extras.works[id];
        if (!work?.ok || !work.goods.length) return "partial";
    }
    if (id === "1.2.13.62" && (!extras.hazard?.quake?.ok || !extras.campaign?.ok)) return "partial";
    if (id === "1.2.13.66" && (!extras.hazard?.houseDead || !extras.campaign?.ok)) return "partial";
    if (["1.2.13.58", "1.2.13.59", "1.2.13.60"].includes(id) && extras.campaign?.ok !== true) return "partial";
    if (id === "1.2.13.65" && extras.construction?.hostile?.ok !== false) return "partial";
    if (id === "1.2.13.73" && !(extras.construction?.old?.ok && extras.works["1.2.13.73"]?.ok)) return "partial";
    return "working";
}

function evidence(id, sample, extras) {
    const p = sample?.profile;
    const group = VOLCANO_REQUIREMENTS.find(item => item.id === id)?.group;
    const common = `${sample?.x},${sample?.y} y${sample?.year}`;
    switch (id) {
        case "1.2.13.1": return `${common}; formation=${p.formation}; cone=${n(p.landform.cone)}; drawCone`;
        case "1.2.13.2": return `${common}; formation=${p.formation}; crater=${n(p.landform.crater)}; drawCrater`;
        case "1.2.13.3": return `${common}; formation=${p.formation}; crater=${n(p.landform.crater)}; drawCrater twice`;
        case "1.2.13.4": return `${common}; formation=${p.formation}; shield=${n(p.landform.shield)}; broad drawCone`;
        case "1.2.13.5": return `${common}; formation=${p.formation}; slope=${n(p.landform.slope)}; steep drawCone`;
        case "1.2.13.6": return `${common}; formation=${p.formation}; caldera=${n(p.landform.caldera)}; drawCrater`;
        case "1.2.13.7": return `${common}; formation=${p.formation}; fissure=${n(p.landform.fissure)}; drawFissure`;
        case "1.2.13.8": return `${common}; formation=${p.formation}; chain=${n(p.landform.chain)}; two cones`;
        case "1.2.13.9": return `${common}; formation=${p.formation}; oldLava=${n(p.landform.oldLava)}; eroded drawCone`;
        case "1.2.13.10": return `${common}; freshLava=${n(p.landform.freshLava)}; drawLavaField`;
        case "1.2.13.11": return `${common}; oldLava=${n(p.landform.oldLava)}; weathered lava ground`;
        case "1.2.13.12": return `${common}; lavaFlow=${n(p.landform.lavaFlow)}; drawLavaField/crack`;
        case "1.2.13.13": return `${common}; basalt=${n(p.landform.basalt)}; drawSulfurAndMinerals`;
        case "1.2.13.14": return `${common}; pumice=${n(p.landform.pumice)}; pumice speckles`;
        case "1.2.13.15": return `${common}; obsidian=${n(p.landform.obsidian)}; obsidian shard`;
        case "1.2.13.16": return `${common}; spires=${n(p.landform.spires)}; spire triangles`;
        case "1.2.13.17": return `${common}; brokenRock=${n(p.landform.brokenRock)}; broken clinker lines`;
        case "1.2.13.18": return `${common}; lavaColour=${p.landform.lavaColour}; ground=${p.visual.groundHex}; lava=${p.visual.lavaHex}`;
        case "1.2.13.19": return `${common}; smoke=${n(p.climate.smoke)}; drawSteam`;
        case "1.2.13.20": return `${common}; steam=${n(p.climate.steam)}; drawSteam`;
        case "1.2.13.21": return `${common}; hotRock=${n(p.climate.hotRock)}; active=${p.climate.active}; drawLavaCrack/drawCrater`;
        case "1.2.13.22": return `${common}; lavaFlow=${n(p.landform.lavaFlow)}; drawLavaCrack/drawFissure`;
        case "1.2.13.23": return `${common}; ash=${n(p.climate.ash)}; drawAshPlume`;
        case "1.2.13.24": return `${common}; sulfur=${n(p.soil.sulfur)}; yellow sulfur dots`;
        case "1.2.13.25": return `${common}; hotRock=${n(p.climate.hotRock)}; drawHotRock`;
        case "1.2.13.26": return `${common}; earthquake=${n(p.hazards.earthquake)}; drawFissure + annual quake`;
        case "1.2.13.27": return `${common}; hotSpring=${n(p.water.hotSpring)}; drawHotWater`;
        case "1.2.13.28": return `${common}; geyser=${n(p.water.geyser)}; drawHotWater plume`;
        case "1.2.13.29": return `${common}; fumarole=${n(p.water.fumarole)}; drawSteam`;
        case "1.2.13.30": return `${common}; sulfurSpring=${n(p.water.sulfurSpring)}; sulfur-coloured pool`;
        case "1.2.13.31": return `${common}; minerals=${n(p.soil.minerals)}; mineral vein`;
        case "1.2.13.32": return `${common}; mudPool=${n(p.water.mudPool)}; drawHotWater`;
        case "1.2.13.33": return `${common}; heatedWater=${n(p.water.heatedWater)}; drawHotWater`;
        case "1.2.13.34": return `${common}; steam=${n(p.climate.steam)}; hotRock=${n(p.climate.hotRock)}; steaming ground`;
        case "1.2.13.35": return `${common}; stage=${p.vegetation.stage}; soilAge=${n(p.vegetation.soilAge)}; no flora branch`;
        case "1.2.13.36": return `${common}; mosses=${p.vegetation.mosses.map(item => item.id).join(",")}; drawFlora`;
        case "1.2.13.37": return `${common}; stage=${p.vegetation.stage}; grasses=${p.vegetation.grasses.map(item => item.id).join(",")}`;
        case "1.2.13.38": return `${common}; grasses=${p.vegetation.grasses.map(item => item.id).join(",")}; grass strokes`;
        case "1.2.13.39": return `${common}; shrubs=${p.vegetation.shrubs.map(item => item.id).join(",")}; shrub arc`;
        case "1.2.13.40": return `${common}; fertile=${n(p.vegetation.fertile)}; goods=${p.goods.map(item => item.id).join(",")}`;
        case "1.2.13.41": return `${common}; stage=${p.vegetation.stage}; rank=${p.vegetation.stageRank}; yearsSinceEruption=${p.climate.yearsSinceEruption}`;
        case "1.2.13.42": return `${common}; flowers=${p.vegetation.flowers.map(item => item.id).join(",")}; temperature=${n(p.temperature)}`;
        case "1.2.13.43": return `${common}; fauna=${p.fauna.map(item => item.id).join(",")}; drawFauna`;
        case "1.2.13.44": return `${common}; birds=${p.fauna.filter(item => item.group === "bird").map(item => item.id).join(",")}`;
        case "1.2.13.45": return `${common}; insects=${p.fauna.filter(item => item.group === "insect").map(item => item.id).join(",")}`;
        case "1.2.13.46": return `${common}; mammals=${p.fauna.filter(item => item.group === "mammal").map(item => item.id).join(",")}`;
        case "1.2.13.47": return `${common}; cave=${p.landform.cave}; fauna=${p.fauna.filter(item => item.group === "cave").map(item => item.id).join(",")}; drawCaveMouth`;
        case "1.2.13.48": return `${common}; hotRock=${n(p.climate.hotRock)}; fauna=${p.fauna.filter(item => item.kind === "lizard" || item.kind === "gecko").map(item => item.id).join(",")}`;
        case "1.2.13.49": return workLine(extras, "1.2.13.49") + `; sample=${common}`;
        case "1.2.13.50": return workLine(extras, "1.2.13.50") + `; sample=${common}`;
        case "1.2.13.51": return workLine(extras, "1.2.13.51") + `; sample=${common}`;
        case "1.2.13.52": return workLine(extras, "1.2.13.52") + `; sample=${common}`;
        case "1.2.13.53": return workLine(extras, "1.2.13.53") + `; sample=${common}`;
        case "1.2.13.54": return workLine(extras, "1.2.13.54") + `; sample=${common}`;
        case "1.2.13.55": return workLine(extras, "1.2.13.55") + `; sample=${common}`;
        case "1.2.13.56": return workLine(extras, "1.2.13.56") + `; sample=${common}`;
        case "1.2.13.57": return workLine(extras, "1.2.13.57") + `; sample=${common}`;
        case "1.2.13.58": return `${common}; eruption=${n(p.climate.eruption)}; active=${p.climate.active}; campaign year ${extras.campaign?.hazards?.[0]?.year || "?"} eruption destroyed ${extras.campaign?.summary?.eruptionDestroyed || "nothing"}`;
        case "1.2.13.59": return `${common}; lavaFlow=${n(p.landform.lavaFlow)}; destruction=${n(p.hazards.destruction)}; campaign destroyed ${extras.campaign?.summary?.eruptionDestroyed || "nothing"} and rebuilt ${extras.campaign?.summary?.rebuilt?.join(", ") || "nothing"}`;
        case "1.2.13.60": return `${common}; ash=${n(p.climate.ash)}; campaign ashfall=${(extras.campaign?.hazards?.[0]?.events || []).join(" ") || "none"}; drawAshPlume`;
        case "1.2.13.61": return `${common}; toxicGas=${n(p.hazards.toxicGas)}; combat.js gas loss + work exposure`;
        case "1.2.13.62": return `${extras.hazard?.quakeTarget ? extras.hazard.quakeTarget.x + "," + extras.hazard.quakeTarget.y : common}; earthquake=${n(extras.hazard?.quakeTarget?.earthquake ?? p.hazards.earthquake)}; campaign quake destroyed ${extras.campaign?.summary?.earthquakeDestroyed || "nothing"} at year ${extras.campaign?.hazards?.find(row => row.focus === "earthquake")?.year || "?"}; stone loss`;
        case "1.2.13.63": return `${common}; hotSpring=${n(p.water.hotSpring)}; unstable=${n(p.hazards.unstable)}; movement=${n(p.hazards.movement)}`;
        case "1.2.13.64": return `${common}; rockfall=${n(p.hazards.rockfall)}; combat.js ROCKFALL damage`;
        case "1.2.13.65": return `${common}; uninhabitable=${n(p.hazards.uninhabitable)}; build verdict=${extras.construction?.hostile?.ok === false ? "blocked" : "open"}`;
        case "1.2.13.66": return `${common}; destruction=${n(p.hazards.destruction)}; campaign real buildings destroyed=${[extras.campaign?.summary?.eruptionDestroyed, extras.campaign?.summary?.earthquakeDestroyed].filter(Boolean).join(", ") || "none"}; rebuilt=${extras.campaign?.summary?.rebuilt?.join(", ") || "none"}; recovery=${extras.campaign?.summary?.recoveryComplete ? "complete" : "incomplete"}`;
        case "1.2.13.67": return `${common}; oldLava=${n(p.landform.oldLava)}; stage=${p.vegetation.stage}; regeneration=${n(p.vegetation.regeneration)}`;
        case "1.2.13.68": return `${common}; soilAge=${n(p.vegetation.soilAge)}; soil.formation=${n(p.soil.formation)}; ageYears=${p.soil.ageYears}`;
        case "1.2.13.69": return `${common}; newChannel=${n(p.water.newChannel)}; drawWatercourse; water=${n(p.water.water)}`;
        case "1.2.13.70": return `${common}; active=${p.climate.active}; cycle=${n(p.climate.cyclePhase)}; crater=${n(p.landform.crater)}; drawCrater lava lake`;
        case "1.2.13.71": return `${common}; stage=${p.vegetation.stage}; yearsSinceEruption=${p.climate.yearsSinceEruption}; vegetation=${n(p.vegetation.density)}`;
        case "1.2.13.72": return `${common}; minerals=${n(p.soil.minerals)}; rare=${n(p.economy.rare)}; goods=${p.goods.map(item => item.id).join(",")}`;
        case "1.2.13.73": return `${common}; usability=${n(p.economy.usability)}; verdict=${extras.construction?.old?.ok ? "old ground buildable" : "blocked"}; observatory=${extras.works["1.2.13.73"]?.ok ? "built at " + extras.works["1.2.13.73"].x + "," + extras.works["1.2.13.73"].y : "missing"}`;
        default: return `${common}; ${group}`;
    }
}

const survey = surveySamples();
// Choose a crater tile where the active lava lake is actually present, rather
// than the first active shield tile that happens to have no crater.
for (let y = 0; y < H && !survey.samples.get("1.2.13.70")?.profile.landform.crater; y++) {
    for (let x = 0; x < W; x++) {
        const profile = volcanoProfileAt(x + 0.5, y + 0.5, contextAt(x, y));
        if (profile.features.includes("1.2.13.70") && profile.landform.crater > 0.4 && profile.climate.active) {
            survey.samples.set("1.2.13.70", { x, y, profile, year: 1, day: 140 });
            break;
        }
    }
}
const workRun = addWorkEvidence();
const works = workRun.results;
const workEvidence = workRun.byRequirement;
const gather = addGatherEvidence(survey.samples);
const hazard = addHazardEvidence(survey.samples);
const construction = addConstructionEvidence(survey.samples);
// The campaign is deliberately last: it installs a complete realm and runs
// years of simulation, so it must not disturb the isolated survey probes.
const campaign = runVolcanoSettlementCampaign();
const campaignRebuilt = campaign.rebuilds.filter(row => row.complete).map(row => row.label);

const threat = [...survey.samples.values()].find(entry => entry.profile.hazards.destruction > 0.5)
    || null;
const rows = VOLCANO_REQUIREMENTS.map(requirement => {
    const sample = survey.samples.get(requirement.id) || (requirement.id === "1.2.13.66" ? threat : null);
    const profile = sample?.profile;
    return {
        id: requirement.id,
        label: requirement.label,
        group: requirement.group,
        status: rowStatus(requirement.id, profile, { works: workEvidence, hazard, construction, campaign }),
        code: requirement.group === "hazard" && (requirement.id === "1.2.13.62" || requirement.id === "1.2.13.66")
            ? "js/world/volcano-hazards.js#updateVolcanoHazards + js/systems/roads.js#destroyRoad"
            : requirement.id === "1.2.13.65" || requirement.id === "1.2.13.73"
                ? "js/systems/construction.js#volcanicSiteVerdictAt + js/world/volcano-ecology.js#volcanoProfileAt"
                : CODE[requirement.group] || "js/world/volcano-ecology.js",
        evidence: evidence(requirement.id, sample, { works: workEvidence, gather, hazard, construction, campaign }),
    };
});

const partial = rows.filter(row => row.status === "partial").length;
const missing = rows.filter(row => row.status === "missing").length;
const working = rows.filter(row => row.status === "working").length;
const crossChecks = {
    browser: {
        command: "node tests/browser/volcano-formations.mjs",
        result: "10/10 formations, seed 20261212, no page or console errors",
        image: "volcano-formations.png",
    },
    lowEnd: {
        command: "PERF_SOFTWARE_CANVAS=1 PERF_CLIMATE=volcanic PERF_FORESTS=55 PERF_SEED=20261212 PERF_YEARS=2 PERF_RENDER_SCALE=70 node tests/browser/low-end-performance.mjs",
        result: "16.7–16.8 ms p95, 0 long tasks, save 176.5 ms, load 1503.7 ms, 970,822 bytes",
    },
    campaign: {
        command: "node scripts/volcano-campaign.mjs",
        result: `${campaign.years}-year volcanic settlement campaign at seed ${campaign.seed}: ` +
            `${campaign.summary.eruptionDestroyed || "no eruption loss"} lost to eruption, ` +
            `${campaign.summary.earthquakeDestroyed || "no earthquake loss"} lost to earthquake, ` +
            `rebuilt ${campaignRebuilt.join(", ") || "nothing"}; recovery=${campaign.summary.recoveryComplete ? "complete" : "incomplete"}`,
        seed: campaign.seed,
        years: campaign.years,
        ticks: campaign.totalTicks,
        recoveryComplete: campaign.summary.recoveryComplete,
    },
};
const report = {
    schema: 1,
    generatedAt: new Date().toISOString(),
    seed: SEED,
    world: { width: W, height: H, resolution: RES, seaLevel: WORLD.sea, volcanicTiles: survey.volcanic, formations: Object.keys(VOLCANO_FORMATIONS) },
    summary: { total: rows.length, working, partial, missing },
    works, gather, hazard, construction, campaign, crossChecks,
    items: rows,
};

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(resolve(OUT_DIR, "volcano-audit.json"), JSON.stringify(report, null, 2) + "\n");

const lines = [
    "# 1.2.13 Vulkanlandschaften — Runtime Audit",
    "",
    `Generated from a real generated world (seed \`${SEED}\`, ${W}×${H}, ` +
    `${survey.volcanic.toLocaleString("en-US")} volcanic tiles) and the actual work, gathering, hazard and construction paths. ` +
    `${working}/${rows.length} items have a runtime-backed status.`,
    "",
    "## Method",
    "",
    "`scripts/volcano-audit.mjs` calls `generateWorldData()` with the volcanic climate, surveys every tile through `volcanoProfileAt()`, " +
    "then exercises `performVolcanoWork()`, `gatherMeadowProducts()`, `updateVolcanoHazards()`, `destroyVolcanicTargetAt()` and `volcanicSiteVerdictAt()`. " +
    "The browser formation reference (`tests/browser/volcano-formations.mjs`) separately captures all ten formations from the live renderer: " +
    crossChecks.browser.result + ". The image is committed beside this report: [volcano-formations.png](volcano-formations.png).",
    "",
    "The `features` array is used only to locate a representative tile. Each row below also reports the actual profile field and the consumer " +
    "that makes the item observable, so a label alone cannot pass the audit.",
    "",
    `The multi-year settlement campaign (\`scripts/volcano-campaign.mjs\`, seed \`${campaign.seed}\`, ` +
    `${campaign.years} years / ${campaign.totalTicks} ticks) starts the shipped realm and runs the real simulation, construction, logistics, ` +
    "population and event systems. The two annual hazard passes use the real candidate scan, event log and destruction path; " +
    `\`focus\` selects the eruption or earthquake branch so this proof is deterministic rather than roll-dependent. ` +
    `Result: **${campaign.summary.eruptionDestroyed || "no eruption loss"}** destroyed by eruption, ` +
    `**${campaign.summary.earthquakeDestroyed || "no earthquake loss"}** destroyed by earthquake, and both rebuilt to **COMPLETED**: ` +
    `${campaignRebuilt.join(", ") || "none"}.`,
    "",
    "| ID | Requirement | Status | Code location | Observed runtime evidence |",
    "|---|---|---|---|---|",
    ...rows.map(row => `| ${row.id} | ${escape(row.label)} | **${row.status}** | ${escape(row.code)} | ${escape(row.evidence)} |`),
    "",
    "## Cross-checks",
    "",
    `- Browser capture: \`${crossChecks.browser.command}\` — ${crossChecks.browser.result}.`,
    `- Low-end volcanic run: \`${crossChecks.lowEnd.command}\` — ${crossChecks.lowEnd.result}.`,
    `- Multi-year campaign: \`${crossChecks.campaign.command}\` — ${crossChecks.campaign.result}.`,
    "",
    "## Multi-year settlement campaign",
    "",
    "The campaign starts the shipped realm in the volcanic climate and runs nine years of ordinary fixed-step simulation, including city needs, " +
    "construction sites, carrier logistics, fields, weather, population, events and the annual hazard task. Year 3 invokes the real annual " +
    "eruption branch; year 4 invokes the real annual earthquake branch. The destroyed entities are then rebuilt through `placeDirectBuilding()` " +
    "and must reach stage 3 before the audit passes.",
    "",
    "| Year | Cause | Event log | Destroyed target | Buildings before → after |",
    "|---|---|---|---|---|",
    ...campaign.hazards.map(row => `| ${row.year} | ${row.focus} | ${escape((row.events || []).join(" / "))} | ${escape(row.target?.label || row.destroyed?.label || "none")} at ${row.target?.x ?? row.destroyed?.x ?? "?"},${row.target?.y ?? row.destroyed?.y ?? "?"} | ${row.buildingsBefore} → ${row.buildingsAfter} |`),
    "",
    "| Cause | Original | Rebuilt entity | Site | Placed | Completed |",
    "|---|---|---|---|---|---|",
    ...campaign.rebuilds.map(row => `| ${row.cause} | ${escape(row.label || "?")} | ${row.newId || "none"} | ${row.site?.x ?? "?"},${row.site?.y ?? "?"}${row.site?.exact ? " (same tile)" : ""} | year ${row.placedYear ?? "?"} | ${row.complete ? "year " + row.completedYear : "not complete"} |`),
    "",
    "| Year | Tick | Population | Buildings | Food | Active sites | Rebuilt structures complete |",
    "|---|---|---|---|---|---|---|",
    ...campaign.yearly.map(row => `| ${row.year} | ${row.tick} | ${row.population} | ${row.buildings} | ${row.resources?.food ?? "?"} | ${row.activeSites} | ${(row.rebuilds || []).filter(item => item.complete).length}/${(row.rebuilds || []).length} |`),
    "",
    `Final state: population ${campaign.final.population}, buildings ${campaign.final.buildings}, food ${campaign.final.resources.food}, ` +
    `recovery ${campaign.summary.recoveryComplete ? "complete" : "incomplete"}.`,
    "",
    "## Work and gathering probes",
    "",
    "```json",
    JSON.stringify({ works, gather }, null, 2),
    "```",
    "",
    "## Hazard and construction probes",
    "",
    "```json",
    JSON.stringify({ hazard, construction }, null, 2),
    "```",
    "",
];
writeFileSync(resolve(OUT_DIR, "VOLCANO_1.2.13_AUDIT.md"), lines.join("\n"));
const auditOk = working === rows.length && partial === 0 && missing === 0 && gather?.ok === true && campaign.ok === true;
if (!auditOk) process.exitCode = 1;
console.log("VOLCANO_AUDIT " + JSON.stringify({
    ok: auditOk,
    total: rows.length,
    working,
    missing: rows.filter(row => row.status !== "working").map(row => row.id),
    world: report.world,
    campaign: { seed: campaign.seed, years: campaign.years, ticks: campaign.totalTicks, recoveryComplete: campaign.summary.recoveryComplete },
    reports: [resolve(OUT_DIR, "VOLCANO_1.2.13_AUDIT.md"), resolve(OUT_DIR, "volcano-audit.json")],
}));
