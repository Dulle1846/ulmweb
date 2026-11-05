// Royal household, dynastic heirs and deterministic succession rules.
import { state } from "../core/state.js";
import { TYPE } from "../core/types.js";
import { spawnEntity, canSpawnEntity } from "../world/entities.js";
import { ensurePersonProfile, addPersonMemory, PERSON_SPECIES } from "./people.js";
import { linkParentChild, setPartnership, getFamilySnapshot } from "./families.js";
import { randInt } from "../core/random.js";

export const SUCCESSION_LAWS = Object.freeze({
    absolute: "Absolute primogeniture",
    malePreference: "Male-preference primogeniture",
    elective: "Council election"
});
export const ROYAL_HEIR_COOLDOWN_YEARS = 3;
export const MAX_ROYAL_CHILDREN = 12;

const yearNow = () => Math.max(1, Math.floor(Number(state.year) || 1));
const tickNow = () => Math.max(0, Math.floor(Number(state.tick) || 0));
const livePeople = () => state.entities.filter(entity => !entity.dead && entity.personId && entity.person);

export function normalizeRoyalHouse(input = state.royalHouse) {
    const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
    const law = Object.hasOwn(SUCCESSION_LAWS, source.successionLaw) ? source.successionLaw : "absolute";
    state.royalHouse = {
        dynastyName: String(source.dynastyName || "House of Eldria").slice(0, 64),
        monarchId: typeof source.monarchId === "string" ? source.monarchId.slice(0, 100) : null,
        successionLaw: law,
        lastHeirYear: Math.max(0, Math.min(1000000, Math.floor(Number(source.lastHeirYear) || 0))),
        successionHistory: Array.isArray(source.successionHistory)
            ? source.successionHistory.filter(item => item && typeof item === "object").slice(-32).map(item => ({
                personId: String(item.personId || "").slice(0, 100),
                name: String(item.name || "Unknown").slice(0, 90),
                year: Math.max(1, Math.min(1000000, Math.floor(Number(item.year) || 1))),
                law: Object.hasOwn(SUCCESSION_LAWS, item.law) ? item.law : law
            }))
            : []
    };
    const monarch = state.entities.find(entity => !entity.dead && entity.isKing);
    if (monarch) state.royalHouse.monarchId = String(monarch.personId || monarch.id);
    return state.royalHouse;
}

export function getMonarch() {
    return state.entities.find(entity => !entity.dead && entity.isKing && entity.personId) || null;
}

function findLivingPerson(personId) {
    const id = String(personId || "");
    return livePeople().find(entity => String(entity.personId) === id) || null;
}

function ancestorsOf(personId) {
    const result = new Set();
    const pending = [{ id: String(personId), depth: 0 }];
    while (pending.length && result.size < 256) {
        const current = pending.pop();
        if (current.depth >= 16) continue;
        const family = getFamilySnapshot(current.id);
        for (const parent of family?.parents || []) {
            if (result.has(parent.personId)) continue;
            result.add(parent.personId);
            pending.push({ id: parent.personId, depth: current.depth + 1 });
        }
    }
    return result;
}

function isCloseRelative(first, second) {
    const firstAncestors = ancestorsOf(first.personId);
    const secondAncestors = ancestorsOf(second.personId);
    return firstAncestors.has(second.personId) || secondAncestors.has(first.personId) ||
        [...firstAncestors].some(id => secondAncestors.has(id));
}

function activeRoyalConsort(monarch) {
    const person = ensurePersonProfile(monarch, { role: "king" });
    const link = person.kinship.partners.find(item => item.status === "married");
    return link ? findLivingPerson(link.personId) : null;
}

export function getRoyalMarriageCandidates() {
    const monarch = getMonarch();
    if (!monarch) return [];
    const ruler = ensurePersonProfile(monarch, { role: "king" });
    const maturity = PERSON_SPECIES[ruler.species]?.maturation ?? 16;
    return livePeople().filter(candidate => {
        if (candidate === monarch || candidate.isKing || candidate.isRoyal) return false;
        if (candidate.type !== TYPE.VILLAGER) return false;
        const person = ensurePersonProfile(candidate);
        if (person.species !== ruler.species || person.sex === ruler.sex) return false;
        if (person.ageYears < maturity || person.lifeStage !== "adult") return false;
        if (isCloseRelative(monarch, candidate)) return false;
        return !person.kinship.partners.some(link => ["partner", "married"].includes(link.status));
    }).sort((a, b) => String(a.person.name).localeCompare(String(b.person.name))).slice(0, 40);
}

