// 1.2.23.1.181–210 — forest culture, religion, society and knowledge.
//
// Data plus deterministic selectors only. The live state, actions and bounded
// annual update live in js/systems/forest-culture.js. Profiles are derived from
// the existing sixty regional forest types, so a culture can never drift away
// from the woodland the player actually stands in.

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

function pick(list, seed) {
    return list[hashString(seed) % list.length];
}

// Twelve living traditions. A regional profile is this tradition seen through
// one of the sixty real forest types; the type's own tree, animal and goods
// keep every one of the sixty cultures distinct.
const ARCHETYPES = Object.freeze({
    boreal: Object.freeze({
        label: "Boreal grove tradition",
        spirits: ["The Hollow Bark Mother", "The Antlered Pine Warden", "The Snow-Lit Grandmother"],
        sacredTree: "the oldest spruce",
        taboo: "Never cut a spruce that has been struck by lightning; the fire already claimed it, and the spirit keeps the scar.",
        workTechnique: "Winter felling over frozen ground, horse-hauling on brush roads, and a leave-tree for every sled load.",
        huntRule: "Moose may be taken only after the first hard frost; a cow with calf is passed by, and no snare is set on a salt lick.",
        festival: { name: "First Thaw", focus: "bless the sap run and open the summer paths", season: 0 },
        offeringGood: "honey",
        tale: { title: "The Boy Who Kept the Fire", moral: "A hearth fed with a sacred branch warms the house but never the forest." },
        legend: { title: "The Forest That Walked Away", text: "When the last old pine was felled, the whole stand was gone by morning; only a line of stumps marked where it had stood." },
        song: { title: "Sled Road Song", verse: "Snow on the trace, iron on the runner — the wood comes home before the moon." },
        calendar: { bloom: "sap rising under late snow", hunt: "first frost to deep snow", felling: "frozen ground before thaw" },
        names: { female: ["Aino", "Sigrid", "Tuuli", "Lumi"], male: ["Runo", "Väinö", "Timo", "Onni"], trees: ["Spruce", "Pine", "Larch", "Birch"], animals: ["Moose", "Lynx", "Bear", "Owl"] },
        philosophy: "The forest is a creditor: take the interest of fallen and sick wood, never the capital of the old stand.",
        paths: ["charcoal track", "salt-lick trail", "winter haul road"]
    }),
    temperate: Object.freeze({
        label: "Temperate wood-pasture tradition",
        spirits: ["The Green Lady of the Boughs", "The Oak-Horned Keeper", "The Hazel-Wise Grandmother"],
        sacredTree: "the oldest oak",
        taboo: "A tree that bears a village mark, a saint's niche or a swing for children is not timber; it belongs to the commons.",
        workTechnique: "Coppice with standards, ox-hauling on turf tracks, and a felling notch cut on the downhill side to spare the saplings.",
        huntRule: "Does are protected in fawning season; boar may be driven only after the acorn mast has fallen, so the herd is fat and the farmers' fields are spared.",
        festival: { name: "Green Bough", focus: "hang the may bough and reconcile the wood-rights", season: 0 },
        offeringGood: "honey",
        tale: { title: "The Miller and the Oak", moral: "A promise made under an oak is collected by the whole village." },
        legend: { title: "The Oak That Held the Sky", text: "A storm took every roof but left the great oak standing; the oldest villagers say the sky rested in its branches." },
        song: { title: "Hew and Hoe", verse: "Hew the beam, hoe the row — the wood and the wheat must both grow." },
        calendar: { bloom: "oak catkins and hawthorn", hunt: "acorn fall to first frost", felling: "leaf-fall to midwinter" },
        names: { female: ["Elva", "Maren", "Rowan", "Hazel"], male: ["Oskar", "Bram", "Ewan", "Cedric"], trees: ["Oak", "Ash", "Hazel", "Hawthorn"], animals: ["Stag", "Fox", "Badger", "Doe"] },
        philosophy: "A wood is a household held in common: the roof, the fire and the fence all come from the same promise.",
        paths: ["coppice lane", "mast path", "parish boundary ride"]
    }),
    mediterranean: Object.freeze({
        label: "Mediterranean evergreen tradition",
        spirits: ["The Dryad of the Silver Leaf", "The Goat-Footed Grove Keeper", "The Mother of the Hill Spring"],
        sacredTree: "the oldest holm oak",
        taboo: "No axe enters a grove with a spring; the water and the tree are one guest and one host.",
        workTechnique: "Pollarding at head height, cork stripping that leaves the cambium, and stone terracing that keeps the winter rain on the slope.",
        huntRule: "Hares are taken after the vines are harvested; a pregnant doe and any bird on a nest are left untouched until the autumn rains.",
        festival: { name: "Spring Water", focus: "clean the cisterns and give the first honey to the grove spring", season: 0 },
        offeringGood: "honey",
        tale: { title: "The Fig and the Fox", moral: "The clever guest takes the ripe fruit and leaves the branch for the next year." },
        legend: { title: "The Grove of the Lost Spring", text: "A spring dried when its grove was cut; the stones still mark a circle where no grass will grow." },
        song: { title: "Cork-Cutter's Round", verse: "Silver bark, careful hand — the tree keeps the hill, the hill keeps the man." },
        calendar: { bloom: "olive flower and dry grass", hunt: "grape harvest to first rain", felling: "dormant winter fortnight" },
        names: { female: ["Lucia", "Mira", "Thalia", "Vesna"], male: ["Dario", "Nikos", "Mateo", "Ivo"], trees: ["Holm Oak", "Olive", "Cork Oak", "Laurel"], animals: ["Hare", "Goat", "Fox", "Partridge"] },
        philosophy: "The hills are old and hungry; use the tree as a roof over the soil, not as a mine.",
        paths: ["cork road", "goat stair", "spring path"]
    }),
    wetland: Object.freeze({
        label: "Wet woodland tradition",
        spirits: ["The Alder-Wife", "The Reed-Crowned Water Keeper", "The Mist Mother of the Carr"],
        sacredTree: "the oldest alder",
        taboo: "Never fell a tree whose roots hold the bank; the water will take the field in revenge.",
        workTechnique: "Summer cutting on floating platforms, alder poles for pilings, and brush bundles pinned to the bank.",
        huntRule: "Ducks and geese may be taken in the open water season; the nesting reed bed is closed, and no fire is set in the peat.",
        festival: { name: "Reed Moon", focus: "open the boats, mend the bank and remember the drowned", season: 1 },
        offeringGood: "herbs",
        tale: { title: "The Ferryman's Daughter", moral: "The marsh returns what is lent to it, but never what is taken." },
        legend: { title: "The Village Under the Water", text: "On still evenings the church bell is heard below the mere; the old people say the village was drowned for cutting its sacred alders." },
        song: { title: "Bank-Mender's Song", verse: "Weave the withy, drive the stake — the black water has no brake." },
        calendar: { bloom: "flag iris and alder catkin", hunt: "open-water season after nesting", felling: "low water in late summer" },
        names: { female: ["Neris", "Alna", "Maren", "Iiris"], male: ["Vidas", "Reed", "Mikol", "Aule"], trees: ["Alder", "Willow", "Birch", "Reed"], animals: ["Heron", "Otter", "Eel", "Moorhen"] },
        philosophy: "Water remembers every ditch; a wood on the bank is the only ledger the flood respects.",
        paths: ["withy path", "ferry cut", "peat causeway"]
    }),
    mountain: Object.freeze({
        label: "Mountain forest tradition",
        spirits: ["The Stone-Browed Warden", "The Cloud-Pine Shepherd", "The Grandmother of the Pass"],
        sacredTree: "the oldest mountain pine",
        taboo: "No tree above the shepherd's shrine is felled; it is the roof of the valley and the marker of the cloud road.",
        workTechnique: "Selection felling on contour, cable-slides rather than clear-cuts, and stone check-dams below every skid trail.",
        huntRule: "Chamois and ibex are hunted only after the rut; the cliff sanctuary above the shrine is closed to all hunters.",
        festival: { name: "Cloud Road", focus: "open the high pasture and ask the pass for safe passage", season: 1 },
        offeringGood: "herbs",
        tale: { title: "The Shepherd's Lantern", moral: "A light left on the pass saves a stranger who may one day save the village." },
        legend: { title: "The Forest That Held the Mountain", text: "The slope above the village has not moved since the old pines were spared; the neighbouring slope has no such story." },
        song: { title: "High Pasture Call", verse: "Up with the cloud, down with the snow — the pines keep the road we know." },
        calendar: { bloom: "snow-melt and alpine flowers", hunt: "rut to first snow", felling: "dry late summer on contour" },
        names: { female: ["Alma", "Nives", "Rina", "Suna"], male: ["Lars", "Miro", "Tomas", "Goran"], trees: ["Mountain Pine", "Fir", "Larch", "Rowan"], animals: ["Chamois", "Ibex", "Eagle", "Marmot"] },
        philosophy: "A mountain is borrowed ground; the forest is the interest paid to keep it standing.",
        paths: ["cable slide", "shepherd's stair", "shrine pass"]
    }),
    coastal: Object.freeze({
        label: "Coastal woodland tradition",
        spirits: ["The Salt-Wind Keeper", "The Driftwood Mother", "The Gull-Crowned Warden"],
        sacredTree: "the oldest wind-shaped pine",
        taboo: "The tree that holds the dune is never cut; move the path, not the root.",
        workTechnique: "Wind-pruned pollards, brush matting on dunes, and boat-timber taken only from trees already leaning inland.",
        huntRule: "Seabirds are protected on the cliff nests; eggs are taken only from the low rocks after the first laying, never from a full nest.",
        festival: { name: "Salt Blessing", focus: "bless the boats and mend the dune fence", season: 0 },
        offeringGood: "honey",
        tale: { title: "The Boat That Came Back", moral: "The sea returns a well-built boat and a well-kept promise." },
        legend: { title: "The Drowned Wood", text: "At the lowest tides, black stumps appear offshore: a forest that stood before the sea took the coast." },
        song: { title: "Dune Fence Song", verse: "Bind the grass and set the stake — the sea is patient, the dune is not." },
        calendar: { bloom: "sea thrift and gorse", hunt: "cliff season after nesting", felling: "inland lean after gales" },
        names: { female: ["Mira", "Sela", "Nora", "Isla"], male: ["Aron", "Kai", "Bran", "Elias"], trees: ["Pine", "Sea Buckthorn", "Alder", "Willow"], animals: ["Gull", "Seal", "Otter", "Heron"] },
        philosophy: "The coast is a bargain with the tide; a rooted dune is the signature of a village that intends to stay.",
        paths: ["dune boardwalk", "boat drag", "wreck path"]
    }),
    savanna: Object.freeze({
        label: "Savanna woodland tradition",
        spirits: ["The Fire-Kindled Grandmother", "The Flat-Crown Keeper", "The Rain-Smell Spirit"],
        sacredTree: "the oldest baobab",
        taboo: "No one cuts a tree that marks a grave, a well or a meeting place; the shade is the village's oldest room.",
        workTechnique: "Patch burning before the rains, coppice from cut stumps, and thorn-brush corrals that feed the soil where the herd rested.",
        huntRule: "Hunt only in the dry season, never at a waterhole, and leave the breeding herd and the young of the year.",
        festival: { name: "First Rain", focus: "thank the rain, relight the fields and settle grazing rights", season: 0 },
        offeringGood: "herbs",
        tale: { title: "The Hare and the Drought", moral: "The water you share in the dry year is the water that finds you in the next." },
        legend: { title: "The Woodland That Waited", text: "A tract left unburned for seven years returned with a canopy; the old people call it the wood that remembered." },
        song: { title: "Rain Call", verse: "Cloud on the flat crown, dust on the road — bring the rain to the cattle and the hoe." },
        calendar: { bloom: "first rain and new leaf", hunt: "dry season after grass seed", felling: "after harvest, before rain" },
        names: { female: ["Amara", "Nia", "Zuri", "Lami"], male: ["Kito", "Banda", "Sefu", "Tari"], trees: ["Baobab", "Acacia", "Miombo", "Combretum"], animals: ["Elephant", "Kudu", "Hare", "Hornbill"] },
        philosophy: "Fire is a servant, not a master; the flat crown is a calendar written in shade.",
        paths: ["cattle drift", "well path", "burn break"]
    }),
    tropical: Object.freeze({
        label: "Tropical forest tradition",
        spirits: ["The Green Serpent Mother", "The Canopy Grandfather", "The Orchid-Crowned Keeper"],
        sacredTree: "the oldest emergent tree",
        taboo: "Never cut a strangler fig or a tree hung with a shrine cloth; the canopy is a roof held by many hands.",
        workTechnique: "Gap felling around the buttress, vine-free skid lines, and a nursery under the shade of the mother trees.",
        huntRule: "Hunt only on the ridge, never in the fruiting valley; leave the mother trees and every fig in fruit.",
        festival: { name: "Canopy Flowering", focus: "thank the fruiting forest and open the seed nursery", season: 2 },
        offeringGood: "honey",
        tale: { title: "The Parrot's Debt", moral: "The seed carried away is repaid as a tree in another clearing." },
        legend: { title: "The Forest With No Edge", text: "The first people walked for a moon and never left the shade; since then the forest has been the map." },
        song: { title: "Seed-Gatherer's Song", verse: "From the high branch to the low shade — every seed is a promise made." },
        calendar: { bloom: "emergent flowering", hunt: "ridge season after fruit", felling: "gap felling in the dry window" },
        names: { female: ["Iara", "Maya", "Suri", "Lani"], male: ["Tupi", "Rai", "Kael", "Nilo"], trees: ["Ceiba", "Fig", "Teak", "Mahogany"], animals: ["Jaguar", "Macaw", "Tapir", "Monkey"] },
        philosophy: "The canopy is a commons in three dimensions; a gap is a debt the light will collect.",
        paths: ["ridge trail", "seed nursery path", "vine cut"]
    }),
    mangrove: Object.freeze({
        label: "Mangrove coast tradition",
        spirits: ["The Root-Walker", "The Tide Mother", "The Crab-Claw Keeper"],
        sacredTree: "the oldest mangrove",
        taboo: "Never cut the seaward root line; it is the village wall against the storm.",
        workTechnique: "Selective pole cutting above the prop roots, woven fish traps, and replanting in the tide's own line.",
        huntRule: "Crabs are taken at the ebb with a size limit; spawning females and the sea-grass beds are left alone.",
        festival: { name: "High Tide", focus: "mend the fish traps and plant new propagules", season: 1 },
        offeringGood: "honey",
        tale: { title: "The Crab That Held the Bank", moral: "The smallest claw can hold a bank the storm would take." },
        legend: { title: "The Village That Learned to Float", text: "When the sea rose, the village lashed its houses to the mangroves and stayed; the roots are still called the first street." },
        song: { title: "Pole-Cutter's Tide", verse: "Root in the mud, pole in the hand — the tide writes and the root holds the land." },
        calendar: { bloom: "propagule fall", hunt: "ebb tides after spawning", felling: "single poles in the dry lull" },
        names: { female: ["Nyra", "Siti", "Muda", "Lira"], male: ["Bima", "Arun", "Tide", "Jaya"], trees: ["Mangrove", "Nipa", "Pandanus", "Cordgrass"], animals: ["Crab", "Egret", "Mudskipper", "Monitor"] },
        philosophy: "The root line is the village wall; a coast without mangroves is a house without a door.",
        paths: ["trap line", "propagule bank", "root cut"]
    }),
    bamboo: Object.freeze({
        label: "Bamboo forest tradition",
        spirits: ["The Hollow-Stem Dancer", "The Green Joint Keeper", "The Panda-Mother"],
        sacredTree: "the oldest bamboo clump",
        taboo: "Never cut a whole clump; leave the oldest culm and the youngest shoot, or the grove will flower and die together.",
        workTechnique: "Joint-selective cutting, split-and-soak curing, and woven panels that let the grove breathe.",
        huntRule: "Take no animal from a bamboo stand in seed years; the stand feeds the whole mountain then.",
        festival: { name: "New Shoot", focus: "open the shoot harvest and repair the woven paths", season: 0 },
        offeringGood: "herbs",
        tale: { title: "The Empty Stem", moral: "The hollow is what makes the flute; the empty hand is what makes the gift." },
        legend: { title: "The Grove That Flowered Once", text: "The old grove flowered, seeded and died in one year; the village still keeps the seed in a clay jar." },
        song: { title: "Split-Culm Song", verse: "Joint by joint, strip by strip — the house grows light, the grove grows thick." },
        calendar: { bloom: "new shoot after rain", hunt: "mountain season outside seed years", felling: "dry culms after shooting" },
        names: { female: ["Lian", "Mei", "Sui", "Yun"], male: ["Bo", "Jin", "Tao", "Ren"], trees: ["Bamboo", "Camphor", "Ficus", "Maple"], animals: ["Panda", "Pheasant", "Muntjac", "Gibbon"] },
        philosophy: "Bend without breaking; take the hollow, leave the root.",
        paths: ["shoot path", "weaver's lane", "seed jar trail"]
    }),
    laurel: Object.freeze({
        label: "Laurel cloud-forest tradition",
        spirits: ["The Cloud-Veiled Mother", "The Laurel-Crowned Keeper", "The Moss-Bearded Grandfather"],
        sacredTree: "the oldest laurel",
        taboo: "No dead wood is taken from the cloud grove; it is the moss's house and the spring's sponge.",
        workTechnique: "Hand cutting in mist, moss-lined water channels, and a canopy corridor left for the cloud to pass.",
        huntRule: "Hunt only below the cloud line, and never a bird in the moss nest.",
        festival: { name: "Cloud Gathering", focus: "clean the moss channels and give thanks for the mist", season: 3 },
        offeringGood: "herbs",
        tale: { title: "The Moss That Kept the Spring", moral: "The oldest thing in the wood is often the smallest." },
        legend: { title: "The Forest in the Cloud", text: "A traveller climbed into the mist and found trees dripping with a rain that never reached the valley." },
        song: { title: "Mist Channel Song", verse: "Moss to the stone, stone to the stream — the cloud is a harvest we do not see." },
        calendar: { bloom: "laurel flower in mist", hunt: "below the cloud line", felling: "dry mist gap in late winter" },
        names: { female: ["Ayla", "Nube", "Sara", "Iris"], male: ["Dario", "Nilo", "Andes", "Bruma"], trees: ["Laurel", "Oak", "Podocarp", "Tree Fern"], animals: ["Quetzal", "Tapir", "Bear", "Frog"] },
        philosophy: "The cloud is a crop; a forest that catches it feeds the valley without a plough.",
        paths: ["moss channel", "cloud corridor", "quetzal trail"]
    }),
    cloud: Object.freeze({
        label: "Cloud-forest tradition",
        spirits: ["The Mist-Haired Grandmother", "The Fern-Crowned Keeper", "The Rain-Singing Warden"],
        sacredTree: "the oldest tree fern",
        taboo: "No fern is cut for bedding in the dry mist season; it is the roof that makes the rain.",
        workTechnique: "Ladder harvesting of epiphytes, hand-dug mist channels, and a closed canopy over every spring.",
        huntRule: "The cloud-forest game is hunted only after the mist rains; the moss nests and the frog pools are never touched.",
        festival: { name: "Mist Rain", focus: "open the water channels and honour the cloud forest", season: 2 },
        offeringGood: "herbs",
        tale: { title: "The Fern That Made Rain", moral: "The roof of the forest is the first farmer." },
        legend: { title: "The Spring With No River", text: "The valley spring flows all year though no river feeds it; the old people point to the cloud wood above." },
        song: { title: "Water-Channel Song", verse: "Leaf to moss, moss to stone — the mountain drinks and the valley is fed." },
        calendar: { bloom: "epiphyte flowering", hunt: "after mist rains", felling: "single trees in the dry lull" },
        names: { female: ["Nimbe", "Saira", "Elena", "Musgo"], male: ["Ando", "Rui", "Ciro", "Nube"], trees: ["Tree Fern", "Laurel", "Podocarp", "Oak"], animals: ["Quetzal", "Frog", "Tapir", "Hummingbird"] },
        philosophy: "A cloud wood is a water-work; cut the roof and the spring forgets its name.",
        paths: ["mist channel", "epiphyte ladder", "spring shrine"]
    })
});

