// Feudal war-bands and theatre campaigns.
//
// The crown names an aim, a noble house signs a bounded feudal contract, and
// the garrison advances one scalar per tick. Settlement is deterministic and
// uses its own random stream, so combat and every older simulation stream keep
// their exact draw order. The layer is optional inside military/nobility and
// rebuilds quietly for older saves.
import { state } from "../core/state.js";
import { rand } from "../core/random.js";
import { addLog } from "../core/event-log.js";
import { addResource } from "./resources.js";
import { recordResourceMovement } from "./goods-book.js";

export const CAMPAIGN_GOAL = 100;
export const CAMPAIGN_PROGRESS_PER_TICK = 1;
export const MAX_ACTIVE_CAMPAIGNS = 2;
export const MAX_ACTIVE_CONTRACTS = 6;
export const CAMPAIGN_HISTORY_LIMIT = 12;
export const CONTRACT_HISTORY_LIMIT = 12;

export const WAR_AIMS = Object.freeze({
    watch: Object.freeze({
        id: "watch",
        label: "BORDER WATCH",
        contract: "watch",
        description: "Hold a frontier province through the coming year. Cheap, steady and defensive."
    }),
    relief: Object.freeze({
        id: "relief",
        label: "RELIEF MARCH",
        contract: "relief",
        description: "Carry food to a contested march and bring home tribute and loyal retainers."
    }),
    tribute: Object.freeze({
        id: "tribute",
        label: "TRIBUTE RAID",
        contract: "tribute",
        description: "Strike a hostile theatre for gold. Needs a stronger muster and carries the highest risk."
    })
});

export const FEUDAL_CONTRACTS = Object.freeze({
    watch: Object.freeze({
        id: "watch",
        aim: "watch",
        label: "WATCH COVENANT",
        description: "Garrison the border roads. Progress is slow but the risk is small.",
        cost: Object.freeze({ gold: 8, food: 0 }),
        supply: 7,
        minimumPower: 0,
        risk: 12,
        reward: Object.freeze({ gold: 12, food: 6 }),
        loyalty: 2,
        power: 0
    }),
    relief: Object.freeze({
        id: "relief",
        aim: "relief",
        label: "RELIEF CHARTER",
        description: "March with supplies, protect the province and return with food and gold.",
        cost: Object.freeze({ gold: 12, food: 16 }),
        supply: 10,
        minimumPower: 6,
        risk: 20,
        reward: Object.freeze({ gold: 10, food: 20 }),
        loyalty: 4,
        power: 1
    }),
    tribute: Object.freeze({
        id: "tribute",
        aim: "tribute",
        label: "TRIBUTE BOND",
        description: "A short, hard campaign fought for gold and the house's martial standing.",
        cost: Object.freeze({ gold: 18, food: 12 }),
        supply: 12,
        minimumPower: 12,
        risk: 34,
        reward: Object.freeze({ gold: 34, food: 0 }),
        loyalty: -2,
        power: 3
    })
});

const clamp = (value, min, max) => Math.max(min, Math.min(max, Number.isFinite(Number(value)) ? Number(value) : min));
const integer = (value, min, max) => Math.max(min, Math.min(max, Math.floor(Number(value) || 0)));
const yearNow = () => Math.max(1, Math.floor(Number(state.year) || 1));
const text = (value, limit) => String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, limit);
const round2 = value => Math.round(Number(value) * 100) / 100;

function contractFor(aimId) {
    const aim = WAR_AIMS[aimId];
    return aim ? FEUDAL_CONTRACTS[aim.contract] : null;
}

function outcomeView(outcome) {
    if (!outcome || typeof outcome !== "object" || Array.isArray(outcome)) return null;
    return {
        year: integer(outcome.year, 0, 1000000),
        result: outcome.result === "victory" ? "victory" : "setback",
        roll: clamp(outcome.roll, 0, 1),
        chance: clamp(outcome.chance, 0, 1),
        gold: integer(outcome.gold, 0, 1000000),
        food: integer(outcome.food, 0, 1000000),
        loyalty: integer(outcome.loyalty, -20, 20),
        power: integer(outcome.power, -10, 10),
        summary: text(outcome.summary, 240)
    };
}

