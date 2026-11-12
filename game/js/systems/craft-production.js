// Unique workshop production. A staffed, supplied and funded smithy or
// scriptorium records at most one player-made item per season. The workshop
// draws its ordinary inputs from its own logistics store, pays for imported
// metal, parchment and ink from the treasury, and writes a stable record into
// the same crafted archive the lexicon reads. No per-frame or per-tick scan of
// the whole archive is needed: production is checked on a bounded cadence.
import { state } from "../core/state.js";
import { TYPE } from "../core/types.js";
import { CRAFT_RECIPES } from "./city-config.js";
import { appendCraftedItem, createCraftedItem } from "./item-lexicon.js";
import { getBuildingEfficiency } from "./economy.js";
import { ensureInventory, requestSupply, recordGoodMovement } from "./logistics.js";
import { addResource } from "./resources.js";
import { getJobSkill } from "./skills.js";

// One finished unique per season, and a supply check twice a season. Both
// intervals are tick-based so a paused game, a reload or a frame hitch cannot
// create extra work or extra items.
export const CRAFT_INTERVAL = 90;
export const CRAFT_SUPPLY_INTERVAL = 30;
export const CRAFT_SUPPLY_TARGET = 8;
const CRAFT_WORKSHOPS = new Set([TYPE.SMITHY, TYPE.SCRIPTORIUM]);
const EVENT_LOG_LIMIT = 100;

