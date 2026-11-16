// Winter HUD and the player's winter policy levers. The panel is presentation
// only: every action delegates to the deterministic winter ledger.
import {
    cycleWinterPolicy, getWinterSnapshot, refreshWinterSnapshot, upgradeWinterBuildings,
    upgradeWinterUnits,
} from "../world/winter-economy.js";
import { state } from "../core/state.js";

let feedback = "";
let feedbackUntil = 0;

const $ = id => document.getElementById(id);
const setText = (id, text) => { const node = $(id); if (node) node.textContent = text; };
const pct = value => Math.round(Math.max(0, Math.min(1, Number(value) || 0)) * 100) + "%";

function policyLabel(winter) {
    const clearance = winter.policy.clearance === "roads" ? "ROADS FIRST"
        : winter.policy.clearance === "harvest" ? "HARVEST FIRST"
            : winter.policy.clearance === "works" ? "WORKS FIRST" : "BALANCED";
    return {
        clearance,
        heating: winter.policy.heating === "reserve" ? "RESERVE" : "NORMAL",
        ice: winter.policy.iceRoads === "open" ? "OPEN" : "CLOSED",
        festival: winter.policy.festival ? "FESTIVAL ON" : "HOLD FESTIVAL",
    };
}

function renderIce(snapshot) {
    const list = $("winter-ice-list");
    if (!list) return;
    list.replaceChildren();
    if (!snapshot.iceRoads.length) {
        const empty = document.createElement("span");
        empty.className = "winter-ice-empty";
        empty.textContent = "NO FROZEN CROSSING IN REACH";
        list.appendChild(empty);
        return;
    }
    for (const route of snapshot.iceRoads.slice(0, 4)) {
        const chip = document.createElement("span");
        chip.className = "winter-ice-chip is-" + route.status;
        chip.textContent = route.status.toUpperCase() + " · " + route.capacity + " CARTS · " + Math.round(route.risk * 100) + "%";
        chip.title = "Ice route at " + route.x + "," + route.y;
        list.appendChild(chip);
    }
}

function renderEvents(snapshot) {
    const log = $("winter-event-log");
    if (!log) return;
    log.replaceChildren();
    const entries = (snapshot.eventLog || []).slice(0, 4);
    if (!entries.length) {
        const empty = document.createElement("span");
        empty.className = "winter-log-empty";
        empty.textContent = "NO WINTER DISPATCH YET — THE LEDGER RUNS EVERY 20 DAYS.";
        log.appendChild(empty);
        return;
    }
    for (const entry of entries) {
        const line = document.createElement("span");
        line.textContent = entry.text;
        log.appendChild(line);
    }
}

export function renderWinterHud() {
    const section = $("winter-section");
    if (!section) return;
    const active = (state.worldOptions?.climate || "temperate") === "snow" && state.hasStarted;
    section.classList.toggle("hidden", !active);
    if (!active) return;
    const snapshot = state.tick % 5 === 0 || !state.winter?.values?.snowDepth
        ? refreshWinterSnapshot() : getWinterSnapshot();
    const values = snapshot.values;
    const labels = policyLabel(snapshot);
    setText("winter-status", snapshot.iceRoads.some(route => route.status === "open") ? "ICE ROUTES ACTIVE" : "SNOWLANDS");
    setText("winter-snow-depth", Number(values.snowDepthM || values.snowDepth * 0.42 || 0).toFixed(2) + " m");
    setText("winter-bearing", "BEARING " + pct(values.bearing) + " · FLOW " + pct(values.transportSpeed));
    setText("winter-heating-demand", Number(values.heatingDemand || 0).toFixed(1) + " LOADS");
    setText("winter-heating-stock", "FUEL " + Math.round(values.heatingStock || 0) + (values.heatingShortfall > 0 ? " · MISSING " + pct(values.heatingShortfall) : ""));
    setText("winter-ice-roads", values.iceRoutesOpen ? values.iceRoutesOpen + " OPEN" : snapshot.iceRoads.length ? "CLOSED" : "NONE");
    setText("winter-ice-risk", "RISK " + pct(values.iceBreakRisk) + (values.iceCargoLost > 0 ? " · LOST " + Math.round(values.iceCargoLost) : ""));
    setText("winter-avalanche-risk", pct(values.avalancheRisk));
    setText("winter-pass", Number(values.passClosed) > 0.45 ? "PASS BLOCKED" : "PASS OPEN");
    setText("winter-meltwater", pct(values.meltwater));
    setText("winter-soil", "SOIL " + pct(values.soilTemperature) + " · INSULATION " + pct(values.insulation));
    setText("winter-supply", pct(values.transportSpeed));
    setText("winter-morale", "MORALE " + Math.round(Number(state.morale) || 0) + (values.foodStress > 0.55 ? " · FOOD STRESS" : ""));
    setText("winter-clearance-btn", "CLEARANCE · " + labels.clearance);
    setText("winter-heating-btn", "HEATING · " + labels.heating);
    setText("winter-ice-btn", "ICE ROADS · " + labels.ice);
    setText("winter-festival-btn", labels.festival);
    const upgrade = $("winter-upgrade-btn");
    if (upgrade) upgrade.textContent = "WINTERISE BUILDINGS · " + Math.round((values.buildingHardiness || 0) * 100) + "%";
    const kit = $("winter-kit-btn");
    if (kit) kit.textContent = "ISSUE WINTER KITS · " + Math.round((values.unitKit || 0) * 100) + "%";
    renderIce(snapshot);
    renderEvents(snapshot);
    if (feedback && Date.now() < feedbackUntil) {
        const note = document.createElement("span");
        note.className = "winter-feedback";
        note.textContent = feedback;
        $("winter-event-log")?.appendChild(note);
    }
}

function report(result, successText) {
    feedback = result?.ok ? successText : "WINTER ORDER REFUSED · " + String(result?.reason || "unknown").replaceAll("-", " ").toUpperCase();
    feedbackUntil = Date.now() + 6000;
    window.dispatchEvent(new CustomEvent("kac:winter-change"));
}

export function applyWinterAction(action) {
    if (action === "upgrade") {
        const result = upgradeWinterBuildings(2);
        report(result, result.ok ? "BUILDINGS WINTERISED · " + result.upgraded + " UPGRADED" : "");
        return result;
    }
    if (action === "kit") {
        const result = upgradeWinterUnits(2);
        report(result, result.ok ? "WINTER KITS ISSUED · " + result.equipped + " EQUIPPED" : "");
        return result;
    }
    const result = cycleWinterPolicy(action);
    if (result.ok) {
        feedback = "ORDER ISSUED · " + action.toUpperCase() + " UPDATED";
        feedbackUntil = Date.now() + 5000;
        window.dispatchEvent(new CustomEvent("kac:winter-change"));
    } else report(result, "");
    return result;
}

export function setupWinterHud() {
    document.addEventListener("click", event => {
        const button = event.target.closest?.("[data-winter-action]");
        if (!button) return;
        event.preventDefault();
        applyWinterAction(String(button.dataset.winterAction || ""));
    });
}
