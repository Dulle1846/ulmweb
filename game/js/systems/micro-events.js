// Deterministic, weighted "living chronicle" events. No network or LLM call
// happens here: every generated record is reproducible from the save seed.
import { state } from "../core/state.js";
import { random, randInt } from "../core/random.js";
import { TYPE } from "../core/types.js";
import { appendTimelineEvent, createEventTimelineState } from "../core/event-timeline.js";
import { queuePresentationEffect } from "../core/presentation-effects.js";

const STREAM = "micro-events";
const BASE_PLACES = Object.freeze([
    "the lower fields", "the market square", "the royal keep", "the old river road",
    "the northern watch", "the eastern orchards", "the abbey lands", "the western marshes",
    "the quarry road", "the village well", "the mill yard", "the outer gate"
]);
const BUILDING_LABELS = Object.freeze({
    [TYPE.KEEP]: "the royal keep", [TYPE.HOUSE]: "the household lanes", [TYPE.FARM]: "the barley fields",
    [TYPE.LUMBER]: "the lumber yard", [TYPE.QUARRY]: "the old quarry", [TYPE.TOWER]: "the watchtower",
    [TYPE.TAVERN]: "the tavern", [TYPE.TEMPLE]: "the temple steps", [TYPE.BARRACKS]: "the barracks yard",
    [TYPE.MILL]: "the mill yard", [TYPE.STABLE]: "the stables", [TYPE.WONDER]: "the wonder",
    [TYPE.GOLDMINE]: "the gold seam", [TYPE.WAREHOUSE]: "the warehouse row", [TYPE.BAKERY]: "the bakery",
    [TYPE.WELL]: "the village well", [TYPE.CLINIC]: "the healer's house", [TYPE.MARKET]: "the market square",
    [TYPE.SHRINE]: "the wayside shrine", [TYPE.COURT]: "the court of law", [TYPE.PRISON]: "the prison yard",
    [TYPE.TOWN_HALL]: "the town hall", [TYPE.SCHOOL]: "the schoolroom", [TYPE.BATHHOUSE]: "the bathhouse",
    [TYPE.BREWERY]: "the brewery", [TYPE.GUILDHALL]: "the guildhall", [TYPE.WATCHHOUSE]: "the watchhouse",
    [TYPE.SMITHY]: "the smithy", [TYPE.SCRIPTORIUM]: "the scriptorium"
});
const SEASONS = Object.freeze(["Spring", "Summer", "Autumn", "Winter"]);
const RESOURCE_KEYS = Object.freeze(["wood", "stone", "gold", "food"]);

function clean(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
}
function sentence(value) {
    return clean(value).replace(/[.!?]+$/, "");
}
function pick(list) {
    return list[Math.min(list.length - 1, Math.floor(random(STREAM) * list.length))];
}
function finiteInt(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : fallback;
}
function personName(entity) { return clean(entity?.person?.name || ""); }
function personActor(entity, role = "resident") {
    if (!entity || !personName(entity)) return null;
    return {
        personId: String(entity.person?.id || entity.personId || entity.id || ""),
        name: personName(entity),
        role,
        entity
    };
}
function building(entity) {
    try { return typeof entity?.isBuilding === "function" && entity.isBuilding(); } catch { return false; }
}
function seasonFor(day) { return SEASONS[Math.min(3, Math.max(0, Math.floor((finiteInt(day, 1) - 1) / 100)))]; }
function hasWar() {
    return Boolean((state.diplomacy?.realms || []).some(realm => realm?.treaty === "war"));
}
function buildContext() {
    const people = (state.entities || []).filter(entity => !entity.dead && personName(entity));
    const rulerEntity = people.find(entity => entity.isKing) || people[0] || null;
    const ruler = personActor(rulerEntity, "sovereign") || { personId: null, name: "the sovereign", role: "sovereign" };
    const soldiers = people.filter(entity => {
        const type = entity.type;
        return type === TYPE.GUARD || type === TYPE.KNIGHT || type === TYPE.ARCHER || Boolean(entity.military);
    });
    const children = people.filter(entity => Number(entity.person?.ageYears) >= 0 && Number(entity.person?.ageYears) < 16);
    const elders = people.filter(entity => Number(entity.person?.ageYears) >= 55);
    const sick = people.filter(entity => Number(entity.illnessUntilTick) > Number(state.tick || 0));
    const residents = people.filter(entity => !entity.isKing);
    const dragons = (state.entities || []).filter(entity => !entity.dead && entity.isDragon && clean(entity.creature?.name));
    const places = [...BASE_PLACES];
    let temples = 0;
    for (const entity of state.entities || []) {
        if (entity.dead || !building(entity)) continue;
        if (entity.type === TYPE.TEMPLE || entity.type === TYPE.SHRINE) temples++;
        const label = BUILDING_LABELS[entity.type];
        if (label && !places.includes(label)) places.push(label);
    }
    return {
        year: Math.max(1, finiteInt(state.year, 1)),
        day: Math.min(400, Math.max(1, finiteInt(state.dayOfYear, 0) + 1)),
        season: seasonFor(Math.min(400, Math.max(1, finiteInt(state.dayOfYear, 0) + 1))),
        weather: clean(state.weather || "clear").toLowerCase(),
        kingdom: clean(state.kingdomName || "the realm"),
        ruler,
        residents,
        soldiers,
        children,
        elders,
        sick,
        dragons,
        dragon: dragons.length ? { personId: String(dragons[0].id || ""), name: clean(dragons[0].creature.name), role: "dragon", entity: dragons[0] } : null,
        population: people.filter(entity => entity.type === TYPE.VILLAGER).length,
        gold: Number(state.resources?.gold) || 0,
        food: Number(state.resources?.food) || 0,
        wood: Number(state.resources?.wood) || 0,
        stone: Number(state.resources?.stone) || 0,
        atWar: hasWar(),
        temples,
        places,
        person: pick(residents.length ? residents : [rulerEntity || null]),
        soldier: pick(soldiers.length ? soldiers : [rulerEntity || null]),
        child: pick(children.length ? children : [rulerEntity || null]),
        elder: pick(elders.length ? elders : [rulerEntity || null]),
        other: pick(residents.length ? residents : [rulerEntity || null])
    };
}
function actorFor(context, kind) {
    switch (kind) {
        case "dragon": return context.dragon;
        case "soldier": return personActor(context.soldier, "soldier") || context.ruler;
        case "child": return personActor(context.child, "child") || context.ruler;
        case "elder": return personActor(context.elder, "elder") || context.ruler;
        case "resident": return personActor(context.person, "resident") || context.ruler;
        case "ruler": return context.ruler;
        default: return context.ruler;
    }
}
function T(id, category, weight, severity, actor, titles, actions, details, effects = null, requires = null) {
    return { id, category, weight, severity, actor, titles, actions, details, effects, requires };
}

