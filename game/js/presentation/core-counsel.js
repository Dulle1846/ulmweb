// The core loop needs one clear next step. This helper is presentation-only:
// it reads existing state and never mutates the realm or invents a new system.
import { TYPE } from "../core/types.js";
import { BUILDING_COSTS, CONSTRUCTION_SHARE, costShare, isHousingType, housingCapacityFor } from "../systems/city-config.js";
import { ROAD_TYPES } from "../systems/roads.js";
import { getAmbitionSnapshot } from "../systems/ambitions.js";
import { getScenarioSnapshot } from "../systems/scenario.js";
import { WAR_AIMS, CAMPAIGN_GOAL } from "../systems/feudal-campaigns.js";
import { COUNCIL_BILLS } from "../systems/council-laws.js";

function canAfford(state, cost) {
    return Object.entries(cost || {}).every(([resource, amount]) =>
        Number(amount) <= 0 || (Number(state?.resources?.[resource]) || 0) >= Number(amount));
}

function marketCanBuy(state, resource, amount = 5) {
    const price = Number(state?.market?.prices?.[resource]) || 2;
    const stock = (Array.isArray(state?.market?.partners) ? state.market.partners : [])
        .reduce((total, partner) => total + Math.max(0, Number(partner?.stock?.[resource]) || 0), 0);
    const gold = Number(state?.resources?.gold) || 0;
    return stock >= amount && gold >= Math.ceil(price * amount * 1.25);
}

function marketStock(state, resource) {
    return (Array.isArray(state?.market?.partners) ? state.market.partners : [])
        .reduce((total, partner) => total + Math.max(0, Number(partner?.stock?.[resource]) || 0), 0);
}

function count(state, type) {
    return (Array.isArray(state?.entities) ? state.entities : [])
        .filter(entity => !entity?.dead && entity?.type === type).length;
}

function capacity(state) {
    return (Array.isArray(state?.entities) ? state.entities : [])
        .filter(entity => !entity?.dead && isHousingType(entity?.type) && !(entity?.construction?.stage < 3))
        .reduce((total, entity) => total + housingCapacityFor(entity.type), 0);
}

function formatAmount(value) {
    return String(Math.round((Number(value) || 0) * 100) / 100);
}

function costText(cost) {
    const rows = Object.entries(cost || {}).filter(([, amount]) => Number(amount) > 0)
        .map(([resource, amount]) => formatAmount(amount) + " " + resource);
    return rows.length ? rows.join(" · ") : "no materials";
}

function shortfallText(state, cost) {
    const rows = Object.entries(cost || {}).filter(([, amount]) => Number(amount) > 0)
        .map(([resource, amount]) => ({
            resource,
            missing: Math.max(0, Number(amount) - (Number(state?.resources?.[resource]) || 0))
        }))
        .filter(row => row.missing > 0)
        .map(row => formatAmount(row.missing) + " " + row.resource);
    return rows.length ? rows.join(" · ") : "nothing";
}

function openHousingSite(state) {
    return (Array.isArray(state?.entities) ? state.entities : [])
        .find(entity => !entity?.dead && isHousingType(entity?.type) &&
            entity?.construction && typeof entity.construction === "object" &&
            Number(entity.construction.stage || 0) < 3) || null;
}

function siteMaterialText(site) {
    const construction = site?.construction || {};
    const rows = Object.entries(construction.materialNeed || {})
        .filter(([, quantity]) => Number(quantity) > 0)
        .map(([good, quantity]) => {
            const remaining = Math.max(0, Number(quantity) - (Number(construction.delivered?.[good]) || 0));
            return remaining > 0 ? formatAmount(remaining) + " " + good : null;
        })
        .filter(Boolean);
    return rows.length ? rows.join(" · ") : "materials delivered";
}

function farmCost() {
    return costShare(BUILDING_COSTS[TYPE.FARM] || {}, CONSTRUCTION_SHARE);
}

function houseCost() {
    return costShare(BUILDING_COSTS[TYPE.HOUSE] || {}, CONSTRUCTION_SHARE);
}

function roadCost() {
    return ROAD_TYPES.dirt.cost;
}