// The three annual festivals are a real cycle, not one renamed holiday. Spring
// opens the growing year, the woodcut feast closes the felling window, and the
// harvest feast settles the mast, field and herd accounts. Names stay regional.
const FESTIVAL_NAMES = Object.freeze({
    boreal: { woodcut: "Iron Axe Night", harvest: "Mast and Frost" },
    temperate: { woodcut: "Hewing Fair", harvest: "Mast Harvest" },
    mediterranean: { woodcut: "Cork Cutters' Feast", harvest: "Olive and Acorn" },
    wetland: { woodcut: "Withy Cut", harvest: "Reed Harvest" },
    mountain: { woodcut: "Cable and Blade", harvest: "High Pasture Harvest" },
    coastal: { woodcut: "Boat Timber Feast", harvest: "Dune Harvest" },
    savanna: { woodcut: "Cool Burn", harvest: "First Sheaf" },
    tropical: { woodcut: "Gap Felling Rite", harvest: "Fruit and Seed" },
    mangrove: { woodcut: "Pole Cutters' Tide", harvest: "Propagule Feast" },
    bamboo: { woodcut: "Culm Cutters' Round", harvest: "Shoot and Sheaf" },
    laurel: { woodcut: "Mist Felling", harvest: "Cloud Harvest" },
    cloud: { woodcut: "Moss Axe", harvest: "Mist Harvest" }
});