// The base weights are the documented probability table. Situational
// multipliers and a recent-repeat penalty are applied at selection time.
const TEMPLATES = Object.freeze([
    T("dragon-village", "NATURE", 1.2, 3, "dragon",
        ["THE SHADOW OVER THE VILLAGE", "A DRAGON ABOVE THE ROOFS"],
        [({ actor, place }) => `${actor.name} crossed the sky above ${place} at dusk, close enough that the thatch shivered in the downdraught`,
         ({ actor, place }) => `${actor.name} descended over ${place} and scattered the evening market with a single pass`],
        [({ c }) => `No roof burned, but stores were lost in the panic and ${c.kingdom} will speak of its dragon for years.`,
         ({ c }) => `The watchfires burned until dawn; the realm counts the cost in food and shaken nerves.`],
        { food: -2, morale: -0.6 }, c => Boolean(c.dragon)),
    T("dragon-hoard", "NATURE", 0.9, 2, "dragon",
        ["A DRAGON'S GIFT", "SOMETHING FROM THE HIGH PLACE"],
        [({ actor, place }) => `${actor.name} returned to ${place} carrying a blackened strongbox in its claws`,
         ({ actor }) => `${actor.name} left a heap of old coins on the flagstones and would not say where they came from`],
        [({ c }) => `The treasury gained a little weight; the story gained far more.`,
         ({ c }) => `${c.ruler.name} ordered the coins counted twice before they entered the chest.`],
        { gold: 2 }, c => Boolean(c.dragon)),
    T("dragon-shadow", "OMENS", 1.0, 2, "dragon",
        ["A SHADOW WITHOUT A CLOUD", "THE WING OVER THE KEEP"],
        [({ actor, place }) => `${actor.name} circled ${place} three times before turning back toward the hills`,
         ({ actor, place }) => `${actor.name} passed over ${place} without a sound, and the bells rang late`],
        [({ c }) => `The court read the flight as an omen; morale slipped, but no harm was done.`,
         ({ c }) => `${c.ruler.name} watched from the tower until the shape was gone.`],
        { morale: -0.3 }, c => Boolean(c.dragon)),
    T("dragon-hunger", "NATURE", 0.8, 2, "dragon",
        ["THE HUNGRY WING", "A TRIBUTE FOR THE DRAGON"],
        [({ actor, place }) => `${actor.name} took a share of the stores at ${place} before the keepers could close the doors`,
         ({ actor }) => `${actor.name} refused the ordinary feed and demanded more`],
        [({ c }) => `The keepers yielded a little food and kept the peace.`,
         ({ c }) => `${c.kingdom} will need a fuller granary before winter.`],
        { food: -1 }, c => Boolean(c.dragon)),
    T("knight-foot", "WAR", 2.2, 2, "soldier",
        ["A KNIGHT'S MISSTEP", "BLOOD ON THE DRILL FIELD", "THE CUT BOOT"],
        [({ actor, place }) => `${actor.name} caught a spur on a practice sword at ${place} and opened a boot to the ankle`,
         ({ actor, place }) => `${actor.name} stumbled during the evening drill at ${place} and laid open a foot on a discarded blade`],
        [({ actor, c }) => `A healer closed the wound; the garrison will remember the lesson in ${c.kingdom}.`,
         ({ actor }) => `${actor.name} limped back to the barracks and swore to oil every scabbard himself.`],
        { morale: -0.2 }, c => c.soldiers.length > 0),
    T("sword-rust", "WAR", 1.6, 1, "soldier",
        ["THE RED BLADE", "A SWORD LEFT IN THE RAIN"],
        [({ actor, place }) => `${actor.name} found a sword rusting under a saddle at ${place}`,
         ({ actor, place }) => `${actor.name} spent the morning scraping rust from a blade at ${place}`],
        [({ c }) => `The weapon was saved, though the quartermaster's temper was not.`,
         ({ c }) => `${c.kingdom}'s garrison has learned to oil its steel before the rain.`],
        null, c => c.soldiers.length > 0),
    T("night-watch", "WAR", 1.8, 1, "soldier",
        ["A LIGHT ON THE WALL", "THE LONG WATCH"],
        [({ actor, place }) => `${actor.name} kept the watch at ${place} until the first grey light`,
         ({ actor, place }) => `${actor.name} walked the wall at ${place} twice before the bell`],
        [({ c }) => `Nothing moved in the dark; the realm slept a little easier.`,
         ({ c }) => `${c.ruler.name} sent a cup of hot wine to the watch before dawn.`],
        { morale: 0.1 }, c => c.soldiers.length > 0),
    T("border-riders", "WAR", 1.5, 2, "soldier",
        ["RIDERS ON THE BORDER", "A DUST CLOUD IN THE EAST"],
        [({ actor, place }) => `${actor.name} sighted three riders from ${place} and raised the alarm`,
         ({ actor }) => `${actor.name} brought word of unfamiliar horses beyond the boundary stones`],
        [({ c }) => `The riders turned aside; no sword was drawn, but the watch doubled.`,
         ({ c }) => `${c.kingdom} sent a patrol to the frontier and found only cold ash.`],
        { morale: -0.1 }, c => c.soldiers.length > 0 && c.atWar),
    T("training-bruise", "WAR", 1.7, 1, "soldier",
        ["A HARD LESSON", "THE BRUISED RECRUIT"],
        [({ actor, place }) => `${actor.name} took a shield boss to the ribs at ${place}`,
         ({ actor, place }) => `${actor.name} was knocked flat during a formation drill at ${place}`],
        [({ c }) => `The recruit rose, spat, and tried again; the drillmaster allowed it.`,
         ({ c }) => `The bruise will heal faster than the lesson will fade.`],
        { morale: -0.1 }, c => c.soldiers.length > 0),
    T("ruler-insomnia", "COURT", 1.6, 1, "ruler",
        ["A CROWN WITHOUT SLEEP", "THE HOUR BEFORE DAWN"],
        [({ actor, place }) => `${actor.name} left the royal bed and walked ${place} before dawn`,
         ({ actor }) => `${actor.name} sat with the ledgers until the candles guttered`],
        [({ c }) => `The court pretended not to notice; the realm's mood darkened by a hair.`,
         ({ c }) => `${c.kingdom} still needs a steady hand, and a rested one.`],
        { morale: -0.1 }),
    T("steward-ledger", "COURT", 1.5, 1, "resident",
        ["A LINE IN THE LEDGER", "THE STEWARD'S DISCOVERY"],
        [({ actor, place }) => `${actor.name} found a forgotten tally at ${place} that returned a coin to the treasury`,
         ({ actor }) => `${actor.name} caught a double entry before it reached the royal seal`],
        [({ c }) => `The sum was small, but the habit of checking was worth more.`,
         ({ c }) => `${c.ruler.name} ordered the ledger copied for the next audit.`],
        { gold: 1 }),
    T("servant-letter", "COURT", 1.4, 1, "resident",
        ["A LETTER UNDER THE DOOR", "THE UNSEALED PAGE"],
        [({ actor, place }) => `${actor.name} found a letter beneath a door at ${place}`,
         ({ actor }) => `${actor.name} was handed a page with no seal and no signature`],
        [({ c }) => `The words were ordinary; the fact that no one claimed them was not.`,
         ({ c }) => `${c.kingdom} filed the page away and asked no further questions.`]),
    T("bard-song", "COURT", 1.8, 1, "resident",
        ["A SONG IN THE HALL", "THE BARD'S NEW VERSE"],
        [({ actor, place }) => `${actor.name} sang a new verse at ${place}, and the hall joined the refrain`,
         ({ actor }) => `${actor.name} turned the week's small troubles into a song`],
        [({ c }) => `For one evening, the realm forgot its ledgers.`,
         ({ c }) => `${c.ruler.name} called for the verse again before the candles died.`],
        { morale: 0.2 }),
    T("child-kite", "PEOPLE", 1.7, 1, "child",
        ["A KITE OVER THE ROOFS", "THE PAPER BIRD"],
        [({ actor, place }) => `${actor.name} flew a paper kite from ${place} until it caught the keep's weathervane`,
         ({ actor, place }) => `${actor.name} chased a red kite across ${place}`],
        [({ c }) => `A guard retrieved it; the child's laughter carried farther than the bell.`,
         ({ c }) => `${c.kingdom} lost nothing but an afternoon's worry.`],
        { morale: 0.2 }, c => c.children.length > 0),
    T("birth-cradle", "PEOPLE", 1.2, 1, "resident",
        ["A NEW CRADLE", "THE HOUSEHOLD GROWS"],
        [({ actor, place }) => `${actor.name} helped carry a new cradle into a house at ${place}`,
         ({ actor, place }) => `${actor.name} stood as witness for a birth at ${place}`],
        [({ c }) => `The household has one more mouth and one more reason to hope.`,
         ({ c }) => `${c.kingdom} recorded the name before the ink was dry.`],
        { morale: 0.2 }),
    T("funeral-bell", "PEOPLE", 1.0, 2, "resident",
        ["THE BELL FOR THE DEAD", "A PROCESSION IN THE RAIN"],
        [({ actor, place }) => `${actor.name} rang the slow bell for a household at ${place}`,
         ({ actor, place }) => `${actor.name} walked behind a covered bier at ${place}`],
        [({ c }) => `The realm paused, and the ordinary work waited.`,
         ({ c }) => `${c.ruler.name} sent a lamp to the family and said nothing more.`],
        { morale: -0.3 }),
    T("healer-herb", "PEOPLE", 1.4, 1, "resident",
        ["A BUNDLE OF HERBS", "THE HEALER'S GARDEN"],
        [({ actor, place }) => `${actor.name} gathered a bundle of bitterleaf at ${place}`,
         ({ actor, place }) => `${actor.name} traded for clean linen at ${place}`],
        [({ c }) => `The medicine shelf is a little fuller, and the healer a little less worried.`,
         ({ c }) => `${c.kingdom} has learned which hedges to leave unburned.`]),
    T("old-soldier-story", "PEOPLE", 1.2, 1, "elder",
        ["THE OLD SOLDIER'S STORY", "A SEAT BY THE FIRE"],
        [({ actor, place }) => `${actor.name} told the old campaign story again at ${place}`,
         ({ actor, place }) => `${actor.name} was given the warm seat at ${place} and took it`],
        [({ c }) => `The younger soldiers listened, and the hall felt warmer.`,
         ({ c }) => `${c.kingdom} keeps its veterans close, even when the wars are far away.`],
        { morale: 0.2 }, c => c.elders.length > 0),
    T("market-haggle", "ECONOMY", 2.0, 1, "resident",
        ["A GOOD BARGAIN", "THE MARKET FINDS ITS PRICE"],
        [({ actor, place }) => `${actor.name} drove a hard bargain at ${place} and came away with a few extra coins`,
         ({ actor, place }) => `${actor.name} sold a small surplus at ${place} before the rain`],
        [({ c }) => `The gain was modest; the market's confidence was not.`,
         ({ c }) => `${c.ruler.name} noted that the stalls were busier than yesterday.`],
        { gold: 1 }),
    T("bakery-burn", "ECONOMY", 1.1, 2, "resident",
        ["SMOKE FROM THE OVEN", "A BATCH LOST"],
        [({ actor, place }) => `${actor.name} pulled a scorched tray from the oven at ${place}`,
         ({ actor, place }) => `${actor.name} found the bakery full of smoke at ${place}`],
        [({ c }) => `The flour was saved, but the morning bread was not.`,
         ({ c }) => `${c.kingdom} will smell burnt crust for a week.`],
        { food: -1 }),
    T("merchant-road", "ECONOMY", 1.6, 2, "resident",
        ["THE ROAD BRINGS COMPANY", "A CARAVAN AT THE GATE"],
        [({ actor, place }) => `${actor.name} welcomed a small caravan at ${place}`,
         ({ actor, place }) => `${actor.name} guided traders through ${place} before the gate closed`],
        [({ c }) => `The tolls and sales added a little weight to the treasury.`,
         ({ c }) => `${c.kingdom} now has a new name for the road and a new reason to keep it clear.`],
        { gold: 2 }),
    T("missing-sheep", "ECONOMY", 1.5, 1, "resident",
        ["THE EMPTY PEN", "A SHEPHERD'S COUNT"],
        [({ actor, place }) => `${actor.name} counted the flock twice at ${place} and found one missing`,
         ({ actor, place }) => `${actor.name} followed small hoofprints away from ${place}`],
        [({ c }) => `The sheep was not found; the pen was mended before dusk.`,
         ({ c }) => `${c.kingdom} counts the loss in meat and wool, not in coin.`],
        { food: -1 }),
    T("mill-wheel", "ECONOMY", 1.4, 1, "resident",
        ["THE STUCK WHEEL", "A DAY WITHOUT FLOUR"],
        [({ actor, place }) => `${actor.name} found the mill wheel jammed at ${place}`,
         ({ actor, place }) => `${actor.name} spent the morning freeing a cracked axle at ${place}`],
        [({ c }) => `The repair cost timber, but the wheel turned again by evening.`,
         ({ c }) => `${c.kingdom} will eat a little later tonight.`],
        { wood: -1 }),
    T("coin-clip", "ECONOMY", 1.1, 2, "resident",
        ["A SHAVED COIN", "THE TALE OF THE SCALES"],
        [({ actor, place }) => `${actor.name} caught a clipped coin in the till at ${place}`,
         ({ actor, place }) => `${actor.name} found the market scales were a hair too light at ${place}`],
        [({ c }) => `The cheat was gone before the guard arrived; the loss stayed.`,
         ({ c }) => `${c.kingdom} will weigh every payment twice this week.`],
        { gold: -1 }),
    T("harvest-basket", "ECONOMY", 1.8, 1, "resident",
        ["A BASKET AT THE DOOR", "THE FIRST FRUIT"],
        [({ actor, place }) => `${actor.name} left a basket of first fruit at ${place}`,
         ({ actor, place }) => `${actor.name} brought in a small harvest from ${place}`],
        [({ c }) => `The stores rose, and the household was thanked in the hall.`,
         ({ c }) => `${c.kingdom} is a little further from an empty table.`],
        { food: 2 }),
    T("storm-roof", "DISASTER", 1.4, 2, "resident",
        ["A ROOF IN THE STORM", "THE WIND FROM THE HILLS"],
        [({ actor, place }) => `${actor.name} lashed down a roof at ${place} as the storm broke`,
         ({ actor, place }) => `${actor.name} lost a shutter and part of a fence at ${place}`],
        [({ c }) => `The damage was repaired with timber from the common store.`,
         ({ c }) => `${c.kingdom} will feel the draught until the new shingles are laid.`],
        { wood: -1 }),
    T("river-flood", "DISASTER", 0.8, 3, "resident",
        ["THE RIVER BREAKS ITS BANKS", "WATER IN THE LOW FIELDS"],
        [({ actor, place }) => `${actor.name} saw the river rise over its bank at ${place}`,
         ({ actor, place }) => `${actor.name} pulled a cart clear of the flood at ${place}`],
        [({ c }) => `Grain and timber were lost; no one in the household was carried away.`,
         ({ c }) => `${c.kingdom} will remember where the water reached.`],
        { food: -1, wood: -1 }),
    T("lightning-tree", "NATURE", 1.5, 1, "resident",
        ["A TREE SPLIT BY LIGHT", "THE THUNDER OAK"],
        [({ actor, place }) => `${actor.name} found an oak split cleanly by lightning at ${place}`,
         ({ actor, place }) => `${actor.name} hauled a fallen limb from ${place}`],
        [({ c }) => `The timber was usable, and the road was clear by noon.`,
         ({ c }) => `${c.kingdom} gained a little firewood and a story about the sky.`],
        { wood: 1 }),
    T("wolf-sheep", "NATURE", 1.4, 2, "resident",
        ["WOLVES AT THE PEN", "A TRACK IN THE MUD"],
        [({ actor, place }) => `${actor.name} drove wolves away from a pen at ${place}`,
         ({ actor, place }) => `${actor.name} found tracks circling the flock at ${place}`],
        [({ c }) => `One sheep was lost before the dogs arrived.`,
         ({ c }) => `${c.kingdom} will keep the flock closer for a while.`],
        { food: -1 }),
    T("birds-field", "NATURE", 1.8, 1, "resident",
        ["BIRDS IN THE SEED", "A CLOUD OF WINGS"],
        [({ actor, place }) => `${actor.name} chased a flock from the newly sown rows at ${place}`,
         ({ actor, place }) => `${actor.name} set a scarecrow in the field at ${place}`],
        [({ c }) => `Some seed was taken; the scarecrow will do the rest.`,
         ({ c }) => `${c.kingdom} has learned to sow a little deeper.`],
        { food: -1 }),
    T("spring-bloom", "NATURE", 1.7, 1, "resident",
        ["THE FIRST BLOSSOM", "A GREEN MORNING"],
        [({ actor, place }) => `${actor.name} found the first blossom open at ${place}`,
         ({ actor, place }) => `${actor.name} brought a branch of new green into ${place}`],
        [({ c }) => `The household took it as a good sign.`,
         ({ c }) => `${c.kingdom} has survived another winter.`],
        { morale: 0.2 }),
    T("earth-tremor", "DISASTER", 0.9, 2, "resident",
        ["THE GROUND SHUDDERS", "A CRACK IN THE STONE"],
        [({ actor, place }) => `${actor.name} felt the ground move under ${place}`,
         ({ actor, place }) => `${actor.name} found a new crack in a wall at ${place}`],
        [({ c }) => `A little stone was lost; the wall still stands.`,
         ({ c }) => `${c.kingdom} will watch the old masonry for a season.`],
        { stone: -1 }),
    T("pilgrim-relic", "FAITH", 1.4, 1, "resident",
        ["A PILGRIM'S TOKEN", "THE LITTLE RELIC"],
        [({ actor, place }) => `${actor.name} was given a worn pilgrim token at ${place}`,
         ({ actor, place }) => `${actor.name} lit a candle beside a traveller's staff at ${place}`],
        [({ c }) => `The token is worth little; the gesture is worth more.`,
         ({ c }) => `${c.kingdom} has a new story for the shrine.`],
        { morale: 0.3 }),
    T("bell-tower", "FAITH", 1.5, 1, "resident",
        ["THE BELLS AT NOON", "A CLEARER NOTE"],
        [({ actor, place }) => `${actor.name} tightened the bell rope at ${place}`,
         ({ actor, place }) => `${actor.name} rang the noon bell a little early at ${place}`],
        [({ c }) => `The note carried across the fields; people looked up.`,
         ({ c }) => `${c.kingdom} keeps its hours by a sound it trusts.`],
        { morale: 0.2 }),
    T("heresy-chalk", "FAITH", 1.0, 2, "resident",
        ["CHALK ON THE SHRINE", "A WORD IN THE NIGHT"],
        [({ actor, place }) => `${actor.name} found a challenge written in chalk at ${place}`,
         ({ actor, place }) => `${actor.name} scraped an old symbol from a door at ${place}`],
        [({ c }) => `No one confessed; the congregation is quieter than before.`,
         ({ c }) => `${c.kingdom} will discuss the meaning long after the chalk is gone.`],
        { morale: -0.2 }),
    T("festival-ribbon", "FAITH", 1.5, 1, "resident",
        ["RIBBONS AT THE CROSSROADS", "A SMALL FESTIVAL"],
        [({ actor, place }) => `${actor.name} tied ribbons at ${place} for the turning of the season`,
         ({ actor, place }) => `${actor.name} shared a honey cake at ${place}`],
        [({ c }) => `The celebration was small and the bread a little short.`,
         ({ c }) => `${c.kingdom} remembered how to laugh.`],
        { food: -1, morale: 0.3 }),
    T("comet", "OMENS", 1.2, 2, "resident",
        ["A STAR WITH A TAIL", "THE NIGHT SIGN"],
        [({ actor, place }) => `${actor.name} saw a pale comet over ${place} and called the household out`,
         ({ actor, place }) => `${actor.name} watched the sky from ${place} until the fire died`],
        [({ c }) => `The priests disagree about the meaning; the realm feels watched.`,
         ({ c }) => `${c.ruler.name} ordered the astronomers to write down the hour.`],
        { morale: -0.2 }),
    T("ruin-door", "EXPLORATION", 1.0, 2, "resident",
        ["A DOOR IN THE HILL", "THE OLD STONE SPEAKS"],
        [({ actor, place }) => `${actor.name} found a stone door half-buried at ${place}`,
         ({ actor, place }) => `${actor.name} brought back a carved lintel from ${place}`],
        [({ c }) => `The find brought a little old metal to the treasury.`,
         ({ c }) => `${c.kingdom} now has a ruin it cannot explain.`],
        { gold: 1 }),
    T("old-map", "EXPLORATION", 1.3, 1, "resident",
        ["THE MAP WITHOUT A NAME", "A ROAD THAT ISN'T THERE"],
        [({ actor, place }) => `${actor.name} copied an old map at ${place}`,
         ({ actor, place }) => `${actor.name} argued with a traveller over a missing road at ${place}`],
        [({ c }) => `The map leads nowhere yet; the argument lasted until supper.`,
         ({ c }) => `${c.kingdom} will send someone to look when the harvest is in.`]),
    T("raven", "OMENS", 1.5, 1, "resident",
        ["THE RAVEN ON THE GATE", "A BIRD THAT WOULD NOT LEAVE"],
        [({ actor, place }) => `${actor.name} found a raven watching from the gate at ${place}`,
         ({ actor, place }) => `${actor.name} tried three times to drive a raven from ${place}`],
        [({ c }) => `The bird left at dusk; the household did not forget it.`,
         ({ c }) => `${c.kingdom} has never agreed on what the bird meant.`],
        { morale: -0.1 }),
    T("lost-road", "EXPLORATION", 1.4, 1, "resident",
        ["THE ROAD THAT ENDED", "A TURN IN THE MARSHES"],
        [({ actor, place }) => `${actor.name} followed an old road out of ${place} until it vanished`,
         ({ actor, place }) => `${actor.name} marked a safe turn through the marsh beyond ${place}`],
        [({ c }) => `The path is longer now, but the carts no longer vanish.`,
         ({ c }) => `${c.kingdom} has added one more line to its mental map.`]),
    T("plague-rat", "DISASTER", 0.9, 2, "resident",
        ["RATS IN THE GRANARY", "A SCUTTLE AFTER DARK"],
        [({ actor, place }) => `${actor.name} found rats in the lower store at ${place}`,
         ({ actor, place }) => `${actor.name} caught the smell of a dead rat behind a wall at ${place}`],
        [({ c }) => `The grain was turned and the cats were fed; the household is uneasy.`,
         ({ c }) => `${c.kingdom} will watch the stores for fever.`],
        { morale: -0.3 }),
    T("well-water", "PEOPLE", 1.5, 1, "resident",
        ["CLEAR WATER", "THE WELL IS SWEET AGAIN"],
        [({ actor, place }) => `${actor.name} drew the first clear bucket from ${place} after the repairs`,
         ({ actor, place }) => `${actor.name} cleaned the leaves from ${place}`],
        [({ c }) => `The household drinks a little easier tonight.`,
         ({ c }) => `${c.kingdom} has one less small worry.`],
        { morale: 0.1 }),
    T("festival-fire", "DISASTER", 0.9, 2, "resident",
        ["FIRE AT THE FESTIVAL", "SPARKS IN THE NIGHT"],
        [({ actor, place }) => `${actor.name} beat out a burning ribbon at ${place}`,
         ({ actor, place }) => `${actor.name} pulled a lantern down before it caught a stall at ${place}`],
        [({ c }) => `The celebration ended early and a little timber was lost.`,
         ({ c }) => `${c.kingdom} will hang its lanterns higher next year.`],
        { wood: -1, morale: -0.2 }),
    T("tax-collector", "ECONOMY", 1.3, 1, "ruler",
        ["THE COLLECTOR'S ROUND", "A FULLER TILL"],
        [({ actor, place }) => `${actor.name} reviewed the collector's tally at ${place}`,
         ({ actor, place }) => `${actor.name} signed a corrected warrant at ${place}`],
        [({ c }) => `A little revenue that had been missed reached the treasury.`,
         ({ c }) => `${c.kingdom} will not need to ask twice next season.`],
        { gold: 1 }),
    T("wandering-scholar", "EXPLORATION", 1.1, 1, "resident",
        ["A SCHOLAR AT THE GATE", "THE ROAD-WORN BOOK"],
        [({ actor, place }) => `${actor.name} offered a road-worn book to the keep at ${place}`,
         ({ actor, place }) => `${actor.name} copied a traveller's notes at ${place}`],
        [({ c }) => `The book is unfinished, but the margin notes are useful.`,
         ({ c }) => `${c.kingdom} has gained a question worth keeping.`],
        { morale: 0.2 }),
    T("child-fever", "PEOPLE", 1.0, 2, "child",
        ["A FEVER IN THE NIGHT", "THE SMALL PATIENT"],
        [({ actor, place }) => `${actor.name} woke with a fever in a house at ${place}`,
         ({ actor, place }) => `${actor.name} was carried to the healer at ${place}`],
        [({ c }) => `The fever broke before dawn; the household did not sleep.`,
         ({ c }) => `${c.kingdom} will keep the blankets dry and the windows shut.`],
        { morale: -0.2 }, c => c.children.length > 0),
    T("dog-king", "COURT", 1.4, 1, "ruler",
        ["THE HOUND ON THE DAIS", "A PLACE BY THE THRONE"],
        [({ actor, place }) => `${actor.name} allowed the old hound to sleep at ${place}`,
         ({ actor, place }) => `${actor.name} fed the castle dog from the high table at ${place}`],
        [({ c }) => `The courtiers pretended not to smile; the realm did not.`,
         ({ c }) => `${c.ruler.name} has one more loyal subject than yesterday.`],
        { morale: 0.1 }),
    T("argument-hall", "COURT", 1.5, 1, "resident",
        ["A WORD TOO SHARP", "THE HALL GOES QUIET"],
        [({ actor, place }) => `${actor.name} exchanged a sharp word with a steward at ${place}`,
         ({ actor, place }) => `${actor.name} left the hall at ${place} before the argument ended`],
        [({ c }) => `The matter was settled by morning, but the silence lingered.`,
         ({ c }) => `${c.kingdom} has heard sharper words and survived worse.`],
        { morale: -0.1 }),
    T("quiet-banners", "COURT", 1.0, 1, "resident",
        ["BANNERS IN THE WIND", "AN ORDINARY MORNING"],
        [({ actor, place }) => `${actor.name} crossed ${place} while the banners moved over the hall`,
         ({ actor, place }) => `${actor.name} took the long way through ${place} and found nothing amiss`],
        [({ c }) => `The realm has no new trouble today, and that is worth recording.`,
         ({ c }) => `${c.kingdom} is still here, and the ledger still balances.`])
]);

