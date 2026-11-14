import test from "node:test";
import assert from "node:assert/strict";
import {
    createLocalProfile,getActiveProfile,selectLocalProfile,listLocalProfiles,
    writeLocalSave,readLocalSave,loadSettings,saveSettings,
    migrateSaveEnvelope,SAVE_VERSION
} from "../../js/core/persistence.js";

function installStorage() {
    const values=new Map();
    globalThis.localStorage={
        getItem:key=>values.has(key)?values.get(key):null,
        setItem:(key,value)=>values.set(key,String(value)),
        removeItem:key=>values.delete(key),
        clear:()=>values.clear()
    };
    return values;
}

function legacyEnvelope(profileId, snapshot, version) {
    return JSON.stringify({version, savedAt:"2025-01-01T00:00:00.000Z", profileId, snapshot});
}

test("local profiles are separate and the active profile is selected",()=>{
    installStorage();
    const first=createLocalProfile("Realm Keeper");
    const second=createLocalProfile("Chancellor");
    assert.equal(getActiveProfile().id,second.id);
    assert.equal(selectLocalProfile(first.id).displayName,"Realm Keeper");
    assert.equal(getActiveProfile().id,first.id);
});
test("a restored save recreates or selects the exact profile id it carries",()=>{
    installStorage();
    const importedId="11111111-1111-4111-8111-111111111111";
    const restored=createLocalProfile("Restored Keeper",importedId);
    assert.equal(restored.id,importedId);
    assert.equal(getActiveProfile().id,importedId);
    createLocalProfile("Other Keeper");
    assert.notEqual(getActiveProfile().id,importedId);
    assert.equal(createLocalProfile("Ignored",importedId).displayName,"Restored Keeper");
    assert.equal(getActiveProfile().id,importedId);
    assert.equal(listLocalProfiles().length,2);
    assert.throws(()=>createLocalProfile("Bad","bad:id"),/invalid local profile id/);
    assert.equal(getActiveProfile().id,importedId,"an invalid id must not replace the active profile");
});
test("a save envelope is linked to its local profile and version",()=>{
    installStorage();
    const profile=createLocalProfile("Archivist");
    const savedAt=writeLocalSave(profile.id,{tick:42,resources:{gold:99}});
    const loaded=readLocalSave(profile.id);
    assert.equal(loaded.savedAt,savedAt);
    assert.equal(loaded.profileId,profile.id);
    assert.equal(loaded.version,SAVE_VERSION);
    assert.equal(loaded.snapshot.tick,42);
    assert.equal(readLocalSave("not-this-profile"),null);
});
test("settings are clamped and persisted with safe defaults",()=>{
    installStorage();
    saveSettings({musicEnabled:true,musicVolume:2,showTooltips:false,reduceMotion:true,highContrast:true});
    const settings=loadSettings();
    assert.equal(settings.musicEnabled,true);
    assert.equal(settings.musicVolume,1);
    assert.equal(settings.showTooltips,false);
    assert.equal(settings.reduceMotion,true);
    assert.equal(settings.highContrast,true);
    assert.equal(settings.frameLimit,60);
    assert.equal(settings.renderScale,1);
    assert.equal(settings.showFps,false);
    assert.equal("terrainRenderer" in settings,false,"the removed renderer switch must not persist");
    assert.equal("adaptiveQuality" in settings,false,"the removed adaptive setting must not persist");

    saveSettings({frameLimit:30,renderScale:0.7,showFps:true});
    const performanceSettings=loadSettings();
    assert.equal(performanceSettings.frameLimit,30);
    assert.equal(performanceSettings.renderScale,0.7);
    assert.equal(performanceSettings.showFps,true);
    assert.equal(performanceSettings.highContrast,false);

    saveSettings({frameLimit:120,renderScale:0.33});
    const sanitized=loadSettings();
    assert.equal(sanitized.frameLimit,60);
    assert.equal(sanitized.renderScale,1);
});

test("a second save preserves the previous valid realm as a recovery backup",()=>{
    const values=installStorage();
    writeLocalSave("profile-a",{worldSeed:11,tick:120,entities:[]});
    writeLocalSave("profile-a",{worldSeed:11,tick:240,entities:[]});
    const current=readLocalSave("profile-a");
    assert.equal(current.snapshot.tick,240);
    assert.equal(current.restoredFromBackup,undefined);
    assert.ok(values.has("kings-and-cards:save-backup:v"+SAVE_VERSION+":profile-a"));
});
test("a corrupted primary save falls back to the last valid backup",()=>{
    const values=installStorage();
    writeLocalSave("profile-a",{worldSeed:11,tick:120,entities:[]});
    writeLocalSave("profile-a",{worldSeed:11,tick:240,entities:[]});
    values.set("kings-and-cards:save:v"+SAVE_VERSION+":profile-a","{truncated-json");
    const recovered=readLocalSave("profile-a");
    assert.equal(recovered.snapshot.tick,120);
    assert.equal(recovered.restoredFromBackup,true);
});
test("invalid snapshot payloads are rejected before replacing a save",()=>{
    installStorage();
    writeLocalSave("profile-a",{worldSeed:11,tick:120,entities:[]});
    assert.throws(()=>writeLocalSave("profile-a",null),TypeError);
    assert.equal(readLocalSave("profile-a").snapshot.tick,120);
});

test("a version 1 envelope is migrated on read and can be saved again",()=>{
    const values=installStorage();
    values.set("kings-and-cards:save:v1:legacy",legacyEnvelope("legacy",{worldSeed:7,tick:99,entities:[]},1));
    const migrated=readLocalSave("legacy");
    assert.equal(migrated.version,SAVE_VERSION);
    assert.equal(migrated.migratedFrom,1);
    assert.equal(migrated.snapshot.tick,99);
    writeLocalSave("legacy",{worldSeed:7,tick:120,entities:[]});
    const current=readLocalSave("legacy");
    assert.equal(current.snapshot.tick,120);
    assert.equal(current.migratedFrom,null);
    // The migrated legacy realm survives as the recovery backup.
    assert.equal(JSON.parse(values.get("kings-and-cards:save-backup:v"+SAVE_VERSION+":legacy")).snapshot.tick,99);
});

test("an envelope without a version field is treated as the oldest format",()=>{
    const values=installStorage();
    values.set("kings-and-cards:save:v1:old",JSON.stringify({profileId:"old",savedAt:"2024-05-05T00:00:00.000Z",snapshot:{worldSeed:3,tick:8,entities:[]}}));
    const migrated=readLocalSave("old");
    assert.equal(migrated.version,SAVE_VERSION);
    assert.equal(migrated.migratedFrom,0);
    assert.equal(migrated.snapshot.worldSeed,3);
    assert.equal(migrateSaveEnvelope({version:0,profileId:"old",snapshot:{}}, "old").migratedFrom,0);
});

test("a save envelope from a newer build is never loaded",()=>{
    const values=installStorage();
    values.set("kings-and-cards:save:v1:future",legacyEnvelope("future",{worldSeed:9,tick:3,entities:[]},99));
    assert.equal(readLocalSave("future"),null);
    assert.equal(migrateSaveEnvelope({version:99,profileId:"future",snapshot:{}},"future"),null);
});

test("a legacy envelope belonging to another profile is ignored",()=>{
    const values=installStorage();
    values.set("kings-and-cards:save:v1:owner",legacyEnvelope("someone-else",{worldSeed:5,tick:1,entities:[]},1));
    assert.equal(readLocalSave("owner"),null);
});
