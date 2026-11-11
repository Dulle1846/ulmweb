// Civic life: paid city ordinances, a bounded annual city event and the
// institutions that make a settlement feel governed rather than decorated.
// The module deliberately has no import from economy/settlement/construction,
// so those systems can consume its modifiers without a module cycle.
import { state } from "../core/state.js";
import { TYPE } from "../core/types.js";
import { random } from "../core/random.js";
import { addResource } from "./resources.js";
import { applyPoliticalEffects } from "./politics.js";
import { addLog } from "../core/event-log.js";

export const CIVIC_VERSION = 1;
export const CIVIC_HISTORY_LIMIT = 40;
export const CIVIC_MAX_SLOTS = 10;

const clamp = (value, min, max) => Math.max(min, Math.min(max, Number.isFinite(Number(value)) ? Number(value) : min));
const integer = (value, min = 0, max = 1_000_000_000) => clamp(Math.floor(Number(value) || 0), min, max);
const yearNow = () => Math.max(1, Math.floor(Number(state.year) || 1));

export const CIVIC_CATEGORIES = Object.freeze({
    relief: Object.freeze({ label: "RELIEF & GRANARY", description: "Food security, poor relief and the winter buffer." }),
    health: Object.freeze({ label: "PUBLIC HEALTH", description: "Water, sanitation and the care of crowded wards." }),
    learning: Object.freeze({ label: "LEARNING & CRAFT", description: "Schools, apprentices and the transmission of skill." }),
    trade: Object.freeze({ label: "TRADE & GUILDS", description: "Market rules, tolls and the city's commercial reach." }),
    defence: Object.freeze({ label: "WATCH & DEFENCE", description: "Night watches, militia and the safety of the streets." }),
    labour: Object.freeze({ label: "LABOUR & WORKS", description: "Building standards, common works and the dignity of labour." }),
    charter: Object.freeze({ label: "CHARTER & LAW", description: "Citizenship, property and the legal shape of the town." }),
    culture: Object.freeze({ label: "FESTIVALS & FAITH", description: "Processions, holy days and the shared calendar." })
});

export const CIVIC_EFFECT_LABELS = Object.freeze({
    tax: "TAX YIELD",
    production: "WORK EFFICIENCY",
    foodDemand: "HOUSEHOLD FOOD DEMAND",
    serviceRadius: "SERVICE REACH",
    buildDiscount: "CONSTRUCTION COST",
    morale: "ANNUAL MORALE",
    legitimacy: "ANNUAL LEGITIMACY",
    immigration: "NEWCOMER PULL",
    health: "PUBLIC HEALTH",
    trade: "MARKET TERMS"
});

