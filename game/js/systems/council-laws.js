// Council docket: propose a bill, lobby it with real stores, then let the
// annual council session vote and enforce it. The docket lives as an optional
// nested field inside the existing government DTO, so an older save simply
// receives empty bounded rows. Every draw uses the dedicated "council" stream;
// court, combat and simulation counters keep their exact order.
import { state } from "../core/state.js";
import { rand } from "../core/random.js";
import { addLog } from "../core/event-log.js";
import { addResource } from "./resources.js";
import { recordResourceMovement } from "./goods-book.js";
import { applyPoliticalEffects, getPoliticalSnapshot } from "./politics.js";

export const COUNCIL_DOCKET_LIMIT = 3;
export const COUNCIL_HISTORY_LIMIT = 24;
export const COUNCIL_BILLS = Object.freeze({
    "bread-ordinance": Object.freeze({
        id: "bread-ordinance",
        label: "BREAD ORDINANCE",
        description: "Post a fair bread price and fund public ovens through the next year.",
        supporters: Object.freeze(["commons", "clergy"]),
        opponents: Object.freeze(["guilds", "nobility"]),
        cost: Object.freeze({ gold: 12, food: 8 }),
        effects: Object.freeze({ legitimacy: 0.9, commons: 2.4, clergy: 0.7, guilds: -0.8, nobility: -0.4 }),
        morale: 1.2,
        enforcement: "The price board is posted and the oven grant is audited in the stores."
    }),
    "guild-charter": Object.freeze({
        id: "guild-charter",
        label: "GUILD CHARTER",
        description: "Confirm the guilds' right to set their own dues and apprenticeships.",
        supporters: Object.freeze(["guilds", "commons"]),
        opponents: Object.freeze(["nobility", "clergy"]),
        cost: Object.freeze({ gold: 16, wood: 6 }),
        effects: Object.freeze({ legitimacy: 0.4, guilds: 2.8, commons: 1.1, nobility: -1.2, clergy: -0.5 }),
        morale: 0.4,
        enforcement: "The charter is sealed and the guild roll is entered in the court record."
    }),
    "march-levy": Object.freeze({
        id: "march-levy",
        label: "MARCH LEVY",
        description: "Fund a standing border levy from the granary and the treasury.",
        supporters: Object.freeze(["nobility", "clergy"]),
        opponents: Object.freeze(["commons", "guilds"]),
        cost: Object.freeze({ gold: 14, food: 12 }),
        effects: Object.freeze({ legitimacy: 0.7, nobility: 2.1, clergy: 0.5, commons: -1.1, guilds: -0.9 }),
        morale: -0.4,
        enforcement: "The levy roll is mustered and its supplies are charged to the crown."
    }),
    "temple-relief": Object.freeze({
        id: "temple-relief",
        label: "TEMPLE RELIEF",
        description: "Endow public rites and winter relief from the royal stores.",
        supporters: Object.freeze(["clergy", "commons"]),
        opponents: Object.freeze(["guilds", "nobility"]),
        cost: Object.freeze({ gold: 8, food: 10 }),
        effects: Object.freeze({ legitimacy: 1.1, clergy: 2.4, commons: 0.9, guilds: -0.4, nobility: -0.3 }),
        morale: 1,
        enforcement: "The relief fund is disbursed and the temple accounts are read aloud."
    })
});

const clamp = (value, min, max) => Math.max(min, Math.min(max, Number.isFinite(Number(value)) ? Number(value) : min));
const integer = (value, min, max) => Math.max(min, Math.min(max, Math.floor(Number(value) || 0)));
const yearNow = () => Math.max(1, Math.floor(Number(state.year) || 1));
const text = (value, limit) => String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, limit);

function seatCount() {
    return integer(state.government?.councilSeats, 1, 12) || 3;
}

export function createCouncilState() {
    return {
        version: 1,
        docket: [],
        history: [],
        counters: { proposals: 0, lobbies: 0, votes: 0, enacted: 0, rejected: 0 },
        lastProposalYear: 0,
        lastLobbyYear: 0,
        lastVoteYear: 0
    };
}

