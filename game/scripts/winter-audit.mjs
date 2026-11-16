// Reproducible 1.2.16 Winter Economy audit. It installs a real Snowlands world,
// places a keep, farm, house and residents at a genuine land/water edge, then
// drives the real twenty-day ledger and annual pass through all four seasons.
// Each numbered system is recorded only from observed state deltas.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resetState, state } from "../js/core/state.js";
import { TYPE } from "../js/core/types.js";
import { generateWorldData } from "../js/world/terrain-model.js";
import { getWarehouseStock } from "../js/systems/logistics.js";
import {
    WINTER_SYSTEMS, getWinterSnapshot, initializeWinterForRealm, setWinterPolicy,
    updateWinterAnnual, updateWinterEconomy, upgradeWinterBuildings, upgradeWinterUnits,
} from "../js/world/winter-economy.js";
import { snowProfileAt } from "../js/world/snow-ecology.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, "..", "artifacts");
const SEED = 20261215;
const OPTIONS = Object.freeze({
    size: "small", shape: "continents", climate: "snow", landmass: 50,
    ruggedness: 58, forests: 52, water: 48, fertility: 50, resources: 60, coastline: 60,
});
const WORLD = generateWorldData(SEED, OPTIONS);
const W = WORLD.dims.w, H = WORLD.dims.h, RES = WORLD.resolution;
const n = value => Number(value ?? 0).toFixed(3);
const pct = value => Math.round(Number(value ?? 0) * 100) + "%";
const esc = value => String(value).replace(/\|/g, "\\|").replace(/\n/g, " ");

function contextAt(x, y, { dayOfYear = 150, weather = "clear", use = {} } = {}) {
    const index = Math.min(WORLD.pixW * WORLD.pixH - 1, Math.floor(y * RES) * WORLD.pixW + Math.floor(x * RES));
    return {
        seed: SEED, climate: "snow", height: WORLD.heights[index], moisture: WORLD.moistures[index],
        temperature: WORLD.temperatures[index], seaLevel: WORLD.sea, dayOfYear, year: 5,
        hour: 12, weather, wind: weather === "storm" ? 2 : 1.2, use,
    };
}

function profileAt(x, y, options = {}) {
    return snowProfileAt(x + 0.5, y + 0.5, contextAt(x, y, options));
}

function findBase() {
    let best = null;
    for (let y = 8; y < H - 8; y += 2) {
        for (let x = 8; x < W - 8; x += 2) {
            const p = profileAt(x, y, { dayOfYear: 330, weather: "storm" });
            if (p.water.frozen || p.landform.forest < 0.25) continue;
            let water = 0;
            for (const [ox, oy] of [[5, 0], [-5, 0], [0, 5], [0, -5], [8, 3], [-8, -3], [3, 8], [-3, -8]]) {
                if (profileAt(x + ox, y + oy).water.frozen) water++;
            }
            if (!water) continue;
            const score = p.landform.forest * 0.5 + p.economy.game * 0.3 + p.thaw.swollenRivers * 0.2;
            if (!best || score > best.score) best = { x, y, score, profile: p, water };
        }
    }
    return best || { x: Math.floor(W / 2), y: Math.floor(H / 2), score: 0, profile: profileAt(Math.floor(W / 2), Math.floor(H / 2)), water: 0 };
}

function installWorld(base) {
    resetState();
    state.hasStarted = true;
    state.worldSeed = SEED;
    state.worldW = W; state.worldH = H; state.worldSizeId = WORLD.dims.id;
    state.worldOptions = { ...OPTIONS };
    state.seaLevel = WORLD.sea;
    state.terrainResolution = RES;
    state.terrainPixW = WORLD.pixW; state.terrainPixH = WORLD.pixH;
    state.heightMap = WORLD.heights; state.moistureMap = WORLD.moistures; state.temperatureMap = WORLD.temperatures;
    state.rivers = WORLD.rivers;
    state.dayOfYear = 330; state.year = 5; state.seasonIndex = 3;
    state.tick = 100; state.weather = "storm";
    state.resources = { wood: 1000, stone: 1000, gold: 1000, food: 1000 };
    state.morale = 72;
    state.roads = { version: 1, revision: 0, tiles: {} };
    for (let i = 0; i < 30; i++) state.roads.tiles[(base.x + (i % 6)) + "," + (base.y + Math.floor(i / 6))] = { type: "road" };
    state.market = { prices: { wood: 3, stone: 3, food: 3 }, priceTrend: { wood: 0, stone: 0, food: 0 }, partners: [] };
    state.diplomacy = { realms: [{ id: "audit-neighbour", relation: 50 }] };
    const keep = {
        id: "audit-keep", type: TYPE.KEEP, x: base.x, y: base.y, hp: 120, maxHp: 120, dead: false,
        isBuilding: () => true,
        warehouse: { capacity: 320, stored: { firewood: 120, food: 30, water: 20 }, reservedIn: {}, reservedOut: {}, filters: ["firewood", "food", "water"] },
    };
    const farm = {
        id: "audit-farm", type: TYPE.FARM, x: base.x + 2, y: base.y, hp: 100, maxHp: 100, dead: false,
        isBuilding: () => true, field: { fertility: 42, maxFertility: 50, growth: 35, stage: "growing" },
    };
    const house = { id: "audit-house", type: TYPE.HOUSE, x: base.x + 4, y: base.y, hp: 100, maxHp: 100, dead: false, isBuilding: () => true };
    const villagers = Array.from({ length: 8 }, (_, index) => ({
        id: "audit-villager-" + index, type: TYPE.VILLAGER, x: base.x + (index % 4), y: base.y + 2 + Math.floor(index / 4),
        hp: 100, maxHp: 100, dead: false, isKing: false, person: { name: "Resident " + index },
    }));
    state.entities = [keep, farm, house, ...villagers];
    state.winter = null;
    initializeWinterForRealm();
    return { keep, farm, house, villagers };
}

