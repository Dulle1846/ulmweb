// Bounded runtime for the regional forest industries. One new building type
// (Forest Works) selects a mode; sawmills select a saw profile. Both choices
// live on the entity and are saved with it. All output is an ordinary physical
// good, so the existing carriers, warehouses, goods book and market can see it.
import { state } from "../core/state.js";
import { TYPE } from "../core/types.js";
import { addResource } from "./resources.js";
import { recordResourceMovement } from "./goods-book.js";
import { getBuildingEfficiency, getWorkforceSnapshot } from "./economy.js";
import {
    addLocalOutput, consumeFromWarehouse, ensureInventory, getAvailableOutput,
    getPhysicalStock, outputSpace, recordGoodMovement, requestHaul, requestSupply,
    requestTimberSupply,
} from "./logistics.js";
import { ensureForestGathering } from "./forest-gathering.js";
import { addMedicineStock, MEDICINE_MAX_STOCK } from "./health.js";
import { consumeIndustryGoodFromWarehouses, forestGuildMarketPremium, industryWarehouseStock } from "./forest-guild.js";
import { addLog } from "../core/event-log.js";
import { getForestHabitatAt } from "./resource-geography.js";
import { REGIONAL_TIMBER_KEYS, regionalTimberGood } from "../world/regional-forests.js";
import {
    FOREST_WORKS_MODES, INDUSTRY_GOODS, SAW_PROFILES, WOOD_QUALITY_CLASSES,
    furnitureStyleFor, modeFitsStand, sawProfileFor, woodQualityFor,
} from "../world/forest-industries.js";

export const FOREST_INDUSTRY_INTERVAL = 30;
export const FOREST_INDUSTRY_BATCH_BUDGET = 8;
const SITE_CACHE_LIMIT = 1024;
const SITE_CACHE = new Map();

// Finished goods are useful, but not an infinite sink. The ceiling is per good
// across every store and carrier, so a workshop cannot fill the realm with
// furniture while the player is looking elsewhere.
// Per-building mastery grows from completed batches. It is saved on the
// building as a single integer, gives a deterministic bonus unit on a fixed
// cadence, and adds a permanent furniture-prestige premium. No per-frame data
// or separate XP economy is introduced.
export const FOREST_MASTERY_LEVELS = Object.freeze([
    Object.freeze({ level: 1, label: "Apprentice", at: 0, bonusEvery: 0, premium: 0 }),
    Object.freeze({ level: 2, label: "Journeyman", at: 12, bonusEvery: 8, premium: 0.02 }),
    Object.freeze({ level: 3, label: "Master", at: 36, bonusEvery: 5, premium: 0.04 }),
    Object.freeze({ level: 4, label: "Guild Master", at: 80, bonusEvery: 3, premium: 0.06 }),
]);

export function forestMasteryFor(building) {
    const batches = Math.max(0, Math.floor(Number(building?.forestBatches) || 0));
    let found = FOREST_MASTERY_LEVELS[0];
    for (const entry of FOREST_MASTERY_LEVELS) if (batches >= entry.at) found = entry;
    const next = FOREST_MASTERY_LEVELS.find(entry => entry.at > batches) || null;
    return {
        ...found, batches,
        nextAt: next ? next.at : null,
        nextLabel: next ? next.label : null,
        progress: next ? Math.max(0, Math.min(1, (batches - found.at) / Math.max(1, next.at - found.at))) : 1,
    };
}

export const INDUSTRY_STOCK_TARGETS = Object.freeze({
    charcoal: 60, potash: 28, furniture: 24, pitch: 30, tar: 30, tannin: 30,
    dye: 30, medicine: 24, paper: 30, silk: 18, rubber: 20, bambooFibre: 24,
    palmOil: 24, palmFrond: 24, spices: 20, cork: 24, smokedFish: 30,
    preserves: 30, shipTimber: 20, bowStaves: 20,
});