function normalizeCampaign(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const aim = WAR_AIMS[value.aim] ? value.aim : "watch";
    const contract = contractFor(aim);
    const stage = value.stage === "committed" ? "committed" : value.stage === "settled" ? "settled" : "aim";
    return {
        id: text(value.id, 80) || "campaign-" + integer(value.openedYear, 1, 1000000) + "-1",
        aim,
        theatre: text(value.theatre, 80) || "unknown-theatre",
        theatreName: text(value.theatreName, 80) || "Unknown theatre",
        houseId: value.houseId ? text(value.houseId, 80) : null,
        houseName: value.houseId ? text(value.houseName, 80) || "Unnamed house" : null,
        stage,
        openedYear: integer(value.openedYear, 1, 1000000),
        committedYear: integer(value.committedYear, 0, 1000000),
        settledYear: integer(value.settledYear, 0, 1000000),
        progress: round2(clamp(value.progress, 0, CAMPAIGN_GOAL)),
        goal: CAMPAIGN_GOAL,
        power: integer(value.power, 0, 1000),
        supply: integer(value.supply, 0, 60),
        risk: integer(value.risk, 0, 100),
        cost: contract ? { ...contract.cost } : { ...FEUDAL_CONTRACTS.watch.cost },
        reward: contract ? { ...contract.reward } : { ...FEUDAL_CONTRACTS.watch.reward },
        outcome: outcomeView(value.outcome)
    };
}

function normalizeContract(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const aim = WAR_AIMS[value.aim] ? value.aim : "watch";
    return {
        id: text(value.id, 80) || "contract-1",
        campaignId: text(value.campaignId, 80) || "campaign-1",
        aim,
        theatre: text(value.theatre, 80) || "unknown-theatre",
        houseId: value.houseId ? text(value.houseId, 80) : null,
        houseName: value.houseId ? text(value.houseName, 80) || "Unnamed house" : null,
        stage: value.stage === "settled" ? "settled" : "committed",
        signedYear: integer(value.signedYear, 1, 1000000),
        settledYear: integer(value.settledYear, 0, 1000000),
        supply: integer(value.supply, 0, 60),
        risk: integer(value.risk, 0, 100),
        result: value.result === "victory" ? "victory" : value.result === "setback" ? "setback" : null,
        summary: text(value.summary, 240)
    };
}

export function createCampaignState() {
    return {
        version: 1,
        active: [],
        history: [],
        lastSettledYear: 0,
        aimsOpened: 0,
        commitments: 0,
        settlements: 0
    };
}

export function createContractState() {
    return {
        version: 1,
        active: [],
        history: [],
        lastSettledYear: 0,
        signed: 0,
        fulfilled: 0
    };
}

export function normalizeCampaignState(value = {}) {
    const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const seen = new Set();
    const active = (Array.isArray(source.active) ? source.active : [])
        .map(normalizeCampaign)
        .filter(Boolean)
        .filter(campaign => {
            if (seen.has(campaign.id)) return false;
            seen.add(campaign.id);
            return true;
        })
        .slice(0, MAX_ACTIVE_CAMPAIGNS);
    return {
        version: 1,
        active,
        history: (Array.isArray(source.history) ? source.history : [])
            .map(normalizeCampaign)
            .filter(Boolean)
            .slice(0, CAMPAIGN_HISTORY_LIMIT),
        lastSettledYear: integer(source.lastSettledYear, 0, 1000000),
        aimsOpened: Math.max(active.length, integer(source.aimsOpened, 0, 1000000)),
        commitments: integer(source.commitments, 0, 1000000),
        settlements: integer(source.settlements, 0, 1000000)
    };
}

export function normalizeContractState(value = {}) {
    const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const seen = new Set();
    const active = (Array.isArray(source.active) ? source.active : [])
        .map(normalizeContract)
        .filter(Boolean)
        .filter(contract => {
            if (seen.has(contract.id)) return false;
            seen.add(contract.id);
            return true;
        })
        .slice(0, MAX_ACTIVE_CONTRACTS);
    return {
        version: 1,
        active,
        history: (Array.isArray(source.history) ? source.history : [])
            .map(normalizeContract)
            .filter(Boolean)
            .slice(0, CONTRACT_HISTORY_LIMIT),
        lastSettledYear: integer(source.lastSettledYear, 0, 1000000),
        signed: Math.max(active.length, integer(source.signed, 0, 1000000)),
        fulfilled: integer(source.fulfilled, 0, 1000000)
    };
}

export function validateCampaignState(value) {
    if (value === undefined || value === null) return true;
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("Save data contains an invalid campaign state.");
    }
    if (value.active !== undefined && (!Array.isArray(value.active) || value.active.length > MAX_ACTIVE_CAMPAIGNS)) {
        throw new Error("Save data contains too many active campaigns.");
    }
    if (value.history !== undefined && (!Array.isArray(value.history) || value.history.length > CAMPAIGN_HISTORY_LIMIT)) {
        throw new Error("Save data contains an invalid campaign history.");
    }
    return true;
}

