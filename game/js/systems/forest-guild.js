// Living Forest Guild commission board. This is the recurring consumer for all
// twenty finished forest-industry goods: patrons order real physical stock from
// warehouses, pay gold, grant renown and move the guild faction. The board
// rotates forever from a fixed catalogue and a saved deterministic stream, so a
// long campaign always has another order without a parallel economy.
import { state } from "../core/state.js";
import { addResource } from "./resources.js";
import { recordResourceMovement } from "./goods-book.js";
import { applyPoliticalEffects } from "./politics.js";
import { addLog } from "../core/event-log.js";
import { consumeFromWarehouse, getPhysicalStock } from "./logistics.js";
import { FURNITURE_STYLES, INDUSTRY_GOODS, WOOD_QUALITY_CLASSES } from "../world/forest-industries.js";
import {
    FOREST_GUILD_ACTIVE_LIMIT, FOREST_GUILD_HISTORY_LIMIT, FOREST_GUILD_PATRONS,
    FOREST_GUILD_VERSION, FOREST_PATRON_PACT_DELIVERIES, FOREST_CARAVAN_ESCORT_GOLD,
    forestGuildNextTier, forestGuildTierFor,
} from "../world/forest-guild.js";
import { consumeFurnitureLotProof, furnitureLotProof } from "./forest-industries.js";

export const FOREST_GUILD_INTERVAL = 30;
const MAX_RENOWN = 9999999;
const clamp = (value, min, max) => Math.max(min, Math.min(max, Number.isFinite(Number(value)) ? Number(value) : min));
const integer = (value, min, max) => clamp(Math.floor(Number(value) || min), min, max);
const tickNow = () => Math.max(0, Math.floor(Number(state.tick) || 0));

function guildLedger() {
    const economy = state.economy || (state.economy = {});
    const production = economy.productionChains || (economy.productionChains = {});
    if (!production.forestGuild || typeof production.forestGuild !== "object" || Array.isArray(production.forestGuild)) {
        production.forestGuild = {
            version: FOREST_GUILD_VERSION,
            seed: ((Number(state.worldSeed) || 1) ^ 0xA53C9E1D) >>> 0,
            renown: 0, completed: 0, expired: 0, serial: 0,
            totalGold: 0, totalDelivered: 0, active: [], history: [],
            lastEvent: null, lastRefreshTick: 0,
        };
    }
    return production.forestGuild;
}

function random(guild) {
    guild.seed = (Number(guild.seed) + 0x6D2B79F5) >>> 0;
    let value = guild.seed;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}

function patronFor(id) {
    return FOREST_GUILD_PATRONS.find(patron => patron.id === id) || null;
}

function commissionId(guild) {
    guild.serial = Math.max(0, Math.floor(Number(guild.serial) || 0)) + 1;
    return "fg-" + guild.serial;
}

function patronLedger(guild) {
    if (!guild.patrons || typeof guild.patrons !== "object" || Array.isArray(guild.patrons)) guild.patrons = {};
    for (const patron of FOREST_GUILD_PATRONS) {
        const entry = guild.patrons[patron.id] && typeof guild.patrons[patron.id] === "object" ? guild.patrons[patron.id] : {};
        guild.patrons[patron.id] = {
            deliveries: integer(entry.deliveries, 0, 1000000),
            pacts: integer(entry.pacts, 0, 1000000),
            active: Boolean(entry.active),
            lastTick: integer(entry.lastTick, 0, Number.MAX_SAFE_INTEGER),
        };
    }
    return guild.patrons;
}

function caravanFor(guild, tier) {
    const now = tickNow();
    const travel = 3 + Math.floor(random(guild) * 4);
    const eventRoll = random(guild);
    return {
        status: "enroute", departTick: now, arrivalTick: now + travel,
        event: eventRoll < 0.07 ? "raid" : eventRoll < 0.22 ? "delay" : "clear",
        eventApplied: false, delayDays: 2 + Math.floor(random(guild) * 3), escortCost: FOREST_CARAVAN_ESCORT_GOLD,
    };
}

