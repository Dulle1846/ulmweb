// The living realm cycle.
//
// Scarcity is read from the real granary, the settled 20-day ledger and the
// regional market. It raises market pressure, then civic unrest. Sustained
// unrest opens a real petition; the crown can release grain, negotiate a guild
// compact or requisition market stores. Every choice changes existing systems:
// resources, market stock and prices, faction politics, morale, settlement
// needs and therefore the next harvest of demand. The loop is deliberately
// damped and bounded so it can recover instead of spiralling.
import { state } from "../core/state.js";
import { addLog } from "../core/event-log.js";
import { addResource } from "./resources.js";
import { applyPoliticalEffects } from "./politics.js";

export const REALM_CYCLE_VERSION = 1;
export const REALM_CYCLE_INTERVAL = 20;
export const REALM_CYCLE_HISTORY_LIMIT = 24;
export const REALM_PETITION_THRESHOLD = 0.42;
export const REALM_PETITION_COOLDOWN = 120;
export const REALM_PETITION_LIFETIME = 160;
export const REALM_RELIEF_GOLD = 18;
export const BASE_FOOD_PRICE = 2;
export const REALM_PHASES = Object.freeze(["prosperity", "stable", "strain", "crisis"]);

const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, Number.isFinite(Number(value)) ? Number(value) : min));
const clamp100 = value => clamp(value, 0, 100);
const round2 = value => Math.round((Number(value) || 0) * 100) / 100;
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const phaseSet = new Set(REALM_PHASES);

function currentTick() {
    return Math.max(0, Math.floor(finite(state.tick)));
}

function currentYear() {
    return Math.max(1, Math.floor(finite(state.year, 1)));
}

function populationCount() {
    const ledger = state.economy?.lastLedger;
    const registered = state.population?.totals?.population;
    return Math.max(0, Math.floor(finite(registered ?? ledger?.population)));
}

function marketPartners() {
    const partners = state.market?.partners;
    return Array.isArray(partners) ? partners : [];
}

function firstOpenPartner() {
    for (const partner of marketPartners()) {
        if (!partner || typeof partner !== "object") continue;
        const realm = Array.isArray(state.diplomacy?.realms)
            ? state.diplomacy.realms.find(item => item?.id === partner.id)
            : null;
        if (realm?.treaty === "war") continue;
        return partner;
    }
    return null;
}

function regionalFoodStock() {
    let stock = 0;
    let partners = 0;
    for (const partner of marketPartners()) {
        if (!partner || typeof partner !== "object") continue;
        stock += Math.max(0, finite(partner.stock?.food));
        partners++;
    }
    return { stock, partners, target: Math.max(1, 90 * partners) };
}

function existingMigrationYear() {
    const year = Math.floor(finite(state.city?.needs?.lastMigrationYear));
    return Math.max(0, year);
}

export function createRealmCycleState() {
    return {
        version: REALM_CYCLE_VERSION,
        lastUpdateTick: 0,
        phase: "stable",
        scarcity: 0,
        marketPressure: 0,
        unrest: 0,
        prosperity: 0.55,
        petition: null,
        lastPetitionTick: 0,
        lastActionTick: 0,
        lastAction: null,
        lastResolution: null,
        totalPetitions: 0,
        resolvedPetitions: 0,
        ignoredPetitions: 0,
        concessions: 0,
        coercions: 0,
        displacement: 0,
        lastDisplacementYear: existingMigrationYear(),
        history: []
    };
}

function normalizePetition(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const faction = value.faction === "guilds" ? "guilds" : "commons";
    const createdTick = Math.max(0, Math.floor(finite(value.createdTick)));
    if (!createdTick) return null;
    return {
        id: String(value.id || ("realm-petition:" + createdTick)).slice(0, 80),
        faction,
        title: String(value.title || "A petition from the households").slice(0, 120),
        demand: String(value.demand || "Restore the flow of grain and calm the market.").slice(0, 220),
        severity: round2(clamp(value.severity)),
        createdTick,
        expiresTick: Math.max(createdTick + 1, Math.floor(finite(value.expiresTick, createdTick + REALM_PETITION_LIFETIME)))
    };
}