export function arrangeRoyalMarriage(candidateId) {
    const monarch = getMonarch();
    if (!monarch) return { ok: false, reason: "no-living-monarch" };
    if (activeRoyalConsort(monarch)) return { ok: false, reason: "consort-already-recorded" };
    const candidate = findLivingPerson(candidateId);
    if (!candidate || !getRoyalMarriageCandidates().some(item => item.personId === candidate.personId)) {
        return { ok: false, reason: "candidate-not-eligible" };
    }
    const ruler = ensurePersonProfile(monarch, { role: "king" });
    const consort = ensurePersonProfile(candidate, { role: "royal-consort" });
    const result = setPartnership(monarch.personId, candidate.personId, { status: "married", sinceYear: yearNow() });
    if (!result.ok) return result;
    candidate.isRoyal = true;
    candidate.isRoyalConsort = true;
    consort.role = "royal-consort";
    ruler.role = "king";
    addPersonMemory(monarch, {
        id: "royal-marriage:" + candidate.personId + ":" + yearNow(),
        type: "dynasty",
        text: "I married " + consort.name + " in year " + yearNow() + " to unite our households.",
        tick: tickNow(), importance: 92
    });
    addPersonMemory(candidate, {
        id: "royal-marriage:" + monarch.personId + ":" + yearNow(),
        type: "dynasty",
        text: "I married " + ruler.name + " and joined the royal household in year " + yearNow() + ".",
        tick: tickNow(), importance: 92
    });
    normalizeRoyalHouse();
    return { ok: true, monarch, consort: candidate };
}

export function createRoyalHeir() {
    const monarch = getMonarch();
    if (!monarch) return { ok: false, reason: "no-living-monarch" };
    const consort = activeRoyalConsort(monarch);
    if (!consort || !consort.isRoyalConsort) return { ok: false, reason: "no-royal-marriage" };
    const ruler = ensurePersonProfile(monarch, { role: "king" });
    const partner = ensurePersonProfile(consort, { role: "royal-consort" });
    if (ruler.species !== partner.species || ruler.sex === partner.sex ||
        PERSON_SPECIES[ruler.species]?.reproduction !== "paired") {
        return { ok: false, reason: "incompatible-royal-pair" };
    }
    const family = getFamilySnapshot(monarch.personId);
    const children = (family?.children || []).filter(link => {
        const child = findLivingPerson(link.personId);
        return child?.isRoyal;
    });
    if (children.length >= MAX_ROYAL_CHILDREN) return { ok: false, reason: "dynasty-child-limit" };
    const house = normalizeRoyalHouse();
    if (house.lastHeirYear > 0 && yearNow() - house.lastHeirYear < ROYAL_HEIR_COOLDOWN_YEARS) {
        return { ok: false, reason: "royal-birth-cooldown" };
    }
    if (!canSpawnEntity(TYPE.KNIGHT)) return { ok: false, reason: "entity-capacity" };
    const child = spawnEntity(monarch.x, monarch.y + 1, TYPE.KNIGHT);
    if (!child) return { ok: false, reason: "entity-capacity" };
    child.personId = child.id;
    child.isRoyal = true;
    child.isRoyalHeir = true;
    child.home = { x: monarch.home?.x ?? monarch.x, y: monarch.home?.y ?? monarch.y };
    child.anchor = { ...child.home };
    const person = ensurePersonProfile(child, { role: "royal-child", species: ruler.species });
    person.species = ruler.species;
    person.sex = randInt(0, 2, "royal-dynasty") === 0 ? "female" : "male";
    person.ageYears = 0;
    person.lifeStage = "young";
    person.familyName = ruler.familyName || house.dynastyName.replace(/^House of /, "");
    person.name = person.firstName + " " + person.familyName;
    person.role = "royal-child";
    person.goals = ["family", "security", "duty"];
    person.bornAtYear = yearNow();
    person.lastAgedYear = yearNow();
    person.createdAtTick = tickNow();
    const first = linkParentChild(monarch.personId, child.personId, { kind: "biological", sinceYear: yearNow() });
    const second = linkParentChild(consort.personId, child.personId, { kind: "biological", sinceYear: yearNow() });
    if (!first.ok || !second.ok) {
        state.entities = state.entities.filter(entity => entity !== child);
        return { ok: false, reason: "kinship-link-failed" };
    }
    for (const parent of [monarch, consort]) addPersonMemory(parent, {
        id: "royal-birth:" + child.personId + ":" + parent.personId,
        type: "dynasty",
        text: "Our child " + person.name + " was born in year " + yearNow() + " and entered the succession.",
        tick: tickNow(), importance: 100
    });
    addPersonMemory(child, {
        id: "royal-birth:" + child.personId + ":origin",
        type: "birth",
        text: "I was born into " + house.dynastyName + " in year " + yearNow() + ".",
        tick: tickNow(), importance: 100
    });
    house.lastHeirYear = yearNow();
    house.successionHistory.push({ personId: child.personId, name: person.name, year: yearNow(), law: house.successionLaw });
    if (house.successionHistory.length > 32) house.successionHistory.shift();
    return { ok: true, child };
}