export function validateContractState(value) {
    if (value === undefined || value === null) return true;
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("Save data contains an invalid feudal contract state.");
    }
    if (value.active !== undefined && (!Array.isArray(value.active) || value.active.length > MAX_ACTIVE_CONTRACTS)) {
        throw new Error("Save data contains too many active feudal contracts.");
    }
    if (value.history !== undefined && (!Array.isArray(value.history) || value.history.length > CONTRACT_HISTORY_LIMIT)) {
        throw new Error("Save data contains an invalid feudal contract history.");
    }
    return true;
}

function campaignStore() {
    if (!state.military || typeof state.military !== "object" || Array.isArray(state.military)) state.military = {};
    if (!state.military.campaigns) state.military.campaigns = createCampaignState();
    else state.military.campaigns = normalizeCampaignState(state.military.campaigns);
    return state.military.campaigns;
}

function contractStore() {
    if (!state.nobility || typeof state.nobility !== "object" || Array.isArray(state.nobility)) state.nobility = {};
    if (!state.nobility.contracts) state.nobility.contracts = createContractState();
    else state.nobility.contracts = normalizeContractState(state.nobility.contracts);
    return state.nobility.contracts;
}

function campaignView(campaign) {
    const contract = contractFor(campaign.aim);
    const progress = round2(clamp(campaign.progress, 0, CAMPAIGN_GOAL));
    return {
        ...campaign,
        progress,
        progressPercent: Math.round(progress),
        aimLabel: WAR_AIMS[campaign.aim].label,
        contractLabel: contract.label,
        stageLabel: campaign.stage === "aim" ? "AIM" : campaign.stage === "committed" ? "COMMITTED" : "SETTLED",
        daysRemaining: Math.max(0, Math.ceil((CAMPAIGN_GOAL - progress) / CAMPAIGN_PROGRESS_PER_TICK)),
        canCommit: campaign.stage === "aim",
        canSettle: campaign.stage === "committed" && progress >= CAMPAIGN_GOAL
    };
}

export function getCampaignSnapshot() {
    const campaigns = campaignStore();
    return {
        campaigns: campaigns.active.map(campaignView),
        history: campaigns.history.slice(0, 6).map(campaignView),
        aims: Object.values(WAR_AIMS).map(aim => ({ ...aim, contract: { ...contractFor(aim.id) } })),
        limits: {
            active: MAX_ACTIVE_CAMPAIGNS,
            history: CAMPAIGN_HISTORY_LIMIT,
            progressPerTick: CAMPAIGN_PROGRESS_PER_TICK,
            goal: CAMPAIGN_GOAL
        },
        counters: {
            aimsOpened: campaigns.aimsOpened,
            commitments: campaigns.commitments,
            settlements: campaigns.settlements
        },
        lastSettledYear: campaigns.lastSettledYear
    };
}

export function getContractSnapshot() {
    const contracts = contractStore();
    return {
        active: contracts.active.slice(0, MAX_ACTIVE_CONTRACTS).map(entry => ({ ...entry })),
        history: contracts.history.slice(0, 6).map(entry => ({ ...entry })),
        registry: Object.values(FEUDAL_CONTRACTS).map(contract => ({ ...contract })),
        limits: { active: MAX_ACTIVE_CONTRACTS, history: CONTRACT_HISTORY_LIMIT },
        counters: { signed: contracts.signed, fulfilled: contracts.fulfilled },
        lastSettledYear: contracts.lastSettledYear
    };
}

export function aimCampaign({ aim, theatre, houseId = null } = {}) {
    if (!WAR_AIMS[aim]) return { ok: false, reason: "unknown-war-aim" };
    const theatreId = text(theatre, 80);
    if (theatreId.length < 2) return { ok: false, reason: "unknown-theatre" };
    const campaigns = campaignStore();
    if (campaigns.active.length >= MAX_ACTIVE_CAMPAIGNS) return { ok: false, reason: "campaign-slot-full" };
    if (campaigns.active.some(entry => entry.theatre === theatreId && entry.aim === aim)) {
        return { ok: false, reason: "aim-already-open" };
    }
    const house = houseId ? (state.nobility?.houses || []).find(entry => String(entry.id) === String(houseId)) : null;
    if (houseId && !house) return { ok: false, reason: "unknown-noble-house" };
    let sequence = campaigns.aimsOpened + 1;
    let id = "campaign-" + yearNow() + "-" + sequence;
    while (campaigns.active.some(entry => entry.id === id)) id = "campaign-" + yearNow() + "-" + (++sequence);
    const kingdom = (state.worldMap?.kingdoms || []).find(entry => String(entry.id) === theatreId);
    const campaign = normalizeCampaign({
        id,
        aim,
        theatre: theatreId,
        theatreName: kingdom?.name || theatreId,
        houseId: house ? house.id : null,
        houseName: house ? house.familyName : null,
        stage: "aim",
        openedYear: yearNow(),
        progress: 0
    });
    campaigns.active.push(campaign);
    campaigns.aimsOpened = Math.max(campaigns.aimsOpened, sequence);
    addLog("WAR AIM OPENED · " + WAR_AIMS[aim].label + " · " + campaign.theatreName.toUpperCase(), "#d8c18a", "military");
    return { ok: true, campaign: campaignView(campaign), snapshot: getCampaignSnapshot() };
}