function normalizeHistory(value) {
    if (!Array.isArray(value)) return [];
    const rows = [];
    for (const entry of value.slice(-REALM_CYCLE_HISTORY_LIMIT)) {
        if (!entry || typeof entry !== "object") continue;
        rows.push({
            tick: Math.max(0, Math.floor(finite(entry.tick))),
            year: Math.max(1, Math.floor(finite(entry.year, 1))),
            phase: phaseSet.has(entry.phase) ? entry.phase : "stable",
            scarcity: round2(clamp(entry.scarcity)),
            marketPressure: round2(clamp(entry.marketPressure)),
            unrest: round2(clamp(entry.unrest)),
            prosperity: round2(clamp(entry.prosperity)),
            petition: Boolean(entry.petition)
        });
    }
    return rows;
}

export function normalizeRealmCycleState(input = state.realmCycle) {
    const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
    const normalized = {
        version: REALM_CYCLE_VERSION,
        lastUpdateTick: Math.max(0, Math.floor(finite(source.lastUpdateTick))),
        phase: phaseSet.has(source.phase) ? source.phase : "stable",
        scarcity: clamp(source.scarcity),
        marketPressure: clamp(source.marketPressure),
        unrest: clamp(source.unrest),
        prosperity: clamp(finite(source.prosperity, 0.55), 0, 1),
        petition: normalizePetition(source.petition),
        lastPetitionTick: Math.max(0, Math.floor(finite(source.lastPetitionTick))),
        lastActionTick: Math.max(0, Math.floor(finite(source.lastActionTick))),
        lastAction: source.lastAction == null ? null : String(source.lastAction).slice(0, 40),
        lastResolution: source.lastResolution == null ? null : String(source.lastResolution).slice(0, 220),
        totalPetitions: Math.max(0, Math.floor(finite(source.totalPetitions))),
        resolvedPetitions: Math.max(0, Math.floor(finite(source.resolvedPetitions))),
        ignoredPetitions: Math.max(0, Math.floor(finite(source.ignoredPetitions))),
        concessions: Math.max(0, Math.floor(finite(source.concessions))),
        coercions: Math.max(0, Math.floor(finite(source.coercions))),
        displacement: Math.max(0, Math.floor(finite(source.displacement))),
        lastDisplacementYear: Math.max(0, Math.floor(finite(source.lastDisplacementYear, existingMigrationYear()))),
        history: normalizeHistory(source.history)
    };
    // The first update after a legacy save must not mistake an old migration
    // record for a fresh displacement caused by this cycle.
    if (!Number.isFinite(Number(source.lastDisplacementYear))) {
        normalized.lastDisplacementYear = existingMigrationYear();
    }
    state.realmCycle = normalized;
    return normalized;
}

export function ensureRealmCycle() {
    if (!state.realmCycle || typeof state.realmCycle !== "object" || Array.isArray(state.realmCycle) || state.realmCycle.version !== REALM_CYCLE_VERSION) {
        return normalizeRealmCycleState(state.realmCycle);
    }
    return state.realmCycle;
}

