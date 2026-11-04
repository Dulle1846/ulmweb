// ═══════════════════════════════════════════════════════════════
//  ENTITY DRAWING — Four detail levels: landscape, districts, rooftops, interiors
// ═══════════════════════════════════════════════════════════════

import {
    CELL, ICON_RADIUS, ROLE_COLORS,
    BUILDING_SIZE, BUILDING_ROOF_COLOR,
} from '../../core/config.js';
import { TYPE, JOB_ICONS } from '../../core/types.js';
import { state } from '../../core/state.js';

// ═══════════════════════════════════════════════════════════════
//  HAUPT-EINSTIEG
// ═══════════════════════════════════════════════════════════════

export function drawEntity(ctx, e, tick, zoom, cam) {
    if (e.dead) return;

    const zl = state.zoomLevel;
    const cellPx = CELL * zoom;

    const sx = e.x * cellPx - cam.x;
    const sy = e.y * cellPx - cam.y;

    // Frustum-Culling
    if (sx < -cellPx * 4 || sx > state.canvas.width + cellPx * 4) return;
    if (sy < -cellPx * 4 || sy > state.canvas.height + cellPx * 4) return;

    // Landscape: inhabitants are tiny readable silhouettes; districts use profession badges.
    if (zl === 1) {
        if (e.isFriendly()) drawPersonMiniature(ctx, e, sx, sy, cellPx);
        else if (e.isEnemy()) drawPersonMiniature(ctx, e, sx, sy, cellPx, "#b84a43");
        else if (e.type === TYPE.DEER) drawPersonMiniature(ctx, e, sx, sy, cellPx, "#a8865a");
        return;
    }

    if (e.isBuilding()) {
        if (zl === 2)      drawBuildingZone(ctx, e, sx, sy, cellPx);
        else if (zl === 3) drawBuildingLevel2(ctx, e, sx, sy, cellPx, tick);
        else               drawBuildingLevel3(ctx, e, sx, sy, cellPx, tick);
    } else if (e.isFriendly()) {
        if (zl === 2) drawPersonRoleIcon(ctx, e, sx, sy, cellPx);
        else drawPersonIcon(ctx, e, sx, sy, cellPx, tick);
    } else if (e.isEnemy()) {
        drawEnemyIcon(ctx, e, sx, sy, cellPx, tick);
    } else if (e.type === TYPE.DEER) {
        drawPersonDot(ctx, e, sx, sy, cellPx, "#a8865a");
    }

    // Health bars are only useful once individual entities are readable.
    if (zl >= 3 && e.hp < e.maxHp && e.hp > 0) {
        const pct = e.hp / e.maxHp;
        const scale = cellPx / CELL;
        const bw = 30 * scale;
        const bh = 3 * scale;
        const bx = sx + cellPx / 2 - bw / 2;
        const by = sy - 10 * scale;

        ctx.fillStyle = "#111";
        ctx.fillRect(bx, by, bw, bh);
        ctx.fillStyle = pct > 0.4 ? "#22cc44" : "#ee2222";
        ctx.fillRect(bx + 0.5, by + 0.5, (bw - 1) * pct, bh - 1);
    }
}

// ═══════════════════════════════════════════════════════════════
//  LEVEL 2 — District view: building zones, no individual people
// ═══════════════════════════════════════════════════════════════

const DISTRICT_LABELS = {
    [TYPE.KEEP]: "KEEP",
    [TYPE.HOUSE]: "RESIDENTIAL",
    [TYPE.FARM]: "FARMLAND",
    [TYPE.LUMBER]: "TIMBER",
    [TYPE.QUARRY]: "QUARRY",
    [TYPE.GOLDMINE]: "GOLD MINE",
    [TYPE.BARREL]: "SUPPLIES",
    [TYPE.TOWER]: "DEFENCE",
    [TYPE.WALL]: "WALL",
    [TYPE.TAVERN]: "TRADE",
    [TYPE.TEMPLE]: "TEMPLE",
    [TYPE.BARRACKS]: "MILITARY",
    [TYPE.MILL]: "MILL",
    [TYPE.STABLE]: "STABLE",
    [TYPE.WONDER]: "LANDMARK"
};

function getBuildingSize(entity) {
    const base = BUILDING_SIZE[entity.type] || { w: 1, h: 1 };
    const scale = Math.max(0.25, Math.min(6, Number(entity.footprintScale) || 1));
    return { w: base.w * scale, h: base.h * scale };
}

