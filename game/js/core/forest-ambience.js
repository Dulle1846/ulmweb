// 1.2.23.1.256–258 — procedural forest ambience.
//
// Every regional wood gets a filtered noise bed, a deterministic bird/insect
// cue and a short motif played on instruments made from its own trees. All of
// it is synthesised in the browser: no audio files, no network requests and no
// per-frame work. The scheduler runs at a several-second cadence, not on the
// simulation tick.
//
// `forestSoundCue()` is a pure function in the presentation system; this module
// only owns the oscillators, the volume and the subtitle event.
import { forestSoundCue, forestSubtitlesEnabled } from '../systems/forest-presentation.js';

let audioContext = null;
let masterGain = null;
let bedGain = null;
let bedFilter = null;
let bedSource = null;
let bedNoise = null;
let gustOscillator = null;
let gustGain = null;
let cueTimer = 0;
let enabled = true;
let volume = 0.3;
let currentProfile = null;
let currentScene = null;
let lastCue = null;
const cueHistory = [];
let unlockBound = false;
let lastSceneKey = '';
const activeVoices = new Set();

function canUseAudio() {
    return typeof window !== 'undefined'
        && Boolean(window.AudioContext || window.webkitAudioContext);
}

function getContext() {
    if (!canUseAudio()) return null;
    if (audioContext && audioContext.state !== 'closed') return audioContext;
    const Context = window.AudioContext || window.webkitAudioContext;
    audioContext = new Context();
    masterGain = audioContext.createGain();
    masterGain.gain.value = enabled ? volume : 0;
    masterGain.connect(audioContext.destination);
    audioContext.addEventListener('statechange', () => {
        if (audioContext?.state === 'running' && enabled && currentProfile && !cueTimer) {
            buildBed();
            scheduleNextCue(600);
        }
    });
    return audioContext;
}

function bindUnlock() {
    if (unlockBound || typeof window === 'undefined') return;
    unlockBound = true;
    const unlock = () => {
        if (!enabled) return;
        const context = getContext();
        if (!context) return;
        context.resume().then(() => {
            if (audioContext?.state === 'running') {
                window.removeEventListener('pointerdown', unlock, true);
                window.removeEventListener('keydown', unlock, true);
                window.removeEventListener('touchend', unlock, true);
                unlockBound = false;
                if (currentProfile && !cueTimer) {
                    buildBed();
                    scheduleNextCue(500);
                }
            }
        }).catch(() => {});
    };
    window.addEventListener('pointerdown', unlock, true);
    window.addEventListener('keydown', unlock, true);
    window.addEventListener('touchend', unlock, true);
}

function noiseBuffer(seconds = 2, profile = currentProfile) {
    const context = audioContext;
    const length = Math.max(1, Math.floor((context.sampleRate || 22050) * seconds));
    const buffer = context.createBuffer(1, length, context.sampleRate || 22050);
    const data = buffer.getChannelData(0);
    // A seeded LCG makes the bed's grain stable for one regional type, so the
    // same wood does not acquire a different hiss after a reload.
    let seed = 0x2f6e2b1 ^ hashText(profile?.id || 'forest');
    for (let index = 0; index < length; index++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        data[index] = (seed / 0x100000000) * 2 - 1;
    }
    return buffer;
}