const clamp = (value, min, max) => Math.max(min, Math.min(max, Number.isFinite(Number(value)) ? Number(value) : min));
const round2 = value => Math.round((Number(value) || 0) * 100) / 100;
const seasonFactor = () => [0.96, 1, 1.05, 1.1][Math.max(0, Math.min(3, Math.floor(Number(state.seasonIndex) || 0)))] || 1;

function productionLedger() {
    const economy = state.economy || (state.economy = {});
    const production = economy.productionChains || (economy.productionChains = {});
    for (const key of ["forestBatches", "forestRawConsumed", "forestFinished", "forestGold", "forestCursor"]) {
        production[key] = Math.max(0, Number(production[key]) || 0);
    }
    production.forestFurniturePremium = Math.max(0, Math.min(0.4, Number(production.forestFurniturePremium) || 0));
    return production;
}

function forestStandAt(building) {
    const x = Math.floor(Number(building?.x) || 0), y = Math.floor(Number(building?.y) || 0);
    const key = (Number(state.worldSeed) || 1) + ":" + x + ":" + y;
    if (SITE_CACHE.has(key)) return SITE_CACHE.get(key);
    let stand = null;
    try {
        stand = getForestHabitatAt(x, y)?.forestStand || null;
    } catch {
        stand = null;
    }
    if (SITE_CACHE.size >= SITE_CACHE_LIMIT) SITE_CACHE.clear();
    SITE_CACHE.set(key, stand);
    return stand;
}

export function forestWorksModeFor(building) {
    const id = String(building?.forestMode || "charcoal");
    return FOREST_WORKS_MODES[id] || FOREST_WORKS_MODES.charcoal;
}

export function sawProfileIdFor(building) {
    return sawProfileFor(building?.sawProfile).id;
}

export function setSawProfile(building, profileId) {
    if (!building || building.dead || building.type !== TYPE.SAWMILL) return { ok: false, reason: "A sawmill is required" };
    if (building.construction && Number(building.construction.stage) < 3) return { ok: false, reason: "The sawmill is still under construction" };
    const profile = SAW_PROFILES[profileId];
    if (!profile) return { ok: false, reason: "Unknown saw profile" };
    building.sawProfile = profile.id;
    building.lastSawQuality = null;
    building.productionReason = "Saw bench retooled: " + profile.label;
    return { ok: true, profile: profile.id, label: profile.label };
}

export function setForestWorksMode(building, modeId) {
    if (!building || building.dead || building.type !== TYPE.FOREST_WORKS) return { ok: false, reason: "A Forest Works is required" };
    if (building.construction && Number(building.construction.stage) < 3) return { ok: false, reason: "The Forest Works is still under construction" };
    const mode = FOREST_WORKS_MODES[modeId];
    if (!mode) return { ok: false, reason: "Unknown forest industry" };
    const stand = forestStandAt(building);
    if (!modeFitsStand(mode, stand)) return { ok: false, reason: "This wood cannot supply " + mode.label };
    building.forestMode = mode.id;
    building.lastForestBatch = null;
    building.productionReason = "Workshop changed to " + mode.label;
    return { ok: true, mode: mode.id, label: mode.label };
}

function standardNeed(mode) {
    return Object.entries(mode.standard || {}).map(([good, amount]) => ({ good, amount }));
}

function timberOptions(mode, inventory) {
    if (!mode.timber) return [];
    const classId = mode.timber.classId || "furniture";
    return REGIONAL_TIMBER_KEYS
        .filter(good => Math.max(0, Number(inventory?.input?.[good]) || 0) >= Math.max(1, Number(mode.timber.amount) || 1))
        .map(good => ({ good, amount: Math.max(1, Number(mode.timber.amount) || 1), quality: woodQualityFor(good, classId) }))
        .filter(row => row.quality.reliable)
        .sort((a, b) => b.quality.score - a.quality.score || a.good.localeCompare(b.good));
}

function rawNeed(mode, ledger) {
    return Object.entries(mode.raw || {}).map(([good, amount]) => ({
        good, amount,
        available: Math.max(0, Math.floor(Number(ledger?.stock?.[good]) || 0)),
    }));
}

