// Authored multi-stage story arcs. Effects use the same validated event ledger as ordinary issues.
export const EVENT_CHAINS = Object.freeze({
    migration: Object.freeze([
        { title:"The Settlers' Petition", description:"The newcomers ask for a place within the walls and a share of the common fields.", choices:[
            {label:"Welcome the families",description:"Spend 8 food; gain 2 residents and improve prosperity.",effects:{resources:{food:-8},villagers:2,morale:2,hidden:{prosperity:3,tension:1}}},
            {label:"Keep the gates closed",description:"Preserve supplies, but deepen resentment.",effects:{morale:-3,hidden:{tension:4,prosperity:-1}}}
        ]},
        { title:"A Dispute Over the Commons", description:"Old households and new settlers both claim the same pasture and woodland.", choices:[
            {label:"Grant shared rights",description:"Spend 12 food and strengthen civic trust.",effects:{resources:{food:-12},morale:2,hidden:{prosperity:4,tension:-2}}},
            {label:"Reserve the land for old households",description:"Gain 10 wood, but the dispute grows sharper.",effects:{resources:{wood:10},hidden:{prosperity:-1,tension:3}}}
        ]},
        { title:"The New Ward", description:"The settlers have built a small quarter beyond the market road. The crown must decide its future.", choices:[
            {label:"Recognise the ward",description:"Spend 20 wood and 8 stone; the new quarter becomes part of the realm.",effects:{resources:{wood:-20,stone:-8},morale:4,hidden:{prosperity:6,tension:-3}}},
            {label:"Demand service to the crown",description:"Gain 12 gold, but the new households feel exploited.",effects:{resources:{gold:12},morale:-2,hidden:{prosperity:1,tension:4}}}
        ]}
    ]),
    crime: Object.freeze([
        { title:"The Missing Ledger", description:"A merchant's accounts have vanished, and several guilds accuse one another.", choices:[
            {label:"Fund a proper inquiry",description:"Spend 5 gold to uncover the truth.",effects:{resources:{gold:-5},hidden:{tension:-1,mystery:1}}},
            {label:"Let the guilds settle it",description:"Avoid expense, but public confidence suffers.",effects:{morale:-2,hidden:{tension:3}}}
        ]},
        { title:"A Name in the Margins", description:"A clerk has found a name linking the theft to a respected trading house.", choices:[
            {label:"Expose the guilty house",description:"Recover 18 gold; the guilds are shaken.",effects:{resources:{gold:18},hidden:{tension:3,prosperity:-1}}},
            {label:"Offer a quiet amnesty",description:"Spend 10 gold to restore confidence and calm the market.",effects:{resources:{gold:-10},morale:2,hidden:{tension:-3,prosperity:2}}}
        ]},
        { title:"The Guild's Reckoning", description:"The trading houses demand a final settlement before business can return to normal.", choices:[
            {label:"Establish royal oversight",description:"Spend 10 gold and restore public confidence.",effects:{resources:{gold:-10},morale:2,hidden:{tension:-2,prosperity:5}}},
            {label:"Impose a royal fine",description:"Gain 12 gold, but anger the guilds.",effects:{resources:{gold:12},morale:-2,hidden:{tension:5,prosperity:-2}}}
        ]}
    ]),
    ruins: Object.freeze([
        { title:"The Surveyor's Mark", description:"A weathered map points to a sealed chamber beneath the old stones.", choices:[
            {label:"Send an expedition",description:"Spend 10 wood to investigate the site.",effects:{resources:{wood:-10},hidden:{mystery:4,prosperity:1}}},
            {label:"Seal the entrance",description:"Gain 4 gold from salvaged tools and keep the danger buried.",effects:{resources:{gold:4},hidden:{mystery:-2,tension:-1}}}
        ]},
        { title:"Voices Below", description:"The expedition reports strange voices and a chamber lined with forgotten royal names.", choices:[
            {label:"Descend into the crypt",description:"Spend 12 gold to reach the inner chamber.",effects:{resources:{gold:-12},hidden:{mystery:6,tension:1}}},
            {label:"Collapse the passage",description:"Recover 10 stone and end the expedition.",effects:{resources:{stone:10},hidden:{mystery:-3}}}
        ]},
        { title:"The Lost Reliquary", description:"Beyond the crypt lies a royal reliquary, untouched since the first kings.", choices:[
            {label:"Return the relic to the crown",description:"Gain 35 gold and raise the people's spirits.",effects:{resources:{gold:35},morale:3,hidden:{mystery:2,prosperity:3}}},
            {label:"Leave the relic undisturbed",description:"Gain 12 gold from the expedition's findings and preserve the old peace.",effects:{resources:{gold:12},hidden:{mystery:-2,tension:-1}}}
        ]}
    ]),
    diplomacy: Object.freeze([
        { title:"The Envoy's Terms", description:"A neighbouring power proposes a compact of safe passage and shared markets.", choices:[
            {label:"Offer a royal guarantee",description:"Spend 10 gold to open a path to prosperity.",effects:{resources:{gold:-10},hidden:{prosperity:4,tension:-2}}},
            {label:"Reject the proposal",description:"Keep the treasury intact, but relations cool.",effects:{resources:{gold:5},hidden:{tension:3,prosperity:-1}}}
        ]},
        { title:"A Border Incident", description:"A patrol has detained merchants on the disputed road. The new compact is already under strain.", choices:[
            {label:"Send a mediator",description:"Spend 10 food and reduce tensions.",effects:{resources:{food:-10},hidden:{tension:-4,prosperity:2},morale:1}},
            {label:"Demonstrate royal strength",description:"Spend 5 gold to reinforce the border, risking escalation.",effects:{resources:{gold:-5},hidden:{tension:4,mystery:1}}}
        ]},
        { title:"The Treaty Seal", description:"The envoy awaits the crown's final word. A lasting treaty is within reach.", choices:[
            {label:"Ratify the treaty",description:"Gain 18 gold and secure a prosperous relationship.",effects:{resources:{gold:18},hidden:{prosperity:6,tension:-4},morale:2}},
            {label:"Delay the decision",description:"Buy time, but leave the future uncertain.",effects:{resources:{gold:-4},hidden:{tension:2,prosperity:-1}}}
        ]}
    ]),
    plague: Object.freeze([
        {title:"The First Cases",description:"A strange fever spreads through the crowded quarter. The healers ask for urgent supplies.",choices:[
            {label:"Open the royal infirmary",description:"Spend food and gold to slow the sickness and secure an infirmary card.",effects:{resources:{food:-12,gold:-5},morale:2,hidden:{tension:-2,mystery:1},health:{outbreak:true,severity:2,containment:1,treatment:1,disease:"red-fever"},politics:{commons:1,clergy:2,legitimacy:1},cardReward:"infirmaries"}},
            {label:"Trust the old remedies",description:"Save the treasury, but the fever may spread.",effects:{morale:-3,hidden:{tension:4,mystery:2},health:{outbreak:true,severity:3,containment:0,disease:"red-fever"},politics:{commons:-3,clergy:-1,legitimacy:-2}}}
        ]},
        {title:"The Quarantine Debate",description:"The guilds resist restrictions while the healers warn that delay will cost lives.",choices:[
            {label:"Establish a guarded quarantine",description:"Spend wood to isolate the worst-affected streets.",effects:{resources:{wood:-14},morale:-1,hidden:{tension:-3,prosperity:-1},health:{containment:2,treatment:1},politics:{commons:1,guilds:-2,clergy:2,legitimacy:1}}},
            {label:"Keep the markets open",description:"Preserve trade, but public anxiety deepens.",effects:{morale:-4,hidden:{tension:5,mystery:1},health:{containment:-1},politics:{commons:-2,guilds:2,clergy:-2,legitimacy:-1}}}
        ]},
        {title:"The Last Bell",description:"The fever has weakened. The realm must decide how to remember the crisis.",choices:[
            {label:"Found a house of healing",description:"Spend stone and gold to found a house of healing and secure an infirmary card.",effects:{resources:{stone:-12,gold:-8},morale:5,hidden:{prosperity:5,tension:-4},health:{treatment:2,containment:1},politics:{commons:1,clergy:2,legitimacy:1},cardReward:"infirmaries"}},
            {label:"Return to ordinary life",description:"Recover stability quickly, but leave the old infirmary unchanged.",effects:{morale:1,hidden:{prosperity:1,mystery:2},health:{containment:-1},politics:{clergy:-1,legitimacy:-1}}}
        ]}
    ]),
    rebellion: Object.freeze([
        {title:"Whispers in the Ward",description:"Tax collectors report closed doors, missing notices and gatherings after dark.",choices:[
            {label:"Hear the petitioners",description:"Spend gold to investigate their grievances.",effects:{resources:{gold:-8},morale:2,hidden:{tension:-3,mystery:1}}},
            {label:"Send the royal guard",description:"Restore immediate order, but resentment grows.",effects:{morale:-3,hidden:{tension:6,prosperity:-1}}}
        ]},
        {title:"The Banners Gather",description:"Several districts now speak with one voice. The crown must choose between reform and force.",choices:[
            {label:"Convene a royal assembly",description:"Spend food and gold to negotiate.",effects:{resources:{food:-8,gold:-6},morale:3,hidden:{tension:-4,prosperity:2}}},
            {label:"Declare the gatherings unlawful",description:"Gain temporary authority at a lasting cost.",effects:{morale:-5,hidden:{tension:7,mystery:1}}}
        ]},
        {title:"The Realm's Oath",description:"The final settlement is ready. Its terms will define the relationship between crown and people.",choices:[
            {label:"Grant a charter of rights",description:"Spend gold to secure a more stable realm.",effects:{resources:{gold:-18},morale:6,hidden:{prosperity:7,tension:-7}}},
            {label:"Demand an oath of obedience",description:"The treasury is spared, but the conflict remains beneath the surface.",effects:{resources:{gold:8},morale:-4,hidden:{tension:5,prosperity:-2}}}
        ]}
    ]),
    guild: Object.freeze([
        {title:"The Masters' Petition",description:"The guilds ask the crown to recognise their privileges and regulate the town's crafts.",choices:[
            {label:"Grant a royal charter",description:"Spend gold to formalise the guilds' duties and rights.",effects:{resources:{gold:-8},hidden:{prosperity:4,tension:-2}}},
            {label:"Keep the trades unregulated",description:"Avoid royal expense, but guild rivalries intensify.",effects:{morale:-1,hidden:{tension:3,prosperity:-1}}}
        ]},
        {title:"The Price of Privilege",description:"The new charter has brought prosperity to some workshops and resentment to others.",choices:[
            {label:"Open apprenticeships",description:"Spend food and wood to widen access to skilled work.",effects:{resources:{food:-6,wood:-8},morale:3,hidden:{prosperity:4,tension:-2}}},
            {label:"Protect the established masters",description:"Gain coin, but younger craftspeople lose hope.",effects:{resources:{gold:12},morale:-2,hidden:{tension:3,prosperity:1}}}
        ]},
        {title:"The Guildhall's Seal",description:"The guilds offer a final compact to supply the realm in exchange for a lasting place at court.",choices:[
            {label:"Seal the compact",description:"Spend stone and gold to establish a permanent guildhall.",effects:{resources:{stone:-10,gold:-10},morale:4,hidden:{prosperity:6,tension:-3}}},
            {label:"Refuse their influence",description:"Keep the court independent, but lose a source of skilled investment.",effects:{morale:-2,hidden:{prosperity:-3,tension:2}}}
        ]}
    ]),
    succession: Object.freeze([
        {title:"The Uncertain Heir",description:"A noble household questions the line of succession and asks the crown to clarify its intentions.",choices:[
            {label:"Summon the royal council",description:"Spend gold to establish a lawful hearing.",effects:{resources:{gold:-6},hidden:{tension:-2,mystery:2}}},
            {label:"Name the heir at once",description:"End uncertainty, but alienate rival claimants.",effects:{morale:-2,hidden:{tension:4,mystery:-1}}}
        ]},
        {title:"The Houses Take Sides",description:"Several noble houses have declared their support. Their rivalries now threaten the peace.",choices:[
            {label:"Broker a marriage alliance",description:"Spend food and gold to bind the houses together.",effects:{resources:{food:-8,gold:-10},morale:3,hidden:{prosperity:3,tension:-4}}},
            {label:"Reward the loyal houses",description:"Secure immediate support while deepening the divide.",effects:{resources:{gold:-4},hidden:{tension:5,prosperity:1}}}
        ]},
        {title:"The Crown's Testament",description:"The succession is settled. The final proclamation will become part of the royal record.",choices:[
            {label:"Publish the succession charter",description:"Spend gold to secure legitimacy for the next generation.",effects:{resources:{gold:-14},morale:5,hidden:{prosperity:5,tension:-5,mystery:-1}}},
            {label:"Keep the settlement secret",description:"Preserve royal discretion, but leave rumours alive.",effects:{morale:-2,hidden:{tension:3,mystery:4}}}
        ]}
    ]),
    shortage: Object.freeze([
        {title:"The Empty Granaries",description:"The royal stores are falling and village reeves warn that several households have little food left.",choices:[
            {label:"Open the reserve stores",description:"Spend timber to distribute food and calm the commons.",effects:{resources:{wood:-10,food:14},morale:3,hidden:{tension:-3,prosperity:1},politics:{commons:3,legitimacy:2},cardReward:"warehouses"}},
            {label:"Leave prices to the market",description:"Protect the treasury, but hardship and resentment grow.",effects:{morale:-4,hidden:{tension:5,prosperity:-2},politics:{commons:-4,legitimacy:-2}}}
        ]},
        {title:"The Price of Grain",description:"Merchants offer imported grain, but demand favourable tolls and guarantees.",choices:[
            {label:"Buy emergency grain",description:"Spend gold to restore the food supply and secure the trade route.",effects:{resources:{gold:-14,food:22},morale:2,hidden:{prosperity:3,tension:-2},politics:{guilds:2,commons:2}}},
            {label:"Refuse the merchants' terms",description:"Avoid a costly agreement, but the shortage persists.",effects:{morale:-3,hidden:{tension:3,prosperity:-1},politics:{guilds:-2,commons:-2}}}
        ]},
        {title:"A Granary for the Future",description:"The crisis has exposed the weakness of the realm's food reserves.",choices:[
            {label:"Establish winter stores",description:"Spend stone and gold to secure future harvests and receive a supply-cache card.",effects:{resources:{stone:-10,gold:-8},morale:4,hidden:{prosperity:5,tension:-4},politics:{commons:2,legitimacy:2},cardReward:"warehouses"}},
            {label:"Rely on private merchants",description:"Preserve royal funds, but leave food security in private hands.",effects:{resources:{gold:8},morale:-1,hidden:{prosperity:1,tension:3},politics:{guilds:3,commons:-2}}}
        ]}
    ]),
    flood: Object.freeze([
        {title:"The River Breaks Its Banks",description:"The river has flooded the lower ward. Families seek higher ground and the old road is under water.",choices:[
            {label:"Evacuate the lower ward",description:"Spend food and timber to move residents and protect the vulnerable.",effects:{resources:{food:-8,wood:-8},morale:2,hidden:{tension:-2,prosperity:-1},politics:{commons:2,legitimacy:1}}},
            {label:"Protect the royal storehouses first",description:"Save the treasury's supplies, but leave the lower ward exposed.",effects:{resources:{food:8},morale:-4,hidden:{tension:5,prosperity:-2},politics:{commons:-4,legitimacy:-2}}}
        ]},
        {title:"Water in the Wells",description:"Floodwater has entered several wells. Healers warn that sickness may follow if the water is not made safe.",choices:[
            {label:"Clean the wells and aid the healers",description:"Spend gold and supplies to reduce the danger of disease.",effects:{resources:{gold:-8,food:-5},morale:2,health:{outbreak:true,severity:1,containment:2,treatment:1,disease:"water-fever"},politics:{clergy:2,commons:1},hidden:{tension:-2,mystery:1}}},
            {label:"Reopen the markets immediately",description:"Restore trade sooner, but contaminated water may spread illness.",effects:{morale:-2,health:{outbreak:true,severity:2,containment:0,disease:"water-fever"},politics:{guilds:2,commons:-2,legitimacy:-1},hidden:{tension:4,prosperity:1}}}
        ]},
        {title:"The Causeway Question",description:"The river has receded. The crown must decide whether to rebuild the crossing or accept a longer route.",choices:[
            {label:"Raise a stone causeway",description:"Spend stone and gold to protect the road.",effects:{resources:{stone:-16,gold:-8},morale:4,hidden:{prosperity:5,tension:-3},politics:{commons:2,guilds:1,legitimacy:2}}},
            {label:"Let the old road be abandoned",description:"Save the treasury, but isolate the lower villages.",effects:{morale:-3,hidden:{prosperity:-3,tension:4},politics:{commons:-3,nobility:1,legitimacy:-1}}}
        ]}
    ]),
    fire: Object.freeze([
        {title:"The Bell of Alarm",description:"A fire has broken out among the timber houses. Smoke is visible from the royal road.",choices:[
            {label:"Raise a bucket brigade",description:"Spend timber and gold to contain the fire.",effects:{resources:{wood:-8,gold:-5},morale:2,hidden:{tension:-2,prosperity:1},politics:{commons:2,legitimacy:1}}},
            {label:"Save the royal warehouses",description:"Protect valuable stores first, but ordinary households bear the loss.",effects:{resources:{food:5},morale:-4,hidden:{tension:5,prosperity:-2},politics:{commons:-4,legitimacy:-2}}}
        ]},
        {title:"Ashes in the Ward",description:"The flames are out, but several workshops and homes have been damaged. The displaced ask for help.",choices:[
            {label:"Fund repairs for the families",description:"Spend wood and food to restore homes and workshops.",effects:{resources:{wood:-12,food:-8},morale:4,hidden:{prosperity:3,tension:-3},politics:{commons:3,guilds:1}}},
            {label:"Grant the rebuilding rights to the guilds",description:"Let the guilds rebuild quickly, but accept their new influence.",effects:{resources:{gold:-6},morale:1,hidden:{prosperity:4,tension:1},politics:{guilds:3,commons:-1}}}
        ]},
        {title:"A Safer Town",description:"The fire has exposed narrow lanes, timber storehouses and the absence of organised emergency crews.",choices:[
            {label:"Create a permanent fire watch",description:"Spend gold and stone to prepare the town for future emergencies.",effects:{resources:{gold:-10,stone:-8},morale:4,hidden:{prosperity:5,tension:-3},politics:{commons:2,legitimacy:2},cardReward:"watchtowers"}},
            {label:"Return to the old customs",description:"Avoid new expense, but leave the town vulnerable.",effects:{morale:-1,hidden:{tension:3,prosperity:-1},politics:{commons:-2,legitimacy:-1}}}
        ]}
    ]),

    wildlife: Object.freeze([
        {title:"Tracks at the Boundary",description:"Deer, boar and smaller game have gathered where the fields meet the old wood. The reeves ask whether the crown will protect the herd or the harvest.",choices:[
            {label:"Set aside a winter grove",description:"Spend wood to leave cover and browse for the herd; the village gains a lasting hunting ground.",effects:{resources:{wood:-10},morale:2,hidden:{prosperity:3,tension:-2},politics:{commons:2},cardReward:"deer"}},
            {label:"Drive the herd from the fields",description:"Gain food now, but the forest edge loses its quiet and the villagers remain wary.",effects:{resources:{food:15},morale:-2,hidden:{tension:3,prosperity:-1},politics:{commons:-2}}}
        ]},
        {title:"The Herd Returns",description:"The animals have come back in greater numbers. Hunters want a share, while herders fear the crops will be trampled again.",choices:[
            {label:"Open a salt lick and a guarded path",description:"Spend food and wood to keep the herd away from the fields without breaking its route.",effects:{resources:{food:-8,wood:-6},morale:3,hidden:{prosperity:4,tension:-3},politics:{commons:2,clergy:1}}},
            {label:"Sell hunting rights to the guilds",description:"Gain coin from a managed hunt, but the commons lose a familiar part of the wood.",effects:{resources:{gold:14},morale:-1,hidden:{prosperity:2,tension:2},politics:{guilds:3,commons:-2}}}
        ]},
        {title:"The Warden's Charter",description:"The herd has become part of the realm's seasonal rhythm. The crown must decide who will keep watch over the forest edge.",choices:[
            {label:"Appoint a royal warden",description:"Spend gold to establish a permanent warden and secure a deer card for the next draw.",effects:{resources:{gold:-12},morale:4,hidden:{prosperity:5,tension:-3},politics:{commons:2,legitimacy:2},cardReward:"deer"}},
            {label:"Leave the hunt to the villages",description:"Save the treasury and trust old custom, though the next hard winter will test it.",effects:{resources:{gold:5},morale:1,hidden:{prosperity:-1,tension:2},politics:{commons:1,nobility:-1}}}
        ]}
    ]),
    fishing: Object.freeze([
        {title:"The Silver Run",description:"The river has filled with a silver run of fish. The fishing families ask for help landing the catch before the water turns.",choices:[
            {label:"Repair the common weirs",description:"Spend wood and food to bring in a shared catch and strengthen the river villages.",effects:{resources:{wood:-8,food:18},morale:3,hidden:{prosperity:3,tension:-2},politics:{commons:2,guilds:1},cardReward:"river-weirs"}},
            {label:"Sell the run to the fishmongers",description:"Gain gold from a single great catch, but the fishing families receive little.",effects:{resources:{gold:12,food:6},morale:-2,hidden:{prosperity:1,tension:3},politics:{guilds:3,commons:-2}}}
        ]},
        {title:"Nets in the Shallows",description:"Upstream and downstream families accuse one another of blocking the channel. The catch is falling while the argument grows.",choices:[
            {label:"Set a joint river watch",description:"Spend gold to pay watchers from both banks and keep the channel open.",effects:{resources:{gold:-8},morale:2,hidden:{prosperity:3,tension:-4},politics:{commons:2,legitimacy:1}}},
            {label:"Award the water to the highest bidder",description:"Gain gold from a private lease, but the losing families remember the insult.",effects:{resources:{gold:16},morale:-3,hidden:{tension:5,prosperity:2},politics:{guilds:3,commons:-3}}}
        ]},
        {title:"The River Compact",description:"The run has passed, leaving the river villages to decide how the water will be shared next year.",choices:[
            {label:"Renew the common fishery",description:"Spend stone and gold on a lasting compact; the crown secures a river-weir card.",effects:{resources:{stone:-10,gold:-8,food:20},morale:4,hidden:{prosperity:5,tension:-4},politics:{commons:3,guilds:1,legitimacy:2},cardReward:"river-weirs"}},
            {label:"Close the river to common nets",description:"Gain a lease payment, but end the old shared fishery.",effects:{resources:{gold:18},morale:-4,hidden:{tension:5,prosperity:1},politics:{guilds:3,commons:-3,legitimacy:-1}}}
        ]}
    ]),

    harvest: Object.freeze([
        {title:"The Harvest Census",description:"Reeves from the outlying farms bring conflicting measures of the year's yield and ask the crown to settle the count.",choices:[
            {label:"Fund a royal survey",description:"Spend six gold on surveyors; the true count steadies the market and fills a few stores.",effects:{resources:{gold:-6,food:6},morale:1,hidden:{prosperity:3,tension:-1},politics:{commons:1,legitimacy:1}}},
            {label:"Trust the old tallies",description:"Take the larger reported share now, but leave the disputed measures unresolved.",effects:{resources:{food:10},morale:-1,hidden:{tension:2,prosperity:-1},politics:{commons:-1,legitimacy:-1}}}
        ]},
        {title:"The Field Boundaries",description:"A strip of newly ploughed land is claimed by two villages, and the harvest cannot be brought in until the boundary is settled.",choices:[
            {label:"Set stone boundary marks",description:"Spend eight stone on lasting markers that both villages can see and trust.",effects:{resources:{stone:-8},morale:2,hidden:{prosperity:4,tension:-3},politics:{nobility:1,commons:1}}},
            {label:"Let the villages decide by custom",description:"Avoid royal expense, but the same dispute will return at the next sowing.",effects:{resources:{wood:4},morale:-1,hidden:{tension:3,prosperity:-1},politics:{commons:-1}}}
        ]},
        {title:"The Harvest Feast",description:"The grain is safely stored. The realm must choose between a shared feast and a profitable sale to passing merchants.",choices:[
            {label:"Sponsor a common harvest feast",description:"Spend twelve food to feed every ward; the crown also secures a warehouse card.",effects:{resources:{food:-12},morale:5,hidden:{prosperity:5,tension:-3},politics:{commons:2,legitimacy:2},cardReward:"warehouses"}},
            {label:"Sell the surplus to merchants",description:"Gain eighteen gold, but the villages remember who ate first.",effects:{resources:{gold:18},morale:-2,hidden:{prosperity:1,tension:3},politics:{guilds:3,commons:-2}}}
        ]}
    ]),
    discovery: Object.freeze([
        {title:"The Prospector's Claim",description:"A prospector has found a promising seam beneath the old hill and asks the crown to recognise his claim before rivals arrive.",choices:[
            {label:"Grant a royal licence",description:"Spend seven gold to record the claim and bring the workings under royal law.",effects:{resources:{gold:-7},hidden:{mystery:3,prosperity:2},politics:{guilds:1,nobility:1}}},
            {label:"Keep the seam for the crown",description:"Take six gold from the first samples, but leave the prospector resentful.",effects:{resources:{gold:6},morale:-1,hidden:{mystery:2,tension:3},politics:{commons:-1}}}
        ]},
        {title:"The Vein Runs Deeper",description:"The first working has uncovered a wider vein. Miners want safer timber supports while the treasury wants a larger share.",choices:[
            {label:"Timber the workings properly",description:"Spend twelve wood to shore up the tunnels before the next shift.",effects:{resources:{wood:-12},morale:2,hidden:{prosperity:4,tension:-2},politics:{commons:2}}},
            {label:"Take a larger royal share",description:"Gain fourteen gold now, but the miners will not forget the unsafe shift.",effects:{resources:{gold:14},morale:-3,hidden:{tension:5,prosperity:-1},politics:{commons:-3,nobility:1}}}
        ]},
        {title:"The Royal Mine Charter",description:"The seam can now be worked safely for years. The crown must decide who will hold the charter.",choices:[
            {label:"Charter a crown mine",description:"Spend stone and gold on a royal mine and secure a gold-mine card for the next draw.",effects:{resources:{stone:-10,gold:-8},morale:3,hidden:{prosperity:6,tension:-2},politics:{legitimacy:2,guilds:1},cardReward:"gold-mines"}},
            {label:"Lease it to the highest bidder",description:"Gain twenty-two gold, but the lease binds the realm to a powerful contractor.",effects:{resources:{gold:22},hidden:{prosperity:3,tension:4},politics:{guilds:3,commons:-2,legitimacy:-1}}}
        ]}
    ]),
    storm: Object.freeze([
        {title:"The Windmill's Vane",description:"A night storm has torn the vane from the mill and scattered roof tiles across the lower road.",choices:[
            {label:"Repair the mill and road",description:"Spend wood and gold to restore the mill and reopen the road before market day.",effects:{resources:{wood:-10,gold:-5},morale:2,hidden:{prosperity:3,tension:-2},politics:{commons:1}}},
            {label:"Leave the repairs to the miller",description:"The miller pays from his own store and the road stays broken for another week.",effects:{resources:{food:-6},morale:-2,hidden:{prosperity:-1,tension:3},politics:{guilds:2,commons:-1}}}
        ]},
        {title:"Shelter in the Abbey",description:"Families from the exposed fields have gathered at the abbey while the storm crosses the valley.",choices:[
            {label:"Open the royal barns",description:"Spend food and wood to shelter the families and keep the abbey's kitchens working.",effects:{resources:{food:-8,wood:-6},morale:3,hidden:{tension:-3,prosperity:1},politics:{commons:2,clergy:1}}},
            {label:"Send them home with guards",description:"Spend four gold on an escort, but the families return to damaged houses.",effects:{resources:{gold:-4},morale:-2,hidden:{tension:4},politics:{nobility:1,commons:-2,legitimacy:-1}}}
        ]},
        {title:"After the Wind",description:"The storm has passed. The crown can rebuild stronger than before or simply clear the roads and move on.",choices:[
            {label:"Build storm-resistant roofs",description:"Spend wood and stone on better roofs; a blacksmith card offers future steelwork.",effects:{resources:{wood:-14,stone:-8},morale:4,hidden:{prosperity:5,tension:-3},politics:{commons:2,legitimacy:2},cardReward:"blacksmiths"}},
            {label:"Clear the roads and move on",description:"Save the treasury for other needs, but the next storm will find the same weak roofs.",effects:{morale:-1,hidden:{prosperity:-1,tension:2},politics:{commons:-1}}}
        ]}
    ]),
    taxation: Object.freeze([
        {title:"The Assessment Roll",description:"The royal assessors have finished their roll, and every household wants to know how the burden will be shared.",choices:[
            {label:"Publish the full roll",description:"Gain eight gold and let every household see the same figures.",effects:{resources:{gold:8},morale:1,hidden:{tension:-2,prosperity:1},politics:{legitimacy:2,commons:1}}},
            {label:"Keep the figures at court",description:"Gain twelve gold in silence, though rumours will fill the gap.",effects:{resources:{gold:12},morale:-3,hidden:{tension:4,mystery:2},politics:{commons:-2,nobility:1}}}
        ]},
        {title:"The Collector's Ledger",description:"A collector has been accused of taking more than the roll allows. The guilds want an inquiry before the next payment.",choices:[
            {label:"Hold a public inquiry",description:"Spend six gold on an open hearing that clears the crown's name.",effects:{resources:{gold:-6},morale:2,hidden:{tension:-3},politics:{legitimacy:2,guilds:1,commons:2}}},
            {label:"Back the collector",description:"Gain ten gold and a loyal servant, but the guilds close their books.",effects:{resources:{gold:10},morale:-4,hidden:{tension:5},politics:{guilds:-3,commons:-2,legitimacy:-2}}}
        ]},
        {title:"The King's Share",description:"The levy is settled for another year. The crown must decide what the revenue will be remembered for.",choices:[
            {label:"Fund a public granary reserve",description:"Spend ten gold on stores and gain twelve food; a warehouse card follows.",effects:{resources:{gold:-10,food:12},morale:3,hidden:{prosperity:4,tension:-3},politics:{commons:3,legitimacy:2},cardReward:"warehouses"}},
            {label:"Fill the royal treasury",description:"Gain sixteen gold, but the levy is remembered as a hard year.",effects:{resources:{gold:16},morale:-2,hidden:{prosperity:-1,tension:3},politics:{commons:-2,guilds:-1}}}
        ]}
    ]),
    border: Object.freeze([
        {title:"The Missing Stone",description:"A boundary stone has vanished from the northern road, and both realms claim the old marker was moved.",choices:[
            {label:"Send surveyors with an escort",description:"Spend gold and stone to remeasure the road under royal protection.",effects:{resources:{gold:-6,stone:-4},hidden:{mystery:2,tension:-2},politics:{nobility:1,legitimacy:1}}},
            {label:"Let the local lords settle it",description:"Avoid royal expense, but the claim grows louder every market day.",effects:{resources:{wood:4},hidden:{tension:4,mystery:1},politics:{nobility:2,commons:-1}}}
        ]},
        {title:"Riders at the Ford",description:"Armed riders from across the border have begun using the ford. Merchants ask for protection and the neighbouring envoy protests.",choices:[
            {label:"Post border rangers",description:"Spend ten gold on a standing patrol that answers to the crown.",effects:{resources:{gold:-10},morale:2,hidden:{tension:-3,prosperity:2},politics:{nobility:1,commons:1,legitimacy:1}}},
            {label:"Pay the riders to keep the road open",description:"Spend fourteen gold on a quiet arrangement with the raiders themselves.",effects:{resources:{gold:-14},hidden:{tension:1,prosperity:1,mystery:2},politics:{nobility:-1,guilds:2}}}
        ]},
        {title:"The Boundary Oath",description:"The two crowns are ready to swear to the same line. The final terms will shape the frontier for years.",choices:[
            {label:"Seal a joint border treaty",description:"Spend gold and stone on a marked frontier and secure a border-ranger card.",effects:{resources:{gold:-8,stone:-6},morale:4,hidden:{prosperity:5,tension:-4},politics:{nobility:2,legitimacy:2},cardReward:"border-rangers"}},
            {label:"Hold the frontier by force",description:"Gain six gold from seized tolls, but the oaths are never sworn.",effects:{resources:{gold:6},morale:-3,hidden:{tension:7,prosperity:-2},politics:{nobility:1,commons:-2,legitimacy:-1}}}
        ]}
    ]),
    faith: Object.freeze([
        {title:"The Abbey Bell",description:"The abbey bell has not rung at dawn for three days. Pilgrims arrive expecting a blessing and find the clergy divided.",choices:[
            {label:"Fund the abbey's restoration",description:"Spend gold and stone to restore the bell tower and its bell.",effects:{resources:{gold:-7,stone:-6},morale:3,hidden:{tension:-2,mystery:1},politics:{clergy:3,commons:1}}},
            {label:"Appoint a royal chaplain",description:"Spend five gold on a loyal chaplain who can speak for the crown.",effects:{resources:{gold:-5},morale:1,hidden:{tension:2,mystery:1},politics:{clergy:1,legitimacy:2,nobility:-1}}}
        ]},
        {title:"The Relic's Journey",description:"A relic is being carried through the realm, and every town wants a day of the procession.",choices:[
            {label:"Host the procession",description:"Spend food and gold on a procession that brings pilgrims into every ward.",effects:{resources:{food:-8,gold:-4},morale:4,hidden:{prosperity:3,tension:-3},politics:{clergy:3,commons:2}}},
            {label:"Keep the relic at the capital",description:"Gain eight gold from offerings, but the towns feel excluded.",effects:{resources:{gold:8},morale:-2,hidden:{tension:4,mystery:2},politics:{clergy:-2,commons:-1,legitimacy:1}}}
        ]},
        {title:"The Pilgrim Road",description:"The pilgrimage has ended, leaving new roads, new debts and a choice about the abbey's future.",choices:[
            {label:"Endow a lasting shrine",description:"Spend stone and gold on a shrine and secure a reliquary card for the next draw.",effects:{resources:{stone:-12,gold:-8},morale:5,hidden:{prosperity:5,tension:-4},politics:{clergy:3,legitimacy:2},cardReward:"reliquaries"}},
            {label:"Sell the offerings to fund the crown",description:"Gain twenty gold, but the clergy will remember the empty shrine.",effects:{resources:{gold:20},morale:-4,hidden:{tension:6,prosperity:-1},politics:{clergy:-3,commons:-2}}}
        ]}
    ]),
    invention: Object.freeze([
        {title:"The Clockwork Bird",description:"A scholar has built a mechanical bird that keeps time and startles the court. The guilds want to see the design.",choices:[
            {label:"Fund the workshop",description:"Spend gold and wood on a protected workshop for the inventor.",effects:{resources:{gold:-8,wood:-6},hidden:{mystery:4,prosperity:3},politics:{guilds:2,legitimacy:1}}},
            {label:"Demand a demonstration at court",description:"Summon the bird to the throne room and impress the nobles without paying for the workshop.",effects:{morale:1,hidden:{mystery:2,tension:2},politics:{nobility:2,guilds:-1}}}
        ]},
        {title:"The Mill's New Wheel",description:"The invention has been adapted to a mill, but the first wheel broke and neighbouring mills fear the competition.",choices:[
            {label:"Test it with royal engineers",description:"Spend gold and stone on a proper trial before the wheel is trusted.",effects:{resources:{gold:-10,stone:-8},morale:2,hidden:{prosperity:4,tension:-2},politics:{guilds:1,commons:1}}},
            {label:"Grant a monopoly to the inventor",description:"Gain twelve gold from the licence, but the old mills close their doors.",effects:{resources:{gold:12},hidden:{tension:5,prosperity:2},politics:{guilds:-3,commons:-2}}}
        ]},
        {title:"The Patent Seal",description:"The design is ready for the realm. The crown can share it freely or keep it as a royal secret.",choices:[
            {label:"Publish the plans",description:"Spend twelve gold on open plans and secure a clockmaker card for the next draw.",effects:{resources:{gold:-12},morale:4,hidden:{prosperity:6,tension:-3},politics:{guilds:3,commons:2,legitimacy:2},cardReward:"clockmakers"}},
            {label:"Hide the design in the royal archive",description:"Keep the secret at court, but the guilds stop asking for royal work.",effects:{hidden:{mystery:5,prosperity:-1,tension:3},politics:{guilds:-2,nobility:1}}}
        ]}
    ]),
    monster: Object.freeze([
        {title:"The Beast Beyond the Palisade",description:"Shepherds report a large beast taking livestock from the outer pastures. The watch asks for hunters and the villages ask for walls.",choices:[
            {label:"Send a royal hunting party",description:"Spend gold and wood on hunters who know the outer pastures.",effects:{resources:{gold:-9,wood:-6},morale:2,hidden:{tension:-3,mystery:1},politics:{nobility:2,commons:1}}},
            {label:"Offer a bounty to the villages",description:"Spend twelve gold and let the shepherds hunt the beast themselves.",effects:{resources:{gold:-12},hidden:{tension:2,prosperity:1,mystery:2},politics:{commons:2,nobility:-1}}}
        ]},
        {title:"The Thing in the Old Mine",description:"The hunters have followed the beast to an abandoned mine. Its tunnels now connect to the old cellars under the town.",choices:[
            {label:"Seal the mine with stone",description:"Spend stone and gold to close every tunnel before the beast reaches the cellars.",effects:{resources:{stone:-14,gold:-6},morale:3,hidden:{tension:-4,mystery:1},politics:{commons:2,legitimacy:1}}},
            {label:"Drive it into the open",description:"Spend ten wood on fires and beaters, risking the creature's flight through the town.",effects:{resources:{wood:-10},morale:-2,hidden:{tension:4,mystery:3},politics:{nobility:1,commons:-1}}}
        ]},
        {title:"The Beast's Legend",description:"The creature is gone. The realm must decide whether the story becomes a warning or a royal hunt.",choices:[
            {label:"Found a monster hunt",description:"Spend ten gold on a permanent hunt and secure a griffin card for the next draw.",effects:{resources:{gold:-10},morale:4,hidden:{prosperity:4,tension:-3},politics:{nobility:2,commons:1},cardReward:"griffins"}},
            {label:"Bury the tale",description:"Let the clergy speak of a quiet winter instead of a monster.",effects:{morale:-1,hidden:{mystery:4,tension:2},politics:{clergy:1,legitimacy:-1}}}
        ]}
    ]),
    caravan: Object.freeze([
        {title:"The Caravan at the Gate",description:"A long caravan asks for safe passage and a place to trade before the spring fair opens.",choices:[
            {label:"Grant a royal safe-conduct",description:"Spend six gold on guards; the merchants bring coin and welcome news.",effects:{resources:{gold:-6,food:6},morale:2,hidden:{prosperity:3,tension:-1,mystery:1},politics:{guilds:2,legitimacy:1}}},
            {label:"Turn the caravan away",description:"Keep the treasury intact, but the road falls silent and the guilds complain.",effects:{morale:-2,hidden:{tension:3,prosperity:-1,mystery:0},politics:{guilds:-2,commons:-1}}}
        ]},
        {title:"The Weighing Bridge",description:"Merchants and townspeople dispute the weights at the market, and trade stalls while the argument continues.",choices:[
            {label:"Install royal scales",description:"Spend wood and stone on public scales that every trader can see and trust.",effects:{resources:{wood:-8,stone:-4},morale:2,hidden:{prosperity:4,tension:-2,mystery:0},politics:{guilds:1,commons:2,legitimacy:1}}},
            {label:"Let the merchants keep their scales",description:"Gain ten gold from market fees, but ordinary buyers grow suspicious.",effects:{resources:{gold:10},morale:-2,hidden:{prosperity:1,tension:4,mystery:1},politics:{guilds:3,commons:-2}}}
        ]},
        {title:"The Road Charter",description:"The caravan is ready to leave. Its charter will decide whether the road remains a royal route or a private privilege.",choices:[
            {label:"Charter the trade road",description:"Spend ten gold on a chartered road and secure a merchant-stall card for the next draw.",effects:{resources:{gold:-10,food:8},morale:4,hidden:{prosperity:6,tension:-3,mystery:0},politics:{guilds:3,legitimacy:2},cardReward:"merchant-stalls"}},
            {label:"Take a single heavy toll",description:"Gain eighteen gold now, but the merchants remember the hard bargain.",effects:{resources:{gold:18},morale:-3,hidden:{prosperity:-1,tension:5,mystery:0},politics:{guilds:-3,commons:-1,legitimacy:-1}}}
        ]}
    ]),
    illness: Object.freeze([
        {title:"The First Coughs",description:"Healers report a cough in the riverside households and ask for food and clean linen before it spreads.",choices:[
            {label:"Send the healers with supplies",description:"Spend food and gold on early treatment and careful containment.",effects:{resources:{food:-10,gold:-6},morale:2,hidden:{tension:-2,mystery:1,prosperity:0},health:{outbreak:true,severity:1,containment:2,treatment:1,disease:"common-fever"},politics:{clergy:2,commons:1,legitimacy:1}}},
            {label:"Wait for the sickness to pass",description:"Save the stores, but the fever finds another household before the week is out.",effects:{morale:-3,hidden:{tension:4,mystery:2,prosperity:-1},health:{outbreak:true,severity:2,containment:0,disease:"common-fever"},politics:{clergy:-1,commons:-2,legitimacy:-1}}}
        ]},
        {title:"The Healers' Roll",description:"The sick list grows longer each morning, and the workshops want their workers returned without delay.",choices:[
            {label:"Open a house of recovery",description:"Spend wood and food to isolate the worst cases and treat the rest.",effects:{resources:{wood:-12,food:-8},morale:2,hidden:{tension:-3,mystery:0,prosperity:1},health:{containment:2,treatment:1},politics:{clergy:3,commons:2,legitimacy:1}}},
            {label:"Keep the workshops working",description:"Gain twelve gold from full production, but the healers lose ground against the fever.",effects:{resources:{gold:12},morale:-3,hidden:{tension:5,mystery:1,prosperity:2},health:{containment:-1,severity:1,disease:"common-fever"},politics:{guilds:3,clergy:-2,commons:-2}}}
        ]},
        {title:"The Healers' Charter",description:"The cough has passed. The crown must decide whether the realm keeps what the healers learned.",choices:[
            {label:"Found a house of healing",description:"Spend stone and gold on a permanent infirmary and secure a healer card for the next draw.",effects:{resources:{stone:-10,gold:-8},morale:4,hidden:{prosperity:5,tension:-4,mystery:-1},health:{treatment:2,containment:1},politics:{clergy:3,commons:2,legitimacy:2},cardReward:"infirmaries"}},
            {label:"Return to the old remedies",description:"Gain six gold from avoided expense, but the next fever will meet the same prepared few.",effects:{resources:{gold:6},morale:-1,hidden:{tension:3,mystery:2,prosperity:-1},health:{containment:0},politics:{clergy:-1,commons:-1,legitimacy:-1}}}
        ]}
    ]),
    bandits: Object.freeze([
        {title:"The Missing Toll Cart",description:"Riders have taken a toll cart on the eastern road and left the driver bound but unharmed.",choices:[
            {label:"Ride out with the guard",description:"Spend gold and food on a patrol that makes the road safe again.",effects:{resources:{gold:-8,food:-6},morale:2,hidden:{tension:-3,prosperity:1,mystery:0},politics:{nobility:2,commons:1,legitimacy:1}}},
            {label:"Pay the road tax they demand",description:"Spend ten gold on a quiet arrangement, but the riders learn the crown can be bought.",effects:{resources:{gold:-10},morale:-2,hidden:{tension:2,prosperity:2,mystery:1},politics:{guilds:2,nobility:-1,commons:-1}}}
        ]},
        {title:"The Red Sashes",description:"The bandits have raised a red banner at the old quarry and are stopping merchants on the king's road.",choices:[
            {label:"Cut the road and starve them out",description:"Spend wood and stone to block the quarry tracks and deny the raiders their supplies.",effects:{resources:{wood:-10,stone:-6},morale:1,hidden:{tension:-2,mystery:0,prosperity:-1},politics:{commons:2,guilds:-1,legitimacy:1}}},
            {label:"Take the quarry by storm",description:"Spend gold and food on an assault, risking lives and a harder winter for the villages.",effects:{resources:{gold:-12,food:-8},morale:-3,hidden:{tension:4,prosperity:1,mystery:1},politics:{nobility:2,commons:-1,legitimacy:-1}}}
        ]},
        {title:"The King's Road Again",description:"The road is open once more. The final settlement will decide how long it stays that way.",choices:[
            {label:"Build a chain of watchtowers",description:"Spend wood and stone on standing watch posts and secure a watchtower card for the next draw.",effects:{resources:{wood:-14,stone:-8},morale:4,hidden:{prosperity:5,tension:-4,mystery:0},politics:{nobility:2,commons:1,legitimacy:2},cardReward:"watchtowers"}},
            {label:"Grant the quarry to a local lord",description:"Gain fourteen gold from the sale, but the roads beyond his land remain unsafe.",effects:{resources:{gold:14},morale:-2,hidden:{tension:4,prosperity:2,mystery:1},politics:{nobility:3,commons:-2,legitimacy:-1}}}
        ]}
    ]),
    festival: Object.freeze([
        {title:"The Lantern Petition",description:"The wards ask the crown to fund the lantern festival and invite the neighbouring villages to share it.",choices:[
            {label:"Sponsor the common festival",description:"Spend food and gold on lanterns, music and a meal for every ward.",effects:{resources:{food:-10,gold:-6},morale:4,hidden:{prosperity:3,tension:-2,mystery:0},politics:{commons:2,clergy:1,legitimacy:1}}},
            {label:"Keep the festival at court",description:"Spend four gold on a private evening, leaving the wards to celebrate without their king.",effects:{resources:{gold:-4},morale:-1,hidden:{tension:3,prosperity:-1,mystery:0},politics:{nobility:2,commons:-2}}}
        ]},
        {title:"The Mummers' Dispute",description:"Two travelling troupes claim the best square, and each has powerful friends at court.",choices:[
            {label:"Fund a public stage",description:"Spend wood and stone on a stage both troupes can share.",effects:{resources:{wood:-8,stone:-6},morale:3,hidden:{prosperity:4,tension:-3,mystery:0},politics:{commons:2,guilds:1,legitimacy:1}}},
            {label:"Choose the court's favourite",description:"Gain eight gold from the favoured troupe, but the other players leave angry.",effects:{resources:{gold:8},morale:-2,hidden:{tension:4,prosperity:1,mystery:0},politics:{nobility:2,commons:-2,guilds:-1}}}
        ]},
        {title:"The Festival Charter",description:"The festival has drawn travellers from every road. The crown can make it a lasting custom or a single sale.",choices:[
            {label:"Endow annual feast days",description:"Spend food and gold on a yearly festival and secure a feast-day card for the next draw.",effects:{resources:{food:-12,gold:-10},morale:5,hidden:{prosperity:6,tension:-4,mystery:0},politics:{commons:3,guilds:1,legitimacy:2},cardReward:"feast-days"}},
            {label:"Sell the festival to merchants",description:"Gain twenty gold from private stalls, but the old shared celebration is lost.",effects:{resources:{gold:20},morale:-2,hidden:{prosperity:2,tension:4,mystery:0},politics:{guilds:3,commons:-2,clergy:-1}}}
        ]}
    ]),
    feud: Object.freeze([
        {title:"The Quarrel at the Dais",description:"Two noble houses trade insults before the whole court and wait to see which one the crown will favour.",choices:[
            {label:"Hear both houses in council",description:"Spend six gold on a public hearing that gives each house a chance to state its grievance.",effects:{resources:{gold:-6},morale:2,hidden:{tension:-2,prosperity:0,mystery:1},politics:{nobility:2,commons:1,legitimacy:1}}},
            {label:"Let their retainers settle it",description:"Save the crown's coin, but armed retainers start settling the quarrel in the streets.",effects:{morale:-3,hidden:{tension:4,prosperity:-1,mystery:1},politics:{nobility:-1,commons:-2,legitimacy:-1}}}
        ]},
        {title:"The Broken Oath",description:"A vassal renounces an old oath of service and offers a purse of gold to buy his freedom.",choices:[
            {label:"Buy back the oath with land",description:"Spend twelve gold to confirm the vassal's duty and keep the border lords content.",effects:{resources:{gold:-12},morale:1,hidden:{tension:-2,prosperity:2,mystery:0},politics:{nobility:3,guilds:-1,legitimacy:1}}},
            {label:"Summon both banners to court",description:"Spend wood and food to feed two armed retinues until the crown hears their cases.",effects:{resources:{wood:-6,food:-8},morale:-2,hidden:{tension:5,prosperity:0,mystery:1},politics:{nobility:2,commons:-1,legitimacy:-2}}}
        ]},
        {title:"The Crown's Arbitration",description:"The feud has reached the throne. The judgment will decide whether the houses ever trust the crown again.",choices:[
            {label:"Write a lasting peace bond",description:"Spend gold and food on a sealed bond and secure a noble-house card for the next draw.",effects:{resources:{gold:-10,food:-6},morale:4,hidden:{prosperity:5,tension:-4,mystery:0},politics:{nobility:3,commons:2,legitimacy:2},cardReward:"noble-houses"}},
            {label:"Let the feud burn itself out",description:"Gain eight gold from abandoned estates, but the houses remember the crown's silence.",effects:{resources:{gold:8},morale:-2,hidden:{tension:4,prosperity:-2,mystery:1},politics:{nobility:-2,commons:-1,legitimacy:-1}}}
        ]}
    ]),
    craft: Object.freeze([
        {title:"A Masterwork Offered",description:"A master smith lays a finely made prototype before the throne and asks the crown to back her guild.",choices:[
            {label:"Fund the guild's workshop",description:"Spend gold and wood on tools and a hall where the craft can be taught.",effects:{resources:{gold:-8,wood:-6},morale:2,hidden:{prosperity:4,tension:-1,mystery:1},politics:{guilds:3,nobility:1,legitimacy:1}}},
            {label:"Keep the royal purse closed",description:"Send the smith away empty-handed; the guild quietly withdraws its best work.",effects:{morale:-2,hidden:{tension:3,prosperity:-1,mystery:0},politics:{guilds:-2,commons:-1}}}
        ]},
        {title:"The Guild's Secret",description:"Two masters claim the same secret recipe, and each threatens to take it to a rival court.",choices:[
            {label:"Buy the recipe for the realm",description:"Spend gold on a public purchase so the craft stays within the kingdom.",effects:{resources:{gold:-10},morale:1,hidden:{prosperity:5,mystery:2,tension:-2},politics:{guilds:2,commons:1,legitimacy:1}}},
            {label:"Order the recipe seized",description:"Spend gold on officers and seize the papers, but the guilds now guard every secret more closely.",effects:{resources:{gold:-4},morale:-4,hidden:{tension:6,mystery:1,prosperity:1},politics:{guilds:-4,nobility:2,legitimacy:-2}}}
        ]},
        {title:"The Charter of Crafts",description:"The masters ask the crown to recognise their craft in law rather than protect it by decree.",choices:[
            {label:"Charter the craft fairs",description:"Spend gold and wood on a chartered fair and secure a craft-fair card for the next draw.",effects:{resources:{gold:-10,wood:-8},morale:4,hidden:{prosperity:6,tension:-3,mystery:0},politics:{guilds:3,commons:2,legitimacy:2},cardReward:"craft-fairs"}},
            {label:"Sell the charter to one guild",description:"Gain sixteen gold from a private charter, while the other guilds take their trade elsewhere.",effects:{resources:{gold:16},morale:-2,hidden:{tension:4,prosperity:2,mystery:1},politics:{guilds:2,commons:-2,nobility:1}}}
        ]}
    ]),
    omens: Object.freeze([
        {title:"An Omen in the Heavens",description:"A strange light hangs over the palace, and the clergy and astronomers offer opposing readings.",choices:[
            {label:"Call the clergy to read the sky",description:"Spend gold and food on a public vigil and a careful interpretation.",effects:{resources:{gold:-6,food:-4},morale:2,hidden:{mystery:4,tension:-2,prosperity:0},politics:{clergy:3,legitimacy:1,commons:1}}},
            {label:"Order the astronomers silenced",description:"Save the expense of a vigil, but rumours of a suppressed prophecy spread through the wards.",effects:{morale:-3,hidden:{mystery:5,tension:4,prosperity:-1},politics:{clergy:-2,nobility:1,legitimacy:-1}}}
        ]},
        {title:"The Raven at the Gate",description:"A black raven has taken to the palace gate, and the households read it as a warning of hunger.",choices:[
            {label:"Feed the poor and open the granaries",description:"Spend twelve food on relief so the warning becomes a reason to prepare.",effects:{resources:{food:-12},morale:3,hidden:{tension:-4,prosperity:2,mystery:1},politics:{commons:3,clergy:1,legitimacy:2}}},
            {label:"Ignore the warning",description:"Gain four gold from unspent stores, but the wards grow certain the crown does not listen.",effects:{resources:{gold:4},morale:-2,hidden:{tension:5,mystery:3,prosperity:-1},politics:{commons:-2,clergy:-1}}}
        ]},
        {title:"The Year of Signs",description:"The year has brought too many signs to dismiss. The crown must preserve their meaning or bury it.",choices:[
            {label:"Record the omens in a royal almanac",description:"Spend gold and stone on an official record and secure a dream-omen card for the next draw.",effects:{resources:{gold:-8,stone:-4},morale:4,hidden:{mystery:6,tension:-3,prosperity:3},politics:{clergy:2,nobility:1,legitimacy:2},cardReward:"dream-omens"}},
            {label:"Burn the almanacs",description:"Gain five gold from avoided expense, but every private prophecy now sounds like treason.",effects:{resources:{gold:5},morale:-1,hidden:{mystery:2,tension:4,prosperity:0},politics:{clergy:-2,commons:-1,legitimacy:-1}}}
        ]}
    ]),
    winter: Object.freeze([
        {title:"The First Frost",description:"Frost comes early to the fields and the stewards ask whether the winter stores should be opened.",choices:[
            {label:"Open the winter stores early",description:"Spend food and wood on fuel and meals while the roads are still passable.",effects:{resources:{food:-12,wood:-6},morale:3,hidden:{prosperity:2,tension:-2,mystery:0},politics:{commons:3,legitimacy:1},health:{containment:1}}},
            {label:"Ration nothing and wait",description:"Save the stores for now, but a cold fever takes hold in the unheated rows.",effects:{morale:-3,hidden:{tension:5,prosperity:-2,mystery:0},politics:{commons:-2,guilds:-1,legitimacy:-1},health:{outbreak:true,severity:1,containment:0,disease:"winter-fever"}}}
        ]},
        {title:"Snow at the Pass",description:"Snow has closed the mountain pass and the towns beyond it are waiting for the royal road crews.",choices:[
            {label:"Clear the road with royal crews",description:"Spend gold and wood on a crew that brings the sick down from the pass.",effects:{resources:{gold:-8,wood:-8},morale:2,hidden:{prosperity:4,tension:-2,mystery:0},politics:{guilds:2,commons:2,legitimacy:1},health:{treatment:1}}},
            {label:"Let the pass close",description:"Gain six gold from the unused crews, but isolation leaves the fever longer to run.",effects:{resources:{gold:6},morale:-2,hidden:{tension:4,prosperity:-3,mystery:0},politics:{guilds:-2,commons:-1,legitimacy:-1},health:{containment:-1}}}
        ]},
        {title:"The Thaw",description:"The snow is gone. The realm must decide whether this winter taught the crown anything.",choices:[
            {label:"Endow permanent winter stores",description:"Spend gold, stone and food on a standing reserve and secure a winter-store card for the next draw.",effects:{resources:{gold:-10,stone:-8,food:-8},morale:5,hidden:{prosperity:6,tension:-4,mystery:0},politics:{commons:3,nobility:1,legitimacy:2},health:{containment:1},cardReward:"winter-stores"}},
            {label:"Sell the remaining stores",description:"Gain eighteen gold from the sale, but the next frost will find the granaries empty.",effects:{resources:{gold:18},morale:-2,hidden:{tension:5,prosperity:-2,mystery:0},politics:{commons:-3,guilds:2,legitimacy:-2},health:{containment:-1}}}
        ]}
    ]),
    pilgrimage: Object.freeze([
        {title:"The Pilgrim Road Fills",description:"Travellers have begun arriving for a distant shrine and the road needs food and safe lodging.",choices:[
            {label:"Open the royal hostels",description:"Spend gold and food on beds and meals for the pilgrims.",effects:{resources:{gold:-6,food:-10},morale:3,hidden:{prosperity:3,tension:-2,mystery:2},politics:{clergy:3,commons:1,legitimacy:1}}},
            {label:"Turn the pilgrims back at the gate",description:"Save the stores, but the clergy and the villages on the road object loudly.",effects:{morale:-3,hidden:{tension:5,mystery:2,prosperity:-1},politics:{clergy:-2,commons:-1,legitimacy:-1}}}
        ]},
        {title:"The Travellers' Blessing",description:"A holy teacher asks the crown to fund a wayside shrine where every traveller can stop.",choices:[
            {label:"Fund a shared shrine",description:"Spend wood and stone on a shrine that no single family can claim.",effects:{resources:{wood:-8,stone:-6},morale:3,hidden:{prosperity:4,tension:-3,mystery:3},politics:{clergy:3,commons:2,legitimacy:1}}},
            {label:"Charge for every blessing",description:"Gain twelve gold from the pilgrims, but the road fills with angry disputes over fees.",effects:{resources:{gold:12},morale:-2,hidden:{tension:4,prosperity:2,mystery:1},politics:{clergy:-2,guilds:2,commons:-1}}}
        ]},
        {title:"The Long Procession",description:"The procession is ready to leave. Its welcome will outlast the season if the crown builds on it.",choices:[
            {label:"Charter the pilgrim hostels",description:"Spend gold and stone on permanent lodging and secure a pilgrim-hostel card for the next draw.",effects:{resources:{gold:-10,stone:-8},morale:5,hidden:{prosperity:5,tension:-4,mystery:4},politics:{clergy:3,commons:2,legitimacy:2},cardReward:"pilgrim-hostels"}},
            {label:"Keep the road as a royal toll",description:"Gain sixteen gold from the tolls, but the shrines close their doors to royal travellers.",effects:{resources:{gold:16},morale:-2,hidden:{tension:5,prosperity:1,mystery:1},politics:{guilds:2,clergy:-2,commons:-2,legitimacy:-1}}}
        ]}
    ])
});