function campaignPower(campaign) {
    const garrison = Number(state.military?.strengthPower) || 0;
    const house = campaign.houseId
        ? (state.nobility?.houses || []).find(entry => String(entry.id) === String(campaign.houseId))
        : null;
    const levy = Math.max(0, Number(house?.levy) || 0);
    const host = Number(state.nobility?.warHosts) || 0;
    return Math.round(garrison + levy * 0.5 + host * 2.5 + (house ? Number(house.power) || 0 : 0) * 0.2);
}

export function commitCampaign(id) {
    const campaigns = campaignStore();
    const campaign = campaigns.active.find(entry => String(entry.id) === String(id));
    if (!campaign) return { ok: false, reason: "unknown-campaign" };
    if (campaign.stage !== "aim") return { ok: false, reason: "campaign-already-committed" };
    const contract = contractFor(campaign.aim);
    const power = campaignPower(campaign);
    if (power < contract.minimumPower) return { ok: false, reason: "campaign-needs-" + contract.minimumPower + "-power" };
    for (const [resource, amount] of Object.entries(contract.cost)) {
        if ((Number(state.resources?.[resource]) || 0) < amount) return { ok: false, reason: "not-enough-" + resource };
    }
    for (const [resource, amount] of Object.entries(contract.cost)) {
        if (!amount) continue;
        addResource(resource, -amount);
        recordResourceMovement(resource, -amount, "campaign-cost", {
            from: { kind: "realm", id: "royal-stores" },
            to: { kind: "campaign", id: campaign.id }
        });
    }
    const kingdom = (state.worldMap?.kingdoms || []).find(entry => String(entry.id) === campaign.theatre);
    const contested = Math.max(0, Number(kingdom?.contested) || 0);
    const control = clamp(Number(kingdom?.control) || 50, 0, 100);
    campaign.stage = "committed";
    campaign.committedYear = yearNow();
    campaign.power = clamp(power, 0, 1000);
    campaign.supply = integer(contract.supply + Math.round(control / 40), 1, 60);
    campaign.risk = integer(contract.risk + contested * 4 - Math.round(power / 12), 5, 100);
    campaigns.commitments += 1;

    const contracts = contractStore();
    const signed = normalizeContract({
        id: "contract-" + campaign.id,
        campaignId: campaign.id,
        aim: campaign.aim,
        theatre: campaign.theatre,
        houseId: campaign.houseId,
        houseName: campaign.houseName,
        stage: "committed",
        signedYear: yearNow(),
        supply: campaign.supply,
        risk: campaign.risk
    });
    contracts.active.push(signed);
    if (contracts.active.length > MAX_ACTIVE_CONTRACTS) contracts.active.splice(0, contracts.active.length - MAX_ACTIVE_CONTRACTS);
    contracts.signed += 1;
    addLog("FEUDAL CONTRACT SIGNED · " + contract.label + " · " + campaign.theatreName.toUpperCase() + " · " + campaign.power + " POWER", "#d8c18a", "military");
    return { ok: true, campaign: campaignView(campaign), contract: { ...signed }, snapshot: getCampaignSnapshot() };
}

