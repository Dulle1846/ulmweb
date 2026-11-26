// 1.2.23.1.181–190 — permanent grand consumers of the forest economy.
//
// The shipyard and paper mill are ordinary carrier-fed buildings with a custom
// bounded daily runtime. They consume real local input stock and feed existing
// systems: ships become a naval trade factor, paper becomes research reserve.
// There is no parallel economy, no output warehouse and no per-frame work.
import { state } from "../core/state.js";
import { TYPE } from "../core/types.js";
import { addLog } from "../core/event-log.js";
import { recordLegacy } from "./legacy.js";
import { getBuildingEfficiency, getWorkforceSnapshot } from "./economy.js";
import { ensureInventory, recordGoodMovement, requestSupply } from "./logistics.js";
import { forestPatronBonus } from "./forest-guild.js";
import { getNavalTradeBonus } from "./military.js";

export const GRAND_CONSUMER_INTERVAL = 60;
const MAX_RESEARCH_RESERVE = 240;

const clamp = (value, min, max) => Math.max(min, Math.min(max, Number.isFinite(Number(value)) ? Number(value) : min));
const integer = (value, min, max) => clamp(Math.floor(Number(value) || min), min, max);

const CONSUMERS = Object.freeze({
    [TYPE.SHIPYARD]: Object.freeze({
        id: "shipyard", label: "Shipyard", outputLabel: "hull",
        inputs: Object.freeze({ shipTimber: 2, pitch: 1, tar: 1, charcoal: 1, potash: 1 }),
        story: "Keels, seams and naval stores become a launched hull for the crown fleet.",
    }),
    [TYPE.PAPER_MILL]: Object.freeze({
        id: "paper-mill", label: "Paper Mill", outputLabel: "paper batch",
        inputs: Object.freeze({ paper: 2, potash: 1, charcoal: 1 }),
        story: "Rag paper, potash and charcoal become a clean research batch for the chancery.",
    }),
});

function grandLedger() {
    const economy = state.economy || (state.economy = {});
    const production = economy.productionChains || (economy.productionChains = {});
    if (!production.grandConsumers || typeof production.grandConsumers !== "object" || Array.isArray(production.grandConsumers)) {
        production.grandConsumers = {};
    }
    const ledger = production.grandConsumers;
    for (const id of ["shipyard", "paper-mill"]) {
        ledger[id] = ledger[id] && typeof ledger[id] === "object" ? ledger[id] : {};
        ledger[id].batches = integer(ledger[id].batches, 0, 100000000);
        ledger[id].lastTick = integer(ledger[id].lastTick, 0, Number.MAX_SAFE_INTEGER);
        ledger[id].lastStatus = String(ledger[id].lastStatus || "waiting").slice(0, 24);
        ledger[id].lastAmount = integer(ledger[id].lastAmount, 0, 100000000);
    }
    return ledger;
}

function completed(building) {
    return Boolean(building && !building.dead && building.isBuilding?.() && !(building.construction && Number(building.construction.stage) < 3));
}

function militaryShips() {
    if (!state.military || typeof state.military !== "object" || Array.isArray(state.military)) state.military = {};
    state.military.ships = integer(state.military.ships, 0, 1000000);
    return state.military;
}

function inputStock(building, inputs) {
    const inventory = ensureInventory(building);
    const stock = {};
    const missing = [];
    for (const [good, amount] of Object.entries(inputs)) {
        const have = Math.max(0, Number(inventory.input?.[good]) || 0);
        stock[good] = have;
        if (have < amount) missing.push({ good, need: amount, have, short: amount - have });
    }
    return { stock, missing };
}

function consumeInputs(building, consumer) {
    const inventory = ensureInventory(building);
    for (const [good, amount] of Object.entries(consumer.inputs)) {
        if ((Number(inventory.input?.[good]) || 0) < amount) return false;
    }
    for (const [good, amount] of Object.entries(consumer.inputs)) {
        inventory.input[good] -= amount;
        recordGoodMovement({
            type: "consumed", good, quantity: amount,
            from: { kind: "building", id: building.id },
            to: { kind: "grand-consumer", id: consumer.id },
            cause: "grand-consumer-input",
        });
    }
    return true;
}

function requestMissing(building, missing) {
    for (const entry of missing.slice(0, 2)) requestSupply(building, entry.good, Math.max(4, entry.need * 4));
}