function hashText(text) {
    let hash = 2166136261;
    for (let index = 0; index < String(text).length; index++) {
        hash ^= String(text).charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

const BED_FILTERS = Object.freeze({
    'needle-wind': { type: 'bandpass', frequency: 1350, q: 0.8, gain: 0.055 },
    'emergent-hum': { type: 'lowpass', frequency: 560, q: 0.55, gain: 0.05 },
    'broadleaf-rustle': { type: 'bandpass', frequency: 760, q: 0.55, gain: 0.06 },
    'dry-leaves': { type: 'highpass', frequency: 2200, q: 0.5, gain: 0.035 },
    'coastal-fog': { type: 'lowpass', frequency: 460, q: 0.4, gain: 0.06 },
    'river-reed': { type: 'bandpass', frequency: 1750, q: 0.45, gain: 0.04 },
    'dry-grass': { type: 'highpass', frequency: 2600, q: 0.4, gain: 0.03 },
    'savanna-hum': { type: 'bandpass', frequency: 950, q: 0.5, gain: 0.045 },
    'mangrove-water': { type: 'lowpass', frequency: 320, q: 0.5, gain: 0.055 },
    'bamboo-clatter': { type: 'bandpass', frequency: 2100, q: 0.9, gain: 0.032 },
    'bog-wind': { type: 'lowpass', frequency: 400, q: 0.5, gain: 0.06 },
    'heath-wind': { type: 'bandpass', frequency: 1200, q: 0.4, gain: 0.04 },
});

function stopBed() {
    try { bedSource?.stop(); } catch { /* already stopped */ }
    try { gustOscillator?.stop(); } catch { /* already stopped */ }
    try { bedSource?.disconnect(); } catch { /* already disconnected */ }
    try { gustOscillator?.disconnect(); } catch { /* already disconnected */ }
    try { gustGain?.disconnect(); } catch { /* already disconnected */ }
    try { bedFilter?.disconnect(); } catch { /* already disconnected */ }
    try { bedGain?.disconnect(); } catch { /* already disconnected */ }
    bedSource = null;
    gustOscillator = null;
    gustGain = null;
    bedFilter = null;
    bedGain = null;
    bedNoise = null;
}

function buildBed() {
    const context = audioContext;
    if (!context || !masterGain || !enabled || !currentProfile) return;
    stopBed();
    const sound = currentProfile.sound || {};
    const settings = BED_FILTERS[sound.bed] || BED_FILTERS['broadleaf-rustle'];
    const silence = Math.max(0, Math.min(1, Number(sound.silence) || 0));
    const density = Math.max(0.1, Math.min(1, Number(sound.density) || 0.5));
    const weather = String(currentScene?.weather || 'clear').toLowerCase();
    const weatherGain = weather === 'storm' ? 1.7 : weather === 'rain' ? 1.28 : weather === 'snow' ? 0.72 : 1;

    bedNoise = noiseBuffer(2);
    bedSource = context.createBufferSource();
    bedSource.buffer = bedNoise;
    bedSource.loop = true;

    bedFilter = context.createBiquadFilter();
    bedFilter.type = settings.type;
    bedFilter.frequency.value = settings.frequency;
    bedFilter.Q.value = settings.q;

    bedGain = context.createGain();
    const base = settings.gain * density * weatherGain * (1 - silence * 0.82);
    bedGain.gain.value = Math.max(0.0001, base);

    bedSource.connect(bedFilter);
    bedFilter.connect(bedGain);
    bedGain.connect(masterGain);

    // A very slow gust modulator keeps the bed from sounding like a flat hiss.
    gustOscillator = context.createOscillator();
    gustOscillator.type = 'sine';
    gustOscillator.frequency.value = 0.055 + (currentProfile.wind?.gust || 0.6) * 0.05;
    gustGain = context.createGain();
    gustGain.gain.value = Math.max(0.0001, base * 0.42);
    gustOscillator.connect(gustGain);
    gustGain.connect(bedGain.gain);
    gustOscillator.start();
    bedSource.start();
}

function tone(frequency, start, duration, type, gainValue, destination, glide = 0) {
    if (!frequency || !audioContext || !destination) return;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    if (glide) oscillator.frequency.exponentialRampToValueAtTime(Math.max(40, frequency + glide), start + duration * 0.72);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, gainValue), start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(destination);
    activeVoices.add(oscillator);
    oscillator.addEventListener('ended', () => {
        activeVoices.delete(oscillator);
        try { oscillator.disconnect(); } catch { /* already disconnected */ }
        try { gain.disconnect(); } catch { /* already disconnected */ }
    });
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
}

function playBird(bird) {
    const context = audioContext;
    if (!context || !masterGain) return;
    const now = context.currentTime + 0.05;
    const high = /owl/.test(bird) ? 420 : /capercaillie/.test(bird) ? 190 : /toucan|macaw|hornbill/.test(bird) ? 620 : 1900;
    const notes = /owl/.test(bird) ? [2, 1, 1] : /woodpecker/.test(bird) ? [1, 1, 1, 1] : [2, 3, 2];
    for (let index = 0; index < notes.length; index++) {
        const base = high * (notes[index] === 1 ? 1 : notes[index] === 2 ? 1.18 : 0.82);
        tone(base, now + index * 0.16, 0.12, /owl/.test(bird) ? 'sine' : 'triangle', 0.035, masterGain, /owl/.test(bird) ? -60 : 240);
    }
}

function playInsect() {
    const context = audioContext;
    if (!context || !masterGain) return;
    const now = context.currentTime + 0.05;
    for (let index = 0; index < 3; index++) {
        tone(150 + index * 12, now + index * 0.11, 0.09, 'sawtooth', 0.012, masterGain, 30);
    }
}

function playInstrument(instrument, profile = currentProfile, scene = currentScene) {
    const context = audioContext;
    if (!context || !masterGain) return;
    const now = context.currentTime + 0.05;
    // The regional mode is real: a spruce wood improvises in Dorian, an oak
    // wood in Ionian, a savanna wood on a pentatonic. The motif is a stable
    // three-note phrase, not a fresh random walk every time it is heard.
    const degrees = profile?.sound?.scale?.degrees || [0, 2, 4, 5, 7, 9, 11];
    const motif = profile?.sound?.motif || [0, 2, 4];
    const seed = hashText((profile?.id || 'wood') + ':' + (scene?.season || 'summer'));
    const rootIndex = seed % degrees.length;
    const root = 196 * Math.pow(2, (degrees[rootIndex] || 0) / 12);
    const brightness = Number(instrument?.brightness) || 0.6;
    const decay = 0.8 + (Number(instrument?.decay) || 0.5) * 1.2;
    const overtone = Number(instrument?.overtone) || 0.5;
    const wave = instrument?.timbre === 'struck' ? 'triangle'
        : instrument?.timbre === 'breathy' ? 'sine' : 'triangle';
    motif.forEach((step, index) => {
        const degree = degrees[(rootIndex + step) % degrees.length] || 0;
        const frequency = root * Math.pow(2, degree / 12);
        const at = now + index * (0.22 + (Number(profile?.sound?.tempo) || 60) / 600);
        tone(frequency, at, decay * (1 - index * 0.12), wave, 0.026 - index * 0.004, masterGain, 0);
        tone(frequency * 2.01, at + 0.02, decay * 0.72, 'sine', 0.01 * brightness + 0.004, masterGain, 0);
        if (overtone > 0.55 && index === 0) tone(frequency * 2.98, at + 0.04, decay * 0.5, 'sine', 0.005, masterGain, 0);
    });
}

function playDrip(profile = currentProfile) {
    const context = audioContext;
    if (!context || !masterGain) return;
    const now = context.currentTime + 0.05;
    const seed = hashText((profile?.id || 'wood') + ':drip');
    for (let index = 0; index < 4; index++) {
        const frequency = 860 + ((seed >> (index * 5)) & 31) * 42;
        tone(frequency, now + index * 0.11, 0.07, 'sine', 0.018, masterGain, -240);
    }
}

function playCreak(profile = currentProfile) {
    const context = audioContext;
    if (!context || !masterGain) return;
    const now = context.currentTime + 0.05;
    const seed = hashText((profile?.id || 'wood') + ':creak');
    const base = 74 + (seed % 24);
    tone(base, now, 1.35, 'sawtooth', 0.012, masterGain, -26);
    tone(base * 1.5, now + 0.18, 0.95, 'triangle', 0.007, masterGain, -18);
}

function playHush(profile = currentProfile) {
    const context = audioContext;
    if (!context || !masterGain) return;
    const source = context.createBufferSource();
    source.buffer = noiseBuffer(1.2, profile);
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 520;
    filter.Q.value = 0.4;
    const gain = context.createGain();
    const now = context.currentTime + 0.05;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.018, now + 0.8);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 3.0);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);
    source.start(now);
    source.stop(now + 3.1);
    source.addEventListener('ended', () => {
        try { source.disconnect(); } catch { /* already disconnected */ }
        try { filter.disconnect(); } catch { /* already disconnected */ }
        try { gain.disconnect(); } catch { /* already disconnected */ }
    });
}

