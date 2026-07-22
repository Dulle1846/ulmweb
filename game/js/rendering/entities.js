// ═══════════════════════════════════════════════════════════════
//  ENTITY DRAWING — Gebäude, Feinde, Rollen-Icons
// ═══════════════════════════════════════════════════════════════

import { TILE_SIZE, ICON_RADIUS, ROLE_COLORS } from '../config.js';
import { TYPE, JOB_ICONS } from '../types.js';

// ═══════════════════════════════════════════════════════════════
//  HAUPT-FUNKTION
// ═══════════════════════════════════════════════════════════════

export function drawEntity(ctx, e, tick) {
    if (e.dead) return;

    const px = e.x * TILE_SIZE + TILE_SIZE / 2;
    const py = e.y * TILE_SIZE + TILE_SIZE / 2;
    const bob = Math.sin(tick * 0.1 + e.anim) * 2.5;
    e.anim += 0.08;

    const isIcon = e.isFriendly() && !e.isBuilding();

    // ── Schatten ─────────────────────────────────────────────
    if (!isIcon) {
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = "#111";
        ctx.beginPath();
        ctx.ellipse(px + 3, py + 18 + bob * 0.3, 18, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
    }

    // ── Zeichnung je Typ ─────────────────────────────────────
    switch (e.type) {
        case TYPE.KEEP:     drawKeep(ctx, px, py, tick); break;
        case TYPE.HOUSE:    drawHouse(ctx, px, py, tick); break;
        case TYPE.FARM:     drawFarm(ctx, px, py, tick, e); break;
        case TYPE.LUMBER:   drawLumber(ctx, px, py); break;
        case TYPE.QUARRY:   drawQuarry(ctx, px, py); break;
        case TYPE.TOWER:    drawTower(ctx, px, py); break;
        case TYPE.WALL:     drawWall(ctx, px, py); break;
        case TYPE.TAVERN:   drawTavern(ctx, px, py, tick); break;
        case TYPE.TEMPLE:   drawTemple(ctx, px, py, tick); break;
        case TYPE.BARRACKS: drawBarracks(ctx, px, py); break;
        case TYPE.MILL:     drawMill(ctx, px, py, tick); break;
        case TYPE.STABLE:   drawStable(ctx, px, py); break;

        // Befreundete Einheiten → Rollen-Icons
        case TYPE.VILLAGER:
        case TYPE.GUARD:
        case TYPE.ARCHER:
        case TYPE.KNIGHT:
        case TYPE.PRIEST:
            drawRoleIcon(ctx, e, px, py, tick);
            break;

        // Feinde → feindliche Icons
        case TYPE.GOBLIN: drawEnemyIcon(ctx, e, px, py, tick, "👺", "#6b2c2c"); break;
        case TYPE.ORC:    drawEnemyIcon(ctx, e, px, py, tick, "👹", "#4a5c2a"); break;
        case TYPE.TROLL:  drawEnemyIcon(ctx, e, px, py, tick, "🧌", "#3a4a3a"); break;
        case TYPE.DEER:   drawDeer(ctx, px, py, tick, e); break;
    }

    // ── Health Bar ───────────────────────────────────────────
    if (e.hp < e.maxHp && e.hp > 0) {
        const pct = e.hp / e.maxHp;
        const barY = isIcon ? py - 28 : py - 32;
        ctx.fillStyle = "#111";
        ctx.fillRect(px - 18, barY, 36, 5);
        ctx.fillStyle = pct > 0.4 ? "#22cc44" : "#ee2222";
        ctx.fillRect(px - 17, barY + 1, 34 * pct, 3);
    }
}

// ═══════════════════════════════════════════════════════════════
//  ROLLEN-ICONS — Befreundete Einheiten
// ═══════════════════════════════════════════════════════════════

function drawRoleIcon(ctx, e, px, py, tick) {
    const now = performance.now() / 1000;
    const speed = Math.hypot(e.velocityX || 0, e.velocityY || 0);
    const isMoving = speed > 0.05;
    const isWorking = e.visualState === "work";
    const isFleeing = e.visualState === "flee";

    const baseRadius = ICON_RADIUS[e.type] || 13;
    const badgeColor = ROLE_COLORS[e.type] || "#52525b";
    const emoji = getEmoji(e);

    // ── Lauf-Animation ───────────────────────────────────────
    const walkCycle = Math.sin(now * 10 + e.anim);
    const bobAmount = isMoving
        ? walkCycle * 2.5
        : Math.sin(now * 2 + e.anim) * 0.6;

    const lean = isMoving
        ? Math.max(-0.15, Math.min(0.15, (e.velocityX || 0) * 0.06))
        : 0;

    ctx.save();
    ctx.translate(px, py - 4 + bobAmount);
    ctx.rotate(lean);

    // ── Schatten ─────────────────────────────────────────────
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(2, baseRadius + 6 - bobAmount, baseRadius * 0.9, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // ── Äußerer Ring (Statusfarbe) ───────────────────────────
    const statusColor = isFleeing ? "#ef4444" : isWorking ? "#f59e0b" : badgeColor;
    ctx.fillStyle = "#111";
    ctx.beginPath();
    ctx.arc(0, 0, baseRadius + 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = statusColor;
    ctx.beginPath();
    ctx.arc(0, 0, baseRadius + 1, 0, Math.PI * 2);
    ctx.fill();

    // ── Innerer Badge ────────────────────────────────────────
    const innerColor = isWorking
        ? lightenColor(badgeColor, 0.25)
        : badgeColor;

    ctx.fillStyle = innerColor;
    ctx.beginPath();
    ctx.arc(0, 0, baseRadius - 1, 0, Math.PI * 2);
    ctx.fill();

    // ── Glanz-Highlight ──────────────────────────────────────
    ctx.fillStyle = "rgba(255,255,255,0.14)";
    ctx.beginPath();
    ctx.ellipse(-baseRadius * 0.25, -baseRadius * 0.35, baseRadius * 0.5, baseRadius * 0.35, -0.4, 0, Math.PI * 2);
    ctx.fill();

    // ── Emoji ────────────────────────────────────────────────
    const fontSize = Math.round(baseRadius * 1.25);
    ctx.font = `${fontSize}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(emoji, 0, 1);

    // ── Füße beim Laufen ────────────────────────────────────
    if (isMoving) {
        const footPhase = walkCycle;
        const footY = baseRadius + 3;

        ctx.fillStyle = "#1a1410";
        ctx.beginPath();
        ctx.ellipse(-4 + footPhase * 3, footY, 3.5, 2.2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(4 - footPhase * 3, footY, 3.5, 2.2, 0, 0, Math.PI * 2);
        ctx.fill();
    }

    // ── Krone beim König ─────────────────────────────────────
    if (e.isKing) {
        ctx.fillStyle = "#f2c744";
        const crownY = -baseRadius - 8;
        ctx.beginPath();
        ctx.moveTo(-7, crownY + 6);
        ctx.lineTo(-7, crownY);
        ctx.lineTo(-3, crownY + 4);
        ctx.lineTo(0, crownY - 3);
        ctx.lineTo(3, crownY + 4);
        ctx.lineTo(7, crownY);
        ctx.lineTo(7, crownY + 6);
        ctx.closePath();
        ctx.fill();

        // kleine Edelsteine
        ctx.fillStyle = "#ef4444";
        ctx.beginPath();
        ctx.arc(0, crownY + 1, 1.2, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.restore();

    // ── Arbeitseffekte (auerhalb des transform) ──────────────
    if (isWorking && e.job) {
        drawWorkParticles(ctx, e, px, py, now);
    }

    // ── Flucht-Staubwolken ───────────────────────────────────
    if (isFleeing && isMoving) {
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = "#d6cbb8";
        const dustX = px - (e.velocityX || 0) * 8;
        const dustY = py + baseRadius - 2;
        ctx.beginPath();
        ctx.arc(dustX - 4, dustY, 3, 0, Math.PI * 2);
        ctx.arc(dustX + 3, dustY + 2, 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
    }

    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
}

function getEmoji(entity) {
    // König hat Vorrang
    if (entity.isKing) return JOB_ICONS.king;

    // Feinde haben eigene Emojis
    if (entity.type === TYPE.GOBLIN) return "👺";
    if (entity.type === TYPE.ORC)    return "👹";
    if (entity.type === TYPE.TROLL)  return "🧌";

    // Militär
    if (entity.type === TYPE.GUARD)  return JOB_ICONS.guard;
    if (entity.type === TYPE.ARCHER) return JOB_ICONS.archer;
    if (entity.type === TYPE.KNIGHT) return JOB_ICONS.knight;
    if (entity.type === TYPE.PRIEST) return JOB_ICONS.priest;

    // Dorfbewohner nach Job
    if (entity.type === TYPE.VILLAGER) {
        return JOB_ICONS[entity.job] || JOB_ICONS.wanderer;
    }

    return JOB_ICONS.idle;
}

function drawWorkParticles(ctx, e, px, py, now) {
    const particleCount = 3;
    const radius = ICON_RADIUS[e.type] || 13;

    for (let i = 0; i < particleCount; i++) {
        const phase = (now * 2 + i * 2.1) % 3;
        if (phase > 2) continue;

        const t = phase / 2;
        const angle = (i / particleCount) * Math.PI * 2 + now;
        const dist = radius + 4 + t * 10;
        const alpha = 1 - t;

        const ppx = px + Math.cos(angle) * dist;
        const ppy = py - 6 + Math.sin(angle) * dist * 0.6 - t * 8;

        let color;
        switch (e.job) {
            case "farmer":     color = "#a3e635"; break;
            case "woodcutter": color = "#d4a054"; break;
            case "miner":      color = "#9ca3af"; break;
            case "miller":     color = "#fef3c7"; break;
            default:           color = "#fde047"; break;
        }

        ctx.globalAlpha = alpha * 0.6;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(ppx, ppy, 2, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.globalAlpha = 1;
}

function lightenColor(hex, amount) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const nr = Math.min(255, r + Math.floor((255 - r) * amount));
    const ng = Math.min(255, g + Math.floor((255 - g) * amount));
    const nb = Math.min(255, b + Math.floor((255 - b) * amount));
    return `rgb(${nr},${ng},${nb})`;
}

// ═══════════════════════════════════════════════════════════════
//  FEINDLICHE EINHEITEN — als Icons
// ═══════════════════════════════════════════════════════════════

function drawEnemyIcon(ctx, e, px, py, tick, emoji, color) {
    const now = performance.now() / 1000;
    const speed = Math.hypot(e.velocityX || 0, e.velocityY || 0);
    const isMoving = speed > 0.05;
    const baseRadius = ICON_RADIUS[e.type] || 12;

    const bob = isMoving
        ? Math.sin(now * 9 + e.anim) * 3
        : Math.sin(now * 2.5 + e.anim) * 0.8;

    ctx.save();
    ctx.translate(px, py - 4 + bob);

    // Schatten
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(2, baseRadius + 5, baseRadius * 0.85, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // Äußerer Ring
    ctx.fillStyle = "#111";
    ctx.beginPath();
    ctx.arc(0, 0, baseRadius + 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, 0, baseRadius + 1, 0, Math.PI * 2);
    ctx.fill();

    // Innerer Badge
    ctx.fillStyle = lightenColor(color, 0.2);
    ctx.beginPath();
    ctx.arc(0, 0, baseRadius - 1, 0, Math.PI * 2);
    ctx.fill();

    // Glanz
    ctx.fillStyle = "rgba(255,255,255,0.1)";
    ctx.beginPath();
    ctx.ellipse(-3, -4, 5, 3, -0.4, 0, Math.PI * 2);
    ctx.fill();

    // Emoji
    const fontSize = Math.round(baseRadius * 1.2);
    ctx.font = `${fontSize}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(emoji, 0, 1);

    // Füße
    if (isMoving) {
        const step = Math.sin(now * 10 + e.anim);
        ctx.fillStyle = "#1a1410";
        ctx.beginPath();
        ctx.ellipse(-3 + step * 3, baseRadius + 2, 3, 2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(3 - step * 3, baseRadius + 2, 3, 2, 0, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.restore();
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
}

// ═══════════════════════════════════════════════════════════════
//  HILFSFUNKTIONEN
// ═══════════════════════════════════════════════════════════════

function outlinedRect(ctx, x, y, w, h, fill, outline = "#1a1208") {
    ctx.fillStyle = outline;
    ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, w, h);
}

function outlinedCircle(ctx, x, y, r, fill, outline = "#1a1208") {
    ctx.fillStyle = outline;
    ctx.beginPath();
    ctx.arc(x, y, r + 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
}

// ═══════════════════════════════════════════════════════════════
//  GEBÄUDE-ZEICHNUNGEN (unverändert)
// ═══════════════════════════════════════════════════════════════

function drawKeep(ctx, px, py, tick) {
    outlinedRect(ctx, px - 34, py - 36, 68, 52, "#8a8578");
    ctx.fillStyle = "#767162";
    for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 4; c++) {
            if ((r + c) % 2 === 0) {
                ctx.fillRect(px - 30 + c * 16, py - 30 + r * 15, 13, 11);
            }
        }
    }
    ctx.fillStyle = "#6e695c";
    for (let i = 0; i < 5; i++) {
        ctx.fillRect(px - 34 + i * 15, py - 46, 10, 12);
    }
    outlinedRect(ctx, px - 12, py - 62, 24, 28, "#9a9587");
    ctx.fillStyle = "#6e695c";
    ctx.fillRect(px - 12, py - 68, 7, 8);
    ctx.fillRect(px + 5, py - 68, 7, 8);
    ctx.fillStyle = "#2a1f14";
    ctx.beginPath();
    ctx.arc(px, py + 6, 11, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(px - 11, py + 6, 22, 10);
    ctx.strokeStyle = "#4a3826";
    ctx.lineWidth = 2;
    for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(px + i * 6, py - 2);
        ctx.lineTo(px + i * 6, py + 16);
        ctx.stroke();
    }
    const fw = Math.sin(tick * 0.15) * 3;
    ctx.fillStyle = "#8a7a6a";
    ctx.fillRect(px - 1, py - 84, 3, 24);
    ctx.fillStyle = "#d92626";
    ctx.beginPath();
    ctx.moveTo(px + 2, py - 84);
    ctx.lineTo(px + 24, py - 80 + fw);
    ctx.lineTo(px + 2, py - 72);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#facc15";
    ctx.beginPath();
    ctx.arc(px + 9, py - 78 + fw * 0.4, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffdf80";
    ctx.fillRect(px - 6, py - 54, 5, 7);
    ctx.fillRect(px + 2, py - 54, 5, 7);
}

function drawHouse(ctx, px, py, tick) {
    outlinedRect(ctx, px - 19, py - 12, 38, 28, "#e8d5b0");
    ctx.fillStyle = "#6b4a2e";
    ctx.fillRect(px - 19, py - 12, 38, 3);
    ctx.fillRect(px - 19, py + 13, 38, 3);
    ctx.fillRect(px - 2, py - 12, 4, 28);
    ctx.fillStyle = "#1a1208";
    ctx.beginPath();
    ctx.moveTo(px - 27, py - 10);
    ctx.lineTo(px, py - 38);
    ctx.lineTo(px + 27, py - 10);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#b5432e";
    ctx.beginPath();
    ctx.moveTo(px - 23, py - 12);
    ctx.lineTo(px, py - 34);
    ctx.lineTo(px + 23, py - 12);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#d15a42";
    ctx.beginPath();
    ctx.moveTo(px - 16, py - 14);
    ctx.lineTo(px - 2, py - 29);
    ctx.lineTo(px + 4, py - 26);
    ctx.lineTo(px - 10, py - 14);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#5d4028";
    ctx.fillRect(px - 14, py + 2, 9, 14);
    ctx.fillStyle = "#f2c744";
    ctx.beginPath();
    ctx.arc(px - 7.5, py + 9, 1.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#4a3826";
    ctx.fillRect(px + 4, py - 4, 11, 10);
    ctx.fillStyle = "#ffd77a";
    ctx.fillRect(px + 5.5, py - 2.5, 8, 7);
    ctx.strokeStyle = "#4a3826";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(px + 9.5, py - 3);
    ctx.lineTo(px + 9.5, py + 5);
    ctx.stroke();
    ctx.fillStyle = "#7d7264";
    ctx.fillRect(px + 10, py - 32, 7, 12);
    const puff = (tick * 0.5) % 30;
    ctx.fillStyle = `rgba(220,220,220,${0.5 - puff / 70})`;
    ctx.beginPath();
    ctx.arc(px + 13 + puff * 0.15, py - 36 - puff * 0.6, 3.5 + puff * 0.12, 0, Math.PI * 2);
    ctx.fill();
}

function drawFarm(ctx, px, py, tick, e) {
    outlinedRect(ctx, px - 23, py - 14, 46, 32, "#6e4f30");
    ctx.fillStyle = "#5a3f25";
    for (let i = 0; i < 4; i++) {
        ctx.fillRect(px - 21, py - 10 + i * 7, 42, 3);
    }
    const ws = Math.sin(tick * 0.06 + e.anim) * 1.5;
    for (let i = -2; i <= 2; i++) {
        ctx.strokeStyle = "#c9a83c";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(px + i * 9, py + 14);
        ctx.quadraticCurveTo(px + i * 9 + ws, py - 2, px + i * 9 + ws * 1.6, py - 16);
        ctx.stroke();
        ctx.fillStyle = "#f2d264";
        ctx.beginPath();
        ctx.ellipse(px + i * 9 + ws * 1.6, py - 19, 3, 6, ws * 0.1, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.fillStyle = "#5d4028";
    ctx.fillRect(px + 17, py - 22, 2.5, 20);
    ctx.fillRect(px + 11, py - 17, 15, 2.5);
    ctx.fillStyle = "#e0a33c";
    ctx.beginPath();
    ctx.arc(px + 18, py - 25, 4, 0, Math.PI * 2);
    ctx.fill();
}

function drawLumber(ctx, px, py) {
    outlinedRect(ctx, px - 18, py - 8, 36, 26, "#7a5230");
    ctx.strokeStyle = "#5d4028";
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(px - 18, py - 2 + i * 8);
        ctx.lineTo(px + 18, py - 2 + i * 8);
        ctx.stroke();
    }
    ctx.fillStyle = "#4a5d3a";
    ctx.beginPath();
    ctx.moveTo(px - 22, py - 6);
    ctx.lineTo(px, py - 22);
    ctx.lineTo(px + 22, py - 6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#8a6238";
    ctx.beginPath();
    ctx.arc(px - 26, py + 12, 5, 0, Math.PI * 2);
    ctx.arc(px - 26, py + 3, 5, 0, Math.PI * 2);
    ctx.arc(px - 32, py + 8, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#d9b380";
    ctx.beginPath();
    ctx.arc(px - 26, py + 12, 2.5, 0, Math.PI * 2);
    ctx.arc(px - 26, py + 3, 2.5, 0, Math.PI * 2);
    ctx.arc(px - 32, py + 8, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#6e4f30";
    ctx.fillRect(px + 22, py + 6, 10, 10);
    ctx.strokeStyle = "#8a8578";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(px + 27, py + 8);
    ctx.lineTo(px + 33, py - 2);
    ctx.stroke();
}

function drawQuarry(ctx, px, py) {
    outlinedRect(ctx, px - 22, py - 10, 44, 28, "#5f5b52");
    ctx.fillStyle = "#4a463e";
    ctx.beginPath();
    ctx.ellipse(px, py + 4, 16, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#2e2b26";
    ctx.beginPath();
    ctx.ellipse(px, py + 4, 10, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#5d4028";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(px - 14, py - 8);
    ctx.lineTo(px - 4, py - 26);
    ctx.lineTo(px + 10, py - 20);
    ctx.stroke();
    ctx.strokeStyle = "#8a7a5a";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(px + 10, py - 20);
    ctx.lineTo(px + 10, py - 4);
    ctx.stroke();
    ctx.fillStyle = "#6e5a3a";
    ctx.fillRect(px + 6, py - 4, 8, 6);
    ctx.fillStyle = "#8a867c";
    ctx.beginPath();
    ctx.arc(px - 16, py + 12, 4, 0, Math.PI * 2);
    ctx.arc(px - 10, py + 14, 3.5, 0, Math.PI * 2);
    ctx.fill();
}

function drawTower(ctx, px, py) {
    ctx.fillStyle = "#1a1208";
    ctx.fillRect(px - 15, py - 44, 30, 60);
    ctx.fillStyle = "#8a8578";
    ctx.fillRect(px - 13, py - 42, 26, 56);
    ctx.fillStyle = "#767162";
    for (let r = 0; r < 5; r++) {
        ctx.fillRect(px - 13 + (r % 2) * 7, py - 38 + r * 10, 12, 7);
    }
    outlinedRect(ctx, px - 19, py - 52, 38, 12, "#6e695c");
    ctx.fillStyle = "#6e695c";
    ctx.fillRect(px - 19, py - 58, 8, 8);
    ctx.fillRect(px - 4, py - 58, 8, 8);
    ctx.fillRect(px + 11, py - 58, 8, 8);
    ctx.fillStyle = "#1a1208";
    ctx.fillRect(px - 2, py - 30, 4, 12);
    ctx.fillStyle = "#3a4a2e";
    ctx.fillRect(px - 4, py - 66, 8, 9);
    ctx.beginPath();
    ctx.arc(px, py - 68, 3.5, 0, Math.PI * 2);
    ctx.fill();
}

function drawWall(ctx, px, py) {
    outlinedRect(ctx, px - 22, py - 16, 44, 34, "#8a8578");
    ctx.strokeStyle = "#6e695c";
    ctx.lineWidth = 2;
    for (let r = 0; r < 3; r++) {
        ctx.beginPath();
        ctx.moveTo(px - 22, py - 6 + r * 10);
        ctx.lineTo(px + 22, py - 6 + r * 10);
        ctx.stroke();
        for (let c = 0; c < 3; c++) {
            ctx.beginPath();
            ctx.moveTo(px - 14 + c * 14 + (r % 2) * 7, py - 16 + r * 10);
            ctx.lineTo(px - 14 + c * 14 + (r % 2) * 7, py - 6 + r * 10);
            ctx.stroke();
        }
    }
    ctx.fillStyle = "#6e695c";
    for (let i = 0; i < 4; i++) {
        ctx.fillRect(px - 22 + i * 12, py - 24, 8, 9);
    }
}

function drawTavern(ctx, px, py, tick) {
    outlinedRect(ctx, px - 21, py - 16, 42, 32, "#a3764a");
    ctx.fillStyle = "#8a5f38";
    ctx.fillRect(px - 21, py - 16, 42, 14);
    ctx.fillStyle = "#1a1208";
    ctx.beginPath();
    ctx.moveTo(px - 28, py - 14);
    ctx.lineTo(px, py - 40);
    ctx.lineTo(px + 28, py - 14);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#5a4632";
    ctx.beginPath();
    ctx.moveTo(px - 24, py - 16);
    ctx.lineTo(px, py - 36);
    ctx.lineTo(px + 24, py - 16);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#ffd77a";
    ctx.fillRect(px - 15, py - 12, 8, 7);
    ctx.fillRect(px + 7, py - 12, 8, 7);
    ctx.fillRect(px - 15, py + 2, 8, 8);
    ctx.fillStyle = "#3d2c1a";
    ctx.fillRect(px + 4, py + 2, 11, 14);
    ctx.strokeStyle = "#4a3826";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px + 21, py - 18);
    ctx.lineTo(px + 30, py - 18);
    ctx.stroke();
    const sw = Math.sin(tick * 0.1) * 2;
    ctx.fillStyle = "#e0a33c";
    ctx.fillRect(px + 26 + sw, py - 16, 8, 9);
    ctx.fillStyle = "#fff";
    ctx.fillRect(px + 27 + sw, py - 15, 6, 2.5);
}

function drawTemple(ctx, px, py, tick) {
    outlinedRect(ctx, px - 22, py - 14, 44, 30, "#e8e2d2");
    ctx.fillStyle = "#c9c2b0";
    for (let i = 0; i < 4; i++) {
        ctx.fillRect(px - 18 + i * 11, py - 12, 5, 26);
    }
    ctx.fillStyle = "#1a1208";
    ctx.beginPath();
    ctx.moveTo(px - 28, py - 12);
    ctx.lineTo(px, py - 34);
    ctx.lineTo(px + 28, py - 12);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#d9d2c0";
    ctx.beginPath();
    ctx.moveTo(px - 24, py - 14);
    ctx.lineTo(px, py - 31);
    ctx.lineTo(px + 24, py - 14);
    ctx.closePath();
    ctx.fill();
    const glow = 0.5 + Math.sin(tick * 0.08) * 0.3;
    ctx.fillStyle = `rgba(250, 204, 21, ${glow})`;
    ctx.beginPath();
    ctx.arc(px, py - 22, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f2c744";
    ctx.beginPath();
    ctx.arc(px, py - 22, 4, 0, Math.PI * 2);
    ctx.fill();
}

function drawBarracks(ctx, px, py) {
    outlinedRect(ctx, px - 24, py - 12, 48, 30, "#6e5a48");
    ctx.fillStyle = "#5a4a3c";
    ctx.fillRect(px - 24, py - 12, 48, 6);
    ctx.fillStyle = "#4a3e32";
    for (let i = 0; i < 5; i++) {
        ctx.fillRect(px - 24 + i * 11, py - 19, 7, 8);
    }
    ctx.fillStyle = "#8a2e2e";
    ctx.fillRect(px - 4, py - 10, 8, 16);
    ctx.fillStyle = "#f2c744";
    ctx.beginPath();
    ctx.arc(px, py - 4, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#b8b2a4";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(px - 16, py + 2);
    ctx.lineTo(px - 8, py + 12);
    ctx.moveTo(px - 8, py + 2);
    ctx.lineTo(px - 16, py + 12);
    ctx.stroke();
    ctx.fillStyle = "#2e2318";
    ctx.fillRect(px + 8, py + 2, 12, 16);
}

function drawMill(ctx, px, py, tick) {
    outlinedRect(ctx, px - 14, py - 16, 28, 32, "#c9b28a");
    ctx.fillStyle = "#a8916c";
    ctx.fillRect(px - 14, py - 16, 28, 8);
    ctx.fillStyle = "#8a5f38";
    ctx.beginPath();
    ctx.moveTo(px - 18, py - 14);
    ctx.lineTo(px, py - 30);
    ctx.lineTo(px + 18, py - 14);
    ctx.closePath();
    ctx.fill();
    const angle = tick * 0.04;
    ctx.save();
    ctx.translate(px, py - 18);
    ctx.rotate(angle);
    ctx.fillStyle = "#e8dcc0";
    ctx.strokeStyle = "#5d4028";
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
        ctx.rotate(Math.PI / 2);
        ctx.fillRect(-3, 0, 6, 26);
        ctx.strokeRect(-3, 0, 6, 26);
    }
    ctx.restore();
    outlinedCircle(ctx, px, py - 18, 4, "#5d4028");
    ctx.fillStyle = "#4a3826";
    ctx.fillRect(px - 5, py + 4, 10, 12);
}

function drawStable(ctx, px, py) {
    outlinedRect(ctx, px - 22, py - 10, 44, 26, "#9c2e2e");
    ctx.strokeStyle = "#e8e2d2";
    ctx.lineWidth = 3;
    ctx.strokeRect(px - 18, py - 6, 16, 18);
    ctx.beginPath();
    ctx.moveTo(px - 18, py - 6);
    ctx.lineTo(px - 2, py + 12);
    ctx.moveTo(px - 2, py - 6);
    ctx.lineTo(px - 18, py + 12);
    ctx.stroke();
    ctx.fillStyle = "#5a4632";
    ctx.beginPath();
    ctx.moveTo(px - 27, py - 8);
    ctx.lineTo(px, py - 28);
    ctx.lineTo(px + 27, py - 8);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#7a5a3a";
    ctx.beginPath();
    ctx.ellipse(px + 11, py + 2, 6, 8, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#5a4028";
    ctx.beginPath();
    ctx.moveTo(px + 7, py - 5);
    ctx.lineTo(px + 9, py - 10);
    ctx.lineTo(px + 11, py - 5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#1a1208";
    ctx.beginPath();
    ctx.arc(px + 13, py, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#e0c050";
    ctx.fillRect(px + 20, py + 8, 10, 8);
    ctx.strokeStyle = "#b89a30";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(px + 21.5, py + 9.5, 7, 5);
}

function drawDeer(ctx, px, py, tick, e) {
    const graze = Math.sin(tick * 0.05 + e.anim) > 0.6;
    outlinedRect(ctx, px - 13, py - 6, 26, 13, "#9c7a4e");
    ctx.fillStyle = "#d9c9a8";
    ctx.fillRect(px - 10, py + 3, 20, 4);
    ctx.fillStyle = "#7a5f3c";
    ctx.fillRect(px - 11, py + 7, 3, 10);
    ctx.fillRect(px - 4, py + 7, 3, 10);
    ctx.fillRect(px + 3, py + 7, 3, 10);
    ctx.fillRect(px + 9, py + 7, 3, 10);
    const headY = graze ? py + 2 : py - 16;
    ctx.fillStyle = "#9c7a4e";
    ctx.beginPath();
    ctx.moveTo(px + 9, py - 4);
    ctx.lineTo(px + 16, headY);
    ctx.lineTo(px + 20, headY + 2);
    ctx.lineTo(px + 13, py - 1);
    ctx.closePath();
    ctx.fill();
    outlinedCircle(ctx, px + 18, headY, 5, "#a8865a");
    ctx.fillStyle = "#1a1208";
    ctx.beginPath();
    ctx.arc(px + 19, headY - 1, 1.3, 0, Math.PI * 2);
    ctx.fill();
    if (!graze) {
        ctx.strokeStyle = "#6e5a3a";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(px + 16, headY - 4);
        ctx.lineTo(px + 13, headY - 12);
        ctx.moveTo(px + 14.5, headY - 8);
        ctx.lineTo(px + 11, headY - 11);
        ctx.moveTo(px + 20, headY - 4);
        ctx.lineTo(px + 22, headY - 12);
        ctx.stroke();
    }
    ctx.fillStyle = "#e8e2d2";
    ctx.beginPath();
    ctx.arc(px - 13, py - 3, 3, 0, Math.PI * 2);
    ctx.fill();
}