function normaliseCaravan(caravan, entry) {
    if (!caravan || typeof caravan !== "object" || Array.isArray(caravan)) {
        // An order written before caravans existed cannot be blocked by a
        // journey that was never dispatched. It stays immediately deliverable.
        return { status: "arrived", departTick: integer(entry?.createdTick, 0, Number.MAX_SAFE_INTEGER), arrivalTick: integer(entry?.createdTick, 0, Number.MAX_SAFE_INTEGER), event: "clear", eventApplied: true, delayDays: 0, escortCost: FOREST_CARAVAN_ESCORT_GOLD, legacy: true };
    }
    const status = ["enroute", "delayed", "arrived", "raided"].includes(caravan.status) ? caravan.status : "arrived";
    return {
        status,
        departTick: integer(caravan.departTick, 0, Number.MAX_SAFE_INTEGER),
        arrivalTick: integer(caravan.arrivalTick, 0, Number.MAX_SAFE_INTEGER),
        event: ["clear", "delay", "raid"].includes(caravan.event) ? caravan.event : "clear",
        eventApplied: Boolean(caravan.eventApplied),
        delayDays: integer(caravan.delayDays, 0, 30),
        escortCost: integer(caravan.escortCost, 1, 100000),
        legacy: Boolean(caravan.legacy),
    };
}

// Draw a patron and a good that is not already requested on the active board.
// Late tiers unlock exotic patrons, but the order quantity is adjusted by the
// good's base value so a crate of silk is never priced like a crate of fronds.
function createCommission(guild) {
    const tier = forestGuildTierFor(guild.renown).tier;
    const usedGoods = new Set((guild.active || []).map(entry => entry.good));
    let patrons = FOREST_GUILD_PATRONS.filter(patron => patron.minTier <= tier &&
        patron.goods.some(good => INDUSTRY_GOODS[good] && !usedGoods.has(good)));
    if (!patrons.length) patrons = FOREST_GUILD_PATRONS.filter(patron => patron.minTier <= tier);
    if (!patrons.length) patrons = FOREST_GUILD_PATRONS;
    const patron = patrons[Math.floor(random(guild) * patrons.length)] || FOREST_GUILD_PATRONS[0];
    const availableGoods = patron.goods.filter(good => INDUSTRY_GOODS[good] && !usedGoods.has(good));
    const goods = availableGoods.length ? availableGoods : patron.goods.filter(good => INDUSTRY_GOODS[good]);
    const good = goods[Math.floor(random(guild) * goods.length)] || goods[0];
    const def = INDUSTRY_GOODS[good];
    const basePrice = Math.max(1, Number(def?.basePrice) || 1);
    const baseQuantity = 4 + tier * 2 + Math.floor(random(guild) * 6);
    const valueScale = basePrice >= 14 ? 0.55 : basePrice >= 9 ? 0.72 : basePrice >= 6 ? 0.88 : 1;
    let quantity = integer(Math.round(baseQuantity * valueScale), 3, 24);
    // A certified furniture order is deliberately small enough to complete
    // from a real workshop's recent batches, while still proving a style run.
    if (good === "furniture") quantity = integer(quantity, 3, 6);
    const gold = Math.max(6, Math.round(basePrice * quantity * (1.22 + tier * 0.035)));
    const renown = Math.max(1, Math.round(1.5 + tier * 0.8 + quantity * 0.35));
    const days = 45 + tier * 7 + Math.floor(random(guild) * 24) + (good === "furniture" ? 30 : 0);
    const createdTick = tickNow();
    let requirement = null;
    if (good === "furniture") {
        const styles = Object.values(FURNITURE_STYLES);
        const qualities = Object.values(WOOD_QUALITY_CLASSES).filter(entry => ["furniture", "export"].includes(entry.id));
        const style = styles[Math.floor(random(guild) * styles.length)] || FURNITURE_STYLES.default;
        const quality = qualities[Math.floor(random(guild) * qualities.length)] || WOOD_QUALITY_CLASSES.furniture;
        requirement = {
            kind: "furniture", styleId: style.id, style: style.label,
            qualityClass: quality.id, quality: quality.label,
            minScore: quality.minScore, minGrade: quality.minScore >= 0.56 ? "export" : "furniture",
        };
    }
    return {
        id: commissionId(guild), patronId: patron.id, good, quantity,
        rewardGold: gold, rewardRenown: renown, faction: patron.faction,
        title: patron.order, story: patron.story,
        createdTick, deadlineTick: createdTick + days, tier,
        requirement,
        caravan: caravanFor(guild, tier),
    };
}

