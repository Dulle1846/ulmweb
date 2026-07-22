// ── Entity Types & Entity Class ────────────────────────────────

export const TYPE = {
    KEEP: 0,
    HOUSE: 1,
    FARM: 2,
    LUMBER: 3,
    QUARRY: 4,
    TOWER: 5,
    WALL: 6,
    TAVERN: 7,
    TEMPLE: 8,
    BARRACKS: 9,
    MILL: 10,
    STABLE: 11,
    WONDER: 12,

    VILLAGER: 20,
    GUARD: 21,
    ARCHER: 22,
    KNIGHT: 23,
    PRIEST: 24,

    GOBLIN: 30,
    ORC: 31,
    TROLL: 32,

    DEER: 40,
    RUIN: 50,
};

function getMaxHpForType(type) {
    switch (type) {
        case TYPE.KEEP:     return 1200;
        case TYPE.HOUSE:    return 180;
        case TYPE.FARM:     return 90;
        case TYPE.LUMBER:   return 110;
        case TYPE.QUARRY:   return 140;
        case TYPE.WALL:     return 450;
        case TYPE.TOWER:    return 220;
        case TYPE.TAVERN:   return 160;
        case TYPE.TEMPLE:   return 210;
        case TYPE.BARRACKS: return 280;
        case TYPE.MILL:     return 130;
        case TYPE.STABLE:   return 170;
        case TYPE.WONDER:   return 9999;
        case TYPE.VILLAGER: return 35;
        case TYPE.GUARD:    return 160;
        case TYPE.ARCHER:   return 95;
        case TYPE.KNIGHT:   return 240;
        case TYPE.PRIEST:   return 70;
        case TYPE.GOBLIN:   return 45;
        case TYPE.ORC:      return 110;
        case TYPE.TROLL:    return 240;
        case TYPE.DEER:     return 25;
        default:            return 100;
    }
}

export class Entity {
    constructor(x, y, type) {
        this.x = x;
        this.y = y;
        this.type = type;
        this.hp = getMaxHpForType(type);
        this.maxHp = this.hp;
        this.dead = false;
        this.age = 0;
        this.facing = Math.random() > 0.5 ? 1 : -1;
        this.anim = Math.random() * 100;
        this.targetX = x;
        this.targetY = y;
        this.state = "idle";
        this.job = null;
        this.home = null;
        this.moraleMod = 0;
        this.tint = Math.floor(Math.random() * 4);
    }

    isBuilding() {
        return this.type < 20;
    }

    isUnit() {
        return this.type >= 20 && this.type < 30;
    }

    isEnemy() {
        return this.type >= 30 && this.type < 40;
    }
}
