// Player-facing world map: the four neighbouring regions, standing caravans
// and the frontiers between them. The panel is a read-only view of the single
// world-map system; every button calls the same bounded annual state machine.
import { getWorldMapSnapshot } from "../systems/world-map.js";
import { getCampaignSnapshot } from "../systems/feudal-campaigns.js";

const esc = value => String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[character]));
const amount = value => {
    const rounded = Math.round((Number(value) || 0) * 100) / 100;
    const [whole, fraction] = String(rounded).split(".");
    return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (fraction ? "." + fraction : "");
};
const integer = value => amount(Math.floor(Number(value) || 0));
const costText = cost => Object.entries(cost || {})
    .filter(([, value]) => Number(value) > 0)
    .map(([key, value]) => Math.floor(Number(value)) + " " + key.toUpperCase())
    .join(" · ");

function frontierHint(realm) {
    if (realm.treaty === "war") {
        return "At war. No caravan may cross, and every year at war feeds this frontier. Raise the watch or make peace before pressure reaches " + 58 + " and raiders cross.";
    }
    if (realm.pressure >= 65) return "Contested ground. Raiders are already crossing: stores are being taken and the court's trust is falling. A higher watch, more nearby settlements or a trade route will pull pressure down.";
    if (realm.pressure >= 45) return "Tense. The border is priced into the realm's existing border levy, and a raid is possible once pressure passes " + 58 + ". Watch levels and active caravans are the quiet ways to ease it.";
    if (realm.pressure >= 25) return "Watchful. Nothing has crossed this year, but the frontier still leans on the realm. A standing route both moves goods and lowers pressure by 3.";
    return "Calm. The treaty, nearby settlements and the watch are holding this frontier. The route here can still move goods every year.";
}

function frontierCard(realm, snapshot) {
    const affordableWatch = Math.max(0, Number(snapshot.costs.watch) || 0);
    const gold = Number(snapshot.inventory?.gold) || 0;
    const watchButtons = Array.from({ length: snapshot.limits.watch + 1 }, (_, level) => {
        const cost = level > realm.watch ? (level - realm.watch) * affordableWatch : 0;
        const disabled = level === realm.watch || (cost > 0 && gold < cost);
        return '<button type="button" class="world-watch__step' + (level === realm.watch ? " is-current" : "") +
            '" data-command="world-watch" data-value="' + esc(realm.id) + '" data-level="' + level + '"' +
            (disabled ? " disabled" : "") + ' aria-pressed="' + (level === realm.watch ? "true" : "false") + '">' +
            level + '<small>' + (level === realm.watch ? "NOW" : cost > 0 ? cost + "G" : "FREE") + '</small></button>';
    }).join("");
    const routeReady = snapshot.ready && realm.treaty !== "war" &&
        snapshot.routes.length < snapshot.limits.routes &&
        gold >= snapshot.costs.route.gold && (Number(snapshot.inventory?.wood) || 0) >= snapshot.costs.route.wood;
    const seatOptions = snapshot.seats.map(seat =>
        '<option value="' + esc(seat.id) + '">' + esc(seat.name) + ' · depot ' + amount(seat.stores.wood) + ' wood / ' + amount(seat.stores.stone) + ' stone</option>'
    ).join("");
    const routeForm = snapshot.ready
        ? '<div class="world-order">' +
            '<label>DEPOT<select id="world-seat-' + esc(realm.id) + '" aria-label="Choose a settlement depot for the ' + esc(realm.region) + ' route">' + seatOptions + '</select></label>' +
            '<label>GOODS<select id="world-resource-' + esc(realm.id) + '" aria-label="Choose the goods for the ' + esc(realm.region) + ' route">' +
                '<option value="wood">Wood</option><option value="stone">Stone</option><option value="food">Food · royal granary</option>' +
            '</select></label>' +
            '<label>FLOW<select id="world-direction-' + esc(realm.id) + '" aria-label="Choose the direction for the ' + esc(realm.region) + ' route">' +
                '<option value="import">Import into the depot</option><option value="export">Export from the depot</option>' +
            '</select></label>' +
            '<button type="button" data-command="world-route-open" data-value="' + esc(realm.id) + '"' + (routeReady ? "" : " disabled") + '>OPEN ROUTE · ' +
                costText(snapshot.costs.route) + '</button>' +
        '</div>'
        : '<p class="world-frontier__note">No settlement seat exists yet. Complete a keep or town hall and its owners will appear here as a depot.</p>';
    return '<article class="world-frontier world-frontier--' + esc(realm.band) + '" data-world-realm="' + esc(realm.id) + '">' +
        '<header class="world-frontier__head"><div><span class="world-frontier__region">' + esc(realm.region) + ' · ' + esc(realm.specialty) + '</span><h4>' + esc(realm.name) + '</h4><p>' + esc(realm.ruler) + '</p></div>' +
            '<span class="world-frontier__band">' + esc(realm.bandLabel) + ' · ' + realm.pressure + '</span></header>' +
        '<div class="world-frontier__stats">' +
            '<span>TREATY<b>' + esc(String(realm.treaty).toUpperCase()) + '</b></span>' +
            '<span>RELATION<b>' + realm.relation + '</b></span>' +
            '<span>TRUST<b>' + realm.trust + '</b></span>' +
            '<span>NEARBY SEATS<b>' + realm.nearby + '</b></span>' +
            '<span>WATCH<b>' + realm.watch + ' / ' + snapshot.limits.watch + '</b></span>' +
            '<span>INCIDENTS<b>' + realm.incidents + '</b></span>' +
        '</div>' +
        '<div class="command-meter"><span>FRONTIER PRESSURE</span><i><b style="width:' + Math.max(0, Math.min(100, realm.pressure)) + '%"></b></i><strong>' + realm.pressure + '</strong></div>' +
        '<p class="world-frontier__hint">' + esc(frontierHint(realm)) + '</p>' +
        '<div class="world-frontier__watch"><span>FRONTIER WATCH</span><div class="world-watch">' + watchButtons + '</div></div>' +
        routeForm +
        '<p class="world-frontier__note">' + realm.routes + ' standing route' + (realm.routes === 1 ? "" : "s") + ' · ' +
            realm.activeRoutes + ' ready · ' + integer(realm.routeDelivered) + ' goods delivered · each watch level costs ' + snapshot.costs.watch + ' gold and cuts pressure by 9.</p>' +
        '</article>';
}

