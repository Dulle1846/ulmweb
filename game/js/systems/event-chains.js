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
    ])
});