function normalizeBillEntry(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const bill = COUNCIL_BILLS[value.billId] ? value.billId : "bread-ordinance";
    const stage = value.stage === "lobbied" ? "lobbied" : "proposed";
    return {
        id: text(value.id, 80) || "council-" + integer(value.proposedYear, 1, 1000000) + "-1",
        billId: bill,
        title: COUNCIL_BILLS[bill].label,
        stage,
        proposedYear: integer(value.proposedYear, 1, 1000000),
        lobbyYear: integer(value.lobbyYear, 0, 1000000),
        support: integer(value.support, 0, 100),
        opposition: integer(value.opposition, 0, 100),
        threshold: integer(value.threshold, 1, 100),
        supporters: Array.isArray(value.supporters) ? value.supporters.filter(name => typeof name === "string").slice(0, 4) : [...COUNCIL_BILLS[bill].supporters],
        opponents: Array.isArray(value.opponents) ? value.opponents.filter(name => typeof name === "string").slice(0, 4) : [...COUNCIL_BILLS[bill].opponents]
    };
}

function normalizeHistoryEntry(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const bill = COUNCIL_BILLS[value.billId] ? value.billId : "bread-ordinance";
    return {
        id: text(value.id, 80) || "council-law-1",
        billId: bill,
        title: COUNCIL_BILLS[bill].label,
        proposedYear: integer(value.proposedYear, 0, 1000000),
        settledYear: integer(value.settledYear, 0, 1000000),
        stage: value.stage === "enacted" ? "enacted" : "rejected",
        support: integer(value.support, 0, 100),
        threshold: integer(value.threshold, 1, 100),
        roll: clamp(value.roll, 0, 1),
        margin: integer(value.margin, -100, 100),
        summary: text(value.summary, 240)
    };
}

export function normalizeCouncilState(value) {
    const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const counters = source.counters && typeof source.counters === "object" && !Array.isArray(source.counters) ? source.counters : {};
    return {
        version: 1,
        docket: Array.isArray(source.docket)
            ? source.docket.map(normalizeBillEntry).filter(Boolean).slice(0, COUNCIL_DOCKET_LIMIT)
            : [],
        history: Array.isArray(source.history)
            ? source.history.map(normalizeHistoryEntry).filter(Boolean).slice(-COUNCIL_HISTORY_LIMIT)
            : [],
        counters: {
            proposals: integer(counters.proposals, 0, 1000000),
            lobbies: integer(counters.lobbies, 0, 1000000),
            votes: integer(counters.votes, 0, 1000000),
            enacted: integer(counters.enacted, 0, 1000000),
            rejected: integer(counters.rejected, 0, 1000000)
        },
        lastProposalYear: integer(source.lastProposalYear, 0, 1000000),
        lastLobbyYear: integer(source.lastLobbyYear, 0, 1000000),
        lastVoteYear: integer(source.lastVoteYear, 0, 1000000)
    };
}

function ensureCouncil() {
    if (!state.government || typeof state.government !== "object" || Array.isArray(state.government)) state.government = {};
    if (!state.government.council) state.government.council = createCouncilState();
    state.government.council = normalizeCouncilState(state.government.council);
    return state.government.council;
}

function foundingSupport(bill) {
    const politics = getPoliticalSnapshot();
    const average = names => names.reduce((total, name) => total + (Number(politics.factions[name]) || 50), 0) / Math.max(1, names.length);
    const seats = seatCount();
    const support = 38 + average(bill.supporters) * 0.34 - average(bill.opponents) * 0.18 + seats;
    return {
        support: integer(Math.round(clamp(support, 10, 92)), 0, 100),
        opposition: integer(Math.round(clamp(average(bill.opponents), 0, 100)), 0, 100),
        threshold: integer(Math.round(clamp(42 + seats * 2.5, 44, 68)), 1, 100)
    };
}

function payCouncilCost(cost) {
    for (const [resource, amount] of Object.entries(cost || {})) {
        const value = Number(amount);
        if (!Number.isFinite(value) || value <= 0) continue;
        addResource(resource, -value);
        recordResourceMovement(resource, -value, "council-lobby", {
            from: { kind: "realm", id: "royal-stores" },
            to: { kind: "council", id: "docket" }
        });
    }
}

