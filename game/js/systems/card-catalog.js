// Data-driven card taxonomy. Potential variants are generated on demand.
import { TYPE } from "../core/types.js";
const GROUPS={
settlement:["cottages","manors","tenements","farmhouses","townhouses","inns","guildhalls","market-houses","granaries","warehouses"],
agriculture:["wheat-fields","orchards","vineyards","herb-gardens","apiaries","pastures","fish-farms","windmills","watermills","irrigation"],
industry:["lumber-camps","stone-quarries","gold-mines","iron-mines","smelters","foundries","workshops","carpenters","weavers","potteries"],
civic:["wells","fountains","roads","bridges","courtyards","plazas","schools","libraries","courthouses","town-halls"],
defense:["watchtowers","walls","gatehouses","battlements","moats","traps","barricades","lookouts","siege-works","fortresses"],
military:["militia","guards","archers","knights","cavalry","scouts","captains","banners","formations","garrisons"],
nature:["forests","groves","rocks","lakes","rivers","marshes","cliffs","meadows","caves","ruins"],
animals:["deer","boars","wolves","sheep","cattle","horses","dogs","falcons","bees","fish"],
people:["farmers","miners","merchants","builders","priests","healers","scholars","artisans","nobles","travellers"],
events:["harvests","festivals","plagues","droughts","storms","discoveries","pilgrimages","raids","caravans","mysteries"]
};
export const CARD_CATEGORIES=Object.freeze(Object.entries(GROUPS).flatMap(([group,names])=>names.map((id,index)=>Object.freeze({
    id,group,name:id.split("-").map(part=>part[0].toUpperCase()+part.slice(1)).join(" "),sort:index
}))));
export const CARD_VARIANT_DIMENSIONS=Object.freeze({
    scales:["trinket","small","compact","standard","large","grand","estate","district","monument","realm"],
    rarities:["common","uncommon","fine","rare","epic","mythic","royal","ancient","legendary","unique"],
    contexts:["spring","summer","autumn","winter","frontier","heartland","coastal","highland","trade-route","war-time"]
});
export const POTENTIAL_CARD_VARIANTS=CARD_CATEGORIES.length*CARD_VARIANT_DIMENSIONS.scales.length*
    CARD_VARIANT_DIMENSIONS.rarities.length*CARD_VARIANT_DIMENSIONS.contexts.length;

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
{id:"wonder",category:"town-halls",type:TYPE.WONDER,name:"ANCIENT WONDER",desc:"A monumental royal project.",icon:"✨",cost:{wood:180,stone:240,gold:120},scale:3},
{id:"royal-citadel",category:"fortresses",type:TYPE.KEEP,name:"ROYAL CITADEL",desc:"A mighty fortress for the heart of a kingdom.",icon:"🏯",cost:{wood:160,stone:220,gold:70},scale:1.5},
{id:"royal-knight",category:"knights",type:TYPE.KNIGHT,name:"ROYAL KNIGHT",desc:"A powerful mounted warrior.",icon:"🗡️",cost:{gold:45,food:25},unit:true,kind:"unit"},
{id:"guard-patrol",category:"guards",type:TYPE.GUARD,name:"GUARD PATROL",desc:"A trained defender for your settlement.",icon:"🛡️",cost:{gold:18,food:10},unit:true,kind:"unit"},
{id:"longbow-archer",category:"archers",type:TYPE.ARCHER,name:"LONGBOW ARCHER",desc:"A ranged defender.",icon:"🏹",cost:{gold:24,food:12},unit:true,kind:"unit"},
{id:"settler",category:"farmers",type:TYPE.VILLAGER,name:"SETTLER",desc:"A new resident looking for a home.",icon:"🧑‍🌾",cost:{food:12},unit:true,kind:"person"},
{id:"wild-deer",category:"deer",type:TYPE.DEER,name:"WILD DEER",desc:"A small herd animal for the surrounding lands.",icon:"🦌",cost:{food:3},unit:true,kind:"animal"},
{id:"bountiful-harvest",category:"harvests",name:"BOUNTIFUL HARVEST",desc:"A sudden yield of food for the realm.",icon:"🌽",cost:{gold:5},kind:"effect",effect:"harvest"},
{id:"gold-rush",category:"discoveries",name:"GOLD RUSH",desc:"A fortunate discovery fills the royal treasury.",icon:"💰",cost:{food:8},kind:"effect",effect:"gold-rush"},
{id:"festival-blessing",category:"festivals",name:"FESTIVAL BLESSING",desc:"Celebrate together and lift the people's spirits.",icon:"🎐",cost:{food:12},kind:"effect",effect:"festival"}
];
export const CARD_PROTOTYPES=Object.freeze(PROTOTYPES.map(card=>Object.freeze({
    ...card,kind:card.kind||(card.unit?"unit":"building"),
    categoryName:CARD_CATEGORIES.find(item=>item.id===card.category)?.name||"General",
    rarity:"common",context:"heartland"
})));
function createCategoryPrototype(category) {
    const curated = PROTOTYPES.find(card => card.category === category.id);
    if (curated) return curated;
    const archetypes = {
        settlement:{type:TYPE.HOUSE,kind:"building",icon:"🏠",cost:{wood:24,stone:6},desc:"A place for the realm's growing population."},
        agriculture:{type:TYPE.FARM,kind:"building",icon:"🌾",cost:{wood:24,food:4},desc:"Improves the settlement's food supply."},
        industry:{type:TYPE.QUARRY,kind:"building",icon:"⚒️",cost:{wood:30,stone:12},desc:"Adds productive capacity to the realm."},
        civic:{type:TYPE.TAVERN,kind:"building",icon:"🏛️",cost:{wood:32,stone:14},desc:"A civic place that supports local life."},
        defense:{type:TYPE.TOWER,kind:"building",icon:"🏰",cost:{wood:30,stone:24},desc:"Strengthens the settlement's defences."},
        military:{type:TYPE.GUARD,kind:"unit",unit:true,icon:"🛡️",cost:{gold:20,food:12},desc:"Adds a trained defender to the realm."},
        nature:{type:TYPE.DEER,kind:"animal",unit:true,icon:"🌳",cost:{food:4},desc:"Introduces a living element to the surrounding land."},
        animals:{type:TYPE.DEER,kind:"animal",unit:true,icon:"🦌",cost:{food:5},desc:"Adds wildlife to the surrounding landscape."},
        people:{type:TYPE.VILLAGER,kind:"person",unit:true,icon:"🧑‍🌾",cost:{food:10},desc:"Welcomes a new person to the settlement."},
        events:{kind:"effect",icon:"✨",cost:{gold:5},desc:"A sudden occurrence changes the fortunes of the realm.",effect:"festival"}
    };
    const archetype=archetypes[category.group]||archetypes.civic;
    let type=archetype.type;
    let effect=archetype.effect;
    if(category.id.includes("gold-mine")){type=TYPE.GOLDMINE;}
    if(category.id.includes("harvest"))effect="harvest";
    if(category.id.includes("festival"))effect="festival";
    if(category.id.includes("mystery")||category.id.includes("discover"))effect="gold-rush";
    const title=category.name.toUpperCase();
    return {
        id:category.id,category:category.id,categoryName:category.name,
        type,name:title,desc:archetype.desc,icon:archetype.icon,
        cost:{...archetype.cost},unit:Boolean(archetype.unit),kind:archetype.kind,
        effect,rarity:"common",context:"heartland"
    };
}

