// Pure state, bounds and validation for the optional AI Living Chronicle.
// This module deliberately has no DOM or fetch dependency so save validation
// and headless tests can exercise it without the browser.
export const AI_CHRONICLE_VERSION = 1;
export const AI_CHRONICLE_LIMITS = Object.freeze({
    books: 24,
    artifacts: 24,
    conversations: 20,
    contacts: 32,
    memories: 4,
    lines: 8,
    title: 96,
    author: 64,
    genre: 40,
    summary: 420,
    excerpt: 900,
    inscription: 220,
    provenance: 260,
    description: 420,
    line: 240,
    memory: 180,
    rumor: 180,
    error: 180
});
export const AI_ACTION_COSTS = Object.freeze({
    book: Object.freeze({gold: 25}),
    artifact: Object.freeze({gold: 15, stone: 8}),
    conversation: Object.freeze({})
});
export const AI_ACTION_LABELS = Object.freeze({
    book: "commission a book",
    artifact: "commission an artifact",
    conversation: "hold a conversation"
});

const SOURCES = new Set(["ai", "offline"]);
const KINDS = new Set(["book", "artifact", "conversation"]);

export function sanitizeAiText(value, max = 240) {
    return String(value ?? "")
        .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, Math.max(1, Math.floor(Number(max) || 1)));
}

const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));
const finiteInt = (value, fallback = 0) => Number.isFinite(Number(value))
    ? Math.max(0, Math.floor(Number(value)))
    : fallback;
const object = value => value && typeof value === "object" && !Array.isArray(value);

export function createAiChronicleState() {
    return {
        version: AI_CHRONICLE_VERSION,
        books: [],
        artifacts: [],
        conversations: [],
        contacts: {},
        lastSource: "none",
        lastError: "",
        lastEffect: null,
        totalGenerated: 0,
        lastGeneratedTick: 0
    };
}

function normalizeBook(input) {
    if (!object(input)) return null;
    const title = sanitizeAiText(input.title, AI_CHRONICLE_LIMITS.title);
    const author = sanitizeAiText(input.author, AI_CHRONICLE_LIMITS.author);
    const summary = sanitizeAiText(input.summary, AI_CHRONICLE_LIMITS.summary);
    const excerpt = sanitizeAiText(input.excerpt, AI_CHRONICLE_LIMITS.excerpt);
    if (!title || !summary || !excerpt) return null;
    return {
        id: sanitizeAiText(input.id, 96) || "book",
        title,
        author: author || "The Court Chronicler",
        authorId: sanitizeAiText(input.authorId, 96) || null,
        genre: sanitizeAiText(input.genre, AI_CHRONICLE_LIMITS.genre) || "chronicle",
        summary,
        excerpt,
        createdYear: finiteInt(input.createdYear, 1),
        createdTick: finiteInt(input.createdTick, 0),
        source: SOURCES.has(input.source) ? input.source : "offline"
    };
}

function normalizeArtifact(input) {
    if (!object(input)) return null;
    const name = sanitizeAiText(input.name, AI_CHRONICLE_LIMITS.title);
    const description = sanitizeAiText(input.description, AI_CHRONICLE_LIMITS.description);
    if (!name || !description) return null;
    return {
        id: sanitizeAiText(input.id, 96) || "artifact",
        name,
        material: sanitizeAiText(input.material, 60) || "weathered stone",
        era: sanitizeAiText(input.era, 80) || "the early realm",
        inscription: sanitizeAiText(input.inscription, AI_CHRONICLE_LIMITS.inscription),
        provenance: sanitizeAiText(input.provenance, AI_CHRONICLE_LIMITS.provenance),
        description,
        value: clamp(input.value, 0, 100000),
        createdYear: finiteInt(input.createdYear, 1),
        createdTick: finiteInt(input.createdTick, 0),
        source: SOURCES.has(input.source) ? input.source : "offline"
    };
}

