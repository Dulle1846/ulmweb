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
