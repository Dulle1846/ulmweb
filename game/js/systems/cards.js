// ========================================================
// CASTLEFORGE — Card System
// ========================================================

import { TYPE } from '../config.js'
import { gameState } from '../state.js'
import { randInt } from '../utils/math.js'

export const CARD_DECK = [
    {
        type: TYPE.HOUSE,
        name: "COTTAGE",
        desc: "Houses 3 villagers. +1 morale",
        cost: { wood: 30, stone: 10 },
        icon: "🏠"
    },
    {
        type: TYPE.FARM,
        name: "FARMSTEAD",
        desc: "Generates food every season",
        cost: { wood: 25, food: 5 },
        icon: "🌾"
    },
    {
        type: TYPE.LUMBER,
        name: "LUMBERYARD",
        desc: "Steady wood production",
        cost: { gold: 15 },
        icon: "🪵"
    },
    {
        type: TYPE.QUARRY,
        name: "STONE QUARRY",
        desc: "Stone & occasional gold",
        cost: { wood: 35, food: 15 },
        icon: "⛰️"
    },
    {
        type: TYPE.TOWER,
        name: "WATCHTOWER",
        desc: "Long range defense",
        cost: { wood: 40, stone: 30 },
        icon: "🏰"
    },
    {
        type: TYPE.WALL,
        name: "FORTIFIED WALL",
        desc: "Strong barrier vs raiders",
        cost: { stone: 45 },
        icon: "🧱"
    },
    {
        type: TYPE.TAVERN,
        name: "THE TAVERN",
        desc: "Boosts morale and gold",
        cost: { wood: 55, gold: 25, food: 15 },
        icon: "🍺"
    },
    {
        type: TYPE.TEMPLE,
        name: "HOLY TEMPLE",
        desc: "Increases morale & heals",
        cost: { stone: 60, gold: 35 },
        icon: "⛪"
    },
    {
        type: TYPE.BARRACKS,
        name: "BARRACKS",
        desc: "Trains guards & knights",
        cost: { wood: 45, stone: 35 },
        icon: "🛡️"
    },
    {
        type: TYPE.MILL,
        name: "WATER MILL",
        desc: "Boosts nearby farms",
        cost: { wood: 65, stone: 20 },
        icon: "⚙️"
    },
    {
        type: TYPE.STABLE,
        name: "STABLES",
        desc: "Breeds war horses for knights",
        cost: { wood: 50, food: 40 },
        icon: "🐎"
    },
    {
        type: TYPE.KNIGHT,
        name: "ROYAL KNIGHT",
        desc: "Powerful mounted warrior",
        cost: { gold: 45, food: 25 },
        icon: "🗡️",
        unit: true
    },
    {
        type: TYPE.PRIEST,
        name: "SHRINE PRIEST",
        desc: "Heals allies, boosts morale",
        cost: { gold: 30, food: 20 },
        icon: "🙏",
        unit: true
    }
]

export function getRandomCard() {
    return CARD_DECK[randInt(0, CARD_DECK.length)]
}

export function dealNewCard() {
    gameState.currentCard = getRandomCard()
}