function fillBoard(guild) {
    guild.active = Array.isArray(guild.active) ? guild.active.filter(entry => entry && INDUSTRY_GOODS[entry.good]) : [];
    let guard = 0;
    while (guild.active.length < FOREST_GUILD_ACTIVE_LIMIT && guard++ < FOREST_GUILD_ACTIVE_LIMIT * 3) {
        guild.active.push(createCommission(guild));
    }
    guild.lastRefreshTick = tickNow();
    return guild;
}

function normalizeCommission(entry, guild) {
    if (!entry || typeof entry !== "object") return null;
    const good = String(entry.good || "");
    if (!INDUSTRY_GOODS[good]) return null;
    const patron = patronFor(entry.patronId) || FOREST_GUILD_PATRONS[0];
    const quantity = integer(entry.quantity, 1, 24);
    const created = integer(entry.createdTick, 0, Number.MAX_SAFE_INTEGER);
    const deadline = Math.max(created + 1, integer(entry.deadlineTick, created + 1, Number.MAX_SAFE_INTEGER));
    return {
        id: String(entry.id || commissionId(guild)).slice(0, 32),
        patronId: patron.id,
        good,
        quantity,
        rewardGold: integer(entry.rewardGold, 1, 1000000),
        rewardRenown: integer(entry.rewardRenown, 1, 100000),
        faction: patron.faction,
        title: String(entry.title || patron.order).slice(0, 96),
        story: String(entry.story || patron.story).slice(0, 240),
        createdTick: created, deadlineTick: deadline,
        tier: integer(entry.tier, 1, 10),
        requirement: entry.requirement && typeof entry.requirement === "object" && entry.requirement.kind === "furniture" && FURNITURE_STYLES[Object.keys(FURNITURE_STYLES).find(key => FURNITURE_STYLES[key].id === entry.requirement.styleId)]
            ? {
                kind: "furniture", styleId: String(entry.requirement.styleId).slice(0, 32),
                style: String(entry.requirement.style || "Furniture style").slice(0, 64),
                qualityClass: String(entry.requirement.qualityClass || "furniture").slice(0, 32),
                quality: String(entry.requirement.quality || "Furniture grade").slice(0, 64),
                minScore: clamp(entry.requirement.minScore, 0, 1),
                minGrade: String(entry.requirement.minGrade || "furniture").slice(0, 24),
            }
            : null,
        caravan: normaliseCaravan(entry.caravan, entry),
    };
}

function normalizeGuild(guild) {
    guild.version = FOREST_GUILD_VERSION;
    guild.seed = (Number(guild.seed) || ((Number(state.worldSeed) || 1) ^ 0xA53C9E1D)) >>> 0;
    guild.renown = integer(guild.renown, 0, MAX_RENOWN);
    guild.completed = integer(guild.completed, 0, 100000000);
    guild.expired = integer(guild.expired, 0, 100000000);
    guild.serial = integer(guild.serial, 0, 100000000);
    guild.totalGold = integer(guild.totalGold, 0, Number.MAX_SAFE_INTEGER);
    guild.totalDelivered = integer(guild.totalDelivered, 0, Number.MAX_SAFE_INTEGER);
    guild.lastRefreshTick = integer(guild.lastRefreshTick, 0, Number.MAX_SAFE_INTEGER);
    patronLedger(guild);
    const seen = new Set();
    guild.active = (Array.isArray(guild.active) ? guild.active : [])
        .map(entry => normalizeCommission(entry, guild))
        .filter(entry => entry && !seen.has(entry.id) && seen.add(entry.id))
        .slice(0, FOREST_GUILD_ACTIVE_LIMIT);
    for (const entry of guild.active) {
        const numeric = Number(String(entry.id).replace(/^fg-/, ""));
        if (Number.isFinite(numeric)) guild.serial = Math.max(guild.serial, Math.floor(numeric));
    }
    guild.history = (Array.isArray(guild.history) ? guild.history : [])
        .filter(entry => entry && typeof entry === "object" && INDUSTRY_GOODS[entry.good])
        .map(entry => ({
            id: String(entry.id || "fg-history").slice(0, 32),
            patronId: String(entry.patronId || "guild").slice(0, 32),
            good: String(entry.good),
            quantity: integer(entry.quantity, 0, 100000),
            rewardGold: integer(entry.rewardGold, 0, 10000000),
            rewardRenown: integer(entry.rewardRenown, 0, 1000000),
            tick: integer(entry.tick, 0, Number.MAX_SAFE_INTEGER),
            year: integer(entry.year, 1, 1000000),
            outcome: entry.outcome === "expired" ? "expired" : "delivered",
        }))
        .slice(-FOREST_GUILD_HISTORY_LIMIT);
    if (!guild.lastEvent || typeof guild.lastEvent !== "object") guild.lastEvent = null;
    return guild;
}

