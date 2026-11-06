// Building production and recurring settlement income. Physical producers
// place goods into their local stores; logistics carriers move them to a
// warehouse or consumer. Only bread is converted to the royal food ledger at
// the warehouse, after the carrier has actually delivered it.
import { TYPE } from "../core/types.js";
import { state } from "../core/state.js";
import { getEntitiesOfType } from "../world/entities.js";
import { addResource } from "../systems/resources.js";
import { getWorkforceSnapshot, getBuildingEfficiency } from "../systems/economy.js";
import { RECIPES } from "../systems/city-config.js";
import {
    ensureInventory, addLocalOutput, getAvailableInput, getAvailableOutput,
    requestSupply, requestHaul, getBuildingSupplyReason, outputSpace, recordGoodMovement
} from "../systems/logistics.js";
import { findNearestResourceNode, harvestForest, extractStone } from "../systems/resource-geography.js";

import { recordResourceMovement } from "../systems/goods-book.js";

const PRODUCTION_INTERVAL = 6;
const CIVIC_INTERVAL = 55;

function ledger() {
    const economy = state.economy || (state.economy = {});
    const production = economy.productionChains || (economy.productionChains = {});
    for (const key of ["logsHarvested", "stoneExtracted", "planksProduced", "flourProduced", "breadProduced", "waterDrawn", "grainHarvested", "millWoodConsumed", "millBonusFood", "tavernFoodConsumed", "tavernGoldProduced"]) {
        production[key] = Math.max(0, Number(production[key]) || 0);
    }
    return production;
}

function canWork(building, workforce) {
    return !building.construction || building.construction.stage >= 3
        ? getBuildingEfficiency(building, workforce) > 0
        : false;
}

function requestInputs(building) {
    const recipe = RECIPES[building.type];
    if (!recipe?.input) return true;
    const available = getAvailableInput(building);
    for (const [good, amount] of Object.entries(recipe.input)) {
        if (available[good] < amount) {
            requestSupply(building, good, amount - available[good]);
            return false;
        }
    }
    return true;
}

function consumeInputs(building) {
    const recipe = RECIPES[building.type];
    const inventory = ensureInventory(building);
    for (const [good, amount] of Object.entries(recipe.input || {})) {
        if (inventory.input[good] < amount) return false;
    }
    for (const [good, amount] of Object.entries(recipe.input || {})) {
        inventory.input[good] -= amount;
        recordGoodMovement({
            type: "consumed", good, quantity: amount,
            from: { kind: "building", id: building.id }, to: { kind: "recipe", id: recipe.label },
            cause: "recipe-input"
        });
    }
    return true;
}

function finishOutput(building, output, production) {
    const recipe = RECIPES[building.type];
    for (const [good, amount] of Object.entries(output)) {
        const accepted = addLocalOutput(building, good, amount, { cause: "recipe-output" });
        if (accepted > 0) {
            if (good === "logs") production.logsHarvested += accepted;
            else if (good === "planks") production.planksProduced += accepted;
            else if (good === "flour") production.flourProduced += accepted;
            else if (good === "bread") production.breadProduced += accepted;
            else if (good === "water") production.waterDrawn += accepted;
            else if (good === "grain") production.grainHarvested += accepted;
            requestHaul(building, good, getAvailableOutput(building, good));
        }
    }
}

function canStoreOutput(building, output) {
    const required = Object.values(output).reduce((sum, amount) => sum + Math.max(0, Number(amount) || 0), 0);
    return outputSpace(building) >= required;
}

