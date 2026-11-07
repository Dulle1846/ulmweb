// Screen-space weather for the map layer.
//
// The simulation has three weather states (clear, rain, snow). The ground
// palette reacts to them, but without a screen overlay a snowfall read as a
// slightly cooler green rather than as weather. This module draws drifting
// flakes or angled rain streaks over the composed map, using deterministic
// positions so the same instant always produces the same frame.
//
// It is presentation-only and never mutates state.

import { state } from '../../core/state.js';

const SNOW_COUNT = 170;
const RAIN_COUNT = 160;

const fract = value => value - Math.floor(value);

// Cheap deterministic hash so flakes do not need a stored particle array.
function hash(index) {
    const value = Math.sin(index * 127.1 + 311.7) * 43758.5453;
    return fract(value);
}

export function weatherKind(weather) {
    const value = String(weather || '').toLowerCase();
    if (value === 'snow') return 'snow';
    if (value === 'rain') return 'rain';
    return 'clear';
}

// Normalised particle positions in 0..1, animated by the given time in
// seconds. Exported so the motion can be unit tested without a canvas.
export function weatherParticles(time, kind, count) {
    const seconds = Number(time) || 0;
    const total = Math.max(1, Math.floor(count));
    const result = [];
    for (let index = 0; index < total; index++) {
        const seed = hash(index + (kind === 'rain' ? 4000 : 0));
        const speed = kind === 'rain' ? 0.55 + seed * 0.55 : 0.035 + seed * 0.055;
        const drift = kind === 'rain' ? 0.10 + seed * 0.06 : 0.02 + seed * 0.04;
        const sway = kind === 'snow' ? Math.sin(seconds * 0.7 + index) * 0.012 : 0;
        result.push({
            x: fract(seed * 5.3 + seconds * (drift * 0.35) + sway),
            y: fract(seed * 9.7 + seconds * speed),
            size: 0.6 + seed * (kind === 'rain' ? 1.4 : 2.2),
            alpha: 0.35 + seed * 0.55,
        });
    }
    return result;
}

export function drawWeatherOverlay(ctx, canvas, time = performance.now() / 1000) {
    const kind = weatherKind(state.weather);
    if (!ctx || !canvas || kind === 'clear') return false;
    const width = Number(canvas.width) || 0;
    const height = Number(canvas.height) || 0;
    if (width < 2 || height < 2) return false;

    const unit = Math.max(0.75, Math.min(2.4, width / 960));
    ctx.save();
    if (kind === 'snow') {
        // A faint cold veil makes the whole layout read as a snowy day.
        ctx.fillStyle = 'rgba(214, 233, 248, 0.10)';
        ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = '#eef7ff';
        for (const flake of weatherParticles(time, 'snow', SNOW_COUNT)) {
            ctx.globalAlpha = flake.alpha;
            ctx.beginPath();
            ctx.arc(flake.x * width, flake.y * height, flake.size * unit * 1.05, 0, Math.PI * 2);
            ctx.fill();
        }
    } else {
        ctx.fillStyle = 'rgba(36, 58, 72, 0.10)';
        ctx.fillRect(0, 0, width, height);
        ctx.strokeStyle = 'rgba(184, 214, 232, 0.55)';
        ctx.lineWidth = Math.max(1, unit * 0.7);
        for (const drop of weatherParticles(time, 'rain', RAIN_COUNT)) {
            const x = drop.x * width;
            const y = drop.y * height;
            const length = (12 + drop.size * 10) * unit;
            ctx.globalAlpha = 0.25 + drop.alpha * 0.45;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x - length * 0.22, y + length);
            ctx.stroke();
        }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    return true;
}
