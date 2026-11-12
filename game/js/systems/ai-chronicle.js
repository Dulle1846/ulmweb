// Optional AI narrative layer for Kings & Cards.
//
// The live simulation remains deterministic and tick-driven. The AI is only
// invoked by an explicit player action in the Atelier, and every result is
// validated, bounded and stored as ordinary save data. When the same-origin
// proxy is not configured or returns malformed content, the deterministic
// offline chronicler produces the same kind of in-world material from actual
// names, years, resources and events.
import {state} from "../core/state.js";
import {addLog} from "../core/event-log.js";
import {
    AI_ACTION_COSTS,
    AI_CHRONICLE_LIMITS,
    createAiChronicleState,
    sanitizeAiText
} from "../core/ai-chronicle-state.js";
import {getPopulationSnapshot} from "./population-register.js";

const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));
const pick = (list, seed) => list[Math.abs(seed) % list.length];
const hash = text => {
    let value = 2166136261;
    for (const character of String(text || "")) {
        value ^= character.charCodeAt(0);
        value = Math.imul(value, 16777619);
    }
    return value >>> 0;
};

function chronicle() {
    if (!state.aiChronicle) state.aiChronicle = createAiChronicleState();
    return state.aiChronicle;
}

function citizens() {
    if (!state.hasStarted) return [];
    try {
        return Array.isArray(getPopulationSnapshot().citizens) ? getPopulationSnapshot().citizens : [];
    } catch {
        return [];
    }
}

function chooseCitizen(personId) {
    const list = citizens();
    if (!list.length) return null;
    const requested = personId && list.find(citizen => String(citizen.id) === String(personId));
    const pool = list.filter(citizen => !citizen.royal);
    const fallback = pool.sort((a, b) => {
        const score = citizen => (Number(citizen.talent?.score) || 0) + (Number(citizen.loyalty) || 0);
        return score(b) - score(a) || String(a.name).localeCompare(String(b.name));
    })[0] || list[0];
    return requested || fallback || null;
}

function sovereignName() {
    const king = state.entities?.find(entity => !entity.dead && entity.isKing);
    return king?.person?.name || state.playerName || "the Sovereign";
}

function recentRecords(limit = 5) {
    return (Array.isArray(state.eventLog) ? state.eventLog : [])
        .slice(-limit)
        .reverse()
        .map(entry => sanitizeAiText(entry?.text || entry?.title || entry?.message, 180))
        .filter(Boolean);
}

function citizenLabel(citizen) {
    if (!citizen) return "a resident";
    return sanitizeAiText(citizen.name, AI_CHRONICLE_LIMITS.author) || "a resident";
}

export function buildAiContext(kind, personId = null) {
    const citizen = kind === "conversation" ? chooseCitizen(personId) : null;
    const list = citizens();
    const authorPool = list.filter(citizenRecord =>
        ["scholar", "scribe", "clergy", "healer"].some(word =>
            String(citizenRecord.profession || "").toLowerCase().includes(word)));
    const author = authorPool.sort((a, b) => String(a.name).localeCompare(String(b.name)))[0] ||
        list.filter(item => !item.royal).sort((a, b) => String(a.name).localeCompare(String(b.name)))[0] ||
        null;
    return {
        kind,
        kingdom: sanitizeAiText(state.kingdomName || state.identity?.kingdomName || "Eldria", 80),
        ruler: sovereignName(),
        year: Math.max(1, Math.floor(Number(state.year) || 1)),
        tick: Math.max(0, Math.floor(Number(state.tick) || 0)),
        sequence: Math.max(0, Math.floor(Number(state.aiChronicle?.totalGenerated) || 0)) + 1,
        motto: sanitizeAiText(state.identity?.motto || "We keep what we build.", 160),
        culture: sanitizeAiText(state.identity?.culture || "frontier", 60),
        government: sanitizeAiText(state.government?.form || "feudal", 60),
        resources: Object.fromEntries(["wood", "stone", "gold", "food"].map(key => [
            key, Math.round((Number(state.resources?.[key]) || 0) * 100) / 100
        ])),
        author: author ? {
            id: String(author.id),
            name: citizenLabel(author),
            profession: sanitizeAiText(author.profession || "resident", 60),
            age: Math.max(0, Math.floor(Number(author.ageYears) || 0))
        } : {id: null, name: sovereignName(), profession: "sovereign", age: 0},
        citizen: citizen ? {
            id: String(citizen.id),
            name: citizenLabel(citizen),
            profession: sanitizeAiText(citizen.profession || "resident", 60),
            status: sanitizeAiText(citizen.status || "resident", 60),
            householdId: sanitizeAiText(citizen.householdId || "unhoused", 80),
            age: Math.max(0, Math.floor(Number(citizen.ageYears) || 0)),
            loyalty: clamp(citizen.loyalty, 0, 100),
            happiness: clamp(citizen.happiness, 0, 100),
            talent: sanitizeAiText(citizen.talent?.focus || "steady", 60)
        } : null,
        recent: recentRecords()
    };
}

