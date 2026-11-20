// Short-lived fixture builder. Chromium is launched only after this process
// exits, so the mature campaign graph and V8's retained pages are returned to
// the OS before the measured browser run starts.
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { buildAdvancedSaveFixture } from "./advanced-fixture.mjs";

const [origin, output, seed, climate, years, profileId] = process.argv.slice(2);
if (!origin || !output) {
    console.error("usage: build-advanced-fixture.mjs <origin> <output.json> [seed] [climate] [years] [profileId]");
    process.exit(2);
}
const fixture = buildAdvancedSaveFixture({
    origin,
    seed: Number(seed),
    climate: climate || "temperate",
    years: Math.max(1, Number(years) || 25),
    profileId: profileId || "low-end-advanced-audit"
});
await writeFile(resolve(output), JSON.stringify(fixture));
