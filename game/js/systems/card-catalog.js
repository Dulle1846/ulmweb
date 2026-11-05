// Procedural card library: 500 categories, 500,000 on-demand variants.
import { TYPE } from "../core/types.js";

const GROUPS = {
 settlement:["cottages","manors","tenements","farmhouses","townhouses","inns","guildhalls","market-houses","granaries","warehouses"],
 agriculture:["wheat-fields","orchards","vineyards","herb-gardens","apiaries","pastures","fish-farms","windmills","watermills","irrigation"],
 industry:["lumber-camps","stone-quarries","gold-mines","iron-mines","smelters","foundries","workshops","carpenters","weavers","potteries"],
 civic:["wells","fountains","roads","bridges","courtyards","plazas","schools","libraries","courthouses","town-halls"],
 defense:["watchtowers","walls","gatehouses","battlements","moats","traps","barricades","lookouts","siege-works","fortresses"],
 military:["militia","guards","archers","knights","cavalry","scouts","captains","banners","formations","garrisons"],
 nature:["forests","groves","rocks","lakes","rivers","marshes","cliffs","meadows","caves","ruins"],
 animals:["deer","boars","wolves","sheep","cattle","horses","dogs","falcons","bees","fish"],
 people:["farmers","miners","merchants","builders","priests","healers","scholars","artisans","nobles","travellers"],
 events:["harvests","festivals","plagues","droughts","storms","discoveries","pilgrimages","raids","caravans","mysteries"],
 husbandry:["sheepfolds","cattle-yards","horse-breeding","falconry","goat-herds","pigsties","kennels","pigeon-lofts","stud-farms","shepherd-camps"],
 forestry:["foresters","timber-trails","charcoal-pits","orchard-woodlands","hunting-lodges","deer-parks","sylvan-shrines","mushroom-glades","woodcutters","ancient-oaks"],
 mining:["copper-veins","silver-veins","deep-shafts","quarry-faces","crystal-caverns","salt-mines","gem-cutters","ore-cartways","smoke-vents","underground-rivers"],
 craft:["blacksmiths","goldsmiths","glassblowers","potters","carvers","masons","bookbinders","leatherworkers","jewelers","wheelwrights"],
 trade:["merchant-stalls","counting-houses","caravanserais","weighing-bridges","customs-houses","exchange-halls","spice-markets","warehousing-guilds","trade-charters","moneylenders"],
 education:["scriptoria","observatories","monastic-schools","mapmakers","universities","lecture-halls","archives","astronomers","tutors","translators"],
 faith:["wayside-shrines","abbeys","monasteries","cathedrals","reliquaries","pilgrim-hostels","bell-towers","hermitages","sacred-springs","processions"],
 court:["royal-audiences","noble-houses","heralds","chamberlains","court-feasts","royal-messengers","succession-charters","wardships","court-poets","household-guards"],
 travel:["waystations","ferries","mountain-passes","pilgrim-roads","innkeepers","guides","carriage-yards","trail-markers","border-posts","lost-expeditions"],
 magic:["rune-stones","enchanted-wells","spell-towers","warding-circles","witch-covens","star-readers","charm-makers","ley-lines","familiar-keepers","arcane-libraries"],
 mysteries:["sealed-vaults","forgotten-tombs","whispering-woods","sunken-temples","odd-footprints","strange-comets","ancient-machines","nameless-cults","hidden-doors","vanished-villages"],
 law:["watch-courts","town-charters","tax-ledgers","guild-ordinances","royal-decrees","juries","prisons","bailiffs","oath-stones","land-surveys"],
 maritime:["harbors","shipyards","lighthouses","fishing-piers","sea-charts","coastal-forts","whaling-stations","salt-wharves","shipwrights","tide-shrines"],
 infrastructure:["stone-roads","aqueducts","canals","sewer-works","signal-fires","roadside-inns","granary-roads","causeways","public-baths","royal-highways"],
 medicine:["herbalists","infirmaries","leech-houses","apothecaries","midwives","physicians","quarantine-houses","healing-gardens","surgery-rooms","plague-doctors"],
 diplomacy:["embassies","treaty-feasts","hostage-exchanges","royal-weddings","border-summits","envoys","peace-banners","foreign-legations","trade-pacts","marriage-alliances"],
 culture:["storytellers","mummers","craft-fairs","folk-dances","feast-days","pageants","folk-heroes","seasonal-rites","public-games","village-choirs"],
 engineering:["siege-engines","cranes","waterwheels","bridgemakers","stonecutters","mine-pumps","windlasses","foundry-furnaces","road-builders","clockmakers"],
 fishing:["river-weirs","net-makers","smokehouses","eel-traps","trout-streams","fishmongers","oyster-beds","pearling-boats","net-lofts","fisher-clans"],
 alchemy:["distilleries","apothecary-labs","transmutation-circles","ink-makers","dye-houses","powder-mills","glass-retorts","elixir-vats","herb-stillrooms","alchemical-courts"],
 cuisine:["bakehouses","breweries","cheese-makers","smoke-kitchens","royal-kitchens","soup-houses","sugar-refiners","spice-cellars","feast-halls","fruit-preserves"],
 textiles:["wool-mills","dye-vats","silk-weavers","linen-looms","fullers","embroiderers","tanners","cloth-markets","tapestry-halls","tailors"],
 architecture:["stone-arches","timber-halls","cloisters","watch-spires","ornate-gates","roofers","mosaicists","vaulted-halls","grand-stairways","royal-pavilions"],
 finance:["treasury-vaults","mint-houses","royal-bonds","debt-charters","coin-assayers","tax-farms","loan-ledgers","toll-rights","merchant-credit","war-chests"],
 communication:["raven-posts","town-criers","beacon-chains","signal-towers","message-riders","bell-codes","royal-seals","letter-carriers","notice-boards","whisper-networks"],
 music:["minstrels","lute-makers","choir-schools","drum-circles","court-composers","street-performers","bell-founders","dance-masters","harpists","festival-bards"],
 warfare:["war-camps","supply-trains","siege-towers","scouting-parties","veteran-companies","crossbow-bands","shield-walls","battle-plans","field-surgeons","war-horses"],
 politics:["council-seats","election-charters","royal-councils","provincial-governors","petitioners","reformers","faction-houses","seneschals","stewardships","public-assemblies"],
 monsters:["dragons","wyverns","trolls","giant-spiders","cave-bears","wargs","basilisks","giant-boars","marsh-wights","stone-guardians"],
 seasons:["spring-thaw","summer-fair","autumn-muster","winter-stores","first-frost","harvest-moon","long-rains","midsummer-bonfire","snowbound-road","early-blossom"],
 weather:["thunderstorms","soft-rains","heat-waves","hailstorms","fog-banks","frost-fields","wind-gusts","rainbows","drought-winds","snowfall"],
 underworld:["smugglers","poachers","thieves-guilds","secret-tunnels","black-markets","fence-networks","night-watchers","masked-strangers","hidden-cellars","outlaw-camps"],
 spirits:["will-o-wisps","ancestral-voices","forest-spirits","household-wights","river-guardians","dream-omens","wandering-shades","hearth-spirits","moonlit-figures","forgotten-names"],
 relics:["crowns-of-ash","saintly-bones","lost-seals","royal-swords","sealed-scrolls","star-metal","ancient-coins","broken-idols","pilgrim-medals","dragon-glass"],
 botany:["medicinal-herbs","rare-seeds","poison-gardens","orchid-houses","moss-farms","root-cellars","flower-meadows","saffron-beds","moonlit-lilies","healing-vines"],
 geology:["basalt-ridges","chalk-pits","granite-veins","obsidian-fields","amber-deposits","limestone-caves","clay-beds","fossil-banks","quartz-outcrops","hot-springs"],
 administration:["tax-collectors","royal-auditors","village-reeves","land-registers","census-takers","court-scribes","provosts","ordinance-halls","provincial-seals","steward-courts"],
 frontier:["palisade-camps","border-rangers","settler-wagons","pioneer-fields","watch-fires","scout-trails","frontier-forts","wayfinder-stones","outpost-markets","wilderness-guides"],
 urbanism:["street-lanterns","drainage-ditches","tenement-courts","market-lanes","stone-pavements","public-wells","city-gardens","fire-brigades","town-gates","guild-streets"],
 scholarship:["naturalists","chroniclers","cartographers","linguists","mathematicians","law-scholars","historians","royal-astronomers","rune-readers","philosophers"]
};
const titleCase=s=>s.split("-").map(p=>p[0].toUpperCase()+p.slice(1)).join(" ");
export const CARD_CATEGORIES=Object.freeze(Object.entries(GROUPS).flatMap(([group,names])=>names.map((id,index)=>Object.freeze({id,group,name:titleCase(id),sort:index}))));
export const CARD_VARIANT_DIMENSIONS=Object.freeze({
 scales:["trinket","small","compact","standard","large","grand","estate","district","monument","realm"],
 rarities:["common","uncommon","fine","rare","epic","mythic","royal","ancient","legendary","unique"],
 contexts:["spring","summer","autumn","winter","frontier","heartland","coastal","highland","trade-route","war-time"]
});
export const POTENTIAL_CARD_VARIANTS=CARD_CATEGORIES.length*1000;
const PROTOTYPES=[
 {id:"cottage",category:"cottages",type:TYPE.HOUSE,name:"COTTAGE",desc:"Houses 3 villagers.",icon:"🏠",cost:{wood:30,stone:10}},
 {id:"farmstead",category:"wheat-fields",type:TYPE.FARM,name:"FARMSTEAD",desc:"Produces food every season.",icon:"🌾",cost:{wood:25,food:5}},
 {id:"lumberyard",category:"lumber-camps",type:TYPE.LUMBER,name:"LUMBERYARD",desc:"Produces timber.",icon:"🪵",cost:{gold:15}},
 {id:"stone-quarry",category:"stone-quarries",type:TYPE.QUARRY,name:"STONE QUARRY",desc:"Produces stone.",icon:"⛰️",cost:{wood:35,food:15}},
 {id:"gold-mine",category:"gold-mines",type:TYPE.GOLDMINE,name:"GOLD MINE",desc:"Turns a rich seam into lasting gold income.",icon:"⛏️",cost:{wood:45,stone:35}},
 {id:"supply-barrel",category:"warehouses",type:TYPE.BARREL,name:"SUPPLY BARREL",desc:"A small cache of provisions and timber.",icon:"🛢️",cost:{wood:3},effect:"supply-cache"},
 {id:"watchtower",category:"watchtowers",type:TYPE.TOWER,name:"WATCHTOWER",desc:"Defends the settlement.",icon:"🏰",cost:{wood:40,stone:30}},
 {id:"wall",category:"walls",type:TYPE.WALL,name:"FORTIFIED WALL",desc:"A durable defensive barrier.",icon:"🧱",cost:{stone:45}},
 {id:"tavern",category:"inns",type:TYPE.TAVERN,name:"THE TAVERN",desc:"Generates gold and morale.",icon:"🍺",cost:{wood:55,gold:25,food:15}},
 {id:"temple",category:"courthouses",type:TYPE.TEMPLE,name:"HOLY TEMPLE",desc:"Raises realm morale.",icon:"⛪",cost:{stone:60,gold:35}},
 {id:"barracks",category:"garrisons",type:TYPE.BARRACKS,name:"BARRACKS",desc:"Supports the garrison.",icon:"🛡️",cost:{wood:45,stone:35}},
 {id:"mill",category:"windmills",type:TYPE.MILL,name:"WATER MILL",desc:"Improves nearby farms.",icon:"⚙️",cost:{wood:65,stone:20}},
 {id:"stables",category:"pastures",type:TYPE.STABLE,name:"STABLES",desc:"Houses war horses.",icon:"🐎",cost:{wood:50,food:40}},
 {id:"wonder",category:"town-halls",type:TYPE.WONDER,name:"ANCIENT WONDER",desc:"A monumental royal project.",icon:"✨",cost:{wood:180,stone:240,gold:120}},
 {id:"royal-citadel",category:"fortresses",type:TYPE.KEEP,name:"ROYAL CITADEL",desc:"A mighty fortress for the heart of a kingdom.",icon:"🏯",cost:{wood:160,stone:220,gold:70}},
 {id:"royal-knight",category:"knights",type:TYPE.KNIGHT,name:"ROYAL KNIGHT",desc:"A powerful mounted warrior.",icon:"🗡️",cost:{gold:45,food:25},kind:"unit"},
 {id:"guard-patrol",category:"guards",type:TYPE.GUARD,name:"GUARD PATROL",desc:"A trained defender.",icon:"🛡️",cost:{gold:18,food:10},kind:"unit"},
 {id:"longbow-archer",category:"archers",type:TYPE.ARCHER,name:"LONGBOW ARCHER",desc:"A ranged defender.",icon:"🏹",cost:{gold:24,food:12},kind:"unit"},
 {id:"settler",category:"farmers",type:TYPE.VILLAGER,name:"SETTLER",desc:"A new resident seeking a home.",icon:"🧑‍🌾",cost:{food:12},kind:"person"},
 {id:"wild-deer",category:"deer",type:TYPE.DEER,name:"WILD DEER",desc:"A small herd animal.",icon:"🦌",cost:{food:3},kind:"animal"},
 {id:"bountiful-harvest",category:"harvests",name:"BOUNTIFUL HARVEST",desc:"A sudden yield of food.",icon:"🌽",cost:{gold:5},kind:"effect",effect:"harvest"},
 {id:"gold-rush",category:"discoveries",name:"GOLD RUSH",desc:"A fortunate discovery.",icon:"💰",cost:{food:8},kind:"effect",effect:"gold-rush"},
 {id:"festival-blessing",category:"festivals",name:"FESTIVAL BLESSING",desc:"Lift the people's spirits.",icon:"🎐",cost:{food:12},kind:"effect",effect:"festival"},
 {id:"young-dragon",category:"dragons",type:TYPE.DRAGON,name:"YOUNG DRAGON",desc:"A living dragon joins the realm: it grows, hungers, bonds with the crown and defends its allies.",icon:"🐉",cost:{food:30,gold:45},kind:"creature",unit:true}
];
const ARCHETYPES={
 settlement:[TYPE.HOUSE,"building","🏠",{wood:26,stone:7},"A place for the realm's growing population."],
 agriculture:[TYPE.FARM,"building","🌾",{wood:24,food:5},"Improves the realm's food supply."],
 husbandry:[TYPE.STABLE,"building","🐎",{wood:32,food:12},"Supports the keeping and breeding of useful animals."],
 forestry:[TYPE.LUMBER,"building","🌲",{wood:18},"A useful source of timber."],
 industry:[TYPE.QUARRY,"building","⚒️",{wood:34,stone:13},"Adds productive capacity to the realm."],
 mining:[TYPE.GOLDMINE,"building","⛏️",{wood:38,stone:28},"Opens a seam beneath the hills."],
 craft:[TYPE.MILL,"building","🔨",{wood:30,stone:12},"A skilled workshop serving the settlement."],
 civic:[TYPE.TAVERN,"building","🏛️",{wood:34,stone:15},"A civic place supporting local life."],
 trade:[TYPE.TAVERN,"building","⚖️",{wood:42,stone:18},"Strengthens exchange and commerce."],
 education:[TYPE.TEMPLE,"building","📜",{wood:30,stone:26},"Preserves knowledge and trains learned minds."],
 faith:[TYPE.TEMPLE,"building","⛪",{stone:45,gold:12},"A sacred place for the faithful."],
 defense:[TYPE.TOWER,"building","🏰",{wood:32,stone:26},"Strengthens the settlement's defences."],
 military:[TYPE.GUARD,"unit","🛡️",{gold:20,food:12},"A trained defender joins the realm."],
 nature:[TYPE.DEER,"animal","🌳",{food:4},"A living element of the surrounding land."],
 animals:[TYPE.DEER,"animal","🦌",{food:5},"Wildlife appears in the surrounding landscape."],
 people:[TYPE.VILLAGER,"person","🧑‍🌾",{food:10},"A new person joins the settlement."],
 court:[TYPE.VILLAGER,"person","👑",{food:12,gold:5},"A figure enters the royal household."],
 travel:[TYPE.VILLAGER,"person","🧭",{food:8},"A traveller arrives from beyond the known roads."],
 magic:[null,"effect","🔮",{gold:12},"An arcane occurrence bends the fortunes of the realm."],
 mysteries:[null,"effect","🗝️",{gold:8},"A strange discovery stirs the old stories."],
 events:[null,"effect","✨",{gold:5},"A sudden occurrence changes the fortunes of the realm."],
 law:[TYPE.TOWER,"building","⚖️",{wood:24,stone:20},"Establishes order and public authority."],
 maritime:[TYPE.MILL,"building","⚓",{wood:42,stone:12},"Serves travellers and traders along the water."],
 infrastructure:[TYPE.WALL,"building","🌉",{wood:24,stone:22},"Connects and protects the growing settlement."],
 medicine:[TYPE.TEMPLE,"building","🌿",{wood:25,stone:22},"Offers shelter and care to the sick."],
 diplomacy:[TYPE.VILLAGER,"person","🕊️",{food:8,gold:10},"A foreign envoy joins the court."],
 culture:[null,"effect","🎭",{food:10},"A shared celebration changes the mood of the realm."],
 engineering:[TYPE.MILL,"building","⚙️",{wood:38,stone:20},"A practical invention improves local production."],
 fishing:[TYPE.FARM,"building","🐟",{wood:28,food:7},"Makes use of nearby waters."],
 alchemy:[null,"effect","⚗️",{gold:14},"A curious formula produces an unexpected result."],
 cuisine:[TYPE.TAVERN,"building","🍲",{wood:25,food:15},"Feeds travellers and strengthens fellowship."],
 textiles:[TYPE.MILL,"building","🧶",{wood:27,food:8},"Turns raw materials into valuable cloth."],
 architecture:[TYPE.HOUSE,"building","🏛️",{wood:36,stone:30},"Adds a striking work of craftsmanship."],
 finance:[TYPE.TAVERN,"building","🪙",{wood:34,gold:12},"Strengthens the flow of coin through the realm."],
 communication:[TYPE.TOWER,"building","🐦",{wood:26,stone:16},"Carries news swiftly across the countryside."],
 music:[null,"effect","🎼",{food:8},"Music and ceremony lift the people's hearts."],
 warfare:[TYPE.GUARD,"unit","⚔️",{gold:28,food:14},"A seasoned warrior joins the muster."],
 politics:[TYPE.VILLAGER,"person","📜",{food:9,gold:8},"A political figure enters the royal circle."],
 monsters:[TYPE.DEER,"animal","🐉",{food:16,gold:10},"A rare creature appears at the edge of the realm."],
 seasons:[null,"effect","🍂",{food:6},"The changing season brings an unexpected blessing."],
 weather:[TYPE.FARM,"building","🌦️",{wood:28,stone:12},"A weatherwise holding makes the most of the changing skies."],
 underworld:[TYPE.GUARD,"unit","🗝️",{gold:24,food:10},"A shadowed figure offers dangerous services to the crown."],
 spirits:[null,"effect","👻",{gold:9},"An unseen presence alters the fortunes of the realm."],
 relics:[null,"effect","🏺",{gold:12},"An ancient relic carries a forgotten power."],
 botany:[TYPE.FARM,"building","🌿",{wood:22,food:8},"Rare plants bring food, medicine and new discoveries."],
 geology:[TYPE.QUARRY,"building","🪨",{wood:30,stone:16},"A geological survey reveals valuable stone and minerals."],
 administration:[TYPE.TOWER,"building","📜",{wood:24,stone:18},"A royal office strengthens local administration."],
 frontier:[TYPE.GUARD,"unit","🏹",{gold:22,food:13},"A frontier scout joins the royal muster."],
 urbanism:[TYPE.HOUSE,"building","🏘️",{wood:34,stone:22},"A planned urban quarter makes room for the growing realm."],
 scholarship:[TYPE.TEMPLE,"building","📚",{wood:26,stone:20},"A learned institution preserves knowledge and trains minds."]
};
const SIZE=[0.3,0.5,0.7,1,1.25,1.6,2,3,4,6];
const COST=[0.7,0.85,1,1.2,1.5,1.9,2.5,3.2,4.2,5.5];
const RARITY=["","FINE","WORKED","RARE","EPIC","MYTHIC","ROYAL","ANCIENT","LEGENDARY","UNIQUE"];
const SCALE=["TINY","SMALL","COMPACT","","LARGE","GRAND","NOBLE","DISTRICT","MONUMENTAL","REALM-SIZED"];
const CONTEXT={spring:"OF THE THAW",summer:"OF HIGH SUMMER",autumn:"OF THE HARVEST",winter:"OF WINTERFELL",frontier:"OF THE FRONTIER",heartland:"OF THE HEARTLAND",coastal:"OF THE COAST",highland:"OF THE HIGHLANDS","trade-route":"OF THE GREAT ROAD","war-time":"OF THE WAR YEARS"};
export const CARD_PROTOTYPES=Object.freeze(PROTOTYPES.map(p=>Object.freeze({...p,kind:p.kind||(p.unit?"unit":"building"),unit:Boolean(p.unit||["unit","person","animal"].includes(p.kind)),group:CARD_CATEGORIES.find(c=>c.id===p.category)?.group||"settlement",categoryName:CARD_CATEGORIES.find(c=>c.id===p.category)?.name||"General"})));
function categoryPrototype(category){
 const curated=PROTOTYPES.find(p=>p.category===category.id);
 if(curated)return {...curated,kind:curated.kind||(curated.unit?"unit":"building"),unit:Boolean(curated.unit||["unit","person","animal"].includes(curated.kind)),group:category.group,categoryName:category.name};
 const a=ARCHETYPES[category.group]||ARCHETYPES.civic;
 let [type,kind,icon,cost,desc]=a;
 let effect;
 if(category.id.includes("harvest")||category.id.includes("orchard"))effect="harvest";
 if(category.id.includes("festival")||category.group==="music"||category.group==="culture")effect="festival";
 if(category.id.includes("mystery")||category.id.includes("discovery")||category.group==="alchemy")effect="gold-rush";
 if(category.group==="animals"||category.group==="monsters")kind="animal";
 if(kind==="effect"&&!effect)effect=["seasons","weather","botany"].includes(category.group)?"harvest":(["magic","mysteries","alchemy","spirits","relics"].includes(category.group)?"gold-rush":"festival");
 return {id:category.id,category:category.id,categoryName:category.name,group:category.group,type,name:category.name.toUpperCase(),desc,icon,cost:{...cost},kind,effect,unit:["unit","person","animal"].includes(kind)};
}
export function createCardForCategory(id,options={}){
 const category=CARD_CATEGORIES.find(c=>c.id===id);
 if(!category)throw new RangeError("Unknown card category: "+id);
 return createCardVariant(categoryPrototype(category),options);
}
export function createCardVariant(prototype,{scale="standard",rarity="common",context="heartland"}={}){
 const si=CARD_VARIANT_DIMENSIONS.scales.indexOf(scale),ri=CARD_VARIANT_DIMENSIONS.rarities.indexOf(rarity);
 if(!prototype||si<0||ri<0||!CARD_VARIANT_DIMENSIONS.contexts.includes(context))throw new RangeError("Unknown card prototype or variant dimension.");
 const base=prototype.baseName||prototype.name,variant=[RARITY[ri],SCALE[si],base,CONTEXT[context]].filter(Boolean).join(" ");
 return {...prototype,id:[prototype.id,scale,rarity,context].join(":"),baseName:base,name:variant||base,scale,rarity,context,sizeMultiplier:SIZE[si],cost:Object.fromEntries(Object.entries(prototype.cost||{}).map(([k,v])=>[k,Math.max(1,Math.round(v*SIZE[si]*COST[ri]))]))};
}