function schemaFor(kind) {
    if (kind === "book") {
        return '{"title":"short title","author":"author name","genre":"genre","summary":"one or two sentences","excerpt":"two or three sentences of the book itself"}';
    }
    if (kind === "artifact") {
        return '{"name":"artifact name","material":"material","era":"era or year range","inscription":"short inscription","provenance":"where and how it was found","description":"two or three sentences","value":1}';
    }
    return '{"personId":"the supplied citizen id","personName":"the supplied citizen name","summary":"what the conversation was about","lines":[{"speaker":"citizen","text":"..."},{"speaker":"ruler","text":"..."}],"sentiment":"warm|neutral|tense","bondDelta":1,"memory":"a durable memory","rumor":"a rumor or empty string"}';
}

export function buildAiPrompt(kind, context) {
    const recent = context.recent.length ? context.recent.join(" | ") : "No event has been recorded yet.";
    const person = context.citizen
        ? `${context.citizen.name}, ${context.citizen.profession}, ${context.citizen.status}, age ${context.citizen.age}, household ${context.citizen.householdId}, loyalty ${context.citizen.loyalty}, happiness ${context.citizen.happiness}, talent ${context.citizen.talent}. Use exactly this personId: ${context.citizen.id}.`
        : "No specific resident is selected.";
    return [
        "You are the court chronicler of a living medieval fantasy realm.",
        "Ground every detail in the supplied simulation facts. Do not invent new game mechanics, resources, buildings, rulers or named people outside the facts.",
        "Write compact, evocative prose in English. Keep it suitable for a strategy game and avoid modern slang.",
        "Return ONLY one valid JSON object. No markdown fences, no commentary, no extra keys.",
        "The JSON shape must be: " + schemaFor(kind),
        "Realm: " + context.kingdom + " · ruler: " + context.ruler + " · year " + context.year + " · motto: " + context.motto + " · culture: " + context.culture + " · government: " + context.government + ".",
        "Stores: " + JSON.stringify(context.resources) + ". Author/commissioner: " + JSON.stringify(context.author) + ".",
        "Selected resident: " + person,
        "Recent recorded events: " + recent,
        kind === "conversation"
            ? "The conversation should deepen this named contact. Include 3 to 6 alternating citizen/ruler lines, a sentiment, a bondDelta from 0 to 3, one durable memory and one optional rumor."
            : "Keep the work historically plausible for the realm and consistent with the recorded events."
    ].join("\n");
}

