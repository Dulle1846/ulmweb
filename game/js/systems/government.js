// Persistent, inspectable royal policy state. Every control exposed here has a real simulation effect.
import { state } from "../core/state.js";
import { applyPoliticalEffects } from "./politics.js";
import { addLog } from "./events.js";

export const DEFAULT_GOVERNMENT = Object.freeze({
    taxRate: 0.025,
    crownAuthority: 55,
    councilInfluence: 35,
    form: "feudal_monarchy",
    lastEdictTick: -1000,
    decrees: []
});
const clamp=(value,min,max,fallback)=>Number.isFinite(Number(value))?Math.max(min,Math.min(max,Number(value))):fallback;
const FORMS=new Set(["feudal_monarchy","council_monarchy","elective_monarchy"]);
const DECREE_COSTS=Object.freeze({
    royal_feast:{gold:8,food:12,wood:0},
    public_works:{gold:10,food:0,wood:20},
    royal_pardon:{gold:15,food:0,wood:0},
    festival_of_faith:{gold:10,food:10,wood:0}
});
const DECREE_EFFECTS=Object.freeze({
    royal_feast:{morale:5,politics:{legitimacy:1,commons:2,clergy:1},label:"Royal feast"},
    public_works:{morale:1,politics:{legitimacy:1,commons:1,guilds:3,nobility:1},label:"Public works charter"},
    royal_pardon:{morale:2,politics:{legitimacy:2,commons:3,nobility:-1},label:"Royal pardon"},
    festival_of_faith:{morale:3,politics:{legitimacy:1,clergy:3,commons:1},label:"Festival of faith"}
});
export function normalizeGovernment(input=state.government){
    const source=input&&typeof input==="object"?input:{};
    state.government={
        taxRate:clamp(source.taxRate,0.01,0.05,DEFAULT_GOVERNMENT.taxRate),
        crownAuthority:clamp(source.crownAuthority,20,90,DEFAULT_GOVERNMENT.crownAuthority),
        councilInfluence:clamp(source.councilInfluence,10,80,DEFAULT_GOVERNMENT.councilInfluence),
        form:FORMS.has(source.form)?source.form:DEFAULT_GOVERNMENT.form,
        lastEdictTick:clamp(source.lastEdictTick,-100000000,100000000,DEFAULT_GOVERNMENT.lastEdictTick),
        decrees:Array.isArray(source.decrees)?source.decrees.filter(item=>item&&typeof item==="object").slice(-40).map(item=>({id:String(item.id||"decree").slice(0,60),label:String(item.label||"Royal decree").slice(0,80),year:Math.max(1,Math.floor(Number(item.year)||1)),tick:Math.max(0,Math.floor(Number(item.tick)||0))})):[]
    };
    return state.government;
}
export function setTaxRate(value){
    const government=normalizeGovernment();
    const next=clamp(value,0.01,0.05,government.taxRate);
    const delta=next-government.taxRate;
    if(Math.abs(delta)<0.00001)return {ok:false,reason:"unchanged",government};
    government.taxRate=next;
    applyPoliticalEffects({legitimacy:delta>0?-1.2:0.8,commons:delta>0?-2.2:1.8,nobility:delta>0?0.4:-0.2,guilds:delta>0?-0.5:0.6});
    addLog("ROYAL TAX RATE CHANGED TO "+Math.round(next*100)+"%","#e4bd72","politics");
    return {ok:true,government};
}
export function setGovernmentStructure({form,crownAuthority,councilInfluence}={}){
    const government=normalizeGovernment();
    if(form!==undefined&&FORMS.has(form))government.form=form;
    if(crownAuthority!==undefined)government.crownAuthority=clamp(crownAuthority,20,90,government.crownAuthority);
    if(councilInfluence!==undefined)government.councilInfluence=clamp(councilInfluence,10,80,government.councilInfluence);
    applyPoliticalEffects({legitimacy:0.4,commons:government.councilInfluence>50?0.4:-0.2,nobility:government.crownAuthority>65?0.5:-0.2});
    addLog("THE ROYAL GOVERNMENT CHARTER WAS REVISED","#e4bd72","politics");
    return government;
}
export function enactDecree(id){
    const government=normalizeGovernment();
    const cost=DECREE_COSTS[id],effect=DECREE_EFFECTS[id];
    if(!cost||!effect)return {ok:false,reason:"unknown-decree"};
    if(state.tick-government.lastEdictTick<40)return {ok:false,reason:"council-cooldown"};
    for(const resource of ["gold","food","wood"]){
        if(Number(state.resources?.[resource]||0)<cost[resource])return {ok:false,reason:"insufficient-"+resource};
    }
    for(const resource of ["gold","food","wood"])state.resources[resource]=Math.max(0,Number(state.resources[resource]||0)-cost[resource]);
    state.morale=Math.max(0,Math.min(100,Number(state.morale||0)+effect.morale));
    applyPoliticalEffects(effect.politics);
    government.lastEdictTick=state.tick;
    government.decrees.push({id,label:effect.label,year:state.year,tick:state.tick});
    if(government.decrees.length>40)government.decrees.splice(0,government.decrees.length-40);
    addLog("ROYAL DECREE: "+effect.label.toUpperCase(),"#e4bd72","politics");
    return {ok:true,effect,cost,government};
}
export function getGovernmentSnapshot(){
    const government=normalizeGovernment();
    return {...government,decrees:government.decrees.map(item=>({...item})),canIssueDecree:state.tick-government.lastEdictTick>=40};
}
