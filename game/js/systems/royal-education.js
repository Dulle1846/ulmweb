// Royal education: a bounded, annual tutelage loop for the existing royal
// children. One appointed Tutor guides at most three students through authored
// curricula; the player holds a coming-of-age audience when study and age are
// both complete. No new RNG stream, no per-tick work, no save-schema bump.
import { state } from "../core/state.js";
import { TYPE } from "../core/types.js";
import { addPersonMemory, ensurePersonProfile, PERSON_SPECIES } from "./people.js";
import { addResource } from "./resources.js";
import { recordResourceMovement } from "./goods-book.js";
import { applyPoliticalEffects } from "./politics.js";
import { getFamilySnapshot } from "./families.js";

export const ROYAL_EDUCATION_LIMIT = 3;
export const ROYAL_EDUCATION_HISTORY_LIMIT = 18;
export const ROYAL_TUTOR_COST = 12;
export const ROYAL_ENROLLMENT_COST = Object.freeze({ gold: 6 });
export const ROYAL_AUDIENCE_COST = Object.freeze({ gold: 18, food: 12 });
export const ROYAL_EDUCATION_STAGES = Object.freeze(["tutelage", "ready", "completed", "dismissed"]);

// Authored curricula. Years are long enough to match a real royal childhood;
// the rewards are fixed, advertised political effects and a named office.
export const ROYAL_CURRICULA = Object.freeze({
    letters: Object.freeze({
        id: "letters", label: "Letters & Chancery", years: 3,
        description: "Dispatches, ledgers and foreign correspondence under the royal seal.",
        office: "Royal Chancellor",
        traits: Object.freeze({ sociability: 4, curiosity: 5, discipline: 3 }),
        effects: Object.freeze({ legitimacy: 1.5, nobility: 0.8, guilds: 0.4 }),
        endowment: Object.freeze({ gold: 6 })
    }),
    stewardship: Object.freeze({
        id: "stewardship", label: "Stewardship & Granaries", years: 4,
        description: "Stores, holdings and the accounts that keep the household fed.",
        office: "Royal Steward",
        traits: Object.freeze({ patience: 5, discipline: 5, ambition: 2 }),
        effects: Object.freeze({ legitimacy: 0.8, commons: 1.4 }),
        endowment: Object.freeze({ food: 10 })
    }),
    command: Object.freeze({
        id: "command", label: "Command & Campaigns", years: 5,
        description: "Drill, supply lines and the judgement to hold a field command.",
        office: "Royal Marshal",
        traits: Object.freeze({ ambition: 5, discipline: 6, patience: 3 }),
        effects: Object.freeze({ legitimacy: 1, nobility: 1.2 }),
        endowment: Object.freeze({ gold: 4, food: 4 })
    }),
    law: Object.freeze({
        id: "law", label: "Law & Templecustom", years: 4,
        description: "Courts, charters and the customs that make a crown lawful.",
        office: "High Justiciar",
        traits: Object.freeze({ piety: 5, compassion: 4, curiosity: 3 }),
        effects: Object.freeze({ legitimacy: 2, clergy: 0.8, commons: 0.6 }),
        endowment: Object.freeze({ gold: 5 })
    })
});

const clamp = (value, min, max) => Math.max(min, Math.min(max, Number.isFinite(Number(value)) ? Number(value) : min));
const integer = (value, min, max) => Math.floor(clamp(value, min, max));
const text = (value, max) => String(value ?? "").slice(0, max);
const personId = entity => String(entity?.personId || entity?.person?.id || entity?.id || "");
const alive = entity => Boolean(entity && !entity.dead);
const maturity = entity => PERSON_SPECIES[ensurePersonProfile(entity)?.species]?.maturation ?? 16;
const yearNow = () => Math.max(1, integer(state.year, 1, 1000000));

function getPerson(id) {
    return state.entities.find(entity => alive(entity) && personId(entity) === String(id)) || null;
}

function curriculum(id) {
    return ROYAL_CURRICULA[String(id)] || null;
}