function normalizeGeneratedEntry(kind, raw, context) {
    const input = raw && typeof raw === "object" && raw.entry && typeof raw.entry === "object" ? raw.entry : raw;
    if (!input || typeof input !== "object" || Array.isArray(input)) return null;
    if (kind === "book") {
        const title = sanitizeAiText(input.title, AI_CHRONICLE_LIMITS.title);
        const summary = sanitizeAiText(input.summary, AI_CHRONICLE_LIMITS.summary);
        const excerpt = sanitizeAiText(input.excerpt, AI_CHRONICLE_LIMITS.excerpt);
        if (!title || !summary || !excerpt) return null;
        return {
            title,
            author: sanitizeAiText(input.author, AI_CHRONICLE_LIMITS.author) || context.author.name,
            authorId: context.author.id,
            genre: sanitizeAiText(input.genre, AI_CHRONICLE_LIMITS.genre) || "chronicle",
            summary,
            excerpt
        };
    }
    if (kind === "artifact") {
        const name = sanitizeAiText(input.name, AI_CHRONICLE_LIMITS.title);
        const description = sanitizeAiText(input.description, AI_CHRONICLE_LIMITS.description);
        if (!name || !description) return null;
        return {
            name,
            material: sanitizeAiText(input.material, 60) || "weathered stone",
            era: sanitizeAiText(input.era, 80) || ("year " + context.year),
            inscription: sanitizeAiText(input.inscription, AI_CHRONICLE_LIMITS.inscription),
            provenance: sanitizeAiText(input.provenance, AI_CHRONICLE_LIMITS.provenance) || ("recovered in " + context.kingdom),
            description,
            value: clamp(Number(input.value) || 45, 1, 10000)
        };
    }
    if (!context.citizen) return null;
    const lines = (Array.isArray(input.lines) ? input.lines : [])
        .map(line => {
            if (!line || typeof line !== "object") return null;
            const text = sanitizeAiText(line.text, AI_CHRONICLE_LIMITS.line);
            if (!text) return null;
            return {speaker: line.speaker === "ruler" ? "ruler" : "citizen", text};
        })
        .filter(Boolean)
        .slice(0, AI_CHRONICLE_LIMITS.lines);
    const summary = sanitizeAiText(input.summary, AI_CHRONICLE_LIMITS.summary);
    if (lines.length < 2 || !summary) return null;
    return {
        personId: context.citizen.id,
        personName: context.citizen.name,
        summary,
        lines,
        sentiment: ["warm", "neutral", "tense"].includes(input.sentiment) ? input.sentiment : "neutral",
        bondDelta: clamp(Math.round(Number(input.bondDelta) || 1), 0, 3),
        memory: sanitizeAiText(input.memory, AI_CHRONICLE_LIMITS.memory),
        rumor: sanitizeAiText(input.rumor, AI_CHRONICLE_LIMITS.rumor)
    };
}

function meta(kind, entry, source, context) {
    const sequential = Math.max(0, Number(chronicle().totalGenerated) || 0) + 1;
    return {
        ...entry,
        id: "ai-" + kind + "-" + sequential.toString(36),
        createdYear: context.year,
        createdTick: context.tick,
        source
    };
}

export function offlineAiEntry(kind, context) {
    const seed = hash([kind, context.kingdom, context.ruler, context.year, context.tick, context.sequence,
        context.author.name, context.citizen?.id].join("|"));
    const event = context.recent[0] || "the founding of the realm";
    const eventPhrase = String(event).replace(/[.!?]+$/g, "").trim() || "the founding of the realm";
    if (kind === "book") {
        const nouns = ["Grain", "Ash", "Rivers", "Banners", "Hearth", "Roads", "Crowns", "Seasons"];
        const firstNoun = pick(nouns, seed);
        let secondNoun = pick(nouns, seed >> 5);
        if (secondNoun === firstNoun) secondNoun = nouns[(nouns.indexOf(firstNoun) + 1) % nouns.length];
        const title = "The Book of " + firstNoun + " and " + secondNoun;
        const genre = pick(["realm chronicle", "household history", "book of days", "civic treatise"], seed >> 3);
        return {
            title,
            author: context.author.name,
            authorId: context.author.id,
            genre,
            summary: "A " + genre + " written in " + context.kingdom + " in year " + context.year + ", under " + context.ruler + ", drawing its central example from " + eventPhrase + ".",
            excerpt: "In the " + (context.year % 2 ? "long" : "quiet") + " season of year " + context.year + ", under " + context.ruler + ", the people of " + context.kingdom + " remembered " + eventPhrase + ". \"" + context.motto + "\" the author wrote, and the household hearths answered with smoke. The book closes with a list of the living and a prayer for the harvest to come."
        };
    }
    if (kind === "artifact") {
        const names = ["Crown", "Seal", "Cup", "Ring", "Tablet", "Bell", "Clasp", "Key"];
        const materials = ["river stone", "old oak", "hammered bronze", "pale limestone", "blackened iron", "sea glass"];
        const name = pick(names, seed) + " of " + context.kingdom;
        const material = pick(materials, seed >> 2);
        const article = /^[aeiou]/i.test(material) ? "An" : "A";
        const years = context.year === 1 ? "one year" : context.year + " years";
        return {
            name,
            material,
            era: "year 1 to " + context.year,
            inscription: "\"" + context.motto + "\"",
            provenance: "Recovered from a household foundation in " + context.kingdom + " during the reign of " + context.ruler + ", near the place associated with " + eventPhrase + ".",
            description: article + " " + material + " " + pick(names, seed).toLowerCase() + " bearing the marks of " + context.kingdom + " and the court of " + context.ruler + ". Its wear patterns suggest it was handled at every formal gathering for " + years + ".",
            value: 35 + (seed % 80)
        };
    }
    if (!context.citizen) return null;
    const person = context.citizen;
    const sentiment = person.loyalty >= 62 ? "warm" : person.happiness < 42 ? "tense" : "neutral";
    const topic = person.profession === "farmer" ? "the state of the fields" :
        person.profession === "soldier" ? "the watch on the roads" :
        person.profession === "healer" ? "the health of the household" : "the household's place in the realm";
    return {
        personId: person.id,
        personName: person.name,
        summary: "The sovereign " + context.ruler + " spoke with " + person.name + " about " + topic + " after " + eventPhrase + ".",
        lines: [
            {speaker: "citizen", text: "My sovereign, I came to speak of " + topic + ". We have done what the season allowed, but the household watches the stores closely."},
            {speaker: "ruler", text: "Your work is seen, " + person.name + ". Tell me plainly what would make the next season steadier."},
            {speaker: "citizen", text: "A little certainty would do more than a grand promise. Remember the people who keep the hearths, and we will remember the crown."},
            {speaker: "ruler", text: "Then let this conversation be part of the record. I will not forget the hearths of " + context.kingdom + "."}
        ],
        sentiment,
        bondDelta: sentiment === "warm" ? 2 : sentiment === "tense" ? 1 : 2,
        memory: person.name + " asked the crown to remember " + topic + " in year " + context.year + ".",
        rumor: sentiment === "tense" ? "A neighboring household says the granary count is lower than the clerks admit." : ""
    };
}

