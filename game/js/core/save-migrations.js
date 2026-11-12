// Ordered, DOM-free snapshot migrations. Kept separate from the application
// composition root so legacy saves can be exercised by headless tests.
import { SAVE_SCHEMA_VERSION } from "./save-validation.js";

export const SAVE_SCHEMA_MIGRATIONS = Object.freeze({
    0:snapshot=>{snapshot.hiddenRealm=snapshot.hiddenRealm&&typeof snapshot.hiddenRealm==="object"?snapshot.hiddenRealm:{};snapshot.health=snapshot.health&&typeof snapshot.health==="object"?snapshot.health:{};snapshot.economy=snapshot.economy&&typeof snapshot.economy==="object"?snapshot.economy:{};},
    1:snapshot=>{snapshot.statistics=snapshot.statistics&&typeof snapshot.statistics==="object"?snapshot.statistics:{};snapshot.personArchive=Array.isArray(snapshot.personArchive)?snapshot.personArchive:[];snapshot.creatureArchive=Array.isArray(snapshot.creatureArchive)?snapshot.creatureArchive:[];},
    2:snapshot=>{snapshot.randomStreams=snapshot.randomStreams&&typeof snapshot.randomStreams==="object"?snapshot.randomStreams:null;snapshot.availableCards=Array.isArray(snapshot.availableCards)?snapshot.availableCards:[];snapshot.issueSequence=Number.isFinite(Number(snapshot.issueSequence))?Math.max(0,Math.floor(Number(snapshot.issueSequence))):0;},
    3:snapshot=>{if(snapshot.city===undefined)snapshot.city=null;if(snapshot.market===undefined)snapshot.market=null;},
    4:snapshot=>{if(snapshot.faith===undefined)snapshot.faith=null;if(snapshot.justice===undefined)snapshot.justice=null;},
    5:snapshot=>{if(snapshot.faith===undefined)snapshot.faith=null;if(snapshot.justice===undefined)snapshot.justice=null;if(!snapshot.health||typeof snapshot.health!=="object")snapshot.health={};},
    7:snapshot=>{snapshot.craftedItems=Array.isArray(snapshot.craftedItems)?snapshot.craftedItems:[];},
    6:snapshot=>{
        // Schema 7 adds realm identity, research and the legacy record. Older
        // saves keep their existing realm name instead of being renamed.
        if(!snapshot.identity||typeof snapshot.identity!=="object"||Array.isArray(snapshot.identity)){
            snapshot.identity={kingdomName:snapshot.kingdomName||"ELDRIA",dynastyName:snapshot.royal?.dynastyName||snapshot.kingdomName||"Eldria",rulerTitle:"Sovereign",culture:"frontier",banner:"gold",emblem:"crown",motto:"We keep what we build.",foundedYear:1};
        }
        if(snapshot.research===undefined)snapshot.research=null;
        if(snapshot.legacy===undefined)snapshot.legacy=null;
    },
    8:snapshot=>{
        if(!snapshot.economy||typeof snapshot.economy!=="object"||Array.isArray(snapshot.economy))snapshot.economy={};
        if(!snapshot.government||typeof snapshot.government!=="object"||Array.isArray(snapshot.government))snapshot.government={};
    },
    9:snapshot=>{
        if(snapshot.aiChronicle===undefined)snapshot.aiChronicle=null;
    },
    10:snapshot=>{
        // Schema 11 adds the persistent living-event timeline. Existing realms
        // keep their short event log and begin the new archive on the next day.
        if(snapshot.eventTimeline===undefined)snapshot.eventTimeline=null;
    }
});

export function migrateSaveSnapshot(snapshot){
    if(!snapshot||typeof snapshot!=="object"||Array.isArray(snapshot))return snapshot;
    const declared=Number(snapshot.saveSchemaVersion);
    let version=Number.isFinite(declared)?Math.max(0,Math.floor(declared)):0;
    if(version>SAVE_SCHEMA_VERSION)throw new Error("Save data was written by a newer game build (schema "+version+").");
    while(version<SAVE_SCHEMA_VERSION){const step=SAVE_SCHEMA_MIGRATIONS[version];if(step)step(snapshot);version++;}
    snapshot.saveSchemaVersion=SAVE_SCHEMA_VERSION;
    return snapshot;
}