export function ensureForestGuild() {
    return fillBoard(normalizeGuild(guildLedger()));
}

export function forestPatronBonus(kind, good = null) {
    const guild = state.economy?.productionChains?.forestGuild;
    if (!guild || typeof guild !== "object") return 0;
    const patrons = patronLedger(guild);
    let total = 0;
    for (const patron of FOREST_GUILD_PATRONS) {
        const stateEntry = patrons[patron.id];
        if (!stateEntry?.active || !patron.bonus || patron.bonus.kind !== kind) continue;
        if (good && !patron.bonus.goods.includes(good)) continue;
        total += Number(patron.bonus.value) || 0;
    }
    return total;
}

// The tier premium is global; each signed patron adds a second, permanent
// premium only for the goods named in that patron's pact.
function patronGoodsPremium(good) {
    let total = 0;
    const guild = state.economy?.productionChains?.forestGuild;
    if (!guild || typeof guild !== "object") return 0;
    const patrons = patronLedger(guild);
    for (const patron of FOREST_GUILD_PATRONS) {
        if (!patrons[patron.id]?.active || !patron.bonus) continue;
        if (!patron.bonus.goods.includes(good)) continue;
        if (patron.bonus.kind === "goods-premium" || patron.bonus.kind === "naval-trade" || patron.bonus.kind === "furniture-prestige") {
            total += Number(patron.bonus.value) || 0;
        }
    }
    return total;
}

export function forestGuildMarketPremium(good) {
    if (!INDUSTRY_GOODS[good]) return 1;
    const economy = state.economy;
    const guild = economy?.productionChains?.forestGuild;
    if (!guild || typeof guild !== "object") return 1;
    return 1 + forestGuildTierFor(guild.renown).premium + patronGoodsPremium(good);
}

function warehouseAvailable(good) {
    let total = 0;
    for (const entity of state.entities) {
        if (!entity || entity.dead || !entity.warehouse || !Array.isArray(entity.warehouse.filters)) continue;
        if (!entity.warehouse.filters.includes(good)) continue;
        const stored = Math.max(0, Number(entity.warehouse.stored?.[good]) || 0);
        const reserved = Math.max(0, Number(entity.warehouse.reservedOut?.[good]) || 0);
        total += Math.max(0, stored - reserved);
    }
    return total;
}

// The single physical withdrawal path shared by guild deliveries and clinic
// supply. It only takes unreserved warehouse stock and refuses to partially
// consume an order it cannot fill, so a failed delivery never eats goods.
export function consumeIndustryGoodFromWarehouses(good, quantity, { cause = "forest-guild", to = null } = {}) {
    const want = Math.max(0, Math.floor(Number(quantity) || 0));
    if (!want) return { ok: false, reason: "No quantity requested", available: 0, moved: 0 };
    if (!INDUSTRY_GOODS[good]) return { ok: false, reason: "Not a forest-industry good", available: 0, moved: 0 };
    const available = warehouseAvailable(good);
    if (available < want) {
        return { ok: false, reason: "Only " + available + " " + (INDUSTRY_GOODS[good].label || good) + " in warehouse stores", available, moved: 0 };
    }
    let remaining = want;
    let moved = 0;
    for (const entity of state.entities) {
        if (remaining <= 0) break;
        if (!entity || entity.dead || !entity.warehouse || !Array.isArray(entity.warehouse.filters)) continue;
        if (!entity.warehouse.filters.includes(good)) continue;
        const amount = consumeFromWarehouse(entity, good, remaining, {
            cause, to: to || { kind: "guild", id: "forest-guild" },
        });
        moved += Math.max(0, amount);
        remaining -= Math.max(0, amount);
    }
    if (moved < want) {
        return { ok: false, reason: "Warehouse stock changed during withdrawal", available: moved, moved };
    }
    return { ok: true, moved, available: available - moved };
}

export function industryWarehouseStock(good) {
    return INDUSTRY_GOODS[good] ? warehouseAvailable(good) : 0;
}