async function requestAiEntry(kind, prompt, {fetcher = null, timeoutMs = 22000} = {}) {
    const request = fetcher || globalThis.fetch;
    if (typeof request !== "function") throw new Error("AI proxy is not available");
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timer = controller && typeof setTimeout === "function"
        ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
        const response = await request("/api/chronicle", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({kind, prompt}),
            signal: controller?.signal
        });
        if (!response || !response.ok) throw new Error("AI proxy is not configured");
        const payload = await response.json();
        return payload?.entry ?? payload;
    } finally {
        if (timer) clearTimeout(timer);
    }
}

export async function generateAiChronicleEntry(kind, {personId = null, fetcher = null} = {}) {
    if (!state.hasStarted) return {ok: false, reason: "Start a realm before commissioning a chronicle."};
    if (!["book", "artifact", "conversation"].includes(kind)) return {ok: false, reason: "Unknown chronicle action."};
    const context = buildAiContext(kind, personId);
    if (kind === "conversation" && !context.citizen) {
        return {ok: false, reason: "No living resident is available for a conversation."};
    }
    let error = "";
    try {
        const raw = await requestAiEntry(kind, buildAiPrompt(kind, context), {fetcher});
        const normalized = normalizeGeneratedEntry(kind, raw, context);
        if (!normalized) throw new Error("The AI response did not match the chronicle schema.");
        return {ok: true, entry: meta(kind, normalized, "ai", context), source: "ai", error: "", context};
    } catch (caught) {
        error = sanitizeAiText(caught?.message || "AI unavailable", AI_CHRONICLE_LIMITS.error);
    }
    const fallback = offlineAiEntry(kind, context);
    if (!fallback) return {ok: false, reason: error || "The chronicler could not write this entry."};
    return {
        ok: true,
        entry: meta(kind, fallback, "offline", context),
        source: "offline",
        error,
        context
    };
}

export function canAffordAiAction(kind) {
    const cost = AI_ACTION_COSTS[kind] || {};
    return Object.entries(cost).every(([resource, amount]) =>
        (Number(state.resources?.[resource]) || 0) >= Number(amount));
}