// A policy is content, but every field is read by a live system. `cost` is a
// one-off charter fee; `upkeep` is charged once per year from the treasury.
export const CIVIC_POLICIES = Object.freeze([
    {
        id: "open_granaries", category: "relief", label: "Open the Granaries",
        description: "Keep a standing civic bread reserve and sell it below the market price in hard weeks.",
        cost: 20, upkeep: 3, effects: { foodDemand: -0.06, morale: 0.3 }
    },
    {
        id: "poor_relief", category: "relief", label: "Ward Poor Relief",
        description: "A small weekly dole for the old, the sick and households without a wage.",
        cost: 28, upkeep: 4, effects: { morale: 0.45, immigration: 0.06, tax: -0.02 }
    },
    {
        id: "harvest_wards", category: "relief", label: "Harvest Wards",
        description: "Deputise trusted reeves to guard stacks, count grain and punish concealed hoards.",
        cost: 34, upkeep: 3, effects: { production: 0.05, foodDemand: -0.03 }
    },
    {
        id: "public_wells", category: "health", label: "Public Wells",
        description: "Repair and maintain the common wells so no ward depends on a single contaminated source.",
        cost: 26, upkeep: 3, effects: { serviceRadius: 0.08, foodDemand: -0.02, health: 0.05 }
    },
    {
        id: "bathhouse_charter", category: "health", label: "Bathhouse Charter",
        description: "License a heated bathhouse, pay its watermen and keep the poor wards clean.",
        cost: 36, upkeep: 5, effects: { serviceRadius: 0.12, morale: 0.3, health: 0.12 }
    },
    {
        id: "quarantine_ledger", category: "health", label: "Quarantine Ledger",
        description: "Record every arrival at the gates and isolate a sick household before fever spreads.",
        cost: 22, upkeep: 2, effects: { foodDemand: -0.02, production: -0.02, morale: -0.1, health: 0.16 }
    },
    {
        id: "parish_schools", category: "learning", label: "Parish Schools",
        description: "A schoolroom in each ward, open to burgher and cottar children alike.",
        cost: 30, upkeep: 4, effects: { production: 0.05, immigration: 0.04, legitimacy: 0.1 }
    },
    {
        id: "guild_apprentices", category: "learning", label: "Guild Apprenticeships",
        description: "Bind masters to train a fixed number of apprentices and keep their tools in good repair.",
        cost: 38, upkeep: 4, effects: { production: 0.08, tax: 0.03 }
    },
    {
        id: "scholars_table", category: "learning", label: "The Scholars' Table",
        description: "A stipend for visiting clerks, surveyors and physicians who advise the council.",
        cost: 42, upkeep: 5, effects: { production: 0.03, tax: 0.02, legitimacy: 0.2 }
    },
    {
        id: "market_charter", category: "trade", label: "Market Charter",
        description: "Fix market days, standardise weights and protect foreign merchants within the walls.",
        cost: 30, upkeep: 4, effects: { tax: 0.05, serviceRadius: 0.05, trade: 0.08 }
    },
    {
        id: "toll_standards", category: "trade", label: "Standard Tolls",
        description: "Publish the toll table at every gate and end the arbitrary fees that strangle carters.",
        cost: 24, upkeep: 2, effects: { tax: 0.06, morale: -0.1, trade: 0.05 }
    },
    {
        id: "fair_week", category: "trade", label: "The Fair Week",
        description: "A protected annual fair with safe conduct, public tables and a market court.",
        cost: 26, upkeep: 3, effects: { morale: 0.4, tax: 0.02, trade: 0.06 }
    },
    {
        id: "night_watch", category: "defence", label: "The Night Watch",
        description: "Lanterns, a watch bell and paid wardens on every street after dusk.",
        cost: 28, upkeep: 4, effects: { serviceRadius: 0.07, morale: 0.2, tax: 0.01 }
    },
    {
        id: "militia_levy", category: "defence", label: "Militia Levy",
        description: "Every household keeps a spear and musters twice a year under the watchhouse.",
        cost: 34, upkeep: 5, effects: { production: -0.03, tax: 0.02, legitimacy: 0.1 }
    },
    {
        id: "border_scouts", category: "defence", label: "Border Scouts",
        description: "Pay riders to watch the roads and warn the town before a raid reaches the fields.",
        cost: 26, upkeep: 3, effects: { tax: 0.02, foodDemand: 0.02, legitimacy: 0.15 }
    },
    {
        id: "craft_halls", category: "labour", label: "Craft Halls",
        description: "Shared roofs, tools and kilns for smiths, weavers and potters who cannot afford their own.",
        cost: 32, upkeep: 4, effects: { production: 0.06, buildDiscount: 0.03, tax: 0.02 }
    },
    {
        id: "timber_standards", category: "labour", label: "Timber Standards",
        description: "Grade every beam and tile before it leaves the yard; fewer collapses, less waste.",
        cost: 24, upkeep: 2, effects: { buildDiscount: 0.06, production: 0.02 }
    },
    {
        id: "common_works", category: "labour", label: "Common Works",
        description: "A standing crew for ditches, lanes and bridges, paid from the civic chest.",
        cost: 28, upkeep: 3, effects: { production: 0.03, morale: 0.15, buildDiscount: 0.02 }
    },
    {
        id: "town_charter", category: "charter", label: "The Town Charter",
        description: "A sealed charter defining the burgesses' rights, the council's powers and the town's courts.",
        cost: 40, upkeep: 5, effects: { tax: 0.04, legitimacy: 0.3, immigration: 0.03 }
    },
    {
        id: "fence_commons", category: "charter", label: "Fence the Commons",
        description: "Enclose the waste for wool and hay. The treasury gains; the poorer households lose.",
        cost: 22, upkeep: 2, effects: { foodDemand: 0.03, production: 0.02, morale: -0.12, tax: 0.05 }
    },
    {
        id: "citizens_roll", category: "charter", label: "The Citizens' Roll",
        description: "Register every household, craft and tenancy so taxes and duties fall on real people.",
        cost: 30, upkeep: 3, effects: { tax: 0.05, immigration: 0.03, legitimacy: 0.08 }
    },
    {
        id: "festival_calendar", category: "culture", label: "A Festival Calendar",
        description: "Six shared feast days a year, with processions, music and a public table.",
        cost: 26, upkeep: 4, effects: { morale: 0.5, legitimacy: 0.15, foodDemand: 0.02 }
    },
    {
        id: "temple_schools", category: "culture", label: "Temple Schools",
        description: "Let the clergy teach letters and hospitality, with the crown paying for candles and ink.",
        cost: 30, upkeep: 4, effects: { foodDemand: -0.02, legitimacy: 0.2, production: 0.02 }
    },
    {
        id: "civic_processions", category: "culture", label: "Civic Processions",
        description: "The council walks the walls each season, hears petitions and is seen to govern.",
        cost: 20, upkeep: 2, effects: { morale: 0.25, legitimacy: 0.2, tax: 0.01 }
    }
]);

const POLICY_BY_ID = new Map(CIVIC_POLICIES.map(policy => [policy.id, policy]));