function commissionView(entry, guild) {
    const def = INDUSTRY_GOODS[entry.good];
    const stock = warehouseAvailable(entry.good);
    const proofStock = entry.requirement ? furnitureLotProof(entry.requirement.styleId, entry.requirement.minScore) : null;
    const caravan = entry.caravan || normaliseCaravan(null, entry);
    const caravanDays = caravan.status === "enroute" || caravan.status === "delayed" ? Math.max(0, Math.ceil(caravan.arrivalTick - tickNow())) : 0;
    const supplyReady = stock >= entry.quantity && (!entry.requirement || proofStock >= entry.quantity);
    return {
        ...entry,
        caravan,
        caravanDays,
        caravanStatus: caravan.status,
        label: def?.label || entry.good,
        use: def?.use || "",
        stock,
        proofStock,
        supplyReady,
        ready: supplyReady && caravan.status === "arrived",
        daysLeft: Math.max(0, Math.ceil(entry.deadlineTick - tickNow())),
        premiumPct: Math.round(forestGuildTierFor(guild.renown).premium * 100),
        patronBonusPct: Math.round(patronGoodsPremium(entry.good) * 100),
    };
}

export function forestGuildSummary() {
    const guild = ensureForestGuild();
    const tier = forestGuildTierFor(guild.renown);
    const next = forestGuildNextTier(guild.renown);
    return {
        renown: guild.renown,
        tier: tier.tier,
        tierTitle: tier.title,
        tierLabel: "TIER " + tier.tier + " · " + tier.title,
        premiumPct: Math.round(tier.premium * 100),
        nextTier: next ? { tier: next.tier, title: next.title, at: next.renown, remaining: Math.max(0, next.renown - guild.renown) } : null,
        progress: next ? Math.max(0, Math.min(1, (guild.renown - tier.renown) / Math.max(1, next.renown - tier.renown))) : 1,
        active: guild.active.map(entry => commissionView(entry, guild)),
        history: guild.history.slice(-FOREST_GUILD_HISTORY_LIMIT).reverse().map(entry => ({
            ...entry,
            label: INDUSTRY_GOODS[entry.good]?.label || entry.good,
            patronName: patronFor(entry.patronId)?.name || "Forest Guild",
        })),
        completed: guild.completed,
        expired: guild.expired,
        totalGold: guild.totalGold,
        totalDelivered: guild.totalDelivered,
        lastEvent: guild.lastEvent,
        activeLimit: FOREST_GUILD_ACTIVE_LIMIT,
        historyLimit: FOREST_GUILD_HISTORY_LIMIT,
        pacts: FOREST_GUILD_PATRONS.filter(patron => patronLedger(guild)[patron.id]?.active).length,
        patrons: FOREST_GUILD_PATRONS.map(patron => {
            const standing = patronLedger(guild)[patron.id];
            return {
                id: patron.id, name: patron.name, seal: patron.seal, faction: patron.faction,
                deliveries: standing.deliveries, pacts: standing.pacts, active: standing.active,
                threshold: FOREST_PATRON_PACT_DELIVERIES,
                progress: standing.active ? 1 : Math.min(1, standing.deliveries / FOREST_PATRON_PACT_DELIVERIES),
                bonusKind: patron.bonus?.kind || "none", bonusPct: Math.round((Number(patron.bonus?.value) || 0) * 100),
                bonusLabel: standing.active ? patron.bonus?.label || "" : "Pact after " + FOREST_PATRON_PACT_DELIVERIES + " deliveries · " + (patron.bonus?.label || "no standing bonus"),
            };
        }),
    };
}

function remember(guild, entry, outcome) {
    guild.history.push({
        id: entry.id, patronId: entry.patronId, good: entry.good,
        quantity: entry.quantity, rewardGold: entry.rewardGold,
        rewardRenown: entry.rewardRenown, tick: tickNow(),
        year: Math.max(1, Math.floor(Number(state.year) || 1)), outcome,
    });
    if (guild.history.length > FOREST_GUILD_HISTORY_LIMIT) {
        guild.history.splice(0, guild.history.length - FOREST_GUILD_HISTORY_LIMIT);
    }
}

