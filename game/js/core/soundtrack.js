// Original, procedural Kings & Cards theme. One calm orchestral-style loop.
let audioContext = null;
let masterGain = null;
let loopTimer = null;
let enabled = true;
let volume = 0.22;

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
    if (audioContext) return audioContext;
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return null;
    audioContext = new Context();
    masterGain = audioContext.createGain();
    masterGain.gain.value = volume;
    masterGain.connect(audioContext.destination);
    return audioContext;
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

export async function startSoundtrack() {
    if (!enabled) return;
    const context = getContext();
    if (!context) return;
    if (context.state === "suspended") await context.resume();
    if (!loopTimer) scheduleLoop();
}

export function stopSoundtrack() {
    if (loopTimer !== null) window.clearTimeout(loopTimer);
    loopTimer = null;
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