// Events are selected from the same saved city state. A choice is only legal
// when the treasury or store can pay its negative resources; the UI repeats
// that check so a disabled button is not a lie.
export const CIVIC_EVENTS = Object.freeze([
    {
        id: "blighted_rye", title: "Blight in the Rye", tags: ["food", "unrest"], weight: 1.3,
        description: "A grey mould has taken the winter rye. The granary reeve asks whether to open the reserve now or wait for the next harvest.",
        choices: [
            { label: "Open the reserve", description: "Spend 12 food to keep bread on the tables.", effects: { resources: { food: -12 }, morale: 1.2, legitimacy: 0.1 } },
            { label: "Wait for the harvest", description: "Preserve the reserve and accept hungry weeks.", effects: { morale: -1.5, legitimacy: -0.2, resources: { gold: 3 } } }
        ]
    },
    {
        id: "fouled_well", title: "The Fouled Well", tags: ["health"], weight: 1.2,
        description: "The oldest well smells of iron and rot. Two households already have fever.",
        choices: [
            { label: "Seal it and dig anew", description: "Spend 8 gold and 6 wood on a clean well.", effects: { resources: { gold: -8, wood: -6 }, morale: 0.8 } },
            { label: "Boil the water and pray", description: "Save the materials; fever may spread.", effects: { morale: -1.1, legitimacy: -0.2 } }
        ]
    },
    {
        id: "guild_petition", title: "The Guilds Petition", tags: ["trade", "growth"], weight: 1.1,
        description: "The weavers and smiths ask for a common hall and a charter of their own.",
        choices: [
            { label: "Grant a charter", description: "Spend 14 gold; the guilds will remember.", effects: { resources: { gold: -14 }, morale: 0.4, legitimacy: 0.3 } },
            { label: "Keep the old custom", description: "No new privilege, no new cost.", effects: { morale: -0.4 } }
        ]
    },
    {
        id: "school_roof", title: "Rain Through the School Roof", tags: ["learning"], weight: 1.0,
        description: "The schoolmaster has moved the children into the chapel because the roof leaks.",
        choices: [
            { label: "Repair the roof", description: "Spend 6 wood and 4 stone.", effects: { resources: { wood: -6, stone: -4 }, morale: 0.5 } },
            { label: "Close the school for winter", description: "Preserve materials; lessons wait.", effects: { morale: -0.6, production: -0.02 } }
        ]
    },
    {
        id: "winter_fuel", title: "The Last Cart of Firewood", tags: ["winter"], weight: 1.5,
        description: "A hard frost has emptied the wood stacks. The woodwards can ration the last loads or let the market set the price.",
        choices: [
            { label: "Ration the wood", description: "Spend 8 food to keep the poorest hearths burning.", effects: { resources: { food: -8 }, morale: 1.0 } },
            { label: "Let the market decide", description: "Gain 6 gold, but the poor go cold.", effects: { resources: { gold: 6 }, morale: -1.2 } }
        ]
    },
    {
        id: "ale_shortage", title: "The Empty Casks", tags: ["trade", "growth"], weight: 1.0,
        description: "The tavernkeeper has no ale for the fair and threatens to close the common room.",
        choices: [
            { label: "Buy grain for the brew", description: "Spend 7 food and 4 gold to keep the casks full.", effects: { resources: { food: -7, gold: -4 }, morale: 0.9 } },
            { label: "Close the common room", description: "Save the stores; the town grows quiet.", effects: { morale: -0.8 } }
        ]
    },
    {
        id: "tax_riot", title: "A Crowd at the Toll House", tags: ["unrest"], weight: 1.3,
        description: "Carters have thrown the toll table into the river. A guard has been struck.",
        choices: [
            { label: "Hear the carters", description: "Spend 10 gold on compensation and lower the toll.", effects: { resources: { gold: -10 }, morale: 1.1, legitimacy: 0.2 } },
            { label: "Enforce the toll", description: "Gain 8 gold; the crowd disperses in anger.", effects: { resources: { gold: 8 }, morale: -1.4, legitimacy: -0.3 } }
        ]
    },
    {
        id: "refugee_caravan", title: "Families on the North Road", tags: ["growth", "food"], weight: 1.2,
        description: "Three families have arrived with a cart, a goat and no roof. The gate captain wants an answer.",
        choices: [
            { label: "Open the gates", description: "Spend 9 food; new hands may strengthen the town.", effects: { resources: { food: -9 }, morale: 0.6, immigration: 0.05 } },
            { label: "Send them onward", description: "Preserve the stores; the road is cruel.", effects: { morale: -0.7, legitimacy: -0.15 } }
        ]
    },
    {
        id: "fire_watch", title: "Smoke Above the Tanners' Lane", tags: ["fire"], weight: 1.1,
        description: "A chimney fire has spread to two roofs. The bucket line is holding, but only just.",
        choices: [
            { label: "Pay the bucket crews", description: "Spend 6 gold and 4 water on the watch.", effects: { resources: { gold: -6, water: -4 }, morale: 0.8 } },
            { label: "Let the ward fend for itself", description: "Save the stores; the scars will remain.", effects: { resources: { wood: -5 }, morale: -0.9 } }
        ]
    },
    {
        id: "market_dispute", title: "Two Merchants, One Stall", tags: ["trade"], weight: 0.9,
        description: "A foreign wool merchant and a local draper both claim the same market pitch.",
        choices: [
            { label: "Hold a market court", description: "Spend 4 gold on the clerks; both sides accept the ruling.", effects: { resources: { gold: -4 }, morale: 0.5, legitimacy: 0.2 } },
            { label: "Favour the local draper", description: "Gain 5 gold; the foreign merchant leaves.", effects: { resources: { gold: 5 }, morale: -0.3 } }
        ]
    },
    {
        id: "bathhouse_fever", title: "Steam and Fever", tags: ["health"], weight: 1.0,
        description: "The bathhouse keeper reports a fever among the bathers. The physicians disagree on the cause.",
        choices: [
            { label: "Close and cleanse it", description: "Spend 5 gold and 5 water; the baths reopen clean.", effects: { resources: { gold: -5, water: -5 }, morale: 0.4 } },
            { label: "Keep the baths open", description: "Gain 3 gold; fear spreads with the steam.", effects: { resources: { gold: 3 }, morale: -0.6 } }
        ]
    },
    {
        id: "apprentice_strike", title: "The Apprentices Put Down Their Tools", tags: ["craft", "unrest"], weight: 1.0,
        description: "The apprentices demand a shorter indenture and a seat at the guild table.",
        choices: [
            { label: "Shorten the indenture", description: "Spend 8 gold; the workshops fill again.", effects: { resources: { gold: -8 }, morale: 0.9, production: 0.03 } },
            { label: "Enforce the old terms", description: "Save the gold; work slows in protest.", effects: { morale: -0.8, production: -0.04 } }
        ]
    },
    {
        id: "bridge_toll", title: "The Broken Bridge", tags: ["trade", "winter"], weight: 1.0,
        description: "Floodwater has taken the east bridge. Carts must ford the river or turn back.",
        choices: [
            { label: "Repair it before the fair", description: "Spend 9 wood and 5 stone.", effects: { resources: { wood: -9, stone: -5 }, morale: 0.5 } },
            { label: "Wait for summer", description: "Save materials; trade takes the long road.", effects: { resources: { gold: -4 }, production: -0.02 } }
        ]
    },
    {
        id: "harvest_festival", title: "A Good Harvest", tags: ["food", "culture"], weight: 1.3,
        description: "The fields have done well. The council may spend the surplus on a feast or carry it into winter.",
        choices: [
            { label: "Hold the harvest feast", description: "Spend 10 food; the whole town remembers.", effects: { resources: { food: -10 }, morale: 1.4, legitimacy: 0.2 } },
            { label: "Store every sheaf", description: "No feast; a deeper winter reserve.", effects: { resources: { food: 6 }, morale: -0.2 } }
        ]
    },
    {
        id: "rats_granary", title: "Rats in the Granary", tags: ["food"], weight: 1.0,
        description: "The granary reeve has found gnawed sacks behind the winter store.",
        choices: [
            { label: "Pay the ratcatchers", description: "Spend 5 gold and 3 food; the store is saved.", effects: { resources: { gold: -5, food: -3 }, morale: 0.3 } },
            { label: "Seal the damaged sacks", description: "Lose 8 food; keep the coin.", effects: { resources: { food: -8 }, morale: -0.3 } }
        ]
    },
    {
        id: "wandering_scholars", title: "Three Scholars at the Gate", tags: ["learning"], weight: 0.9,
        description: "A physician, a surveyor and a copyist offer their services to the town.",
        choices: [
            { label: "Keep them for a year", description: "Spend 12 gold; their skills reach every ward.", effects: { resources: { gold: -12 }, morale: 0.5, production: 0.03 } },
            { label: "Send them to the abbey", description: "Save the stipend; the abbey gains the honour.", effects: { legitimacy: 0.1 } }
        ]
    },
    {
        id: "mercenary_offer", title: "Riders for Hire", tags: ["war", "defence"], weight: 1.1,
        description: "A company of horse offers to guard the roads for a season. Their captain has a reputation.",
        choices: [
            { label: "Hire the company", description: "Spend 16 gold; the roads are safe.", effects: { resources: { gold: -16 }, morale: 0.7, legitimacy: 0.2 } },
            { label: "Trust the watch", description: "Save the gold; the roads remain uncertain.", effects: { morale: -0.3 } }
        ]
    },
    {
        id: "church_procession", title: "The Relic Procession", tags: ["culture", "faith"], weight: 0.9,
        description: "The clergy ask leave to carry a relic through the market on the feast day.",
        choices: [
            { label: "Welcome the procession", description: "Spend 4 food and 3 gold on candles and alms.", effects: { resources: { food: -4, gold: -3 }, morale: 0.8, legitimacy: 0.2 } },
            { label: "Keep the market open", description: "Gain 4 gold; the clergy are offended.", effects: { resources: { gold: 4 }, morale: -0.3, legitimacy: -0.1 } }
        ]
    },
    {
        id: "flood_lower_ward", title: "Water in the Lower Ward", tags: ["winter"], weight: 1.2,
        description: "The river has risen over the causeway. Six households are trapped.",
        choices: [
            { label: "Send boats and stores", description: "Spend 7 gold and 6 food.", effects: { resources: { gold: -7, food: -6 }, morale: 1.0 } },
            { label: "Wait for the water to fall", description: "Save the stores; the ward remembers.", effects: { morale: -1.0, legitimacy: -0.2 } }
        ]
    },
    {
        id: "lead_roof", title: "The Lead Roof", tags: ["craft"], weight: 0.8,
        description: "The guildhall roof leaks over the charter chest. A smith offers a lead repair.",
        choices: [
            { label: "Repair it properly", description: "Spend 7 stone and 8 gold.", effects: { resources: { stone: -7, gold: -8 }, morale: 0.4, legitimacy: 0.1 } },
            { label: "Patch it with timber", description: "Spend 4 wood; the leak will return.", effects: { resources: { wood: -4 }, morale: -0.2 } }
        ]
    },
    {
        id: "new_charter", title: "A Charter for the Outer Ward", tags: ["growth", "charter"], weight: 1.0,
        description: "The outer ward has grown beyond the old boundary. Its residents want representation.",
        choices: [
            { label: "Extend the charter", description: "Spend 10 gold on clerks and a new seal.", effects: { resources: { gold: -10 }, morale: 0.6, legitimacy: 0.3 } },
            { label: "Keep the old boundary", description: "No cost now; the ward feels unheard.", effects: { morale: -0.6, legitimacy: -0.1 } }
        ]
    },
    {
        id: "baker_price", title: "The Baker Raises the Loaf", tags: ["food", "unrest"], weight: 1.1,
        description: "Flour is short and the bakers have doubled the price of bread.",
        choices: [
            { label: "Set a fair loaf price", description: "Spend 5 gold on enforcement; bread stays affordable.", effects: { resources: { gold: -5 }, morale: 0.8, tax: 0.01 } },
            { label: "Let the bakers decide", description: "Gain 6 gold; the poor go hungry.", effects: { resources: { gold: 6 }, morale: -1.1 } }
        ]
    },
    {
        id: "timber_shortage", title: "The Timber Shortage", tags: ["craft", "growth"], weight: 1.0,
        description: "Builders are competing for the last seasoned beams. A merchant offers imported timber at a premium.",
        choices: [
            { label: "Buy the imported beams", description: "Spend 12 gold; building can continue.", effects: { resources: { gold: -12 }, morale: 0.2, buildDiscount: 0.01 } },
            { label: "Ration the local timber", description: "Spend 3 food on the woodwards; work slows.", effects: { resources: { food: -3 }, production: -0.03 } }
        ]
    },
    {
        id: "night_theft", title: "The Missing Silver", tags: ["unrest", "trade"], weight: 0.9,
        description: "A merchant's strongbox has vanished from the inn. The watch has a suspect but no proof.",
        choices: [
            { label: "Hold a public inquiry", description: "Spend 4 gold; the truth is uncertain but seen to be sought.", effects: { resources: { gold: -4 }, legitimacy: 0.2, morale: 0.3 } },
            { label: "Compensate the merchant", description: "Spend 9 gold and close the matter.", effects: { resources: { gold: -9 }, morale: 0.2 } }
        ]
    },
    {
        id: "public_execution", title: "The Gallows Question", tags: ["unrest", "charter"], weight: 0.8,
        description: "A convicted bandit waits in the prison. The crowd expects a hanging; the clergy urge mercy.",
        choices: [
            { label: "Commute the sentence", description: "Spend 3 food on prison rations; mercy is preached.", effects: { resources: { food: -3 }, morale: 0.4, legitimacy: 0.2 } },
            { label: "Carry out the sentence", description: "Gain 3 gold from the crowd; fear settles over the ward.", effects: { resources: { gold: 3 }, morale: -0.5, legitimacy: -0.1 } }
        ]
    },
    {
        id: "orphan_guild", title: "The Orphan Guild", tags: ["learning", "unrest"], weight: 0.8,
        description: "Street children have formed a scavenging crew and offer to clean the market for bread.",
        choices: [
            { label: "Hire them for the market", description: "Spend 6 food; the square is clean and the children are fed.", effects: { resources: { food: -6 }, morale: 0.6 } },
            { label: "Drive them out", description: "No cost; the ward grows harder.", effects: { morale: -0.5, legitimacy: -0.1 } }
        ]
    },
    {
        id: "charcoal_smoke", title: "Charcoal in the Air", tags: ["health", "craft"], weight: 0.9,
        description: "The charcoal burners have set upwind of the new houses. The smoke hangs over the ward.",
        choices: [
            { label: "Move the burners downwind", description: "Spend 5 gold and 3 wood on new pits.", effects: { resources: { gold: -5, wood: -3 }, morale: 0.8 } },
            { label: "Leave the trade alone", description: "Gain 4 gold; the ward coughs.", effects: { resources: { gold: 4 }, morale: -0.7 } }
        ]
    },
    {
        id: "horse_fair", title: "The Horse Fair", tags: ["trade", "growth"], weight: 0.8,
        description: "Horse traders from three valleys ask to hold their spring fair inside the walls.",
        choices: [
            { label: "Grant the fair", description: "Spend 4 food on the public table; trade booms.", effects: { resources: { food: -4 }, morale: 0.5, tax: 0.02 } },
            { label: "Charge a gate toll", description: "Gain 7 gold, but fewer traders come.", effects: { resources: { gold: 7 }, morale: -0.2 } }
        ]
    },
    {
        id: "moneylender", title: "The Moneylender's Offer", tags: ["trade"], weight: 0.7,
        description: "A goldsmith offers a loan for the new common works, at a rate the council calls usury.",
        choices: [
            { label: "Take the loan", description: "Gain 14 gold now; repay later through taxes.", effects: { resources: { gold: 14 }, morale: -0.3, legitimacy: -0.1 } },
            { label: "Refuse and build slowly", description: "No loan; the works wait.", effects: { production: -0.01 } }
        ]
    },
    {
        id: "well_dedication", title: "The New Well", tags: ["health", "culture"], weight: 0.7,
        description: "The masons have finished a new well. The clergy ask to bless it before the town drinks.",
        choices: [
            { label: "Hold a public dedication", description: "Spend 3 food and 2 gold; the water is trusted.", effects: { resources: { food: -3, gold: -2 }, morale: 0.6 } },
            { label: "Open it at once", description: "No cost; the ceremony is small.", effects: { morale: 0.1 } }
        ]
    },
    {
        id: "plague_rumor", title: "A Rumour of Plague", tags: ["health", "unrest"], weight: 0.9,
        description: "Travellers say the next valley is dying of fever. The gate captain awaits orders.",
        choices: [
            { label: "Close the gates", description: "Spend 4 food on the displaced; trade suffers.", effects: { resources: { food: -4 }, morale: 0.2, tax: -0.01 } },
            { label: "Keep the gates open", description: "Gain 4 gold; the risk enters with the carts.", effects: { resources: { gold: 4 }, morale: -0.4 } }
        ]
    },
    {
        id: "abandoned_mill", title: "The Abandoned Mill", tags: ["craft", "food"], weight: 0.8,
        description: "The old mill upstream is for sale. Its wheel needs repair, but it could grind for the whole town.",
        choices: [
            { label: "Buy and repair the mill", description: "Spend 10 gold and 8 wood.", effects: { resources: { gold: -10, wood: -8 }, production: 0.04 } },
            { label: "Let it rot", description: "No cost; the town keeps its old pace.", effects: { morale: -0.1 } }
        ]
    },
    {
        id: "stone_collapse", title: "The Falling Scaffold", tags: ["labour", "craft"], weight: 0.8,
        description: "A scaffold has collapsed at the new hall. Two builders are hurt and the guild demands safer works.",
        choices: [
            { label: "Pay the injured and inspect every site", description: "Spend 9 gold and 4 wood.", effects: { resources: { gold: -9, wood: -4 }, morale: 0.7, buildDiscount: -0.01 } },
            { label: "Blame the builders", description: "Save the cost; the guild seethes.", effects: { morale: -0.8, production: -0.02 } }
        ]
    },
    {
        id: "tax_exemption", title: "The Abbey Asks for Exemption", tags: ["faith", "charter"], weight: 0.7,
        description: "The abbey wants its new mill exempt from the town toll, as its old charter claims.",
        choices: [
            { label: "Honour the charter", description: "Lose 4 gold in tolls; the clergy bless the council.", effects: { resources: { gold: -4 }, legitimacy: 0.3, morale: 0.3 } },
            { label: "Enforce the toll", description: "Gain 5 gold; the abbey protests.", effects: { resources: { gold: 5 }, legitimacy: -0.1, morale: -0.2 } }
        ]
    },
    {
        id: "future_levy", title: "A Levy for the Walls", tags: ["defence", "charter"], weight: 0.8,
        description: "The old walls need repair. The council can raise a levy now or borrow against next year's taxes.",
        choices: [
            { label: "Raise the levy", description: "Gain 8 gold; households tighten their belts.", effects: { resources: { gold: 8 }, morale: -0.8, legitimacy: 0.1 } },
            { label: "Repair only the gate", description: "Spend 5 stone; the rest waits.", effects: { resources: { stone: -5 }, morale: 0.3 } }
        ]
    },
    {
        id: "winter_market", title: "The Winter Market", tags: ["winter", "trade"], weight: 0.8,
        description: "Merchants ask to keep the market open through the frost, with braziers and a night watch.",
        choices: [
            { label: "Keep the market open", description: "Spend 5 wood and 3 gold on braziers.", effects: { resources: { wood: -5, gold: -3 }, morale: 0.6, tax: 0.02 } },
            { label: "Close it until spring", description: "Save the fuel; the square is empty.", effects: { morale: -0.4 } }
        ]
    },
    {
        id: "school_examination", title: "The First Examination", tags: ["learning"], weight: 0.7,
        description: "The schoolmaster proposes a public examination, with a prize for the best scholar.",
        choices: [
            { label: "Fund the prize", description: "Spend 4 gold and 2 food on the ceremony.", effects: { resources: { gold: -4, food: -2 }, morale: 0.5, legitimacy: 0.1 } },
            { label: "Let the school decide", description: "No public cost; the honour stays inside.", effects: { morale: 0.1 } }
        ]
    },
    {
        id: "old_well", title: "The Old Well Speaks", tags: ["health", "faith"], weight: 0.6,
        description: "Diggers deepening the old well have struck a carved stone. The priests call it a sign.",
        choices: [
            { label: "Preserve the stone", description: "Spend 3 gold on masons and a shrine.", effects: { resources: { gold: -3 }, morale: 0.5, legitimacy: 0.2 } },
            { label: "Sell the stone", description: "Gain 6 gold; the ward mutters.", effects: { resources: { gold: 6 }, morale: -0.3 } }
        ]
    },
    {
        id: "bell_tower", title: "A Bell for the Watch", tags: ["defence", "culture"], weight: 0.7,
        description: "The watch wants a bronze bell to summon the wards. The founder can cast it before winter.",
        choices: [
            { label: "Cast the bell", description: "Spend 8 gold and 5 stone.", effects: { resources: { gold: -8, stone: -5 }, morale: 0.7, legitimacy: 0.1 } },
            { label: "Use the old horn", description: "No cost; the watch makes do.", effects: { morale: -0.1 } }
        ]
    },
    {
        id: "city_gates", title: "The Gate at Dusk", tags: ["trade", "defence"], weight: 0.7,
        description: "A rich caravan arrives after the gates have closed. The captain can open the postern or keep the curfew.",
        choices: [
            { label: "Open the postern", description: "Gain 7 gold; the merchants remember the welcome.", effects: { resources: { gold: 7 }, morale: 0.2, legitimacy: -0.1 } },
            { label: "Keep the curfew", description: "The caravan camps outside; order holds.", effects: { legitimacy: 0.2, morale: -0.2 } }
        ]
    }
]);