// Seasonal windows are derived from the same regional calendar text the player
// reads. They are used by the yield modifiers and the field guide.
const CALENDAR_SEASONS = Object.freeze({
    boreal: { bloom: 0, hunt: 2, felling: 3 },
    temperate: { bloom: 0, hunt: 2, felling: 3 },
    mediterranean: { bloom: 0, hunt: 2, felling: 3 },
    wetland: { bloom: 0, hunt: 2, felling: 1 },
    mountain: { bloom: 0, hunt: 2, felling: 1 },
    coastal: { bloom: 0, hunt: 2, felling: 3 },
    savanna: { bloom: 0, hunt: 2, felling: 2 },
    tropical: { bloom: 2, hunt: 2, felling: 1 },
    mangrove: { bloom: 1, hunt: 2, felling: 1 },
    bamboo: { bloom: 0, hunt: 1, felling: 1 },
    laurel: { bloom: 0, hunt: 1, felling: 3 },
    cloud: { bloom: 1, hunt: 1, felling: 3 }
});

// Omens, customs and practical herb lore make the archive a living body of
// knowledge rather than three decorative paragraphs per region.
const EXTRA_LORE = Object.freeze({
    boreal: {
        omen: { title: "The Lynx on the Sled Road", text: "If a lynx crosses the sled road before the first snow, the winter will be long and the mast thin." },
        custom: { title: "The First Load", text: "The first sled load is never taken home; it goes to the shrine and the widow's yard." },
        herbLore: { title: "Resin and Inner Bark", text: "Spruce resin and birch inner bark make a salve for cracked hands; bark is never stripped from a living trunk." }
    },
    temperate: {
        omen: { title: "The Oak Before Rain", text: "When the oak leaves turn their backs before a shower, the village waits to sow." },
        custom: { title: "The May Bough", text: "A bough is carried from the common wood to every household that helped mend the fence." },
        herbLore: { title: "Hawthorn and Honey", text: "Hawthorn flower and honey steady a racing heart; the hedge is cut after the berries have fed the birds." }
    },
    mediterranean: {
        omen: { title: "The Goat on the Wall", text: "A goat standing on the old wall before the rains means the cistern will hold." },
        custom: { title: "First Honey", text: "The first honeycomb belongs to the grove spring, not to the table." },
        herbLore: { title: "Laurel and Olive Leaf", text: "Laurel leaf clears a stuffy room, olive leaf tea settles the stomach; both are gathered after the dew." }
    },
    wetland: {
        omen: { title: "The Heron Facing Downstream", text: "A heron facing downstream at dawn warns of a bank that will not hold." },
        custom: { title: "The Silent Boat", text: "No one speaks on the first boat of the season until the far bank is touched." },
        herbLore: { title: "Alder Bark and Iris Root", text: "Alder bark cools a fever; iris root is pounded for bruises, never taken inward." }
    },
    mountain: {
        omen: { title: "The Eagle Below the Pass", text: "When an eagle circles below the pass, a storm is already on the ridge." },
        custom: { title: "The Pass Bread", text: "A loaf is left at the shrine before the herds climb; the herder who finds it shares it." },
        herbLore: { title: "Mountain Pine and Rowan", text: "Pine needle tea eases a cough; rowan berries are dried for winter, never eaten raw." }
    },
    coastal: {
        omen: { title: "Gulls Flying Inland", text: "Gulls flying inland before noon mean the sea is turning." },
        custom: { title: "The Dune Knot", text: "Every boat crew ties one knot in the dune fence before launching." },
        herbLore: { title: "Sea Buckthorn and Thrift", text: "Sea buckthorn berries restore strength; thrift root is boiled for a poultice." }
    },
    savanna: {
        omen: { title: "The Hornbill Before Rain", text: "A hornbill calling before the clouds means the first rain is close." },
        custom: { title: "The Shared Shade", text: "The first shade of the new meeting tree belongs to the elders and the strangers." },
        herbLore: { title: "Baobab and Acacia", text: "Baobab fruit and acacia bark are pounded for fever and thirst; the living bark is left." }
    },
    tropical: {
        omen: { title: "The Macaw at the Gap", text: "Macaws crossing a new gap mean the fruiting trees have moved." },
        custom: { title: "The Seed Debt", text: "Every household that takes fruit returns one seed to the nursery." },
        herbLore: { title: "Fig Sap and Ceiba Leaf", text: "Fig sap seals a small cut; ceiba leaf tea cools a fever, but the mother tree is never ringed." }
    },
    mangrove: {
        omen: { title: "Crabs Climbing the Roots", text: "Crabs climbing high on the roots before a storm mean the tide will follow." },
        custom: { title: "The First Propagule", text: "The first propagule of the season is planted by the youngest child." },
        herbLore: { title: "Mangrove Bark and Nipa", text: "Mangrove bark is boiled for a wash; nipa leaf wraps a wound until the healer comes." }
    },
    bamboo: {
        omen: { title: "The Panda in the Seed Year", text: "A panda moving through a seeding stand means the whole mountain will feed on it." },
        custom: { title: "The Empty Cup", text: "At the new shoot feast, the first cup is poured into the grove." },
        herbLore: { title: "Bamboo Shoot and Camphor", text: "Young shoot broth restores appetite; camphor leaf is hung to keep moths from wool." }
    },
    laurel: {
        omen: { title: "The Quetzal Below the Cloud", text: "A quetzal feeding below the cloud line means the mist is late." },
        custom: { title: "The Moss Offering", text: "A pinch of moss is returned to the channel before water is drawn." },
        herbLore: { title: "Laurel Leaf and Tree Fern", text: "Laurel leaf tea warms a chill; tree-fern hair is packed on a burn." }
    },
    cloud: {
        omen: { title: "Frogs Calling in the Mist", text: "Frogs calling before the mist rain means the channels will fill." },
        custom: { title: "The First Drop", text: "No household drinks before a cup is poured into the spring shrine." },
        herbLore: { title: "Podocarp Bark and Moss", text: "Podocarp bark eases a cough; moss is pressed on a cut and then returned to the stone." }
    }
});