function normalizeConversation(input) {
    if (!object(input)) return null;
    const personId = sanitizeAiText(input.personId, 96);
    const personName = sanitizeAiText(input.personName, AI_CHRONICLE_LIMITS.author);
    const summary = sanitizeAiText(input.summary, AI_CHRONICLE_LIMITS.summary);
    if (!personId || !personName || !summary) return null;
    const lines = (Array.isArray(input.lines) ? input.lines : [])
        .map(line => {
            if (!object(line)) return null;
            const text = sanitizeAiText(line.text, AI_CHRONICLE_LIMITS.line);
            if (!text) return null;
            return {
                speaker: line.speaker === "ruler" ? "ruler" : "citizen",
                text
            };
        })
        .filter(Boolean)
        .slice(0, AI_CHRONICLE_LIMITS.lines);
    if (lines.length < 2) return null;
    return {
        id: sanitizeAiText(input.id, 96) || "conversation",
        personId,
        personName,
        summary,
        lines,
        sentiment: ["warm", "neutral", "tense"].includes(input.sentiment) ? input.sentiment : "neutral",
        bondDelta: clamp(Math.round(Number(input.bondDelta) || 1), 0, 3),
        memory: sanitizeAiText(input.memory, AI_CHRONICLE_LIMITS.memory),
        rumor: sanitizeAiText(input.rumor, AI_CHRONICLE_LIMITS.rumor),
        createdYear: finiteInt(input.createdYear, 1),
        createdTick: finiteInt(input.createdTick, 0),
        source: SOURCES.has(input.source) ? input.source : "offline"
    };
}

function normalizeContact(input, fallbackId) {
    if (!object(input)) return null;
    const personId = sanitizeAiText(input.personId, 96) || fallbackId;
    if (!personId) return null;
    return {
        personId,
        name: sanitizeAiText(input.name, AI_CHRONICLE_LIMITS.author) || "Unknown resident",
        bond: clamp(input.bond, 0, 100),
        trust: clamp(input.trust, 0, 100),
        lastTopic: sanitizeAiText(input.lastTopic, 160),
        lastTick: finiteInt(input.lastTick, 0),
        memories: (Array.isArray(input.memories) ? input.memories : [])
            .map(memory => sanitizeAiText(memory, AI_CHRONICLE_LIMITS.memory))
            .filter(Boolean)
            .slice(0, AI_CHRONICLE_LIMITS.memories)
    };
}

function normalizeLastEffect(input) {
    if (!object(input) || !KINDS.has(input.kind)) return null;
    return {
        kind: input.kind,
        legitimacy: clamp(Math.round(Number(input.legitimacy) || 0), 0, 3),
        morale: clamp(Number(input.morale) || 0, 0, 1),
        bond: clamp(Math.round(Number(input.bond) || 0), 0, 100),
        trust: clamp(Math.round(Number(input.trust) || 0), 0, 100)
    };
}

export function normalizeAiChronicleState(input) {
    if (!object(input)) return createAiChronicleState();
    const books = (Array.isArray(input.books) ? input.books : [])
        .map(normalizeBook).filter(Boolean).slice(0, AI_CHRONICLE_LIMITS.books);
    const artifacts = (Array.isArray(input.artifacts) ? input.artifacts : [])
        .map(normalizeArtifact).filter(Boolean).slice(0, AI_CHRONICLE_LIMITS.artifacts);
    const conversations = (Array.isArray(input.conversations) ? input.conversations : [])
        .map(normalizeConversation).filter(Boolean).slice(0, AI_CHRONICLE_LIMITS.conversations);
    const contacts = {};
    for (const [id, value] of Object.entries(object(input.contacts) ? input.contacts : {})) {
        const contact = normalizeContact(value, id);
        if (contact && Object.keys(contacts).length < AI_CHRONICLE_LIMITS.contacts) contacts[contact.personId] = contact;
    }
    return {
        version: AI_CHRONICLE_VERSION,
        books,
        artifacts,
        conversations,
        contacts,
        lastSource: SOURCES.has(input.lastSource) ? input.lastSource : "none",
        lastError: sanitizeAiText(input.lastError, AI_CHRONICLE_LIMITS.error),
        lastEffect: normalizeLastEffect(input.lastEffect),
        totalGenerated: finiteInt(input.totalGenerated, 0),
        lastGeneratedTick: finiteInt(input.lastGeneratedTick, 0)
    };
}

