// Canonical neighbouring realms. The market and the diplomatic court share this
// identity list so a trade partner can never drift into a different envoy.
export const DIPLOMATIC_REALMS = Object.freeze([
    {
        id:"northmere", name:"Northmere Guild", region:"Northern Marches", specialty:"WOOD",
        ruler:"Guildmaster Aldric Vane", trait:"Mercantile",
        baseRelation:58, baseTrust:54, baseFear:20,
        tradeTreasury:420, tradeStock:Object.freeze({wood:90,stone:35,food:60})
    },
    {
        id:"ironvale", name:"Ironvale Caravans", region:"Eastern Highlands", specialty:"STONE",
        ruler:"Caravan-Marshal Bryn Ironvale", trait:"Defensive",
        baseRelation:52, baseTrust:50, baseFear:34,
        tradeTreasury:520, tradeStock:Object.freeze({wood:25,stone:110,food:35})
    },
    {
        id:"goldcoast", name:"Goldcoast League", region:"Southern Coast", specialty:"FOOD",
        ruler:"First Merchant Sera Voss", trait:"Wealthy",
        baseRelation:64, baseTrust:60, baseFear:12,
        tradeTreasury:760, tradeStock:Object.freeze({wood:45,stone:30,food:125})
    },
    {
        id:"redpass", name:"Redpass Companies", region:"Western Frontier", specialty:"SUPPLIES",
        ruler:"Warden-Captain Halden Rook", trait:"Wary",
        baseRelation:44, baseTrust:42, baseFear:38,
        tradeTreasury:300, tradeStock:Object.freeze({wood:60,stone:55,food:25})
    }
]);

export const DIPLOMATIC_TREATIES = Object.freeze({
    none:{label:"Neutral", tone:"neutral"},
    trade:{label:"Trade pact", tone:"trade"},
    alliance:{label:"Alliance", tone:"alliance"},
    war:{label:"At war", tone:"war"}
});

export function normalizeTreaty(value) {
    return Object.hasOwn(DIPLOMATIC_TREATIES, value) ? value : "none";
}

export const TRADE_PARTNERS = Object.freeze(DIPLOMATIC_REALMS.map(realm => Object.freeze({
    id:realm.id,
    name:realm.name,
    region:realm.region,
    specialty:realm.specialty,
    treasury:realm.tradeTreasury,
    stock:Object.freeze({...realm.tradeStock})
})));