export const FOREST_GROVE_TRAITS = Object.freeze([
    Object.freeze({ id: "refuge", label: "Wildlife refuge", detail: "Nesting cover and undisturbed soil raise forage and game around the grove." }),
    Object.freeze({ id: "mast", label: "Mast sanctuary", detail: "The grove's seed crop feeds the pannage reserve through the winter." }),
    Object.freeze({ id: "spring", label: "Spring grove", detail: "Moss, herbs and clean water support the village healers." })
]);

export const FOREST_CULTURE_LORE_LABELS = Object.freeze({
    tale: "TALE", legend: "LEGEND", song: "WORK SONG",
    omen: "OMEN", custom: "CUSTOM", herbLore: "HERB LORE"
});

export function forestCultureGroveTraitFor(regionId, index = 0) {
    return FOREST_GROVE_TRAITS[hashString(String(regionId) + ":" + String(index)) % FOREST_GROVE_TRAITS.length];
}

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
    if (/mountain|alpine|subalpine|cloud/.test(key) || climates.includes("mountain")) return "mountain";
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

function buildProfile(type) {
    const archetypeKey = archetypeKeyFor(type);
    const base = ARCHETYPES[archetypeKey] || ARCHETYPES.temperate;
    const variant = hashString(type.id) % base.spirits.length;
    const tree = speciesLabel(type);
    const animal = animalLabel(type);
    const region = type.short || type.label || "woodland";
    const words = text => String(text).replace(/\{tree\}/g, tree.toLowerCase()).replace(/\{animal\}/g, animal.toLowerCase());
    const festivalNames = FESTIVAL_NAMES[archetypeKey] || FESTIVAL_NAMES.temperate;
    const seasons = CALENDAR_SEASONS[archetypeKey] || CALENDAR_SEASONS.temperate;
    const extra = EXTRA_LORE[archetypeKey] || EXTRA_LORE.temperate;
    const festivalCycle = [
        { id: "spring", name: base.festival.name + " of " + region, focus: base.festival.focus, season: 0, cost: { food: 8, gold: 5 } },
        { id: "woodcut", name: festivalNames.woodcut + " of " + region, focus: "Blunt the axes before the felling window, feed the haulers and thank the kiln crews.", season: 3, cost: { food: 5, gold: 6 } },
        { id: "harvest", name: festivalNames.harvest + " of " + region, focus: "Thank the mast, the field and the herd before the first frost.", season: 2, cost: { food: 9, gold: 6 } }
    ].map(entry => Object.freeze({ ...entry, focus: words(entry.focus), cost: Object.freeze({ ...entry.cost }) }));
    const nameSeeds = {
        female: [...base.names.female, tree, animal],
        male: [...base.names.male, tree, animal],
        trees: [...base.names.trees, tree],
        animals: [...base.names.animals, animal]
    };
    return Object.freeze({
        id: type.id,
        key: type.key,
        label: region + " culture",
        region,
        archetype: archetypeKey,
        tradition: base.label,
        climate: (type.climates || [])[0] || "temperate",
        spirit: words(base.spirits[variant]) + " of " + region,
        groveName: "The " + region + " Grove",
        sacredTree: "The oldest " + tree.toLowerCase(),
        taboo: words(base.taboo),
        workTechnique: words(base.workTechnique),
        huntRule: words(base.huntRule),
        festival: festivalCycle[0],
        festivals: Object.freeze(festivalCycle),
        offeringGood: base.offeringGood,
        omen: Object.freeze({ title: extra.omen.title + " (" + region + ")", text: words(extra.omen.text) }),
        custom: Object.freeze({ title: extra.custom.title + " (" + region + ")", text: words(extra.custom.text) }),
        herbLore: Object.freeze({ title: extra.herbLore.title + " (" + region + ")", text: words(extra.herbLore.text) }),
        tale: Object.freeze({ title: base.tale.title + " (" + region + ")", moral: words(base.tale.moral) }),
        legend: Object.freeze({ title: base.legend.title + " (" + region + ")", text: words(base.legend.text) }),
        song: Object.freeze({ title: base.song.title + " (" + region + ")", verse: words(base.song.verse) }),
        calendar: Object.freeze({ ...base.calendar, bloomSeason: seasons.bloom, huntSeason: seasons.hunt, fellingSeason: seasons.felling }),
        names: Object.freeze({
            female: Object.freeze(nameSeeds.female),
            male: Object.freeze(nameSeeds.male),
            trees: Object.freeze(nameSeeds.trees || []),
            animals: Object.freeze(nameSeeds.animals || [])
        }),
        philosophy: words(base.philosophy),
        paths: Object.freeze(base.paths.map(path => titleCase(path) + " of " + region)),
        sources: Object.freeze(["1.2.23.1.181", "1.2.23.1.193", "1.2.23.1.194", "1.2.23.1.195", "1.2.23.1.196", "1.2.23.1.197", "1.2.23.1.198", "1.2.23.1.202", "1.2.23.1.208"])
    });
}

