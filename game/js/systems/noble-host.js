// Noble land hosts: every house can keep a small standing household host and
// muster it for the crown. Size, equipment, wages, supplies and readiness come
// from the house's actual adults, levy, wealth, power, offices, charter and
// loyalty. Feuds reduce both the target size and willingness to march.
import { state } from "../core/state.js";
import { addLog } from "../core/event-log.js";
import { addResource } from "./resources.js";
import { applyPoliticalEffects } from "./politics.js";
import { ensureNobility, getNobilitySnapshot } from "./nobility.js";
import { activeFeudSeverityFor, nobleFeudPenaltyFor } from "./noble-feuds.js";
import { createNobleHost, normalizeNobleHost, NOBLE_HOST_HISTORY_LIMIT } from "./noble-state.js";

export const NOBLE_HOST_RAISE_COST = Object.freeze({gold: 6});
export const NOBLE_HOST_MARCH_COST = Object.freeze({gold: 8, food: 6});
export const NOBLE_HOST_LOYALTY_FLOOR = 35;
export const NOBLE_HOST_WAR_LOYALTY = 40;
export const NOBLE_HOST_REVOLT_LOYALTY = 20;

const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max,
    Number.isFinite(Number(value)) ? Number(value) : min));
const integer = (value, min = 0, max = 1_000_000) => Math.max(min, Math.min(max, Math.floor(Number(value) || 0)));
const yearNow = () => Math.max(1, Math.floor(Number(state.year) || 1));
const tickNow = () => Math.max(0, Math.floor(Number(state.tick) || 0));

function currentWarRealm() {
    const realms = Array.isArray(state.diplomacy?.realms) ? state.diplomacy.realms : [];
    return realms.filter(realm => realm && realm.treaty === "war" && !realm.defeated)
        .sort((a, b) => String(a.id).localeCompare(String(b.id)))[0] || null;
}

function hostTarget(house) {
    if (!house || !house.head || Number(house.memberCount) <= 0 ||
        Number(house.loyalty) < NOBLE_HOST_LOYALTY_FLOOR) return 0;
    const adults = Math.max(0, Number(house.adultCount) || 0);
    const levy = Math.max(0, Number(house.levyActive ?? house.levy) || 0);
    const power = Math.max(0, Number(house.power) || 0);
    const wealth = Math.max(0, Number(house.wealth) || 0);
    const offices = Math.max(0, Number(house.heldOffices) || 0);
    const loyaltyFactor = clamp((Number(house.loyalty) - 25) / 75, 0.12, 1);
    const feudFactor = 1 - nobleFeudPenaltyFor(house.id) * 0.85;
    const musterFactor = house.mustered ? 1.18 : 1;
    return integer(clamp(
        (adults * 1.9 + levy * 0.55 + wealth * 0.16 + power * 0.10 +
            (house.charter ? 3 : 0) + offices * 2) * loyaltyFactor * feudFactor * musterFactor,
        0, 60
    ));
}

function equipmentTarget(house) {
    return integer(clamp(
        Number(house.wealth) * 0.45 + (house.charter ? 12 : 0) +
        Number(house.heldOffices) * 5 + Number(house.loyalty) * 0.15,
        0, 100
    ));
}

function upkeepFor(house, strength, equipment) {
    return {
        wages: Math.max(1, Math.round(strength * (0.10 + Number(equipment) / 900) + (house.charter ? 1 : 0))),
        supplies: Math.max(1, Math.round(strength * 0.08))
    };
}

function musterTicks(house, strength) {
    return integer(45 + strength * 3 + (100 - Number(house.loyalty)) * 2 + (house.charter ? -20 : 0), 20, 420);
}

function returnTicks(strength) {
    return integer(25 + strength * 2, 20, 240);
}

function readinessFor(house, equipment, morale) {
    return integer(clamp(Number(house.loyalty) * 0.40 + Number(equipment) * 0.40 + Number(morale) * 0.20, 0, 100));
}