function kingdomCard(kingdom, snapshot) {
    return '<article class="world-kingdom' + (kingdom.isCrown ? " is-crown" : "") + '" data-world-kingdom="' + esc(kingdom.id) + '">' +
        '<header><span>' + (kingdom.isCrown ? "THE CROWN" : "NEIGHBOURING KINGDOM") + '</span><h4>' + esc(kingdom.name) + '</h4><p>' + esc(kingdom.ruler) + '</p></header>' +
        '<div><span>PROVINCES<b>' + kingdom.regionCount + '</b></span><span>CONTROL<b>' + kingdom.control + '</b></span><span>CONTESTED<b>' + kingdom.contested + '</b></span></div>' +
        '<small>' + (kingdom.isCrown
            ? 'Your charters, fields and border marches. Crown provinces pay their annual yield directly into the royal stores.'
            : 'A foreign crown with its own provinces, garrisons and border interests. Its regions can change hands when war or weak control opens a claim.') + '</small>' +
    '</article>';
}

function charterSection(region) {
    if (region.ownerKind !== "crown") return "";
    const petition = region.petitionTier > 0;
    const grantLabel = region.grantCharterPetition ? "GRANT PETITION" : region.autonomy === 1 ? "GRANT FREE CHARTER" : "GRANT CHARTER";
    const grant = region.grantCharterCost
        ? '<button type="button" data-command="world-charter-grant" data-value="' + esc(region.id) + '"' +
            (region.canGrantCharter ? "" : " disabled") + '>' + grantLabel + ' · ' + costText(region.grantCharterCost) + '</button>'
        : '';
    const refuse = petition
        ? '<button type="button" data-command="world-petition-refuse" data-value="' + esc(region.id) + '"' +
            (region.canRefusePetition ? "" : " disabled") + '>REFUSE PETITION</button>'
        : '';
    const revoke = !petition && region.autonomy > 0
        ? '<button type="button" data-command="world-charter-revoke" data-value="' + esc(region.id) + '"' +
            (region.canRevokeCharter ? "" : " disabled") + '>REVOKE CHARTER</button>'
        : '';
    const reason = petition
        ? (region.canRefusePetition || region.canGrantCharter ? "ANSWER THE PETITION" : esc(region.refusePetitionReason || "PETITION LOCKED"))
        : region.autonomy >= 2
            ? (region.canRevokeCharter ? "MAXIMUM AUTONOMY · A FREE PROVINCE" : esc(region.revokeCharterReasonLabel || "MAXIMUM AUTONOMY · A FREE PROVINCE"))
            : region.canGrantCharter ? "A CHARTER BINDS THE PROVINCE TO THE CROWN" : esc(region.grantCharterReasonLabel || "NO CHARTER AVAILABLE");
    const petitionNote = petition
        ? '<p class="world-province__petition">PETITION · ' + esc(String(region.petitionLabel).toUpperCase()) + ' · YEAR ' + region.petitionYear +
            '<br>Loyalty has earned this province a claim to more self-rule. Granting keeps more of its levy at home; refusing costs 5 loyalty.</p>'
        : '';
    const actionButtons = grant + refuse + revoke;
    return '<div class="world-province__charter">' +
        '<div class="world-province__charter-head"><span>AUTONOMY</span><b>' + esc(String(region.autonomyLabel).toUpperCase()) + '</b></div>' +
        '<div class="world-province__charter-stats"><span>CROWN LEVY<b>+' + integer(region.levy) + 'G</b></span>' +
            '<span>KEPT AT HOME<b>+' + integer(Math.max(0, region.levyBase - region.levy)) + 'G</b></span></div>' +
        petitionNote +
        (actionButtons ? '<div class="world-province__charter-actions">' + actionButtons + '</div>' : '') +
        '<small class="world-province__charter-note">' + reason + '</small>' +
    '</div>';
}