function playCue(cue, profile = currentProfile, scene = currentScene) {
    if (!cue) return;
    if (cue.kind === 'bird') playBird(cue.bird);
    else if (cue.kind === 'insect') playInsect();
    else if (cue.kind === 'instrument') playInstrument(cue.instrument, profile, scene);
    else if (cue.kind === 'drip') playDrip(profile);
    else if (cue.kind === 'creak') playCreak(profile);
    else if (cue.kind === 'hush') playHush(profile);
    else if (cue.kind === 'weather') playWeather(profile);
}

function playWeather(profile = currentProfile) {
    const context = audioContext;
    if (!context || !masterGain) return;
    const source = context.createBufferSource();
    // A requested cue must work before the bed has ever been built (for example
    // with ambience switched off), so fall back to a short local noise buffer.
    source.buffer = bedNoise || noiseBuffer(1.8, profile);
    const filter = context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 900;
    filter.Q.value = 0.4;
    const gain = context.createGain();
    const now = context.currentTime + 0.05;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.02, now + 0.6);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 2.4);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);
    source.start(now);
    source.stop(now + 2.5);
    source.addEventListener('ended', () => {
        try { source.disconnect(); } catch { /* already disconnected */ }
        try { filter.disconnect(); } catch { /* already disconnected */ }
        try { gain.disconnect(); } catch { /* already disconnected */ }
    });
}

