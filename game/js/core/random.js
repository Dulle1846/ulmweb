// Deterministic, independently advancing random streams for reproducible realms.
import { state } from "./state.js";
const UINT32_RANGE=0x100000000;
function hashText(value){let hash=2166136261;for(let i=0;i<value.length;i++){hash^=value.charCodeAt(i);hash=Math.imul(hash,16777619);}return hash>>>0;}
function mix32(value){let result=value>>>0;result^=result>>>16;result=Math.imul(result,0x7feb352d);result^=result>>>15;result=Math.imul(result,0x846ca68b);result^=result>>>16;return result>>>0;}
function normalizedSeed(seed=state.worldSeed){const numeric=Number(seed);return Number.isSafeInteger(numeric)&&numeric>0?numeric>>>0:1;}
function ensureCounters(){if(!state.randomStreams||typeof state.randomStreams!=="object"||Array.isArray(state.randomStreams))state.randomStreams={};return state.randomStreams;}
export function random(stream="simulation"){const name=String(stream||"simulation").slice(0,48),counters=ensureCounters();const count=Number.isSafeInteger(counters[name])&&counters[name]>=0?counters[name]:0;counters[name]=count+1;return mix32(normalizedSeed()^hashText(name)^Math.imul((count+1)>>>0,0x9e3779b9))/UINT32_RANGE;}
export function randInt(min,max,stream="simulation"){const lower=Math.ceil(Number(min)),upper=Math.floor(Number(max));if(!Number.isFinite(lower)||!Number.isFinite(upper)||upper<=lower)throw new RangeError("randInt requires finite bounds with max greater than min");return lower+Math.floor(random(stream)*(upper-lower));}
export function rand(min,max,stream="simulation"){const lower=Number(min),upper=Number(max);if(!Number.isFinite(lower)||!Number.isFinite(upper)||upper<lower)throw new RangeError("rand requires finite bounds with max greater than or equal to min");return upper===lower?lower:lower+random(stream)*(upper-lower);}
export function resetRandomStreams(){state.randomStreams={};}
export function restoreRandomStreams(saved){const restored={};if(saved&&typeof saved==="object"&&!Array.isArray(saved)){for(const [name,value] of Object.entries(saved).slice(0,32)){if(name.length<=48&&Number.isSafeInteger(value)&&value>=0)restored[name]=value;}}state.randomStreams=restored;return restored;}
export function getRandomStreamSnapshot(){return {...ensureCounters()};}
