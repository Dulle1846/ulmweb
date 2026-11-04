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
    return readJson(PROFILE_KEY, []);
}

export function getActiveProfile() {
    const id = localStorage.getItem(ACTIVE_PROFILE_KEY);
    return listLocalProfiles().find(profile => profile.id === id) || null;
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
    if (!profile) throw new Error("That local profile does not exist in this browser.");
    localStorage.setItem(ACTIVE_PROFILE_KEY, profile.id);
    return profile;
}

function saveKey(profileId) {
    return "kings-and-cards:save:v" + SAVE_VERSION + ":" + profileId;
}

export function writeLocalSave(profileId, snapshot) {
    if (!profileId) throw new Error("Create a local player profile before saving.");
    const envelope = {
        version: SAVE_VERSION,
        savedAt: new Date().toISOString(),
        profileId,
        snapshot
    };
    writeJson(saveKey(profileId), envelope);
    return envelope.savedAt;
}

export function readLocalSave(profileId) {
    if (!profileId) return null;
    const value = readJson(saveKey(profileId), null);
    if (!value || value.version !== SAVE_VERSION || value.profileId !== profileId || !value.snapshot) return null;
    return value;
}

export function getLocalSaveInfo(profileId) {
    const value = readLocalSave(profileId);
    return value ? { savedAt: value.savedAt, version: value.version } : null;
}

export function loadSettings() {
    return {
        musicEnabled: true,
        musicVolume: 0.22,
        showTooltips: true,
        ...readJson(SETTINGS_KEY, {})
    };
}

export function saveSettings(settings) {
    writeJson(SETTINGS_KEY, {
        musicEnabled: Boolean(settings.musicEnabled),
        musicVolume: Math.max(0, Math.min(1, Number(settings.musicVolume) || 0)),
        showTooltips: settings.showTooltips !== false
    });
}