function regionCard(region, snapshot) {
    const claim = region.ownerKind === "crown"
        ? '<p class="world-province__note is-crown">CROWN PROVINCE · ' + region.yield + ' ' + esc(region.resource.toUpperCase()) + ' A YEAR</p>' + charterSection(region)
        : '<div class="world-province__claim">' +
            '<button type="button" data-command="world-region-claim" data-value="' + esc(region.id) + '"' + (region.canClaim ? "" : " disabled") + '>PRESS CLAIM · ' + costText(region.claimCost) + '</button>' +
            '<small>' + (region.canClaim ? "CHANCE " + region.claimChance + "%" : esc(region.claimReasonLabel || "NO CLAIM AVAILABLE")) + '</small>' +
        '</div>';
    const contested = region.contested
        ? '<p class="world-province__contest">CONTESTED BY ' + esc(String(region.contestedName).toUpperCase()) + ' · control is below ' + 38 + '</p>'
        : '';
    return '<article class="world-province world-province--' + esc(region.ownerId) + (region.contested ? " is-contested" : "") + '" data-world-province="' + esc(region.id) + '">' +
        '<header><div><span class="world-province__owner">' + esc(region.ownerName) + ' · ' + esc(region.terrain.toUpperCase()) + '</span><h4>' + esc(region.name) + '</h4></div>' +
            '<span class="world-province__yield">+' + region.yield + ' ' + esc(region.resource.toUpperCase()) + '</span></header>' +
        '<p class="world-province__brief">' + esc(region.description) + '</p>' +
        '<div class="world-province__stats"><span>CONTROL<b>' + region.control + '</b></span><span>LOYALTY<b>' + region.loyalty + '</b></span>' +
            '<span>GARRISON<b>' + region.garrison + '</b></span><span>BORDERS<b>' + region.neighbours.length + '</b></span></div>' +
        '<div class="command-meter"><span>PROVINCE CONTROL</span><i><b style="width:' + Math.max(0, Math.min(100, region.control)) + '%"></b></i><strong>' + region.control + '</strong></div>' +
        contested + claim +
        '<p class="world-province__note">' + (region.lastChangeYear
            ? 'Last changed hands in year ' + region.lastChangeYear + ' · ' + region.changes + ' recorded change' + (region.changes === 1 ? "" : "s") + '.'
            : 'No recorded change of hands.') + ' · ' + region.yield + ' ' + esc(region.resource) + ' a year at current control.</p>' +
    '</article>';
}