function normalizeStudent(value, seen) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const id = text(value.id, 80);
    const studentPersonId = text(value.personId, 80);
    const course = curriculum(value.curriculumId);
    if (!id || !studentPersonId || !course || seen.has(studentPersonId)) return null;
    seen.add(studentPersonId);
    const stage = ROYAL_EDUCATION_STAGES.includes(String(value.stage)) ? String(value.stage) : "tutelage";
    const traitsApplied = stage === "ready" || stage === "completed" ? true : Boolean(value.traitsApplied);
    const student = {
        id,
        personId: studentPersonId,
        curriculumId: course.id,
        stage,
        startYear: integer(value.startYear, 1, 1000000),
        lastTutoredYear: integer(value.lastTutoredYear, 0, 1000000),
        yearsTaught: integer(value.yearsTaught, 0, course.years),
        yearsRequired: course.years,
        traitsApplied,
        audienceYear: value.audienceYear === null || value.audienceYear === undefined || value.audienceYear === ""
            ? null : integer(value.audienceYear, 0, 1000000),
        office: text(value.office, 48),
        summary: text(value.summary, 220)
    };
    if (student.lastTutoredYear < student.startYear) student.lastTutoredYear = student.startYear;
    if ((student.stage === "ready" || student.stage === "completed") && student.yearsTaught < student.yearsRequired) {
        student.yearsTaught = student.yearsRequired;
    }
    if (student.stage === "completed" && !student.audienceYear) student.audienceYear = student.startYear;
    return student;
}

function normalizeHistory(value) {
    if (!Array.isArray(value)) return [];
    return value.filter(row => row && typeof row === "object" && !Array.isArray(row)).slice(-ROYAL_EDUCATION_HISTORY_LIMIT).map(row => ({
        year: integer(row.year, 1, 1000000),
        kind: text(row.kind, 32),
        detail: text(row.detail, 160)
    }));
}

export function normalizeRoyalEducationState(value) {
    const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const seen = new Set();
    const students = Array.isArray(source.students)
        ? source.students.map(row => normalizeStudent(row, seen)).filter(Boolean).slice(0, ROYAL_EDUCATION_LIMIT)
        : [];
    const tutorId = typeof source.tutorId === "string" && source.tutorId ? text(source.tutorId, 80) : null;
    return {
        tutorId,
        tutorName: text(source.tutorName, 90),
        appointedYear: integer(source.appointedYear, 0, 1000000),
        students,
        lastUpdateYear: integer(source.lastUpdateYear, 0, 1000000),
        audienceCounter: integer(source.audienceCounter, 0, 1000000),
        history: normalizeHistory(source.history)
    };
}

function educationState() {
    if (!state.royal || typeof state.royal !== "object" || Array.isArray(state.royal)) state.royal = {};
    state.royal.education = normalizeRoyalEducationState(state.royal.education);
    return state.royal.education;
}

function pushHistory(entry, kind, detail) {
    entry.history.push({ year: yearNow(), kind: text(kind, 32), detail: text(detail, 160) });
    entry.history = entry.history.slice(-ROYAL_EDUCATION_HISTORY_LIMIT);
}

function pay(cost, cause, key) {
    for (const [resource, amount] of Object.entries(cost)) {
        const value = Math.floor(Number(amount) || 0);
        if (!value) continue;
        recordResourceMovement(resource, -value, cause, {
            from: { kind: "realm", id: "royal-stores" },
            to: { kind: "dynasty", id: "royal-education" },
            key: key + ":" + resource
        });
        addResource(resource, -value);
    }
}

function credit(cost, cause, key) {
    for (const [resource, amount] of Object.entries(cost)) {
        const value = Math.floor(Number(amount) || 0);
        if (!value) continue;
        recordResourceMovement(resource, value, cause, {
            from: { kind: "dynasty", id: "royal-education" },
            to: { kind: "realm", id: "royal-stores" },
            key: key + ":" + resource
        });
        addResource(resource, value);
    }
}