export const MICRO_EVENT_TEMPLATES = TEMPLATES;
export const MICRO_EVENT_CADENCE = Object.freeze({ minDays: 2, maxDays: 5, firstMin: 2, firstMax: 6 });

function round(value, places = 2) {
    const scale = 10 ** places;
    return Math.round((Number(value) || 0) * scale) / scale;
}
function signed(value) { return (value > 0 ? "+" : "") + value; }
function situationalWeight(spec, context, timeline) {
    let weight = Number(spec.weight) || 1;
    if (spec.category === "WAR" && context.atWar) weight *= 2.2;
    if (spec.category === "DISASTER" && /rain|storm|snow|fog|thunder/.test(context.weather)) weight *= 1.35;
    if (spec.category === "NATURE" && context.season === "Winter") weight *= 1.35;
    if (spec.category === "ECONOMY" && (context.gold < 25 || context.food < 30)) weight *= 1.2;
    if (spec.category === "PEOPLE" && context.population > 25) weight *= 1.15;
    if (spec.category === "FAITH" && context.temples > 0) weight *= 1.1;
    const recent = (timeline?.events || []).slice(0, 8).filter(event => event.templateId === spec.id).length;
    // The realm remembers what just happened. This prevents a single quirky
    // template from monopolising a timeline without making it impossible.
    return Math.max(0.05, weight / (1 + recent * 2));
}
function chooseTemplate(context) {
    const timeline = state.eventTimeline;
    const candidates = TEMPLATES.filter(spec => !spec.requires || spec.requires(context));
    const options = candidates.map(spec => ({ spec, weight: situationalWeight(spec, context, timeline) }));
    const total = options.reduce((sum, option) => sum + option.weight, 0);
    if (!options.length || total <= 0) return TEMPLATES.find(spec => spec.id === "quiet-banners") || null;
    let roll = random(STREAM) * total;
    for (const option of options) {
        roll -= option.weight;
        if (roll <= 0) return option.spec;
    }
    return options[options.length - 1].spec;
}
function participant(actor) {
    return { personId: actor.personId || null, name: actor.name, role: actor.role || "witness" };
}
function makeDraft(spec, context) {
    const actor = actorFor(context, spec.actor);
    if (!actor || !clean(actor.name)) return null;
    const other = personActor(context.other, "witness");
    const place = pick(context.places);
    const args = { actor, place, c: context, other: other && other.name !== actor.name ? other : null };
    const title = clean(pick(spec.titles)) || "A RECORDED EVENT";
    const action = sentence(pick(spec.actions)(args));
    const detail = sentence(pick(spec.details)(args));
    if (!action) return null;
    const participants = [participant(actor)];
    if (args.other) participants.push(participant(args.other));
    return {
        tick: Number(state.tick) || 0,
        year: context.year,
        day: context.day,
        category: spec.category,
        severity: spec.severity,
        title: title.toUpperCase(),
        text: action + (detail ? ". " + detail : "") + ".",
        location: place,
        participants,
        templateId: spec.id
    };
}
function applyImpact(effects) {
    if (!effects || typeof effects !== "object") return null;
    const parts = [];
    const impact = { morale: 0, resources: {} };
    const moraleBefore = Number(state.morale) || 0;
    const moraleDelta = Number(effects.morale) || 0;
    if (moraleDelta) {
        state.morale = Math.max(0, Math.min(100, moraleBefore + moraleDelta));
        impact.morale = round(state.morale - moraleBefore);
        if (impact.morale) parts.push("MORALE " + signed(impact.morale));
    }
    if (effects.resources && typeof effects.resources === "object") {
        for (const key of RESOURCE_KEYS) {
            const requested = Number(effects.resources[key]) || 0;
            if (!requested) continue;
            const before = Number(state.resources?.[key]) || 0;
            state.resources[key] = Math.max(0, before + requested);
            const actual = round(state.resources[key] - before);
            if (!actual) continue;
            impact.resources[key] = actual;
            parts.push(key.toUpperCase() + " " + signed(actual));
        }
    }
    if (!parts.length) return null;
    impact.summary = parts.join(" · ");
    return impact;
}

