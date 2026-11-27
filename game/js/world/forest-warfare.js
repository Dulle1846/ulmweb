// 1.2.23.1.211–240 — war, diplomacy, borders and strategy in the woodland.
//
// Data plus deterministic selectors only. The living ledger, the actions and
// the bounded annual pass live in js/systems/forest-warfare.js. Every regional
// war profile is derived from the sixty existing REGIONAL_FOREST_TYPES, so the
// tactical character of a frontier can never drift away from the wood the
// player actually owns.
import { REGIONAL_FOREST_TYPES } from "./regional-forests.js";

const titleCase = value => String(value || "wood")
    .split(/[-_\s]+/).filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");

function hashString(text) {
    let hash = 2166136261;
    for (let index = 0; index < String(text).length; index++) {
        hash ^= String(text).charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

function jitter(seed, spread) {
    return spread ? (hashString(seed) % (spread * 2 + 1)) - spread : 0;
}

// Twelve ways a wood can be a border. The regional type supplies the trees,
// animals, goods and local names; the archetype supplies the military grammar.
const WAR_ARCHETYPES = Object.freeze({
    boreal: Object.freeze({
        border: "a frozen ridge screened by spruce and black-water marsh",
        ambush: 58, sight: 34, movement: 30, cavalry: 34,
        elephants: false, shipTimber: 2, siegeTimber: 3, smugglerPaths: 2,
        recoveryYears: 38, colonization: 64,
        tradition: "Winter raids follow the ice roads; the defender holds the neck between the lakes and lets the cold do the rest.",
        goods: ["timber", "resin", "charcoal"],
        roads: [
            { open: false, label: "Thaw mud closes the winter haul road" },
            { open: true, label: "Dry summer trace carries carts" },
            { open: true, label: "Firm autumn road before the frost" },
            { open: true, label: "Ice road opens for sleds; drifting snow closes wheels" }
        ]
    }),
    temperate: Object.freeze({
        border: "a coppiced march with old boundary oaks and deep hedgerows",
        ambush: 46, sight: 24, movement: 22, cavalry: 26,
        elephants: false, shipTimber: 2, siegeTimber: 2, smugglerPaths: 3,
        recoveryYears: 26, colonization: 44,
        tradition: "The march is held by forester villages, boundary rides and a web of paths only the local woodcutters know.",
        goods: ["timber", "honey", "medicine"],
        roads: [
            { open: true, label: "Spring lanes firm enough for carts" },
            { open: true, label: "Summer road in full use" },
            { open: true, label: "Leaf-fall haul road" },
            { open: false, label: "Winter mud and fallen boughs close the lane" }
        ]
    }),
    mediterranean: Object.freeze({
        border: "a dry evergreen ridge above the pass road and the cisterns",
        ambush: 40, sight: 18, movement: 18, cavalry: 22,
        elephants: false, shipTimber: 3, siegeTimber: 2, smugglerPaths: 3,
        recoveryYears: 32, colonization: 38,
        tradition: "Whoever holds the spring holds the pass; the groves are watchtowers and the goat stairs are the army's road.",
        goods: ["timber", "resin", "medicine"],
        roads: [
            { open: true, label: "Spring road after the cisterns are cleaned" },
            { open: false, label: "Summer heat and dust slow the baggage train" },
            { open: true, label: "Autumn road after the first rain" },
            { open: true, label: "Winter road under a dry sky" }
        ]
    }),
    wetland: Object.freeze({
        border: "a drowned carr of alder, reed bed and one narrow causeway",
        ambush: 72, sight: 46, movement: 52, cavalry: 58,
        elephants: false, shipTimber: 2, siegeTimber: 1, smugglerPaths: 4,
        recoveryYears: 30, colonization: 30,
        tradition: "The causeway is the only army road; the marsh swallows horses and the ferrymen remember who paid them.",
        goods: ["timber", "medicine", "honey"],
        roads: [
            { open: false, label: "Spring flood drowns the causeway" },
            { open: true, label: "Low summer water opens the causeway" },
            { open: true, label: "Autumn causeway before the rains" },
            { open: false, label: "Winter flood and ice break the road" }
        ]
    }),
    mountain: Object.freeze({
        border: "a contour road under a cloud-pine pass and a stone shrine",
        ambush: 62, sight: 30, movement: 38, cavalry: 44,
        elephants: false, shipTimber: 1, siegeTimber: 2, smugglerPaths: 2,
        recoveryYears: 44, colonization: 34,
        tradition: "The pass is a toll gate and a killing ground; a cable slide moves timber faster than a column can climb.",
        goods: ["timber", "resin", "medicine"],
        roads: [
            { open: false, label: "Snow-melt and rockfall close the pass road" },
            { open: true, label: "High summer road open to the shrine" },
            { open: true, label: "Dry autumn road on contour" },
            { open: false, label: "Winter snow closes the pass" }
        ]
    }),
    coastal: Object.freeze({
        border: "a wind-shaped pine belt behind dune and salt marsh",
        ambush: 44, sight: 20, movement: 24, cavalry: 30,
        elephants: false, shipTimber: 3, siegeTimber: 2, smugglerPaths: 4,
        recoveryYears: 28, colonization: 40,
        tradition: "The dune wood hides boats and batteries; a coastal battery with mast timber can refit a fleet without a harbour.",
        goods: ["timber", "resin", "honey"],
        roads: [
            { open: true, label: "Spring dune track after the gales" },
            { open: true, label: "Summer boat drag and coast road" },
            { open: false, label: "Autumn storms wash out the dune track" },
            { open: true, label: "Winter hard sand carries the supply sleds" }
        ]
    }),
    savanna: Object.freeze({
        border: "an open flat-crown wood between waterholes and burn breaks",
        ambush: 34, sight: 12, movement: 14, cavalry: 18,
        elephants: true, shipTimber: 1, siegeTimber: 2, smugglerPaths: 2,
        recoveryYears: 22, colonization: 30,
        tradition: "War follows the water and the dry grass; fire is a weapon, a screen and a signal across the flat crowns.",
        goods: ["timber", "medicine", "honey"],
        roads: [
            { open: true, label: "First-rain road greening over" },
            { open: false, label: "Wet-season mud closes the cattle drift" },
            { open: true, label: "Dry-season road to the waterholes" },
            { open: true, label: "Cool winter road after the burn" }
        ]
    }),
    tropical: Object.freeze({
        border: "a closed canopy over a ridge track and a vine-cut gully",
        ambush: 80, sight: 54, movement: 50, cavalry: 62,
        elephants: true, shipTimber: 2, siegeTimber: 3, smugglerPaths: 4,
        recoveryYears: 48, colonization: 52,
        tradition: "A column that leaves the ridge is already lost; the canopy hides elephants, partisans and a road that is only a rumour.",
        goods: ["timber", "resin", "medicine"],
        roads: [
            { open: true, label: "Dry-window track through the gap" },
            { open: false, label: "Monsoon mud and flooded fords close the track" },
            { open: false, label: "Second rains close the ridge road" },
            { open: true, label: "Short dry lull opens the vine cut" }
        ]
    }),
    mangrove: Object.freeze({
        border: "a root-line coast of tidal creeks and woven fish traps",
        ambush: 68, sight: 40, movement: 48, cavalry: 56,
        elephants: false, shipTimber: 2, siegeTimber: 1, smugglerPaths: 5,
        recoveryYears: 24, colonization: 34,
        tradition: "The root line is a wall and a harbour; a flat-bottomed boat can pass where a horse cannot stand.",
        goods: ["timber", "medicine", "honey"],
        roads: [
            { open: true, label: "Spring ebb exposes the root track" },
            { open: false, label: "High summer tide drowns the track" },
            { open: true, label: "Autumn ebb road to the traps" },
            { open: false, label: "Winter storm tide closes the coast" }
        ]
    }),
    bamboo: Object.freeze({
        border: "a hollow-stem mountain stand above a woven path",
        ambush: 64, sight: 34, movement: 30, cavalry: 36,
        elephants: false, shipTimber: 2, siegeTimber: 3, smugglerPaths: 3,
        recoveryYears: 20, colonization: 36,
        tradition: "The grove bends and hides; split culms make a bridge, a palisade or a litter faster than any sawmill.",
        goods: ["timber", "resin", "medicine"],
        roads: [
            { open: true, label: "New-shoot path repaired after winter" },
            { open: false, label: "Summer undergrowth closes the woven road" },
            { open: true, label: "Dry autumn culm road" },
            { open: true, label: "Winter path above the shoot line" }
        ]
    }),
    laurel: Object.freeze({
        border: "a mist-veiled laurel ridge above the cloud line",
        ambush: 66, sight: 44, movement: 36, cavalry: 40,
        elephants: false, shipTimber: 2, siegeTimber: 2, smugglerPaths: 2,
        recoveryYears: 42, colonization: 32,
        tradition: "The cloud is the wall; the moss channels are the only reliable water and the quetzal trail is the only quiet road.",
        goods: ["timber", "medicine", "resin"],
        roads: [
            { open: true, label: "Mist-channel path after the rains" },
            { open: false, label: "Cloud burst washes out the ridge track" },
            { open: true, label: "Dry mist gap opens the upper road" },
            { open: false, label: "Winter cloud and slick stone close the pass" }
        ]
    }),
    cloud: Object.freeze({
        border: "a tree-fern cloud wood over a spring shrine and a mist channel",
        ambush: 70, sight: 48, movement: 40, cavalry: 44,
        elephants: false, shipTimber: 2, siegeTimber: 2, smugglerPaths: 2,
        recoveryYears: 46, colonization: 30,
        tradition: "A company that cuts the cloud wood drinks from a dry spring; the defenders need only hold the channels.",
        goods: ["timber", "medicine", "resin"],
        roads: [
            { open: false, label: "Mist rain floods the channel road" },
            { open: true, label: "Summer dry lull opens the epiphyte ladder" },
            { open: false, label: "Second mist closes the spring pass" },
            { open: true, label: "Winter clear nights harden the track" }
        ]
    })
});

function archetypeKeyFor(type) {
    const key = String(type.key || "").toLowerCase();
    const climates = (type.climates || []).map(value => String(value).toLowerCase());
    if (/mangrove/.test(key)) return "mangrove";
    if (/bamboo/.test(key)) return "bamboo";
    if (/laurel/.test(key)) return "laurel";
    if (/cloud/.test(key)) return "cloud";
    if (/miombo|acacia|savanna|baobab|mopane|combretum/.test(key) || climates.includes("savanna")) return "savanna";
    if (/teak|dipterocarp|rainforest|jungle|mahogany|ceiba|tropical/.test(key) || climates.includes("tropical")) return "tropical";
    if (/taiga|boreal|spruce|snow/.test(key) || climates.includes("taiga") || climates.includes("snow")) return "boreal";
    if (/mediterranean|cork|holm|aleppo|olive/.test(key) || climates.includes("mediterranean")) return "mediterranean";
    if (/marsh|swamp|bog|carr|riparian|willow|alder|flood|peat/.test(key)) return "wetland";
    if (/mountain|alpine|subalpine/.test(key) || climates.includes("mountain")) return "mountain";
    if (/coast|dune|salt/.test(key)) return "coastal";
    return "temperate";
}

function speciesLabel(type) {
    const entry = Object.entries(type.species || {}).sort((a, b) => Number(b[1]) - Number(a[1]))[0];
    return titleCase(entry?.[0] || "oak");
}

function animalLabel(type) {
    return titleCase((type.fauna || ["deer"])[0] || "deer");
}

function buildWarProfile(type) {
    const archetypeKey = archetypeKeyFor(type);
    const base = WAR_ARCHETYPES[archetypeKey] || WAR_ARCHETYPES.temperate;
    const region = type.short || type.label || "woodland";
    const tree = speciesLabel(type);
    const animal = animalLabel(type);
    const seed = type.id + ":war";
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    return Object.freeze({
        id: type.id,
        key: type.key,
        region,
        label: region + " war frontier",
        archetype: archetypeKey,
        climate: (type.climates || [])[0] || "temperate",
        border: base.border.replace(/\{tree\}/g, tree.toLowerCase()).replace(/\{animal\}/g, animal.toLowerCase()),
        frontierName: "The " + region + " Frontier",
        ambush: clamp(base.ambush + jitter(seed + ":ambush", 6), 20, 92),
        sightPenalty: clamp(base.sight + jitter(seed + ":sight", 4), 8, 60),
        movementPenalty: clamp(base.movement + jitter(seed + ":move", 4), 8, 60),
        cavalryDrag: clamp(base.cavalry + jitter(seed + ":horse", 5), 10, 70),
        elephantGround: base.elephants,
        shipTimberGrade: base.shipTimber,
        siegeTimberGrade: base.siegeTimber,
        smugglerPaths: clamp(base.smugglerPaths + (jitter(seed + ":path", 1)), 1, 6),
        recoveryYears: clamp(base.recoveryYears + jitter(seed + ":recover", 3), 12, 60),
        colonizationPressure: base.colonization,
        warTradition: base.tradition.replace(/\{tree\}/g, tree.toLowerCase()).replace(/\{animal\}/g, animal.toLowerCase()),
        strategicGoods: Object.freeze([...base.goods]),
        roads: Object.freeze(base.roads.map((road, index) => Object.freeze({
            season: index,
            open: road.open,
            label: road.label
        }))),
        indigenousPeople: "The " + region + " " + titleCase((type.fauna || ["wood"])[0] || "wood") + " keepers",
        sources: Object.freeze(["1.2.23.1.211", "1.2.23.1.213", "1.2.23.1.214", "1.2.23.1.216", "1.2.23.1.219", "1.2.23.1.220", "1.2.23.1.235"])
    });
}

export const FOREST_WAR_PROFILES = Object.freeze(Object.fromEntries(
    REGIONAL_FOREST_TYPES.map(type => [type.id, buildWarProfile(type)])
));
export const FOREST_WAR_PROFILE_LIST = Object.freeze(REGIONAL_FOREST_TYPES
    .map(type => FOREST_WAR_PROFILES[type.id]).filter(Boolean));

export function forestWarProfileFor(id) {
    return FOREST_WAR_PROFILES[String(id || "")] || null;
}

// Four canonical fronts. The realm keeps its diplomatic identity; the forest
// type decides the terrain, the roads and the tactical modifiers.
export const FOREST_WAR_FRONTS = Object.freeze([
    Object.freeze({ realmId: "northmere", regionId: "northmere-pines", provinceId: "northmere-pines", archetypes: Object.freeze(["boreal", "temperate"]) }),
    Object.freeze({ realmId: "ironvale", regionId: "ironvale-crags", provinceId: "ironvale-crags", archetypes: Object.freeze(["mountain", "boreal"]) }),
    Object.freeze({ realmId: "goldcoast", regionId: "goldcoast-vines", provinceId: "goldcoast-vines", archetypes: Object.freeze(["mediterranean", "coastal"]) }),
    Object.freeze({ realmId: "redpass", regionId: "redpass-gorge", provinceId: "redpass-gorge", archetypes: Object.freeze(["savanna"]) })
]);

export const FOREST_WAR_FRONTS_BY_REALM = Object.freeze(Object.fromEntries(
    FOREST_WAR_FRONTS.map(front => [front.realmId, front])
));

function requirement(id, title, point, consumer, detail) {
    return Object.freeze({ id, title, point, consumer, detail });
}

// The ids are the exact source points. `consumer` names the live system the
// player touches; `detail` is the field-guide explanation, not a stub.
export const FOREST_WARFARE_REQUIREMENTS = Object.freeze([
    requirement("1.2.23.1.211", "Wälder als natürliche Grenzen zwischen Regionen", "Every front has a real regional forest profile: its border terrain, ambush cover, sight lines and movement cost come from the forest type, not a generic map edge.", "Four forest fronts; world-map provinces; battle and ambush modifiers", "A wood frontier is a place with a name. The Northmere pine belt, the Ironvale crag wood, the Goldcoast evergreen slope and the Redpass gorge scrub each derive different ambush, sight and cavalry values from their own regional type. Those values are used by every forest battle and by the annual border pressure."),
    requirement("1.2.23.1.212", "Grenzposten und Waldwachen", "A border post is a real construction of wood and gold; it raises the province's control and lowers frontier pressure. A forest watch adds detection.", "Front → Border post and Forest watch; world-map region control and frontier pressure", "Raising a post spends 10 wood and 6 gold and adds control to the actual frontier province, capped at three posts. Each watch level costs gold and food and adds detection against ambushes and smugglers. Both are visible on the front card and read by the annual border pass."),
    requirement("1.2.23.1.213", "Waldwege mit saisonaler Befahrbarkeit", "A forest road has three upgrade levels and a per-season passability derived from the regional type; a closed season halves movement and trade.", "Front → Forest road; seasonal modifier; battle movement; forest route income", "Boreal roads close in thaw, tropical roads in the monsoon, wetland causeways in flood, mountain passes in snow. The open or closed state is shown for all four seasons. A closed road still exists, but it slows an army and reduces the trade it carries; opening the next level costs real timber, stone and gold."),
    requirement("1.2.23.1.214", "Hinterhalte in dichten Waldtypen", "An ambush needs a dense forest front, scouts, food and a war; it strengthens the next battle and bleeds the enemy column.", "Front → Lay ambush; forest battle; dense-cover rating", "Only fronts whose regional profile has enough cover can hide a war party. Scouts improve the chance. The ambush is consumed by the next battle, where it raises the crown's power and inflicts extra enemy losses. It is once per year and expires unused."),
    requirement("1.2.23.1.215", "Späher mit regionalem Waldwissen", "Scouts are recruited by realm; each one adds regional wood knowledge, ambush detection and a better sight modifier.", "Front → Recruit scouts; ambush, smuggling and battle sight", "A scout is paid in gold and food, capped at three per front. Their local knowledge improves the chance of a successful ambush, lowers an enemy ambush and reduces smuggling risk. The front card names the regional paths the scouts know."),
    requirement("1.2.23.1.216", "Waldkampf mit Sicht- und Bewegungsmodifikatoren", "A forest battle computes power from real soldiers plus sight, movement, maps, works and terrain, then applies wounds and casualties to the actual soldiers.", "Front → Fight forest battle; military soldiers; province control; war exhaustion", "The battle is deterministic for the same state and year. The wood's sight penalty reduces the weaker side's coordination, the road and movement penalty slow the column, and the abatis and ambush change the odds. Losses are written to the same soldier records the military panel uses."),
    requirement("1.2.23.1.217", "Belagerungsmaterial aus regionalem Holz", "Siege timber is cut from the realm's wood and spent to reduce an enemy province's garrison and control.", "Front → Cut siege timber and Press siege; province garrison/control", "Cutting siege material costs 15 wood and adds a bounded reserve whose size depends on the region's siege-timber grade. Pressing a siege spends ten units, strips one garrison point and lowers control. It is only available at war, so the material cannot be banked as a peacetime freebie."),
    requirement("1.2.23.1.218", "Schiffsbauholz als strategische Ressource", "Reserved mast and keel timber is a separate strategic reserve; twelve units become a real hull for the crown fleet.", "Front → Reserve ship timber; royal fleet; naval trade bonus", "Coastal, Mediterranean and temperate fronts yield ship timber at different grades. The reserve is capped, shown as a strategic stock, and converts into a real ship in the navy once per year. That hull then feeds the existing naval trade bonus."),
    requirement("1.2.23.1.219", "Kriegselefanten in tropischen Waldregionen", "War elephants can only be mustered on a tropical or savanna front; they add shock power and cost food every year.", "Front → Muster elephants; battle power; annual food upkeep", "The regional profile states whether elephants can live and feed there. A tropical front can muster up to three, each adding battle power and each eating food in the annual pass. In a wetland or mountain front the action is refused with the terrain reason."),
    requirement("1.2.23.1.220", "Kavalleriehindernisse durch Unterholz und Sümpfe", "Abatis and undergrowth add a real cavalry drag to the front and a defensive bonus in battle.", "Front → Fell abatis; battle cavalry modifier; regional cavalry drag", "Felling abatis costs wood and food, capped at three belts. Each belt adds to the regional cavalry drag. The battle reads the combined value, so a horseman-heavy enemy is strongest on an open savanna front and weakest in a wetland or a prepared wood."),
    requirement("1.2.23.1.221", "Partisanen und Waldwiderstand", "Partisans can be raised on a contested or war-weary front; every year they drain enemy control and supply.", "Front → Raise partisans; annual province control; war exhaustion", "Partisans are named irregulars, not a second army. They are capped, cost food and gold, and every annual pass removes control from the disputed province and adds a little war exhaustion to the enemy. They are disbanded by a border treaty."),
    requirement("1.2.23.1.222", "Waldbrände als militärische Waffe", "A war fire burns a real forest tile, damages the enemy supply and leaves a scar that takes years to heal.", "Front → Set war fire; forest succession burn; province control; war ecology", "The fire uses the existing controlled-burn path, so the tile's stock, succession record and salvage are real. At war it also lowers enemy control and adds a scar. The scar is stored with its tile and start year and is reviewed by the annual ecology pass."),
    requirement("1.2.23.1.223", "Brandrodung als Kriegs- und Siedlungsstrategie", "Slash-and-burn clears a real tile for fields, adds food and settlers, and creates a long-lived scar and resistance.", "Front → Burn for fields; forest stock; food; settlers; war ecology", "This is a settlement decision, not a battle order. It burns a tile through the same fire path, returns an immediate food yield, adds a settler claim and a scar. The forest remembers: recovery takes decades and the indigenous communities lose trust."),
    requirement("1.2.23.1.224", "Deportation und Vertreibung aus Waldgebieten", "Deportation lowers rebel strength and settler pressure but costs legitimacy and morale and can create refugees.", "Front → Deport woodlanders; rebels; legitimacy; refugees", "The crown may clear a wood of its people to break a resistance network. It reduces rebels and settler claims, but legitimacy and morale fall and some of the displaced become refugees who must be settled. The ledger records the year and the number."),
    requirement("1.2.23.1.225", "Holzkontingente für Flotten und Belagerungen", "A timber quota consumes real wood and food, pays gold and siege material, and raises frontier unrest.", "Front → Levy timber quota; wood; gold; siege material; rebels", "The quota is a wartime levy on the wood. It spends food for the work gangs and wood from the royal store, returns gold and siege material, and adds a little unrest. It cannot be repeated in the same year, so the forest is not mined in a single click."),
    requirement("1.2.23.1.226", "Embargo auf wertvolle Waldgüter", "An embargo on timber, resin or medicine cancels the trade agreement, cuts relation and raises fear.", "Front → Embargo; diplomacy trade agreement; relation and fear", "The embargo is a real trade weapon: it ends the standing trade agreement with that realm, names the banned forest good, and shifts the court's relation and fear. Lifting it does not restore the old agreement; the player must negotiate again."),
    requirement("1.2.23.1.227", "Handelsrouten durch Waldregionen", "A forest route is opened with wood and gold, earns annual income, and is stronger when the forest road is open.", "Front → Open forest route; annual gold; road level and season", "A route is a standing caravan through the wood, not a second market. It requires peace, pays gold each year, and its yield reads the road level and the current season's passability. A closed road still carries some trade, at a reduced rate."),
    requirement("1.2.23.1.228", "Zoll auf Holz, Harz und Medizin", "Customs rates of 0, 5, 10 or 15 percent earn gold from the forest trade and raise smuggling risk and court resentment.", "Front → Set customs; annual gold; smuggling risk; relation", "The rate is a real annual levy on the forest trade. Higher rates pay more gold but raise the smuggling chance and slowly sour the relation. The customs choice is shown on the front card with its current annual estimate."),
    requirement("1.2.23.1.229", "Schmuggel über versteckte Waldwege", "Hidden forest paths allow a smuggling run with a real risk and reward; scouts and watch levels change the odds.", "Front → Run smuggling; gold; relation; detection", "A smuggling run is a one-per-year gamble. The regional path count sets the base, scouts and forest watch improve the crown's detection, and the customs rate raises the temptation. Success pays gold; failure costs relation and is logged."),
    requirement("1.2.23.1.230", "Waldkarten als Militärgeheimnis", "Charted war maps improve sight and ambush defence; they cost gold and research and are a guarded strategic asset.", "Front → Commission war maps; battle sight; research reserve", "The maps are the scouts' surveyed paths, fords and hiding places. Commissioning them spends gold and research reserve and adds a permanent sight and ambush-defence bonus to that front. The map is a strategic secret: the front card marks it as guarded."),
    requirement("1.2.23.1.231", "Grenzverträge über Waldnutzung", "A border treaty costs gold, raises relation and trust, and blocks ambush, war fire and partisans for eight years.", "Front → Sign border treaty; diplomacy relation; annual goodwill", "The treaty names the shared wood and its term. While it holds, the aggressive forest actions are refused and the annual pass pays a small shared-forage goodwill. A war or a broken treaty ends it and costs relation."),
    requirement("1.2.23.1.232", "Gemeinsame Schutzgebiete zwischen Reichen", "A joint preserve needs a treaty and a grove; it protects a real border tile from every axe and raises relation.", "Front → Create joint preserve; sacred-grove guard; harvestForest", "The preserve is a real forest tile recorded on the front. The shared harvest guard reads it exactly like a consecrated grove, so neither realm's work party can cut it. It costs gold, raises relation and is shown on both the front card and the grove guard."),
    requirement("1.2.23.1.233", "Rechte indigener Waldgemeinschaften", "Recognising the woodland communities costs gold, adds legitimacy and morale, reduces rebels and limits the timber levy.", "Front → Recognise woodland rights; legitimacy; rebels; timber factor", "The charter is a permanent choice per front. It raises legitimacy and morale, lowers the rebel flow from settlement and deportation, and modestly reduces the timber a quota can extract. It is recorded in the realm legacy as a law."),
    requirement("1.2.23.1.234", "Siedlerdruck an Waldrändern", "Settler claims add population pressure and food but convert a real forest tile each year and raise resistance.", "Front → Press settler claims; annual forest conversion; food; rebels", "Each claim is a household at the wood edge. Claims are capped, cost food, and every annual pass clears part of a real forest tile for fields and adds food. Beyond two claims the indigenous communities begin to resist and rebels appear."),
    requirement("1.2.23.1.235", "Kolonisation tropischer und borealer Wälder", "Colonisation needs three settler claims and a real payment; it transfers the frontier province to the crown and creates resistance.", "Front → Colonise woodland; world-map province owner; rebels; relation", "This is the hard version of settler pressure: the province changes owner in the saved world map, its control starts low, and the displaced woodlanders become rebels. The action is once per front and is refused while a border treaty or joint preserve is in force."),
    requirement("1.2.23.1.236", "Widerstand gegen Entwaldung", "Deforestation scars and colonization create resistance; suppressing it costs gold and food and hurts morale and legitimacy.", "Front → Suppress resistance; rebels; control; morale", "Resistance is a named camp with a strength value, not a random event. Suppression reduces it and restores some control, but the crown pays in morale and legitimacy. Ignoring it lets the camp grow each year and drain the province."),
    requirement("1.2.23.1.237", "Waldflüchtlinge nach Krieg und Brand", "War, fire, deportation and colonization create refugees; settling them costs food and wood and restores morale.", "Front → Settle refugees; food; wood; morale; legitimacy", "Refugees are counted on the front and cost morale every year they are not settled. Settling them spends food and wood, restores morale and legitimacy, and clears the count. A long war can produce more than one group."),
    requirement("1.2.23.1.238", "Militärkolonien zur Grenzsicherung", "A military colony is a paid border settlement that adds control and a garrison but eats food every year.", "Front → Found military colony; province control and garrison; annual food", "The colony is a frontier institution, not a new building type. It costs wood, stone and gold, adds control and a garrison point immediately, and then consumes food each year. It is shown with its founding year and its current upkeep."),
    requirement("1.2.23.1.239", "Wald als Rückzugsraum für Rebellen", "Rebel camps hide in the wood; clearing one needs a soldier, food and scouts, and can wound the soldier.", "Front → Clear rebel camp; rebels; control; soldier wounds", "A camp is generated by deportation, colonization and heavy deforestation. Clearing it is a small forest action, not a full battle: it needs a ready soldier and food, succeeds more often with scouts, and can wound the soldier. Failure lets the camp grow."),
    requirement("1.2.23.1.240", "Ökologische Kriegsfolgen über Jahrzehnte", "Every war fire, slash-and-burn and colonial clearance leaves a scar; the annual ecology pass tracks recovery over the region's own recovery years.", "Front → War ecology; forest scars; recovery action; forest stock", "Scars store the tile, the year and the severity. Each annual pass reduces severity; when it reaches zero the tile regrows through the existing forest succession path. A funded recovery action can heal one scar sooner. The front card shows the ecological debt and the region's expected recovery time.")
]);

export const FOREST_WARFARE_REQUIREMENT_BY_ID = Object.freeze(Object.fromEntries(
    FOREST_WARFARE_REQUIREMENTS.map(entry => [entry.id, entry])
));
