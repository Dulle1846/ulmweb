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
import { INDUSTRY_GOODS } from "../world/forest-industries.js";
import {
    FOREST_GUILD_ACTIVE_LIMIT, FOREST_GUILD_HISTORY_LIMIT, FOREST_GUILD_PATRONS,
    FOREST_GUILD_VERSION, forestGuildNextTier, forestGuildTierFor,
} from "../world/forest-guild.js";

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
    const quantity = integer(Math.round(baseQuantity * valueScale), 3, 24);
    const gold = Math.max(6, Math.round(basePrice * quantity * (1.22 + tier * 0.035)));
    const renown = Math.max(1, Math.round(1.5 + tier * 0.8 + quantity * 0.35));
    const days = 45 + tier * 7 + Math.floor(random(guild) * 24);
    const createdTick = tickNow();
    return {
        id: commissionId(guild), patronId: patron.id, good, quantity,
        rewardGold: gold, rewardRenown: renown, faction: patron.faction,
        title: patron.order, story: patron.story,
        createdTick, deadlineTick: createdTick + days, tier,
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

export function forestGuildMarketPremium(good) {
    if (!INDUSTRY_GOODS[good]) return 1;
    const economy = state.economy;
    const guild = economy?.productionChains?.forestGuild;
    if (!guild || typeof guild !== "object") return 1;
    return 1 + forestGuildTierFor(guild.renown).premium;
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
    return {
        ...entry,
        label: def?.label || entry.good,
        use: def?.use || "",
        stock,
        ready: stock >= entry.quantity,
        daysLeft: Math.max(0, Math.ceil(entry.deadlineTick - tickNow())),
        premiumPct: Math.round(forestGuildTierFor(guild.renown).premium * 100),
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
    const tierBefore = forestGuildTierFor(guild.renown).tier;
    const withdrawal = consumeIndustryGoodFromWarehouses(entry.good, entry.quantity, {
        cause: "forest-guild-commission",
        to: { kind: "guild", id: patronFor(entry.patronId)?.id || "forest-guild" },
    });
    if (!withdrawal.ok) return { ok: false, reason: withdrawal.reason, available: withdrawal.available };

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
    remember(guild, entry, "delivered");
    guild.active.splice(index, 1);
    fillBoard(guild);
    applyPoliticalEffects({
        legitimacy: 0.15 + Math.min(0.35, entry.quantity / 80),
        guilds: 0.8,
        ...(patron ? { [patron.faction]: 0.35 } : {}),
    });
    const tierAfter = forestGuildTierFor(guild.renown);
    if (tierAfter.tier > tierBefore) {
        addLog("FOREST GUILD RENOWN · TIER " + tierAfter.tier + " · " + tierAfter.title.toUpperCase(), "#d8b36a", "economy");
    }
    guild.lastEvent = {
        kind: "delivered", tick: tickNow(), good: entry.good, quantity: entry.quantity,
        rewardGold: entry.rewardGold, renown: entry.rewardRenown,
        patronId: entry.patronId, tier: tierAfter.tier,
    };
    addLog("FOREST GUILD COMMISSION FILLED · " + entry.quantity + " " + (def?.label || entry.good).toUpperCase() +
        " FOR THE " + (patron?.name || "FOREST GUILD").toUpperCase() + " · +" + entry.rewardGold + " GOLD · +" + entry.rewardRenown + " RENOWN", "#d8b36a", "economy");
    return {
        ok: true, good: entry.good, label: def?.label || entry.good,
        quantity: entry.quantity, gold: entry.rewardGold, renown: entry.rewardRenown,
        tier: tierAfter.tier, tierTitle: tierAfter.title, patron: patron?.name || "Forest Guild",
    };
}

export function updateForestGuild() {
    if (!state.hasStarted) return false;
    if (state.tick === 0 || state.tick % FOREST_GUILD_INTERVAL !== 0) return false;
    const guild = ensureForestGuild();
    const now = tickNow();
    const expired = guild.active.filter(entry => entry.deadlineTick <= now);
    if (!expired.length) return false;
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