export function createCardForCategory(categoryId,options={}) {
    const category=CARD_CATEGORIES.find(item=>item.id===categoryId);
    if(!category)throw new RangeError("Unknown card category: "+categoryId);
    return createCardVariant(createCategoryPrototype(category),options);
}

export function createCardVariant(prototype,{scale="standard",rarity="common",context="heartland"}={}){
    if(!prototype||!CARD_VARIANT_DIMENSIONS.scales.includes(scale)||
       !CARD_VARIANT_DIMENSIONS.rarities.includes(rarity)||
       !CARD_VARIANT_DIMENSIONS.contexts.includes(context))throw new RangeError("Unknown card prototype or variant dimension.");
    const si=CARD_VARIANT_DIMENSIONS.scales.indexOf(scale),ri=CARD_VARIANT_DIMENSIONS.rarities.indexOf(rarity);
    const sizeMultiplier=[0.3,0.5,0.7,1,1.25,1.6,2,3,4,6][si];
    const costMultiplier=[0.7,0.85,1,1.2,1.5,1.9,2.5,3.2,4.2,5.5][ri];
    return {...prototype,id:[prototype.id,scale,rarity,context].join(":"),scale,rarity,context,sizeMultiplier,
        cost:Object.fromEntries(Object.entries(prototype.cost||{}).map(([key,value])=>[key,Math.max(1,Math.round(value*sizeMultiplier*costMultiplier))]))};
}
