// Local player profiles and versioned browser saves.
// This adapter is intentionally device-local. It is not server authentication.
const PROFILE_KEY = "kings-and-cards:profiles:v1";
const ACTIVE_PROFILE_KEY = "kings-and-cards:active-profile:v1";
const SETTINGS_KEY = "kings-and-cards:settings:v1";
const SAVE_VERSION = 1;

function readJson(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
    } catch {
        return fallback;
    }
}

function writeJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
}

export function listLocalProfiles() {
    const profiles=readJson(PROFILE_KEY, []);
    return Array.isArray(profiles)?profiles.filter(profile=>profile&&typeof profile==="object"&&typeof profile.id==="string"):[];
}

export function getActiveProfile() {
    try {
        const id = localStorage.getItem(ACTIVE_PROFILE_KEY);
        return listLocalProfiles().find(profile => profile.id === id) || null;
    } catch {
        return null;
    }
}

export function createLocalProfile(displayName) {
    const name = String(displayName || "").trim().slice(0, 32);
    if (!name) throw new Error("Enter a player name first.");
    const profiles = listLocalProfiles();
    const profile = {
        id: globalThis.crypto?.randomUUID?.() || "local-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
        displayName: name,
        createdAt: new Date().toISOString(),
        kind: "local"
    };
    profiles.push(profile);
    writeJson(PROFILE_KEY, profiles);
    localStorage.setItem(ACTIVE_PROFILE_KEY, profile.id);
    return profile;
}

export function selectLocalProfile(profileId) {
    const profile = listLocalProfiles().find(item => item.id === profileId);
    if (!profile) throw new Error("That local player profile does not exist in this browser.");
    localStorage.setItem(ACTIVE_PROFILE_KEY, profile.id);
    return profile;
}

function saveKey(profileId) {
    return "kings-and-cards:save:v" + SAVE_VERSION + ":" + profileId;
}

function backupKey(profileId) {
    return "kings-and-cards:save-backup:v" + SAVE_VERSION + ":" + profileId;
}

function isValidSave(value, profileId) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value) &&
        value.version === SAVE_VERSION && value.profileId === profileId &&
        value.snapshot && typeof value.snapshot === "object" && !Array.isArray(value.snapshot));
}

export function writeLocalSave(profileId, snapshot) {
    if (!profileId) throw new Error("Create a local player profile before saving.");
    if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
        throw new TypeError("A valid realm snapshot is required.");
    }
    const envelope = {
        version: SAVE_VERSION,
        savedAt: new Date().toISOString(),
        profileId,
        snapshot
    };
    const current=readJson(saveKey(profileId),null);
    // Preserve the last valid save before replacing it. If quota prevents the
    // backup write, the existing primary save remains untouched and the new
    // write is still attempted; localStorage.setItem is atomic per key.
    if(isValidSave(current,profileId)){
        try { writeJson(backupKey(profileId),current); } catch { /* best-effort backup */ }
    }
    writeJson(saveKey(profileId), envelope);
    return envelope.savedAt;
}

export function readLocalSave(profileId) {
    if (!profileId) return null;
    const current=readJson(saveKey(profileId),null);
    if(isValidSave(current,profileId))return current;
    const backup=readJson(backupKey(profileId),null);
    return isValidSave(backup,profileId)?{...backup,restoredFromBackup:true}:null;
}

export function getLocalSaveInfo(profileId) {
    const value = readLocalSave(profileId);
    return value ? { savedAt: value.savedAt, version: value.version, restoredFromBackup:Boolean(value.restoredFromBackup) } : null;
}

export function loadSettings() {
    return {
        musicEnabled: true,
        musicVolume: 0.22,
        showTooltips: true,
        showDeltas: true,
        reduceMotion: false,
        cardPace: 1,
        ...readJson(SETTINGS_KEY, {})
    };
}

export function saveSettings(settings) {
    writeJson(SETTINGS_KEY, {
        musicEnabled: Boolean(settings.musicEnabled),
        musicVolume: Math.max(0, Math.min(1, Number(settings.musicVolume) || 0)),
        showTooltips: settings.showTooltips !== false,
        showDeltas: settings.showDeltas !== false,
        reduceMotion: settings.reduceMotion === true,
        cardPace: Math.max(0.5, Math.min(2, Number(settings.cardPace) || 1))
    });
}
