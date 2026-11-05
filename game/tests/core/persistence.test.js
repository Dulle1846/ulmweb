import test from "node:test";
import assert from "node:assert/strict";
import {
    createLocalProfile,getActiveProfile,selectLocalProfile,
    writeLocalSave,readLocalSave,loadSettings,saveSettings
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

test("local profiles are separate and the active profile is selected",()=>{
    installStorage();
    const first=createLocalProfile("Realm Keeper");
    const second=createLocalProfile("Chancellor");
    assert.equal(getActiveProfile().id,second.id);
    assert.equal(selectLocalProfile(first.id).displayName,"Realm Keeper");
    assert.equal(getActiveProfile().id,first.id);
});
test("a save envelope is linked to its local profile and version",()=>{
    installStorage();
    const profile=createLocalProfile("Archivist");
    const savedAt=writeLocalSave(profile.id,{tick:42,resources:{gold:99}});
    const loaded=readLocalSave(profile.id);
    assert.equal(loaded.savedAt,savedAt);
    assert.equal(loaded.profileId,profile.id);
    assert.equal(loaded.snapshot.tick,42);
    assert.equal(readLocalSave("not-this-profile"),null);
});
test("settings are clamped and persisted with safe defaults",()=>{
    installStorage();
    saveSettings({musicEnabled:true,musicVolume:2,showTooltips:false});
    const settings=loadSettings();
    assert.equal(settings.musicEnabled,true);
    assert.equal(settings.musicVolume,1);
    assert.equal(settings.showTooltips,false);
});

test("a second save preserves the previous valid realm as a recovery backup",()=>{
    const values=installStorage();
    writeLocalSave("profile-a",{worldSeed:11,tick:120,entities:[]});
    writeLocalSave("profile-a",{worldSeed:11,tick:240,entities:[]});
    const current=readLocalSave("profile-a");
    assert.equal(current.snapshot.tick,240);
    assert.equal(current.restoredFromBackup,undefined);
    assert.ok(values.has("kings-and-cards:save-backup:v1:profile-a"));
});
test("a corrupted primary save falls back to the last valid backup",()=>{
    const values=installStorage();
    writeLocalSave("profile-a",{worldSeed:11,tick:120,entities:[]});
    writeLocalSave("profile-a",{worldSeed:11,tick:240,entities:[]});
    values.set("kings-and-cards:save:v1:profile-a","{truncated-json");
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