function makeHost(house, status = "quartered") {
    const strength = hostTarget(house);
    const equipment = equipmentTarget(house);
    const morale = clamp(45 + Number(house.loyalty) * 0.25 + (house.charter ? 5 : 0) - activeFeudSeverityFor(house.id) * 5);
    const upkeep = upkeepFor(house, strength, equipment);
    const host = createNobleHost();
    host.status = status;
    host.strength = strength;
    host.targetStrength = strength;
    host.equipment = equipment;
    host.morale = morale;
    host.readiness = readinessFor(house, equipment, morale);
    host.commanderId = house.head?.personId || house.headId || null;
    host.commanderName = house.head?.name || "";
    host.wages = upkeep.wages;
    host.supplies = upkeep.supplies;
    host.raisedYear = yearNow();
    host.musterStartedTick = tickNow();
    host.readyTick = tickNow() + musterTicks(house, strength);
    host.history.unshift({
        year: yearNow(),
        kind: "raised",
        summary: "House " + house.familyName + " raised " + strength + " retainers under " + (host.commanderName || "its head") + "."
    });
    host.history = host.history.slice(0, NOBLE_HOST_HISTORY_LIMIT);
    return host;
}

function recordHost(nobility, kind, summary) {
    nobility.history.unshift({
        year: yearNow(),
        kind: String(kind).slice(0, 32),
        summary: String(summary).slice(0, 180)
    });
    nobility.history = nobility.history.slice(0, 24);
    addLog(summary, "#d8c18a", "nobility");
}

function recordHouseHost(house, kind, summary) {
    house.history.unshift({
        year: yearNow(),
        kind: String(kind).slice(0, 32),
        summary: String(summary).slice(0, 180)
    });
    house.history = house.history.slice(0, 16);
}

function snapshotHouse(houseId) {
    return getNobilitySnapshot().houses.find(house => house.id === String(houseId)) || null;
}

function viewHost(house, host) {
    if (!host) return null;
    const severity = activeFeudSeverityFor(house.id);
    const war = currentWarRealm();
    const readyIn = Math.max(0, Number(host.readyTick || 0) - tickNow());
    const returnIn = Math.max(0, Number(host.returnTick || 0) - tickNow());
    return {
        ...host,
        houseId: house.id,
        familyName: house.familyName,
        loyalty: Math.round(Number(house.loyalty) || 0),
        feudSeverity: severity,
        feudPenalty: Math.round(nobleFeudPenaltyFor(house.id) * 1000) / 1000,
        readyIn,
        returnIn,
        upkeep: {wages: host.wages, supplies: host.supplies},
        canMarch: ["quartered", "marching"].includes(host.status) && Number(house.loyalty) >= NOBLE_HOST_LOYALTY_FLOOR &&
            severity < 4 && Number(host.strength) > 0,
        canRevolt: Number(house.loyalty) < NOBLE_HOST_REVOLT_LOYALTY && Number(host.strength) > 0,
        warTarget: war ? {id: String(war.id), name: String(war.name || war.id)} : null
    };
}

export function getNobleHostSnapshot() {
    const nobility = ensureNobility();
    const houses = nobility.houses.map(house => {
        const members = Array.isArray(house.members) ? house.members.length : 0;
        const view = {
            id: house.id,
            familyName: house.familyName,
            head: house.headId,
            memberCount: members,
            loyalty: Number(house.loyalty) || 0,
            host: normalizeNobleHost(house.host)
        };
        return view;
    });
    const hosts = houses.filter(house => house.host).map(house => viewHost(house, house.host));
    const active = hosts.filter(host => host.status !== "revolted");
    const currentRevolts = hosts.filter(host => host.status === "revolted").length;
    return {
        hosts,
        activeHosts: active.length,
        totalStrength: active.reduce((sum, host) => sum + Number(host.strength || 0), 0),
        totalReadiness: active.length
            ? Math.round(active.reduce((sum, host) => sum + Number(host.readiness || 0), 0) / active.length)
            : 0,
        upkeep: {
            wages: active.reduce((sum, host) => sum + Number(host.wages || 0), 0),
            supplies: active.reduce((sum, host) => sum + Number(host.supplies || 0), 0)
        },
        warHosts: hosts.filter(host => host.joinedWar && host.status !== "revolted").length,
        revolts: Number(nobility.revolts) || 0,
        currentRevolts,
        raiseCost: {...NOBLE_HOST_RAISE_COST},
        marchCost: {...NOBLE_HOST_MARCH_COST},
        loyaltyFloor: NOBLE_HOST_LOYALTY_FLOOR,
        warLoyalty: NOBLE_HOST_WAR_LOYALTY,
        history: nobility.hostHistory || [],
        lastAudit: nobility.hostAudit || null
    };
}