function setSeason(day, weather, tick) {
    state.dayOfYear = day;
    state.seasonIndex = Math.floor(day / 100) % 4;
    state.tick = tick;
    state.weather = weather;
}

function findFocus(predicate) {
    for (let y = 4; y < H - 4; y += 2) {
        for (let x = 4; x < W - 4; x += 2) {
            const profile = profileAt(x, y);
            if (predicate(profile)) return { x, y, profile };
        }
    }
    return null;
}

const base = findBase();
const installed = installWorld(base);
const observations = {};

setSeason(330, "storm", 100);
observations.winter = updateWinterEconomy({ force: true });
const winterFuel = getWarehouseStock("firewood");
const winterHuntTotal = state.winter.totals.huntFood;

setSeason(20, "rain", 120);
observations.spring = updateWinterEconomy({ force: true });

setSeason(120, "clear", 140);
observations.summer = updateWinterEconomy({ force: true });

setSeason(220, "fog", 160);
observations.autumn = updateWinterEconomy({ force: true });

setSeason(330, "storm", 180);
const annual = updateWinterAnnual({ force: true });
const annualSnowDamage = state.winter.totals.snowDamage;
const relationBefore = 50;
const annualRelation = state.diplomacy.realms[0].relation;

// Shortfall probe: remove the physical firewood, then run the same real ledger.
installed.keep.warehouse.stored.firewood = 0;
setSeason(330, "storm", 200);
state.morale = 72;
observations.shortfall = updateWinterEconomy({ force: true, systems: ["heating", "shortfall", "fuelPrice"] });
const shortfallMorale = state.morale;
const shortfallPrice = state.market.prices.wood;

// Frost probe at an exposed ridge. The field is real state, the profile is real
// terrain from the same world.
const frostSite = findFocus(profile => !profile.water.frozen && profile.surface.exposed > 0.35 && profile.surface.depth < 0.62)
    || { x: base.x, y: base.y };
setSeason(20, "snow", 220);
state.year = 6;
state.winter.lastFrostYear = 0;
const frostBefore = installed.farm.field.fertility;
const frost = updateWinterEconomy({ force: true, systems: ["frostDamage"], focus: frostSite });
const frostAfter = installed.farm.field.fertility;

// Wolf probe at a real forest carrying wolves.
const wolfSite = findFocus(profile => !profile.water.frozen && profile.fauna.some(entry => entry.id === "wolf")
    && profile.landform.forest > 0.5) || { x: base.x, y: base.y };
setSeason(330, "storm", 240);
state.resources.food = 100;
const wolfBeforeFood = state.resources.food;
const wolf = updateWinterEconomy({ force: true, systems: ["wolfPressure"], focus: wolfSite });
const wolfAfterFood = state.resources.food;

// Food stress probe.
setSeason(330, "storm", 260);
state.resources.food = 0;
state.morale = 72;
const foodStress = updateWinterEconomy({ force: true, systems: ["foodStress"] });
const foodStressMorale = state.morale;

// Festival probe with real stores.
setSeason(330, "storm", 280);
state.resources.food = 100;
installed.keep.warehouse.stored.firewood = 120;
state.winter = null;
initializeWinterForRealm();
setWinterPolicy("festival", true);
const moraleBefore = state.morale;
const festival = updateWinterEconomy({ force: true, systems: ["morale"] });
const moraleAfter = state.morale;