function outputTotal(mode) {
    return Object.values(mode.output || {}).reduce((sum, amount) => sum + Math.max(0, Number(amount) || 0), 0);
}

function outputBlocked(mode) {
    for (const [good, amount] of Object.entries(mode.output || {})) {
        const limit = INDUSTRY_STOCK_TARGETS[good] || 24;
        if (getPhysicalStock(good) + Math.max(0, Number(amount) || 0) > limit) return good;
    }
    return null;
}

export function forestWorksStatus(building) {
    if (!building || building.type !== TYPE.FOREST_WORKS) {
        return { ok: false, reason: "A Forest Works is required", mode: null };
    }
    const mode = forestWorksModeFor(building);
    const stand = forestStandAt(building);
    const inventory = ensureInventory(building);
    const ledger = ensureForestGathering();
    const construction = building.construction && Number(building.construction.stage) < 3;
    const missing = [];
    for (const need of standardNeed(mode)) {
        const have = Math.max(0, Number(inventory?.input?.[need.good]) || 0);
        if (have < need.amount) missing.push((need.amount - have) + " " + need.good);
    }
    const timber = mode.timber ? timberOptions(mode, inventory)[0] || null : null;
    if (mode.timber && !timber) missing.push((mode.timber.amount || 1) + " furniture-grade regional timber");
    for (const need of rawNeed(mode, ledger)) {
        if (need.available < need.amount) missing.push((need.amount - need.available) + " " + need.good);
    }
    const fit = modeFitsStand(mode, stand);
    const blockedGood = outputBlocked(mode);
    const space = outputSpace(building);
    let reason = "";
    if (construction) reason = "The Forest Works is still under construction";
    else if (!stand) reason = "No working forest in range";
    else if (!fit) reason = "This wood cannot supply " + mode.label;
    else if (blockedGood) reason = "Reserve is fully stocked: " + (INDUSTRY_GOODS[blockedGood]?.label || blockedGood);
    else if (space < outputTotal(mode)) reason = "Output store is full";
    else if (missing.length) reason = "Waiting for " + missing.join(" · ");
    return {
        ok: !reason, reason, mode, fit, stand,
        mastery: forestMasteryFor(building),
        siteLabel: stand?.regionalType?.short || stand?.regionalType?.label || stand?.type || "no forest",
        style: mode.style ? furnitureStyleFor(stand?.regionalType) : null,
        timber,
        missing,
        outputSpace: space,
        output: mode.output,
    };
}

function requestWorksInputs(building, mode) {
    const inventory = ensureInventory(building);
    for (const need of standardNeed(mode)) {
        if (Math.max(0, Number(inventory?.input?.[need.good]) || 0) < need.amount) {
            requestSupply(building, need.good, Math.max(need.amount, 6));
        }
    }
    if (mode.timber) {
        const options = timberOptions(mode, inventory);
        if (!options.length) {
            const classId = mode.timber.classId || "furniture";
            const accepted = REGIONAL_TIMBER_KEYS.filter(good => woodQualityFor(good, classId).reliable);
            requestTimberSupply(building, accepted);
        }
    }
}

function consumeStandard(building, mode, production) {
    const inventory = ensureInventory(building);
    for (const need of standardNeed(mode)) {
        if (Math.max(0, Number(inventory?.input?.[need.good]) || 0) < need.amount) return false;
    }
    for (const need of standardNeed(mode)) {
        inventory.input[need.good] -= need.amount;
        recordGoodMovement({
            type: "consumed", good: need.good, quantity: need.amount,
            from: { kind: "building", id: building.id },
            to: { kind: "recipe", id: mode.label },
            cause: "forest-works-input",
        });
    }
    return true;
}

function consumeTimber(building, timber) {
    if (!timber) return true;
    const inventory = ensureInventory(building);
    if (Math.max(0, Number(inventory?.input?.[timber.good]) || 0) < timber.amount) return false;
    inventory.input[timber.good] -= timber.amount;
    recordGoodMovement({
        type: "consumed", good: timber.good, quantity: timber.amount,
        from: { kind: "building", id: building.id },
        to: { kind: "recipe", id: "Furniture manufactory" },
        cause: "forest-works-timber",
    });
    return true;
}