export function orderNobleHost(houseId, order) {
    const nobility = ensureNobility();
    const house = snapshotHouse(houseId);
    if (!house) return {ok: false, reason: "unknown-noble-house"};
    const action = String(order || "").toLowerCase();

    if (action === "raise") {
        if (house.host) return {ok: false, reason: "host-already-raised"};
        if (!house.head || house.memberCount <= 0) return {ok: false, reason: "house-has-no-living-head"};
        if (Number(house.loyalty) < NOBLE_HOST_LOYALTY_FLOOR) return {ok: false, reason: "house-will-not-raise-a-host"};
        if ((Number(state.resources?.gold) || 0) < NOBLE_HOST_RAISE_COST.gold) return {ok: false, reason: "not-enough-gold"};
        addResource("gold", -NOBLE_HOST_RAISE_COST.gold);
        const record = nobility.houses.find(entry => entry.id === house.id);
        const host = makeHost(house, "mustering");
        record.host = host;
        record.hostDisbanded = false;
        record.loyalty = clamp(Number(record.loyalty) - 1);
        nobility.hostsRaised = integer(nobility.hostsRaised + 1);
        recordHouseHost(record, "host-raised", "House " + house.familyName + " raised a land host of " + host.strength + " retainers.");
        recordHost(nobility, "host-raised", "House " + house.familyName + " raised " + host.strength + " retainers for " + NOBLE_HOST_RAISE_COST.gold + " gold.");
        return {ok: true, host: viewHost(house, host), snapshot: getNobleHostSnapshot()};
    }

    const record = nobility.houses.find(entry => entry.id === house.id);
    const host = normalizeNobleHost(record?.host);
    if (!host) return {ok: false, reason: "no-land-host"};

    if (action === "march") {
        if (host.status === "revolted") return {ok: false, reason: "host-has-revolted"};
        if (Number(house.loyalty) < NOBLE_HOST_LOYALTY_FLOOR) return {ok: false, reason: "house-refuses-to-march"};
        if (activeFeudSeverityFor(house.id) >= 4) return {ok: false, reason: "feud-prevents-march"};
        if ((Number(state.resources?.gold) || 0) < NOBLE_HOST_MARCH_COST.gold) return {ok: false, reason: "not-enough-gold"};
        if ((Number(state.resources?.food) || 0) < NOBLE_HOST_MARCH_COST.food) return {ok: false, reason: "not-enough-food"};
        addResource("gold", -NOBLE_HOST_MARCH_COST.gold);
        addResource("food", -NOBLE_HOST_MARCH_COST.food);
        host.status = "mustering";
        host.musterStartedTick = tickNow();
        host.readyTick = tickNow() + musterTicks(house, host.strength);
        host.target = currentWarRealm()?.id || "frontier";
        host.joinedWar = false;
        record.loyalty = clamp(Number(record.loyalty) - 2);
        host.lastOrder = "march";
        host.lastOrderYear = yearNow();
        record.host = host;
        host.history.unshift({year: yearNow(), kind: "march", summary: "The host mustered toward " + (currentWarRealm()?.name || "the frontier") + "."});
        host.history = host.history.slice(0, NOBLE_HOST_HISTORY_LIMIT);
        recordHouseHost(record, "host-march", "House " + house.familyName + " mustered its land host.");
        recordHost(nobility, "host-march", "House " + house.familyName + " mustered " + host.strength + " retainers for " + NOBLE_HOST_MARCH_COST.gold + " gold and " + NOBLE_HOST_MARCH_COST.food + " food.");
        return {ok: true, host: viewHost(house, host), snapshot: getNobleHostSnapshot()};
    }

    if (action === "quarter" || action === "return") {
        host.status = "returning";
        host.returnTick = tickNow() + returnTicks(host.strength);
        host.target = "";
        host.joinedWar = false;
        host.lastOrder = "quarter";
        host.lastOrderYear = yearNow();
        record.host = host;
        host.history.unshift({year: yearNow(), kind: "quarter", summary: "The host was ordered home to its estates."});
        host.history = host.history.slice(0, NOBLE_HOST_HISTORY_LIMIT);
        recordHouseHost(record, "host-quarter", "House " + house.familyName + " recalled its land host.");
        return {ok: true, host: viewHost(house, host), snapshot: getNobleHostSnapshot()};
    }

    if (action === "disband") {
        record.host = null;
        record.hostDisbanded = true;
        record.loyalty = clamp(Number(record.loyalty) - 1);
        recordHouseHost(record, "host-disbanded", "House " + house.familyName + " disbanded its land host.");
        recordHost(nobility, "host-disbanded", "House " + house.familyName + " disbanded its land host.");
        return {ok: true, host: null, snapshot: getNobleHostSnapshot()};
    }

    return {ok: false, reason: "unknown-host-order"};
}