export function setSuccessionLaw(law) {
    if (!Object.hasOwn(SUCCESSION_LAWS, law)) return { ok: false, reason: "invalid-succession-law" };
    normalizeRoyalHouse().successionLaw = law;
    return { ok: true, law };
}

function heirRank(a, b, law) {
    const pa = ensurePersonProfile(a), pb = ensurePersonProfile(b);
    if (law === "malePreference" && pa.sex !== pb.sex) return pa.sex === "male" ? -1 : 1;
    if (law === "elective") {
        const scoreA = (Number(pa.traits?.ambition) || 0) + (Number(pa.traits?.courage) || 0) + (Number(pa.traits?.discipline) || 0);
        const scoreB = (Number(pb.traits?.ambition) || 0) + (Number(pb.traits?.courage) || 0) + (Number(pb.traits?.discipline) || 0);
        if (scoreA !== scoreB) return scoreB - scoreA;
    }
    return Number(pa.bornAtYear || 0) - Number(pb.bornAtYear || 0) ||
        String(a.personId).localeCompare(String(b.personId));
}

export function getSuccessionCandidates() {
    const house = normalizeRoyalHouse();
    const monarch = getMonarch();
    if (!monarch) return [];
    const links = ensurePersonProfile(monarch, { role: "king" }).kinship.children;
    return links.map(link => findLivingPerson(link.personId)).filter(entity => {
        if (!entity?.isRoyal || entity.dead) return false;
        const person = ensurePersonProfile(entity);
        return person.lifeStage === "adult" && person.ageYears >= (PERSON_SPECIES[person.species]?.maturation ?? 16);
    }).sort((a, b) => heirRank(a, b, house.successionLaw));
}

export function resolveRoyalSuccession() {
    const house = normalizeRoyalHouse();
    if (getMonarch()) return null;
    const former = (state.personArchive || []).find(entry => entry.personId === house.monarchId && entry.isKing);
    if (!former) return null;
    const formerKinship = former.person?.kinship;
    const links = Array.isArray(formerKinship?.children) ? formerKinship.children : [];
    const candidates = links.map(link => findLivingPerson(link.personId)).filter(entity => {
        if (!entity?.isRoyal) return false;
        const person = ensurePersonProfile(entity);
        return person.lifeStage === "adult" && person.ageYears >= (PERSON_SPECIES[person.species]?.maturation ?? 16);
    }).sort((a, b) => heirRank(a, b, house.successionLaw));
    const successor = candidates[0];
    if (!successor) return { ok: false, reason: "no-eligible-heir" };
    successor.isKing = true;
    successor.isRoyalHeir = false;
    successor.person.role = "king";
    house.monarchId = successor.personId;
    house.successionHistory.push({
        personId: successor.personId, name: successor.person.name, year: yearNow(), law: house.successionLaw
    });
    if (house.successionHistory.length > 32) house.successionHistory.shift();
    addPersonMemory(successor, {
        id: "succession:" + successor.personId + ":" + yearNow(),
        type: "succession",
        text: "I inherited the crown in year " + yearNow() + " under " + SUCCESSION_LAWS[house.successionLaw] + ".",
        tick: tickNow(), importance: 100
    });
    return { ok: true, successor };
}