// Upgrade probes.
const hardinessBefore = installed.keep.winterHardiness;
const woodBefore = state.resources.wood;
const buildingUpgrade = upgradeWinterBuildings(2);
const hardinessAfter = installed.keep.winterHardiness;
const goldBefore = state.resources.gold;
const kitBefore = installed.villagers[0].winterKit;
const unitUpgrade = upgradeWinterUnits(2);
const kitAfter = installed.villagers[0].winterKit;

// Ice evidence from the winter snapshot and the spring breakup.
const winterIce = observations.winter.iceRoads.filter(route => route.status === "open");
const brokenIce = observations.spring.iceRoads.filter(route => route.status === "broken");
const springCargo = observations.spring.values.iceCargoLost;

const rows = [];
const row = (index, ok, value, evidence) => {
    const system = WINTER_SYSTEMS[index];
    rows.push({ ...system, ok: Boolean(ok), value, evidence });
};

row(0, observations.winter.values.snowDepth > 0 && observations.winter.values.bearing < 1,
    "depth " + n(observations.winter.values.snowDepth) + ", bearing " + pct(observations.winter.values.bearing),
    "winter storm at " + base.x + "," + base.y);
row(1, observations.winter.values.transportSpeed < 0.55 && (observations.winter.values.supplyLoss || 0) > 0,
    "transport " + pct(observations.winter.values.transportSpeed) + ", food loss " + (observations.winter.values.supplyLoss || 0),
    "deep winter road chain");
row(2, observations.winter.values.fuelBurned > 0,
    "demand " + n(observations.winter.values.heatingDemand) + ", burned " + n(observations.winter.values.fuelBurned) + ", stock " + n(winterFuel),
    "physical firewood ledger");
row(3, observations.shortfall.values.heatingShortfall > 0 && observations.shortfall.values.illnessRisk > 0,
    "shortfall " + pct(observations.shortfall.values.heatingShortfall) + ", illness " + pct(observations.shortfall.values.illnessRisk) + ", morale " + n(shortfallMorale),
    "firewood removed before ledger");
row(4, observations.shortfall.values.fuelPricePressure > 0 && shortfallPrice > 3,
    "pressure " + pct(observations.shortfall.values.fuelPricePressure) + ", wood price " + n(shortfallPrice),
    "market carry-through");
row(5, winterIce.length > 0 && observations.winter.values.iceCapacity > 0,
    winterIce.length + " open, capacity " + observations.winter.values.iceCapacity,
    winterIce.map(route => route.id + ":" + route.capacity).join(" ") || "no route");
row(6, springCargo > 0 && brokenIce.length > 0,
    brokenIce.length + " broken, cargo lost " + n(springCargo),
    "spring thaw at " + base.x + "," + base.y);
row(7, observations.winter.values.clearanceWork > 0 && observations.winter.values.clearanceCostWood > 0,
    "work " + n(observations.winter.values.clearanceWork) + ", wood spent " + n(observations.winter.values.clearanceCostWood) + ", penalty " + n(observations.winter.values.clearancePenalty),
    "twenty-day clearance ledger");
row(8, observations.winter.values.insulation > 0 && observations.winter.values.soilTemperature > 0,
    "insulation " + pct(observations.winter.values.insulation) + ", soil " + pct(observations.winter.values.soilTemperature),
    "deep cover at the audit site");
row(9, frost.values.frostDamage > 0 && frostAfter <= frostBefore,
    "frost " + n(frost.values.frostDamage) + ", field " + n(frostBefore) + " -> " + n(frostAfter),
    "exposed ridge " + frostSite.x + "," + frostSite.y);
row(10, observations.spring.values.meltwater > 0 && observations.spring.values.fertilityBonus > 0,
    "meltwater " + pct(observations.spring.values.meltwater) + ", fertility bonus " + n(observations.spring.values.fertilityBonus),
    "spring meadow");
const floodSite = findFocus(profile => !profile.water.frozen && profile.thaw.swollenRivers > 0.55)
    || { x: base.x, y: base.y };
setSeason(20, "rain", 210);
state.year = 7;
state.winter.lastFloodYear = 0;
const floodProbe = updateWinterEconomy({ force: true, systems: ["flood"], focus: floodSite });
row(11, floodProbe.values.floodDamage > 0 || observations.spring.values.floodDamage > 0,
    "flood damage " + n(Math.max(floodProbe.values.floodDamage, observations.spring.values.floodDamage)) + ", field fertile " + n(installed.farm.field.fertility),
    "spring swollen river at " + floodSite.x + "," + floodSite.y);
