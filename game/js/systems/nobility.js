// Living noble houses: resident-led houses with estates, loyalty, dues and
// levies. The system runs once per year and stays bounded to four houses. It
// deliberately derives membership from the existing named-resident records, so
// deaths, births, court offices and family names continue to matter without a
// parallel population model.
import { state } from "../core/state.js";
import { TYPE } from "../core/types.js";
import { addLog } from "../core/event-log.js";
import { addResource } from "./resources.js";
import { applyPoliticalEffects } from "./politics.js";
import { addPersonMemory, ensurePersonProfile, PERSON_SPECIES } from "./people.js";

export const NOBILITY_HOUSE_LIMIT = 4;
export const NOBILITY_HISTORY_LIMIT = 24;
export const NOBILITY_HOUSE_HISTORY_LIMIT = 16;
export const NOBILITY_MEMBER_LIMIT = 48;
export const NOBILITY_CHARTER_COST = Object.freeze({ gold: 30, wood: 10 });
export const NOBILITY_LEVY_COOLDOWN_YEARS = 2;

const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max,
    Number.isFinite(Number(value)) ? Number(value) : min));
const integer = (value, min = 0, max = 1_000_000_000) => Math.max(min, Math.min(max, Math.floor(Number(value) || 0)));
const yearNow = () => Math.max(1, Math.floor(Number(state.year) || 1));
const trait = (person, key) => clamp(person?.traits?.[key] ?? 50, 0, 100);
const maturityFor = person => PERSON_SPECIES[person?.species]?.maturation ?? 16;
const isAdult = person => Number(person?.ageYears) >= maturityFor(person);
const personIdOf = entity => String(entity?.personId || entity?.person?.id || entity?.id || "");
const familyNameOf = person => String(person?.familyName || "Resident").trim().slice(0, 48) || "Resident";
const slug = value => String(value || "house").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "house";

function residentRecords() {
    return state.entities.filter(entity => Boolean(entity && !entity.dead && entity.type === TYPE.VILLAGER &&
        entity.personId && !entity.isKing && !entity.isRoyalFamily));
}

function membersForHouse(house) {
    const stored = new Set((Array.isArray(house.members) ? house.members : []).map(String));
    return residentRecords()
        .filter(entity => stored.has(personIdOf(entity)) || familyNameOf(entity.person) === house.familyName)
        .sort(compareMembers)
        .slice(0, NOBILITY_MEMBER_LIMIT);
}

function compareMembers(a, b) {
    return Number(b.person?.ageYears) - Number(a.person?.ageYears) ||
        String(a.person?.name || "").localeCompare(String(b.person?.name || "")) ||
        personIdOf(a).localeCompare(personIdOf(b));
}

function headFor(members, currentHeadId) {
    const living = members.filter(entity => entity?.person);
    if (!living.length) return null;
    const current = currentHeadId
        ? living.find(entity => personIdOf(entity) === String(currentHeadId) && isAdult(entity.person))
        : null;
    if (current) return current;
    const adults = living.filter(entity => isAdult(entity.person));
    return (adults.length ? adults : living).sort(compareMembers)[0] || null;
}

function heldOffices(memberIds) {
    const offices = state.court && typeof state.court.offices === "object" && !Array.isArray(state.court.offices)
        ? Object.values(state.court.offices) : [];
    return offices.filter(office => office && memberIds.has(String(office.personId))).length;
}

const GOVERNMENT_LOYALTY = Object.freeze({
    feudal: 6, royal: -3, oligarchy: 8, mixed: 3, council: 1,
    elective: 5, republic: -6, theocracy: -2, tribal: 5, military: 4
});

function loyaltyTarget(house, members, head, offices) {
    if (!head) return 0;
    const king = state.entities.find(entity => !entity.dead && entity.isKing) || null;
    const relation = king && Array.isArray(head.person?.relationships)
        ? head.person.relationships.find(item => String(item.targetId) === String(king.personId || king.id))
        : null;
    const trust = clamp(relation?.trust ?? 50, 0, 100);
    const taxRate = Number(state.government?.taxRate) || 10;
    const legitimacy = Number(state.politics?.legitimacy) || 65;
    const form = String(state.government?.form || "feudal");
    return clamp(
        44 +
        (trust - 50) * 0.35 +
        (100 - trait(head.person, "greed")) * 0.10 +
        (house.charter ? 10 : 0) +
        offices * 4 -
        Math.max(0, taxRate - 10) * 1.1 +
        (legitimacy - 50) * 0.12 +
        (GOVERNMENT_LOYALTY[form] || 0) +
        Math.min(4, members.filter(entity => isAdult(entity.person)).length * 0.4),
        12,
        94
    );
}