export const FOREST_CULTURE_BY_REGION = Object.freeze(Object.fromEntries(
    REGIONAL_FOREST_TYPES.map(type => [type.id, buildProfile(type)])
));
export const FOREST_CULTURE_REGIONS = Object.freeze(REGIONAL_FOREST_TYPES
    .map(type => FOREST_CULTURE_BY_REGION[type.id]).filter(Boolean));

export function forestCultureProfileFor(id) {
    return FOREST_CULTURE_BY_REGION[String(id || "")] || null;
}

function requirement(id, title, point, consumer, detail) {
    return Object.freeze({ id, title, point, consumer, detail });
}

// The ids are the exact source points. `consumer` names the live system the
// player touches; `detail` is the field-guide explanation, not a menu stub.
export const FOREST_CULTURE_REQUIREMENTS = Object.freeze([
    requirement("1.2.23.1.181", "Waldgeister und Baumgottheiten pro Region", "Every regional forest type names its own tree spirit, sacred tree, taboo and offering, derived from the real stand rather than a generic pantheon.", "Forest Atlas → culture profile; grove favour", "The home woodland selects a profile from the sixty regional types. Its spirit, sacred tree, taboo, festival and names are read from the actual stand, and every grove carries that region's identity into the ritual ledger."),
    requirement("1.2.23.1.182", "Heilige Haine als geschützte Waldinseln", "Consecrating a grove protects a real forest tile from every felling, thinning and firebreak action.", "Forest Atlas → Dedicate grove; harvestForest guard", "A consecrated grove records its world tile. The shared harvest path refuses that tile even when a work party reaches it, while the surrounding wood remains playable."),
    requirement("1.2.23.1.183", "Druiden und Waldpriester als eigene Berufe", "Shrines employ druids; a shrine in deep forest becomes a woodland priesthood with a real job, skill and census entry.", "Shrine workforce; population register; culture role census", "The shrine now has a druid workplace. Druids learn the learning skill, appear in the population register and count toward grove favour, festivals and offerings."),
    requirement("1.2.23.1.184", "Förster als Verwalter von Waldrecht und Nutzung", "Only a working forester can set forest rights; the chosen rights change forage, hunting, timber and farm yields.", "Forest Atlas → forest rights; forester workforce", "The forester is the gatekeeper of the wood-right. Without one the rights buttons explain the missing office; with one the realm can choose balance, commons, hunting or timber priority."),
    requirement("1.2.23.1.185", "Köhler als spezialisierte Dorfgemeinschaft", "Charcoal-burning Forest Works form a counted craft community with its own culture modifier and lore.", "Forest Works charcoal mode; culture role census; charcoal yields", "Each Forest Works in charcoal mode is counted as a kiln community. Their number feeds the culture modifier for charcoal and the work-song archive; no second charcoal economy is created."),
    requirement("1.2.23.1.186", "Holzfäller mit regionalen Techniken und Tabus", "Woodcutters follow the region's felling technique and taboo, and cannot cut a marked sacred tree.", "Woodcutter workforce; regional profile; grove guard", "The regional profile carries a real work technique and a taboo. Taboo groves are removed from the harvest path, and the technique is displayed beside the woodcutter census."),
    requirement("1.2.23.1.187", "Sammler für Kräuter, Beeren und Pilze", "Foragers gain a favour and rights modifier on the existing gather action, with the regional bloom calendar visible.", "gatherForestProducts; culture modifier; calendar", "Forage yields read the culture modifier. The calendar names the bloom, hunt and felling windows of the home region, so a player can see why this season pays."),
    requirement("1.2.23.1.188", "Jäger mit saisonalen Jagdregeln", "A hunting rite opens the season and the profile's hunt rule modifies the existing hunt action.", "processForestHunt; Hunt rite; calendar", "The hunt rite is a once-a-year cultural action. The profile's hunt rule and the calendar's hunt window are shown, and the culture modifier changes the existing hunt yield rather than adding a parallel hunt."),
    requirement("1.2.23.1.189", "Waldbauern mit Agroforst und Waldweide", "Farms near the wood gain an agroforestry factor; the role census names them and the pannage path feeds the herds.", "fields.js harvest; forest pannage; role census", "A farm in a woodland settlement receives the culture farm factor. Pannage already feeds stables from mast; the culture herd factor and commons right strengthen that existing path."),
    requirement("1.2.23.1.190", "Wanderhirten zwischen Wald und offener Weide", "Stablehands become transhumant herders and gain mast days when the wood is held in commons.", "feedStableFromMast; stable workforce; culture modifier", "Stables near the forest count their stablehands as herders. The commons right extends the mast-feeding window; no new herd or pasture simulation is added."),
    requirement("1.2.23.1.191", "Einsiedler und Waldklöster", "A shrine in deep forest shelters a hermit; consulting them yields a regional omen, while a scriptorium forms a forest monastery.", "Shrine placement; hermit consultation; scriptorium; culture knowledge", "The culture census counts deep-forest shrines as hermitages. A yearly hermit consultation records the region's omen in the archive and adds study; a scriptorium within their radius is recognised as a forest monastery."),
    requirement("1.2.23.1.192", "Hexen und Kräuterfrauen in Märchen und Realität", "Healers near the wood are counted as herb-wives; their presence improves the culture medicine modifier and the tale archive.", "Clinic workforce; region tale; medicine modifier", "A healer whose clinic stands near forest is counted in the herb-wife role. Their lore is the region's tale, and the medicine modifier reaches the existing health path."),
    requirement("1.2.23.1.193", "Regionale Märchen über Waldtypen", "Each of the sixty regional types has its own tale, spirit and moral, collectable into the atlas archive.", "Forest Atlas → Collect lore; sixty profiles", "Collecting lore stores the home region's tale and song. The archive names the type, and the profile remains deterministic for that world seed."),
    requirement("1.2.23.1.194", "Sagen über verschwundene Wälder und alte Bäume", "A second legend per region records a lost forest or ancient tree and its warning.", "Forest Atlas → lore archive; legacy entry", "The legend is written into the same bounded archive and the realm legacy. It is region-specific and does not consume a new resource."),
    requirement("1.2.23.1.195", "Lieder und Arbeitsgesänge der Waldberufe", "Each region names a work song with a verse tied to its actual craft.", "Forest Atlas → lore archive; charcoal/woodcutter roles", "The song is collected with the tale and shown with the regional craft. Singing it is represented by the favour and morale effect of the lore action, not a separate music system."),
    requirement("1.2.23.1.196", "Waldkalender mit Blüte, Ernte und Jagdzeiten", "The home profile provides bloom, hunt and felling windows and a current-season status.", "Forest Atlas → culture calendar; gather/hunt modifiers", "The calendar is derived from the regional type. The atlas marks the current season and the active window, and the harvest systems use the same season."),
    requirement("1.2.23.1.197", "Feste zu Frühling, Holzschlag und Ernte", "Three regional festivals form a yearly cycle; each has its own season, cost and lasting effect.", "Forest Atlas → Spring, Woodcut and Harvest festivals; morale, politics and seasonal yields", "Spring opens the growing year, the woodcut feast feeds the felling window and the harvest feast settles the mast, field and herd. Each can be held once per year in its own season; the effects are real morale, political and seasonal yield changes."),
    requirement("1.2.23.1.198", "Opfergaben an Baum- und Waldgeister", "Three different forest gifts can be offered, each with its own favour, devotion and practical effect.", "Forest Atlas → offerings; forest gathering stock; medicine and research", "Honey raises favour and devotion, herbs support the healers, and mushrooms steady morale and study. One gift may be offered per season; the region's preferred gift receives a small bonus. No new currency is created."),
    requirement("1.2.23.1.199", "Tabus gegen das Fällen heiliger Bäume", "The grove taboo and every consecrated tile are enforced in the shared harvest guard.", "harvestForest; grove list; felling actions", "A sacred grove tile returns no timber and no thinnings through the shared resource path. The atlas names the taboo, and the grove card reports its protected status."),
    requirement("1.2.23.1.200", "Jagdrituale und Initiationsriten", "A once-a-year hunt rite opens the season, names new initiates and strengthens the existing hunt yield.", "Forest Atlas → Hunt rite; processForestHunt; initiate cohort", "The rite requires a grove and food, raises morale and records the initiation in the legacy. Each rite adds bounded initiates whose number feeds the hunt modifier; the existing hunt action remains the only hunt."),
    requirement("1.2.23.1.201", "Baumhochzeiten und symbolische Vermählungen", "A tree wedding binds the community to its grove and raises favour and legitimacy.", "Forest Atlas → Tree wedding; grove; politics", "The wedding needs a consecrated grove and gold. It raises grove devotion, legitimacy and clergy support, and writes a legacy entry. It is available once per year."),
    requirement("1.2.23.1.202", "Namensgebung nach Bäumen und Waldtieren", "Children born in a realm with collected woodlore receive a regional tree or animal name.", "createChildFromParents; collected lore; profile names", "The birth path asks the culture system for a name only after the home region's lore has been collected. The choice is deterministic from the child's own seed, so old saves keep their sequence."),
    requirement("1.2.23.1.203", "Waldrecht für Allmende, Jagd und Holzeinschlag", "The forester can set one of four rights priorities, changing the real yield modifiers.", "Forest Atlas → rights; culture modifiers", "Balance, commons, hunting and timber priorities each alter forage, hunt, farm, herd and timber factors. A change is allowed once a year, so a campaign cannot flip the law every day."),
    requirement("1.2.23.1.204", "Allmenderechte und Dorfgemeinschaften", "The commons priority strengthens farms, herds and forage and is visible in politics and the role census.", "Forest rights; fields; pannage; politics", "Choosing commons adds legitimacy and commons support, improves the farm, herd and forage factors, and is recorded as a village community right rather than a private grant."),
    requirement("1.2.23.1.205", "Nutzungskonflikte zwischen Bauern, Jägern und Holzfällern", "Extreme rights and a protected grove create named conflicts that can be mediated for gold.", "Forest Atlas → conflict list; mediate action", "A timber priority beside a grove, or a long hunting/commons priority, creates a bounded conflict. The player can mediate it; unresolved conflicts lower favour and morale."),
    requirement("1.2.23.1.206", "Waldbildung für Förster und Kräuterkundige", "A yearly forest school teaches apprentices beside the existing woodland staff and raises research and knowledge.", "Forest Atlas → Hold forest school; Research → Woodland; knowledge census", "The school needs a forester, herb-wife or woodland scholar and consumes food and gold. It adds bounded apprentices, raises research reserve and favour, and its apprentices feed the knowledge modifier."),
    requirement("1.2.23.1.207", "Kräuterkunde als Forschungszweig", "Herb lore is a real technology in the new woodland branch, gated by forestry.", "Research → Woodland; medicine and forage modifiers", "Woodland herb lore requires forestry, costs research points and improves the culture forage and medicine factors. It appears in the ordinary technology tree."),
    requirement("1.2.23.1.208", "Naturastronomie und Jahreszeitenwissen", "Natural astronomy reads the calendar, improves the festival and extends the offering window.", "Research → Woodland; forest calendar", "The astronomy technology is required for cartography and natural philosophy. Its completion adds favour from offerings and makes the calendar's season markers visible as knowledge."),
    requirement("1.2.23.1.209", "Kartographie von Waldwegen und heiligen Orten", "Cartography raises the grove cap and records the region's paths and sacred places.", "Research → Woodland; grove limit; lore archive", "The cartography technology increases the number of groves a realm may consecrate and adds the regional paths to the atlas. The grove list remains bounded."),
    requirement("1.2.23.1.210", "Naturphilosophie über Gleichgewicht und Nutzung", "Natural philosophy is the capstone technology; it unlocks a real doctrine choice between balance, refuge and provision.", "Research → Woodland; forest doctrine; culture modifiers", "The final woodland technology requires cartography and astronomy. It adds research and legitimacy and unlocks a once-a-year doctrine: balance, refuge or provision, each trading forage, game, timber and charcoal against the other.")
]);