row(12, observations.winter.values.huntYield > 0,
    "hunt yield " + n(observations.winter.values.huntYield) + ", total " + n(winterHuntTotal),
    "winter migration");
row(13, wolf.values.wolfPressure > 0.45 && wolfAfterFood < wolfBeforeFood,
    "wolf pressure " + pct(wolf.values.wolfPressure) + ", food " + wolfBeforeFood + " -> " + wolfAfterFood,
    "forest wolves at " + wolfSite.x + "," + wolfSite.y);
row(14, foodStress.values.foodStress > 0.55 && foodStressMorale < 72,
    "food stress " + pct(foodStress.values.foodStress) + ", morale " + n(foodStressMorale),
    "empty stores");
row(15, annual.applied && annualSnowDamage > 0 && annual.after.passClosed > 0.3,
    "avalanche " + pct(annual.after.avalancheRisk) + ", damage " + n(annualSnowDamage) + ", pass " + pct(annual.after.passClosed),
    "annual hazard pass");
row(16, annual.applied && annual.after.caravanDelay > 0 && annualRelation < relationBefore,
    "delay " + n(annual.after.caravanDelay) + ", relation " + relationBefore + " -> " + n(annualRelation),
    "annual caravan pass");
row(17, festival.values.moraleBonus > 0 && moraleAfter > moraleBefore,
    "morale " + n(moraleBefore) + " -> " + n(moraleAfter) + ", bonus " + n(festival.values.moraleBonus),
    "funded festival");
row(18, buildingUpgrade.ok && hardinessAfter > hardinessBefore && state.resources.wood < woodBefore,
    "hardiness " + pct(hardinessBefore) + " -> " + pct(hardinessAfter) + ", wood " + woodBefore + " -> " + n(state.resources.wood),
    "winterisation order");
row(19, unitUpgrade.ok && kitAfter > kitBefore && state.resources.gold < goldBefore,
    "kit " + pct(kitBefore) + " -> " + pct(kitAfter) + ", gold " + goldBefore + " -> " + n(state.resources.gold),
    "winter kit order");

const ok = rows.every(entry => entry.ok);
const report = {
    generatedAt: new Date().toISOString(),
    seed: SEED,
    climate: "snow",
    base: { x: base.x, y: base.y, formation: base.profile.formation, waterNeighbours: base.water },
    seasonSnapshots: Object.fromEntries(Object.entries(observations).map(([key, snapshot]) => [key, snapshot.values])),
    annual,
    rows,
    ok,
    systemCount: rows.length,
};

mkdirSync(OUT, { recursive: true });
writeFileSync(resolve(OUT, "winter-1.2.16-audit.json"), JSON.stringify(report, null, 2));
const lines = [
    "# Kings & Cards — 1.2.16 Winter Economy Audit",
    "",
    "Generated: " + report.generatedAt,
    "Seed: **" + SEED + "** · Climate: **Snowlands** · Site: **" + base.x + "," + base.y + " (" + base.profile.formation + ")**",
    "Systems: **" + rows.filter(entry => entry.ok).length + "/" + rows.length + " observed**",
    "",
    "| ID | System | Observed value | Evidence |",
    "| --- | --- | --- | --- |",
    ...rows.map(entry => "| " + entry.id + " | " + esc(entry.label) + " | " + esc(entry.value) + " | " + (entry.ok ? "PASS" : "FAIL") + " · " + esc(entry.evidence) + " |"),
    "",
    "## Season snapshots",
    "",
    "| Season | Depth | Bearing | Transport | Heating | Shortfall | Ice capacity | Avalanche | Meltwater |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...Object.entries(observations).map(([key, snapshot]) => "| " + key + " | " + n(snapshot.values.snowDepth) + " | " + pct(snapshot.values.bearing) + " | " + pct(snapshot.values.transportSpeed) + " | " + n(snapshot.values.heatingDemand) + " | " + pct(snapshot.values.heatingShortfall) + " | " + n(snapshot.values.iceCapacity) + " | " + pct(snapshot.values.avalancheRisk) + " | " + pct(snapshot.values.meltwater) + " |"),
    "",
    "## Result",
    "",
    ok ? "All twenty systems produced an observed, non-decorative state change." : "One or more systems failed to produce an observed state change.",
    "",
];
writeFileSync(resolve(OUT, "WINTER_1.2.16_AUDIT.md"), lines.join("\n"));
console.log(JSON.stringify({ ok, passed: rows.filter(entry => entry.ok).length, total: rows.length, base: report.base }, null, 2));
for (const entry of rows) console.log((entry.ok ? "PASS" : "FAIL") + " " + entry.id + " " + entry.label + " · " + entry.value);
if (!ok) process.exitCode = 1;