function wealthTarget(house, members, head, offices) {
    return clamp(
        24 +
        members.length * 2.5 +
        (house.charter ? 10 : 0) +
        offices * 4 +
        trait(head?.person, "discipline") * 0.08 +
        trait(head?.person, "greed") * 0.06,
        10,
        100
    );
}

function levyFor(members, power, charter) {
    const adults = members.filter(entity => isAdult(entity.person)).length;
    return Math.round(clamp(1.5 + adults * 1.2 + power * 0.08 + (charter ? 1.5 : 0), 1, 30));
}

function powerFor(members, wealth, levy, offices, charter) {
    return Math.round(clamp(
        members.length * 5 +
        wealth * 0.35 +
        levy * 1.4 +
        offices * 8 +
        (charter ? 4 : 0),
        0,
        100
    ));
}

function duesFor(house, members, offices) {
    const adults = members.filter(entity => isAdult(entity.person)).length;
    const gross = adults * 1.6 + Number(house.wealth || 0) * 0.12 + offices * 3 + (house.charter ? 4 : 0);
    return Math.max(0, Math.min(30, Math.round(gross * (0.45 + clamp(house.loyalty) / 100 * 0.55))));
}

function normalizeHistoryEntry(entry) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
    const summary = String(entry.summary || "").trim().slice(0, 180);
    if (!summary) return null;
    return {
        year: integer(entry.year, 0),
        kind: String(entry.kind || "nobility").slice(0, 32),
        summary
    };
}

function normalizeHouse(saved, index) {
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) return null;
    const familyName = String(saved.familyName || saved.name || "").trim().slice(0, 48);
    if (!familyName) return null;
    return {
        id: String(saved.id || "house-" + slug(familyName) + "-" + (index + 1)).slice(0, 80),
        familyName,
        seat: String(saved.seat || (familyName + " estates")).slice(0, 72),
        headId: saved.headId ? String(saved.headId).slice(0, 100) : null,
        members: (Array.isArray(saved.members) ? saved.members : []).map(String)
            .filter(Boolean).slice(0, NOBILITY_MEMBER_LIMIT),
        foundedYear: Math.max(1, integer(saved.foundedYear, 1)),
        wealth: clamp(saved.wealth ?? 42),
        loyalty: clamp(saved.loyalty ?? 55),
        power: clamp(saved.power ?? 20),
        levy: Math.max(0, Math.min(30, integer(saved.levy, 0, 30))),
        charter: saved.charter === true,
        lastLevyYear: integer(saved.lastLevyYear, 0),
        musteredUntilYear: integer(saved.musteredUntilYear, 0),
        duesLastYear: integer(saved.duesLastYear, 0, 30),
        lastUpdateYear: integer(saved.lastUpdateYear, 0),
        history: (Array.isArray(saved.history) ? saved.history : []).map(normalizeHistoryEntry)
            .filter(Boolean).slice(0, NOBILITY_HOUSE_HISTORY_LIMIT)
    };
}

export function createNobilityState() {
    return {
        version: 1,
        lastUpdateYear: 0,
        initializedYear: 0,
        houses: [],
        history: [],
        lastAudit: null,
        defenseBonus: 1,
        duesThisYear: 0,
        duesCollected: 0,
        withheldHouses: 0,
        leviesCalled: 0
    };
}

