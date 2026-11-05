// Strategy command panels: government, politics, economy, cards, decisions and dynasty overview.
import { state } from "../core/state.js";
import { getPoliticalSnapshot } from "../systems/politics.js";
import { getWorkforceSnapshot } from "../systems/economy.js";
import { getGovernmentSnapshot,setTaxRate,setGovernmentStructure,enactDecree } from "../systems/government.js";
import { getRoyalHouseholdSnapshot,arrangeRoyalMarriage,createRoyalHeir } from "../systems/royal-household.js";
import { getCreatureSnapshot } from "../systems/creatures.js";

const esc=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
const $=id=>document.getElementById(id);
let activePanel="government";
function meter(label,value,color="gold"){
    const n=Math.max(0,Math.min(100,Number(value)||0));
    return '<div class="strategy-meter"><div><span>'+esc(label)+'</span><b>'+Math.round(n)+'%</b></div><i><b class="'+color+'" style="width:'+n+'%"></b></i></div>';
}
function section(title,body){return '<section class="strategy-section"><h3>'+esc(title)+'</h3>'+body+'</section>';}
function renderGovernment(){
    const g=getGovernmentSnapshot();
    const formLabels={feudal_monarchy:"Feudal monarchy",council_monarchy:"Council monarchy",elective_monarchy:"Elective monarchy"};
    return '<div class="strategy-hero"><img src="assets/royal-crest.svg" alt=""><div><small>THE ROYAL CHANCERY</small><h2>Government</h2><p>Set the realm’s governing structure and the balance between crown and council.</p></div></div>'+
    section("Constitution",'<label class="strategy-field">Government form<select id="gov-form"><option value="feudal_monarchy">Feudal monarchy</option><option value="council_monarchy">Council monarchy</option><option value="elective_monarchy">Elective monarchy</option></select></label>'+
    '<div class="strategy-two-col"><label class="strategy-field">Crown authority <output id="authority-output">'+Math.round(g.crownAuthority)+'</output><input id="authority-range" type="range" min="20" max="90" value="'+g.crownAuthority+'"></label>'+
    '<label class="strategy-field">Council influence <output id="council-output">'+Math.round(g.councilInfluence)+'</output><input id="council-range" type="range" min="10" max="80" value="'+g.councilInfluence+'"></label></div><button class="strategy-action" data-action="save-government">Ratify government charter</button>')+
    section("Royal treasury",'<div class="strategy-stat-grid"><div><small>Gold</small><strong>'+Math.floor(state.resources.gold||0)+'</strong></div><div><small>Tax rate</small><strong>'+Math.round(g.taxRate*100)+'%</strong></div><div><small>Legitimacy</small><strong>'+Math.round(getPoliticalSnapshot().legitimacy)+'%</strong></div></div>'+
    '<label class="strategy-field">Tax rate <output id="tax-output">'+Math.round(g.taxRate*100)+'%</output><input id="tax-range" type="range" min="1" max="5" step="0.5" value="'+(g.taxRate*100)+'"></label><button class="strategy-action" data-action="apply-tax">Issue tax ordinance</button>')+
    section("Royal decrees",'<p class="strategy-note">The council may issue one major decree every 40 simulation ticks. Each decree spends real resources and changes morale and faction support.</p><div class="strategy-decree-grid"><button data-decree="royal_feast">🍗 Royal feast <small>8 gold · 12 food</small></button><button data-decree="public_works">🛠 Public works <small>10 gold · 20 wood</small></button><button data-decree="royal_pardon">📜 Royal pardon <small>15 gold</small></button><button data-decree="festival_of_faith">✨ Festival of faith <small>10 gold · 10 food</small></button></div><p class="strategy-note">'+(g.canIssueDecree?"Council is ready to consider a decree.":"The council is deliberating; decree cooldown is active.")+'</p>');
}
function renderPolitics(){
    const p=getPoliticalSnapshot();
    const labels={commons:"Commons",nobility:"Nobility",guilds:"Guilds",clergy:"Clergy"};
    return '<div class="strategy-hero"><img src="assets/royal-crest.svg" alt=""><div><small>THE REALM ESTATES</small><h2>Politics & factions</h2><p>Legitimacy and the support of the four represented estates shift with policy and economic conditions.</p></div></div>'+
    section("Royal legitimacy",meter("Legitimacy",p.legitimacy)+meter("Average faction support",p.averageSupport))+
    section("Estate approval",Object.entries(p.factions).map(([key,value])=>meter(labels[key],value,key==="commons"?"green":"gold")).join(""))+
    section("Political guidance",'<p class="strategy-note">Food shortages, unpaid wages and upkeep, employment, and royal decisions all influence political support. A decree is not merely cosmetic: it changes the stored realm state.</p><div class="strategy-stat-grid"><div><small>Royal decisions</small><strong>'+p.settlements+'</strong></div><div><small>Morale</small><strong>'+Math.round(state.morale)+'</strong></div></div>');
}
function renderEconomy(){
    const w=getWorkforceSnapshot(),g=getGovernmentSnapshot(),e=state.economy||{},ledger=e.lastLedger||{};
    return '<div class="strategy-hero"><img src="assets/royal-crest.svg" alt=""><div><small>THE EXCHEQUER</small><h2>Economy</h2><p>Production, workforce, treasury and the most recent 20-day ledger.</p></div></div>'+
    section("Treasury & population",'<div class="strategy-stat-grid"><div><small>Gold</small><strong>'+Math.floor(state.resources.gold||0)+'</strong></div><div><small>Food</small><strong>'+Math.floor(state.resources.food||0)+'</strong></div><div><small>Population</small><strong>'+w.population+'</strong></div><div><small>Employed</small><strong>'+w.employed+'</strong></div></div>')+
    section("Last financial ledger",'<div class="strategy-ledger"><p>Tax income <b>+'+Number(ledger.taxesCollected||0).toFixed(2)+'</b></p><p>Wages paid <b>−'+Number(ledger.wagesPaid||0).toFixed(2)+'</b></p><p>Building upkeep <b>−'+Number(ledger.upkeepPaid||0).toFixed(2)+'</b></p><p>Food consumed <b>−'+Number(ledger.foodConsumed||0).toFixed(2)+'</b></p><p>Net treasury change <b>'+(Number(ledger.netGold||0)>=0?"+":"")+Number(ledger.netGold||0).toFixed(2)+'</b></p></div>')+
    section("Accumulated accounts",'<div class="strategy-stat-grid"><div><small>Taxes collected</small><strong>'+Number(e.taxesCollected||0).toFixed(1)+'</strong></div><div><small>Wages paid</small><strong>'+Number(e.wagesPaid||0).toFixed(1)+'</strong></div><div><small>Unpaid wages</small><strong>'+Number(e.unpaidWages||0).toFixed(1)+'</strong></div><div><small>Tax rate</small><strong>'+Math.round(g.taxRate*100)+'%</strong></div></div>');
}
function renderCards(){
    const cards=Array.isArray(state.availableCards)?state.availableCards:[];
    const hand=Array.isArray(state.hand)?state.hand:[];
    const rows=hand.map(card=>'<li><b>'+esc(card.name||card.title||"Card")+'</b><span>In hand · '+esc(card.description||card.category||"Ready to play")+'</span></li>').join("");
    return '<div class="strategy-hero"><img src="assets/royal-crest.svg" alt=""><div><small>ROYAL ARCHIVE</small><h2>Card management</h2><p>Inspect your current hand and available card catalogue.</p></div></div>'+
    section("Current hand",'<ul class="strategy-list">'+(rows||'<li>No cards in hand.</li>')+'</ul>')+
    section("Card catalogue",'<div class="strategy-stat-grid"><div><small>Available cards</small><strong>'+cards.length+'</strong></div><div><small>Cards in hand</small><strong>'+hand.length+'</strong></div><div><small>Hand limit</small><strong>5</strong></div></div><p class="strategy-note">Cards are still played through the existing drag-and-drop hand. This panel is an inspection and management surface; it does not fabricate cards or bypass placement costs.</p>');
}
function renderDecisions(){
    const g=getGovernmentSnapshot(),decrees=g.decrees.slice().reverse().slice(0,8);
    return '<div class="strategy-hero"><img src="assets/royal-crest.svg" alt=""><div><small>THE ROYAL COUNCIL</small><h2>Royal decisions</h2><p>Issue consequential decrees and inspect the recent history of royal policy.</p></div></div>'+
    section("Available decisions",'<div class="strategy-decree-grid"><button data-decree="royal_feast">🍗 Hold a royal feast <small>Improve morale and commoner support</small></button><button data-decree="public_works">🛠 Fund public works <small>Spend wood and gold; support guilds</small></button><button data-decree="royal_pardon">📜 Grant a royal pardon <small>Restore legitimacy and public support</small></button><button data-decree="festival_of_faith">✨ Sponsor a holy festival <small>Strengthen clergy and morale</small></button></div>')+
    section("Recent decrees",'<ul class="strategy-list">'+(decrees.map(item=>'<li><b>'+esc(item.label)+'</b><span>Year '+item.year+' · Tick '+item.tick+'</span></li>').join("")||'<li>No royal decrees have been issued yet.</li>')+'</ul>');
}
function renderCreatures(){
    const creatures=getCreatureSnapshot();
    const active=creatures.active.map(item=>'<li><b>🐉 '+esc(item.name)+'</b><span>'+esc(item.lifeStage)+' · Age '+Math.floor(item.ageYears)+' · '+esc(item.temperament)+'</span><span>Bond '+Math.round(item.bond)+'% · Hunger '+Math.round(item.hunger)+'%</span></li>').join("");
    const archived=creatures.archive.map(item=>'<li><b>'+esc(item.name)+'</b><span>Died in year '+item.deathYear+' · Age '+Math.floor(item.ageYears)+' · '+esc(item.cause)+'</span></li>').join("");
    return '<div class="strategy-hero"><img src="assets/royal-crest.svg" alt=""><div><small>THE BESTIARY</small><h2>Living creatures</h2><p>Persistent magical creatures have needs, temperaments, bonds, age stages and personal memories.</p></div></div>'+
    section("Active dragons",'<div class="strategy-stat-grid"><div><small>Living dragons</small><strong>'+creatures.active.length+'</strong></div><div><small>Memorials</small><strong>'+creatures.archive.length+'</strong></div></div><ul class="strategy-list">'+(active||'<li>No dragon has joined the realm yet. Draw and play a Wyvern card to hatch one.</li>')+'</ul>')+
    section("Creature memorials",'<ul class="strategy-list">'+(archived||'<li>No creature memorials have been recorded.</li>')+'</ul><p class="strategy-note">Dragons consume food, grow through life stages, bond with the settlement and fight to defend it. Their memories and memorials are saved with the realm.</p>');
}
function renderDynasty(){
    const family=getRoyalHouseholdSnapshot();
    const king=family.king;
    const consorts=family.consorts.map(item=>'<li><b>'+esc(item.person.name)+'</b><span>'+esc(item.person.role)+' · '+Math.floor(item.person.ageYears)+' years · '+esc(item.status)+'</span><button data-action="royal-birth" data-person="'+esc(item.personId)+'">Record royal birth</button></li>').join("");
    const heirs=family.children.map((item,index)=>'<li><b>'+(index===0?"♛ ":"")+esc(item.person.name)+'</b><span>'+Math.floor(item.person.ageYears)+' years · '+esc(item.person.lifeStage)+' · '+(item.living?"Living":"Deceased")+'</span></li>').join("");
    const candidates=family.candidates.map(item=>'<option value="'+esc(item.personId)+'">'+esc(item.person.name)+' · '+Math.floor(item.person.ageYears)+' years</option>').join("");
    return '<div class="strategy-hero"><img src="assets/royal-crest.svg" alt=""><div><small>HOUSE OF THE CROWN</small><h2>Royal dynasty</h2><p>Royal partnerships, direct descendants and a traceable line of succession.</p></div></div>'+
    section("The reigning monarch",king?'<div class="strategy-stat-grid"><div><small>Monarch</small><strong>'+esc(king.person.name)+'</strong></div><div><small>Age</small><strong>'+Math.floor(king.person.ageYears)+'</strong></div><div><small>House</small><strong>'+esc(king.person.familyName)+'</strong></div><div><small>Succession</small><strong>'+esc(family.succession.status)+'</strong></div></div>':'<p class="strategy-note">No reigning monarch is currently recorded.</p>')+
    section("Royal consort",'<ul class="strategy-list">'+(consorts||'<li>No royal marriage recorded.</li>')+'</ul>'+(family.candidates.length?'<label class="strategy-field">Eligible consort<select id="royal-consort">'+candidates+'</select></label><button class="strategy-action" data-action="royal-marriage">Arrange royal marriage</button>':'<p class="strategy-note">No eligible adult consort is currently available. A candidate must be an adult, compatible species and not already a close relative.</p>'))+
    section("Dynastic heirs",'<ul class="strategy-list">'+(heirs||'<li>No direct descendants are recorded.</li>')+'</ul><p class="strategy-note">'+esc(family.succession.description)+'</p>');
}
const RENDERERS={government:renderGovernment,politics:renderPolitics,economy:renderEconomy,cards:renderCards,decisions:renderDecisions,dynasty:renderDynasty,creatures:renderCreatures};
function refresh(){const content=$("strategy-content");if(content)content.innerHTML=RENDERERS[activePanel]();if(activePanel==="government"&&$("gov-form"))$("gov-form").value=getGovernmentSnapshot().form;document.querySelectorAll("[data-strategy-tab]").forEach(button=>button.classList.toggle("is-active",button.dataset.strategyTab===activePanel));}
function open(panel){activePanel=RENDERERS[panel]?panel:"government";refresh();$("strategy-modal")?.classList.remove("hidden");}
function close(){$("strategy-modal")?.classList.add("hidden");}
function toast(message){const el=$("action-toast");if(el){el.textContent=message;el.classList.add("is-visible");setTimeout(()=>el.classList.remove("is-visible"),2200);}}
export function setupStrategyPanels(){
    document.querySelectorAll("[data-strategy-open]").forEach(button=>button.addEventListener("click",()=>open(button.dataset.strategyOpen)));
    document.querySelectorAll("[data-strategy-tab]").forEach(button=>button.addEventListener("click",()=>{activePanel=button.dataset.strategyTab;refresh();}));
    $("strategy-close")?.addEventListener("click",close);
    $("strategy-modal")?.addEventListener("click",event=>{if(event.target.id==="strategy-modal")close();});
    $("strategy-content")?.addEventListener("input",event=>{
        if(event.target.id==="tax-range")$("tax-output").textContent=event.target.value+"%";
        if(event.target.id==="authority-range")$("authority-output").textContent=event.target.value;
        if(event.target.id==="council-range")$("council-output").textContent=event.target.value;
    });
    $("strategy-content")?.addEventListener("click",event=>{
        const decree=event.target.closest("[data-decree]");
        if(decree){const result=enactDecree(decree.dataset.decree);toast(result.ok?"Royal decree enacted.":result.reason==="council-cooldown"?"The council is still deliberating.":"Insufficient resources or invalid decree.");refresh();return;}
        const action=event.target.closest("[data-action]");if(!action)return;
        if(action.dataset.action==="apply-tax"){const result=setTaxRate(Number($("tax-range")?.value)/100);toast(result.ok?"Tax ordinance enacted.":"Tax rate unchanged.");refresh();}
        if(action.dataset.action==="save-government"){setGovernmentStructure({form:$("gov-form")?.value,crownAuthority:Number($("authority-range")?.value),councilInfluence:Number($("council-range")?.value)});toast("Government charter ratified.");refresh();}
        if(action.dataset.action==="royal-marriage"){const result=arrangeRoyalMarriage($("royal-consort")?.value);toast(result.ok?"Royal marriage recorded.":result.reason);refresh();}
        if(action.dataset.action==="royal-birth"){const result=createRoyalHeir(action.dataset.person);toast(result.ok?"A royal heir has been born.":result.reason);refresh();}
    });
}