function routeRow(route, snapshot) {
    const direction = route.direction === "import" ? "IMPORT" : "EXPORT";
    const flow = route.direction === "import"
        ? "crown pays " + route.cost + " gold for " + route.lot + " " + route.resource
        : "partner pays " + route.payout + " gold for " + route.lot + " " + route.resource;
    return '<article class="world-route world-route--' + esc(route.status) + '" data-world-route="' + esc(route.id) + '">' +
        '<div class="world-route__head"><div><span>' + direction + ' · ' + esc(route.resource.toUpperCase()) + ' · ' + esc(route.region.toUpperCase()) + '</span><strong>' +
            esc(route.seatName) + ' ↔ ' + esc(route.realmName) + '</strong><small>' + esc(flow) + ' · since year ' + route.sinceYear + '</small></div>' +
            '<span class="world-route__status">' + esc(route.statusLabel) + '</span></div>' +
        '<p class="world-route__result">' + esc(route.lastResult || "Waiting for the first annual caravan.") + '</p>' +
        '<div class="world-route__stats"><span>DELIVERED<b>' + integer(route.delivered) + '</b></span><span>EARNED<b>' + integer(route.earned) + 'G</b></span>' +
            '<span>SPENT<b>' + integer(route.goldSpent) + 'G</b></span><span>STALLED<b>' + integer(route.stalls) + '</b></span></div>' +
        '<button type="button" class="world-route__close" data-command="world-route-close" data-value="' + esc(route.id) + '">CLOSE ROUTE</button>' +
    '</article>';
}

function provinceMarkup(snapshot) {
    return snapshot.regions.map((region, index) => {
        const cx = region.anchor.x * 100, cy = region.anchor.y * 64;
        const rx = 6.2, ry = 3.8;
        const offset = (index % 6) * 0.22;
        const points = Array.from({ length: 6 }, (_, point) => {
            const angle = (Math.PI / 3) * point + offset;
            return (cx + Math.cos(angle) * rx).toFixed(1) + "," + (cy + Math.sin(angle) * ry).toFixed(1);
        }).join(" ");
        return '<g class="world-map__province world-map__province--' + esc(region.ownerId) + (region.contested ? " is-contested" : "") +
            '" data-world-map-province="' + esc(region.id) + '"><polygon points="' + points + '"></polygon>' +
            '<title>' + esc(region.name + " · " + region.ownerName + " · control " + region.control + " · " + region.yield + " " + region.resource + " a year · " + region.autonomyLabel.toLowerCase()) + '</title></g>';
    }).join("");
}

function routeLines(snapshot) {
    const realms = snapshot.realms;
    return snapshot.routes.map((route, index) => {
        const seat = snapshot.seats.find(row => row.id === route.seatId);
        const realm = realms.find(row => row.id === route.realmId);
        if (!seat || !realm) return "";
        const offset = ((index % 3) - 1) * 0.9;
        const x1 = seat.x * 100, y1 = seat.y * 64;
        const x2 = realm.anchor.x * 100 + offset, y2 = realm.anchor.y * 64;
        const closed = route.status === "closed";
        const stalled = !["open", "closed"].includes(route.status);
        return '<line class="world-map__route' + (closed ? " is-closed" : stalled ? " is-stalled" : "") +
            '" x1="' + x1.toFixed(1) + '" y1="' + y1.toFixed(1) + '" x2="' + x2.toFixed(1) + '" y2="' + y2.toFixed(1) +
            '" marker-end="url(#world-map-arrow)"><title>' + esc((route.direction === "import" ? "Import " : "Export ") + route.lot + " " + route.resource + " · " + route.seatName + " ↔ " + route.realmName) + '</title></line>';
    }).join("");
}