function readSignals() {
    const economy = state.economy && typeof state.economy === "object" ? state.economy : {};
    const ledger = economy.lastLedger && typeof economy.lastLedger === "object" ? economy.lastLedger : {};
    const cityNeeds = state.city?.needs?.summary;
    const resources = state.resources && typeof state.resources === "object" ? state.resources : {};
    const food = Math.max(0, finite(resources.food));
    const population = populationCount();
    const demand = Math.max(0.0001, finite(ledger.foodDemand, population * 0.30));
    const shortage = Math.max(0, finite(ledger.foodShortage));
    const crisis = clamp(economy.foodCrisis?.severity);
    const morale = clamp100(state.morale) / 100;
    const satisfaction = clamp(cityNeeds?.satisfaction, 0, 1);
    const unemployment = population > 0 ? clamp(finite(ledger.unemployed) / population) : 0;
    const debtPressure = clamp(finite(economy.debt) / 1200);
    const foodPrice = Math.max(0.01, finite(state.market?.prices?.food, BASE_FOOD_PRICE));
    const priceRatio = clamp((foodPrice / BASE_FOOD_PRICE - 1) / 1.2);
    const regional = regionalFoodStock();
    const regionalDeficit = clamp((regional.target - regional.stock) / regional.target);
    const reserveRatio = clamp(food / demand, 0, 2);
    const reserveStress = 1 - clamp(reserveRatio, 0, 1);
    const shortageRatio = clamp(shortage / demand);
    const scarcityTarget = clamp(
        reserveStress * 0.30 +
        shortageRatio * 0.34 +
        crisis * 0.14 +
        priceRatio * 0.12 +
        (1 - satisfaction) * 0.10
    );
    const marketTarget = clamp(
        priceRatio * 0.30 +
        regionalDeficit * 0.22 +
        shortageRatio * 0.24 +
        crisis * 0.12 +
        debtPressure * 0.06 +
        Math.max(0, 0.55 - morale) * 0.06
    );
    return {
        food, population, demand, shortage, crisis, morale, satisfaction,
        unemployment, debtPressure, foodPrice, priceRatio, regional,
        regionalDeficit, reserveRatio, scarcityTarget, marketTarget
    };
}

function derivePhase(scarcity, marketPressure, unrest, prosperity) {
    if (unrest >= 0.67 || (scarcity >= 0.60 && marketPressure >= 0.50)) return "crisis";
    if (unrest >= 0.38 || scarcity >= 0.35 || marketPressure >= 0.40) return "strain";
    if (prosperity >= 0.66 && scarcity < 0.18 && unrest < 0.20) return "prosperity";
    return "stable";
}

function recordPetition(cycle, now, signals) {
    const faction = signals.scarcityTarget >= signals.marketTarget ? "commons" : "guilds";
    const title = faction === "commons" ? "Bread for the Households" : "A Fair Price in the Market";
    const demand = faction === "commons"
        ? "Open the crown granary or force grain onto the market before the households are emptied."
        : "Restore market stock and steady the grain price before the guilds close their stalls.";
    cycle.petition = {
        id: "realm-petition:" + now,
        faction,
        title,
        demand,
        severity: round2(Math.max(signals.scarcityTarget, signals.marketTarget)),
        createdTick: now,
        expiresTick: now + REALM_PETITION_LIFETIME
    };
    cycle.totalPetitions++;
    cycle.lastPetitionTick = now;
    applyPoliticalEffects({ legitimacy: -1.5, commons: faction === "commons" ? -2.5 : -0.5, guilds: faction === "guilds" ? -2.5 : -0.5 });
    addLog("A " + (faction === "commons" ? "HOUSEHOLD" : "GUILD") + " PETITION REACHES THE CROWN — " + title.toUpperCase(), "#d8a25d", "politics");
}

function expirePetition(cycle, now) {
    if (!cycle.petition || now < cycle.petition.expiresTick) return false;
    const petition = cycle.petition;
    cycle.petition = null;
    cycle.ignoredPetitions++;
    cycle.lastPetitionTick = now;
    cycle.unrest = clamp(cycle.unrest + 0.16);
    cycle.prosperity = clamp(cycle.prosperity - 0.08);
    state.morale = clamp100(finite(state.morale) - 1.8);
    applyPoliticalEffects({
        legitimacy: -1.2,
        commons: petition.faction === "commons" ? -2.2 : -0.8,
        guilds: petition.faction === "guilds" ? -2.2 : -0.8
    });
    addLog("THE PETITION IS LEFT UNANSWERED — " + petition.title.toUpperCase(), "#c77c62", "politics");
    return true;
}

function captureDisplacement(cycle) {
    const migrationYear = existingMigrationYear();
    if (migrationYear <= cycle.lastDisplacementYear) return false;
    cycle.lastDisplacementYear = migrationYear;
    cycle.displacement++;
    cycle.unrest = clamp(cycle.unrest + 0.04);
    cycle.history.push({
        tick: currentTick(), year: migrationYear, phase: derivePhase(cycle.scarcity, cycle.marketPressure, cycle.unrest, cycle.prosperity),
        scarcity: round2(cycle.scarcity), marketPressure: round2(cycle.marketPressure),
        unrest: round2(cycle.unrest), prosperity: round2(cycle.prosperity), petition: false
    });
    if (cycle.history.length > REALM_CYCLE_HISTORY_LIMIT) cycle.history.shift();
    return true;
}