function consumeRaw(mode, ledger) {
    for (const need of rawNeed(mode, ledger)) if (need.available < need.amount) return false;
    for (const need of rawNeed(mode, ledger)) {
        ledger.stock[need.good] = Math.max(0, Math.floor(Number(ledger.stock[need.good]) || 0) - need.amount);
        if (ledger.stock[need.good] <= 0) delete ledger.stock[need.good];
    }
    return true;
}

// Exported so the focused test and the dossier can ask for exactly one batch
// without starting a frame loop. In normal play this is called by
// updateForestIndustry at the bounded cadence.
export function runForestWorks(building, { force = false } = {}) {
    if (!building || building.dead || building.type !== TYPE.FOREST_WORKS) return { ok: false, reason: "A Forest Works is required" };
    const mode = forestWorksModeFor(building);
    const stand = forestStandAt(building);
    if (!stand) return { ok: false, reason: "No working forest in range" };
    if (!modeFitsStand(mode, stand)) return { ok: false, reason: "This wood cannot supply " + mode.label };
    if (!force) {
        if (building.construction && Number(building.construction.stage) < 3) return { ok: false, reason: "Under construction" };
        const workforce = getWorkforceSnapshot();
        if (getBuildingEfficiency(building, workforce) <= 0) return { ok: false, reason: "No woodwright is working this shop" };
    }
    const blockedGood = outputBlocked(mode);
    if (blockedGood) return { ok: false, reason: "Reserve is fully stocked: " + (INDUSTRY_GOODS[blockedGood]?.label || blockedGood) };
    if (outputSpace(building) < outputTotal(mode)) return { ok: false, reason: "Output store is full" };

    const ledger = ensureForestGathering();
    const inventory = ensureInventory(building);
    const missing = [];
    for (const need of standardNeed(mode)) {
        const have = Math.max(0, Number(inventory?.input?.[need.good]) || 0);
        if (have < need.amount) missing.push((need.amount - have) + " " + need.good);
    }
    const timber = mode.timber ? timberOptions(mode, inventory)[0] || null : null;
    if (mode.timber && !timber) missing.push((mode.timber.amount || 1) + " furniture-grade regional timber");
    for (const need of rawNeed(mode, ledger)) {
        if (need.available < need.amount) missing.push((need.amount - need.available) + " " + need.good);
    }
    if (missing.length) {
        requestWorksInputs(building, mode);
        return { ok: false, reason: "Waiting for " + missing.join(" · "), missing };
    }

    if (!consumeStandard(building, mode, productionLedger())) return { ok: false, reason: "Inputs changed before the batch" };
    if (!consumeTimber(building, timber)) return { ok: false, reason: "Timber changed before the batch" };
    if (!consumeRaw(mode, ledger)) return { ok: false, reason: "Forest stock changed before the batch" };

    const production = productionLedger();
    const accepted = {};
    for (const [good, amount] of Object.entries(mode.output)) {
        const stored = addLocalOutput(building, good, amount, { cause: "forest-works-output" });
        if (stored <= 0) continue;
        accepted[good] = stored;
        requestHaul(building, good, getAvailableOutput(building, good));
        production.forestFinished += stored;
    }
    if (!Object.keys(accepted).length) return { ok: false, reason: "Output store is full" };

    const nextBatches = Math.max(0, Math.floor(Number(building.forestBatches) || 0)) + 1;
    const mastery = forestMasteryFor({ forestBatches: nextBatches });
    let masteryBonus = null;
    if (mastery.bonusEvery > 0 && nextBatches % mastery.bonusEvery === 0) {
        const good = Object.keys(accepted).find(id => outputSpace(building) > 0 && Number(getPhysicalStock(id)) < (INDUSTRY_STOCK_TARGETS[id] || Infinity));
        if (good) {
            const stored = addLocalOutput(building, good, 1, { cause: "forest-mastery-bonus" });
            if (stored > 0) {
                accepted[good] += stored;
                production.forestFinished += stored;
                requestHaul(building, good, getAvailableOutput(building, good));
                masteryBonus = { good, amount: stored, level: mastery.level, label: mastery.label };
            }
        }
    }
    building.forestBatches = nextBatches;

    const style = mode.style ? furnitureStyleFor(stand.regionalType) : null;
    const quality = mode.style && timber ? timber.quality : woodQualityFor("logs", "construction");
    if (mode.style && timber) {
        const premium = Math.min(0.5, style.premium + quality.premium + mastery.premium + (quality.score >= 0.78 ? 0.06 : 0));
        production.forestFurniturePremium = Math.max(production.forestFurniturePremium, premium);
    }
    building.lastForestBatch = {
        mode: mode.id, label: mode.label, tick: Math.max(0, Math.floor(Number(state.tick) || 0)),
        output: accepted, style: style ? style.label : null, styleId: style ? style.id : null,
        quality: quality ? { classId: quality.classId, label: quality.label, grade: quality.grade, score: quality.score } : null,
        timber: timber?.good || null,
        mastery: { level: mastery.level, label: mastery.label, batches: nextBatches, bonus: masteryBonus },
    };
    production.forestBatches += 1;
    for (const need of Object.values(mode.raw || {})) production.forestRawConsumed += need;
    return { ok: true, mode: mode.id, label: mode.label, output: accepted, style, quality, timber: timber?.good || null };
}