function emitCue(cue) {
    lastCue = { ...cue, at: Date.now() };
    cueHistory.unshift({ ...lastCue });
    if (cueHistory.length > 8) cueHistory.length = 8;
    if (typeof document === 'undefined' || !forestSubtitlesEnabled() || !cue?.text) return;
    try {
        document.dispatchEvent(new CustomEvent('kac:forest-ambience', {
            detail: { kind: cue.kind, text: cue.text, at: lastCue.at },
        }));
    } catch { /* CustomEvent unavailable in a non-browser test */ }
}

function scheduleNextCue(delayMs = null) {
    if (typeof window === 'undefined' || !enabled || !currentProfile) return;
    if (cueTimer) window.clearTimeout(cueTimer);
    const density = Math.max(0.1, Math.min(1, Number(currentProfile.sound?.density) || 0.5));
    const silence = Math.max(0, Math.min(1, Number(currentProfile.sound?.silence) || 0));
    const wait = delayMs ?? (4200 + (1 - density) * 6200 + silence * 9000 + Math.random() * 2200);
    cueTimer = window.setTimeout(() => {
        cueTimer = 0;
        if (!enabled || !currentProfile || !audioContext) return;
        const cue = forestSoundCue(currentProfile, currentScene || {}, Math.random(), Math.random());
        if (cue.kind === 'silence') {
            emitCue({ ...cue, text: cue.text || 'The old wood holds its silence.' });
        } else {
            emitCue(cue);
            playCue(cue);
        }
        scheduleNextCue();
    }, Math.max(900, wait));
}