function canAfford(cost) {
    return Object.entries(cost || {}).every(([resource, amount]) =>
        !Number.isFinite(Number(amount)) || Number(amount) <= 0 || (Number(state.resources?.[resource]) || 0) >= Number(amount));
}

export function proposeCouncilBill(billId) {
    const bill = COUNCIL_BILLS[billId];
    if (!bill) return { ok: false, reason: "unknown-council-bill" };
    if (!state.hasStarted) return { ok: false, reason: "realm-not-started" };
    const council = ensureCouncil();
    const year = yearNow();
    if (council.lastProposalYear === year) return { ok: false, reason: "one-proposal-per-year" };
    if (council.docket.length >= COUNCIL_DOCKET_LIMIT) return { ok: false, reason: "docket-full" };
    if (council.docket.some(entry => entry.billId === billId)) return { ok: false, reason: "bill-already-on-docket" };
    const founding = foundingSupport(bill);
    const entry = {
        id: "bill-" + year + "-" + (council.counters.proposals + 1),
        billId,
        title: bill.label,
        stage: "proposed",
        proposedYear: year,
        lobbyYear: 0,
        ...founding,
        supporters: [...bill.supporters],
        opponents: [...bill.opponents]
    };
    council.docket.push(entry);
    council.counters.proposals++;
    council.lastProposalYear = year;
    addLog("COUNCIL BILL PROPOSED · " + bill.label + " · SUPPORT " + entry.support + "/" + entry.threshold, "#d8c18a", "government");
    return { ok: true, bill: entry, council, message: "COUNCIL BILL PROPOSED · " + bill.label };
}

export function lobbyCouncilBill(id) {
    const council = ensureCouncil();
    const entry = council.docket.find(row => row.id === id);
    if (!entry) return { ok: false, reason: "bill-not-on-docket" };
    if (entry.stage !== "proposed") return { ok: false, reason: "bill-already-lobbied" };
    const year = yearNow();
    if (council.lastLobbyYear === year) return { ok: false, reason: "one-lobby-per-year" };
    const bill = COUNCIL_BILLS[entry.billId];
    if (!canAfford(bill.cost)) return { ok: false, reason: "not-enough-resources" };
    payCouncilCost(bill.cost);
    entry.support = integer(Math.round(clamp(entry.support + 2 + seatCount(), 0, 100)), 0, 100);
    entry.stage = "lobbied";
    entry.lobbyYear = year;
    council.counters.lobbies++;
    council.lastLobbyYear = year;
    addLog("COUNCIL LOBBY PAID · " + bill.label + " · SUPPORT " + entry.support + "/" + entry.threshold, "#d8c18a", "government");
    return { ok: true, bill: entry, council, message: "COUNCIL LOBBY PAID · " + bill.label };
}

