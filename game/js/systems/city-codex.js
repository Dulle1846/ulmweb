// The City Codex is the browsable face of the settlement content. Every entry
// maps to a real buildable type and carries a short, honest explanation of the
// simulation effect. Portraits are lazy-loaded; the codex never adds per-tick
// work to the simulation.
export const CITY_CODEX = Object.freeze([
    { type: 0, slug: "keep", name: "Royal Keep", category: "CROWN", description: "The seat of the crown, a general store and the last refuge of the realm.", effect: "Unlocks royal management, stores every good and anchors the settlement." },
    { type: 1, slug: "cottage", name: "Timber Cottage", category: "HOUSING", description: "A timber-framed home for a working household.", effect: "Houses 4 residents; comfort and warmth shape satisfaction and productivity." },
    { type: 2, slug: "farm", name: "Farmstead", category: "FOOD", description: "A ploughed field, barn and farmhouse worked through the seasons.", effect: "Grows grain, feeds the farming household and supplies the mill and brewery." },
    { type: 3, slug: "lumber", name: "Lumber Camp", category: "TIMBER", description: "A working camp at the edge of a surveyed forest.", effect: "Harvests finite forest stock and adds construction timber to the royal stores." },
    { type: 4, slug: "quarry", name: "Stone Quarry", category: "STONE", description: "A quarry cutting blocks from a surveyed deposit.", effect: "Extracts finite stone and produces stone blocks for masons and builders." },
    { type: 5, slug: "watchtower", name: "Watchtower", category: "DEFENCE", description: "A tall tower watching the roads and the horizon.", effect: "Extends safety coverage; a manned tower makes outlying homes safer." },
    { type: 6, slug: "wall", name: "Curtain Wall", category: "DEFENCE", description: "A disciplined line of stone and earth around the town.", effect: "Extends safety coverage and protects the settlement from raids." },
    { type: 7, slug: "tavern", name: "Tavern", category: "SOCIAL", description: "The common room where news, ale and a warm fire meet.", effect: "Provides social coverage; ale and food become gold, morale and a livelier town." },
    { type: 8, slug: "temple", name: "Temple", category: "FAITH", description: "A stone church at the heart of the old town.", effect: "Provides faith, health and social coverage; supports legitimacy and public health." },
    { type: 9, slug: "barracks", name: "Barracks", category: "MILITARY", description: "The garrison's hall, armoury and drill yard.", effect: "Houses named soldiers and extends safety coverage over the town." },
    { type: 10, slug: "windmill", name: "Flour Mill", category: "FOOD", description: "A windmill turning grain into flour for the bakeries.", effect: "Consumes grain and produces flour; its sails need a staffed mill floor." },
    { type: 11, slug: "stable", name: "Stable", category: "MILITARY", description: "Horses, tack and the smell of hay at the edge of the yard.", effect: "Holds mounts and supports the garrison's mobility and upkeep." },
    { type: 12, slug: "wonder", name: "Wonder", category: "CROWN", description: "A monument meant to outlive every councillor who approved it.", effect: "A long-term prestige project; its rooms and furniture feed legitimacy and morale." },
    { type: 13, slug: "goldmine", name: "Gold Mine", category: "TREASURY", description: "A shaft following a seam of gold through the hill.", effect: "Produces gold every production tick; winter reduces the yield." },
    { type: 14, slug: "barrel", name: "Supply Barrel", category: "STORAGE", description: "A humble barrel for a yard or a market stall.", effect: "A small local supply point; no interior and no household service." },
    { type: 60, slug: "tent", name: "Tent", category: "HOUSING", description: "Canvas, rope and a family's first foothold in the town.", effect: "Houses 2 residents with low comfort and little warmth." },
    { type: 61, slug: "stone-house", name: "Stone House", category: "HOUSING", description: "A solid stone home with a slate roof and a proper hearth.", effect: "Houses 6 residents; high comfort and the best winter protection." },
    { type: 62, slug: "warehouse", name: "Warehouse", category: "STORAGE", description: "A bounded storehouse for hauled goods and reserved deliveries.", effect: "Stores goods by profile; carriers reserve space before they set out." },
    { type: 63, slug: "sawmill", name: "Sawmill", category: "TIMBER", description: "A water-driven saw bench turning logs into planks and firewood.", effect: "Consumes logs and produces planks and firewood for building and winter." },
    { type: 64, slug: "bakery", name: "Bakery", category: "FOOD", description: "A hot oven, flour dust and the first bread of the morning.", effect: "Consumes flour and produces bread; bread becomes royal food at a store." },
    { type: 65, slug: "well", name: "Well", category: "WATER", description: "A deep well serving the households within its reach.", effect: "Draws water and extends water coverage; a fouled well is a real risk." },
    { type: 66, slug: "mason", name: "Mason's Yard", category: "STONE", description: "A yard of dressed stone, tools and patient craftsmen.", effect: "Consumes stone blocks and produces cut stone for the finest buildings." },
    { type: 67, slug: "forester", name: "Forester's Lodge", category: "NATURE", description: "A lodge for planting, thinning and watching the forest.", effect: "Tends forest stock and helps the woods recover instead of being mined out." },
    { type: 68, slug: "clinic", name: "Clinic", category: "HEALTH", description: "A clean room, a healer's table and a shelf of herbs.", effect: "Extends health coverage; staffed care lowers illness and mortality." },
    { type: 69, slug: "market", name: "Market", category: "TRADE", description: "Awnings, scales, foreign accents and a dozen competing prices.", effect: "Provides social and trade coverage; connects the town to the wider market." },
    { type: 70, slug: "shrine", name: "Shrine", category: "FAITH", description: "A small roadside shrine kept alive with candles and flowers.", effect: "Provides faith and social coverage at a modest cost." },
    { type: 71, slug: "court", name: "Court of Law", category: "JUSTICE", description: "The bench where the town's disputes become a public record.", effect: "Extends justice and safety coverage; supports charters and lawful courts." },
    { type: 72, slug: "prison", name: "Prison", category: "JUSTICE", description: "A guarded house for those awaiting judgement or sentence.", effect: "Extends safety and justice coverage; a visible cost of public order." },
    { type: 73, slug: "town-hall", name: "Town Hall", category: "CIVIC", description: "A council chamber, civic chest and a bell that calls the wards together.", effect: "Adds two ordinance slots and civic-order coverage; enables a governed town." },
    { type: 74, slug: "school", name: "School", category: "LEARNING", description: "A schoolroom for letters, numbers and the next generation of clerks.", effect: "Extends education coverage and lifts household productivity when staffed." },
    { type: 75, slug: "bathhouse", name: "Bathhouse", category: "HEALTH", description: "Steam, hot water and a public room for clean bodies and gossip.", effect: "Needs water and staff; extends health and sanitation coverage." },
    { type: 76, slug: "brewery", name: "Brewery", category: "FOOD", description: "Copper kettles, malt and the yeasty warmth of a working brewhouse.", effect: "Consumes grain and brews ale; a nearby cellar lets taverns sell it." },
    { type: 77, slug: "guildhall", name: "Guildhall", category: "TRADE", description: "A hall for masters, charters, apprentices and arguments about prices.", effect: "Extends trade coverage; pairs with market charters and civic trade policy." },
    { type: 78, slug: "watchhouse", name: "Watchhouse", category: "DEFENCE", description: "A small guard post with a bell, a cell and a map of the wards.", effect: "Extends safety coverage; the night watch makes crowded streets calmer." },
    { type: 79, slug: "smithy", name: "Smithy", category: "CRAFT", description: "A working forge where a named smith turns fuel, timber and imported iron into a unique weapon.", effect: "Consumes planks and firewood and spends gold on imported iron; one staffed workshop records at most one player-made weapon per season." },
    { type: 80, slug: "scriptorium", name: "Scriptorium", category: "LEARNING", description: "A writing room where a named scribe turns boards, water and imported parchment into a unique book.", effect: "Consumes planks and water and spends gold on parchment and ink; one staffed workshop records at most one player-made book per season." }
]);

const CODEX_BY_TYPE = new Map(CITY_CODEX.map(entry => [entry.type, entry]));

export function codexForType(type) {
    return CODEX_BY_TYPE.get(Number(type)) || null;
}
