// Royal household, heir creation and deterministic hereditary succession.
import { state } from "../core/state.js";
import { TYPE } from "../core/types.js";
import { random, randInt } from "../core/random.js";
import { spawnEntity, canSpawnEntity } from "../world/entities.js";
import { ensurePersonProfile, addPersonMemory, PERSON_SPECIES } from "./people.js";
import { setPartnership, linkParentChild, getFamilySnapshot } from "./families.js";
import { addLog } from "./events.js";

export const ROYAL_BIRTH_COOLDOWN_YEARS = 3;
export const ROYAL_BIRTH_FOOD_COST = 12;
export const ROYAL_BIRTH_GOLD_COST = 8;

const personIdOf = entity => String(entity?.personId || entity?.person?.id || entity?.id || "");
function livingKing() {
    return state.entities.find(entity => !entity.dead && entity.isKing) || null;
}
function livingPerson(personId) {
    return state.entities.find(entity => !entity.dead && personIdOf(entity) === String(personId || "")) || null;
}
function activePartner(king) {
    const person = ensurePersonProfile(king, { role: "king" });
    const links = person.kinship.partners.filter(link => ["partner", "married"].includes(link.status));
    return links.map(link => livingPerson(link.personId)).find(Boolean) || null;
}
function isCloseRelative(firstId, secondId) {
    const first = getFamilySnapshot(firstId), second = getFamilySnapshot(secondId);
    if (!first || !second) return false;
    const close = new Set([
        ...first.parents.map(link => link.personId),
        ...first.children.map(link => link.personId),
        ...first.siblings.map(link => link.personId)
    ]);
    return close.has(String(secondId)) ||
        second.parents.some(link => link.personId === String(firstId)) ||
        second.children.some(link => link.personId === String(firstId)) ||
        second.siblings.some(link => link.personId === String(firstId));
}

export function getEligibleRoyalConsorts() {
    const king = livingKing();
    if (!king) return [];
    const kingPerson = ensurePersonProfile(king, { role: "king" });
    const species = PERSON_SPECIES[kingPerson.species];
    if (!species || species.reproduction !== "paired") return [];
    return state.entities
        .filter(entity => !entity.dead && entity.type === TYPE.VILLAGER && entity !== king)
        .map(entity => ({ entity, person: ensurePersonProfile(entity) }))
        .filter(({ entity, person }) => {
            if (!entity.personId || !person || person.species !== kingPerson.species || person.sex === kingPerson.sex) return false;
            if (person.lifeStage !== "adult" || person.ageYears < species.maturation || person.ageYears > species.lifespan * 0.65) return false;
            if (isCloseRelative(king.personId, entity.personId)) return false;
            return !person.kinship.partners.some(link => ["partner", "married"].includes(link.status));
        })
        .map(({ entity }) => entity)
        .sort((a, b) => a.person.name.localeCompare(b.person.name));
}
export function appointRoyalConsort(personId) {
    const king = livingKing();
    if (!king) return { ok: false, reason: "no-living-monarch" };
    const candidate = getEligibleRoyalConsorts().find(entity => personIdOf(entity) === String(personId || ""));
    if (!candidate) return { ok: false, reason: "person-not-eligible" };
    const result = setPartnership(king.personId, candidate.personId, { status: "married", sinceYear: state.year });
    if (!result.ok) return result;
    const kingPerson = ensurePersonProfile(king, { role: "king" });
    const consort = ensurePersonProfile(candidate, { role: "royal-consort" });
    consort.role = "royal-consort";
    candidate.isRoyalConsort = true;
    addPersonMemory(king, {
        id: "royal-marriage:" + candidate.personId + ":" + state.year + ":king",
        type: "dynasty",
        text: "I married " + consort.name + " and joined our houses in year " + state.year + ".",
        tick: state.tick, importance: 95
    });
    addPersonMemory(candidate, {
        id: "royal-marriage:" + candidate.personId + ":" + state.year + ":consort",
        type: "dynasty",
        text: "I married King " + kingPerson.name + " in year " + state.year + ".",
        tick: state.tick, importance: 95
    });
    state.dynasty = { ...(state.dynasty || {}), consortId: candidate.personId };
    addLog("THE CROWN WEDS: " + kingPerson.name + " & " + consort.name, "#e8c77b", "dynasty");
    return { ok: true, consort: candidate };
}