function drawBuildingZone(ctx, e, sx, sy, cellPx) {
    const size = getBuildingSize(e);
    const width = size.w * cellPx;
    const height = size.h * cellPx;
    const centerX = sx + cellPx / 2;
    const centerY = sy + cellPx / 2;
    const left = centerX - width / 2;
    const top = centerY - height / 2;
    const color = BUILDING_ROOF_COLOR[e.type] || "#8b8172";

    ctx.save();
    ctx.fillStyle = "rgba(8, 15, 18, 0.48)";
    ctx.fillRect(left + 2, top + 2, width, height);
    ctx.fillStyle = hexWithAlpha(color, 0.5);
    ctx.fillRect(left, top, width, height);
    ctx.strokeStyle = hexWithAlpha(color, 0.98);
    ctx.lineWidth = Math.max(1, Math.min(2.2, cellPx * 0.045));
    ctx.strokeRect(left + 0.5, top + 0.5, Math.max(0, width - 1), Math.max(0, height - 1));

    if (width >= 28 && height >= 16) {
        const label = DISTRICT_LABELS[e.type] || "BUILDING";
        const fontSize = Math.max(6, Math.min(9, cellPx * 0.18));
        ctx.font = `700 ${fontSize}px "Trebuchet MS", sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "rgba(12, 18, 17, 0.78)";
        ctx.fillRect(left + 2, centerY - fontSize * 0.8, width - 4, fontSize * 1.7);
        ctx.fillStyle = "#f4ead5";
        ctx.fillText(label, centerX, centerY, width - 8);
    }
    ctx.restore();
}

// ═══════════════════════════════════════════════════════════════
//  LEVEL 3 — Rooftop view with readable activity icons
// ═══════════════════════════════════════════════════════════════

function drawBuildingLevel2(ctx, e, sx, sy, cellPx, tick) {
    const bs = getBuildingSize(e);
    const roofColor = BUILDING_ROOF_COLOR[e.type] || "#666";
    const scale = cellPx / CELL;

    const w = bs.w * cellPx;
    const h = bs.h * cellPx;
    const cx = sx + cellPx / 2;
    const cy = sy + cellPx / 2;

    // Schatten
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.fillRect(cx - w / 2 + 3 * scale, cy - h / 2 + 3 * scale, w, h);

    // Wände (leicht heller)
    ctx.fillStyle = lightenColor(roofColor, 0.3);
    ctx.fillRect(cx - w / 2, cy - h / 2, w, h);

    // Dach (dunklere Mitte)
    ctx.fillStyle = roofColor;
    const inset = 3 * scale;
    ctx.fillRect(cx - w / 2 + inset, cy - h / 2 + inset, w - inset * 2, h - inset * 2);

    // Dachfirst
    ctx.strokeStyle = darkenColor(roofColor, 0.3);
    ctx.lineWidth = 1.5 * scale;
    ctx.beginPath();
    ctx.moveTo(cx - w / 2 + inset, cy);
    ctx.lineTo(cx + w / 2 - inset, cy);
    ctx.stroke();

    // Keep: Flagge
    if (e.type === TYPE.KEEP) {
        const fw = Math.sin(tick * 0.15) * 2 * scale;
        ctx.fillStyle = "#d92626";
        ctx.fillRect(cx + w / 4, cy - h / 2 - 8 * scale, 8 * scale, 5 * scale + fw);
        ctx.fillStyle = "#6e695c";
        ctx.fillRect(cx + w / 4 - 1, cy - h / 2 - 10 * scale, 2 * scale, 12 * scale);
    }

    // Mühle: Kreissymbol
    if (e.type === TYPE.MILL) {
        const angle = tick * 0.04;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(angle);
        ctx.strokeStyle = "#5d4028";
        ctx.lineWidth = 2 * scale;
        for (let i = 0; i < 4; i++) {
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(0, -w * 0.35);
            ctx.stroke();
            ctx.rotate(Math.PI / 2);
        }
        ctx.restore();
    }
}

// ═══════════════════════════════════════════════════════════════
//  LEVEL 4 — Gebäude mit sichtbaren Innenräumen
// ═══════════════════════════════════════════════════════════════

function drawBuildingLevel3(ctx, e, sx, sy, cellPx, tick) {
    const bs = getBuildingSize(e);
    const roofColor = BUILDING_ROOF_COLOR[e.type] || "#666";
    const scale = cellPx / CELL;

    const w = bs.w * cellPx;
    const h = bs.h * cellPx;
    const cx = sx + cellPx / 2;
    const cy = sy + cellPx / 2;
    const left = cx - w / 2;
    const top = cy - h / 2;

    // Schatten
    ctx.fillStyle = "rgba(0,0,0,0.2)";
    ctx.fillRect(left + 4 * scale, top + 4 * scale, w, h);

    // Boden / Innenfläche
    ctx.fillStyle = "#d4c4a0";
    ctx.fillRect(left, top, w, h);

    // Außenwände (dicker Rand)
    ctx.strokeStyle = "#3a3020";
    ctx.lineWidth = 3 * scale;
    ctx.strokeRect(left, top, w, h);

    // Innenwände + Einrichtung je Gebäudetyp
    drawInterior(ctx, e, left, top, w, h, scale, tick);

    // Dach-Overlay (semi-transparent, um Innenraum durchscheinen zu lassen)
    ctx.fillStyle = hexWithAlpha(roofColor, 0.25);
    ctx.fillRect(left + 2 * scale, top + 2 * scale, w - 4 * scale, h - 4 * scale);

    // Tür
    ctx.fillStyle = "#5d4028";
    ctx.fillRect(cx - 4 * scale, top + h - 2 * scale, 8 * scale, 2 * scale);
}

function drawInterior(ctx, e, left, top, w, h, scale, tick) {
    const wallColor = "#6e5a3a";
    const furnColor = "#8a7a5a";

    switch (e.type) {
        case TYPE.KEEP: {
            // Thronraum
            ctx.fillStyle = "#b5432e";
            ctx.fillRect(left + w * 0.35, top + h * 0.1, w * 0.3, h * 0.3);
            // Throne
            ctx.fillStyle = "#f2c744";
            ctx.fillRect(left + w * 0.42, top + h * 0.15, w * 0.16, h * 0.12);
            // Innenwand
            ctx.strokeStyle = wallColor;
            ctx.lineWidth = 2 * scale;
            ctx.beginPath();
            ctx.moveTo(left, top + h * 0.45);
            ctx.lineTo(left + w * 0.3, top + h * 0.45);
            ctx.moveTo(left + w * 0.7, top + h * 0.45);
            ctx.lineTo(left + w, top + h * 0.45);
            ctx.stroke();
            // Tisch
            ctx.fillStyle = furnColor;
            ctx.fillRect(left + w * 0.2, top + h * 0.55, w * 0.6, h * 0.15);
            break;
        }
        case TYPE.HOUSE: {
            // Innenwand (Schlafbereich / Wohnbereich)
            ctx.strokeStyle = wallColor;
            ctx.lineWidth = 2 * scale;
            ctx.beginPath();
            ctx.moveTo(left + w * 0.55, top);
            ctx.lineTo(left + w * 0.55, top + h * 0.6);
            ctx.stroke();
            // Bett
            ctx.fillStyle = "#8a5a3a";
            ctx.fillRect(left + w * 0.65, top + h * 0.1, w * 0.25, h * 0.35);
            ctx.fillStyle = "#c9b28a";
            ctx.fillRect(left + w * 0.67, top + h * 0.12, w * 0.21, h * 0.15);
            // Tisch
            ctx.fillStyle = furnColor;
            ctx.fillRect(left + w * 0.1, top + h * 0.15, w * 0.3, h * 0.2);
            // Herd
            ctx.fillStyle = "#4a3826";
            ctx.fillRect(left + w * 0.1, top + h * 0.65, w * 0.2, h * 0.2);
            ctx.fillStyle = "#d92626";
            ctx.beginPath();
            ctx.arc(left + w * 0.2, top + h * 0.75, 3 * scale, 0, Math.PI * 2);
            ctx.fill();
            break;
        }
        case TYPE.FARM: {
            // Furchen
            ctx.strokeStyle = "#5a3f25";
            ctx.lineWidth = 1.5 * scale;
            for (let i = 0; i < 5; i++) {
                const fy = top + h * (0.15 + i * 0.15);
                ctx.beginPath();
                ctx.moveTo(left + w * 0.05, fy);
                ctx.lineTo(left + w * 0.95, fy);
                ctx.stroke();
            }
            // Pflanzen
            ctx.fillStyle = "#4a9e4e";
            for (let i = 0; i < 5; i++) {
                for (let j = 0; j < 4; j++) {
                    ctx.beginPath();
                    ctx.arc(
                        left + w * (0.15 + j * 0.22),
                        top + h * (0.12 + i * 0.15) + Math.sin(tick * 0.06 + i + j) * scale,
                        2 * scale, 0, Math.PI * 2
                    );
                    ctx.fill();
                }
            }
            break;
        }
        case TYPE.TAVERN: {
            // Bar
            ctx.fillStyle = "#5d4028";
            ctx.fillRect(left + w * 0.1, top + h * 0.15, w * 0.8, h * 0.1);
            // Tische
            ctx.fillStyle = furnColor;
            ctx.fillRect(left + w * 0.15, top + h * 0.45, w * 0.25, h * 0.2);
            ctx.fillRect(left + w * 0.55, top + h * 0.45, w * 0.25, h * 0.2);
            // Fässer
            ctx.fillStyle = "#6e4f30";
            ctx.beginPath();
            ctx.arc(left + w * 0.85, top + h * 0.2, 3 * scale, 0, Math.PI * 2);
            ctx.arc(left + w * 0.85, top + h * 0.35, 3 * scale, 0, Math.PI * 2);
            ctx.fill();
            break;
        }
        case TYPE.TEMPLE: {
            // Altarbereich
            ctx.fillStyle = "#e8e2d2";
            ctx.fillRect(left + w * 0.3, top + h * 0.1, w * 0.4, h * 0.25);
            // Goldener Altar
            ctx.fillStyle = "#f2c744";
            ctx.fillRect(left + w * 0.4, top + h * 0.15, w * 0.2, h * 0.1);
            // Glow
            const glow = 0.3 + Math.sin(tick * 0.08) * 0.2;
            ctx.fillStyle = `rgba(250,200,50,${glow})`;
            ctx.beginPath();
            ctx.arc(left + w * 0.5, top + h * 0.2, 8 * scale, 0, Math.PI * 2);
            ctx.fill();
            // Bänke
            ctx.fillStyle = furnColor;
            for (let i = 0; i < 3; i++) {
                ctx.fillRect(left + w * 0.15, top + h * (0.5 + i * 0.13), w * 0.7, h * 0.06);
            }
            break;
        }
        case TYPE.BARRACKS: {
            // Waffenständer
            ctx.fillStyle = "#8a8578";
            ctx.fillRect(left + w * 0.05, top + h * 0.1, w * 0.15, h * 0.8);
            // Waffen
            ctx.strokeStyle = "#b8b2a4";
            ctx.lineWidth = 1.5 * scale;
            for (let i = 0; i < 4; i++) {
                ctx.beginPath();
                ctx.moveTo(left + w * 0.12, top + h * (0.15 + i * 0.18));
                ctx.lineTo(left + w * 0.12, top + h * (0.28 + i * 0.18));
                ctx.stroke();
            }
            // Trainingsplatz
            ctx.fillStyle = "#a08060";
            ctx.fillRect(left + w * 0.3, top + h * 0.2, w * 0.55, h * 0.6);
            // Strohpuppe
            ctx.fillStyle = "#c9a83c";
            ctx.beginPath();
            ctx.arc(left + w * 0.58, top + h * 0.45, 4 * scale, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillRect(left + w * 0.56, top + h * 0.5, 4 * scale, 10 * scale);
            break;
        }
        case TYPE.LUMBER: {
            // Holzstapel
            ctx.fillStyle = "#8a6238";
            for (let i = 0; i < 3; i++) {
                ctx.fillRect(left + w * 0.1, top + h * (0.15 + i * 0.22), w * 0.35, h * 0.14);
            }
            // Sägebock
            ctx.strokeStyle = "#5d4028";
            ctx.lineWidth = 2 * scale;
            ctx.beginPath();
            ctx.moveTo(left + w * 0.65, top + h * 0.2);
            ctx.lineTo(left + w * 0.8, top + h * 0.5);
            ctx.moveTo(left + w * 0.8, top + h * 0.2);
            ctx.lineTo(left + w * 0.65, top + h * 0.5);
            ctx.stroke();
            break;
        }
        case TYPE.QUARRY: {
            // Grube
            ctx.fillStyle = "#3d3a34";
            ctx.beginPath();
            ctx.ellipse(left + w * 0.5, top + h * 0.5, w * 0.3, h * 0.25, 0, 0, Math.PI * 2);
            ctx.fill();
            // Steinhaufen
            ctx.fillStyle = "#8a867c";
            ctx.beginPath();
            ctx.arc(left + w * 0.2, top + h * 0.3, 3 * scale, 0, Math.PI * 2);
            ctx.arc(left + w * 0.15, top + h * 0.4, 2.5 * scale, 0, Math.PI * 2);
            ctx.fill();
            break;
        }
        case TYPE.MILL: {
            // Mühlstein
            ctx.fillStyle = "#8a867c";
            ctx.beginPath();
            ctx.arc(left + w * 0.5, top + h * 0.5, w * 0.2, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = "#5d4028";
            ctx.lineWidth = 2 * scale;
            ctx.stroke();
            // Mehlsäcke
            ctx.fillStyle = "#e8dcc0";
            ctx.fillRect(left + w * 0.1, top + h * 0.7, w * 0.2, h * 0.15);
            ctx.fillRect(left + w * 0.35, top + h * 0.7, w * 0.2, h * 0.15);
            break;
        }
        case TYPE.STABLE: {
            // Boxen
            ctx.strokeStyle = wallColor;
            ctx.lineWidth = 2 * scale;
            ctx.beginPath();
            ctx.moveTo(left + w * 0.5, top);
            ctx.lineTo(left + w * 0.5, top + h);
            ctx.stroke();
            // Heu
            ctx.fillStyle = "#e0c050";
            ctx.fillRect(left + w * 0.05, top + h * 0.6, w * 0.4, h * 0.2);
            ctx.fillRect(left + w * 0.55, top + h * 0.6, w * 0.4, h * 0.2);
            break;
        }
        case TYPE.TOWER: {
            // Compact guard platform, ladder and parapet.
            ctx.fillStyle = "#817b70";
            ctx.fillRect(left + w * 0.18, top + h * 0.12, w * 0.64, h * 0.76);
            ctx.strokeStyle = "#423d34";
            ctx.lineWidth = 2 * scale;
            ctx.strokeRect(left + w * 0.18, top + h * 0.12, w * 0.64, h * 0.76);
            ctx.strokeStyle = "#d6c8a6";
            ctx.lineWidth = 1.2 * scale;
            for (let i = 0; i < 4; i++) {
                const x = left + w * (0.29 + i * 0.14);
                ctx.beginPath();
                ctx.moveTo(x, top + h * 0.18);
                ctx.lineTo(x, top + h * 0.34);
                ctx.stroke();
            }
            ctx.fillStyle = "#b94c3e";
            ctx.fillRect(left + w * 0.46, top + h * 0.48, w * 0.08, h * 0.25);
            break;
        }
        case TYPE.WALL: {
            // Stone walkway and evenly spaced crenellations.
            ctx.fillStyle = "#938b7d";
            ctx.fillRect(left, top + h * 0.26, w, h * 0.48);
            ctx.fillStyle = "#c1b8a7";
            for (let i = 0; i < 5; i++) {
                ctx.fillRect(left + w * (0.04 + i * 0.2), top + h * 0.12, w * 0.12, h * 0.26);
            }
            ctx.fillStyle = "#554e44";
            ctx.fillRect(left + w * 0.04, top + h * 0.68, w * 0.92, h * 0.07);
            break;
        }
        case TYPE.WONDER: {
            // Monument chamber and central relic.
            ctx.fillStyle = "#b9a16b";
            ctx.fillRect(left + w * 0.24, top + h * 0.2, w * 0.52, h * 0.62);
            ctx.fillStyle = "#f1d17d";
            ctx.beginPath();
            ctx.moveTo(left + w * 0.5, top + h * 0.27);
            ctx.lineTo(left + w * 0.68, top + h * 0.55);
            ctx.lineTo(left + w * 0.5, top + h * 0.76);
            ctx.lineTo(left + w * 0.32, top + h * 0.55);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = "#fff0c0";
            ctx.lineWidth = 2 * scale;
            ctx.stroke();
            break;
        }
        default: {
            // Generischer Innenraum
            ctx.fillStyle = furnColor;
            ctx.fillRect(left + w * 0.2, top + h * 0.3, w * 0.6, h * 0.15);
            break;
        }
    }
}

// ═══════════════════════════════════════════════════════════════
//  PERSONEN — Aktivitäts-Icons in den Zoom-Stufen 3 und 4
// ═══════════════════════════════════════════════════════════════

function drawPersonDot(ctx, e, sx, sy, cellPx, overrideColor) {
    const scale = cellPx / CELL;
    const color = overrideColor || ROLE_COLORS[e.type] || "#aaa";
    const radius = Math.max(2, 3.5 * scale);

    const px = sx + cellPx / 2;
    const py = sy + cellPx / 2;

    ctx.fillStyle = "#111";
    ctx.beginPath();
    ctx.arc(px, py, radius + 1, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(px, py, radius, 0, Math.PI * 2);
    ctx.fill();
}

function drawPersonMiniature(ctx, entity, sx, sy, cellPx, overrideColor) {
    const scale = cellPx / CELL;
    const px = sx + cellPx / 2;
    const py = sy + cellPx / 2;
    const color = overrideColor || ROLE_COLORS[entity.type] || "#91a58f";
    const radius = Math.max(1.1, 2.2 * scale);
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.ellipse(px + 0.5 * scale, py + 2 * scale, radius * 1.25, radius * 0.75, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(px, py + 1.2 * scale, radius * 0.8, radius * 1.35, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#e1c9a0";
    ctx.beginPath();
    ctx.arc(px, py - radius * 0.9, Math.max(0.9, radius * 0.42), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

function drawPersonRoleIcon(ctx, e, sx, sy, cellPx) {
    const px = sx + cellPx / 2;
    const py = sy + cellPx / 2;
    const radius = Math.max(5, Math.min(10, cellPx * 0.34));
    ctx.save();
    ctx.fillStyle = "rgba(9,15,17,0.92)";
    ctx.beginPath(); ctx.arc(px, py, radius + 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = ROLE_COLORS[e.type] || "#65756b";
    ctx.beginPath(); ctx.arc(px, py, radius, 0, Math.PI * 2); ctx.fill();
    ctx.font = Math.max(8, Math.min(13, cellPx * 0.54)) + "px \"Apple Color Emoji\",\"Segoe UI Emoji\",sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(getEmoji(e), px, py + 0.5);
    ctx.restore();
}

function drawPersonIcon(ctx, e, sx, sy, cellPx, tick) {
    if (state.zoomLevel >= 4) {
        drawPersonTopDown(ctx, e, sx, sy, cellPx);
        return;
    }

    const scale = cellPx / CELL;
    const now = performance.now() / 1000;
    const speed = Math.hypot(e.velocityX || 0, e.velocityY || 0);
    const isMoving = speed > 0.05;
    const isWorking = e.visualState === "work";
    const isFleeing = e.visualState === "flee";

    const baseRadius = (ICON_RADIUS[e.type] || 13) * scale;
    const badgeColor = ROLE_COLORS[e.type] || "#52525b";
    const emoji = getEmoji(e);

    const walkCycle = Math.sin(now * 10 + e.anim);
    const bobAmount = isMoving ? walkCycle * 2.5 * scale : Math.sin(now * 2 + e.anim) * 0.6 * scale;
    const lean = isMoving ? Math.max(-0.15, Math.min(0.15, (e.velocityX || 0) * 0.06)) : 0;

    const px = sx + cellPx / 2;
    const py = sy + cellPx / 2;

    ctx.save();
    ctx.translate(px, py - 4 * scale + bobAmount);
    ctx.rotate(lean);

    // Schatten
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(1 * scale, baseRadius + 4 * scale, baseRadius * 0.85, 3 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // Ring
    const statusColor = isFleeing ? "#ef4444" : isWorking ? "#f59e0b" : badgeColor;
    ctx.fillStyle = "#111";
    ctx.beginPath();
    ctx.arc(0, 0, baseRadius + 2 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = statusColor;
    ctx.beginPath();
    ctx.arc(0, 0, baseRadius, 0, Math.PI * 2);
    ctx.fill();

    // Badge
    ctx.fillStyle = isWorking ? lightenColor(badgeColor, 0.25) : badgeColor;
    ctx.beginPath();
    ctx.arc(0, 0, baseRadius - 1.5 * scale, 0, Math.PI * 2);
    ctx.fill();

    // Glanz
    ctx.fillStyle = "rgba(255,255,255,0.14)";
    ctx.beginPath();
    ctx.ellipse(-baseRadius * 0.25, -baseRadius * 0.35, baseRadius * 0.45, baseRadius * 0.3, -0.4, 0, Math.PI * 2);
    ctx.fill();

    // Emoji
    const fontSize = Math.max(8, Math.round(baseRadius * 1.2));
    ctx.font = `${fontSize}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(emoji, 0, 1 * scale);

    // Füße
    if (isMoving) {
        ctx.fillStyle = "#1a1410";
        ctx.beginPath();
        ctx.ellipse(-3 * scale + walkCycle * 2.5 * scale, baseRadius + 2 * scale, 3 * scale, 1.8 * scale, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(3 * scale - walkCycle * 2.5 * scale, baseRadius + 2 * scale, 3 * scale, 1.8 * scale, 0, 0, Math.PI * 2);
        ctx.fill();
    }

    // Krone
    if (e.isKing) {
        ctx.fillStyle = "#f2c744";
        const crownY = -baseRadius - 6 * scale;
        ctx.beginPath();
        ctx.moveTo(-5 * scale, crownY + 4 * scale);
        ctx.lineTo(-5 * scale, crownY);
        ctx.lineTo(-2 * scale, crownY + 3 * scale);
        ctx.lineTo(0, crownY - 2 * scale);
        ctx.lineTo(2 * scale, crownY + 3 * scale);
        ctx.lineTo(5 * scale, crownY);
        ctx.lineTo(5 * scale, crownY + 4 * scale);
        ctx.closePath();
        ctx.fill();
    }

    ctx.restore();
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
}

function drawPersonTopDown(ctx, entity, sx, sy, cellPx) {
    const scale = cellPx / CELL;
    const speed = Math.hypot(entity.velocityX || 0, entity.velocityY || 0);
    const moving = speed > 0.05;
    const now = performance.now() / 1000;
    const gait = moving ? Math.sin(now * 13 + entity.anim) : 0;
    const bodyColor = ROLE_COLORS[entity.type] || "#647b68";
    const rotation = moving ? Math.atan2(entity.velocityY, entity.velocityX) + Math.PI / 2 : 0;
    const px = sx + cellPx / 2;
    const py = sy + cellPx / 2;

    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(rotation);

    // Ground shadow.
    ctx.fillStyle = "rgba(0, 0, 0, 0.32)";
    ctx.beginPath();
    ctx.ellipse(1 * scale, 2 * scale, 5.8 * scale, 9 * scale, 0, 0, Math.PI * 2);
    ctx.fill();

    // Torso.
    ctx.fillStyle = "#171d1b";
    ctx.beginPath();
    ctx.ellipse(0, 0.6 * scale, 5.2 * scale, 7.2 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = bodyColor;
    ctx.beginPath();
    ctx.ellipse(0, 0, 4.1 * scale, 6.1 * scale, 0, 0, Math.PI * 2);
    ctx.fill();

    // Arms.
    ctx.strokeStyle = entity.visualState === "work" ? "#d4aa68" : "#cdbb9d";
    ctx.lineWidth = Math.max(1.2, 1.8 * scale);
    ctx.beginPath();
    ctx.moveTo(-3.4 * scale, -1.4 * scale);
    ctx.lineTo(-6.1 * scale, 1.2 * scale - stride * 0.24);
    ctx.moveTo(3.4 * scale, -1.4 * scale);
    ctx.lineTo(6.1 * scale, 1.2 * scale + stride * 0.24);
    ctx.stroke();

    // Head and hair.
    ctx.fillStyle = "#e4c7a1";
    ctx.beginPath();
    ctx.arc(0, -5.8 * scale, 3.5 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#513c2c";
    ctx.beginPath();
    ctx.arc(0, -7.1 * scale, 3.3 * scale, Math.PI, Math.PI * 2);
    ctx.fill();

    // Small profession marker.
    ctx.fillStyle = "rgba(13, 20, 20, 0.92)";
    ctx.beginPath();
    ctx.arc(7.1 * scale, -7.5 * scale, 4.6 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = `${Math.max(7, 8 * scale)}px "Apple Color Emoji","Segoe UI Emoji",sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(getEmoji(entity), 7.1 * scale, -7.5 * scale);

    if (entity.isKing) {
        ctx.fillStyle = "#f2c744";
        ctx.beginPath();
        ctx.moveTo(-3 * scale, -10.2 * scale);
        ctx.lineTo(-2.5 * scale, -14 * scale);
        ctx.lineTo(0, -11.4 * scale);
        ctx.lineTo(2.5 * scale, -14 * scale);
        ctx.lineTo(3 * scale, -10.2 * scale);
        ctx.closePath();
        ctx.fill();
    }

    ctx.restore();
}

function drawEnemyIcon(ctx, e, sx, sy, cellPx, tick) {
    const emoji = e.type === TYPE.GOBLIN ? "👺" : e.type === TYPE.ORC ? "👹" : "🧌";
    const color = ROLE_COLORS[e.type] || "#6b2c2c";
    drawPersonIconGeneric(ctx, e, sx, sy, cellPx, tick, emoji, color);
}

function drawPersonIconGeneric(ctx, e, sx, sy, cellPx, tick, emoji, color) {
    const scale = cellPx / CELL;
    const now = performance.now() / 1000;
    const speed = Math.hypot(e.velocityX || 0, e.velocityY || 0);
    const isMoving = speed > 0.05;

    const baseRadius = (ICON_RADIUS[e.type] || 12) * scale;
    const bob = isMoving ? Math.sin(now * 9 + e.anim) * 2.5 * scale : Math.sin(now * 2 + e.anim) * 0.7 * scale;

    const px = sx + cellPx / 2;
    const py = sy + cellPx / 2;

    ctx.save();
    ctx.translate(px, py - 4 * scale + bob);

    ctx.globalAlpha = 0.3;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(1 * scale, baseRadius + 4 * scale, baseRadius * 0.8, 3 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.fillStyle = "#111";
    ctx.beginPath();
    ctx.arc(0, 0, baseRadius + 2 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, 0, baseRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = lightenColor(color, 0.2);
    ctx.beginPath();
    ctx.arc(0, 0, baseRadius - 1.5 * scale, 0, Math.PI * 2);
    ctx.fill();

    const fontSize = Math.max(8, Math.round(baseRadius * 1.15));
    ctx.font = `${fontSize}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(emoji, 0, 1 * scale);

    if (isMoving) {
        const step = Math.sin(now * 10 + e.anim);
        ctx.fillStyle = "#1a1410";
        ctx.beginPath();
        ctx.ellipse(-2 * scale + step * 2 * scale, baseRadius + 1.5 * scale, 2.5 * scale, 1.5 * scale, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(2 * scale - step * 2 * scale, baseRadius + 1.5 * scale, 2.5 * scale, 1.5 * scale, 0, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.restore();
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
}

// ═══════════════════════════════════════════════════════════════
//  EMOJI & FARB-HILFSFUNKTIONEN
// ═══════════════════════════════════════════════════════════════

function getEmoji(entity) {
    if (entity.isKing) return JOB_ICONS.king;
    if (entity.type === TYPE.GUARD)  return JOB_ICONS.guard;
    if (entity.type === TYPE.ARCHER) return JOB_ICONS.archer;
    if (entity.type === TYPE.KNIGHT) return JOB_ICONS.knight;
    if (entity.type === TYPE.PRIEST) return JOB_ICONS.priest;
    if (entity.type === TYPE.VILLAGER) return JOB_ICONS[entity.job] || JOB_ICONS.wanderer;
    return JOB_ICONS.idle;
}

function lightenColor(hex, amount) {
    if (hex.startsWith("rgb")) return hex;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgb(${Math.min(255, r + Math.floor((255 - r) * amount))},${Math.min(255, g + Math.floor((255 - g) * amount))},${Math.min(255, b + Math.floor((255 - b) * amount))})`;
}

function darkenColor(hex, amount) {
    if (hex.startsWith("rgb")) return hex;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgb(${Math.max(0, Math.floor(r * (1 - amount)))},${Math.max(0, Math.floor(g * (1 - amount)))},${Math.max(0, Math.floor(b * (1 - amount)))})`;
}

function hexWithAlpha(hex, alpha) {
    if (hex.startsWith("rgb")) return hex.replace("rgb", "rgba").replace(")", `,${alpha})`);
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
}