export function serializeAiChronicleState(value) {
    return JSON.parse(JSON.stringify(normalizeAiChronicleState(value)));
}

function requireText(value, label, max) {
    if (typeof value !== "string" || !sanitizeAiText(value, max)) {
        throw new Error("AI chronicle " + label + " is invalid.");
    }
}

export function validateAiChronicleState(input) {
    if (input === undefined || input === null) return true;
    if (!object(input)) throw new Error("AI chronicle state must be an object.");
    for (const key of ["books", "artifacts", "conversations"]) {
        if (!Array.isArray(input[key])) throw new Error("AI chronicle " + key + " must be an array.");
        if (input[key].length > AI_CHRONICLE_LIMITS[key]) throw new Error("AI chronicle " + key + " exceeds its cap.");
    }
    if (!object(input.contacts)) throw new Error("AI chronicle contacts must be an object.");
    if (Object.keys(input.contacts).length > AI_CHRONICLE_LIMITS.contacts) throw new Error("AI chronicle contacts exceed their cap.");
    if (input.lastEffect !== undefined && input.lastEffect !== null) {
        if (!object(input.lastEffect) || !KINDS.has(input.lastEffect.kind)) throw new Error("AI chronicle last effect is invalid.");
        for (const key of ["legitimacy", "morale", "bond", "trust"]) {
            if (!Number.isFinite(Number(input.lastEffect[key]))) throw new Error("AI chronicle last effect value is invalid.");
        }
    }
    for (const book of input.books) {
        if (!object(book)) throw new Error("AI chronicle book is invalid.");
        requireText(book.title, "book title", AI_CHRONICLE_LIMITS.title);
        requireText(book.author, "book author", AI_CHRONICLE_LIMITS.author);
        requireText(book.summary, "book summary", AI_CHRONICLE_LIMITS.summary);
        requireText(book.excerpt, "book excerpt", AI_CHRONICLE_LIMITS.excerpt);
    }
    for (const artifact of input.artifacts) {
        if (!object(artifact)) throw new Error("AI chronicle artifact is invalid.");
        requireText(artifact.name, "artifact name", AI_CHRONICLE_LIMITS.title);
        requireText(artifact.description, "artifact description", AI_CHRONICLE_LIMITS.description);
    }
    for (const conversation of input.conversations) {
        if (!object(conversation) || !Array.isArray(conversation.lines) ||
            conversation.lines.length < 2 || conversation.lines.length > AI_CHRONICLE_LIMITS.lines) {
            throw new Error("AI chronicle conversation is invalid.");
        }
        requireText(conversation.personId, "conversation person", 96);
        requireText(conversation.personName, "conversation name", AI_CHRONICLE_LIMITS.author);
        requireText(conversation.summary, "conversation summary", AI_CHRONICLE_LIMITS.summary);
        for (const line of conversation.lines) {
            if (!object(line) || !["citizen", "ruler"].includes(line.speaker)) throw new Error("AI chronicle conversation line is invalid.");
            requireText(line.text, "conversation line", AI_CHRONICLE_LIMITS.line);
        }
    }
    for (const contact of Object.values(input.contacts)) {
        if (!object(contact)) throw new Error("AI chronicle contact is invalid.");
        requireText(contact.personId, "contact id", 96);
        requireText(contact.name, "contact name", AI_CHRONICLE_LIMITS.author);
        if (!Number.isFinite(Number(contact.bond)) || !Number.isFinite(Number(contact.trust))) {
            throw new Error("AI chronicle contact values are invalid.");
        }
        if (!Array.isArray(contact.memories) || contact.memories.length > AI_CHRONICLE_LIMITS.memories) {
            throw new Error("AI chronicle contact memories exceed their cap.");
        }
    }
    return true;
}

export {KINDS, SOURCES};