export function createRoyalHeir() {
    const king = livingKing();
    if (!king) return { ok: false, reason: "no-living-monarch" };
    const consort = activePartner(king);
    if (!consort) return { ok: false, reason: "no-active-consort" };
    const kingPerson = ensurePersonProfile(king, { role: "king" });
    const consortPerson = ensurePersonProfile(consort, { role: "royal-consort" });
    const species = PERSON_SPECIES[kingPerson.species];
    if (!species || species.reproduction !== "paired" || species.maturation <= 0 ||
        kingPerson.species !== consortPerson.species || kingPerson.sex === consortPerson.sex) {
        return { ok: false, reason: "species-or-parent-compatibility" };
    }
    if (kingPerson.ageYears < species.maturation || consortPerson.ageYears < species.maturation ||
        kingPerson.ageYears > species.lifespan * 0.65 || consortPerson.ageYears > species.lifespan * 0.65) {
        return { ok: false, reason: "parents-outside-reproductive-age" };
    }
    const dynasty = state.dynasty || (state.dynasty = {});
    const lastBirth = Math.max(0, Math.floor(Number(dynasty.lastRoyalBirthYear) || 0));
    if (lastBirth > 0 && state.year - lastBirth < ROYAL_BIRTH_COOLDOWN_YEARS) return { ok: false, reason: "birth-cooldown" };
    if (kingPerson.kinship.children.length >= 64 || consortPerson.kinship.children.length >= 64) return { ok: false, reason: "child-limit" };
    if (Number(state.resources.food) < ROYAL_BIRTH_FOOD_COST || Number(state.resources.gold) < ROYAL_BIRTH_GOLD_COST) {
        return { ok: false, reason: "insufficient-royal-household-resources" };
    }
    if (!canSpawnEntity(TYPE.VILLAGER)) return { ok: false, reason: "entity-capacity" };
    const keep = state.entities.find(entity => !entity.dead && entity.type === TYPE.KEEP);
    const home = keep || king;
    const child = spawnEntity(home.x + randInt(-1, 2, "dynasty"), home.y + randInt(-1, 2, "dynasty"), TYPE.VILLAGER);
    if (!child) return { ok: false, reason: "entity-capacity" };
    child.home = { x: home.x, y: home.y };
    child.anchor = { x: home.x, y: home.y };
    child.householdId = "royal-house";
    child.job = null;
    child.jobRefreshTimer = 999999;
    child.isRoyal = true;
    child.personId = personIdOf(child);
    const childPerson = ensurePersonProfile(child, { role: "royal-heir", species: kingPerson.species });
    childPerson.species = kingPerson.species;
    childPerson.sex = random("dynasty") < 0.5 ? "female" : "male";
    childPerson.ageYears = 0;
    childPerson.lifeStage = "young";
    childPerson.role = "royal-heir";
    childPerson.familyName = kingPerson.familyName || consortPerson.familyName || "Royal";
    childPerson.name = childPerson.firstName + " " + childPerson.familyName;
    childPerson.goals = ["family", "duty", "security"];
    childPerson.bornAtYear = Math.max(1, Math.floor(Number(state.year) || 1));
    childPerson.lastAgedYear = childPerson.bornAtYear;
    childPerson.lastNeedsYear = childPerson.bornAtYear;
    childPerson.createdAtTick = Math.max(0, Math.floor(Number(state.tick) || 0));
    const links = [
        linkParentChild(king.personId, child.personId, { kind: "biological", sinceYear: state.year }),
        linkParentChild(consort.personId, child.personId, { kind: "biological", sinceYear: state.year })
    ];
    if (links.some(link => !link.ok)) {
        state.entities = state.entities.filter(entity => entity !== child);
        return { ok: false, reason: "kinship-link-failed" };
    }
    state.resources.food -= ROYAL_BIRTH_FOOD_COST;
    state.resources.gold -= ROYAL_BIRTH_GOLD_COST;
    dynasty.lastRoyalBirthYear = state.year;
    addPersonMemory(king, {
        id: "royal-birth:" + child.personId + ":king",
        type: "dynasty",
        text: "My heir " + childPerson.name + " was born in year " + state.year + ".",
        tick: state.tick, importance: 100
    });
    addPersonMemory(consort, {
        id: "royal-birth:" + child.personId + ":consort",
        type: "dynasty",
        text: "Our child " + childPerson.name + " was born in year " + state.year + ".",
        tick: state.tick, importance: 100
    });
    addPersonMemory(child, {
        id: "royal-birth:" + child.personId + ":origin",
        type: "birth",
        text: "I was born into the royal house in year " + state.year + ".",
        tick: state.tick, importance: 100
    });
    addLog("A ROYAL HEIR IS BORN: " + childPerson.name, "#e8c77b", "dynasty");
    return { ok: true, child };
}

