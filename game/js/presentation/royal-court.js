// Royal court interface: explicit player decisions for marriage, heirs and succession.
import { state } from "../core/state.js";
import {
    SUCCESSION_LAWS, getMonarch, getRoyalMarriageCandidates,
    arrangeRoyalMarriage, createRoyalHeir, setSuccessionLaw, getSuccessionCandidates,
    normalizeRoyalHouse
} from "../systems/royal-dynasty.js";
import { addLog } from "../systems/events.js";
import { renderUI } from "./rendering/ui.js";

const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
})[char]);

function setFeedback(value) { const target = document.getElementById("royal-court-feedback"); if (target) target.textContent = value; }

function message(reason) {
    return ({
        "no-living-monarch":"There is no living monarch to lead the court.",
        "consort-already-recorded":"The royal household already has a recorded consort.",
        "candidate-not-eligible":"That person is not eligible for a royal marriage.",
        "no-royal-marriage":"A royal marriage is required before an heir can be born.",
        "incompatible-royal-pair":"The royal couple cannot have a biological heir under the current species rules.",
        "dynasty-child-limit":"The royal household has reached its recorded child limit.",
        "royal-birth-cooldown":"The royal household must wait before another heir can be born.",
        "entity-capacity":"The world has reached its safe entity capacity.",
        "kinship-link-failed":"The family links could not be recorded; no heir was retained."
    })[reason] || "The royal decision could not be completed.";
}

export function renderRoyalCourt() {
    const root = document.getElementById("royal-court-content");
    if (!root) return;
    const house = normalizeRoyalHouse();
    const monarch = getMonarch();
    if (!monarch) {
        root.innerHTML = '<div class="court-empty">No living monarch is currently recorded. Succession requires a verified royal memorial and an eligible adult heir.</div>';
        return;
    }
    const consortLink = monarch.person.kinship.partners.find(link => link.status === "married");
    const consort = consortLink ? state.entities.find(entity => !entity.dead && entity.personId === consortLink.personId) : null;
    const candidates = getRoyalMarriageCandidates();
    const heirs = getSuccessionCandidates();
    const children = monarch.person.kinship.children.length;
    const lawOptions = Object.entries(SUCCESSION_LAWS).map(([key,label]) =>
        '<option value="' + esc(key) + '"' + (house.successionLaw === key ? ' selected' : '') + '>' + esc(label) + '</option>'
    ).join("");
    const marriage = consort
        ? '<div class="court-consort"><strong>Royal consort</strong><span>' + esc(consort.person.name) + ' · ' + esc(consort.person.species) + ' · ' + Math.floor(consort.person.ageYears) + ' years</span></div>'
        : '<div class="court-marriage-list"><h3>Eligible marriage candidates</h3>' +
          (candidates.length ? candidates.map(person =>
              '<button type="button" class="court-choice" data-royal-marriage="' + esc(person.personId) + '">' +
              '<span><strong>' + esc(person.person.name) + '</strong><small>' + esc(person.person.species) + ' · ' +
              esc(person.person.sex) + ' · age ' + Math.floor(person.person.ageYears) + '</small></span><b>PROPOSE</b></button>'
          ).join("") : '<p class="court-muted">No eligible adult candidates are available. The system will not invent a spouse.</p>') + '</div>';
    const heirButton = consort
        ? '<button type="button" class="court-primary" id="royal-create-heir">WELCOME A ROYAL CHILD</button>'
        : '<button type="button" class="court-primary" disabled>WELCOME A ROYAL CHILD</button>';
    root.innerHTML =
        '<p id="royal-court-feedback" class="court-feedback" role="status" aria-live="polite"></p><section class="court-monarch"><div class="court-monarch-copy"><span class="court-kicker">THE CROWN</span><h3>' + esc(monarch.person.name) +
        '</h3><p>' + esc(house.dynastyName) + ' · ' + esc(monarch.person.species) + ' · age ' + Math.floor(monarch.person.ageYears) +
        '</p><div class="court-stats"><span>YEAR <b>' + state.year + '</b></span><span>CHILDREN <b>' + children + '</b></span><span>ADULT HEIRS <b>' + heirs.length + '</b></span></div></div>' +
        '<img src="assets/royal-court-art.svg" alt="Comic fantasy royal castle and crown" loading="lazy"></section>' +
        '<section class="court-section"><h3>ROYAL HOUSEHOLD</h3>' + marriage + heirButton + '</section>' +
        '<section class="court-section"><h3>SUCCESSION LAW</h3><p class="court-muted">The rule is stored in the realm save and determines the order of eligible adult children.</p>' +
        '<label class="court-select-label" for="royal-succession-law">Crown inheritance</label><select id="royal-succession-law">' + lawOptions + '</select>' +
        '<div class="court-heirs"><h3>ELIGIBLE HEIRS</h3>' +
        (heirs.length ? '<ol>' + heirs.map(person => '<li><strong>' + esc(person.person.name) + '</strong><span>' + esc(person.person.sex) + ' · age ' + Math.floor(person.person.ageYears) + '</span></li>').join("") + '</ol>' :
        '<p class="court-muted">No adult heir is currently eligible. Young royal children remain in the family tree but cannot inherit yet.</p>') +
        '</div></section>';
}

export function setupRoyalCourt() {
    const modal = document.getElementById("royal-court-modal");
    document.getElementById("royal-court-btn")?.addEventListener("click", () => {
        renderRoyalCourt();
        modal?.classList.remove("hidden");
    });
    document.getElementById("royal-court-close")?.addEventListener("click", () => modal?.classList.add("hidden"));
    modal?.addEventListener("click", event => {
        if (event.target === modal) modal.classList.add("hidden");
        const marriage = event.target.closest("[data-royal-marriage]");
        if (marriage) {
            const result = arrangeRoyalMarriage(marriage.dataset.royalMarriage);
            if (!result.ok) {
                setFeedback(message(result.reason));
                return;
            }
            addLog("A ROYAL MARRIAGE: " + result.monarch.person.name + " & " + result.consort.person.name, "#e8c77b", "dynasty");
            renderRoyalCourt(); renderUI();
        }
        if (event.target.closest("#royal-create-heir")) {
            const result = createRoyalHeir();
            if (!result.ok) {
                window.dispatchEvent(new CustomEvent("kac:toast", { detail: message(result.reason) }));
                return;
            }
            addLog("A ROYAL HEIR IS BORN: " + result.child.person.name, "#e8c77b", "dynasty");
            renderRoyalCourt(); renderUI();
        }
    });
    modal?.addEventListener("change", event => {
        if (event.target.id !== "royal-succession-law") return;
        const result = setSuccessionLaw(event.target.value);
        if (!result.ok) return;
        addLog("THE CROWN CHANGED ITS SUCCESSION LAW: " + SUCCESSION_LAWS[result.law], "#d9b878", "politics");
        renderRoyalCourt();
    });
}