export function deliverForestCommission(id) {
    const guild = ensureForestGuild();
    const index = guild.active.findIndex(entry => String(entry.id) === String(id));
    if (index < 0) return { ok: false, reason: "That commission is no longer on the board" };
    const entry = guild.active[index];
    const def = INDUSTRY_GOODS[entry.good];
    if (entry.caravan?.status !== "arrived") {
        const reason = entry.caravan?.status === "raided"
            ? "The guild caravan was raided; escort a new one first"
            : "The guild caravan has not arrived yet";
        return { ok: false, reason };
    }
    if (entry.requirement) {
        const proof = furnitureLotProof(entry.requirement.styleId, entry.requirement.minScore);
        if (proof < entry.quantity) {
            return { ok: false, reason: "The guild requires " + entry.quantity + " " + entry.requirement.style + " pieces at " + entry.requirement.quality + " (only " + proof + " certified in store)", available: proof };
        }
    }
    const withdrawal = consumeIndustryGoodFromWarehouses(entry.good, entry.quantity, {
        cause: "forest-guild-commission",
        to: { kind: "guild", id: patronFor(entry.patronId)?.id || "forest-guild" },
    });
    if (!withdrawal.ok) return { ok: false, reason: withdrawal.reason, available: withdrawal.available };
    if (entry.requirement) {
        const proof = consumeFurnitureLotProof(entry.requirement.styleId, entry.requirement.minScore, entry.quantity);
        if (!proof.ok) return { ok: false, reason: "The certified furniture changed during withdrawal" };
    }

    const tierBefore = forestGuildTierFor(guild.renown).tier;
    addResource("gold", entry.rewardGold);
    recordResourceMovement("gold", entry.rewardGold, "forest-guild-commission", {
        from: { kind: "guild", id: patronFor(entry.patronId)?.id || "forest-guild" },
        to: { kind: "realm", id: "royal-stores" },
    });
    guild.renown = clamp(guild.renown + entry.rewardRenown, 0, MAX_RENOWN);
    guild.completed += 1;
    guild.totalGold += entry.rewardGold;
    guild.totalDelivered += entry.quantity;
    const patron = patronFor(entry.patronId);
    const standing = patron ? patronLedger(guild)[patron.id] : null;
    let pactSigned = false;
    if (standing) {
        standing.deliveries += 1;
        standing.lastTick = tickNow();
        if (!standing.active && standing.deliveries >= FOREST_PATRON_PACT_DELIVERIES) {
            standing.active = true;
            standing.pacts += 1;
            pactSigned = true;
        }
    }
    remember(guild, entry, "delivered");
    guild.active.splice(index, 1);
    fillBoard(guild);
    applyPoliticalEffects({
        legitimacy: 0.15 + Math.min(0.35, entry.quantity / 80) + (pactSigned ? 0.4 : 0),
        guilds: 0.8 + (patron?.bonus?.kind === "goods-premium" ? 0.15 : 0),
        ...(patron ? { [patron.faction]: 0.35 + (pactSigned ? 0.5 : 0) } : {}),
    });
    if (pactSigned) {
        addLog("GUILD PATRON PACT SIGNED · " + (patron?.name || "FOREST GUILD").toUpperCase() + " · " + (patron?.bonus?.label || "permanent standing").toUpperCase(), "#d8b36a", "economy");
    }
    const tierAfter = forestGuildTierFor(guild.renown);
    if (tierAfter.tier > tierBefore) {
        addLog("FOREST GUILD RENOWN · TIER " + tierAfter.tier + " · " + tierAfter.title.toUpperCase(), "#d8b36a", "economy");
    }
    guild.lastEvent = {
        kind: "delivered", tick: tickNow(), good: entry.good, quantity: entry.quantity,
        rewardGold: entry.rewardGold, renown: entry.rewardRenown,
        patronId: entry.patronId, tier: tierAfter.tier, pactSigned,
        style: entry.requirement?.style || null, quality: entry.requirement?.quality || null,
    };
    addLog("FOREST GUILD COMMISSION FILLED · " + entry.quantity + " " + (def?.label || entry.good).toUpperCase() +
        " FOR THE " + (patron?.name || "FOREST GUILD").toUpperCase() + " · +" + entry.rewardGold + " GOLD · +" + entry.rewardRenown + " RENOWN", "#d8b36a", "economy");
    return {
        ok: true, good: entry.good, label: def?.label || entry.good,
        quantity: entry.quantity, gold: entry.rewardGold, renown: entry.rewardRenown,
        tier: tierAfter.tier, tierTitle: tierAfter.title, patron: patron?.name || "Forest Guild",
        style: entry.requirement?.style || null, quality: entry.requirement?.quality || null, pactSigned,
    };
}

