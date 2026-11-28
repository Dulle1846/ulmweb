// Content pack for 1.2.23.2–16. Pure data: every family gets four more
// cohorts (to twelve), three more rare species (to six), three more named
// disturbances (to six), two more goods (to four), extra relict layers and six
// long-term field notes. A field note is unlocked by a real counter or state,
// never by a timer alone, so the pack extends play without a second system.
//
// The catalogue module merges this data into the existing family definitions.
// Nothing here runs per frame, per tick or per tile.

const freeze = Object.freeze;
const species = (id, label, kind, cover, note) => freeze({ id, label, kind, cover, note });
const specialist = (id, label, kind, note) => freeze({ id, label, kind, note });
const hazard = (id, label, trigger, effect) => freeze({ id, label, trigger, effect });
const good = (id, label, value, annual, note) => freeze({ id, label, value, annual, note });
const note = (id, label, detail, goal, at, goalLabel, reward) => freeze({
    id, label, detail, goal, at, goalLabel,
    reward: freeze({ gold: reward.gold || 0, morale: reward.morale || 0 }),
});

const family = value => freeze({
    species: freeze(value.species),
    specialists: freeze(value.specialists),
    hazards: freeze(value.hazards),
    goods: freeze(value.goods),
    relics: freeze(value.relics),
    journal: freeze(value.journal),
});

