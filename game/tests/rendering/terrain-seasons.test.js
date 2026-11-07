import test from "node:test";
import assert from "node:assert/strict";
import { terrainPaletteFor, terrainShaderPalette } from "../../js/presentation/rendering/terrain-palette.js";

const spring = terrainPaletteFor("temperate", 0);
const summer = terrainPaletteFor("temperate", 1);
const autumn = terrainPaletteFor("temperate", 2);
const winter = terrainPaletteFor("temperate", 3);

test("winter is clearly paler than summer", () => {
    assert.ok(winter.meadow[2] - summer.meadow[2] > 30, "winter meadow must read pale, got " + winter.meadow[2] + " vs " + summer.meadow[2]);
    assert.ok(winter.forest[2] - summer.forest[2] > 15, "winter canopy must lose its green");
    assert.ok(winter.snow[0] > summer.snow[0], "winter snow must brighten");
});

test("autumn reads copper while spring stays green", () => {
    assert.ok(autumn.forest[0] - summer.forest[0] > 40, "autumn canopy must turn copper");
    assert.ok(spring.meadow[1] - autumn.meadow[1] > 8, "spring meadows must stay greener than autumn, got " + spring.meadow[1] + " vs " + autumn.meadow[1]);
    assert.ok(autumn.meadow[0] - spring.meadow[0] > 20, "autumn meadows must turn ochre");
});

test("each season carries its own effect flags and snow cover", () => {
    assert.equal(spring.snowBias, 0);
    assert.equal(summer.snowBias, 0);
    assert.equal(autumn.snowBias, 0);
    assert.ok(winter.snowBias >= 0.25, "winter needs a visible snow bias");
    assert.equal(autumn.autumn, 1);
    assert.equal(autumn.winter, 0);
    assert.equal(winter.winter, 1);
    assert.equal(winter.autumn, 0);
    assert.equal(summer.autumn + summer.winter, 0);
});

test("the shader palette stays normalised and keeps water seasonal", () => {
    const shaderWinter = terrainShaderPalette("temperate", 3);
    const shaderSummer = terrainShaderPalette("temperate", 1);
    for (const value of Object.values(shaderWinter)) {
        if (Array.isArray(value)) {
            for (const channel of value) assert.ok(channel >= 0 && channel <= 1);
        }
    }
    assert.notDeepEqual(shaderWinter.waterDeep, shaderSummer.waterDeep);
    assert.equal(shaderWinter.winter, 1);
    assert.equal(shaderWinter.spring, undefined);
});
