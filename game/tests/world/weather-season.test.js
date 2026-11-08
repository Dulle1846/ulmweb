import test from "node:test";
import assert from "node:assert/strict";
import {
    pickWeather, updateWeather, weatherAllowed, weatherDurationDays, weatherOptionsForDay, weatherWeights,
} from "../../js/world/weather.js";
import { seasonalState } from "../../js/world/season.js";
import { state } from "../../js/core/state.js";

test("no snowfall can start in summer or late spring", () => {
    for (let day = 100; day < 200; day++) {
        const kinds = weatherOptionsForDay(day).map(option => option.kind);
        assert.deepEqual(kinds.sort(), ["clear", "rain"], "day " + day + " offered " + kinds.join(", "));
        assert.equal(weatherAllowed("snow", day), false);
    }
    assert.equal(weatherAllowed("snow", 50), false);
    assert.equal(weatherWeights(150).snow, 0);
});

test("snow is possible only while the ground carries snow cover", () => {
    assert.ok(seasonalState(300).snowCover > 0.5);
    assert.ok(weatherOptionsForDay(300).some(option => option.kind === "snow"));
    assert.equal(weatherAllowed("snow", 350), true);
    assert.equal(weatherAllowed("snow", 0), true);
    assert.equal(weatherAllowed("rain", 150), true);
    assert.equal(weatherAllowed("clear", 150), true);
});

test("weather picks are deterministic and stay inside the seasonal table", () => {
    for (const day of [0, 50, 150, 250, 300, 350]) {
        const first = pickWeather(day, 0.37);
        assert.equal(pickWeather(day, 0.37), first);
        assert.ok(weatherOptionsForDay(day).some(option => option.kind === first));
    }
    assert.equal(pickWeather(150, 0), "clear");
    assert.equal(pickWeather(150, 1), "rain");
});

test("a full simulated year never leaves snow in summer", () => {
    const original = {
        dayOfYear: state.dayOfYear,
        seasonIndex: state.seasonIndex,
        weather: state.weather,
        weatherTimer: state.weatherTimer,
    };
    try {
        state.dayOfYear = 0;
        state.seasonIndex = 0;
        state.weather = "snow";
        // A spell from an old save must be clamped, not carried for years.
        state.weatherTimer = 400;
        for (let day = 0; day < 400; day++) {
            state.dayOfYear = day;
            state.seasonIndex = Math.floor(day / 100) % 4;
            updateWeather();
            assert.ok(state.weatherTimer <= 12, "timer " + state.weatherTimer + " on day " + day);
            if (day >= 100 && day < 200) {
                assert.notEqual(state.weather, "snow", "snow on summer day " + day);
            }
        }
    } finally {
        Object.assign(state, original);
    }
});

test("weather spells are short enough to change with the season", () => {
    for (const day of [0, 50, 150, 250, 300, 350]) {
        for (const roll of [0, 0.25, 0.5, 0.75, 0.99, 1]) {
            const duration = weatherDurationDays(day, roll);
            assert.ok(duration >= 3 && duration <= 12, "day " + day + " roll " + roll + " produced " + duration);
        }
    }
    assert.equal(weatherDurationDays(150, 1), 8);
    assert.equal(weatherDurationDays(350, 1), 12);
});