function frontierSymbols(realms) {
    return realms.map(realm => {
        const cx = realm.anchor.x * 100, cy = realm.anchor.y * 64;
        const radius = 5 + Math.max(0, Math.min(100, realm.pressure)) * 0.11;
        const label = String(realm.region).split(" ")[0].toUpperCase();
        // Keep every label inside the viewBox: the southern anchor sits near
        // the bottom edge, so its label goes above the circle while the other
        // three sit below it.
        const labelOffset = realm.anchor.y > 0.8 ? -(radius + 2.4) : radius + 4.2;
        return '<g class="world-map__realm world-map__realm--' + esc(realm.band) + '" data-world-map-realm="' + esc(realm.id) + '">' +
            '<circle class="world-map__frontier" cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="' + radius.toFixed(1) + '"></circle>' +
            '<path class="world-map__keep" d="M ' + (cx - 2).toFixed(1) + ' ' + (cy - 2).toFixed(1) + ' L ' + (cx + 2).toFixed(1) + ' ' + (cy - 2).toFixed(1) +
                ' L ' + (cx + 2).toFixed(1) + ' ' + (cy + 2).toFixed(1) + ' L ' + (cx - 2).toFixed(1) + ' ' + (cy + 2).toFixed(1) + ' Z"></path>' +
            '<text x="' + cx.toFixed(1) + '" y="' + (cy + labelOffset).toFixed(1) + '">' + esc(label) + '</text>' +
            '<title>' + esc(realm.name + " · " + realm.region + " · " + realm.bandLabel + " " + realm.pressure) + '</title></g>';
    }).join("");
}

function seatSymbols(snapshot) {
    return snapshot.seats.map(seat =>
        '<g class="world-map__seat" data-world-map-seat="' + esc(seat.id) + '">' +
            '<circle class="world-map__seat-halo" cx="' + (seat.x * 100).toFixed(1) + '" cy="' + (seat.y * 64).toFixed(1) + '" r="3.1"></circle>' +
            '<circle cx="' + (seat.x * 100).toFixed(1) + '" cy="' + (seat.y * 64).toFixed(1) + '" r="1.5"></circle>' +
            '<title>' + esc(seat.name + " · depot " + amount(seat.stores.wood) + " wood / " + amount(seat.stores.stone) + " stone · " + amount(seat.treasury.gold) + " gold") + '</title>' +
        '</g>'
    ).join("");
}

function mapGrid() {
    return Array.from({ length: 7 }, (_, index) => {
        const x = 10 + index * 13.33;
        return '<line class="world-map__grid" x1="' + x.toFixed(1) + '" y1="0" x2="' + x.toFixed(1) + '" y2="64"></line>';
    }).join("") + Array.from({ length: 4 }, (_, index) => {
        const y = 13 + index * 13;
        return '<line class="world-map__grid" x1="0" y1="' + y + '" x2="100" y2="' + y + '"></line>';
    }).join("");
}

// `layers` lets the staged panel precompute each SVG layer in its own part.
// The plain path computes them here and still receives one identical string.
function mapFigure(snapshot, layers = null) {
    const routes = snapshot.routes;
    const realms = snapshot.realms;
    const provinceLayer = layers?.province ?? provinceMarkup(snapshot);
    const routeMarkup = layers?.routes ?? routeLines(snapshot);
    const frontierMarkup = layers?.frontiers ?? frontierSymbols(realms);
    const seatMarkup = layers?.seats ?? seatSymbols(snapshot);
    const grid = layers?.grid ?? mapGrid();
    const campLabel = routes.length === 0
        ? "No standing caravan yet. Open a route from a settlement depot to one of the four regions below."
        : routes.length + " standing caravan" + (routes.length === 1 ? "" : "s") + " · dashed lines are closed or stalled.";
    const seatSummary = snapshot.seats.length
        ? snapshot.seats.map(seat => seat.name).join(" · ")
        : "No settlement seat recorded";
    const provinceSummary = snapshot.kingdoms.map(kingdom =>
        kingdom.name + " owns " + kingdom.regionCount + " province" + (kingdom.regionCount === 1 ? "" : "s")
    ).join("; ");
    return '<figure class="world-map">' +
        '<svg class="world-map__canvas" viewBox="0 0 100 64" role="img" aria-labelledby="world-map-title world-map-desc">' +
            '<title id="world-map-title">Schematic world map of the four neighbouring regions and the crown\'s settlements</title>' +
            '<desc id="world-map-desc">Compass map. ' + esc(seatSummary) + '. ' + esc(provinceSummary) + '. ' + esc(campLabel) + '</desc>' +
            '<defs><marker id="world-map-arrow" markerWidth="2.6" markerHeight="2.6" refX="2" refY="1.3" orient="auto"><path d="M0,0 L2.6,1.3 L0,2.6 Z"></path></marker></defs>' +
            '<rect class="world-map__sea" x="0" y="0" width="100" height="64" rx="2"></rect>' + grid +
            provinceLayer + frontierMarkup + routeMarkup + seatMarkup +
        '</svg>' +
        '<figcaption><span>SCHEMATIC · REAL SETTLEMENT COORDINATES, COMPASS REGIONS</span><span>' + esc(campLabel) + '</span>' +
            '<span>DEPOTS · ' + esc(seatSummary) + '</span></figcaption>' +
    '</figure>';
}