function produceRecipe(building, workforce, production) {
    const recipe = RECIPES[building.type];
    if (!recipe || recipe.field) return;
    if (!canWork(building, workforce)) {
        building.productionReason = building.construction && building.construction.stage < 3 ? "Under construction" : "No staff assigned";
        return;
    }
    ensureInventory(building);
    if (recipe.site === "forest" || recipe.site === "stone" || recipe.site === "water") {
        if (!canStoreOutput(building, recipe.site === "forest" ? { logs: recipe.batch } : recipe.site === "stone" ? { stoneBlocks: Math.max(1, Math.floor(recipe.batch * 2 / 2)) } : { water: recipe.batch })) {
            building.productionReason = "Output store is full";
            return;
        }
        const node = findNearestResourceNode(recipe.site, building.x, building.y, recipe.site === "water" ? 8 : 7);
        if (!node) {
            building.productionReason = recipe.site === "forest" ? "No forest in working range" : recipe.site === "stone" ? "No stone deposit in working range" : "No water in working range";
            return;
        }
        if (recipe.site === "forest") {
            const taken = harvestForest(node.x, node.y, recipe.batch);
            if (taken <= 0) { building.productionReason = "Forest stand is depleted"; return; }
            finishOutput(building, { logs: taken }, production);
            return;
        }
        if (recipe.site === "stone") {
            const taken = extractStone(node.x, node.y, recipe.batch * 2);
            if (taken <= 0) { building.productionReason = "Stone deposit is depleted"; return; }
            production.stoneExtracted += taken;
            finishOutput(building, { stoneBlocks: Math.max(1, Math.floor(taken / 2)) }, production);
            return;
        }
        if (recipe.site === "water") {
            finishOutput(building, { water: recipe.batch }, production);
            return;
        }
    }
    if (!requestInputs(building)) {
        building.productionReason = getBuildingSupplyReason(building) || "Waiting for input stock";
        return;
    }
    const efficiency = Math.max(0.35, getBuildingEfficiency(building, workforce));
    const output = {};
    for (const [good, amount] of Object.entries(recipe.output || {})) output[good] = Math.max(0, Math.round(amount * efficiency));
    if (!canStoreOutput(building, output)) {
        building.productionReason = "Output store is full";
        return;
    }
    if (!consumeInputs(building)) return;
    finishOutput(building, output, production);
    building.productionReason = null;
}

export function updateBuildingIncome() {
    const tick = state.tick;
    const productionTick = tick % PRODUCTION_INTERVAL === 0;
    const civicTick = tick % CIVIC_INTERVAL === 0;
    if (!productionTick && !civicTick) return;
    const workforce = getWorkforceSnapshot();
    const production = ledger();
    if (productionTick) {
        for (const building of state.entities) {
            if (!building.dead && building.isBuilding() && RECIPES[building.type]) produceRecipe(building, workforce, production);
        }
        for (const temple of getEntitiesOfType(TYPE.TEMPLE)) {
            if (temple.construction && temple.construction.stage < 3) continue;
            state.morale = Math.min(100, state.morale + 0.6 * getBuildingEfficiency(temple, workforce));
        }
        for (const mine of getEntitiesOfType(TYPE.GOLDMINE)) {
            if (mine.construction && mine.construction.stage < 3) continue;
            addResource("gold", (state.seasonIndex === 3 ? 1 : 2) * getBuildingEfficiency(mine, workforce));
        }
    }
    if (civicTick) {
        for (const tavern of getEntitiesOfType(TYPE.TAVERN)) {
            if (tavern.construction && tavern.construction.stage < 3) continue;
            const efficiency = getBuildingEfficiency(tavern, workforce);
            if (efficiency <= 0) continue;
            const provisions = Math.min(Number(state.resources.food) || 0, efficiency);
            if (provisions <= 0) continue;
            recordResourceMovement("food", -provisions, "tavern-provisions", {
                from: { kind: "realm", id: "royal-stores" }, to: { kind: "building", id: tavern.id },
                key: "food:tavern:" + tavern.id + ":" + state.tick
            });
            addResource("food", -provisions);
            const gold = 3 * efficiency * (provisions / Math.max(0.0001, efficiency));
            addResource("gold", gold);
            production.tavernFoodConsumed += provisions;
            production.tavernGoldProduced += gold;
            state.morale = Math.min(100, state.morale + 0.6 * efficiency);
        }
        for (const mill of getEntitiesOfType(TYPE.MILL)) {
            if (mill.construction && mill.construction.stage < 3) continue;
            const flour = mill.inventory?.output?.flour || 0;
            if (flour > 0) requestHaul(mill, "flour", flour);
        }
    }
}
