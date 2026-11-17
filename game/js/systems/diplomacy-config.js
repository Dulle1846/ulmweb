// Canonical neighbouring realms. The market and the diplomatic court share this
// identity list so a trade partner can never drift into a different envoy.
export const DIPLOMATIC_REALMS = Object.freeze([
    {
        id:"northmere", name:"Northmere Guild", region:"Northern Marches", specialty:"WOOD",
        ruler:"Guildmaster Aldric Vane", trait:"Mercantile",
        baseRelation:58, baseTrust:54, baseFear:20,
        tradeTreasury:420, tradeStock:Object.freeze({wood:90,stone:35,food:60}),
        tradeAgreement:Object.freeze({
            importResource:"wood", importPerYear:18,
            exportResource:"stone", exportCap:12, exportKeep:60, exportUnitGold:2,
            signingGold:12, annualGold:5, minRelation:52, minTrust:48
        }),
        royalHouse:Object.freeze({
            id:"northmere-elowen-vane", house:"House Vane", name:"Lady Elowen Vane",
            sex:"female", species:"human", ageYears:27,
            traits:Object.freeze({ambition:58,courage:54,compassion:72,greed:36,sociability:74,discipline:64,curiosity:61,piety:55,distrust:28,patience:69}),
            dowry:Object.freeze({gold:35,wood:30}), minRelation:48, minTrust:44
        })
    },
    {
        id:"ironvale", name:"Ironvale Caravans", region:"Eastern Highlands", specialty:"STONE",
        ruler:"Caravan-Marshal Bryn Ironvale", trait:"Defensive",
        baseRelation:52, baseTrust:50, baseFear:34,
        tradeTreasury:520, tradeStock:Object.freeze({wood:25,stone:110,food:35}),
        tradeAgreement:Object.freeze({
            importResource:"stone", importPerYear:16,
            exportResource:"wood", exportCap:14, exportKeep:80, exportUnitGold:2,
            signingGold:14, annualGold:6, minRelation:48, minTrust:46
        }),
        royalHouse:Object.freeze({
            id:"ironvale-torren-ironvale", house:"House Ironvale", name:"Lord Torren Ironvale",
            sex:"male", species:"dwarf", ageYears:38,
            traits:Object.freeze({ambition:66,courage:71,compassion:48,greed:52,sociability:44,discipline:78,curiosity:46,piety:42,distrust:57,patience:63}),
            dowry:Object.freeze({gold:30,stone:40}), minRelation:45, minTrust:45
        })
    },
    {
        id:"goldcoast", name:"Goldcoast League", region:"Southern Coast", specialty:"FOOD",
        ruler:"First Merchant Sera Voss", trait:"Wealthy",
        baseRelation:64, baseTrust:60, baseFear:12,
        tradeTreasury:760, tradeStock:Object.freeze({wood:45,stone:30,food:125}),
        tradeAgreement:Object.freeze({
            importResource:"food", importPerYear:20,
            exportResource:"stone", exportCap:10, exportKeep:50, exportUnitGold:3,
            signingGold:16, annualGold:7, minRelation:58, minTrust:54
        }),
        royalHouse:Object.freeze({
            id:"goldcoast-marisol-voss", house:"House Voss", name:"Lady Marisol Voss",
            sex:"female", species:"human", ageYears:31,
            traits:Object.freeze({ambition:73,courage:42,compassion:58,greed:68,sociability:81,discipline:57,curiosity:66,piety:38,distrust:44,patience:51}),
            dowry:Object.freeze({gold:70,food:25}), minRelation:55, minTrust:52
        })
    },
    {
        id:"redpass", name:"Redpass Companies", region:"Western Frontier", specialty:"SUPPLIES",
        ruler:"Warden-Captain Halden Rook", trait:"Wary",
        baseRelation:44, baseTrust:42, baseFear:38,
        tradeTreasury:300, tradeStock:Object.freeze({wood:60,stone:55,food:25}),
        tradeAgreement:Object.freeze({
            importResource:"food", importPerYear:15,
            exportResource:"wood", exportCap:16, exportKeep:75, exportUnitGold:2,
            signingGold:10, annualGold:4, minRelation:40, minTrust:38
        }),
        royalHouse:Object.freeze({
            id:"redpass-rhea-rook", house:"House Rook", name:"Captain Rhea Rook",
            sex:"female", species:"orc", ageYears:29,
            traits:Object.freeze({ambition:62,courage:86,compassion:55,greed:31,sociability:49,discipline:71,curiosity:43,piety:36,distrust:64,patience:40}),
            dowry:Object.freeze({food:35,wood:25}), minRelation:40, minTrust:38
        })
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
