import {state} from "../core/state.js";
import {applyPoliticalEffects,getPoliticalSnapshot} from "./politics.js";
import {recordResourceMovement} from "./goods-book.js";
import {addResource} from "./resources.js";
import {recordReform} from "./legacy.js";

// Each form carries the old tax baseline plus explicit additive modifiers.
// `tax` here is a yield bonus, not the assessed percentage; `taxRate` remains
// the player-facing baseline used by the existing ledger.
export const GOVERNMENT_FORMS=Object.freeze({
 feudal:{label:"Feudal monarchy",description:"Crown, nobles and local obligation.",tax:10,taxBonus:.01,legitimacy:.04,research:0,trade:0,military:.02,factions:{commons:-.2,nobility:.8,guilds:0,clergy:.2}},
 royal:{label:"Royal centralism",description:"A strong crown and a professional administration.",tax:12,taxBonus:.03,legitimacy:-.02,research:.02,trade:0,military:.02,factions:{commons:-.5,nobility:-.6,guilds:.3,clergy:0}},
 oligarchy:{label:"Oligarchy",description:"A chartered elite governs through wealth and connection.",tax:9,taxBonus:.02,legitimacy:-.03,research:.01,trade:.03,military:0,factions:{commons:-1,nobility:1.1,guilds:.4,clergy:-.1}},
 mixed:{label:"Mixed constitution",description:"Crown, council and charter balance one another.",tax:10,taxBonus:.01,legitimacy:.04,research:.02,trade:.02,military:0,factions:{commons:.4,nobility:.4,guilds:.4,clergy:.4}},
 council:{label:"Crowned council",description:"The crown governs with a standing council.",tax:9,taxBonus:0,legitimacy:.02,research:.03,trade:.02,military:0,factions:{commons:.6,nobility:.2,guilds:.5,clergy:-.1}},
 elective:{label:"Elective crown",description:"The great houses choose the sovereign.",tax:8,taxBonus:0,legitimacy:.05,research:.02,trade:.01,military:0,factions:{commons:.3,nobility:.7,guilds:.1,clergy:-.2}},
 republic:{label:"Republic",description:"Chartered citizens and a paid magistracy.",tax:9,taxBonus:.02,legitimacy:.03,research:.02,trade:.04,military:0,factions:{commons:1.1,nobility:-.9,guilds:.8,clergy:-.2}},
 theocracy:{label:"Theocracy",description:"The sacred law is the law of the realm.",tax:8,taxBonus:0,legitimacy:.08,research:-.01,trade:-.01,military:0,factions:{commons:.2,nobility:-.2,guilds:-.3,clergy:1.4}},
 tribal:{label:"Tribal confederation",description:"Kinship, muster and a remembered oath.",tax:7,taxBonus:-.01,legitimacy:.01,research:-.02,trade:0,military:.06,factions:{commons:.7,nobility:.5,guilds:-.4,clergy:0}},
 military:{label:"Military command",description:"The garrison is the constitution.",tax:10,taxBonus:.01,legitimacy:-.03,research:0,trade:-.02,military:.10,factions:{commons:-.6,nobility:.6,guilds:-.2,clergy:-.3}}
});
export const GOVERNMENT_POLICIES=Object.freeze({
 bread:{label:"Bread for the people",description:"Spend 12 gold and 18 food to ease hardship.",cost:{gold:12,food:18},effects:{legitimacy:1.2,commons:2.4,clergy:.3},morale:2},
 charter:{label:"Guild charter",description:"Spend 18 gold to empower merchants and craftspeople.",cost:{gold:18},effects:{legitimacy:.5,commons:.2,guilds:3.2,nobility:-.4},morale:0},
 noble:{label:"Confirm noble privileges",description:"Spend 10 gold to secure aristocratic loyalty.",cost:{gold:10},effects:{legitimacy:.2,nobility:3.2,commons:-1.2,guilds:-.3},morale:0},
 temple:{label:"Temple relief",description:"Spend 10 food and 8 gold on public rites and aid.",cost:{gold:8,food:10},effects:{legitimacy:.7,clergy:2.8,commons:.8},morale:1},
 roads:{label:"Royal road charter",description:"Spend 16 wood and 10 gold to support trade routes.",cost:{wood:16,gold:10},effects:{legitimacy:.8,guilds:1.8,commons:.6,nobility:.2},morale:0}
});
const clamp=(v,min=0,max=100)=>Math.max(min,Math.min(max,Number.isFinite(Number(v))?Number(v):0));
export const TAX_RATE_MIN=5;
export const TAX_RATE_MAX=30;
export const TAX_RATE_STEP=5;
export function normalizeGovernment(input=state.government){
 const s=input&&typeof input==="object"?input:{},form=Object.hasOwn(GOVERNMENT_FORMS,s.form)?s.form:"feudal";
 state.government={form,taxRate:clamp(s.taxRate??GOVERNMENT_FORMS[form].tax,TAX_RATE_MIN,TAX_RATE_MAX),councilSeats:Math.max(1,Math.min(12,Math.floor(Number(s.councilSeats)||3))),succession:["primogeniture","elective","designated"].includes(s.succession)?s.succession:"primogeniture",decrees:Math.max(0,Math.min(100000,Math.floor(Number(s.decrees)||0))),lastDecisionYear:Math.max(0,Math.floor(Number(s.lastDecisionYear)||0)),lastTaxChangeYear:Math.max(0,Math.floor(Number(s.lastTaxChangeYear)||0)),history:Array.isArray(s.history)?s.history.filter(x=>x&&typeof x==="object").slice(-40):[]};
 return state.government;
}
export function getGovernmentModifiers(){
 const g=normalizeGovernment(),form=GOVERNMENT_FORMS[g.form];
 return {
  id:g.form,label:form.label,taxRate:g.taxRate,
  tax:Number(form.taxBonus)||0,trade:Number(form.trade)||0,
  military:Number(form.military)||0,research:Number(form.research)||0,
  legitimacy:Number(form.legitimacy)||0
 };
}
export function setGovernmentForm(form){
 if(!Object.hasOwn(GOVERNMENT_FORMS,form))return {ok:false,reason:"unknown-government"};
 const g=normalizeGovernment();if(g.form===form)return {ok:false,reason:"already-in-force"};
 if((Number(state.resources?.gold)||0)<20)return {ok:false,reason:"insufficient-gold"};
 addResource("gold",-20);const previous=g.form;g.form=form;g.taxRate=GOVERNMENT_FORMS[form].tax;
 g.history.push({year:state.year||1,kind:"government-form",from:previous,to:form});g.history=g.history.slice(-40);
 applyPoliticalEffects(GOVERNMENT_FORMS[form].factions);state.politics.legitimacy=clamp(state.politics.legitimacy+GOVERNMENT_FORMS[form].legitimacy);g.decrees++;
 recordReform(GOVERNMENT_FORMS[form].label);
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
// Tax is a real player lever, not a label on the constitution. A rate change
// is allowed once per year, shifts the burden onto households or the guilds,
// and is written to the same bounded government history as a reform.
export function setTaxRate(rate){
 const g=normalizeGovernment();
 const requested=Math.round(Number(rate)/TAX_RATE_STEP)*TAX_RATE_STEP;
 const next=Math.max(TAX_RATE_MIN,Math.min(TAX_RATE_MAX,Number.isFinite(requested)?requested:g.taxRate));
 if(next===g.taxRate)return {ok:false,reason:"already-at-this-rate"};
 if(g.lastTaxChangeYear===state.year)return {ok:false,reason:"one-tax-change-per-year"};
 const previous=g.taxRate;
 const delta=next-previous;
 g.taxRate=next;
 g.lastTaxChangeYear=Math.max(1,Math.floor(Number(state.year)||1));
 g.history.push({year:state.year||1,kind:"tax-rate",from:previous,to:next});
 g.history=g.history.slice(-40);
 // A heavier levy is felt by the commons and guilds first; a lighter one buys
 // goodwill at the cost of the treasury. Magnitudes stay small and bounded.
 applyPoliticalEffects({commons:delta>0?-Math.min(2,delta*0.10):Math.min(1.5,Math.abs(delta)*0.08),
   guilds:delta>0?-Math.min(1.6,delta*0.08):Math.min(1.2,Math.abs(delta)*0.06),
   nobility:delta>0?Math.min(0.7,delta*0.03):-Math.min(0.4,Math.abs(delta)*0.02)});
 state.morale=clamp((Number(state.morale)||0)+(delta>0?-Math.min(1.8,delta*0.09):Math.min(1.2,Math.abs(delta)*0.05)));
 recordReform("Tax rate "+previous+"% -> "+next+"%");
 return {ok:true,government:g,politics:getPoliticalSnapshot(),previous,rate:next};
}
export function getGovernmentSnapshot(){const g=normalizeGovernment();return {...g,formDetails:GOVERNMENT_FORMS[g.form],modifiers:getGovernmentModifiers(),politics:getPoliticalSnapshot()};}