// A readable, cheap status used by the building dossier and the atlas. It
// never mutates the building or requests a carrier, so rendering is pure.
export function grandConsumerStatusFor(building) {
    const consumer = CONSUMERS[building?.type];
    if (!consumer) return null;
    if (!completed(building)) return { ...consumer, status: "building", ok: false, missing: [], stock: {}, batches: 0, text: "Under construction" };
    const workforce = getWorkforceSnapshot();
    const efficiency = getBuildingEfficiency(building, workforce);
    const { stock, missing } = inputStock(building, consumer.inputs);
    const ledger = grandLedger()[consumer.id];
    if (efficiency <= 0) return { ...consumer, status: "unstaffed", ok: false, missing, stock, batches: ledger.batches, text: "No worker is assigned" };
    if (missing.length) return { ...consumer, status: "starved", ok: false, missing, stock, batches: ledger.batches, text: "Starved: " + missing.map(entry => entry.short + " " + entry.good).join(" · ") };
    return { ...consumer, status: "ready", ok: true, missing: [], stock, batches: ledger.batches, text: "Inputs ready; next batch in " + Math.max(0, GRAND_CONSUMER_INTERVAL - (Number(state.tick) || 0) % GRAND_CONSUMER_INTERVAL) + " days" };
}

function shipBonus() {
    return 1 + forestPatronBonus("naval-trade");
}

export function runGrandConsumer(building, { force = false } = {}) {
    const consumer = CONSUMERS[building?.type];
    if (!consumer) return { ok: false, reason: "Not a grand consumer" };
    const workforce = getWorkforceSnapshot();
    if (!force && getBuildingEfficiency(building, workforce) <= 0) {
        grandLedger()[consumer.id].lastStatus = "unstaffed";
        return { ok: false, reason: "No worker is assigned" };
    }
    const { missing } = inputStock(building, consumer.inputs);
    if (missing.length) {
        grandLedger()[consumer.id].lastStatus = "starved";
        requestMissing(building, missing);
        return { ok: false, reason: "Waiting for " + missing.map(entry => entry.short + " " + entry.good).join(" · ") };
    }
    if (!consumeInputs(building, consumer)) return { ok: false, reason: "Inputs changed before the batch" };

    const ledger = grandLedger()[consumer.id];
    const now = Math.max(0, Math.floor(Number(state.tick) || 0));
    ledger.batches += 1;
    ledger.lastTick = now;
    ledger.lastStatus = "running";
    if (consumer.id === "shipyard") {
        const military = militaryShips();
        military.ships += 1;
        ledger.lastAmount = 1;
        if (military.ships === 1 || military.ships % 10 === 0) {
            addLog("SHIPYARD LAUNCHED A HULL · FLEET " + military.ships + " · SEA-LANE TRADE +" + Math.round((getNavalTradeBonus() - 1) * 100) + "%", "#7e9bb0", "economy");
        }
        if (military.ships === 10) {
            recordLegacy("navy", "A fleet of ten hulls", "The royal shipyard has launched ten seaworthy hulls.", { importance: 3 });
        }
        return { ok: true, amount: 1, ships: military.ships, tradeBonus: getNavalTradeBonus() * shipBonus() };
    }
    const research = state.research && typeof state.research === "object" ? state.research : (state.research = {});
    const points = Math.max(1, Math.round(8 * (1 + forestPatronBonus("research", "paper"))));
    research.reserve = Math.min(MAX_RESEARCH_RESERVE, Math.max(0, Number(research.reserve) || 0) + points);
    ledger.lastAmount = points;
    if (ledger.batches === 1 || ledger.batches % 25 === 0) {
        addLog("PAPER MILL FINISHED A BATCH · +" + points + " RESEARCH RESERVE", "#8fae9a", "economy");
    }
    return { ok: true, amount: points, reserve: research.reserve };
}

export function updateGrandConsumers() {
    if (!state.hasStarted) return false;
    if (state.tick === 0 || state.tick % GRAND_CONSUMER_INTERVAL !== 0) return false;
    let changed = false;
    for (const building of state.entities) {
        if (building.dead || !CONSUMERS[building.type] || !completed(building)) continue;
        const result = runGrandConsumer(building);
        if (result.ok) changed = true;
    }
    return changed;
}

export function grandConsumersSummary() {
    const rows = state.entities
        .filter(entity => !entity.dead && CONSUMERS[entity.type])
        .sort((a, b) => String(a.id).localeCompare(String(b.id)))
        .map(entity => {
            const status = grandConsumerStatusFor(entity);
            return { ...status, id: entity.id, type: entity.type };
        });
    const ledger = grandLedger();
    return {
        rows,
        shipyards: rows.filter(row => row.type === TYPE.SHIPYARD).length,
        paperMills: rows.filter(row => row.type === TYPE.PAPER_MILL).length,
        ships: Math.max(0, Math.floor(Number(state.military?.ships) || 0)),
        tradeBonusPct: Math.round((getNavalTradeBonus() - 1) * 100),
        shipBatches: ledger.shipyard.batches,
        paperBatches: ledger["paper-mill"].batches,
        reserve: Math.max(0, Math.floor(Number(state.research?.reserve) || 0)),
        last: rows.reduce((last, row) => !last || row.status === "starved" ? row : last, null),
        consumers: CONSUMERS,
    };
}