export function setForestScene(profile, scene = {}) {
    currentProfile = profile || null;
    currentScene = scene || {};
    if (!enabled || !currentProfile) return;
    const key = [currentProfile.id, currentScene.weather, currentScene.season, Math.floor((Number(currentScene.hour) || 0) / 6)].join('|');
    if (key !== lastSceneKey) {
        lastSceneKey = key;
        if (audioContext?.state === 'running') buildBed();
    }
    if (audioContext?.state !== 'running') {
        const context = getContext();
        context?.resume?.().catch(() => {});
        bindUnlock();
        return;
    }
    if (!cueTimer) scheduleNextCue(900);
}

export function startForestAmbience() {
    if (!enabled) return false;
    const context = getContext();
    if (!context) return false;
    if (context.state === 'running') {
        if (currentProfile) {
            buildBed();
            if (!cueTimer) scheduleNextCue(800);
        }
        return true;
    }
    context.resume().catch(() => {});
    bindUnlock();
    return false;
}

export function stopForestAmbience() {
    if (typeof window !== 'undefined' && cueTimer) window.clearTimeout(cueTimer);
    cueTimer = 0;
    stopBed();
}

export function applyForestAmbienceSettings(settings = {}) {
    enabled = settings.forestAmbience !== false;
    volume = Math.max(0, Math.min(1, Number(settings.forestAmbienceVolume ?? 0.3)));
    if (masterGain && audioContext) {
        masterGain.gain.setTargetAtTime(enabled ? volume : 0, audioContext.currentTime, 0.08);
    }
    if (!enabled) {
        stopForestAmbience();
    } else if (currentProfile) {
        startForestAmbience();
    }
}

export function forestAmbienceStatus() {
    return {
        enabled,
        running: Boolean(audioContext && audioContext.state === 'running' && bedSource),
        profileId: currentProfile?.id || null,
        bed: currentProfile?.sound?.bed || null,
        volume,
        lastCue,
    };
}

export function forestAmbienceLastCue() {
    return lastCue ? { ...lastCue } : null;
}

export function forestAmbienceHistory() {
    return cueHistory.map(entry => ({ ...entry }));
}

// On-demand atlas preview. It is a real user gesture, so it may resume a
// suspended context. With the ambience switched off it still plays this one
// requested cue at the saved volume, then restores silence; the printed cue is
// returned either way, so the feature works with sound muted or unavailable.
export function previewForestAmbience(profile, scene = {}, kind = 'bird') {
    if (!profile) return { ok: false, reason: 'no-wood', cue: null, text: '' };
    const cue = forestSoundCue(profile, scene, 0.5, 0.5, kind);
    const spoken = {
        ...cue,
        text: cue.text || (cue.kind === 'silence' ? 'The old wood holds its silence.' : 'The wood is still.'),
    };
    const context = getContext();
    if (!context) return { ok: false, reason: 'no-audio', cue: spoken, text: spoken.text };
    const start = () => {
        if (!masterGain || !audioContext) return false;
        const restore = !enabled;
        if (restore) masterGain.gain.setTargetAtTime(Math.max(0.0001, volume), audioContext.currentTime, 0.02);
        emitCue(spoken);
        playCue(spoken, profile, scene);
        // A requested cue must be readable and audible before the next automatic
        // one; otherwise a scheduled bird or instrument can cut it off mid-line.
        if (enabled) scheduleNextCue(6500);
        if (restore) {
            window.setTimeout(() => {
                try { masterGain?.gain.setTargetAtTime(0, audioContext.currentTime, 0.12); } catch { /* context closed */ }
            }, 3600);
        }
        return true;
    };
    if (context.state === 'running') return { ok: start(), reason: null, cue: spoken, text: spoken.text };
    context.resume().then(() => {
        if (audioContext?.state === 'running') start();
    }).catch(() => {});
    return { ok: false, reason: 'suspended', cue: spoken, text: spoken.text };
}

if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            if (typeof window !== 'undefined' && cueTimer) window.clearTimeout(cueTimer);
            cueTimer = 0;
        } else if (enabled && currentProfile) {
            setForestScene(currentProfile, currentScene || {});
        }
    });
}