function number(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function hashText(value) {
    let hash = 2166136261;
    for (const character of String(value)) {
        hash ^= character.charCodeAt(0);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function workersAt(building) {
    return state.entities
        .filter(entity => !entity.dead && entity.type === TYPE.VILLAGER &&
            entity.workplace === building && (number(entity.illnessUntilTick, 0) <= state.tick))
        .sort((left, right) => String(left.personId || left.id).localeCompare(String(right.personId || right.id)) ||
            String(left.id).localeCompare(String(right.id)));
}

function chooseWorker(building, workers, recipe) {
    if (!workers.length) return null;
    const seed = hashText([state.worldSeed, building.id, state.tick, recipe.kind].join("|"));
    return workers[seed % workers.length];
}

function inputReady(building, recipe) {
    const inventory = ensureInventory(building);
    if (!inventory) return false;
    return Object.entries(recipe.inputs).every(([good, amount]) => number(inventory.input[good], 0) >= amount);
}

function requestWorkshopInputs(building, recipe) {
    const inventory = ensureInventory(building);
    if (!inventory) return;
    for (const [good, amount] of Object.entries(recipe.inputs)) {
        const held = number(inventory.input[good], 0);
        if (held >= amount) continue;
        const free = Math.max(0, CRAFT_SUPPLY_TARGET - held);
        if (free > 0) requestSupply(building, good, free);
    }
}

function consumeWorkshopInputs(building, recipe) {
    const inventory = ensureInventory(building);
    if (!inventory) return false;
    if (!Object.entries(recipe.inputs).every(([good, amount]) => number(inventory.input[good], 0) >= amount)) return false;
    for (const [good, amount] of Object.entries(recipe.inputs)) {
        inventory.input[good] -= amount;
        recordGoodMovement({
            type: "consumed", good, quantity: amount,
            from: { kind: "building", id: building.id },
            to: { kind: "recipe", id: recipe.label },
            cause: "craft-input"
        });
    }
    return true;
}

function alreadyCraftedThisSeason(building, recipe) {
    return (state.craftedItems || []).some(entry =>
        entry && entry.tick === state.tick && entry.workshop === recipe.workshop && entry.kind === recipe.kind
    );
}

function craftLedger() {
    const economy = state.economy || (state.economy = {});
    const ledger = economy.crafting && typeof economy.crafting === "object" ? economy.crafting : (economy.crafting = {});
    for (const key of ["itemsMade", "weapons", "books", "goldSpent"]) ledger[key] = Math.max(0, number(ledger[key], 0));
    return ledger;
}

function recordCraft(item, recipe) {
    const ledger = craftLedger();
    ledger.itemsMade += 1;
    ledger[recipe.kind === "book" ? "books" : "weapons"] += 1;
    ledger.goldSpent += recipe.goldCost;
    ledger.lastItemId = item.id;
    ledger.lastItemLabel = item.label;
    ledger.lastCraftedTick = state.tick;
    ledger.lastWorkshop = recipe.workshop;

    state.eventLog.push({
        text: "A " + item.qualityBand.toUpperCase() + " " + item.label.toUpperCase() +
            " WAS MADE AT THE " + recipe.workshop.toUpperCase() + " · YEAR " + state.year,
        kind: "craft",
        tick: state.tick,
        id: ++state.eventSequence
    });
    if (state.eventLog.length > EVENT_LOG_LIMIT) state.eventLog.shift();
}

/**
 * Runs on the fixed simulation tick. Supply checks happen every thirty ticks;
 * finished items are created only every ninety ticks. A call outside either
 * cadence is a single modulo check and does no world scanning.
 */
export function updateCraftProduction() {
    if (!state.hasStarted || state.isPaused || state.gameOver || state.tick <= 0) return 0;
    const tick = state.tick;
    const supplyTick = tick % CRAFT_SUPPLY_INTERVAL === 0;
    const craftTick = tick % CRAFT_INTERVAL === 0;
    if (!supplyTick && !craftTick) return 0;

    const workshops = state.entities
        .filter(entity => !entity.dead && entity.isBuilding() && CRAFT_WORKSHOPS.has(entity.type) && CRAFT_RECIPES[entity.type])
        .sort((left, right) => String(left.id).localeCompare(String(right.id)));
    let made = 0;

    for (const building of workshops) {
        const recipe = CRAFT_RECIPES[building.type];
        if (!recipe) continue;
        if (building.construction && building.construction.stage < 3) {
            building.productionReason = "Under construction";
            continue;
        }

        if (supplyTick) requestWorkshopInputs(building, recipe);
        if (!craftTick) continue;

        if (alreadyCraftedThisSeason(building, recipe)) {
            building.productionReason = "This season's work is already recorded";
            continue;
        }

        const workers = workersAt(building);
        if (!workers.length) {
            building.productionReason = "No staff assigned";
            continue;
        }
        const efficiency = getBuildingEfficiency(building);
        if (efficiency <= 0) {
            building.productionReason = "No staff assigned";
            continue;
        }
        if (!inputReady(building, recipe)) {
            building.productionReason = "Waiting for workshop stock";
            requestWorkshopInputs(building, recipe);
            continue;
        }
        if ((number(state.resources.gold, 0)) < recipe.goldCost) {
            building.productionReason = "Treasury cannot buy imported materials";
            continue;
        }

        const worker = chooseWorker(building, workers, recipe);
        if (!worker) {
            building.productionReason = "No staff assigned";
            continue;
        }
        const person = worker.person || null;
        const crafterId = String(worker.personId || person?.id || worker.id);
        const crafterName = String(person?.name || (building.type === TYPE.SMITHY ? "Master Smith" : "Master Scribe"));
        const skill = getJobSkill(worker);
        const variance = hashText([state.worldSeed, building.id, tick, "quality"].join("|")) % 15;
        const quality = Math.round(clamp(28 + skill * 0.5 + Math.min(1, efficiency) * 18 + variance, 1, 100));
        const item = createCraftedItem({
            kind: recipe.kind,
            materials: recipe.materials,
            crafterId,
            crafterName,
            workshop: recipe.workshop,
            year: state.year,
            tick,
            // One serial per season is stable across a save/reload. The archive
            // guard above prevents a second item in the same season even when
            // tests or a repaired frame call the tick twice.
            serial: Math.floor(tick / CRAFT_INTERVAL),
            worldSeed: state.worldSeed,
            quality
        });

        if (!item || (state.craftedItems || []).some(entry => entry.id === item.id)) {
            building.productionReason = "This season's work is already recorded";
            continue;
        }
        if (!consumeWorkshopInputs(building, recipe)) {
            building.productionReason = "Waiting for workshop stock";
            continue;
        }

        addResource("gold", -recipe.goldCost);
        state.craftedItems = appendCraftedItem(state.craftedItems || [], item);
        recordCraft(item, recipe);
        building.productionReason = item.label + " recorded";
        made += 1;
    }
    return made;
}
