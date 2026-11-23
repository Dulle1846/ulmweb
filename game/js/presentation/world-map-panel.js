// Player-facing world map: the four neighbouring regions, standing caravans
// and the frontiers between them. The panel is a read-only view of the single
// world-map system; every button calls the same bounded annual state machine.
import { getWorldMapSnapshot } from "../systems/world-map.js";

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

function mapFigure(snapshot) {
    const routes = snapshot.routes;
    const realms = snapshot.realms;
    const routeMarkup = routes.map((route, index) => {
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
    const frontierMarkup = realms.map(realm => {
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
    const seatMarkup = snapshot.seats.map(seat =>
        '<g class="world-map__seat" data-world-map-seat="' + esc(seat.id) + '">' +
            '<circle class="world-map__seat-halo" cx="' + (seat.x * 100).toFixed(1) + '" cy="' + (seat.y * 64).toFixed(1) + '" r="3.1"></circle>' +
            '<circle cx="' + (seat.x * 100).toFixed(1) + '" cy="' + (seat.y * 64).toFixed(1) + '" r="1.5"></circle>' +
            '<title>' + esc(seat.name + " · depot " + amount(seat.stores.wood) + " wood / " + amount(seat.stores.stone) + " stone · " + amount(seat.treasury.gold) + " gold") + '</title>' +
        '</g>'
    ).join("");
    const grid = Array.from({ length: 7 }, (_, index) => {
        const x = 10 + index * 13.33;
        return '<line class="world-map__grid" x1="' + x.toFixed(1) + '" y1="0" x2="' + x.toFixed(1) + '" y2="64"></line>';
    }).join("") + Array.from({ length: 4 }, (_, index) => {
        const y = 13 + index * 13;
        return '<line class="world-map__grid" x1="0" y1="' + y + '" x2="100" y2="' + y + '"></line>';
    }).join("");
    const campLabel = routes.length === 0
        ? "No standing caravan yet. Open a route from a settlement depot to one of the four regions below."
        : routes.length + " standing caravan" + (routes.length === 1 ? "" : "s") + " · dashed lines are closed or stalled.";
    const seatSummary = snapshot.seats.length
        ? snapshot.seats.map(seat => seat.name).join(" · ")
        : "No settlement seat recorded";
    return '<figure class="world-map">' +
        '<svg class="world-map__canvas" viewBox="0 0 100 64" role="img" aria-labelledby="world-map-title world-map-desc">' +
            '<title id="world-map-title">Schematic world map of the four neighbouring regions and the crown\'s settlements</title>' +
            '<desc id="world-map-desc">Compass map. ' + esc(seatSummary) + '. ' + esc(campLabel) + '</desc>' +
            '<defs><marker id="world-map-arrow" markerWidth="2.6" markerHeight="2.6" refX="2" refY="1.3" orient="auto"><path d="M0,0 L2.6,1.3 L0,2.6 Z"></path></marker></defs>' +
            '<rect class="world-map__sea" x="0" y="0" width="100" height="64" rx="2"></rect>' + grid +
            frontierMarkup + routeMarkup + seatMarkup +
        '</svg>' +
        '<figcaption><span>SCHEMATIC · REAL SETTLEMENT COORDINATES, COMPASS REGIONS</span><span>' + esc(campLabel) + '</span>' +
            '<span>DEPOTS · ' + esc(seatSummary) + '</span></figcaption>' +
    '</figure>';
}

export function renderWorldMapPanel() {
    const snapshot = getWorldMapSnapshot();
    const summary = '<div class="command-summary">' +
        '<div><small>SEATS</small><strong>' + snapshot.seats.length + '</strong></div>' +
        '<div><small>STANDING ROUTES</small><strong>' + snapshot.routes.length + ' / ' + snapshot.limits.routes + '</strong></div>' +
        '<div><small>GOODS MOVED</small><strong>' + integer(snapshot.totals.delivered) + '</strong></div>' +
        '<div><small>TRADE EARNED</small><strong>' + integer(snapshot.totals.earned) + 'G</strong></div>' +
        '<div><small>BORDER INCIDENTS</small><strong>' + integer(snapshot.totals.incidents) + '</strong></div>' +
        '<div><small>WATCH LEVELS</small><strong>' + snapshot.totals.watchLevels + ' / ' + (snapshot.limits.watch * snapshot.realms.length) + '</strong></div>' +
    '</div>';
    const legend = '<div class="world-map__legend" aria-label="Frontier pressure bands">' +
        '<span class="is-calm">CALM · 0–24</span><span class="is-watchful">WATCHFUL · 25–44</span>' +
        '<span class="is-tense">TENSE · 45–64</span><span class="is-contested">CONTESTED · 65+</span>' +
        '<span class="world-map__legend-note">A raid can cross from 58 unless the frontier is certain above 75.</span></div>';
    const routesSection = snapshot.routes.length
        ? '<div class="world-routes">' + snapshot.routes.map(route => routeRow(route, snapshot)).join("") + '</div>'
        : '<p class="command-note">No standing caravan. Choose a depot, goods and flow in one of the four frontier cards, then open the route. The first caravan leaves at the next year boundary; the panel will name exactly what it moved.</p>';
    const history = snapshot.history.length
        ? snapshot.history.map(entry => '<div><span>' + esc(String(entry.kind).toUpperCase()) + ' · YEAR ' + entry.year + '</span><p>' + esc(entry.summary) + '</p></div>').join("")
        : '<p class="command-note">The first annual world survey will write its record here.</p>';
    return '<div class="world-map-panel" data-world-map-panel>' +
        '<div class="command-panel-intro"><span>THE WORLD BEYOND THE REALM</span><h3>World map, trade routes &amp; frontiers</h3>' +
            '<p>Four neighbouring regions sit at their compass bearings. Settlements are your real seats, roads and stores. A standing caravan moves six units of goods every year through the same market stock, partner treasury and diplomatic ledger as manual trade; a frontier reads the treaty, relation, nearby seats and watch, and can put raiders over the border.</p></div>' +
        summary + legend + mapFigure(snapshot) +
        '<div class="command-section-title">FRONTIERS · ' + snapshot.realms.filter(realm => realm.pressure >= 45).length + ' PRESSED</div>' +
        '<p class="command-note">Pressure is one bounded reading: treaty (+42 at war, +18 neutral, +7 trade, +1 alliance), low relation and trust, the existing crown border levy, then minus nearby settlements, watch levels, active caravans and the standing army\'s dread. It is recomputed once per year and saved.</p>' +
        '<div class="world-frontier-grid">' + snapshot.realms.map(realm => frontierCard(realm, snapshot)).join("") + '</div>' +
        '<div class="command-section-title">STANDING CARAVANS · ' + snapshot.routes.length + ' / ' + snapshot.limits.routes + '</div>' +
        routesSection +
        '<div class="command-section-title">WORLD RECORD</div><div class="court-history world-map__record">' + history + '</div>' +
        '<p class="command-note">Timber and stone unload into the settlement depot and are spent by that settlement\'s own road repairs. Food moves through the royal granary. Exports draw from the named depot and pay the crown; the settlement keeps up to 2 gold as a handling fee. War closes the route without moving goods. The whole layer settles once per year and is saved with the realm.</p>' +
    '</div>';
}
