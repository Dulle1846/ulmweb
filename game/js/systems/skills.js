// Job skills and career experience. Values are derived from stable person data,
// not from the shared simulation RNG, so old campaigns keep their sequence.
import { TYPE } from "../core/types.js";

export const SKILL_KEYS = Object.freeze(["farming", "crafting", "trade", "learning", "care", "command", "labour"]);
export const SKILL_LABELS = Object.freeze({
    farming: "Farming", crafting: "Crafting", trade: "Trade", learning: "Learning",
    care: "Care", command: "Command", labour: "Labour"
});
export const JOB_SKILL = Object.freeze({
    farmer: "farming", forester: "farming",
    woodcutter: "labour", miner: "labour", goldminer: "labour", hauler: "labour", wellkeeper: "labour",
    builder: "crafting", miller: "crafting", sawyer: "crafting", mason: "crafting", baker: "crafting",
    innkeeper: "trade", merchant: "trade",
    healer: "care", stablehand: "care",
    acolyte: "learning", scholar: "learning",
    soldier: "command", guard: "command", archer: "command", knight: "command"
});
const BUILDING_SKILL = Object.freeze({
    [TYPE.FARM]: "farming", [TYPE.FORESTER]: "farming",
    [TYPE.LUMBER]: "labour", [TYPE.QUARRY]: "labour", [TYPE.GOLDMINE]: "labour", [TYPE.WAREHOUSE]: "labour", [TYPE.WELL]: "labour",
    [TYPE.SAWMILL]: "crafting", [TYPE.MASON]: "crafting", [TYPE.MILL]: "crafting", [TYPE.BAKERY]: "crafting", [TYPE.BREWERY]: "crafting",
    [TYPE.TAVERN]: "trade", [TYPE.MARKET]: "trade", [TYPE.GUILDHALL]: "trade",
    [TYPE.CLINIC]: "care", [TYPE.STABLE]: "care",
    [TYPE.SCHOOL]: "learning", [TYPE.TEMPLE]: "learning", [TYPE.SHRINE]: "learning",
    [TYPE.BARRACKS]: "command", [TYPE.TOWER]: "command", [TYPE.WATCHHOUSE]: "command"
});
const TRAIT_BIAS = Object.freeze({
    farming: { patience: 0.35, discipline: 0.15 },
    crafting: { discipline: 0.32, curiosity: 0.16 },
    trade: { ambition: 0.30, greed: 0.20 },
    learning: { curiosity: 0.40, discipline: 0.15 },
    care: { compassion: 0.42, patience: 0.18 },
    command: { courage: 0.38, ambition: 0.18 },
    labour: { discipline: 0.28, patience: 0.16 }
});
const clamp = (value, fallback = 50) => Number.isFinite(Number(value)) ? Math.max(0, Math.min(100, Number(value))) : fallback;

function hashString(value) {
    let hash = 2166136261;
    for (const character of String(value || "person")) {
        hash ^= character.charCodeAt(0);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}
function rng(seed) {
    let value = seed >>> 0;
    return () => {
        value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
        return value / 4294967296;
    };
}

export function createSkills(id, traits = {}) {
    const next = rng(hashString(String(id) + "|skills"));
    return Object.fromEntries(SKILL_KEYS.map(key => {
        const bias = Object.entries(TRAIT_BIAS[key] || {}).reduce((sum, [trait, weight]) =>
            sum + (clamp(traits[trait]) - 50) * weight, 0);
        return [key, Math.round(clamp(27 + next() * 39 + bias, 10, 90))];
    }));
}

export function normalizeSkills(saved, id, traits = {}) {
    const fallback = createSkills(id, traits);
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) return fallback;
    return Object.fromEntries(SKILL_KEYS.map(key => [key, Math.round(clamp(saved[key], fallback[key]))]));
}

export function skillForJob(person, job) {
    const key = JOB_SKILL[String(job || "").toLowerCase()] || "labour";
    return clamp(person?.skills?.[key], 50);
}
export function jobForEntity(entity) {
    if (entity?.job) return String(entity.job).toLowerCase();
    return BUILDING_SKILL[entity?.workplace?.type] || "labour";
}
export function getJobSkill(entity) {
    if (!entity?.person) return 50;
    const key = JOB_SKILL[jobForEntity(entity)] || "labour";
    const base = Number(entity.person.skills?.[key]);
    if (!Number.isFinite(base)) return 50;
    const experience = clamp(entity.person.jobExperience, 0);
    const ageAdjustment = entity.person.lifeStage === "elder" ? 2 : entity.person.lifeStage === "young" ? -3 : 0;
    return Math.round(clamp(base * 0.75 + 12.5 + experience * 0.15 + ageAdjustment));
}
export function advanceJobExperience(person, job, years = 1) {
    if (!person || !job) return 0;
    const gained = Math.min(4, Math.max(1, Math.floor(Number(years) || 1) * 2));
    const before = clamp(person.jobExperience, 0);
    person.jobExperience = Math.min(100, before + gained);
    const key = JOB_SKILL[String(job).toLowerCase()] || "labour";
    if (person.skills && typeof person.skills === "object" && person.jobExperience > before && before > 0 && before % 10 + gained >= 10) {
        person.skills[key] = Math.min(95, clamp(person.skills[key], 50) + 1);
    }
    return person.jobExperience - before;
}