function affordable(cost) {
    return Object.entries(cost).every(([resource, amount]) =>
        (Number(state.resources?.[resource]) || 0) >= Math.floor(Number(amount) || 0));
}

function livingTutor(entry) {
    return entry.tutorId ? getPerson(entry.tutorId) : null;
}

function royalChildren() {
    const sovereign = state.entities.find(entity => alive(entity) && entity.isKing) || null;
    const kin = sovereign ? getFamilySnapshot(personId(sovereign)) : null;
    const childIds = new Set((kin?.children || []).map(row => String(row.personId)));
    return state.entities.filter(entity => alive(entity) && !entity.isKing && entity.isRoyalFamily &&
        (childIds.has(personId(entity)) || ["royal-child", "heir"].includes(ensurePersonProfile(entity).role)))
        .sort((a, b) => ensurePersonProfile(a).name.localeCompare(ensurePersonProfile(b).name));
}

function tutorCandidates() {
    const sovereign = state.entities.find(entity => alive(entity) && entity.isKing) || null;
    const kin = sovereign ? getFamilySnapshot(personId(sovereign)) : null;
    const close = new Set([
        ...(kin?.parents || []), ...(kin?.children || []), ...(kin?.siblings || [])
    ].map(row => String(row.personId)));
    const current = educationState().tutorId;
    return state.entities.filter(entity => alive(entity) && !entity.isKing && entity.type === TYPE.VILLAGER &&
        entity.personId && ensurePersonProfile(entity).ageYears >= maturity(entity) &&
        personId(entity) !== current && !close.has(personId(entity)))
        .sort((a, b) => ensurePersonProfile(a).name.localeCompare(ensurePersonProfile(b).name))
        .slice(0, 40);
}

function activeStudents(entry) {
    return entry.students.filter(student => student.stage === "tutelage" || student.stage === "ready");
}

export function appointRoyalTutor(id) {
    if (!state.hasStarted) return { ok: false, reason: "realm-not-started" };
    const candidate = tutorCandidates().find(entity => personId(entity) === String(id));
    if (!candidate) return { ok: false, reason: "eligible-tutor-not-found" };
    if (!affordable({ gold: ROYAL_TUTOR_COST })) return { ok: false, reason: "royal-treasury-low" };
    const entry = educationState();
    pay({ gold: ROYAL_TUTOR_COST }, "royal-household", "royal-tutor:" + personId(candidate) + ":" + yearNow());
    const profile = ensurePersonProfile(candidate);
    entry.tutorId = personId(candidate);
    entry.tutorName = profile.name;
    entry.appointedYear = yearNow();
    pushHistory(entry, "tutor-appointed", profile.name + " became royal Tutor.");
    addPersonMemory(candidate, {
        id: "royal-tutor:" + personId(candidate) + ":" + entry.appointedYear,
        type: "dynasty",
        text: "I accepted the royal tutelage in year " + entry.appointedYear + ".",
        tick: state.tick, importance: 88
    });
    return {
        ok: true, tutor: { id: entry.tutorId, name: entry.tutorName },
        message: "ROYAL TUTOR APPOINTED · " + entry.tutorName.toUpperCase()
    };
}

