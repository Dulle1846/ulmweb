// Legacy utility facade backed by the realm-seeded simulation stream.
import {rand as seededRand,randInt as seededRandInt} from "./random.js";
export function rand(min,max){return seededRand(min,max,"simulation");}
export function randInt(min,max){return seededRandInt(min,max,"simulation");}

export function distance(x1, y1, x2, y2) {
    return Math.hypot(x1 - x2, y1 - y2);
}