export function updateRealmCycle() {
    const cycle = ensureRealmCycle();
    const now = currentTick();
    if (now - cycle.lastUpdateTick < REALM_CYCLE_INTERVAL) return null;
    cycle.lastUpdateTick = now;
    const signals = readSignals();

    // A bounded first-order filter is the damper. It lets scarcity and unrest
    // move quickly enough to be felt, but never jumps to a target in one day.
    cycle.scarcity = clamp(cycle.scarcity + (signals.scarcityTarget - cycle.scarcity) * 0.28);
    cycle.marketPressure = clamp(cycle.marketPressure + (signals.marketTarget - cycle.marketPressure) * 0.22);
    const civicTarget = clamp(
        cycle.scarcity * 0.46 +
        cycle.marketPressure * 0.20 +
        (1 - signals.morale) * 0.18 +
        (1 - signals.satisfaction) * 0.10 +
        signals.unemployment * 0.06
    );
    cycle.unrest = clamp(cycle.unrest + (civicTarget - cycle.unrest) * 0.25);
    const prosperityTarget = clamp(
        (1 - cycle.scarcity) * 0.35 +
        (1 - cycle.marketPressure) * 0.25 +
        signals.satisfaction * 0.20 +
        signals.morale * 0.20 -
        signals.debtPressure * 0.15
    );
    cycle.prosperity = clamp(cycle.prosperity + (prosperityTarget - cycle.prosperity) * 0.12);

    // The cycle reaches the existing morale and politics rather than living in
    // a display-only field. Sustained strain is costly; a prosperous, well-fed
    // realm earns a small recovery dividend.
    if (cycle.unrest > 0.32) {
        state.morale = clamp100(finite(state.morale) - (cycle.unrest - 0.32) * 0.65);
    } else if (cycle.prosperity > 0.62) {
        state.morale = clamp100(finite(state.morale) + (cycle.prosperity - 0.62) * 0.12);
    }

    captureDisplacement(cycle);
    expirePetition(cycle, now);
    const petitionDue = !cycle.petition &&
        cycle.unrest >= REALM_PETITION_THRESHOLD &&
        now - cycle.lastPetitionTick >= REALM_PETITION_COOLDOWN;
    if (petitionDue) recordPetition(cycle, now, signals);

    cycle.phase = derivePhase(cycle.scarcity, cycle.marketPressure, cycle.unrest, cycle.prosperity);
    cycle.history.push({
        tick: now,
        year: currentYear(),
        phase: cycle.phase,
        scarcity: round2(cycle.scarcity),
        marketPressure: round2(cycle.marketPressure),
        unrest: round2(cycle.unrest),
        prosperity: round2(cycle.prosperity),
        petition: Boolean(cycle.petition)
    });
    if (cycle.history.length > REALM_CYCLE_HISTORY_LIMIT) cycle.history.shift();
    return {
        phase: cycle.phase,
        scarcity: cycle.scarcity,
        marketPressure: cycle.marketPressure,
        unrest: cycle.unrest,
        prosperity: cycle.prosperity,
        petition: cycle.petition ? { ...cycle.petition } : null
    };
}

function reliefCost() {
    const food = Math.max(0, finite(state.resources?.food));
    return Math.min(40, Math.max(8, Math.ceil(food * 0.12)));
}

function levyPotential() {
    return Math.max(0, Math.min(60, Math.floor(8 + populationCount() * 0.35)));
}