export function createCivicState() {
    return {
        version: CIVIC_VERSION,
        lastUpdateYear: 0,
        active: [],
        history: [],
        pendingEvent: null,
        lastEventYear: 0,
        lastAudit: null
    };
}

export function ensureCivic() {
    if (!state.city || typeof state.city !== "object") state.city = {};
    const city = state.city;
    if (!city.civic || typeof city.civic !== "object") city.civic = createCivicState();
    const civic = city.civic;
    civic.version = CIVIC_VERSION;
    civic.active = Array.isArray(civic.active) ? [...new Set(civic.active.filter(id => POLICY_BY_ID.has(id)))] : [];
    civic.history = Array.isArray(civic.history) ? civic.history.filter(Boolean).slice(0, CIVIC_HISTORY_LIMIT) : [];
    civic.pendingEvent = civic.pendingEvent && CIVIC_EVENTS.some(event => event.id === civic.pendingEvent.id) && !civic.pendingEvent.resolved
        ? civic.pendingEvent
        : null;
    civic.lastUpdateYear = integer(civic.lastUpdateYear, 0);
    civic.lastEventYear = integer(civic.lastEventYear, 0);
    return civic;
}

function record(civic, kind, summary) {
    civic.history.unshift({
        year: yearNow(),
        kind: String(kind || "civic").slice(0, 24),
        summary: String(summary || "").slice(0, 180)
    });
    if (civic.history.length > CIVIC_HISTORY_LIMIT) civic.history.length = CIVIC_HISTORY_LIMIT;
}