function chunkRows(rows, size) {
    const chunks = [];
    for (let index = 0; index < rows.length; index += size) chunks.push(rows.slice(index, index + size));
    return chunks;
}

// The plain renderer still returns one string; the same ordered parts are handed
// to the staged hydrator. A part may hand over more thunks, so snapshots are
// taken inside the scheduled work rather than in the panel-click task.
function resolvePanelParts(parts) {
    let html = "";
    for (let index = 0; index < parts.length; index++) {
        const value = typeof parts[index] === "function" ? parts[index]() : parts[index];
        const raw = typeof value === "string" ? value
            : typeof value?.html === "function" ? value.html() : value?.html;
        if (Array.isArray(value?.more) && value.more.length) parts.splice(index + 1, 0, ...value.more);
        html += typeof raw === "string" ? raw : "";
    }
    return html;
}

function theatreCard(entry) {
    return '<article class="command-policy" data-world-campaign="' + esc(entry.id) + '"><div>' +
        '<span class="command-ribbon">' + esc(entry.stageLabel) + ' · ' + esc(entry.aimLabel) + '</span>' +
        '<strong>' + esc(entry.theatreName) + '</strong>' +
        '<p>' + esc(entry.houseName || "Crown alone") + ' · power ' + entry.power + ' · risk ' + entry.risk + '/100 · ' +
        entry.progressPercent + '% complete · ' + entry.daysRemaining + ' days to settlement.</p>' +
        '<small>A theatre is a real neighbouring kingdom; its control and contest set the contract supply and risk.</small></div>' +
        '<button type="button" data-kac-panel="military">OPEN MILITARY</button></article>';
}

function worldHistoryEntry(entry) {
    return '<div><span>' + esc(String(entry.kind).toUpperCase()) + ' · YEAR ' + entry.year + '</span><p>' + esc(entry.summary) + '</p></div>';
}