export const FOREST_CULTURE_REQUIREMENT_BY_ID = Object.freeze(Object.fromEntries(
    FOREST_CULTURE_REQUIREMENTS.map(entry => [entry.id, entry])
));

export function forestCultureNameFor(profile, sex, seed) {
    if (!profile) return null;
    const key = sex === "female" ? "female" : "male";
    const personal = profile.names?.[key] || [];
    const trees = profile.names?.trees || [];
    const animals = profile.names?.animals || [];
    // The region names its children after its people, its trees and its
    // animals. The pool stays deterministic from the child's own seed.
    const names = personal.length ? [...personal, ...trees, ...animals] : [...trees, ...animals];
    return names.length ? pick(names, String(seed) + ":" + profile.id) : null;
}

// Six pieces of knowledge are collected together: the tale, the lost-wood
// legend, the work song, an omen, a custom and a practical herb note.
export function forestCultureLoreEntriesFor(profile) {
    if (!profile) return [];
    return Object.freeze([
        { kind: "tale", title: profile.tale.title, text: profile.tale.moral },
        { kind: "legend", title: profile.legend.title, text: profile.legend.text },
        { kind: "song", title: profile.song.title, text: profile.song.verse },
        { kind: "omen", title: profile.omen.title, text: profile.omen.text },
        { kind: "custom", title: profile.custom.title, text: profile.custom.text },
        { kind: "herbLore", title: profile.herbLore.title, text: profile.herbLore.text }
    ]);
}

