// Legacy utility facade; gameplay randomness now uses the realm-seeded simulation stream.\nimport { rand as seededRand, randInt as seededRandInt } from "./random.js";\n\nexport function rand(min, max) { return seededRand(min, max, "simulation"); }\nexport function randInt(min, max) { return seededRandInt(min, max, "simulation"); }\n\nexport function distance(x1, y1, x2, y2) {
    return Math.hypot(x1 - x2, y1 - y2);
}