function operatingTownHalls() {
    return state.entities.filter(entity => !entity.dead && entity.type === TYPE.TOWN_HALL &&
        (!entity.construction || Number(entity.construction.stage) >= 3));
}

export function getCivicSlots() {
    return Math.min(CIVIC_MAX_SLOTS, 2 + operatingTownHalls().length * 2);
}

export function getCivicModifiers() {
    const civic = ensureCivic();
    const totals = {
        tax: 0, production: 0, foodDemand: 0, serviceRadius: 0, buildDiscount: 0,
        morale: 0, legitimacy: 0, immigration: 0, health: 0, trade: 0
    };
    let upkeep = 0;
    for (const id of civic.active) {
        const policy = POLICY_BY_ID.get(id);
        if (!policy) continue;
        upkeep += policy.upkeep;
        for (const [key, value] of Object.entries(policy.effects || {})) {
            if (key in totals) totals[key] += Number(value) || 0;
        }
    }
    return {
        tax: clamp(totals.tax, -0.20, 0.30),
        production: clamp(totals.production, -0.25, 0.25),
        foodDemand: clamp(totals.foodDemand, -0.20, 0.20),
        serviceRadius: clamp(totals.serviceRadius, -0.15, 0.35),
        buildDiscount: clamp(totals.buildDiscount, 0, 0.20),
        morale: clamp(totals.morale, -1.5, 2),
        legitimacy: clamp(totals.legitimacy, -1, 2),
        immigration: clamp(totals.immigration, -0.10, 0.20),
        health: clamp(totals.health, 0, 0.25),
        trade: clamp(totals.trade, -0.10, 0.20),
        upkeep
    };
}