export function getRealmCycleActions() {
    const food = Math.max(0, finite(state.resources?.food));
    const gold = Math.max(0, finite(state.resources?.gold));
    const regional = regionalFoodStock();
    const relief = reliefCost();
    return [
        {
            id: "relief",
            label: "OPEN THE GRANARY",
            detail: "Release " + relief + " food to the households. Lowers unrest, but draws down the reserve.",
            cost: { food: relief },
            available: food >= relief
        },
        {
            id: "compact",
            label: "GUILD GRAIN COMPACT",
            detail: "Pay " + REALM_RELIEF_GOLD + " gold. A partner delivers grain to the market and the price trend eases.",
            cost: { gold: REALM_RELIEF_GOLD },
            available: gold >= REALM_RELIEF_GOLD && Boolean(firstOpenPartner())
        },
        {
            id: "requisition",
            label: "REQUISITION THE STORES",
            detail: "Seize up to " + levyPotential() + " food from open market stock. Ends the petition, but embitters the commons and the guilds.",
            cost: {},
            available: regional.stock >= 1
        }
    ];
}

export function getRealmCycleSnapshot() {
    const cycle = ensureRealmCycle();
    const signals = readSignals();
    return {
        phase: cycle.phase,
        scarcity: cycle.scarcity,
        marketPressure: cycle.marketPressure,
        unrest: cycle.unrest,
        prosperity: cycle.prosperity,
        petition: cycle.petition ? { ...cycle.petition } : null,
        actions: getRealmCycleActions(),
        history: cycle.history.slice(-12),
        totalPetitions: cycle.totalPetitions,
        resolvedPetitions: cycle.resolvedPetitions,
        ignoredPetitions: cycle.ignoredPetitions,
        concessions: cycle.concessions,
        coercions: cycle.coercions,
        displacement: cycle.displacement,
        lastAction: cycle.lastAction,
        lastResolution: cycle.lastResolution,
        drivers: {
            foodReserve: signals.food,
            foodDemand: signals.demand,
            foodShortage: signals.shortage,
            reserveYears: signals.food / Math.max(0.0001, signals.demand * 20),
            foodPrice: signals.foodPrice,
            regionalFoodStock: signals.regional.stock,
            regionalFoodTarget: signals.regional.target,
            satisfaction: signals.satisfaction,
            morale: signals.morale * 100
        }
    };
}