export function enrollRoyalStudent(personIdValue, curriculumId) {
    const course = curriculum(curriculumId);
    if (!course) return { ok: false, reason: "unknown-curriculum" };
    const child = royalChildren().find(entity => personId(entity) === String(personIdValue));
    if (!child) return { ok: false, reason: "royal-child-not-found" };
    const entry = educationState();
    if (!livingTutor(entry)) return { ok: false, reason: "tutor-required" };
    if (entry.students.some(student => student.personId === personId(child) &&
        ["tutelage", "ready"].includes(student.stage))) return { ok: false, reason: "already-in-tutelage" };
    if (activeStudents(entry).length >= ROYAL_EDUCATION_LIMIT) return { ok: false, reason: "tutelage-full" };
    if (!affordable(ROYAL_ENROLLMENT_COST)) return { ok: false, reason: "royal-treasury-low" };
    pay(ROYAL_ENROLLMENT_COST, "royal-household", "royal-enrollment:" + personId(child) + ":" + yearNow());
    const profile = ensurePersonProfile(child);
    const student = {
        id: "royal-student-" + personId(child) + "-" + course.id + "-" + yearNow(),
        personId: personId(child),
        curriculumId: course.id,
        stage: "tutelage",
        startYear: yearNow(),
        lastTutoredYear: yearNow(),
        yearsTaught: 0,
        yearsRequired: course.years,
        traitsApplied: false,
        audienceYear: null,
        office: "",
        summary: profile.name + " began " + course.label + " under " + entry.tutorName + "."
    };
    entry.students.push(student);
    entry.students = entry.students.slice(0, ROYAL_EDUCATION_LIMIT);
    // Enrolment starts the annual clock at this year. A child welcomed in
    // mid-year must not receive several backdated lessons when the next annual
    // task finally runs.
    entry.lastUpdateYear = yearNow();
    pushHistory(entry, "enrolled", profile.name + " · " + course.label);
    addPersonMemory(child, {
        id: "royal-tutelage:" + student.id,
        type: "dynasty",
        text: "I began " + course.label + " under " + entry.tutorName + " in year " + entry.startYear + ".",
        tick: state.tick, importance: 86
    });
    return {
        ok: true, student,
        message: "ENROLLED IN " + course.label.toUpperCase() + " · " + profile.name.toUpperCase()
    };
}

function applyTraits(entity, course) {
    const profile = ensurePersonProfile(entity);
    profile.traits = profile.traits || {};
    for (const [trait, amount] of Object.entries(course.traits)) {
        profile.traits[trait] = clamp((Number(profile.traits[trait]) || 0) + amount, 0, 100);
    }
}

export function updateRoyalEducation() {
    const entry = educationState();
    const year = yearNow();
    if (year <= entry.lastUpdateYear) return { changed: false, advanced: 0, ready: [] };
    let advanced = 0;
    const ready = [];
    for (const student of entry.students) {
        const course = curriculum(student.curriculumId);
        if (!course || student.stage !== "tutelage" || year <= student.lastTutoredYear) continue;
        student.lastTutoredYear = year;
        if (student.yearsTaught < student.yearsRequired) {
            student.yearsTaught = Math.min(student.yearsRequired, student.yearsTaught + 1);
            student.summary = course.label + " · year " + student.yearsTaught + " of " + student.yearsRequired + " taught.";
            advanced++;
        }
        if (student.yearsTaught >= student.yearsRequired) {
            const entity = getPerson(student.personId);
            if (entity && ensurePersonProfile(entity).ageYears >= maturity(entity)) {
                if (!student.traitsApplied) {
                    applyTraits(entity, course);
                    student.traitsApplied = true;
                }
                student.stage = "ready";
                student.summary = ensurePersonProfile(entity).name + " has finished " + course.label +
                    " and is ready for a coming-of-age audience.";
                ready.push(student.id);
            } else {
                student.summary = course.label + " is complete; the student has not yet come of age.";
            }
        }
    }
    entry.lastUpdateYear = year;
    if (advanced) pushHistory(entry, "annual-tutelage", advanced + " student(s) taught in year " + year + ".");
    return { changed: true, advanced, ready };
}

