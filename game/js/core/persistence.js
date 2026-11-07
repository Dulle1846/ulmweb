// Local player profiles and versioned browser saves.
// This adapter is intentionally device-local. It is not server authentication.
//
// The envelope is migrated on read: a save written by an older build (or one
// without a version marker at all) is normalised to the current version instead
// of being discarded. A save from a newer build is never guessed at.
const PROFILE_KEY = "kings-and-cards:profiles:v1";
const ACTIVE_PROFILE_KEY = "kings-and-cards:active-profile:v1";
const SETTINGS_KEY = "kings-and-cards:settings:v1";
export const SAVE_VERSION = 2;
export const LEGACY_SAVE_VERSIONS = Object.freeze([1]);

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

function saveKeyFor(version, profileId) {
    return "kings-and-cards:save:v" + version + ":" + profileId;
}

function backupKeyFor(version, profileId) {
    return "kings-and-cards:save-backup:v" + version + ":" + profileId;
}

function saveKey(profileId) {
    return saveKeyFor(SAVE_VERSION, profileId);
}

function backupKey(profileId) {
    return backupKeyFor(SAVE_VERSION, profileId);
}

// Accepts every known envelope version, including a missing version field.
export function migrateSaveEnvelope(value, profileId) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    if (!value.snapshot || typeof value.snapshot !== "object" || Array.isArray(value.snapshot)) return null;
    if (value.profileId !== profileId) return null;
    const declared = Number(value.version);
    const version = Number.isFinite(declared) ? Math.max(0, Math.floor(declared)) : 0;
    if (version > SAVE_VERSION) return null;
    return {
        ...value,
        version: SAVE_VERSION,
        savedAt: typeof value.savedAt === "string" && value.savedAt ? value.savedAt : new Date(0).toISOString(),
        migratedFrom: version < SAVE_VERSION ? version : null,
        snapshot: value.snapshot
    };
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
    // Preserve the last readable save (current or legacy) before replacing the
    // primary slot. A quota failure on the backup never blocks the new save.
    const current = readLocalSave(profileId);
    if (current) {
        const { restoredFromBackup, ...previous } = current;
        try { writeJson(backupKey(profileId), previous); } catch { /* best-effort backup */ }
    }
    writeJson(saveKey(profileId), envelope);
    return envelope.savedAt;
}

export function readLocalSave(profileId) {
    if (!profileId) return null;
    const candidates = [
        { key: saveKey(profileId), backup: false },
        ...LEGACY_SAVE_VERSIONS.map(version => ({ key: saveKeyFor(version, profileId), backup: false })),
        { key: backupKey(profileId), backup: true },
        ...LEGACY_SAVE_VERSIONS.map(version => ({ key: backupKeyFor(version, profileId), backup: true }))
    ];
    for (const candidate of candidates) {
        const envelope = migrateSaveEnvelope(readJson(candidate.key, null), profileId);
        if (!envelope) continue;
        return candidate.backup ? { ...envelope, restoredFromBackup: true } : envelope;
    }
    return null;
}

export function getLocalSaveInfo(profileId) {
    const value = readLocalSave(profileId);
    return value ? {
        savedAt: value.savedAt,
        version: value.version,
        migratedFrom: value.migratedFrom ?? null,
        restoredFromBackup: Boolean(value.restoredFromBackup)
    } : null;
}

export function loadSettings() {
    return {
        musicEnabled: true,
        musicVolume: 0.22,
        showTooltips: true,
        showDeltas: true,
        reduceMotion: false,
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
    });
}