function policyRows(civic) {
    return CIVIC_POLICIES.map(policy => ({
        ...policy,
        categoryLabel: CIVIC_CATEGORIES[policy.category]?.label || policy.category,
        active: civic.active.includes(policy.id)
    }));
}

function expandEvent(event) {
    if (!event) return null;
    return {
        ...event,
        choices: event.choices.map((choice, index) => ({
            ...choice,
            index,
            affordable: Object.entries(choice.effects?.resources || {})
                .filter(([, amount]) => Number(amount) < 0)
                .every(([resource, amount]) => (Number(state.resources?.[resource]) || 0) >= -Number(amount))
        }))
    };
}

export function getCivicSnapshot() {
    const civic = ensureCivic();
    const slots = getCivicSlots();
    const modifiers = getCivicModifiers();
    const activePolicies = policyRows(civic).filter(policy => policy.active);
    return {
        version: CIVIC_VERSION,
        active: [...civic.active],
        activePolicies,
        availablePolicies: policyRows(civic).filter(policy => !policy.active),
        policies: policyRows(civic),
        slots,
        freeSlots: Math.max(0, slots - civic.active.length),
        townHalls: operatingTownHalls().length,
        modifiers,
        upkeep: modifiers.upkeep,
        pendingEvent: expandEvent(CIVIC_EVENTS.find(event => event.id === civic.pendingEvent?.id) || null),
        history: civic.history.slice(0, 16),
        lastUpdateYear: civic.lastUpdateYear,
        lastAudit: civic.lastAudit ? { ...civic.lastAudit } : null,
        categories: CIVIC_CATEGORIES,
        effects: CIVIC_EFFECT_LABELS
    };
}

