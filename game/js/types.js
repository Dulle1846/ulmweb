// ========================================================
// CASTLEFORGE — Entity Type Definitions
// ========================================================

import { TYPE, MAX_HP } from './config.js'

export class Entity {
    constructor(x, y, type) {
        this.x = x
        this.y = y
        this.type = type
        this.hp = this.getMaxHp()
        this.maxHp = this.hp
        this.dead = false
        this.age = 0
        this.facing = Math.random() > 0.5 ? 1 : -1
        this.anim = Math.random() * 100
        this.targetX = x
        this.targetY = y
        this.state = "idle"
        this.job = null
        this.home = null
        this.moraleMod = 0
        this.tint = Math.floor(Math.random() * 4) // stable color variation
    }
    
    getMaxHp() {
        return MAX_HP[this.type] || 100
    }
    
    isBuilding() {
        return this.type < 20
    }
    
    isUnit() {
        return this.type >= 20 && this.type < 30
    }
    
    isEnemy() {
        return this.type >= 30 && this.type < 40
    }
}