export function applyAiEntry(kind, entry, {source = "offline", error = ""} = {}) {
    const cost = AI_ACTION_COSTS[kind];
    if (!cost) return {ok: false, reason: "Unknown chronicle action."};
    if (!entry || typeof entry !== "object") return {ok: false, reason: "The chronicle entry is empty."};
    if (!canAffordAiAction(kind)) return {ok: false, reason: "The crown cannot afford this commission."};
    for (const [resource, amount] of Object.entries(cost)) {
        state.resources[resource] = Math.max(0, (Number(state.resources[resource]) || 0) - amount);
    }
    const book = chronicle();
    if (kind === "book") {
        book.books.unshift(entry);
        book.books = book.books.slice(0, AI_CHRONICLE_LIMITS.books);
        if (state.politics) state.politics.legitimacy = clamp((Number(state.politics.legitimacy) || 0) + 1, 0, 100);
        state.morale = clamp((Number(state.morale) || 0) + 0.4, 0, 100);
    } else if (kind === "artifact") {
        book.artifacts.unshift(entry);
        book.artifacts = book.artifacts.slice(0, AI_CHRONICLE_LIMITS.artifacts);
        if (state.politics) state.politics.legitimacy = clamp((Number(state.politics.legitimacy) || 0) + 2, 0, 100);
    } else {
        book.conversations.unshift(entry);
        book.conversations = book.conversations.slice(0, AI_CHRONICLE_LIMITS.conversations);
        if (!book.contacts || typeof book.contacts !== "object" || Array.isArray(book.contacts)) book.contacts = {};
        const existing = book.contacts[entry.personId] || {
            personId: entry.personId,
            name: entry.personName,
            bond: 50,
            trust: 50,
            lastTopic: "",
            lastTick: 0,
            memories: []
        };
        const updated = {
            ...existing,
            name: entry.personName || existing.name,
            bond: clamp((Number(existing.bond) || 50) + (Number(entry.bondDelta) || 1), 0, 100),
            trust: clamp((Number(existing.trust) || 50) + 1, 0, 100),
            lastTopic: sanitizeAiText(entry.summary, 160),
            lastTick: Math.max(0, Math.floor(Number(state.tick) || 0)),
            memories: [entry.memory, ...(existing.memories || [])].filter(Boolean).slice(0, AI_CHRONICLE_LIMITS.memories)
        };
        book.contacts[entry.personId] = updated;
        const contactKeys = Object.keys(book.contacts);
        if (contactKeys.length > AI_CHRONICLE_LIMITS.contacts) {
            const oldest = contactKeys
                .sort((a, b) => (Number(book.contacts[a].lastTick) || 0) - (Number(book.contacts[b].lastTick) || 0))[0];
            delete book.contacts[oldest];
        }
    }
    book.lastSource = source === "ai" ? "ai" : "offline";
    book.lastEffect = kind === "book"
        ? {kind, legitimacy: 1, morale: 0.4, bond: 0, trust: 0}
        : kind === "artifact"
            ? {kind, legitimacy: 2, morale: 0, bond: 0, trust: 0}
            : {kind, legitimacy: 0, morale: 0, bond: clamp(Number(entry.bondDelta) || 1, 0, 3), trust: 1};
    book.lastError = sanitizeAiText(error, AI_CHRONICLE_LIMITS.error);
    book.totalGenerated = Math.max(0, Number(book.totalGenerated) || 0) + 1;
    book.lastGeneratedTick = Math.max(0, Math.floor(Number(state.tick) || 0));
    const message = kind === "book"
        ? "The scriptorium completes “" + entry.title + "”."
        : kind === "artifact"
            ? "The reliquary receives “" + entry.name + "”."
            : "The crown records a conversation with " + entry.personName + ".";
    addLog(message, "#b99a59", "chronicle");
    return {ok: true, message, entry, source: book.lastSource};
}

export async function performAiAction(kind, {personId = null, fetcher = null} = {}) {
    if (!state.hasStarted) return {ok: false, reason: "Start a realm first."};
    if (!canAffordAiAction(kind)) return {ok: false, reason: "The crown cannot afford this commission."};
    const generated = await generateAiChronicleEntry(kind, {personId, fetcher});
    if (!generated.ok) return generated;
    const applied = applyAiEntry(kind, generated.entry, {source: generated.source, error: generated.error});
    return {...applied, source: generated.source, error: generated.error, context: generated.context};
}