export function enactCivicPolicy(id) {
    const civic = ensureCivic();
    const policy = POLICY_BY_ID.get(String(id || ""));
    if (!policy) return { ok: false, reason: "unknown-ordinance" };
    if (civic.active.includes(policy.id)) return { ok: false, reason: "ordinance-already-active" };
    if (civic.active.length >= getCivicSlots()) return { ok: false, reason: "no-free-ordinance-slot" };
    if ((Number(state.resources.gold) || 0) < policy.cost) return { ok: false, reason: "not-enough-gold" };
    addResource("gold", -policy.cost);
    civic.active.push(policy.id);
    record(civic, "enact", policy.label + " enacted for " + policy.cost + " gold");
    addLog("CITY ORDINANCE: " + policy.label.toUpperCase(), "#d8c18a", "civic");
    return { ok: true, policy, snapshot: getCivicSnapshot() };
}

export function repealCivicPolicy(id) {
    const civic = ensureCivic();
    const policy = POLICY_BY_ID.get(String(id || ""));
    if (!policy || !civic.active.includes(policy.id)) return { ok: false, reason: "ordinance-not-active" };
    civic.active = civic.active.filter(active => active !== policy.id);
    record(civic, "repeal", policy.label + " repealed");
    addLog("CITY ORDINANCE REPEALED: " + policy.label.toUpperCase(), "#b99a9a", "civic");
    return { ok: true, policy, snapshot: getCivicSnapshot() };
}