export function updateNobleHosts() {
    const nobility = ensureNobility();
    const year = yearNow();
    const tick = tickNow();
    const snapshot = getNobilitySnapshot();
    const war = currentWarRealm();
    let wagesPaid = 0;
    let suppliesPaid = 0;
    let raised = 0;
    let revolts = 0;
    let joinedWar = 0;
    let defense = 0;

    for (const house of snapshot.houses) {
        const record = nobility.houses.find(entry => entry.id === house.id);
        if (!record) continue;
        let host = normalizeNobleHost(record.host);
        if (!house.head || house.memberCount <= 0) {
            record.host = null;
            continue;
        }
        if (!host && !record.hostDisbanded && Number(house.loyalty) >= NOBLE_HOST_LOYALTY_FLOOR) {
            host = makeHost(house, "quartered");
            record.host = host;
            raised++;
        }
        if (!host) continue;

        const target = hostTarget(house);
        const equipment = equipmentTarget(house);
        const upkeep = upkeepFor(house, Math.max(host.strength, target), equipment);
        host.targetStrength = target;
        host.equipment = Math.round(Number(host.equipment || 0) * 0.7 + equipment * 0.3);
        host.wages = upkeep.wages;
        host.supplies = upkeep.supplies;
        const severity = activeFeudSeverityFor(house.id);

        if (host.lastPaidYear < year) {
            if (Number(state.resources?.gold) >= host.wages && Number(state.resources?.food) >= host.supplies) {
                addResource("gold", -host.wages);
                addResource("food", -host.supplies);
                wagesPaid += host.wages;
                suppliesPaid += host.supplies;
                host.lastPaidYear = year;
                host.morale = clamp(host.morale + 1);
            } else {
                host.morale = clamp(host.morale - 9);
                host.strength = Math.max(0, host.strength - Math.max(1, Math.ceil(host.strength * 0.12)));
                record.loyalty = clamp(Number(record.loyalty) - 2);
                host.history.unshift({year, kind: "unpaid", summary: "The host went unpaid and began to melt away."});
                host.history = host.history.slice(0, NOBLE_HOST_HISTORY_LIMIT);
                recordHost(nobility, "host-unpaid", "House " + house.familyName + " could not pay its land host.");
            }
        }

        const drift = Math.ceil(Math.abs(target - host.strength) * 0.35);
        if (host.strength < target) host.strength = Math.min(target, host.strength + drift);
        else if (host.strength > target) host.strength = Math.max(target, host.strength - drift);

        if (Number(house.loyalty) < NOBLE_HOST_REVOLT_LOYALTY && host.strength >= 3 && host.status !== "revolted") {
            host.status = "revolted";
            host.joinedWar = false;
            host.target = "crown";
            host.morale = clamp(host.morale - 8);
            record.loyalty = clamp(Number(record.loyalty) - 4);
            revolts++;
            applyPoliticalEffects({nobility: -2.4, legitimacy: -0.8, commons: 0.2});
            state.morale = clamp((Number(state.morale) || 0) - 1.2, 0, 100);
            host.history.unshift({year, kind: "revolt", summary: "The host renounced the crown and seized its lord's estates."});
            host.history = host.history.slice(0, NOBLE_HOST_HISTORY_LIMIT);
            recordHost(nobility, "host-revolt", "House " + house.familyName + " revolted with " + host.strength + " retainers.");
        } else if (host.status === "revolted" && Number(house.loyalty) >= NOBLE_HOST_LOYALTY_FLOOR) {
            host.status = "quartered";
            host.target = "";
            host.history.unshift({year, kind: "reconciled", summary: "The house returned to the crown's peace."});
            host.history = host.history.slice(0, NOBLE_HOST_HISTORY_LIMIT);
        } else if (war && Number(house.loyalty) >= NOBLE_HOST_WAR_LOYALTY && severity < 4 &&
            host.status !== "revolted" && host.status !== "returning") {
            if (!host.joinedWar) {
                host.joinedWar = true;
                host.status = "marching";
                host.target = String(war.id);
                host.lastWarRealm = String(war.id);
                host.history.unshift({year, kind: "war-joined", summary: "The host joined the war against " + (war.name || war.id) + "."});
                host.history = host.history.slice(0, NOBLE_HOST_HISTORY_LIMIT);
                applyPoliticalEffects({nobility: 0.35, legitimacy: 0.15});
            }
            joinedWar++;
        } else if (!war && host.status === "marching") {
            host.status = "quartered";
            host.joinedWar = false;
            host.target = "";
        }

        if (host.status === "mustering" && tick >= Number(host.readyTick || 0)) {
            host.status = war && Number(house.loyalty) >= NOBLE_HOST_WAR_LOYALTY && severity < 4 ? "marching" : "quartered";
            if (host.status === "marching") host.joinedWar = true;
        }
        if (host.status === "returning" && tick >= Number(host.returnTick || 0)) {
            host.status = "quartered";
            host.returnTick = 0;
        }

        host.readiness = readinessFor(house, host.equipment, host.morale);
        if (host.status !== "revolted") {
            defense += Number(host.strength) * Number(host.readiness) / 100;
        }
        record.host = host;
    }

    nobility.hostDefenseBonus = Math.round(Math.min(0.11, defense * 0.0015) * 1000) / 1000;
    nobility.hostUpkeepThisYear = wagesPaid + suppliesPaid;
    nobility.hostsActive = nobility.houses.filter(house => house.host).length;
    nobility.warHosts = joinedWar;
    nobility.revolts = integer((nobility.revolts || 0) + revolts);
    nobility.hostAudit = {
        year,
        hosts: nobility.hostsActive,
        strength: Math.round(defense),
        wages: wagesPaid,
        supplies: suppliesPaid,
        joinedWar,
        revolts
    };
    nobility.hostHistory = (nobility.hostHistory || []).slice();
    nobility.hostHistory.unshift({
        year,
        hosts: nobility.hostsActive,
        strength: Math.round(defense),
        wages: wagesPaid,
        supplies: suppliesPaid,
        joinedWar,
        revolts
    });
    nobility.hostHistory = nobility.hostHistory.slice(0, 12);
    if (joinedWar > 0) {
        recordHost(nobility, "host-war", joinedWar + " noble host" + (joinedWar === 1 ? "" : "s") + " joined the crown's war.");
    }
    return getNobleHostSnapshot();
}