export function updateForestIndustry() {
    if (!state.hasStarted) return false;
    if (state.tick === 0 || state.tick % FOREST_INDUSTRY_INTERVAL !== 0) return false;
    const works = state.entities.filter(entity => !entity.dead && entity.type === TYPE.FOREST_WORKS);
    if (!works.length) return false;
    const production = productionLedger();
    const start = works.length ? production.forestCursor % works.length : 0;
    const count = Math.min(FOREST_INDUSTRY_BATCH_BUDGET, works.length);
    let ran = 0;
    for (let offset = 0; offset < count; offset++) {
        const building = works[(start + offset) % works.length];
        if (runForestWorks(building).ok) ran++;
    }
    production.forestCursor = (start + count) % works.length;
    return ran > 0;
}

export function industryQuote(good) {
    const def = INDUSTRY_GOODS[good];
    if (!def) return null;
    const stock = Math.max(0, Number(getPhysicalStock(good)) || 0);
    const stockFactor = clamp(1.14 - Math.min(1, stock / 90) * 0.2, 0.92, 1.14);
    const furniturePremium = good === "furniture" ? 1 + productionLedger().forestFurniturePremium : 1;
    return round2(def.basePrice * seasonFactor() * stockFactor * furniturePremium * forestGuildMarketPremium(good));
}

export function industrySaleRows() {
    const production = productionLedger();
    return Object.entries(INDUSTRY_GOODS).map(([id, def]) => {
        const stock = Math.max(0, Number(getPhysicalStock(id)) || 0);
        return {
            id, label: def.label, use: def.use, stock,
            price: industryQuote(id), value: round2(stock * industryQuote(id)),
        };
    }).sort((a, b) => b.stock - a.stock || b.price - a.price || a.id.localeCompare(b.id));
}

export function forestIndustrySummary() {
    const works = state.entities.filter(entity => !entity.dead && entity.type === TYPE.FOREST_WORKS);
    const counts = {};
    let lastBatch = null;
    for (const building of works) {
        const id = forestWorksModeFor(building).id;
        counts[id] = (counts[id] || 0) + 1;
        if (building.lastForestBatch && (!lastBatch || building.lastForestBatch.tick > lastBatch.tick)) lastBatch = building.lastForestBatch;
    }
    const rows = industrySaleRows().filter(row => row.stock > 0);
    const production = productionLedger();
    const masteries = works.map(forestMasteryFor);
    const masteryBatches = masteries.reduce((sum, entry) => sum + entry.batches, 0);
    return {
        works: works.length,
        masteryBatches,
        masteryLevel: masteries.reduce((max, entry) => Math.max(max, entry.level), 1),
        masteryLabel: masteries.reduce((best, entry) => entry.level > best.level ? entry : best, masteries[0] || forestMasteryFor(null)).label,
        activeModes: Object.keys(counts).length,
        counts,
        lastBatch,
        rows,
        stored: rows.reduce((sum, row) => sum + row.stock, 0),
        value: round2(rows.reduce((sum, row) => sum + row.value, 0)),
        batches: production.forestBatches,
        rawConsumed: production.forestRawConsumed,
        finished: production.forestFinished,
        gold: production.forestGold,
        furniturePremium: production.forestFurniturePremium,
    };
}