export const BIOME_FRONTIER_EXPANSION = freeze({
    "savanna-dry-woodland": family({
        species: [
            species("african-wild-dog", "African Wild Dog", "animal", 5, "packs range across the whole grass mosaic"),
            species("marabou-stork", "Marabou Stork", "animal", 4, "scavenges the dry-season kills"),
            species("buffalo-grass", "Buffalo Grass", "plant", 18, "short sod holds the grazed ground"),
            species("desert-date", "Desert Date", "tree", 6, "thorny evergreen in the dry river line"),
        ],
        specialists: [
            specialist("ground-pangolin", "Ground Pangolin", "animal", "opens old termite mounds and is protected by the warden"),
            specialist("carmine-bee-eater", "Carmine Bee-eater", "animal", "nests in the cut banks of the dry river"),
            specialist("baobab-longhorn", "Baobab Longhorn Beetle", "animal", "its larvae hollow only standing dead wood"),
        ],
        hazards: [
            hazard("early-flood", "Early Flash Flood", "a dry river rises after a distant storm", "drowns ground nests, scours grass and deposits fresh sand"),
            hazard("charcoal-clearance", "Charcoal Clearance", "the town's fuel demand reaches the woodland", "thins the tree layer and leaves cut stumps"),
            hazard("prickly-pear", "Prickly Pear Spread", "overgrazing leaves bare ground", "a thorny invader closes the grass and blocks herders"),
        ],
        goods: [
            good("marula-oil", "Marula Oil", 9, 2, "cold-pressed from fallen fruit"),
            good("baobab-fibre", "Baobab Fibre", 5, 1, "inner bark cordage, cut only from fallen limbs"),
        ],
        relics: ["Fire-scarred baobab rings", "Cattle-kraal earthworks", "Dry-season fish weir"],
        journal: [
            note("fire-calendar", "Fire Calendar", "Warden marks read grass age, termite mounds and old burns. A planned early burn can hold the canopy open without a crown fire.", "surveys", 1, "Survey the site once", { gold: 18 }),
            note("elephant-corridor", "Elephant Corridor", "The old red-pass route is mapped before the herds arrive, so fields and water points can be moved out of the corridor.", "deep", 1, "Complete a deep survey", { gold: 28, morale: 1 }),
            note("shea-cooperative", "Shea Cooperative", "A village cooperative owns the nut harvest and keeps a third of the grove unburned as a moth refuge.", "conserved", 1, "Sign the warden's agreement", { gold: 30 }),
            note("baobab-water-store", "Baobab Water Store", "A cleaned hollow trunk becomes a dry-season cistern with a stone lid and a strict draw limit.", "restored", 2, "Restore the site twice", { gold: 24, morale: 1 }),
            note("grass-bank", "Grass Bank", "Seed from the best perennial stands is stored in a cool granary, ready for the first year after a failed rain.", "harvested", 3, "Harvest three times", { gold: 20 }),
            note("drought-refuge", "Drought Refuge", "A named refuge keeps one waterhole and one unburned pasture closed to cattle when the drought arrives.", "hazard", 1, "Live through a named disturbance", { gold: 35, morale: 1 }),
        ],
    }),
    mangrove: family({
        species: [
            species("saltwater-crocodile", "Saltwater Crocodile", "animal", 5, "moves between creek and open coast"),
            species("proboscis-monkey", "Proboscis Monkey", "animal", 4, "browses the landward nipa"),
            species("mud-lobster", "Mud Lobster", "animal", 7, "burrows deep in the basin mud"),
            species("mangrove-fern", "Mangrove Fern", "plant", 9, "golden-green ground cover under the roots"),
        ],
        specialists: [
            specialist("goliath-grouper", "Goliath Grouper", "animal", "uses the deep creek as a nursery"),
            specialist("mangrove-whipray", "Mangrove Whipray", "animal", "reads the tide by touch in the turbid water"),
            specialist("king-tide-egret", "King Tide Egret", "animal", "breeds only in the highest heronry trees"),
        ],
        hazards: [
            hazard("wake-erosion", "Cargo-Wake Erosion", "fast boats cut the prop roots", "undercuts the bank and opens a channel through the fringe"),
            hazard("pond-clearing", "Pond Clearing", "shrimp ponds are cut into the landward forest", "removes the freshwater buffer and leaves acid sulphate soil"),
            hazard("plastic-raft", "Plastic Rafting", "flood water carries debris into the roots", "smothers seedlings and traps sediment"),
        ],
        goods: [
            good("mangrove-crab", "Mangrove Crab", 8, 2, "mud crabs from the root terraces"),
            good("nipa-thatch", "Nipa Thatch", 4, 2, "folded fronds for roofs and baskets"),
        ],
        relics: ["Prawn-pond dikes", "Tide-mill footings", "Old salt pans"],
        journal: [
            note("tide-gauge", "Tide Gauge", "A carved pole and a shell clock record the spring tide; the first flood mark becomes a warning for the heronry.", "surveys", 1, "Survey the site once", { gold: 18 }),
            note("nursery-census", "Nursery Census", "Young fish are counted in the root maze at low tide, turning the forest into a measurable fish nursery.", "deep", 1, "Complete a deep survey", { gold: 30 }),
            note("charcoal-kiln", "Charcoal Kiln Cooperative", "A sealed kiln uses fallen wood only, so the black mangrove stays standing and the bank keeps its roots.", "conserved", 1, "Sign the warden's agreement", { gold: 28 }),
            note("storm-belt", "Storm Belt", "A planted seaward fringe is sacrificed to the next surge, protecting the taller basin behind it.", "restored", 2, "Restore the site twice", { gold: 26, morale: 1 }),
            note("salt-fence", "Salt Fence", "A low earth ridge and freshwater lens keep the landward fields from turning brackish during the dry season.", "condition", 78, "Bring condition to 78", { gold: 34 }),
            note("floating-market", "Floating Market", "The honey and crab harvest is sold from boats at the heronry creek, cutting the pressure from outside traders.", "hazard", 1, "Live through a named disturbance", { gold: 32, morale: 1 }),
        ],
    }),
    "coral-coast": family({
        species: [
            species("porites-coral", "Porites Coral", "coral", 15, "massive boulder coral that survives heat"),
            species("giant-moray", "Giant Moray", "animal", 4, "hunts the reef crevices at night"),
            species("sea-cucumber", "Sea Cucumber", "animal", 8, "cleans the lagoon sand"),
            species("cleaner-wrasse", "Cleaner Wrasse", "animal", 5, "keeps the fish cleaning station open"),
        ],
        specialists: [
            specialist("napoleon-wrasse", "Napoleon Wrasse", "animal", "a long-lived reef giant that gathers at spawning time"),
            specialist("banded-sea-krait", "Banded Sea Krait", "animal", "returns to the same beach to lay"),
            specialist("coral-shrimp", "Coral Shrimp", "animal", "lives inside a single branching colony"),
        ],
        hazards: [
            hazard("acidification", "Ocean Acidification", "the warm shallows hold less carbonate", "slows coral skeleton growth and weakens the reef crest"),
            hazard("anchor-damage", "Anchor Damage", "too many boats shelter on the lee shore", "breaks the framework in long scars"),
            hazard("sediment-runoff", "Sediment Runoff", "cleared slopes bleed into the lagoon", "smothers corals and seagrass"),
        ],
        goods: [
            good("coconut-oil", "Coconut Oil", 6, 2, "pressed on the island"),
            good("reef-lime", "Reef Lime", 4, 2, "weathered coral rubble, gathered above the tide"),
        ],
        relics: ["Navigation cairns", "Old fish weir", "Mission bell"],
        journal: [
            note("acoustic-map", "Reef Acoustic Map", "A hydrophone records the crackle of a healthy reef; the sound becomes a cheap early warning for bleaching.", "surveys", 1, "Survey the site once", { gold: 20 }),
            note("coral-nursery", "Coral Nursery", "Fragments are grown on rope frames in the lagoon and returned to the bleached crest once they are palm-sized.", "deep", 1, "Complete a deep survey", { gold: 32 }),
            note("turtle-watch", "Turtle Beach Watch", "Night counts and a roped nest line keep the hatchery beach dark, so the same turtles return.", "conserved", 1, "Sign the warden's agreement", { gold: 30, morale: 1 }),
            note("pearl-guild", "Pearl Guild", "Divers set a size limit and leave the oldest shells; the pearl harvest survives the bad years.", "restored", 2, "Restore the site twice", { gold: 28 }),
            note("bleach-refuge", "Bleach Refuge", "Deep, shaded pockets are left unfished and become a refuge for corals that can reseed the shallow crest.", "specialists", 6, "Keep all six rare species alive", { gold: 36 }),
            note("reef-insurance", "Reef Insurance", "The community pays into a storm fund in good years; after a surge it can hire a reef crew instead of waiting for aid.", "hazard", 1, "Live through a named disturbance", { gold: 38, morale: 1 }),
        ],
    }),
    "alpine-grassland": family({
        species: [
            species("alpine-chough", "Alpine Chough", "animal", 5, "follows the herds for insects"),
            species("mountain-hare", "Mountain Hare", "animal", 6, "turns white before the first lasting snow"),
            species("alpine-clover", "Alpine Clover", "plant", 12, "nitrogen-fixing patches in the turf"),
            species("dwarf-mountain-pine", "Dwarf Mountain Pine", "tree", 7, "creeping shrub at the treeline"),
        ],
        specialists: [
            specialist("bearded-vulture", "Bearded Vulture", "animal", "drops bones on the high scree"),
            specialist("alpine-longhorn", "Alpine Longhorn Beetle", "animal", "needs sun-warmed dead wood"),
            specialist("glacier-flea", "Glacier Flea", "animal", "lives on the snow surface in meltwater films"),
        ],
        hazards: [
            hazard("rockfall", "Rockfall", "a thaw loosens the permafrost cement", "buries turf and opens a raw scree scar"),
            hazard("summer-drought", "Summer Drought", "three rainless weeks at peak growth", "browns the turf and cuts the hay yield"),
            hazard("ski-run", "Ski-Run Construction", "a new piste is graded through the meadow", "removes turf and channels meltwater"),
        ],
        goods: [
            good("alpine-cheese", "Alpine Cheese", 7, 2, "aged in the shieling cellar"),
            good("alpine-wax", "Alpine Wax", 6, 1, "from the resin of dwarf pine"),
        ],
        relics: ["Shieling hearths", "Old salt route", "Snow-fence lines"],
        journal: [
            note("avalanche-fence", "Avalanche Fence", "A line of wooden snow fences is set above the meadow; the drifts protect the turf rather than bury it.", "surveys", 1, "Survey the site once", { gold: 18 }),
            note("shieling-charter", "Shieling Charter", "Herds return to the high meadow only after seed set, and the old shieling becomes a warden's hut.", "deep", 1, "Complete a deep survey", { gold: 28 }),
            note("seed-vault", "Seed Vault", "A dry stone cellar stores alpine clover and fescue seed against a year when the turf fails.", "conserved", 1, "Sign the warden's agreement", { gold: 30 }),
            note("snowbed-monitor", "Snowbed Monitoring", "Late snow patches are measured each spring; the last cool refuges are kept free of grazing.", "restored", 2, "Restore the site twice", { gold: 26, morale: 1 }),
            note("ibex-corridor", "Ibex Corridor", "A quiet ridge links two pastures, so the herd can move without crossing the new road.", "condition", 80, "Bring condition to 80", { gold: 34 }),
            note("alpine-cheese", "Alpine Cheese", "The summer cheese is traded for winter hay; the meadow pays for its own wardens.", "hazard", 1, "Live through a named disturbance", { gold: 32, morale: 1 }),
        ],
    }),
    "subarctic-shrub": family({
        species: [
            species("arctic-hare", "Arctic Hare", "animal", 6, "browses twigs above the snow"),
            species("rough-legged-buzzard", "Rough-legged Buzzard", "animal", 4, "hunts the lemming crash"),
            species("bog-cranberry", "Bog Cranberry", "plant", 10, "acid red fruit in the wet hollows"),
            species("netleaf-willow", "Netleaf Willow", "tree", 8, "low scrub with roots in the thaw layer"),
        ],
        specialists: [
            specialist("arctic-fox", "Arctic Fox", "animal", "follows the lemming cycle into the shrub"),
            specialist("muskox", "Muskox", "animal", "winters on windswept ridges"),
            specialist("bog-fritillary", "Bog Fritillary", "animal", "needs open, wet sedge runs"),
        ],
        hazards: [
            hazard("permafrost-slump", "Permafrost Slump", "a warm summer thaws the ice core", "drops the ground into a thermokarst hollow"),
            hazard("snow-crust", "Rain-on-Snow Crust", "midwinter rain freezes hard", "locks forage under ice and starves browsers"),
            hazard("shrub-encroachment", "Shrub Encroachment", "warming lets willow close the open ground", "shades out lichen and the grazers that need it"),
        ],
        goods: [
            good("cloudberry-preserve", "Cloudberry Preserve", 7, 1, "sealed in birch-bark jars"),
            good("willow-cordage", "Willow Bark Cordage", 4, 1, "strong rope from coppiced stems"),
        ],
        relics: ["Sod-house outlines", "Charcoal pits", "Winter road markers"],
        journal: [
            note("permafrost-borehole", "Permafrost Borehole", "A marked rod measures the active layer each autumn; a deepening thaw warns the herders before the ground fails.", "surveys", 1, "Survey the site once", { gold: 18 }),
            note("reindeer-rotation", "Reindeer Rotation", "The herd moves on a remembered route, leaving each lichen bed two winters to recover.", "deep", 1, "Complete a deep survey", { gold: 30 }),
            note("lichen-garden", "Lichen Garden", "Small fenced plots grow reindeer lichen for the hardest late-winter weeks.", "conserved", 1, "Sign the warden's agreement", { gold: 28 }),
            note("thaw-pond", "Thaw Pond", "A new thermokarst hollow is deepened as a water source and kept clear of trampling.", "restored", 2, "Restore the site twice", { gold: 26, morale: 1 }),
            note("berry-cooperative", "Berry Cooperative", "Cloudberry and cranberry picking is rotated by family, so the seed bank survives the good years.", "harvested", 3, "Harvest three times", { gold: 24 }),
            note("winter-fodder", "Winter Fodder", "Willow tops are cut and stored under snow as emergency browse for reindeer.", "hazard", 1, "Live through a named disturbance", { gold: 34, morale: 1 }),
        ],
    }),
    "ice-desert": family({
        species: [
            species("snowy-owl", "Snowy Owl", "animal", 4, "hunts lemmings over the wind-packed snow"),
            species("arctic-tern", "Arctic Tern", "animal", 4, "nests on the bare shingle"),
            species("blue-ice-algae", "Blue-Ice Algae", "plant", 8, "colours the meltwater films"),
            species("antarctic-icefish", "Antarctic Icefish", "animal", 5, "lives under the shelf ice"),
            species("leopard-seal", "Leopard Seal", "animal", 4, "patrols the open lead"),
        ],
        specialists: [
            specialist("ice-shelf-krill", "Ice-Shelf Krill", "animal", "grazes the algae under the shelf"),
            specialist("antarctic-toothfish", "Antarctic Toothfish", "animal", "grows slowly in the cold deep"),
            specialist("blue-ice-mite", "Blue-Ice Mite", "animal", "survives in the dust of the blue ice"),
        ],
        hazards: [
            hazard("ice-quake", "Ice Quake", "a shelf crack propagates under the plateau", "opens a crevasse and drops the route"),
            hazard("solar-glare", "Solar Glare", "a clear spring day with a low sun", "snow-blindness for survey teams"),
            hazard("fuel-spill", "Fuel Spill", "a depot ruptures on the ice", "poisons the meltwater channel"),
        ],
        goods: [
            good("meteorite-iron", "Meteorite Iron", 12, 1, "fragments found on the blue ice"),
            good("snow-algae-dye", "Snow Algae Dye", 5, 1, "a red pigment gathered from meltwater"),
        ],
        relics: ["Ice-core marker stakes", "Early flight camp", "Sunken sledge"],
        journal: [
            note("ice-core-archive", "Ice-Core Archive", "A shallow core is logged layer by layer; the dust bands date the old storms and give the site a calendar.", "surveys", 1, "Survey the site once", { gold: 20 }),
            note("emperor-watch", "Emperor Watch", "A roped viewing line keeps the colony unvisited during the chick-rearing dark.", "deep", 1, "Complete a deep survey", { gold: 32 }),
            note("meltwater-diversion", "Meltwater Diversion", "A low snow wall turns a summer flood away from the nesting shingle.", "conserved", 1, "Sign the warden's agreement", { gold: 30, morale: 1 }),
            note("seal-quota", "Seal Quota", "The seal oil take is capped and rotated; the ice edge keeps its pupping colony.", "restored", 2, "Restore the site twice", { gold: 28 }),
            note("nunatak-refuge", "Nunatak Refuge", "A bare rock ridge is left free of fuel and foot traffic as a refuge when the shelf cracks.", "condition", 78, "Bring condition to 78", { gold: 34 }),
            note("blue-ice-route", "Blue-Ice Route", "Cairns and flagged poles mark a safe route that moves each season with the snow.", "hazard", 1, "Live through a named disturbance", { gold: 36, morale: 1 }),
        ],
    }),
    "underground-lakes": family({
        species: [
            species("cave-cricket", "Cave Cricket", "animal", 5, "feeds on the drift line"),
            species("cave-hydra", "Cave Hydra", "animal", 3, "clings to the lake ceiling"),
            species("blind-planarian", "Blind Planarian", "animal", 4, "follows the wet rock film"),
            species("calcite-fern", "Calcite Fern", "plant", 7, "crystal-coated fronds by the drip"),
            species("mineral-moss", "Mineral Moss", "plant", 8, "slow green cushions on the flowstone"),
        ],
        specialists: [
            specialist("pale-cave-loach", "Pale Cave Loach", "animal", "feeds on the blind fish eggs"),
            specialist("cave-leech", "Cave Leech", "animal", "waits in the lake outlet"),
            specialist("crystal-caddisfly", "Crystal-winged Caddisfly", "animal", "its larvae build cases from calcite grains"),
        ],
        hazards: [
            hazard("visitor-lamp", "Visitor Lamp Algae", "tour groups bring light and moisture", "green algae smother the cave moss"),
            hazard("sinkhole-drain", "Sinkhole Drain", "the surface lake finds a new crack", "drains the underground lake"),
            hazard("sediment-plug", "Sediment Plug", "a storm flushes soil into the cave", "blocks the stream and drowns the lower gallery"),
        ],
        goods: [
            good("cave-salt", "Cave Salt", 5, 2, "dried from the mineral drip"),
            good("glowworm-silk", "Glowworm Silk", 9, 1, "gathered from abandoned threads"),
        ],
        relics: ["Inscription chamber", "Underground chapel", "Amber cache"],
        journal: [
            note("cave-sonar", "Cave Sonar", "A weighted line and a sounding board map the lake floor; the deep basin is left untouched as a refugium.", "surveys", 1, "Survey the site once", { gold: 20 }),
            note("lampen-flora", "Lampen Flora", "Lamps are kept off the moss beds and a dark corridor is reserved for the glowworms.", "deep", 1, "Complete a deep survey", { gold: 30 }),
            note("blind-fish-hatchery", "Blind Fish Hatchery", "A side pool is stocked with eggs from the lake and kept free of visitors.", "conserved", 1, "Sign the warden's agreement", { gold: 28, morale: 1 }),
            note("bat-gate", "Bat Gate", "A slotted gate keeps people out of the roost while letting the horseshoe bats pass.", "restored", 2, "Restore the site twice", { gold: 26 }),
            note("amber-guild", "Amber Guild", "Amber is gathered only from the dry gallery, and every find is logged before it is sold.", "harvested", 3, "Harvest three times", { gold: 30 }),
            note("flood-gate", "Flood Gate", "A stone sill and a marked escape route turn the next underground flood away from the nursery.", "hazard", 1, "Live through a named disturbance", { gold: 34, morale: 1 }),
        ],
    }),
    "magic-primeval": family({
        species: [
            species("silver-foxglove", "Silver Foxglove", "plant", 8, "rings softly when the veil thins"),
            species("dream-moss", "Dream Moss", "plant", 10, "stores moonlight in its spores"),
            species("hollow-antler-stag", "Hollow-antler Stag", "animal", 4, "its antlers ring like dry wood"),
            species("starling-swarm", "Starling Swarm", "animal", 5, "moves as one shape above the court"),
            species("moon-carp", "Moon Carp", "animal", 4, "rises only at the full moon"),
        ],
        specialists: [
            specialist("oracle-moth", "Oracle Moth", "animal", "its wing pattern changes with the ley tide"),
            specialist("green-lady-orchid", "Green Lady Orchid", "plant", "opens for one night each century"),
            specialist("ley-wolf", "Ley-wolf", "animal", "walks the same path without bending the fern"),
        ],
        hazards: [
            hazard("dream-bloom", "Dream Bloom", "the moonpetal opens all at once", "puts the wardens to sleep and lets the undergrowth move"),
            hazard("path-shift", "Path Shift", "the forest rearranges its trails", "loses caravans and cuts the site off"),
            hazard("fey-bargain", "Fey Bargain", "a court offers a gift with a price", "takes a year of memory or a rare good"),
        ],
        goods: [
            good("dream-amber", "Dream Amber", 11, 1, "resin that holds a waking dream"),
            good("silver-bark", "Silver Bark", 6, 1, "shed bark, never cut from a living trunk"),
        ],
        relics: ["Crown ring", "Old covenant stone", "Sleeping hall"],
        journal: [
            note("ley-compass", "Ley-Line Compass", "A copper needle and a moon chart mark the ley tide; surveys no longer lose the path when the forest folds.", "surveys", 1, "Survey the site once", { gold: 20 }),
            note("warden-pact", "Warden Pact", "The old court accepts one named warden. The pact is written on bark and renewed each generation.", "deep", 1, "Complete a deep survey", { gold: 32, morale: 1 }),
            note("moon-garden", "Moon Garden", "A clearing is planted with moonpetal and silverbark, and harvested only on the waning moon.", "conserved", 1, "Sign the warden's agreement", { gold: 30 }),
            note("glamour-quarantine", "Glamour Quarantine", "A ring of salt and cold iron keeps a glamour from spreading into the ordinary woods.", "restored", 2, "Restore the site twice", { gold: 28 }),
            note("seed-covenant", "Seed Covenant", "A seed from the first grove is kept outside the court, so the forest can return even if the hall sleeps.", "stabilised", 2, "Stabilise the site twice", { gold: 36 }),
            note("court-archive", "Court Archive", "Every bargain and transformation is written in the same hand; the archive makes the magic legible to the wardens.", "hazard", 1, "Live through a named disturbance", { gold: 38, morale: 1 }),
        ],
    }),
    "cursed-wasteland": family({
        species: [
            species("gallows-tree", "Gallows Tree", "tree", 7, "the only tree the blight will not take"),
            species("sorrow-vine", "Sorrow Vine", "plant", 8, "climbs the grave fences"),
            species("bone-moth", "Bone Moth", "animal", 5, "its wings look like chalk"),
            species("grave-wolf", "Grave Wolf", "animal", 4, "digs only where the ground is already broken"),
            species("ash-cap", "Ash Cap", "plant", 6, "fruits on the burned boundary"),
            species("cinder-toad", "Cinder Toad", "animal", 3, "shelters in the warm ash of old fires"),
        ],
        specialists: [
            specialist("charnel-crow", "Charnel Crow", "animal", "carries the curse in its feathers"),
            specialist("mourning-hare", "Mourning Hare", "animal", "sits at the edge of the name stone"),
            specialist("black-bell", "Black Bell", "plant", "its seed heads ring in the wind"),
        ],
        hazards: [
            hazard("night-terror", "Night Terror", "the curse surfaces in the dark", "costs morale and scatters the wardens"),
            hazard("salt-bloom", "Salt Bloom", "the wound sweats brine", "sterilises the surface and kills seedlings"),
            hazard("pilgrim-tide", "Pilgrim Tide", "crowds come to test the curse", "tramples the site and carries contamination home"),
        ],
        goods: [
            good("mourning-wool", "Mourning Wool", 8, 1, "grey fleece from the boundary flock"),
            good("curse-chalk", "Curse Chalk", 5, 1, "marking chalk cut from the dry pit"),
        ],
        relics: ["Gallows mound", "Plague pit", "Broken shrine"],
        journal: [
            note("curse-quarantine", "Curse Quarantine", "A ring of white stones and a rota of wardens keep the blight from following a visitor home.", "surveys", 1, "Survey the site once", { gold: 20 }),
            note("grave-salt-trade", "Grave Salt Trade", "Salt is sold with a written warning and a cleansing ritual; the trade pays for the quarantine.", "deep", 1, "Complete a deep survey", { gold: 30 }),
            note("blight-firebreak", "Blight Firebreak", "A wide, wet firebreak is cut between the wound and the living wood; nothing is burned inside it.", "conserved", 1, "Sign the warden's agreement", { gold: 28 }),
            note("wraith-census", "Wraith Census", "The wardens count the named dead instead of the shadows, and the count is read aloud each year.", "restored", 2, "Restore the site twice", { gold: 30, morale: 1 }),
            note("name-restoration", "Name Restoration", "A broken name stone is cleaned and the old names are re-cut; the curse loses one of its claims.", "stabilised", 2, "Stabilise the site twice", { gold: 36 }),
            note("thrall-farm", "Thrall Farm", "A farm outside the ring grows food for the wardens, so no one has to enter the wound to eat.", "hazard", 1, "Live through a named disturbance", { gold: 34, morale: 1 }),
        ],
    }),
    "fungal-crystal": family({
        species: [
            species("lantern-moth", "Lantern Moth", "animal", 5, "follows the fruiting caps"),
            species("crystal-crab", "Crystal Crab", "animal", 4, "carries a shard as a shell"),
            species("spore-fern", "Spore Fern", "plant", 9, "unfurls when the air turns damp"),
            species("quartz-lichen", "Quartz Lichen", "plant", 7, "grows one millimetre a year"),
            species("hollow-cap", "Hollow Cap", "plant", 8, "its stem holds a cup of water"),
        ],
        specialists: [
            specialist("crown-mycelium", "Crown Mycelium", "plant", "one organism spans the whole gallery"),
            specialist("glass-beetle", "Glass Beetle", "animal", "its shell is transparent to the glow"),
            specialist("chime-cricket", "Chime Cricket", "animal", "calls at the frequency of the crystal"),
        ],
        hazards: [
            hazard("spore-wind", "Spore Wind", "a pressure front moves through the gallery", "carries spores into the lungs of the crew"),
            hazard("crystal-growth", "Crystal Growth", "mineral-rich water feeds a new seam", "splits the floor and blocks the path"),
            hazard("lamp-blight", "Lamp Blight", "too much visitor light", "bleaches the caps and stops fruiting"),
        ],
        goods: [
            good("spore-flour", "Spore Flour", 6, 2, "ground from dried caps, not the crown"),
            good("prism-salt", "Prism Salt", 8, 1, "mineral salt from the drip line"),
        ],
        relics: ["Miner's shrine", "Crystal harp", "Sealed gallery"],
        journal: [
            note("spore-forecast", "Spore Forecast", "A wet cloth and a pressure mark predict the next spore release; the crew leaves the gallery before it opens.", "surveys", 1, "Survey the site once", { gold: 20 }),
            note("harvest-rotation", "Crystal Harvest Rotation", "Only seams that have stopped growing are cut, and each is left for a decade before the next visit.", "deep", 1, "Complete a deep survey", { gold: 32 }),
            note("tunnel-wind-map", "Tunnel Wind Map", "Feathers on a wire map the air; the map shows where a spore cloud will go before it moves.", "conserved", 1, "Sign the warden's agreement", { gold: 30 }),
            note("glowcap-cellar", "Glowcap Cellar", "A cool side chamber keeps the glowcap harvest alive and seeds the next fruiting.", "restored", 2, "Restore the site twice", { gold: 26 }),
            note("newt-refuge", "Newt Refuge", "A shallow pool with a stone lip gives the blind newts somewhere to breed away from the path.", "harvested", 3, "Harvest three times", { gold: 30, morale: 1 }),
            note("shard-guild", "Shard Guild", "The shard cutters set a price and a quota; a broken seam closes the guild for a year.", "hazard", 1, "Live through a named disturbance", { gold: 34 }),
        ],
    }),
    "magic-transfigured": family({
        species: [
            species("glass-bee", "Glass Bee", "animal", 5, "pollinates flowers that have no season"),
            species("prism-hare", "Prism Hare", "animal", 4, "casts a second shadow"),
            species("mirror-fern", "Mirror Fern", "plant", 8, "reflects a forest that is not there"),
            species("sky-reed", "Sky Reed", "plant", 7, "grows upward from a folded floor"),
            species("folded-oak", "Folded Oak", "tree", 7, "two trunks share one ring"),
            species("echo-newt", "Echo Newt", "animal", 4, "answers its own call"),
        ],
        specialists: [
            specialist("paradox-finch", "Paradox Finch", "animal", "sings the call of a bird that never lived here"),
            specialist("ley-wasp", "Ley-wasp", "animal", "builds a paper nest from folded leaves"),
            specialist("origin-orchid", "Origin Orchid", "plant", "blooms in the shape of the old river wood"),
        ],
        hazards: [
            hazard("fold-storm", "Fold Storm", "two weathers occupy the same valley", "scrambles the survey and shifts the ground"),
            hazard("memory-bleed", "Memory Bleed", "the site remembers a shape it never had", "rewrites a species note and confuses the atlas"),
            hazard("anchor-drift", "Anchor Drift", "the stabilising stones lose alignment", "lets the transfigured aspect spread to the linked province"),
        ],
        goods: [
            good("folded-glass", "Folded Glass", 10, 1, "a pane that shows two landscapes"),
            good("origin-pollen", "Origin Pollen", 9, 1, "pollen from the remembered forest"),
        ],
        relics: ["First-shape sketch", "Broken anchor", "Two-season ring"],
        journal: [
            note("fold-atlas", "Fold Atlas", "Every path is drawn twice, once as it is and once as the old wood remembers it.", "surveys", 1, "Survey the site once", { gold: 20 }),
            note("origin-seed-bank", "Origin Seed Bank", "Seed from the remembered river wood is stored outside the fold, in ordinary soil.", "deep", 1, "Complete a deep survey", { gold: 32 }),
            note("mirror-survey", "Mirror Survey", "A mirror frame is carried along the transect; the reflection shows which layer is currently on top.", "conserved", 1, "Sign the warden's agreement", { gold: 30, morale: 1 }),
            note("ley-anchor", "Ley Anchor", "Four anchor stones are reset and numbered, so the next fold can be measured against a known shape.", "restored", 2, "Restore the site twice", { gold: 28 }),
            note("second-shape", "Second Shape", "The second shape is given a name and a boundary; it may stay, but it may not cross into the province.", "stabilised", 2, "Stabilise the site twice", { gold: 36 }),
            note("shimmer-harvest", "Shimmer Harvest", "Shimmer down is combed from the ground after the moult, never taken from a living wing.", "hazard", 1, "Live through a named disturbance", { gold: 36 }),
        ],
    }),
    "rare-community": family({
        species: [
            species("serpentine-lizard", "Serpentine Lizard", "animal", 5, "basks on the warm green stone"),
            species("cliff-rose", "Cliff Rose", "plant", 7, "roots in a crack above the scree"),
            species("mist-owl", "Mist Owl", "animal", 4, "hunts the cloud line"),
            species("relict-spider", "Relict Spider", "animal", 3, "lives only under the old quarry lip"),
            species("wind-orchid", "Wind Orchid", "plant", 6, "opens when the valley wind turns"),
        ],
        specialists: [
            specialist("moss-carder-bee", "Moss Carder Bee", "animal", "needs the last unploughed bank"),
            specialist("silver-moth", "Silver Moth", "animal", "comes to a single cliff rose"),
            specialist("mountain-lynx", "Mountain Lynx", "animal", "crosses the refuge only at night"),
        ],
        hazards: [
            hazard("cliff-collapse", "Cliff Collapse", "a freeze-thaw cycle undercuts the ledge", "erases a nesting ledge"),
            hazard("poaching", "Poaching", "a collector finds the site", "removes a specialist and leaves the population below recovery"),
            hazard("firebreak-grading", "Firebreak Grading", "a controlled burn line is cut too wide", "fragments the refuge"),
        ],
        goods: [
            good("cliff-honey", "Cliff Honey", 7, 1, "from hives set below the nesting ledges"),
            good("serpentine-stone", "Serpentine Stone", 5, 2, "polished stone from the old quarry"),
        ],
        relics: ["Old quarry trail", "Hermit's cell", "Seed cache"],
        journal: [
            note("seed-bank", "Serpentine Seed Bank", "Seed from the cliff rose and wind orchid is kept in a cool bank, with a written host-plant note.", "surveys", 1, "Survey the site once", { gold: 20 }),
            note("rope-census", "Cliff Rope Census", "A fixed rope route lets the wardens count ledges without trampling the scree.", "deep", 1, "Complete a deep survey", { gold: 32 }),
            note("night-parrot-acoustic", "Night Parrot Acoustic", "A recorder listens for the night parrot at dusk; a positive call closes the track for the season.", "conserved", 1, "Sign the warden's agreement", { gold: 34, morale: 1 }),
            note("snow-leopard-corridor", "Snow Leopard Corridor", "A high pass is kept quiet and the old hunting trail is closed, linking two refuge valleys.", "restored", 2, "Restore the site twice", { gold: 30 }),
            note("quarry-refuge", "Quarry Refuge", "The abandoned quarry is fenced and left to the cliff nesters instead of being filled with spoil.", "specialists", 6, "Keep all six rare species alive", { gold: 38 }),
            note("specimen-ethics", "Specimen Ethics", "No living specimen leaves the refuge; the naturalist's specimen is cast, photographed and returned.", "hazard", 1, "Live through a named disturbance", { gold: 36 }),
        ],
    }),
    "historic-landform": family({
        species: [
            species("field-maple", "Field Maple", "tree", 7, "marks the old hedge line"),
            species("corncockle", "Corncockle", "plant", 8, "returns when the ridge is left unploughed"),
            species("oak-longhorn", "Oak Longhorn Beetle", "animal", 4, "needs standing dead wood"),
            species("harvest-mouse", "Harvest Mouse", "animal", 5, "nests in the tall hedge grass"),
            species("marsh-fritillary", "Marsh Fritillary", "animal", 4, "follows the wet meadow edge"),
        ],
        specialists: [
            specialist("lesser-horseshoe", "Lesser Horseshoe Bat", "animal", "roosts in the old barn roof"),
            specialist("deadwood-beetle", "Deadwood Beetle", "animal", "lives in the hollow veteran oak"),
            specialist("parish-herb", "Parish Herb", "plant", "survives only in the churchyard wall"),
        ],
        hazards: [
            hazard("tractor-compaction", "Tractor Compaction", "heavy machinery on wet soil", "compacts the ridge and kills the old turf"),
            hazard("pond-silt", "Fishpond Silt", "the sluice is not cleared", "fills the medieval pond and loses the water plants"),
            hazard("hedge-flail", "Hedge Flailing", "the hedge is cut in the nesting season", "removes berries and nests"),
        ],
        goods: [
            good("hedge-willow", "Hedge Willow", 5, 1, "coppiced stems for baskets"),
            good("orchard-cider", "Orchard Cider", 7, 2, "from the old ridge orchard"),
        ],
        relics: ["Tithe barn footings", "Village green boundary"],
        journal: [
            note("hedge-charter", "Hedge Charter", "The hedge is cut on a three-year rotation, one side at a time, and the berries are left for the winter birds.", "surveys", 1, "Survey the site once", { gold: 20 }),
            note("ridge-map", "Ridge-and-Furrow Map", "A hand survey records every ridge before the plough can reach it; the map becomes the restoration plan.", "deep", 1, "Complete a deep survey", { gold: 30 }),
            note("fishpond-sluice", "Fishpond Sluice", "The medieval sluice is cleared and a stone sill holds the water at the old level.", "conserved", 1, "Sign the warden's agreement", { gold: 28 }),
            note("old-wood-joinery", "Old-Wood Joinery", "Fallen oak is worked into a barn frame; the living veteran and its deadwood beetles are left alone.", "restored", 2, "Restore the site twice", { gold: 30, morale: 1 }),
            note("parish-archive", "Parish Archive", "The court rolls, tithe map and hedge charter are copied into one parish book and kept dry.", "condition", 82, "Bring condition to 82", { gold: 34 }),
            note("commons-court", "Commons Court", "The commoners meet at the old ridge to set grazing and wood rights; the landform becomes a working institution.", "layers", 4, "Read four relict layers", { gold: 40, morale: 1 }),
        ],
    }),
    "climate-shift": family({
        species: [
            species("mountain-avens", "Mountain Avens", "plant", 6, "holds the last cool slope"),
            species("steppe-sage", "Steppe Sage", "plant", 7, "moves in behind the retreating birch"),
            species("steppe-marmot", "Steppe Marmot", "animal", 4, "digs into the open grassland"),
            species("red-footed-falcon", "Red-footed Falcon", "animal", 4, "hunts the new insect flush"),
            species("feather-moss", "Feather Moss", "plant", 8, "cools the soil under the treeline"),
        ],
        specialists: [
            specialist("steppe-eagle", "Steppe Eagle", "animal", "needs the open ground that follows the trees"),
            specialist("bog-lemming", "Bog Lemming", "animal", "survives in the last wet hollow"),
            specialist("treeline-crane-fly", "Treeline Crane Fly", "animal", "its larvae need cold, unpolluted peat"),
        ],
        hazards: [
            hazard("spring-frost", "Spring Frost", "an early warm spell is cut by hard frost", "kills new birch leaves and saplings"),
            hazard("bark-beetle", "Bark Beetle Outbreak", "warm winters let the beetle survive", "kills spruce and accelerates the treeline retreat"),
            hazard("peat-fire", "Peat Fire", "a dry spring ignites the drained peat", "burns underground and releases old carbon"),
        ],
        goods: [
            good("steppe-honey", "Steppe Honey", 6, 2, "from hives on the new flower front"),
            good("bog-iron", "Bog Iron", 8, 1, "iron concretions from the drained peat"),
        ],
        relics: ["Old boundary cairns", "Drained ditch lines", "Charcoal kiln"],
        journal: [
            note("treeline-garden", "Treeline Garden", "A garden moves the treeline seed north by hand, one cold pocket at a time.", "surveys", 1, "Survey the site once", { gold: 20 }),
            note("analog-seed-swap", "Analog Seed Swap", "Seed is exchanged with a warmer province that already grows the next forest; the archive becomes a living library.", "deep", 1, "Complete a deep survey", { gold: 32 }),
            note("saiga-corridor", "Saiga Corridor", "A fenced corridor links the winter steppe and the summer pasture, letting the herd follow the grass.", "conserved", 1, "Sign the warden's agreement", { gold: 30 }),
            note("peat-archive", "Peat Archive", "A cut peat face is cleaned and measured; the pollen layers record the climate the forest is leaving.", "restored", 2, "Restore the site twice", { gold: 28 }),
            note("fire-break", "Fire Break", "Wet strips and grazed breaks cross the new steppe, so a peat fire cannot run to the wood.", "condition", 76, "Bring condition to 76", { gold: 32, morale: 1 }),
            note("future-forest", "Future Forest", "The wardens plant the species that will thrive in thirty years, not the ones that thrived in the past.", "climate", 1, "Record one climate-analogue shift", { gold: 38 }),
        ],
    }),
    "catastrophe-belt": family({
        species: [
            species("sea-buckthorn", "Sea Buckthorn", "tree", 6, "fixes the first dune"),
            species("salt-couch", "Salt Couch", "plant", 7, "holds the shingle edge"),
            species("oystercatcher", "Oystercatcher", "animal", 5, "nests on the storm ridge"),
            species("sand-eel", "Sand Eel", "animal", 6, "drives the seabird season"),
            species("harbour-porpoise", "Harbour Porpoise", "animal", 4, "feeds in the breached channel"),
        ],
        specialists: [
            specialist("saltmarsh-bee", "Saltmarsh Bee", "animal", "needs the last sea-lavender bank"),
            specialist("dune-fern", "Dune Fern", "plant", "holds a single stable dune"),
            specialist("storm-petrel", "Storm Petrel", "animal", "returns to the old wall at night"),
        ],
        hazards: [
            hazard("coastal-erosion", "Coastal Erosion", "the frontage loses its sediment supply", "steepens the beach and takes the field edge"),
            hazard("saltwater-farm", "Saltwater Farm", "a breach floods the low fields", "poisons the soil and forces a new marsh"),
            hazard("debris-dam", "Debris Dam", "storm wrack blocks the outlet", "drowns the marsh behind it"),
        ],
        goods: [
            good("sea-buckthorn", "Sea Buckthorn", 6, 2, "vitamin-rich berries from the dune scrub"),
            good("drift-iron", "Drift Iron", 8, 1, "worked iron from the wreck line"),
        ],
        relics: ["Breach marker", "Old sea wall", "Flooded orchard"],
        journal: [
            note("breach-pilot", "Breach Pilot", "A marked channel guides the next flood through the old field rather than the new village.", "surveys", 1, "Survey the site once", { gold: 20 }),
            note("drowned-archive", "Drowned Archive", "Field names and wall lines are recorded before the salt takes them; the map keeps the old coast readable.", "deep", 1, "Complete a deep survey", { gold: 30 }),
            note("saltmarsh-nursery", "Saltmarsh Nursery", "Pioneer grass and glasswort are planted behind a brushwood sill to build the first new marsh.", "conserved", 1, "Sign the warden's agreement", { gold: 30, morale: 1 }),
            note("revival-covenant", "Revival Covenant", "Seed, cuttings and a work crew are kept ready, so a vanished site can be revived in the same generation.", "restored", 3, "Restore or revive the site three times", { gold: 36 }),
            note("storm-bell", "Storm Bell", "A bell and a raised refuge give the wardens somewhere to go when the next surge crosses the ridge.", "condition", 70, "Bring condition to 70", { gold: 30 }),
            note("open-water-return", "Open-Water Return", "The breach is allowed to become a shallow bay; the old field walls become a fish nursery.", "hazard", 1, "Live through a named disturbance", { gold: 38, morale: 1 }),
        ],
    }),
});