export function forestCultureCalendarFor(profile, seasonIndex) {
    const season = Math.max(0, Math.min(3, Math.floor(Number(seasonIndex) || 0)));
    const windows = [
        { id: "bloom", label: "Blooming", detail: profile?.calendar?.bloom || "new leaf" },
        { id: "hunt", label: "Hunting", detail: profile?.calendar?.hunt || "autumn season" },
        { id: "felling", label: "Felling", detail: profile?.calendar?.felling || "dormant season" },
        { id: "rest", label: "Resting", detail: "the wood keeps its own account" }
    ];
    const bloomSeason = Math.max(0, Math.min(3, Math.floor(Number(profile?.calendar?.bloomSeason) || 0)));
    const huntSeason = Math.max(0, Math.min(3, Math.floor(Number(profile?.calendar?.huntSeason) || 2)));
    const fellingSeason = Math.max(0, Math.min(3, Math.floor(Number(profile?.calendar?.fellingSeason) || 3)));
    return Object.freeze({
        season,
        seasonLabel: ["Spring", "Summer", "Autumn", "Winter"][season],
        active: windows[season],
        bloomSeason,
        huntSeason,
        fellingSeason,
        bloomActive: season === bloomSeason,
        huntActive: season === huntSeason,
        fellingActive: season === fellingSeason,
        windows: Object.freeze(windows)
    });
}

export const FOREST_CULTURE_ARCHETYPE_COUNT = Object.keys(ARCHETYPES).length;