function settleOne(campaign, campaigns, contracts) {
    const contract = contractFor(campaign.aim);
    const house = campaign.houseId
        ? (state.nobility?.houses || []).find(entry => String(entry.id) === String(campaign.houseId))
        : null;
    const chance = clamp(0.42 + campaign.power / 180 + campaign.supply / 120 - campaign.risk / 200, 0.15, 0.92);
    const roll = rand(0, 1, "campaign");
    const victory = roll < chance;
    const gold = victory ? contract.reward.gold : 0;
    const food = victory ? contract.reward.food : 0;
    if (gold) {
        addResource("gold", gold);
        recordResourceMovement("gold", gold, "campaign-reward", {
            from: { kind: "campaign", id: campaign.id },
            to: { kind: "realm", id: "royal-stores" }
        });
    }
    if (food) {
        addResource("food", food);
        recordResourceMovement("food", food, "campaign-reward", {
            from: { kind: "campaign", id: campaign.id },
            to: { kind: "realm", id: "royal-stores" }
        });
    }
    const loyalty = victory ? contract.loyalty : -3;
    const power = victory ? contract.power : -1;
    if (house) {
        house.loyalty = clamp((Number(house.loyalty) || 0) + loyalty, 0, 100);
        house.power = clamp((Number(house.power) || 0) + power, 0, 300);
    }
    const summary = victory
        ? contract.label + " carried " + campaign.theatreName + ": " + gold + " gold and " + food + " food returned."
        : contract.label + " stalled in " + campaign.theatreName + "; the house paid in loyalty and standing.";
    campaign.stage = "settled";
    campaign.settledYear = yearNow();
    campaign.outcome = outcomeView({
        year: yearNow(), result: victory ? "victory" : "setback", roll, chance,
        gold, food, loyalty, power, summary
    });
    campaigns.settlements += 1;
    campaigns.lastSettledYear = yearNow();
    const index = campaigns.active.indexOf(campaign);
    if (index >= 0) campaigns.active.splice(index, 1);
    campaigns.history.unshift({ ...campaign });
    if (campaigns.history.length > CAMPAIGN_HISTORY_LIMIT) campaigns.history.length = CAMPAIGN_HISTORY_LIMIT;

    const contractIndex = contracts.active.findIndex(entry => entry.campaignId === campaign.id);
    const signed = contractIndex >= 0 ? contracts.active.splice(contractIndex, 1)[0] : normalizeContract({
        id: "contract-" + campaign.id,
        campaignId: campaign.id,
        aim: campaign.aim,
        theatre: campaign.theatre,
        houseId: campaign.houseId,
        houseName: campaign.houseName,
        signedYear: campaign.committedYear || yearNow()
    });
    signed.stage = "settled";
    signed.settledYear = yearNow();
    signed.result = victory ? "victory" : "setback";
    signed.summary = summary;
    contracts.history.unshift(signed);
    if (contracts.history.length > CONTRACT_HISTORY_LIMIT) contracts.history.length = CONTRACT_HISTORY_LIMIT;
    contracts.fulfilled += 1;
    contracts.lastSettledYear = yearNow();
    addLog((victory ? "CAMPAIGN VICTORY · " : "CAMPAIGN SETBACK · ") + campaign.theatreName.toUpperCase() + " · " + summary, victory ? "#a3d6a7" : "#d69b8a", "military");
    return { ...campaign, outcome: campaign.outcome };
}

// Exactly two bounded scalars per tick, no RNG and no entity walk. The annual
// task is the only place a campaign is removed, paid and recorded.
export function updateCampaignProgress() {
    const campaigns = state.military?.campaigns;
    if (!campaigns || !Array.isArray(campaigns.active)) return;
    for (const campaign of campaigns.active.slice(0, MAX_ACTIVE_CAMPAIGNS)) {
        if (campaign.stage !== "committed") continue;
        const contract = contractFor(campaign.aim);
        const factor = clamp(Number(campaign.supply) / Math.max(1, contract.supply), 0.5, 1.5);
        campaign.progress = round2(Math.min(CAMPAIGN_GOAL, Number(campaign.progress) + CAMPAIGN_PROGRESS_PER_TICK * factor));
    }
}

export function settleAnnualCampaigns() {
    const campaigns = campaignStore();
    const contracts = contractStore();
    const year = yearNow();
    const settled = [];
    for (const campaign of campaigns.active.slice(0, MAX_ACTIVE_CAMPAIGNS)) {
        if (campaign.stage !== "committed") continue;
        if (Number(campaign.progress) < CAMPAIGN_GOAL && year - campaign.committedYear < 2) continue;
        settled.push(settleOne(campaign, campaigns, contracts));
    }
    return { settled: settled.map(campaignView), snapshot: getCampaignSnapshot() };
}

export function settleReadyCampaigns() {
    const campaigns = campaignStore();
    const contracts = contractStore();
    const settled = [];
    for (const campaign of campaigns.active.slice(0, MAX_ACTIVE_CAMPAIGNS)) {
        if (campaign.stage === "committed" && Number(campaign.progress) >= CAMPAIGN_GOAL) {
            settled.push(settleOne(campaign, campaigns, contracts));
        }
    }
    return settled.length
        ? { ok: true, settled: settled.map(campaignView), snapshot: getCampaignSnapshot() }
        : { ok: false, reason: "no-ready-campaigns", snapshot: getCampaignSnapshot() };
}