export function normalizeNobilityState(input = state.nobility) {
    const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
    const rawHouses = Array.isArray(source.houses) ? source.houses : [];
    const seen = new Set();
    const houses = rawHouses.map(normalizeHouse).filter(Boolean).filter(house => {
        if (seen.has(house.id)) return false;
        seen.add(house.id);
        return true;
    }).slice(0, NOBILITY_HOUSE_LIMIT);
    const normalized = {
        version: 1,
        lastUpdateYear: integer(source.lastUpdateYear, 0),
        initializedYear: integer(source.initializedYear, 0),
        houses,
        history: (Array.isArray(source.history) ? source.history : []).map(normalizeHistoryEntry)
            .filter(Boolean).slice(0, NOBILITY_HISTORY_LIMIT),
        lastAudit: source.lastAudit && typeof source.lastAudit === "object" && !Array.isArray(source.lastAudit)
            ? {
                year: integer(source.lastAudit.year, 0),
                houses: integer(source.lastAudit.houses, 0, 8),
                dues: integer(source.lastAudit.dues, 0),
                withheld: integer(source.lastAudit.withheld, 0, 8),
                levies: integer(source.lastAudit.levies, 0, 8),
                defenseBonus: clamp(source.lastAudit.defenseBonus ?? 1, 1, 1.2),
                averageLoyalty: clamp(source.lastAudit.averageLoyalty ?? 0)
            }
            : null,
        defenseBonus: Math.max(1, Math.min(1.2, Number(source.defenseBonus) || 1)),
        duesThisYear: integer(source.duesThisYear, 0),
        duesCollected: integer(source.duesCollected, 0),
        withheldHouses: integer(source.withheldHouses, 0, 8),
        leviesCalled: integer(source.leviesCalled, 0)
    };
    if (state.nobility === input || input === undefined) state.nobility = normalized;
    return normalized;
}

function seedHouses(nobility) {
    const groups = new Map();
    for (const entity of residentRecords()) {
        const person = entity.person || ensurePersonProfile(entity);
        const familyName = familyNameOf(person);
        let group = groups.get(familyName);
        if (!group) {
            group = { familyName, members: [] };
            groups.set(familyName, group);
        }
        group.members.push(entity);
    }
    const candidates = [...groups.values()]
        .filter(group => group.members.some(entity => isAdult(entity.person)))
        .sort((a, b) => b.members.length - a.members.length ||
            a.familyName.localeCompare(b.familyName))
        .slice(0, NOBILITY_HOUSE_LIMIT);
    if (!candidates.length) return false;
    const year = yearNow();
    const usedIds = new Set();
    for (const group of candidates) {
        const members = group.members.slice().sort(compareMembers);
        const head = headFor(members, null);
        if (!head) continue;
        let id = "house-" + slug(group.familyName);
        let suffix = 2;
        while (usedIds.has(id)) id = "house-" + slug(group.familyName) + "-" + suffix++;
        usedIds.add(id);
        const memberIds = members.map(personIdOf).filter(Boolean).slice(0, NOBILITY_MEMBER_LIMIT);
        const offices = heldOffices(new Set(memberIds));
        const house = {
            id,
            familyName: group.familyName,
            seat: group.familyName + " estates",
            headId: personIdOf(head),
            members: memberIds,
            foundedYear: year,
            wealth: 0,
            loyalty: 0,
            power: 0,
            levy: 0,
            charter: false,
            lastLevyYear: 0,
            musteredUntilYear: 0,
            duesLastYear: 0,
            lastUpdateYear: 0,
            history: [{
                year,
                kind: "founded",
                summary: "House " + group.familyName + " was recorded as a noble house under " + head.person.name + "."
            }]
        };
        house.wealth = clamp(Math.round(32 + members.length * 2 + trait(head.person, "discipline") * 0.12 + trait(head.person, "greed") * 0.10), 20, 80);
        house.loyalty = Math.round(loyaltyTarget(house, members, head, offices));
        house.power = powerFor(members, house.wealth, 0, offices, false);
        house.levy = levyFor(members, house.power, false);
        house.power = powerFor(members, house.wealth, house.levy, offices, false);
        nobility.houses.push(house);
    }
    if (nobility.houses.length) {
        nobility.initializedYear = nobility.initializedYear || year;
        refreshDefense(nobility, year);
    }
    return nobility.houses.length > 0;
}

export function ensureNobility() {
    const current = state.nobility;
    if (!current || typeof current !== "object" || Array.isArray(current) || current.version !== 1 ||
        !Array.isArray(current.houses)) {
        state.nobility = normalizeNobilityState(current);
    }
    const nobility = state.nobility;
    if (!nobility.houses.length) seedHouses(nobility);
    return nobility;
}

function refreshDefense(nobility, year = yearNow()) {
    let effectiveLevy = 0;
    for (const house of nobility.houses || []) {
        if (!house.headId) continue;
        const mustered = Number(house.musteredUntilYear) > year;
        effectiveLevy += Math.max(0, Number(house.levy) || 0) *
            (0.5 + clamp(house.loyalty) / 100 * 0.7) *
            (mustered ? 1.5 : 1);
    }
    nobility.defenseBonus = Math.max(1, Math.min(1.16, 1 + effectiveLevy / 280));
    return nobility.defenseBonus;
}

