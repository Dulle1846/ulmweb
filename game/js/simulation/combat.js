// ── Combat & Raids ─────────────────────────────────────────────

import { TYPE } from '../types.js';
import { state } from '../state.js';
import { getEntitiesOfType } from '../world/entities.js';
import { createParticle, createFloater } from '../rendering/particles.js';
import { showBigMessage } from '../rendering/ui.js';
import { rand, distance } from '../utils.js';

export function updateCombat() {
    const enemies = state.entities.filter(e => e.isEnemy() && !e.dead);
    const defenders = state.entities.filter(e =>
        (e.type === TYPE.GUARD || e.type === TYPE.KNIGHT || e.type === TYPE.ARCHER || e.type === TYPE.TOWER)
        && !e.dead
    );
    const tick = state.tick;
    const TILE_SIZE = 48; // inline to avoid circular

    enemies.forEach(enemy => {
        let target = null;
        let bestDist = Infinity;

        defenders.forEach(def => {
            const d = distance(enemy.x, enemy.y, def.x, def.y);
            if (d < bestDist) { bestDist = d; target = def; }
        });

        if (!target) {
            const keep = getEntitiesOfType(TYPE.KEEP)[0];
            if (keep) target = keep;
        }
        if (!target) return;

        const dx = target.x - enemy.x;
        const dy = target.y - enemy.y;
        const distToTarget = Math.hypot(dx, dy);

        if (distToTarget > 1.8) {
            enemy.x += Math.sign(dx) * 0.065;
            enemy.y += Math.sign(dy) * 0.065;
        } else {
            if (tick % 13 === 0) {
                target.hp -= enemy.type === TYPE.TROLL ? 32 : 13;
                createParticle(
                    target.x * TILE_SIZE + rand(-10, 10),
                    target.y * TILE_SIZE - 10,
                    "#f43f5e", 18, rand(-3, 3), rand(-4, -1)
                );
                if (target.hp <= 0) {
                    target.dead = true;
                    if (target.type === TYPE.KEEP) {
                        state.gameOver = true;
                        showBigMessage("THE REALM FELL", "THE KEEP WAS DESTROYED", 5000);
                    }
                }
            }
        }

        // trap damage
        if (Math.random() < 0.02) {
            enemy.hp -= 22;
            if (enemy.hp <= 0) enemy.dead = true;
        }
    });

    // defenders attack
    defenders.forEach(def => {
        let closestEnemy = null;
        let record = Infinity;

        enemies.forEach(en => {
            const d = distance(def.x, def.y, en.x, en.y);
            if (d < record) { record = d; closestEnemy = en; }
        });

        if (!closestEnemy || record > 7) return;

        if (tick % (def.type === TYPE.ARCHER ? 22 : 14) === 0) {
            closestEnemy.hp -= def.type === TYPE.KNIGHT ? 34 : 18;

            createParticle(
                closestEnemy.x * TILE_SIZE + 12,
                closestEnemy.y * TILE_SIZE - 18,
                "#fde047", 22, rand(-1, 4), -3
            );

            if (closestEnemy.hp <= 0) {
                closestEnemy.dead = true;
                createFloater(closestEnemy.x * TILE_SIZE, closestEnemy.y * TILE_SIZE, "SLAIN", "#eab308");
            }
        }
    });
}
