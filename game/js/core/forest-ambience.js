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

function noiseBuffer(seconds = 2) {
    const context = audioContext;
    const length = Math.max(1, Math.floor((context.sampleRate || 22050) * seconds));
    const buffer = context.createBuffer(1, length, context.sampleRate || 22050);
    const data = buffer.getChannelData(0);
    // A seeded LCG makes the bed's grain stable for one regional type, so the
    // same wood does not acquire a different hiss after a reload.
    let seed = 0x2f6e2b1 ^ hashText(currentProfile?.id || 'forest');
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

function playInstrument(instrument) {
    const context = audioContext;
    if (!context || !masterGain) return;
    const now = context.currentTime + 0.05;
    const scale = [220, 261.63, 293.66, 329.63, 392, 440];
    const seed = hashText((currentProfile?.id || 'wood') + ':' + (currentScene?.season || 'summer'));
    const root = scale[seed % scale.length];
    const brightness = Number(instrument?.brightness) || 0.6;
    const decay = 0.9 + (Number(instrument?.decay) || 0.5) * 1.4;
    const overtone = Number(instrument?.overtone) || 0.5;
    tone(root, now, decay, 'triangle', 0.028, masterGain, 0);
    tone(root * 2.01, now + 0.02, decay * 0.8, 'sine', 0.012 * brightness + 0.006, masterGain, 0);
    if (overtone > 0.55) tone(root * 2.98, now + 0.04, decay * 0.55, 'sine', 0.006, masterGain, 0);
}

function playWeather() {
    const context = audioContext;
    if (!context || !masterGain || !bedNoise) return;
    const source = context.createBufferSource();
    source.buffer = bedNoise;
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
            if (cue.kind === 'bird') playBird(cue.bird);
            else if (cue.kind === 'insect') playInsect();
            else if (cue.kind === 'instrument') playInstrument(cue.instrument);
            else playWeather();
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