// Real public-health supply: withdraw medicine from ordinary warehouses and
// place it directly into the clinic's finite store. This is the consumer that
// closes the apothecary loop from regional forest to a treated case.
export function supplyClinicMedicine(quantity = 6) {
    const health = state.health;
    if (!health || typeof health !== "object") return { ok: false, reason: "No public health service in this realm" };
    const current = Math.max(0, Math.floor(Number(health.medicineStock) || 0));
    const capacity = Math.max(0, MEDICINE_MAX_STOCK - current);
    if (capacity <= 0) return { ok: false, reason: "The clinic medicine store is full" };
    const available = Math.floor(industryWarehouseStock("medicine"));
    if (available <= 0) return { ok: false, reason: "No medicine in a warehouse store" };
    const want = Math.min(Math.max(1, Math.floor(Number(quantity) || 6)), capacity, available);
    const withdrawal = consumeIndustryGoodFromWarehouses("medicine", want, {
        cause: "clinic-medicine-supply",
        to: { kind: "health", id: "clinic-medicine-store" },
    });
    if (!withdrawal.ok) return { ok: false, reason: withdrawal.reason, available: withdrawal.available };
    const accepted = addMedicineStock(withdrawal.moved);
    if (accepted <= 0) return { ok: false, reason: "The clinic medicine store is full" };
    addLog("CLINIC MEDICINE SUPPLIED · " + accepted + " DOSES FROM THE FOREST APOTHECARY", "#9ab7a1", "health");
    return {
        ok: true, amount: accepted, stock: health.medicineStock, capacity: MEDICINE_MAX_STOCK,
        price: 0, label: "Medicine",
    };
}

// Sales pull real, unreserved stock from the existing warehouses. A workshop
// output still sitting on the bench is not sold until a carrier hauls it.
export function sellForestIndustryGood(good, quantity = 5) {
    const def = INDUSTRY_GOODS[good];
    if (!def) return { ok: false, reason: "Not a forest-industry good" };
    const price = industryQuote(good);
    const available = Math.max(0, Number(getPhysicalStock(good)) || 0);
    if (available < 1) return { ok: false, reason: "No " + def.label + " in store" };
    let remaining = Math.min(Math.max(1, Math.floor(Number(quantity) || 5)), available);
    let sold = 0;
    for (const entity of state.entities) {
        if (remaining <= 0) break;
        if (entity.dead || !entity.warehouse || !Array.isArray(entity.warehouse.filters)) continue;
        if (!entity.warehouse.filters.includes(good)) continue;
        const amount = consumeFromWarehouse(entity, good, remaining, {
            cause: "forest-industry-market",
            to: { kind: "market", id: "forest-industry-exchange" },
        });
        if (amount <= 0) continue;
        sold += amount;
        remaining -= amount;
    }
    if (sold <= 0) return { ok: false, reason: "The goods are reserved or still in a workshop store" };
    const gold = Math.max(sold, Math.round(sold * price));
    addResource("gold", gold);
    productionLedger().forestGold += gold;
    state.statistics.totalTrades = Math.max(0, Number(state.statistics.totalTrades) || 0) + 1;
    recordResourceMovement("gold", gold, "forest-industry-market", {
        from: { kind: "market", id: "forest-industry-exchange" },
        to: { kind: "realm", id: "royal-stores" },
    });
    return { ok: true, good, amount: sold, gold, price, label: def.label };
}