export function holdRoyalAudience(id) {
    if (!state.hasStarted) return { ok: false, reason: "realm-not-started" };
    const entry = educationState();
    const student = entry.students.find(row => row.id === String(id) && row.stage === "ready");
    if (!student) return { ok: false, reason: "audience-not-ready" };
    const course = curriculum(student.curriculumId);
    const entity = getPerson(student.personId);
    if (!course || !entity) return { ok: false, reason: "student-unavailable" };
    if (ensurePersonProfile(entity).ageYears < maturity(entity)) return { ok: false, reason: "student-not-adult" };
    if (!affordable(ROYAL_AUDIENCE_COST)) return { ok: false, reason: "royal-treasury-low" };
    pay(ROYAL_AUDIENCE_COST, "royal-household", "royal-audience:" + student.id + ":" + yearNow());
    credit(course.endowment, "royal-household", "royal-office-endowment:" + student.id + ":" + yearNow());
    applyPoliticalEffects(course.effects);
    student.stage = "completed";
    student.audienceYear = yearNow();
    student.office = course.office;
    student.summary = ensurePersonProfile(entity).name + " was received at court and named " + course.office + ".";
    entry.audienceCounter = Math.min(1000000, entry.audienceCounter + 1);
    ensurePersonProfile(entity).role = course.office;
    addPersonMemory(entity, {
        id: "royal-audience:" + student.id,
        type: "dynasty",
        text: "I came of age in year " + student.audienceYear + " and was named " + course.office + ".",
        tick: state.tick, importance: 100
    });
    pushHistory(entry, "audience", student.summary);
    return {
        ok: true, student, office: course.office, effects: { ...course.effects },
        endowment: { ...course.endowment }, message: "COMING-OF-AGE AUDIENCE · " + course.office.toUpperCase()
    };
}

export function dismissRoyalStudent(id) {
    const entry = educationState();
    const student = entry.students.find(row => row.id === String(id) && row.stage === "tutelage");
    if (!student) return { ok: false, reason: "tutelage-not-dismissible" };
    student.stage = "dismissed";
    student.summary = "Tutelage was ended before the audience.";
    pushHistory(entry, "dismissed", student.summary);
    return { ok: true, student, message: "TUTELAGE ENDED · " + student.personId.toUpperCase() };
}

export function getRoyalEducationSnapshot() {
    const entry = educationState();
    const tutor = livingTutor(entry);
    const students = entry.students.map(student => {
        const entity = getPerson(student.personId);
        const course = curriculum(student.curriculumId);
        const profile = entity ? ensurePersonProfile(entity) : null;
        const adult = Boolean(profile && profile.ageYears >= (PERSON_SPECIES[profile.species]?.maturation ?? 16));
        return {
            ...student,
            name: profile?.name || "Unknown student",
            age: profile ? Math.floor(Number(profile.ageYears) || 0) : 0,
            species: profile?.species || "human",
            adult,
            courseLabel: course?.label || student.curriculumId,
            officeLabel: course?.office || "Court office",
            progress: Math.round((student.yearsTaught / Math.max(1, student.yearsRequired)) * 100),
            canAudience: student.stage === "ready" && adult,
            canDismiss: student.stage === "tutelage"
        };
    });
    return {
        tutorId: entry.tutorId,
        tutorName: tutor ? ensurePersonProfile(tutor).name : (entry.tutorName || ""),
        tutorPresent: Boolean(tutor),
        appointedYear: entry.appointedYear,
        tutorCost: ROYAL_TUTOR_COST,
        enrolledCost: { ...ROYAL_ENROLLMENT_COST },
        audienceCost: { ...ROYAL_AUDIENCE_COST },
        candidates: tutorCandidates().map(entity => ({
            id: personId(entity), name: ensurePersonProfile(entity).name,
            age: Math.floor(Number(ensurePersonProfile(entity).ageYears) || 0)
        })),
        children: royalChildren().filter(entity => !entry.students.some(student =>
            student.personId === personId(entity) && ["tutelage", "ready"].includes(student.stage)))
            .map(entity => ({
                id: personId(entity), name: ensurePersonProfile(entity).name,
                age: Math.floor(Number(ensurePersonProfile(entity).ageYears) || 0)
            })),
        curricula: Object.values(ROYAL_CURRICULA).map(course => ({ ...course })),
        students,
        active: activeStudents(entry).length,
        limit: ROYAL_EDUCATION_LIMIT,
        ready: students.filter(student => student.canAudience).length,
        completed: students.filter(student => student.stage === "completed").length,
        lastUpdateYear: entry.lastUpdateYear,
        history: entry.history.map(row => ({ ...row }))
    };
}