// The world deck builds a schematic map, two kingdom/province grids, complex
// frontier cards, route records and a campaign list. All snapshot reads and
// card markup live in thunks: the producer itself only wires bounded part
// descriptors, and each descriptor holds at most two complex cards.
export function renderWorldMapPanelParts() {
    const late = { world: null, campaign: null, routesOpen: false, map: {} };
    const readyWorld = () => late.world || (late.world = getWorldMapSnapshot());
    const readyCampaign = () => late.campaign || (late.campaign = getCampaignSnapshot());
    return [
        // Snapshot acquisition, the static intro and the snapshot-driven
        // summary are separate prepared parts. The old opening part did all
        // three in one 11 ms task on the throttled renderer.
        () => { readyWorld(); return ""; },
        () => '<div class="world-map-panel" data-world-map-panel>' +
            '<div class="command-panel-intro"><span>THE WORLD BEYOND THE REALM</span><h3>Kingdoms, provinces, trade routes &amp; frontiers</h3>' +
                '<p>Five crowns hold ten provinces. Your crown begins with the heartland and its old chartered march; the four neighbouring powers hold the rest. A province pays its yield into the royal stores while the crown holds it, and can be pressed once a year where a crown border meets a foreign province. A charter trades part of its yearly crown levy for local loyalty and steadier borders; once a province feels secure it petitions for the next tier, and ignoring that petition costs loyalty. Settlements are still your real seats, roads and stores; a standing caravan moves goods through the same market stock and diplomatic ledger, and a frontier can still put raiders over the border.</p></div>',
        () => {
            const snapshot = late.world;
            return '<div class="command-summary">' +
                '<div><small>SEATS</small><strong>' + snapshot.seats.length + '</strong></div>' +
                '<div><small>CROWN PROVINCES</small><strong>' + snapshot.totals.crownProvinces + ' / ' + snapshot.limits.provinces + '</strong></div>' +
                '<div><small>PROVINCE YIELD</small><strong>+' + integer(snapshot.totals.annualYield) + '</strong></div>' +
                '<div><small>CHARTERS</small><strong>' + snapshot.totals.charteredProvinces + ' / ' + snapshot.totals.crownProvinces + '</strong></div>' +
                '<div><small>CROWN LEVY</small><strong>+' + integer(snapshot.totals.annualLevy) + 'G</strong></div>' +
                '<div><small>OPEN PETITIONS</small><strong>' + snapshot.totals.openPetitions + '</strong></div>' +
                '<div><small>STANDING ROUTES</small><strong>' + snapshot.routes.length + ' / ' + snapshot.limits.routes + '</strong></div>' +
                '<div><small>GOODS MOVED</small><strong>' + integer(snapshot.totals.delivered) + '</strong></div>' +
                '<div><small>TRADE EARNED</small><strong>' + integer(snapshot.totals.earned) + 'G</strong></div>' +
                '<div><small>BORDER INCIDENTS</small><strong>' + integer(snapshot.totals.incidents) + '</strong></div>' +
                '<div><small>WATCH LEVELS</small><strong>' + snapshot.totals.watchLevels + ' / ' + (snapshot.limits.watch * snapshot.realms.length) + '</strong></div>' +
            '</div>';
        },
        () => {
            const snapshot = readyWorld();
            return '<div class="world-map__legend" aria-label="Frontier pressure bands">' +
                '<span class="is-calm">CALM · 0–24</span><span class="is-watchful">WATCHFUL · 25–44</span>' +
                '<span class="is-tense">TENSE · 45–64</span><span class="is-contested">CONTESTED · 65+</span>' +
                '<span class="world-map__legend-note">A raid can cross from 58 unless the frontier is certain above 75.</span></div>' +
                '<div class="world-map__kingdoms" aria-label="Province owners">' +
                snapshot.kingdoms.map(kingdom => '<span class="world-map__kingdom-chip world-map__kingdom-chip--' + esc(kingdom.id) + '"><i></i>' + esc(kingdom.name) + ' <b>' + kingdom.regionCount + '</b></span>').join("") +
                '<span class="world-map__kingdom-chip is-contested"><i></i>CONTESTED BORDER</span>' +
                '</div>';
        },
        // The 6.3k-character map used to be computed in one 15 ms part. Each SVG
        // layer is now prepared separately; the final part only joins the
        // cached strings, so both renderers emit the same bytes.
        () => { late.map.province = provinceMarkup(readyWorld()); return ""; },
        () => { late.map.grid = mapGrid(); return ""; },
        () => { late.map.frontiers = frontierSymbols(readyWorld().realms); return ""; },
        () => { late.map.routes = routeLines(readyWorld()); return ""; },
        () => { late.map.seats = seatSymbols(readyWorld()); return ""; },
        () => mapFigure(readyWorld(), late.map),
        () => {
            const snapshot = readyWorld();
            return {
                html: '<div class="command-section-title">KINGDOMS &amp; PROVINCES · ' + snapshot.totals.crownProvinces + ' / ' + snapshot.limits.provinces + ' HELD BY THE CROWN</div>' +
                    '<div class="world-kingdom-grid">',
                more: chunkRows(snapshot.kingdoms, 2).map(batch => ({
                    into: ".world-kingdom-grid",
                    html: () => batch.map(kingdom => kingdomCard(kingdom, snapshot)).join("")
                }))
            };
        },
        // The campaign ledger is a second bounded snapshot read; keeping it out
        // of the theatre shell avoids pairing another late ledger with markup.
        () => { readyCampaign(); return ""; },
        () => {
            const campaign = late.campaign;
            const more = campaign.campaigns.length
                ? chunkRows(campaign.campaigns, 2).map(batch => ({
                    into: ".command-policy-list",
                    html: () => batch.map(theatreCard).join("")
                }))
                : [{
                    into: ".command-policy-list",
                    html: () => '<p class="command-note">No war band is committed to a theatre. Open an aim in Military to bind a neighbouring kingdom to a feudal contract.</p>'
                }];
            return {
                html: '</div>' +
                    '<div class="command-section-title">THEATRE CAMPAIGNS · ' + campaign.campaigns.length + ' / ' + campaign.limits.active + ' ACTIVE · ' + campaign.counters.settlements + ' SETTLED</div>' +
                    '<p class="command-note"><strong>AIM → COMMIT → SETTLE.</strong> A war band reads the real control and contest of a neighbouring kingdom, not a forecast. Committing pays the crown and signs the noble contract; progress is one bounded scalar per day and the annual campaign audit settles it with its own random stream.</p>' +
                    '<div class="command-policy-list">',
                more
            };
        },
        () => {
            const snapshot = readyWorld();
            return {
                html: '</div>' +
                    '<p class="command-note">Province control drifts once per year with the owner\'s treaty, relation and morale; hostile borders and low control make a province contested. A claim spends ' + costText(snapshot.costs.claim) + ', resolves deterministically from the current year, control, garrison, loyalty and war status, and can only be pressed once per year. A successful claim lowers the former owner\'s relation and trust; a repulsed claim spends the cost and weakens the province. <strong>A charter</strong> raises yearly loyalty and softens hostile-border control loss; its cost is paid once, but the crown receives a smaller share of that province\'s levy every year. One charter decision can be made per province each year.</p>' +
                    '<div class="world-province-grid">',
                more: chunkRows(snapshot.regions, 2).map(batch => ({
                    into: ".world-province-grid",
                    html: () => batch.map(region => regionCard(region, snapshot)).join("")
                }))
            };
        },
        () => {
            const snapshot = readyWorld();
            return {
                html: '</div>' +
                    '<div class="command-section-title">FRONTIERS · ' + snapshot.realms.filter(realm => realm.pressure >= 45).length + ' PRESSED</div>' +
                    '<p class="command-note">Pressure is one bounded reading: treaty (+42 at war, +18 neutral, +7 trade, +1 alliance), low relation and trust, the existing crown border levy, then minus nearby settlements, watch levels, active caravans and the standing army\'s dread. It is recomputed once per year and saved.</p>' +
                    '<div class="world-frontier-grid">',
                more: chunkRows(snapshot.realms, 1).map(batch => ({
                    into: ".world-frontier-grid",
                    html: () => batch.map(realm => frontierCard(realm, snapshot)).join("")
                }))
            };
        },
        () => {
            const snapshot = readyWorld();
            late.routesOpen = snapshot.routes.length > 0;
            if (!late.routesOpen) {
                return '</div>' +
                    '<div class="command-section-title">STANDING CARAVANS · ' + snapshot.routes.length + ' / ' + snapshot.limits.routes + '</div>' +
                    '<p class="command-note">No standing caravan. Choose a depot, goods and flow in one of the four frontier cards, then open the route. The first caravan leaves at the next year boundary; the panel will name exactly what it moved.</p>';
            }
            return {
                html: '</div>' +
                    '<div class="command-section-title">STANDING CARAVANS · ' + snapshot.routes.length + ' / ' + snapshot.limits.routes + '</div>' +
                    '<div class="world-routes">',
                more: chunkRows(snapshot.routes, 2).map(batch => ({
                    into: ".world-routes",
                    html: () => batch.map(route => routeRow(route, snapshot)).join("")
                }))
            };
        },
        () => {
            const snapshot = readyWorld();
            return {
                html: (late.routesOpen ? '</div>' : '') +
                    '<div class="command-section-title">WORLD RECORD</div><div class="court-history world-map__record">',
                more: snapshot.history.length
                    ? chunkRows(snapshot.history, 4).map(batch => ({
                        into: ".world-map__record",
                        html: () => batch.map(worldHistoryEntry).join("")
                    }))
                    : [{
                        into: ".world-map__record",
                        html: () => '<p class="command-note">The first annual world survey will write its record here.</p>'
                    }]
            };
        },
        () => '</div><p class="command-note">Timber and stone unload into the settlement depot and are spent by that settlement\'s own road repairs. Food moves through the royal granary. Exports draw from the named depot and pay the crown; the settlement keeps up to 2 gold as a handling fee. War closes the route without moving goods. Province control, ownership, yields and the annual claim lock are saved with the realm; the whole layer settles once per year.</p></div>'
    ];
}

export function renderWorldMapPanel() {
    return resolvePanelParts(renderWorldMapPanelParts());
}
