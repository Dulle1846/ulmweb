// Trade-facing diplomatic rules. Kept free of market imports so executeTrade can
// apply a treaty without creating a circular dependency through diplomacy.
import { normalizeTreaty } from "./diplomacy-config.js";

const clamp = (value, min, max) => Math.max(min, Math.min(max, Number.isFinite(Number(value)) ? Number(value) : 0));

export function getDiplomaticTradeTerms(diplomacy, partnerId, courtTradeBonus = 0) {
    const realm = Array.isArray(diplomacy?.realms)
        ? diplomacy.realms.find(item => item && item.id === partnerId)
        : null;
    const treaty = normalizeTreaty(realm?.treaty);
    const relation = Number.isFinite(Number(realm?.relation)) ? clamp(realm.relation, 0, 100) : 50;
    if (treaty === "war") {
        return { partnerId, treaty, relation, blocked:true, bonus:0, buyFactor:1, sellFactor:1 };
    }
    // Better relations shave the purchase price and raise the sale payout. A
    // trade pact adds a small premium; an alliance is the strongest terms.
    const relationBonus = (relation - 50) / 250;
    const treatyBonus = treaty === "alliance" ? 0.10 : treaty === "trade" ? 0.05 : 0;
    const envoyBonus = clamp((Number(realm?.envoySkill) || 0) / 100 * 0.04, 0, 0.04);
    const courtBonus = clamp(courtTradeBonus, 0, 0.08);
    const bonus = clamp(relationBonus + treatyBonus + envoyBonus + courtBonus, -0.20, 0.34);
    return {
        partnerId, treaty, relation, blocked:false, bonus,
        buyFactor:clamp(1 - bonus, 0.72, 1.22),
        sellFactor:clamp(1 + bonus, 0.78, 1.30)
    };
}

// A compact, bounded ledger of commerce shaping the relationship. The market
// calls this after a successful trade; it never changes resources itself.
export function recordTradeInfluence(diplomacy, partnerId, trade = {}) {
    const realm = Array.isArray(diplomacy?.realms)
        ? diplomacy.realms.find(item => item && item.id === partnerId)
        : null;
    if (!realm) return null;
    if (normalizeTreaty(realm.treaty) === "war") return realm;

    const amount = Math.max(0, Math.min(25, Math.floor(Number(trade.amount) || 0)));
    const gold = Math.max(0, Number(trade.gold) || 0);
    const year = Math.max(1, Math.floor(Number(trade.year) || 1));
    const tick = Math.max(0, Math.floor(Number(trade.tick) || 0));
    const direction = trade.direction === "sell" ? "sell" : "buy";
    const resource = String(trade.resource || "goods").slice(0, 12);

    realm.relation = clamp(Number(realm.relation) + 0.16 + Math.min(0.45, amount * 0.018) + (direction === "sell" ? 0.04 : 0), 0, 100);
    realm.trust = clamp(Number(realm.trust) + 0.12, 0, 100);
    realm.fear = clamp(Number(realm.fear) - 0.05, 0, 100);
    realm.tradeVolume = Math.min(1_000_000_000, Math.max(0, Number(realm.tradeVolume) || 0) + amount);
    realm.lastTradeYear = year;
    realm.lastContactYear = year;

    const history = Array.isArray(realm.history) ? realm.history : [];
    history.unshift({
        year, tick, kind:"trade", realmId:realm.id,
        summary:(direction === "buy" ? "Bought " : "Sold ") + amount + " " + resource + " (" + Math.round(gold) + " gold)"
    });
    if (history.length > 16) history.length = 16;
    realm.history = history;
    return realm;
}
