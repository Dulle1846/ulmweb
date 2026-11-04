// Royal politics: legitimacy and faction support shaped by policy and settlement conditions.
import {state} from "../core/state.js";

export const POLITICAL_FACTIONS=Object.freeze(["commons","nobility","guilds","clergy"]);
export const DEFAULT_POLITICS=Object.freeze({
    legitimacy:65,
    factions:Object.freeze({commons:68,nobility:58,guilds:55,clergy:62}),
    settlements:0
});
const clamp=value=>Math.max(0,Math.min(100,Number.isFinite(Number(value))?Number(value):0));

export function normalizePoliticalState(input=state.politics){
    const source=input&&typeof input==="object"?input:{};
    const factions=source.factions&&typeof source.factions==="object"?source.factions:{};
    state.politics={
        legitimacy:clamp(source.legitimacy??DEFAULT_POLITICS.legitimacy),
        factions:Object.fromEntries(POLITICAL_FACTIONS.map(name=>[name,clamp(factions[name]??DEFAULT_POLITICS.factions[name])])),
        settlements:Number.isSafeInteger(Number(source.settlements))?Math.max(0,Math.min(1000000000,Number(source.settlements))):0
    };
    return state.politics;
}

export function applyPoliticalEffects(effects={}){
    const politics=normalizePoliticalState();
    if(Number.isFinite(effects.legitimacy))politics.legitimacy=clamp(politics.legitimacy+effects.legitimacy);
    for(const faction of POLITICAL_FACTIONS){
        const change=effects[faction];
        if(Number.isFinite(change))politics.factions[faction]=clamp(politics.factions[faction]+change);
    }
    politics.settlements++;
    return politics;
}

export function updatePolitics(ledger,workforce){
    const politics=normalizePoliticalState();
    const population=Math.max(0,workforce?.population||0);
    const unemployed=Math.max(0,workforce?.unemployed||0);
    const shortage=Math.max(0,ledger?.foodShortage||0);
    const unpaidWages=Math.max(0,ledger?.unpaidWages||0);
    const unpaidUpkeep=Math.max(0,ledger?.unpaidUpkeep||0);
    const pressure={legitimacy:0,commons:0,nobility:0,guilds:0,clergy:0};

    if(shortage>0){
        pressure.commons-=Math.min(3,shortage*0.18);
        pressure.legitimacy-=Math.min(1.5,0.25+shortage*0.06);
        pressure.clergy+=0.15;
    }else{
        pressure.commons+=0.12;
        pressure.legitimacy+=0.08;
    }
    if(unpaidWages>0){
        pressure.guilds-=Math.min(1.5,unpaidWages*0.25);
        pressure.commons-=0.25;
        pressure.legitimacy-=0.35;
    }
    if(unpaidUpkeep>0){
        pressure.nobility-=0.2;
        pressure.legitimacy-=0.15;
    }
    if(population>0&&unemployed/population>0.45){
        pressure.commons-=0.35;
        pressure.guilds-=0.2;
    }else if(population>0&&unemployed===0){
        pressure.commons+=0.1;
        pressure.guilds+=0.1;
    }
    applyPoliticalEffects(pressure);
    return getPoliticalSnapshot();
}

export function getPoliticalSnapshot(){
    const politics=normalizePoliticalState();
    return {
        legitimacy:politics.legitimacy,
        factions:{...politics.factions},
        settlements:politics.settlements,
        averageSupport:POLITICAL_FACTIONS.reduce((sum,key)=>sum+politics.factions[key],0)/POLITICAL_FACTIONS.length
    };
}