// A raided caravan can be replaced by paying a real escort from the treasury.
// The new journey draws from the saved guild stream, so reloads cannot reroll
// a raid into a safe passage.
export function dispatchGuildCaravan(id) {
    const guild = ensureForestGuild();
    const entry = guild.active.find(row => String(row.id) === String(id));
    if (!entry || !entry.caravan) return { ok: false, reason: "That commission is no longer on the board" };
    if (entry.caravan.status !== "raided") return { ok: false, reason: "Only a raided caravan needs an escort" };
    const cost = Math.max(1, Number(entry.caravan.escortCost) || FOREST_CARAVAN_ESCORT_GOLD);
    if ((Number(state.resources?.gold) || 0) < cost) return { ok: false, reason: "The treasury cannot pay the " + cost + " gold escort" };
    addResource("gold", -cost);
    recordResourceMovement("gold", cost, "forest-guild-caravan-escort", {
        from: { kind: "realm", id: "royal-stores" }, to: { kind: "guild", id: "forest-guild" },
    });
    entry.caravan = caravanFor(guild, entry.tier);
    entry.caravan.escortCost = cost;
    entry.caravan.escorted = true;
    guild.lastEvent = { kind: "caravan-escort", tick: tickNow(), commissionId: entry.id, cost, patronId: entry.patronId };
    addLog("GUILD CARAVAN ESCORTED · " + cost + " GOLD · NEW ROUTE DISPATCHED", "#c9a86a", "economy");
    return { ok: true, cost, arrivalTick: entry.caravan.arrivalTick, caravan: { ...entry.caravan } };
}

export function updateForestGuild() {
    if (!state.hasStarted) return false;
    if (state.tick === 0 || state.tick % FOREST_GUILD_INTERVAL !== 0) return false;
    const guild = ensureForestGuild();
    const now = tickNow();
    let caravanChanged = false;
    for (const entry of guild.active) {
        const caravan = entry.caravan;
        if (!caravan || (caravan.status !== "enroute" && caravan.status !== "delayed")) continue;
        if (now < caravan.arrivalTick) continue;
        if (caravan.event === "delay" && !caravan.eventApplied) {
            caravan.status = "delayed";
            caravan.eventApplied = true;
            caravan.arrivalTick = now + Math.max(1, Number(caravan.delayDays) || 2);
            guild.lastEvent = { kind: "caravan-delayed", tick: now, commissionId: entry.id, patronId: entry.patronId, delayDays: caravan.delayDays };
            addLog("GUILD CARAVAN DELAYED · " + (patronFor(entry.patronId)?.name || "FOREST GUILD").toUpperCase() + " · " + caravan.delayDays + " DAYS", "#bc9561", "economy");
            caravanChanged = true;
            continue;
        }
        if (caravan.event === "raid" && !caravan.eventApplied) {
            caravan.status = "raided";
            caravan.eventApplied = true;
            guild.lastEvent = { kind: "caravan-raided", tick: now, commissionId: entry.id, patronId: entry.patronId };
            addLog("GUILD CARAVAN RAIDED · " + (patronFor(entry.patronId)?.name || "FOREST GUILD").toUpperCase() + " · ESCORT NEEDED", "#b5725f", "economy");
            caravanChanged = true;
            continue;
        }
        caravan.status = "arrived";
        caravan.eventApplied = true;
        guild.lastEvent = { kind: "caravan-arrived", tick: now, commissionId: entry.id, patronId: entry.patronId };
        caravanChanged = true;
    }
    const expired = guild.active.filter(entry => entry.deadlineTick <= now);
    if (!expired.length) return caravanChanged;
    for (const entry of expired) {
        guild.active = guild.active.filter(active => active.id !== entry.id);
        guild.renown = Math.max(0, guild.renown - 3);
        guild.expired += 1;
        remember(guild, entry, "expired");
        const def = INDUSTRY_GOODS[entry.good];
        const patron = patronFor(entry.patronId);
        guild.lastEvent = {
            kind: "expired", tick: now, good: entry.good, quantity: entry.quantity,
            patronId: entry.patronId, tier: forestGuildTierFor(guild.renown).tier,
        };
        addLog("FOREST GUILD COMMISSION LAPSED · " + (def?.label || entry.good).toUpperCase() +
            " FOR THE " + (patron?.name || "FOREST GUILD").toUpperCase() + " · RENOWN -3", "#b78b63", "economy");
    }
    applyPoliticalEffects({ guilds: -0.4 * expired.length, legitimacy: -0.15 * expired.length });
    fillBoard(guild);
    return true;
}
