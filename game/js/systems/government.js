import {state} from "../core/state.js";
import {applyPoliticalEffects,getPoliticalSnapshot} from "./politics.js";
import {recordResourceMovement} from "./goods-book.js";
import {addResource} from "./resources.js";
export const GOVERNMENT_FORMS=Object.freeze({
 feudal:{label:"Feudal monarchy",tax:10,legitimacy:1.2,factions:{commons:-.2,nobility:.8,guilds:0,clergy:.2}},
 royal:{label:"Royal centralism",tax:12,legitimacy:.4,factions:{commons:-.5,nobility:-.6,guilds:.3,clergy:0}},
 council:{label:"Crowned council",tax:9,legitimacy:.8,factions:{commons:.6,nobility:.2,guilds:.5,clergy:-.1}},
 elective:{label:"Elective crown",tax:8,legitimacy:-.2,factions:{commons:.3,nobility:.7,guilds:.1,clergy:-.2}}
});
export const GOVERNMENT_POLICIES=Object.freeze({
 bread:{label:"Bread for the people",description:"Spend 12 gold and 18 food to ease hardship.",cost:{gold:12,food:18},effects:{legitimacy:1.2,commons:2.4,clergy:.3},morale:2},
 charter:{label:"Guild charter",description:"Spend 18 gold to empower merchants and craftspeople.",cost:{gold:18},effects:{legitimacy:.5,commons:.2,guilds:3.2,nobility:-.4},morale:0},
 noble:{label:"Confirm noble privileges",description:"Spend 10 gold to secure aristocratic loyalty.",cost:{gold:10},effects:{legitimacy:.2,nobility:3.2,commons:-1.2,guilds:-.3},morale:0},
 temple:{label:"Temple relief",description:"Spend 10 food and 8 gold on public rites and aid.",cost:{gold:8,food:10},effects:{legitimacy:.7,clergy:2.8,commons:.8},morale:1},
 roads:{label:"Royal road charter",description:"Spend 16 wood and 10 gold to support trade routes.",cost:{wood:16,gold:10},effects:{legitimacy:.8,guilds:1.8,commons:.6,nobility:.2},morale:0}
});
const clamp=(v,min=0,max=100)=>Math.max(min,Math.min(max,Number.isFinite(Number(v))?Number(v):0));
export function normalizeGovernment(input=state.government){
 const s=input&&typeof input==="object"?input:{},form=Object.hasOwn(GOVERNMENT_FORMS,s.form)?s.form:"feudal";
 state.government={form,taxRate:clamp(s.taxRate??GOVERNMENT_FORMS[form].tax,0,35),councilSeats:Math.max(1,Math.min(12,Math.floor(Number(s.councilSeats)||3))),succession:["primogeniture","elective","designated"].includes(s.succession)?s.succession:"primogeniture",decrees:Math.max(0,Math.min(100000,Math.floor(Number(s.decrees)||0))),lastDecisionYear:Math.max(0,Math.floor(Number(s.lastDecisionYear)||0)),history:Array.isArray(s.history)?s.history.filter(x=>x&&typeof x==="object").slice(-40):[]};
 return state.government;
}
export function setGovernmentForm(form){
 if(!Object.hasOwn(GOVERNMENT_FORMS,form))return {ok:false,reason:"unknown-government"};
 const g=normalizeGovernment();if(g.form===form)return {ok:false,reason:"already-in-force"};
 if((Number(state.resources?.gold)||0)<20)return {ok:false,reason:"insufficient-gold"};
 addResource("gold",-20);const previous=g.form;g.form=form;g.taxRate=GOVERNMENT_FORMS[form].tax;
 g.history.push({year:state.year||1,kind:"government-form",from:previous,to:form});g.history=g.history.slice(-40);
 applyPoliticalEffects(GOVERNMENT_FORMS[form].factions);state.politics.legitimacy=clamp(state.politics.legitimacy+GOVERNMENT_FORMS[form].legitimacy);g.decrees++;
 return {ok:true,government:g,politics:getPoliticalSnapshot()};
}
export function enactPolicy(id){
 const p=GOVERNMENT_POLICIES[id];if(!p)return {ok:false,reason:"unknown-policy"};
 const g=normalizeGovernment();if(g.lastDecisionYear===state.year)return {ok:false,reason:"one-decree-per-year"};
 for(const [k,v] of Object.entries(p.cost))if((Number(state.resources?.[k])||0)<v)return {ok:false,reason:"insufficient-"+k};
 for(const [k,v] of Object.entries(p.cost))addResource(k,-v);
 const foodCost=Number(p.cost?.food||0);
 if(foodCost>0)recordResourceMovement("food",-foodCost,"policy-cost",{from:{kind:"realm",id:"royal-stores"},to:{kind:"policy",id}});
 applyPoliticalEffects(p.effects);state.morale=clamp((Number(state.morale)||0)+p.morale);
 g.lastDecisionYear=Math.max(1,Math.floor(Number(state.year)||1));g.decrees++;g.history.push({year:state.year||1,kind:"policy",id,label:p.label});g.history=g.history.slice(-40);
 return {ok:true,policy:p,government:g,politics:getPoliticalSnapshot()};
}
export function getGovernmentSnapshot(){const g=normalizeGovernment();return {...g,formDetails:GOVERNMENT_FORMS[g.form],politics:getPoliticalSnapshot()};}