function recordState(nobility, kind, summary) {
    nobility.history.unshift({
        year: yearNow(),
        kind: String(kind || "nobility").slice(0, 32),
        summary: String(summary || "").slice(0, 180)
    });
    nobility.history = nobility.history.slice(0, NOBILITY_HISTORY_LIMIT);
}

function recordHouse(house, kind, summary) {
    house.history.unshift({
        year: yearNow(),
        kind: String(kind || "nobility").slice(0, 32),
        summary: String(summary || "").slice(0, 180)
    });
    house.history = house.history.slice(0, NOBILITY_HOUSE_HISTORY_LIMIT);
}

function houseById(houseId) {
    const nobility = ensureNobility();
    return nobility.houses.find(house => house.id === String(houseId)) || null;
}

function viewHouse(house, year) {
    const members = membersForHouse(house);
    const head = headFor(members, house.headId);
    const memberIds = new Set(members.map(personIdOf).filter(Boolean));
    const offices = heldOffices(memberIds);
    const mustered = Number(house.musteredUntilYear) > year;
    const dormant = members.length === 0;
    return {
        ...house,
        head: head ? {
            personId: personIdOf(head),
            name: head.person.name,
            ageYears: Math.floor(Number(head.person.ageYears) || 0),
            species: head.person.species,
            role: head.person.role
        } : null,
        memberCount: members.length,
        adultCount: members.filter(entity => isAdult(entity.person)).length,
        memberNames: members.slice(0, 8).map(entity => entity.person.name),
        heldOffices: offices,
        status: dormant ? "dormant" : house.loyalty < 30 ? "withholding" : house.charter ? "chartered" : "watching",
        dues: dormant ? 0 : duesFor(house, members, offices),
        mustered,
        levyActive: Math.round(house.levy * (mustered ? 1.5 : 1))
    };
}

export function getNobilitySnapshot() {
    const nobility = ensureNobility();
    const year = yearNow();
    refreshDefense(nobility, year);
    const houses = nobility.houses.map(house => viewHouse(house, year));
    const living = houses.filter(house => house.memberCount > 0);
    const averageLoyalty = living.length
        ? living.reduce((sum, house) => sum + Number(house.loyalty || 0), 0) / living.length
        : 0;
    const totalLevy = living.reduce((sum, house) => sum + Number(house.levyActive || 0), 0);
    return {
        houses,
        averageLoyalty,
        totalLevy,
        defenseBonus: nobility.defenseBonus,
        duesThisYear: nobility.duesThisYear,
        duesCollected: nobility.duesCollected,
        withheldHouses: nobility.withheldHouses,
        leviesCalled: nobility.leviesCalled,
        lastUpdateYear: nobility.lastUpdateYear,
        lastAudit: nobility.lastAudit ? { ...nobility.lastAudit } : null,
        history: nobility.history.slice(0, 10),
        houseCount: living.length,
        dormantCount: houses.length - living.length,
        charterCost: { ...NOBILITY_CHARTER_COST },
        levyCooldownYears: NOBILITY_LEVY_COOLDOWN_YEARS
    };
}

export function getNobilityDefenseMultiplier() {
    const value = Number(state.nobility?.defenseBonus);
    return Number.isFinite(value) ? Math.max(1, Math.min(1.16, value)) : 1;
}

