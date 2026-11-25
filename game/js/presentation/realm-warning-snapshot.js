// A read-only HUD warning model. Domain systems keep their own state; this
// module only derives the small list of things a player must act on. It is
// called from renderTopStatus(), which the game loop already throttles to the
// HUD cadence, so no scan happens per frame or per simulation tick.
import { state } from "../core/state.js";
import { getRealmDamageSnapshot } from "../systems/building-repair.js";
import { getRoadConditionSnapshot } from "../systems/roads.js";
import { getDebtPressure, getFoodCrisisSnapshot } from "../systems/economy-cycle.js";

const DETAIL_LIMIT = 120;
let cachedRoadKey = "";
let cachedRoadSnapshot = null;

function limitText(value) {
    const text = String(value || "").replace(/\s+/g, " ").trim();
    return text.length > DETAIL_LIMIT ? text.slice(0, DETAIL_LIMIT - 1) + "…" : text;
}

function entry(id, label, detail, panel, extra = {}) {
    return { id, label, detail: limitText(detail), panel, ...extra };
}

// getRoadConditionSnapshot() walks roads and settlement obligations. Cache it
// by the existing revision and annual survey year; building/placing a road and
// running a wear survey both change that key. worldEpoch keeps a loaded save
// from reusing the previous realm's cached row.
function readRoadCondition() {
    const key = [state.worldEpoch || 0, Number(state.roads?.revision) || 0,
        Number(state.roads?.lastWearYear) || 0].join("|");
    if (!cachedRoadSnapshot || cachedRoadKey !== key) {
        cachedRoadKey = key;
        cachedRoadSnapshot = getRoadConditionSnapshot();
    }
    return cachedRoadSnapshot;
}

export function getRealmWarningSnapshot() {
    const entries = [];
    const activeEvent = state.activeEvent;
    if (activeEvent) {
        entries.push(entry(
            activeEvent.dismissed ? "issue-deferred" : "issue",
            activeEvent.dismissed ? "REALM ISSUE DEFERRED" : "REALM ISSUE",
            activeEvent.title || "An unresolved issue awaits the crown",
            // The live OPEN ISSUE control is in the Chronicle panel; the
            // Decisions tab is the royal-house screen and cannot resolve it.
            "chronicle"
        ));
    }
    if (state.health?.outbreakActive) {
        entries.push(entry("outbreak", "OUTBREAK",
            (state.health.disease && state.health.disease !== "none"
                ? String(state.health.disease).toUpperCase()
                : "A sickness is spreading"), "health"));
    }
    if (state.raidActive) {
        entries.push(entry("raid", "RAID", "Hostiles are inside the realm", "military"));
    }

    const damage = getRealmDamageSnapshot();
    if (damage.damaged > 0) {
        const worst = damage.worst
            ? damage.worst.name + " " + Math.max(0, Math.round(damage.worst.ratio * 100)) + "%"
            : "damaged structure";
        entries.push(entry("structure-damage", "STRUCTURE DAMAGE · " + damage.damaged,
            worst + " · " + damage.missingHp + " HP missing", "buildings"));
    }

    const roads = readRoadCondition();
    if (roads.worn > 0) {
        entries.push(entry("road-wear", "ROAD WEAR · " + roads.worn,
            "Worst " + roads.worst + "% · " + (roads.obligation?.owed?.wood || 0) + " wood owed",
            "build", { buildCategory: "roads" }));
    }

    const activeHazards = Array.isArray(state.environmentalHazards?.active)
        ? state.environmentalHazards.active
        : [];
    if (activeHazards.length) {
        entries.push(entry("hazards", "HAZARDS ACTIVE · " + activeHazards.length,
            activeHazards.slice(0, 3).map(hazard => String(hazard.label || hazard.mechanic || "hazard")).join(", "),
            "hazards"));
    }

    const crisis = getFoodCrisisSnapshot();
    const debtPressure = getDebtPressure();
    const severity = Number(crisis.severity) || 0;
    if (severity >= 0.25 || debtPressure >= 0.75) {
        const pieces = [];
        if (severity >= 0.25) pieces.push("food crisis " + Math.round(severity * 100) + "%");
        if (debtPressure >= 0.75) pieces.push("debt pressure " + Math.round(debtPressure * 100) + "%");
        entries.push(entry("economy", "ECONOMY", pieces.join(" · "), "economy"));
    }

    return {
        count: entries.length,
        entries,
        labels: entries.map(item => item.label),
        summary: entries.map(item => item.detail ? item.label + " — " + item.detail : item.label).join(" · "),
        primary: entries[0] || null
    };
}