// Called once from the fixed simulation step. The due check is O(1); the
// catalogue and the world scan run only on the 2–5 day event boundary.
// Build the shared context once behind the start screen. It only reads and
// classifies the opening realm; the first chronicle tick reuses the warmed
// templates and entity arrays instead of allocating them during play.
export function warmMicroEventContext() {
    buildContext();
    return true;
}

export function updateMicroEvents() {
    if (!state.hasStarted || state.isPaused || state.gameOver) return null;
    if (!state.eventTimeline || typeof state.eventTimeline !== "object") {
        state.eventTimeline = createEventTimelineState();
    }
    const timeline = state.eventTimeline;
    if (!Array.isArray(timeline.events)) timeline.events = [];
    const next = Number(timeline.nextEventTick);
    if (!Number.isFinite(next) || next <= 0) {
        timeline.nextEventTick = (Number(state.tick) || 0) + randInt(MICRO_EVENT_CADENCE.firstMin, MICRO_EVENT_CADENCE.firstMax + 1, STREAM);
        return null;
    }
    if ((Number(state.tick) || 0) < next) return null;
    timeline.nextEventTick = (Number(state.tick) || 0) + randInt(MICRO_EVENT_CADENCE.minDays, MICRO_EVENT_CADENCE.maxDays + 1, STREAM);
    const context = buildContext();
    const spec = chooseTemplate(context);
    if (!spec) return null;
    const draft = makeDraft(spec, context);
    if (!draft) return null;
    draft.impact = applyImpact(spec.effects);
    const entry = appendTimelineEvent(timeline, draft);
    if (!entry) return null;
    queuePresentationEffect({ type: "timeline-event", event: entry });
    // `addLog` now bridges world events into the same timeline. Micro events
    // append exactly once here, so they must not be logged a second time.
    return entry;
}