export function grantNobleCharter(houseId) {
    const house = houseById(houseId);
    if (!house) return { ok: false, reason: "unknown-noble-house" };
    const members = membersForHouse(house);
    const head = headFor(members, house.headId);
    if (!head) return { ok: false, reason: "house-has-no-living-head" };
    if (house.charter) return { ok: false, reason: "house-already-chartered" };
    for (const [resource, amount] of Object.entries(NOBILITY_CHARTER_COST)) {
        if ((Number(state.resources?.[resource]) || 0) < amount) return { ok: false, reason: "not-enough-" + resource };
    }
    for (const [resource, amount] of Object.entries(NOBILITY_CHARTER_COST)) addResource(resource, -amount);
    house.charter = true;
    house.wealth = clamp(house.wealth + 8);
    house.loyalty = clamp(house.loyalty + 12);
    const memberIds = new Set(members.map(personIdOf));
    const offices = heldOffices(memberIds);
    house.levy = levyFor(members, house.power, true);
    house.power = powerFor(members, house.wealth, house.levy, offices, true);
    recordHouse(house, "charter", "The crown granted House " + house.familyName + " an estate charter.");
    recordState(state.nobility, "charter", "House " + house.familyName + " received a charter for " + NOBILITY_CHARTER_COST.gold + " gold and " + NOBILITY_CHARTER_COST.wood + " wood.");
    applyPoliticalEffects({ nobility: 2.8, commons: -1, legitimacy: 0.3 });
    addPersonMemory(head, {
        id: "noble-charter:" + house.id + ":" + yearNow(),
        type: "nobility",
        text: "The crown granted House " + house.familyName + " an estate charter in year " + yearNow() + ".",
        tick: state.tick,
        importance: 82
    });
    addLog("HOUSE " + house.familyName.toUpperCase() + " RECEIVED AN ESTATE CHARTER", "#d8c18a", "nobility");
    refreshDefense(state.nobility, yearNow());
    return { ok: true, house: viewHouse(house, yearNow()), snapshot: getNobilitySnapshot() };
}

export function callNobleLevy(houseId) {
    const house = houseById(houseId);
    if (!house) return { ok: false, reason: "unknown-noble-house" };
    const year = yearNow();
    const members = membersForHouse(house);
    const head = headFor(members, house.headId);
    if (!head) return { ok: false, reason: "house-has-no-living-head" };
    const nextYear = Math.max(year, Number(house.lastLevyYear || 0) + NOBILITY_LEVY_COOLDOWN_YEARS);
    if (house.lastLevyYear && year < nextYear) return { ok: false, reason: "levy-cooldown-until-year-" + nextYear };
    if (house.loyalty < 35) return { ok: false, reason: "house-refuses-the-levy" };
    house.lastLevyYear = year;
    house.musteredUntilYear = year + 2;
    house.loyalty = clamp(house.loyalty - 7);
    recordHouse(house, "levy", "House " + house.familyName + " mustered its levy for the crown.");
    recordState(state.nobility, "levy", "The crown called the levy of House " + house.familyName + ".");
    state.nobility.leviesCalled = integer(state.nobility.leviesCalled + 1, 0);
    applyPoliticalEffects({ nobility: -0.4, commons: -0.1 });
    addPersonMemory(head, {
        id: "noble-levy:" + house.id + ":" + year,
        type: "nobility",
        text: "I answered the crown's call to muster the " + house.familyName + " levy in year " + year + ".",
        tick: state.tick,
        importance: 76
    });
    addLog("HOUSE " + house.familyName.toUpperCase() + " MUSTERED ITS LEVY", "#e8c77b", "nobility");
    refreshDefense(state.nobility, year);
    return { ok: true, house: viewHouse(house, year), snapshot: getNobilitySnapshot() };
}

function noteHouseChange(house, year, previousHeadId) {
    if (previousHeadId && previousHeadId !== house.headId) {
        const head = state.entities.find(entity => !entity.dead && personIdOf(entity) === String(house.headId)) || null;
        if (head) recordHouse(house, "succession", "Leadership of House " + house.familyName + " passed to " + head.person.name + ".");
    }
    house.lastUpdateYear = year;
}