function settleBill(entry, council, source) {
    const bill = COUNCIL_BILLS[entry.billId];
    const year = yearNow();
    const roll = rand(0, 1, "council");
    const swing = roll * 8 - 4;
    const margin = Math.round(entry.support - entry.threshold + swing);
    const enacted = margin >= 0;
    if (enacted) {
        applyPoliticalEffects(bill.effects);
        state.morale = clamp((Number(state.morale) || 0) + (Number(bill.morale) || 0), 0, 100);
        if (!Array.isArray(state.government.history)) state.government.history = [];
        state.government.history.push({ year, kind: "council-law", id: bill.id, label: bill.label, result: "enacted" });
        state.government.history = state.government.history.slice(-40);
        state.government.decrees = integer((Number(state.government.decrees) || 0) + 1, 0, 100000);
        council.counters.enacted++;
    } else {
        const leadingOpponent = bill.opponents[0];
        applyPoliticalEffects({ legitimacy: -0.4, [leadingOpponent]: -0.8 });
        if (!Array.isArray(state.government.history)) state.government.history = [];
        state.government.history.push({ year, kind: "council-law", id: bill.id, label: bill.label, result: "rejected" });
        state.government.history = state.government.history.slice(-40);
        council.counters.rejected++;
    }
    council.counters.votes++;
    const result = enacted ? "enacted" : "rejected";
    const summary = enacted ? bill.enforcement : "The docket was rejected; the bill returns to the next session with weaker support.";
    const record = {
        id: "council-law-" + year + "-" + (council.counters.votes),
        billId: bill.id,
        title: bill.label,
        proposedYear: entry.proposedYear,
        settledYear: year,
        stage: result,
        support: entry.support,
        threshold: entry.threshold,
        roll,
        margin,
        summary
    };
    council.history.push(record);
    council.history = council.history.slice(-COUNCIL_HISTORY_LIMIT);
    council.docket = council.docket.filter(row => row.id !== entry.id);
    addLog("COUNCIL " + (enacted ? "ENACTED" : "REJECTED") + " · " + bill.label + " · ROLL " + roll.toFixed(3) + " · MARGIN " + margin + " · " + source.toUpperCase(),
        enacted ? "#a3d6a7" : "#d69b8a", "government");
    return { ok: true, result, record, council, message: "COUNCIL " + result.toUpperCase() + " · " + bill.label };
}

export function callCouncilVote(id) {
    const council = ensureCouncil();
    const entry = council.docket.find(row => row.id === id);
    if (!entry) return { ok: false, reason: "bill-not-on-docket" };
    if (entry.stage !== "lobbied") return { ok: false, reason: "bill-not-lobbied" };
    const year = yearNow();
    if (year <= entry.proposedYear) return { ok: false, reason: "vote-waits-for-next-year" };
    if (council.lastVoteYear === year) return { ok: false, reason: "one-vote-per-year" };
    const settled = settleBill(entry, council, "player");
    council.lastVoteYear = year;
    return settled;
}

export function updateCouncilDocket() {
    const council = ensureCouncil();
    const year = yearNow();
    if (council.lastVoteYear === year) return { ok: true, settled: [], council, annual: true };
    const ready = council.docket.filter(entry => entry.stage === "lobbied" && year > entry.proposedYear).slice(0, COUNCIL_DOCKET_LIMIT);
    const settled = [];
    for (const entry of ready) settled.push(settleBill(entry, council, "annual"));
    if (ready.length) council.lastVoteYear = year;
    return { ok: true, settled, council, annual: true };
}

export function getCouncilSnapshot() {
    const council = ensureCouncil();
    const year = yearNow();
    const seats = seatCount();
    const docket = council.docket.map(entry => {
        const bill = COUNCIL_BILLS[entry.billId];
        return {
            ...entry,
            label: bill.label,
            description: bill.description,
            cost: { ...bill.cost },
            enforcement: bill.enforcement,
            canLobby: entry.stage === "proposed" && council.lastLobbyYear !== year && canAfford(bill.cost),
            canVote: entry.stage === "lobbied" && year > entry.proposedYear && council.lastVoteYear !== year,
            voteNote: year <= entry.proposedYear ? "The vote opens next year." : "Ready for the council session."
        };
    });
    const bills = Object.values(COUNCIL_BILLS).map(bill => ({
        ...bill,
        cost: { ...bill.cost },
        supporters: [...bill.supporters],
        opponents: [...bill.opponents],
        affordable: canAfford(bill.cost),
        onDocket: council.docket.some(entry => entry.billId === bill.id),
        proposable: !state.hasStarted ? false : council.lastProposalYear !== year &&
            council.docket.length < COUNCIL_DOCKET_LIMIT && !council.docket.some(entry => entry.billId === bill.id)
    }));
    return {
        ...council,
        seats,
        year,
        bills,
        docket,
        history: council.history.slice().reverse(),
        limits: Object.freeze({ docket: COUNCIL_DOCKET_LIMIT, history: COUNCIL_HISTORY_LIMIT }),
        totals: Object.freeze({
            proposed: council.counters.proposals,
            lobbied: council.counters.lobbies,
            votes: council.counters.votes,
            enacted: council.counters.enacted,
            rejected: council.counters.rejected
        })
    };
}
