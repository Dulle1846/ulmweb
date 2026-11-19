// Original, procedural Kings & Cards theme. One calm orchestral-style loop.
let audioContext = null;
let masterGain = null;
let loopTimer = null;
let enabled = true;
let volume = 0.22;
let unlockBound = false;
const activeOscillators = new Set();

const BPM = 82;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;
const CHORDS = [
    [146.83, 174.61, 220.00], // D minor
    [116.54, 146.83, 174.61], // Bb major
    [130.81, 164.81, 196.00], // C major
    [110.00, 130.81, 164.81]  // A minor
];
const MELODY = [
    [587.33, null, 440.00, 392.00, 349.23, null, 392.00, 440.00],
    [523.25, null, 440.00, 392.00, 349.23, null, 293.66, 349.23],
    [392.00, null, 440.00, 523.25, 587.33, null, 523.25, 440.00],
    [392.00, null, 349.23, 293.66, 261.63, null, 293.66, 349.23]
];

function getContext() {
    if (audioContext && audioContext.state !== "closed") return audioContext;
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return null;
    audioContext = new Context();
    masterGain = audioContext.createGain();
    masterGain.gain.value = volume;
    masterGain.connect(audioContext.destination);
    audioContext.addEventListener("statechange", () => {
        if (audioContext?.state === "running" && enabled && !loopTimer) scheduleLoop();
    });
    return audioContext;
}

function primeContext(context) {
    // iOS/Safari sometimes keeps a freshly resumed context silent until one
    // real buffer has been started inside the gesture. A one-sample silent
    // source is the standard unlock and costs effectively nothing.
    try {
        const buffer = context.createBuffer(1, 1, context.sampleRate || 22050);
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(context.destination);
        source.start(0);
    } catch { /* the context may still resume from its statechange */ }
}

// Browsers that require a user gesture (notably Safari) will leave a context
// created after an awaited warm-up suspended forever. Keep one capture-phase
// listener alive until the context is actually running, so the first real
// click or key press unlocks it instead of silently losing the soundtrack.
function bindUnlock() {
    if (unlockBound || typeof window === "undefined") return;
    unlockBound = true;
    const unlock = () => {
        startSoundtrack().then(ok => {
            if (!ok) return;
            window.removeEventListener("pointerdown", unlock, true);
            window.removeEventListener("keydown", unlock, true);
            window.removeEventListener("touchend", unlock, true);
            unlockBound = false;
        }).catch(() => {});
    };
    window.addEventListener("pointerdown", unlock, true);
    window.addEventListener("keydown", unlock, true);
    window.addEventListener("touchend", unlock, true);
}

function tone(frequency, start, duration, type, gainValue, destination, attack = 0.08) {
    if (!frequency || !audioContext) return;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, gainValue), start + attack);
    gain.gain.setValueAtTime(Math.max(0.0002, gainValue), Math.max(start + attack, start + duration - 0.18));
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(destination);
    activeOscillators.add(oscillator);
    oscillator.addEventListener("ended", () => {
        activeOscillators.delete(oscillator);
        try { oscillator.disconnect(); } catch { /* already disconnected */ }
        try { gain.disconnect(); } catch { /* already disconnected */ }
    });
    oscillator.start(start);
    oscillator.stop(start + duration + 0.03);
}

function scheduleLoop() {
    if (!audioContext || !masterGain || !enabled) return;
    const start = audioContext.currentTime + 0.12;
    for (let bar = 0; bar < 8; bar++) {
        const chord = CHORDS[Math.floor(bar / 2)];
        chord.forEach((frequency, index) => {
            tone(frequency / 2, start + bar * BAR, BAR * 1.92, "triangle", 0.035 - index * 0.004, masterGain, 0.6);
            tone(frequency, start + bar * BAR, BAR * 1.75, "sine", 0.016, masterGain, 0.45);
        });
        const melody = MELODY[Math.floor(bar / 2)];
        melody.forEach((frequency, note) => {
            if (!frequency) return;
            tone(frequency, start + bar * BAR + note * BEAT / 2, BEAT * 0.72, "sine", 0.045, masterGain, 0.025);
        });
    }
    const loopDuration = BAR * 8;
    loopTimer = window.setTimeout(scheduleLoop, Math.max(100, loopDuration * 1000 - 120));
}

export function startSoundtrack() {
    if (!enabled) return Promise.resolve(false);
    const context = getContext();
    if (!context) return Promise.resolve(false);
    if (context.state === "running") {
        if (!loopTimer) scheduleLoop();
        return Promise.resolve(true);
    }
    // Do not await resume(): a blocked context can leave that promise pending
    // forever, which used to swallow every later click and key press. Prime the
    // context, ask it to resume, and let the statechange listener schedule the
    // loop when the browser actually allows playback. Keep the gesture listener
    // installed until then so the next interaction can unlock it.
    primeContext(context);
    bindUnlock();
    context.resume().catch(() => {});
    return Promise.resolve(false);
}

export function stopSoundtrack() {
    if (loopTimer !== null) window.clearTimeout(loopTimer);
    loopTimer = null;
    // Re-enabling immediately used to layer a fresh eight-bar phrase over the
    // still-sounding old one. Stop the scheduled voices so the toggle is a
    // clean restart, not two soundtracks in counterpoint.
    for (const oscillator of activeOscillators) {
        try { oscillator.stop(); } catch { /* already stopped */ }
    }
    activeOscillators.clear();
}

if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) startSoundtrack().catch(() => {});
    });
    window.addEventListener("pageshow", () => { startSoundtrack().catch(() => {}); });
}

export function setMusicEnabled(value) {
    enabled = Boolean(value);
    if (enabled) {
        if (masterGain && audioContext) masterGain.gain.setTargetAtTime(volume, audioContext.currentTime, 0.12);
        startSoundtrack().catch(() => {});
    } else {
        stopSoundtrack();
        if (masterGain && audioContext) masterGain.gain.setTargetAtTime(0, audioContext.currentTime, 0.12);
    }
}

export function setMusicVolume(value) {
    volume = Math.max(0, Math.min(1, Number(value) || 0));
    if (masterGain && audioContext) {
        masterGain.gain.setTargetAtTime(enabled ? volume : 0, audioContext.currentTime, 0.08);
    }
}

export function applySoundtrackSettings(settings) {
    enabled = settings.musicEnabled !== false;
    volume = Math.max(0, Math.min(1, Number(settings.musicVolume ?? 0.22)));
    if (masterGain && audioContext) masterGain.gain.setTargetAtTime(enabled ? volume : 0, audioContext.currentTime, 0.08);
}

export function toggleSoundtrack() {
    setMusicEnabled(!enabled);
    return enabled;
}

export function isSoundtrackEnabled() {
    return enabled;
}
