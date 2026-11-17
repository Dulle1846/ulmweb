// Royal creature species. Every profile is deliberately data-only so the
// annual creature pass stays bounded and the UI/tests can inspect the same
// habitat, diet, territory and breeding contract.
const freeze = value => Object.freeze(value);
const profile = data => freeze({
    ...data,
    biomes: freeze(data.biomes),
    abilities: freeze(data.abilities),
    goals: freeze(data.goals),
    temperaments: freeze(data.temperaments),
    names: freeze(data.names),
    cost: freeze(data.cost)
});

export const CREATURE_SPECIES = freeze({
    dragon: profile({
        id: "dragon",
        label: "Dragon",
        plural: "Dragons",
        icon: "🐉",
        description: "Ancient winged sovereigns of the wild places.",
        biomes: ["forest", "dense-forest", "taiga", "mountain", "rock", "swamp", "coast", "volcano", "meadow"],
        diet: "carnivore",
        preyRoles: ["herbivore", "omnivore"],
        territory: 6,
        lifespan: 320,
        stageAges: [5, 20, 90, 240],
        breedingAge: 24,
        breedYears: 12,
        clutch: 2,
        foodNeed: 6,
        max: 3,
        cost: { gold: 55, food: 35 },
        abilities: ["flight", "fire-breath", "long memory"],
        goals: ["grow", "bond-with-sovereign", "guard-the-realm"],
        temperaments: ["curious", "proud", "gentle", "fierce", "mischievous", "watchful"],
        names: ["Emberwing", "Ashscale", "Cinder", "Stormmaw", "Goldvein", "Nightflame", "Thornfire", "Dawnscale"]
    }),
    wyvern: profile({
        id: "wyvern",
        label: "Wyvern",
        plural: "Wyverns",
        icon: "🦇",
        description: "Two-legged cliff hunters with venomous tails.",
        biomes: ["mountain", "rock", "coast", "forest", "dense-forest", "swamp"],
        diet: "carnivore",
        preyRoles: ["herbivore", "omnivore"],
        territory: 4,
        lifespan: 150,
        stageAges: [3, 9, 55, 120],
        breedingAge: 12,
        breedYears: 6,
        clutch: 3,
        foodNeed: 4,
        max: 4,
        cost: { gold: 32, food: 22 },
        abilities: ["flight", "venom-sting", "cliff-glide"],
        goals: ["hunt", "raise-a-clutch", "claim-a-cliff"],
        temperaments: ["skittish", "territorial", "loyal", "greedy", "bold"],
        names: ["Skyrend", "Cinderwing", "Barbtail", "Highroost", "Duskclaw", "Galecrest", "Embercoil", "Stonewing"]
    }),
    troll: profile({
        id: "troll",
        label: "Troll",
        plural: "Trolls",
        icon: "🧌",
        description: "Slow, powerful scavengers that keep the old woods clean.",
        biomes: ["forest", "dense-forest", "swamp", "taiga", "mountain", "rock"],
        diet: "scavenger",
        preyRoles: [],
        territory: 5,
        lifespan: 190,
        stageAges: [4, 12, 70, 155],
        breedingAge: 18,
        breedYears: 9,
        clutch: 2,
        foodNeed: 8,
        max: 2,
        cost: { gold: 18, food: 30 },
        abilities: ["stone-skin", "carrion-sense", "regeneration"],
        goals: ["find-a-quiet-hollow", "guard-the-woods", "raise-a-clutch"],
        temperaments: ["grumpy", "patient", "protective", "solitary", "hungry"],
        names: ["Mossgrub", "Stonefist", "Old Bark", "Mirejaw", "Boulder", "Rootsnag", "Gloomhollow", "Cragbelly"]
    }),
    griffin: profile({
        id: "griffin",
        label: "Griffin",
        plural: "Griffins",
        icon: "🦅",
        description: "Proud sky-lions that nest on high meadows and cliffs.",
        biomes: ["meadow", "mountain", "rock", "coast", "forest", "steppe"],
        diet: "carnivore",
        preyRoles: ["herbivore", "omnivore"],
        territory: 7,
        lifespan: 210,
        stageAges: [4, 10, 80, 175],
        breedingAge: 15,
        breedYears: 7,
        clutch: 2,
        foodNeed: 5,
        max: 3,
        cost: { gold: 44, food: 26 },
        abilities: ["flight", "keen-sight", "storm-cry"],
        goals: ["patrol-the-sky", "raise-a-clutch", "protect-the-meadow"],
        temperaments: ["proud", "watchful", "fierce", "gentle", "curious"],
        names: ["Sunfeather", "Stormcrest", "Highwind", "Goldtalon", "Cloudmane", "Skysong", "Ironbeak", "Dawnwing"]
    })
});

export const CREATURE_SPECIES_LIST = freeze(Object.values(CREATURE_SPECIES));

export function creatureProfile(speciesId) {
    return CREATURE_SPECIES[String(speciesId || "dragon")] || CREATURE_SPECIES.dragon;
}

export function creatureIcon(speciesId) {
    return creatureProfile(speciesId).icon;
}