export function updateNobility() {
    const nobility = ensureNobility();
    const year = yearNow();
    if (nobility.lastUpdateYear >= year) return getNobilitySnapshot();
    if (!nobility.houses.length && !seedHouses(nobility)) {
        nobility.lastUpdateYear = year;
        return getNobilitySnapshot();
    }

    let dues = 0;
    let withheld = 0;
    let livingHouses = 0;
    let loyaltySum = 0;
    let levies = 0;
    for (const house of nobility.houses) {
        const members = membersForHouse(house);
        const previousHeadId = house.headId;
        const head = headFor(members, previousHeadId);
        if (!head) {
            house.headId = null;
            house.members = [];
            house.levy = 0;
            house.power = 0;
            house.wealth = clamp(house.wealth - 2);
            house.loyalty = clamp(house.loyalty - 4);
            house.duesLastYear = 0;
            if (house.history[0]?.kind !== "dormant") {
                recordHouse(house, "dormant", "No living member of House " + house.familyName + " remains.");
            }
            house.lastUpdateYear = year;
            continue;
        }
        livingHouses++;
        house.headId = personIdOf(head);
        house.members = members.map(personIdOf).filter(Boolean).slice(0, NOBILITY_MEMBER_LIMIT);
        const memberIds = new Set(house.members);
        const offices = heldOffices(memberIds);
        const targetWealth = wealthTarget(house, members, head, offices);
        house.wealth = clamp(Math.round(house.wealth * 0.72 + targetWealth * 0.28));
        const targetLoyalty = loyaltyTarget(house, members, head, offices);
        house.loyalty = clamp(Math.round(house.loyalty * 0.70 + targetLoyalty * 0.30));
        house.levy = levyFor(members, house.power, house.charter);
        house.power = powerFor(members, house.wealth, house.levy, offices, house.charter);
        if (house.musteredUntilYear && house.musteredUntilYear <= year) house.musteredUntilYear = 0;
        if (house.musteredUntilYear > year) levies++;
        noteHouseChange(house, year, previousHeadId);
        const due = house.loyalty >= 30 ? duesFor(house, members, offices) : 0;
        house.duesLastYear = due;
        if (due > 0) {
            addResource("gold", due);
            dues += due;
        } else {
            withheld++;
            recordHouse(house, "withheld", "House " + house.familyName + " withheld its annual dues.");
        }
        loyaltySum += house.loyalty;
    }

    const averageLoyalty = livingHouses ? loyaltySum / livingHouses : 0;
    if (withheld > 0) {
        applyPoliticalEffects({ nobility: -Math.min(2, withheld * 0.7), legitimacy: -Math.min(0.8, withheld * 0.2) });
    } else if (livingHouses && averageLoyalty >= 65) {
        applyPoliticalEffects({ nobility: 0.45, legitimacy: 0.15 });
    } else if (livingHouses) {
        applyPoliticalEffects({ nobility: 0.1 });
    }
    nobility.duesThisYear = dues;
    nobility.duesCollected = integer(nobility.duesCollected + dues, 0);
    nobility.withheldHouses = withheld;
    nobility.leviesCalled = integer(nobility.leviesCalled, 0);
    refreshDefense(nobility, year);
    nobility.lastUpdateYear = year;
    nobility.lastAudit = {
        year,
        houses: livingHouses,
        dues,
        withheld,
        levies,
        defenseBonus: nobility.defenseBonus,
        averageLoyalty
    };
    recordState(nobility, "audit", "Noble audit year " + year + ": " + dues + " gold in dues from " + livingHouses +
        " living house" + (livingHouses === 1 ? "" : "s") + (withheld ? ", " + withheld + " withheld" : "") +
        ", " + Math.round(nobility.defenseBonus * 1000) / 1000 + " defense multiplier.");
    addLog("NOBLE HOUSES SETTLE YEAR " + year + " · " + dues + " GOLD IN DUES" + (withheld ? " · " + withheld + " WITHHELD" : ""), "#d8c18a", "nobility");
    return getNobilitySnapshot();
}

export function validateNobilityState(value) {
    if (value === undefined || value === null) return true;
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("Save data contains an invalid noble-houses state.");
    }
    if (value.houses !== undefined && (!Array.isArray(value.houses) || value.houses.length > NOBILITY_HOUSE_LIMIT)) {
        throw new Error("Save data contains an invalid noble-house list.");
    }
    for (const house of Array.isArray(value.houses) ? value.houses : []) {
        if (!house || typeof house !== "object" || Array.isArray(house) ||
            typeof house.id !== "string" || !house.id || house.id.length > 80 ||
            typeof house.familyName !== "string" || !house.familyName || house.familyName.length > 48) {
            throw new Error("Save data contains an invalid noble house.");
        }
        if (house.members !== undefined && (!Array.isArray(house.members) || house.members.length > NOBILITY_MEMBER_LIMIT)) {
            throw new Error("Save data contains an invalid noble-house membership list.");
        }
        if (house.history !== undefined && (!Array.isArray(house.history) || house.history.length > NOBILITY_HOUSE_HISTORY_LIMIT)) {
            throw new Error("Save data contains an invalid noble-house history.");
        }
    }
    if (value.history !== undefined && (!Array.isArray(value.history) || value.history.length > NOBILITY_HISTORY_LIMIT)) {
        throw new Error("Save data contains an invalid noble-house chronicle.");
    }
    return true;
}