export function resolveRealmCyclePetition(actionId) {
    const cycle = ensureRealmCycle();
    if (!cycle.petition) return { ok: false, reason: "no-active-petition" };
    const now = currentTick();
    if (now >= cycle.petition.expiresTick) {
        expirePetition(cycle, now);
        return { ok: false, reason: "petition-expired" };
    }
    const actions = getRealmCycleActions();
    const action = actions.find(entry => entry.id === actionId);
    if (!action) return { ok: false, reason: "unknown-petition-action" };
    if (!action.available) {
        if (actionId === "compact" && !firstOpenPartner()) return { ok: false, reason: "no-open-trade-route" };
        return { ok: false, reason: "not-enough-resources" };
    }
    const petition = cycle.petition;
    let resolution;
    if (actionId === "relief") {
        const cost = reliefCost();
        if (finite(state.resources?.food) < cost) return { ok: false, reason: "not-enough-food" };
        addResource("food", -cost);
        cycle.scarcity = clamp(cycle.scarcity - 0.16);
        cycle.marketPressure = clamp(cycle.marketPressure - 0.06);
        cycle.unrest = clamp(cycle.unrest - 0.18);
        cycle.prosperity = clamp(cycle.prosperity + 0.06);
        if (state.market?.priceTrend) state.market.priceTrend.food = clamp(finite(state.market.priceTrend.food, 0) - 0.06, -0.45, 0.55);
        state.morale = clamp100(finite(state.morale) + 2.5);
        applyPoliticalEffects({ legitimacy: 0.8, commons: 1.6, guilds: 0.3 });
        resolution = "The crown opened its granary and released " + round2(cost) + " food.";
        cycle.concessions++;
        addLog("THE GRANARY IS OPENED — " + round2(cost) + " FOOD RELEASED", "#a5d6a7", "politics");
    } else if (actionId === "compact") {
        if (finite(state.resources?.gold) < REALM_RELIEF_GOLD) return { ok: false, reason: "not-enough-gold" };
        const partner = firstOpenPartner();
        if (!partner) return { ok: false, reason: "no-open-trade-route" };
        addResource("gold", -REALM_RELIEF_GOLD);
        const stock = Math.max(0, finite(partner.stock?.food));
        partner.stock.food = Math.min(420, stock + 24);
        cycle.marketPressure = clamp(cycle.marketPressure - 0.14);
        cycle.scarcity = clamp(cycle.scarcity - 0.12);
        cycle.unrest = clamp(cycle.unrest - 0.16);
        cycle.prosperity = clamp(cycle.prosperity + 0.05);
        if (state.market?.priceTrend) state.market.priceTrend.food = clamp(finite(state.market.priceTrend.food, 0) - 0.12, -0.45, 0.55);
        state.morale = clamp100(finite(state.morale) + 1.2);
        applyPoliticalEffects({ legitimacy: 0.9, guilds: 2.4, nobility: 0.2 });
        resolution = "The guild compact delivered 24 food to the open market for " + REALM_RELIEF_GOLD + " gold.";
        cycle.concessions++;
        addLog("GUILD GRAIN COMPACT SEALED — 24 FOOD ENTERS THE MARKET", "#a5d6a7", "trade");
    } else {
        const target = levyPotential();
        let seized = 0;
        for (const partner of marketPartners()) {
            if (!partner || typeof partner !== "object") continue;
            const available = Math.max(0, finite(partner.stock?.food));
            const take = Math.min(available, target - seized);
            if (take <= 0) continue;
            partner.stock.food = available - take;
            seized += take;
            if (seized >= target) break;
        }
        if (seized < 1) return { ok: false, reason: "no-market-stores" };
        addResource("food", seized);
        cycle.scarcity = clamp(cycle.scarcity - 0.10);
        cycle.marketPressure = clamp(cycle.marketPressure + 0.10);
        cycle.unrest = clamp(cycle.unrest + 0.16);
        cycle.prosperity = clamp(cycle.prosperity - 0.06);
        if (state.market?.priceTrend) state.market.priceTrend.food = clamp(finite(state.market.priceTrend.food, 0) + 0.16, -0.45, 0.55);
        state.morale = clamp100(finite(state.morale) - 3);
        applyPoliticalEffects({ legitimacy: -1.4, commons: -3.2, guilds: -2.0 });
        resolution = "The crown requisitioned " + round2(seized) + " food from market stock. The stalls are thinner and the city remembers.";
        cycle.coercions++;
        addLog("MARKET STORES REQUISITIONED — " + round2(seized) + " FOOD SEIZED", "#d98c78", "politics");
    }
    cycle.petition = null;
    cycle.resolvedPetitions++;
    cycle.lastActionTick = now;
    cycle.lastAction = actionId;
    cycle.lastResolution = resolution;
    if (state.city?.needs) state.city.needs.lastWarning = null;
    return {
        ok: true,
        message: resolution,
        action: actionId,
        petition,
        snapshot: getRealmCycleSnapshot()
    };
}

// Validation for imported snapshots. Optional fields are allowed for older
// saves; a present value must remain a bounded object. The live restore path
// still normalizes it, so a malformed optional block cannot poison the tick.
export function validateRealmCycleState(input) {
    if (input === undefined || input === null) return;
    if (typeof input !== "object" || Array.isArray(input)) {
        throw new Error("Save data contains an invalid realm cycle.");
    }
    for (const key of ["scarcity", "marketPressure", "unrest", "prosperity"]) {
        const value = Number(input[key]);
        if (!Number.isFinite(value) || value < 0 || value > 1) {
            throw new Error("Save data contains an out-of-range realm cycle value: " + key + ".");
        }
    }
    if (input.history !== undefined && !Array.isArray(input.history)) {
        throw new Error("Save data contains an invalid realm cycle history.");
    }
    if (input.history && input.history.length > REALM_CYCLE_HISTORY_LIMIT) {
        throw new Error("Save data contains an oversized realm cycle history.");
    }
    if (input.petition !== undefined && input.petition !== null) {
        if (typeof input.petition !== "object" || Array.isArray(input.petition)) {
            throw new Error("Save data contains an invalid realm petition.");
        }
    }
}