export function resolveRoyalSuccession(deceasedKingId) {
    const dynasty = state.dynasty || (state.dynasty = {});
    const archived = (state.personArchive || []).find(entry => entry.personId === String(deceasedKingId || ""));
    const kingRecord = archived?.person;
    const children = kingRecord?.kinship?.children || [];
    const candidates = children.map(link => livingPerson(link.personId)).filter(Boolean)
        .map(entity => ({ entity, person: ensurePersonProfile(entity) }))
        .sort((a, b) => b.person.ageYears - a.person.ageYears ||
            a.person.bornAtYear - b.person.bornAtYear ||
            personIdOf(a.entity).localeCompare(personIdOf(b.entity)));
    const heir = candidates[0];
    if (!heir) {
        dynasty.vacantSinceYear = Math.max(1, Number(state.year) || 1);
        dynasty.consortId = null;
        dynasty.regentId = null;
        dynasty.lastSuccession = { year: state.year, from: String(deceasedKingId || ""), to: null, reason: "no-living-direct-heir" };
        addLog("THE THRONE IS VACANT — NO LIVING DIRECT HEIR", "#e9857b", "dynasty");
        return { ok: false, reason: "no-living-direct-heir" };
    }
    const previousKing = state.entities.find(entity => entity.isKing && personIdOf(entity) === String(deceasedKingId));
    if (previousKing) previousKing.isKing = false;
    heir.entity.type = TYPE.KNIGHT;
    heir.entity.isKing = true;
    heir.entity.isRoyal = true;
    heir.entity.isRoyalConsort = false;
    heir.entity.hp = Math.max(300, Number(heir.entity.hp) || 0);
    heir.entity.maxHp = Math.max(300, Number(heir.entity.maxHp) || 0);
    heir.entity.job = "king";
    heir.entity.jobRefreshTimer = 999999;
    heir.person.role = "king";
    dynasty.rulerId = personIdOf(heir.entity);
    dynasty.lastSuccession = { year: state.year, from: String(deceasedKingId || ""), to: dynasty.rulerId, reason: "hereditary" };
    dynasty.vacantSinceYear = null;
    const species = PERSON_SPECIES[heir.person.species];
    const isMinor = species && heir.person.ageYears < species.maturation;
    const formerConsort = livingPerson(dynasty.consortId);
    dynasty.consortId = null;
    if (isMinor) {
        dynasty.regentId = formerConsort ? personIdOf(formerConsort) : null;
        addLog("A MINOR HEIR ASCENDS: " + heir.person.name + (dynasty.regentId ? " · REGENT APPOINTED" : " · REGENCY REQUIRED"), "#e8c77b", "dynasty");
    } else {
        dynasty.regentId = null;
        addLog("THE CROWN PASSES TO " + heir.person.name, "#e8c77b", "dynasty");
    }
    addPersonMemory(heir.entity, {
        id: "succession:" + deceasedKingId + ":" + dynasty.rulerId,
        type: "dynasty",
        text: "I inherited the crown in year " + state.year + ".",
        tick: state.tick, importance: 100
    });
    return { ok: true, heir: heir.entity, regentId: dynasty.regentId };
}

export function getDynastySnapshot() {
    const king = livingKing();
    if (!king) return { king: null, consort: null, heirs: [], eligibleConsorts: [], regent: null, vacantSinceYear: state.dynasty?.vacantSinceYear ?? null };
    const person = ensurePersonProfile(king, { role: "king" });
    const family = getFamilySnapshot(personIdOf(king)) || { children: [], partners: [] };
    const consort = activePartner(king);
    state.dynasty = { ...(state.dynasty || {}), rulerId: personIdOf(king), consortId: consort ? personIdOf(consort) : null };
    const heirs = family.children.map(link => livingPerson(link.personId)).filter(Boolean)
        .map(entity => ({ entity, person: ensurePersonProfile(entity) }))
        .sort((a, b) => b.person.ageYears - a.person.ageYears);
    const regent = livingPerson(state.dynasty?.regentId);
    return {
        king,
        person,
        consort,
        heirs,
        eligibleConsorts: getEligibleRoyalConsorts(),
        regent,
        vacantSinceYear: state.dynasty?.vacantSinceYear ?? null
    };
}

export function normalizeDynasty(input = state.dynasty) {
    const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
    const safeId = value => typeof value === "string" && value.length <= 120 ? value : null;
    const last = source.lastSuccession && typeof source.lastSuccession === "object"
        ? source.lastSuccession : null;
    state.dynasty = {
        rulerId: safeId(source.rulerId),
        consortId: safeId(source.consortId),
        regentId: safeId(source.regentId),
        lastRoyalBirthYear: Math.max(0, Math.min(1000000, Math.floor(Number(source.lastRoyalBirthYear) || 0))),
        vacantSinceYear: source.vacantSinceYear == null ? null : Math.max(1, Math.min(1000000, Math.floor(Number(source.vacantSinceYear) || 1))),
        lastSuccession: last ? {
            year: Math.max(1, Math.min(1000000, Math.floor(Number(last.year) || 1))),
            from: safeId(last.from),
            to: safeId(last.to),
            reason: String(last.reason || "unknown").slice(0, 48)
        } : null
    };
    return state.dynasty;
}