function eventMatches(event) {
    const tags = event.tags || [];
    const food = Number(state.resources?.food) || 0;
    const morale = Number(state.morale) || 0;
    const population = state.entities.filter(entity => !entity.dead && entity.type === TYPE.VILLAGER).length;
    const war = Array.isArray(state.diplomacy?.realms) && state.diplomacy.realms.some(realm => realm?.treaty === "war");
    if (tags.includes("winter") && Number(state.seasonIndex) !== 3) return false;
    if (tags.includes("food") && food > 70 && !tags.includes("culture")) return false;
    if (tags.includes("unrest") && morale > 58) return false;
    if (tags.includes("growth") && population < 12) return false;
    if (tags.includes("war") && !war) return false;
    if (tags.includes("trade") && (Number(state.resources?.gold) || 0) < 15) return false;
    return true;
}

function chooseEvent(civic) {
    const recent = new Set(civic.history.slice(0, 6).map(entry => entry.eventId).filter(Boolean));
    const candidates = CIVIC_EVENTS.filter(event => !recent.has(event.id) && eventMatches(event));
    const pool = candidates.length ? candidates : CIVIC_EVENTS.filter(event => !recent.has(event.id));
    if (!pool.length) return null;
    const total = pool.reduce((sum, event) => sum + Math.max(0.1, Number(event.weight) || 1), 0);
    let roll = random("civic") * total;
    for (const event of pool) {
        roll -= Math.max(0.1, Number(event.weight) || 1);
        if (roll <= 0) return event;
    }
    return pool[pool.length - 1];
}

export function resolveCivicChoice(index) {
    const civic = ensureCivic();
    if (!civic.pendingEvent) return { ok: false, reason: "no-city-event" };
    const event = CIVIC_EVENTS.find(candidate => candidate.id === civic.pendingEvent.id);
    const choice = event?.choices?.[Number(index)];
    if (!event || !choice) return { ok: false, reason: "unknown-city-choice" };
    const resources = choice.effects?.resources || {};
    for (const [resource, amount] of Object.entries(resources)) {
        if (Number(amount) < 0 && (Number(state.resources?.[resource]) || 0) < -Number(amount)) {
            return { ok: false, reason: "not-enough-" + resource };
        }
    }
    for (const [resource, amount] of Object.entries(resources)) addResource(resource, Number(amount) || 0);
    if (Number.isFinite(Number(choice.effects?.morale))) {
        state.morale = clamp((Number(state.morale) || 0) + Number(choice.effects.morale), 0, 100);
    }
    if (Number.isFinite(Number(choice.effects?.legitimacy))) {
        applyPoliticalEffects({ legitimacy: Number(choice.effects.legitimacy) });
    }
    civic.lastEventYear = yearNow();
    record(civic, "event", event.title + ": " + choice.label);
    civic.history[0].eventId = event.id;
    civic.pendingEvent = null;
    addLog("CITY DECISION: " + event.title.toUpperCase() + " — " + choice.label.toUpperCase(), "#a5d6a7", "civic");
    return { ok: true, event, choice, snapshot: getCivicSnapshot() };
}

export function updateCivic() {
    const civic = ensureCivic();
    const year = yearNow();
    if (civic.lastUpdateYear >= year) return getCivicSnapshot();
    const modifiers = getCivicModifiers();
    const gold = Math.max(0, Number(state.resources?.gold) || 0);
    const paid = Math.min(gold, modifiers.upkeep);
    if (paid > 0) addResource("gold", -paid);
    const unpaid = Math.max(0, modifiers.upkeep - paid);
    if (unpaid > 0) state.morale = clamp((Number(state.morale) || 0) - Math.min(2, 0.4 + unpaid * 0.1), 0, 100);
    if (modifiers.morale) state.morale = clamp((Number(state.morale) || 0) + modifiers.morale, 0, 100);
    if (modifiers.legitimacy) applyPoliticalEffects({ legitimacy: modifiers.legitimacy });
    let opened = null;
    if (!civic.pendingEvent && year >= 2 && random("civic") < 0.72) {
        opened = chooseEvent(civic);
        if (opened) {
            civic.pendingEvent = { id: opened.id, year, resolved: false };
            addLog("CITY EVENT: " + opened.title.toUpperCase(), "#e4bd72", "civic");
        }
    }
    civic.lastUpdateYear = year;
    civic.lastAudit = {
        year,
        active: civic.active.length,
        upkeep: modifiers.upkeep,
        paid,
        unpaid,
        morale: modifiers.morale,
        legitimacy: modifiers.legitimacy,
        event: opened?.id || civic.pendingEvent?.id || null
    };
    record(civic, "audit", "Civic audit year " + year + ": " + paid + "/" + modifiers.upkeep + " gold upkeep" +
        (unpaid ? ", " + unpaid + " unpaid" : "") + (opened ? ", event: " + opened.title : ""));
    return getCivicSnapshot();
}