export function getCoreCounsel(state) {
    const food = Math.max(0, Number(state?.resources?.food) || 0);
    const wood = Math.max(0, Number(state?.resources?.wood) || 0);
    const stone = Math.max(0, Number(state?.resources?.stone) || 0);
    const people = count(state, TYPE.VILLAGER);
    const beds = capacity(state);
    const shortage = Math.max(0, Number(state?.economy?.lastLedger?.foodShortage) || 0);
    const roads = Math.max(0, Number(state?.statistics?.totalRoadTilesBuilt) || 0);
    const hand = Array.isArray(state?.hand) ? state.hand.length : 0;
    const cardsDrawn = Math.max(0, Number(state?.statistics?.totalCardsDrawn) || 0);
    const currentCard = state?.currentCard || null;
    const morale = Number(state?.morale) || 0;
    const farm = farmCost();
    const cottage = houseCost();
    const road = roadCost();
    const foodLine = Math.max(40, people * 3);
    const foodDisplay = Math.round(food);
    const shortageDisplay = Math.round(shortage);
    let ambitionSnapshot = null;
    try {
        if (state?.ambitions && typeof state.ambitions === "object") ambitionSnapshot = getAmbitionSnapshot();
    } catch { /* the counsel must remain available during early loading */ }
    const completedAmbitions = ambitionSnapshot ? Math.max(0, Number(ambitionSnapshot.completedCount) || 0) : 0;

    if (!state?.hasStarted) {
        return {
            id: "found",
            stepId: "founded",
            text: "Choose a world and found your first realm.",
            evidence: "No realm exists yet.",
            actionLabel: "FOUND A REALM",
            panel: null,
            buildCategory: null,
            buildType: null
        };
    }
    if (shortage > 0 || food < foodLine) {
        if (!canAfford(state, farm)) {
            if (marketCanBuy(state, "food")) {
                const price = Number(state.market?.prices?.food) || 2;
                return {
                    id: "food",
                    stepId: null,
                    text: "The granary is empty and the treasury cannot open a farm. Buy food at the regional market before winter.",
                    evidence: "Farm needs " + costText(farm) + " · stores hold " + wood + " wood · " + stone + " stone · market food " + formatAmount(price) + "g × 5 (" + marketStock(state, "food") + " in stock)",
                    actionLabel: "OPEN MARKET",
                    panel: "market",
                    buildCategory: null,
                    buildType: null
                };
            }
            return {
                id: "food",
                stepId: null,
                text: "The granary is empty and the treasury cannot open a farm. Open the cards for food or a new opportunity.",
                evidence: "Farm needs " + costText(farm) + " · short " + shortfallText(state, farm) + " · market cannot cover five food",
                actionLabel: "OPEN CARDS",
                panel: "cards",
                buildCategory: null,
                buildType: null
            };
        }
        return {
            id: "food",
            stepId: null,
            text: "The granary is thin. Secure a farm before the next shortage.",
            evidence: "Granary " + foodDisplay + " food · " + people + " residents · comfort line " + foodLine + (shortageDisplay > 0 ? " · shortage " + shortageDisplay : ""),
            actionLabel: "BUILD FARM",
            panel: "build",
            buildCategory: "production",
            buildType: TYPE.FARM
        };
    }
    if (people >= beds) {
        const site = openHousingSite(state);
        if (site) {
            return {
                id: "housing-site",
                stepId: "house",
                text: "A cottage site is open but not operational. Its beds arrive when construction completes.",
                evidence: "Site opened · stage " + Math.max(0, Math.floor(Number(site.construction?.stage) || 0)) +
                    " · " + String(site.construction?.reason || "SITE PREPARATION") +
                    " · beds " + beds + " · " + people + " residents · needs " + siteMaterialText(site),
                actionLabel: "OPEN BUILDINGS",
                panel: "buildings",
                buildCategory: null,
                buildType: null
            };
        }
        if (!canAfford(state, cottage)) {
            return {
                id: "housing",
                stepId: "house",
                text: "Every hearth is full and the treasury cannot open a cottage. Open the cards for shelter or materials.",
                evidence: "Beds " + beds + " · " + people + " residents · cottage needs " + costText(cottage) + " · short " + shortfallText(state, cottage),
                actionLabel: "OPEN CARDS",
                panel: "cards",
                buildCategory: null,
                buildType: null
            };
        }
        return {
            id: "housing",
            stepId: "house",
            text: "Every hearth is full. Raise a cottage to welcome new residents.",
            evidence: "Beds " + beds + " · " + people + " residents · 0 free",
            actionLabel: "BUILD COTTAGE",
            panel: "build",
            buildCategory: "housing",
            buildType: TYPE.HOUSE
        };
    }
    if (roads === 0) {
        if (!canAfford(state, road)) {
            return {
                id: "roads",
                stepId: "road",
                text: "The stores have no road and the treasury cannot lay one. Open the cards for materials or a new route.",
                evidence: "Road tiles 0 · dirt path needs " + costText(road) + " · short " + shortfallText(state, road),
                actionLabel: "OPEN CARDS",
                panel: "cards",
                buildCategory: null,
                buildType: null
            };
        }
        return {
            id: "roads",
            stepId: "road",
            text: "The stores have no road. Lay one to connect the settlement.",
            evidence: "Road tiles 0 · no route for haulers · dirt path costs " + costText(road),
            actionLabel: "LAY ROAD",
            panel: "build",
            buildCategory: "roads",
            buildType: "dirt"
        };
    }
    if (completedAmbitions === 0 && hand === 0) {
        return {
            id: "cards",
            stepId: cardsDrawn > 0 ? "ambition" : "card",
            text: "Your hand is empty. Draw a card to shape the next chapter.",
            evidence: "Hand 0 cards · " + cardsDrawn + " drawn so far",
            actionLabel: "OPEN CARDS",
            panel: "cards",
            buildCategory: null,
            buildType: null
        };
    }
    // A drawn card is never armed or played by the system. Teach the two
    // explicit player actions before the first card leaves the hand, then let
    // the ordinary ambition path take over.
    if (completedAmbitions === 0 && cardsDrawn === 1) {
        if (currentCard && state?.selectedCardInstanceId) {
            return {
                id: "card-play",
                stepId: "ambition",
                text: "The card is selected. Drag it onto a valid map tile, or tap a tile on touch controls.",
                evidence: "Selected: " + (currentCard.name || "the chosen card") +
                    " · hand " + hand + " card · placement checks terrain, space and cost",
                actionLabel: "REVIEW CARDS",
                panel: "cards",
                buildCategory: null,
                buildType: null
            };
        }
        return {
            id: "card-select",
            stepId: "ambition",
            text: "A card is in hand but not armed. Select it before you place it.",
            evidence: "Hand " + hand + " card · no card selected · drawing never places a card",
            actionLabel: "OPEN CARDS",
            panel: "cards",
            buildCategory: null,
            buildType: null
        };
    }
    if (morale < 55) {
        return {
            id: "morale",
            stepId: null,
            text: "Morale is faltering. Review services and faction support.",
            evidence: "Morale " + Math.round(morale) + " · comfort line 55 · services and factions decide the recovery",
            actionLabel: "REVIEW REALM",
            panel: "kingdom",
            buildCategory: null,
            buildType: null
        };
    }
    // After the first house, road and card, the onboarding path continues with
    // the first royal ambition. "Stores are steady" was a dead end for a new
    // player who had just finished the checklist but did not know where the
    // long-term goal lived. Only the live realm carries the ambition model;
    // synthetic counsel readers stay pure and keep their steady fallback.
    try {
        const ambition = ambitionSnapshot;
        if (ambition && !ambition.allComplete && Number(ambition.completedCount) === 0) {
            return {
                id: "ambition",
                stepId: "ambition",
                text: "The realm is steady. Complete your first royal ambition: " + (ambition.title || "open the royal ledger") + ".",
                evidence: "First ambition · " + (ambition.title || "royal ledger") + " · " + (ambition.progressLabel || "0 progress"),
                actionLabel: "REVIEW REALM",
                panel: "kingdom",
                buildCategory: null,
                buildType: null
            };
        }
        // The first five steps are closed. An authored scenario keeps its own
        // measured objective until its deadline; a free realm continues with
        // the next real ambition. Both are reads of existing models only.
        if (ambition && Number(ambition.completedCount) > 0) {
            const scenario = state?.scenario ? getScenarioSnapshot() : null;
            if (scenario?.visible) {
                return {
                    id: "scenario",
                    stepId: null,
                    text: scenario.name + " · " + scenario.objectiveLabel,
                    evidence: scenario.progressLabel + " · " + scenario.deadlineShort + " · " + scenario.statusLabel,
                    actionLabel: "REVIEW REALM",
                    panel: "kingdom",
                    buildCategory: null,
                    buildType: null
                };
            }
            if (!ambition.allComplete && ambition.title) {
                return {
                    id: "next-ambition",
                    stepId: null,
                    text: "Next royal ambition: " + ambition.title + ".",
                    evidence: ambition.title + " · " + (ambition.progressLabel || "0 progress"),
                    actionLabel: "REVIEW REALM",
                    panel: "kingdom",
                    buildCategory: null,
                    buildType: null
                };
            }
        }
    } catch { /* the counsel must remain available during early loading */ }
    // Once the opening milestones are closed, a live theatre campaign is the
    // clearest strategic step: settle a ready war band before starting another,
    // otherwise commit the open aim. This reads the same bounded military state
    // as the panel instead of adding a second checklist or a new campaign.
    const activeCampaigns = Array.isArray(state?.military?.campaigns?.active)
        ? state.military.campaigns.active.slice(0, 2) : [];
    const readyCampaign = activeCampaigns.find(campaign => campaign?.stage === "committed" &&
        Number(campaign.progress) >= CAMPAIGN_GOAL);
    const openAim = activeCampaigns.find(campaign => campaign?.stage === "aim");
    const campaign = readyCampaign || openAim;
    if (campaign) {
        const aimLabel = WAR_AIMS[campaign.aim]?.label || "WAR AIM";
        const theatre = campaign.theatreName || campaign.theatre || "theatre";
        return {
            id: "campaign",
            stepId: null,
            text: readyCampaign
                ? "Settle the " + theatre + " war band in Military."
                : "Commit the " + aimLabel + " aim in Military.",
            evidence: theatre + " · " + aimLabel + " · " + String(campaign.stage || "aim").toUpperCase() +
                " · " + Math.round(Number(campaign.progress) || 0) + "/" + CAMPAIGN_GOAL + " progress",
            actionLabel: "OPEN MILITARY",
            panel: "military",
            buildCategory: null,
            buildType: null
        };
    }
    const missions = Array.isArray(state?.diplomacy?.missions) ? state.diplomacy.missions.slice(0, 6) : [];
    const year = Number(state?.year) || 1;
    const readyNegotiation = missions.find(mission => mission?.stage === "sent" && year > Number(mission?.sentYear || 0));
    const readyReport = missions.find(mission => mission?.stage === "negotiated" && year > Number(mission?.negotiatedYear || 0));
    const readyRatification = missions.find(mission => mission?.stage === "reported" && year > Number(mission?.reportYear || 0) && mission?.outcome === "accepted");
    const readyMission = readyRatification || readyReport || readyNegotiation;
    if (readyMission) {
        return {
            id: "envoy-mission",
            stepId: null,
            text: readyRatification
                ? "Ratify the negotiated treaty in Diplomacy."
                : readyReport
                    ? "File the envoy report in Diplomacy."
                    : "Negotiate the envoy mission in Diplomacy.",
            evidence: String(readyMission.realmId || "realm").toUpperCase() + " · " +
                String(readyMission.goalTreaty || "trade").toUpperCase() + " · " +
                String(readyMission.stage || "sent").toUpperCase() +
                (readyMission.score !== undefined && readyMission.score !== null ? " · SCORE " + Math.round(Number(readyMission.score)) : ""),
            actionLabel: "OPEN DIPLOMACY",
            panel: "diplomacy",
            buildCategory: null,
            buildType: null
        };
    }
    // A council bill is the same kind of honest continuation: settle a lobbied
    // bill at the next session before paying a new lobby. Read the nested
    // optional DTO directly so counsel never creates state on a loading frame.
    const docket = Array.isArray(state?.government?.council?.docket)
        ? state.government.council.docket.slice(0, 3) : [];
    const readyBill = docket.find(bill => bill?.stage === "lobbied" && Number(state?.year) > Number(bill?.proposedYear));
    const openBill = docket.find(bill => bill?.stage === "proposed");
    const councilBill = readyBill || openBill;
    if (councilBill) {
        const label = COUNCIL_BILLS[councilBill.billId]?.label || "COUNCIL BILL";
        return {
            id: "council",
            stepId: null,
            text: readyBill
                ? "Call the " + label + " council vote in Government."
                : "Pay the " + label + " lobby in Government.",
            evidence: label + " · " + String(councilBill.stage || "proposed").toUpperCase() +
                " · SUPPORT " + Math.round(Number(councilBill.support) || 0) + "/" + Math.round(Number(councilBill.threshold) || 0),
            actionLabel: "OPEN GOVERNMENT",
            panel: "government",
            buildCategory: null,
            buildType: null
        };
    }
    return {
        id: "steady",
        stepId: null,
        text: "Stores are steady. Follow the royal ambition or draw another card.",
        evidence: "Food " + foodDisplay + " · " + people + " residents · " + beds + " beds · roads " + roads,
        actionLabel: "OPEN CARDS",
        panel: "cards",
        buildCategory: null,
        buildType: null
    };
}
