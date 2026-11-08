// Screen-space time-of-day light for the map.
//
// The realm already has a seasonal sun in the WebGL ground shader. This module
// adds the missing daily phase: dawn warmth, neutral noon, dusk warmth and a
// cool night veil. It is presentation-only and deliberately does not rebuild
// the terrain cache when the clock moves.

const HOURS_PER_DAY = 24;
const TWO_PI = Math.PI * 2;

const clamp01 = value => Math.max(0, Math.min(1, value));

export function normalizeTimeOfDay(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 12;
    return ((number % HOURS_PER_DAY) + HOURS_PER_DAY) % HOURS_PER_DAY;
}

export function formatTimeOfDay(value) {
    const hour = normalizeTimeOfDay(value);
    const whole = Math.floor(hour);
    const minutes = Math.floor((hour - whole) * 60);
    return String(whole).padStart(2, "0") + ":" + String(minutes).padStart(2, "0");
}

// A smooth solar altitude: 0 at 06:00/18:00, +1 at noon, -1 at midnight.
export function daylightState(value, season = "summer") {
    const hour = normalizeTimeOfDay(value);
    const altitude = Math.sin(((hour - 6) / HOURS_PER_DAY) * TWO_PI);
    const daylight = clamp01(altitude * 1.25);
    const night = clamp01((-altitude - 0.08) / 0.72);
    const winter = season === "winter" ? 1.18 : season === "summer" ? 0.9 : 1;
    const dawn = hour >= 4 && hour < 12;
    const dusk = hour >= 12 && hour < 21;
    let phase = "day";
    let color = "#13233d";
    let alpha = 0;

    if (altitude < -0.15) {
        phase = "night";
        color = "#13233d";
        alpha = night * 0.34 * winter;
    } else if (dawn && altitude < 0.35) {
        phase = "dawn";
        color = "#c77b42";
        alpha = 0.10 + (1 - altitude / 0.35) * 0.13;
    } else if (dusk && altitude < 0.35) {
        phase = "dusk";
        color = "#b75f35";
        alpha = 0.10 + (1 - altitude / 0.35) * 0.15;
    }

    return {
        hour,
        phase,
        altitude,
        daylight,
        night,
        alpha: clamp01(alpha),
        color,
        season,
    };
}

function rgba(hex, alpha) {
    const raw = String(hex).replace("#", "");
    const r = parseInt(raw.slice(0, 2), 16) || 0;
    const g = parseInt(raw.slice(2, 4), 16) || 0;
    const b = parseInt(raw.slice(4, 6), 16) || 0;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// A single solar vector drives the canopy shafts, tree shadows and the WebGL
// shadow march. The sun rises in the east at 06:00, crosses south at noon and
// sets west at 18:00; its seasonal height still comes from the calendar.
export function solarVector(value, season = "summer") {
    const hour = normalizeTimeOfDay(value);
    const dayAltitude = Math.sin(((hour - 6) / HOURS_PER_DAY) * TWO_PI);
    const seasonal = season === "winter" ? 0.5 : season === "summer" ? 0.82 : 0.65;
    const elevation = Math.max(0.12, Math.min(1.18, seasonal + dayAltitude * 0.38));
    const azimuth = ((hour - 6) / 12) * Math.PI;
    const x = Math.cos(azimuth) * Math.cos(elevation);
    const y = Math.sin(azimuth) * Math.cos(elevation);
    const z = Math.sin(elevation);
    const length = Math.hypot(x, y) || 1;
    const tan = Math.tan(elevation);
    return {
        hour, elevation, azimuth,
        direction: [x, y, z],
        shadowX: -x / length,
        shadowY: -y / length,
        step: Math.max(0.55, Math.min(3, 1.05 / Math.max(0.25, tan))),
    };
}

// Morning ground mist is a weather/soil state, not a constant decoration. It
// peaks shortly after dawn over damp stands and fades before noon; rain and fog
// extend it, while a dry summer wood has almost none.
export function forestMistFactor(value, moisture = 0.55, season = "summer", weather = "clear") {
    const hour = normalizeTimeOfDay(value);
    const morning = clamp01(1 - Math.abs(hour - 7.2) / 4.2);
    if (morning <= 0) return 0;
    const wet = clamp01((Number(moisture) - 0.34) / 0.46);
    const weatherName = String(weather || "clear").toLowerCase();
    const weatherBoost = weatherName === "fog" ? 0.48 : weatherName === "rain" || weatherName === "storm" ? 0.3 : weatherName === "overcast" ? 0.16 : 0;
    const seasonal = season === "winter" ? 0.7 : season === "autumn" ? 1.12 : season === "spring" ? 1.06 : 0.82;
    return clamp01((morning * 0.72 + weatherBoost) * (0.22 + wet * 0.88) * seasonal);
}

export function drawDaylightOverlay(ctx, canvas, value, season = "summer") {
    if (!ctx || !canvas) return false;
    const light = daylightState(value, season);
    if (light.alpha <= 0.004) return false;
    const width = Number(canvas.width) || 0;
    const height = Number(canvas.height) || 0;
    if (width < 2 || height < 2) return false;

    ctx.save();
    if (light.phase === "dawn" || light.phase === "dusk") {
        // Warm the side the sun is on, not the whole view evenly. This keeps the
        // dawn/dusk wash tied to the same solar direction as the cast shadows.
        const sun = solarVector(value, season);
        const fromLeft = sun.shadowX > 0;
        const gradient = ctx.createLinearGradient(fromLeft ? 0 : width, 0, fromLeft ? width : 0, height * 0.55);
        gradient.addColorStop(0, rgba(light.color, light.alpha));
        gradient.addColorStop(0.55, rgba(light.color, light.alpha * 0.55));
        gradient.addColorStop(1, rgba(light.color, light.alpha * 0.18));
        ctx.fillStyle = gradient;
    } else {
        ctx.fillStyle = rgba(light.color, light.alpha);
    }
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
    return true;
}
