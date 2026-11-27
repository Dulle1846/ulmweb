// 1.2.23.1.241–270 — presentation system: settings, live scene sampling,
// filters, symbol/legend data and the deterministic soundscape script.
//
// It reads the same stand model as the simulation and never mutates the realm.
// The only persistent piece is the player's display/audio preference, which is
// stored with the ordinary settings and therefore survives save/load.
import { state } from '../core/state.js';
import { CELL } from '../core/config.js';
import { getHeightAt, getMoistureAt, getTemperatureAt } from '../world/world.js';
import { forestStandAt } from '../world/forest-ecology.js';
import { seasonalState } from '../world/season.js';
import {
    FOREST_DANGER_ICONS, FOREST_FILTER_GROUPS, FOREST_FOG_TYPES,
    FOREST_PRESENTATION_LIST, FOREST_PRESENTATION_POINTS, FOREST_PRESENTATION_PROFILES,
    FOREST_SPECIES_STIFFNESS, FOREST_USE_ICONS, forestPresentationProfile,
} from '../world/forest-presentation.js';

const clamp01 = value => Math.max(0, Math.min(1, Number(value) || 0));
const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));

const DEFAULT_PROFILE = FOREST_PRESENTATION_LIST.find(profile => profile.family === 'broadleaf')
    || FOREST_PRESENTATION_LIST[0];

export const FOREST_PRESENTATION_SETTINGS = Object.freeze({
    forestAmbience: true,
    forestAmbienceVolume: 0.3,
    forestSubtitles: false,
    forestColorblind: false,
    forestCanopyContrast: false,
    forestFontScale: 'normal',
    forestPerformance: false,
    forestReducedParticles: false,
    forestMapView: 'detailed',
});

const FONT_SCALES = new Set(['normal', 'large', 'xlarge']);
const MAP_VIEWS = new Set(['detailed', 'symbolic']);

export function normalizeForestPresentationSettings(raw = {}) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const volume = Number(source.forestAmbienceVolume);
    return {
        forestAmbience: source.forestAmbience !== false,
        forestAmbienceVolume: Number.isFinite(volume) ? clamp(volume, 0, 1) : FOREST_PRESENTATION_SETTINGS.forestAmbienceVolume,
        forestSubtitles: source.forestSubtitles === true,
        forestColorblind: source.forestColorblind === true,
        forestCanopyContrast: source.forestCanopyContrast === true,
        forestFontScale: FONT_SCALES.has(source.forestFontScale) ? source.forestFontScale : 'normal',
        forestPerformance: source.forestPerformance === true,
        forestReducedParticles: source.forestReducedParticles === true,
        forestMapView: MAP_VIEWS.has(source.forestMapView) ? source.forestMapView : 'detailed',
    };
}

export function forestPresentationSettings() {
    return normalizeForestPresentationSettings(state.settings || {});
}

export function forestReducedMotion() {
    return state.settings?.reduceMotion === true;
}

export function forestMotionScale() {
    const settings = forestPresentationSettings();
    if (forestReducedMotion()) return 0.18;
    return settings.forestPerformance ? 0.55 : 1;
}

export function forestParticleScale() {
    const settings = forestPresentationSettings();
    if (settings.forestReducedParticles) return 0.34;
    return settings.forestPerformance ? 0.6 : 1;
}

export function forestSymbolicMap() {
    return forestPresentationSettings().forestMapView === 'symbolic';
}

export function forestCanopyContrast() {
    return forestPresentationSettings().forestCanopyContrast;
}

export function forestColorblind() {
    return forestPresentationSettings().forestColorblind;
}

export function forestFontScale() {
    return forestPresentationSettings().forestFontScale;
}

export function forestAmbienceEnabled() {
    return forestPresentationSettings().forestAmbience;
}

export function forestSubtitlesEnabled() {
    return forestPresentationSettings().forestSubtitles;
}

// The renderer asks for the profile of a stand thousands of times per cached
// rebuild. Stands carry the regional type id, so the lookup is O(1); the tuning
// object is cached per type and invalidated only when a display setting moves.
let tuningRevision = 0;
let tuningCache = new Map();
let tuningSettingsKey = -1;

// A bit field instead of an array/join. This is read once per drawn tree via
// forestSwayAmplitude(), so it must not allocate on the render path.
function settingsKey() {
    const settings = state.settings || {};
    return (settings.reduceMotion === true ? 1 : 0)
        | (settings.forestPerformance === true ? 2 : 0)
        | (settings.forestReducedParticles === true ? 4 : 0)
        | (settings.forestCanopyContrast === true ? 8 : 0)
        | (settings.forestMapView === 'symbolic' ? 16 : 0);
}

export function invalidateForestPresentationCache() {
    tuningRevision += 1;
    tuningCache = new Map();
    tuningSettingsKey = settingsKey();
}

export function forestPresentationProfileForStand(stand) {
    const id = stand?.regionalTypeId;
    if (id && FOREST_PRESENTATION_PROFILES[id]) return FOREST_PRESENTATION_PROFILES[id];
    if (stand?.tropical) {
        return FOREST_PRESENTATION_LIST.find(profile => profile.family === 'mangrove')
            || FOREST_PRESENTATION_LIST.find(profile => profile.climate === 'tropical')
            || DEFAULT_PROFILE;
    }
    if (stand?.coniferShare > 0.45) {
        return FOREST_PRESENTATION_LIST.find(profile => profile.family === 'conifer') || DEFAULT_PROFILE;
    }
    return DEFAULT_PROFILE;
}

export function forestRenderTuning(stand) {
    const key = settingsKey();
    if (tuningSettingsKey !== key) {
        tuningSettingsKey = key;
        tuningCache = new Map();
    }
    const profile = forestPresentationProfileForStand(stand);
    let tuning = tuningCache.get(profile.id);
    if (tuning) return tuning;
    const settings = forestPresentationSettings();
    const motion = settings.forestPerformance ? 0.55 : (forestReducedMotion() ? 0.18 : 1);
    const particles = settings.forestReducedParticles ? 0.34 : (settings.forestPerformance ? 0.6 : 1);
    tuning = Object.freeze({
        revision: tuningRevision,
        profile,
        motion,
        particles,
        symbolic: settings.forestMapView === 'symbolic',
        contrast: settings.forestCanopyContrast,
        performance: settings.forestPerformance,
        windScale: profile.wind.gust * (settings.forestPerformance ? 0.55 : (forestReducedMotion() ? 0.2 : 1)),
        windFrequency: 0.045 * profile.wind.speed,
        shaft: profile.light.shaft * (settings.forestPerformance ? 0.65 : 1),
        mist: profile.fog.density * (settings.forestPerformance ? 0.45 : 1)
            * (settings.forestCanopyContrast ? 0.5 : 1),
        shade: (settings.forestCanopyContrast ? 0.28 : 1) * (settings.forestPerformance ? 0.75 : 1),
        outline: settings.forestCanopyContrast,
        ground: profile.ground,
        family: profile.family,
    });
    if (tuningCache.size > 160) tuningCache.clear();
    tuningCache.set(profile.id, tuning);
    return tuning;
}

// Per-species sway. The renderer uses this instead of one global amplitude so
// a spruce, a birch and a palm answer the same gust differently.
export function forestSwayAmplitude(stand, species) {
    const tuning = forestRenderTuning(stand);
    const stiffness = stand?.forest ? (profileStiffness(species) || 1) : 1;
    return (1.55 / Math.max(0.35, stiffness)) * tuning.windScale;
}

export function forestSwayFrequency(stand) {
    return forestRenderTuning(stand).windFrequency;
}

function profileStiffness(species) {
    return FOREST_SPECIES_STIFFNESS[species];
}

export function forestLeafTint(stand, seasonIndex = 0) {
    const profile = forestPresentationProfileForStand(stand);
    if (seasonIndex === 2) return profile.leaves.autumn;
    if (seasonIndex === 0) return profile.leaves.spring;
    return profile.leaves.summer;
}

export function forestAutumnShift(stand) {
    return forestPresentationProfileForStand(stand).leaves.turnShift;
}

export function forestSnowRetention(stand) {
    return forestPresentationProfileForStand(stand).snow.retention;
}

export function forestBareShare(stand) {
    return forestPresentationProfileForStand(stand).snow.bareShare;
}

// ── Reference scene and live sampling ───────────────────────────────
let referenceCache = { key: '', value: null };

function sampleStandAt(x, y, dayOfYear, climate) {
    const geo = state.resourceGeography;
    const width = Number(state.worldW) || 0;
    if (!geo?.forestStock || !width) return null;
    const index = Math.floor(y) * width + Math.floor(x);
    if (index < 0 || index >= geo.forestStock.length || !(geo.forestStock[index] > 0)) return null;
    const stockRatio = geo.forestCapacity?.[index] ? geo.forestStock[index] / geo.forestCapacity[index] : 1;
    const node = geo.forestSuccession?.[index] || null;
    const drainage = Number(geo.forestDrainage?.[index]) || 0;
    return forestStandAt(x, y, {
        seed: Number(geo.seed) || 1,
        moisture: getMoistureAt(x, y),
        temperature: getTemperatureAt(x, y),
        height: getHeightAt(x, y),
        climate,
        forests: state.worldOptions?.forests ?? 52,
        stockRatio,
        rockLine: 0.92,
        succession: node,
        drainage,
    });
}

// One bounded reference wood: the camera centre when it is wooded, otherwise
// the first explored forest tile in a capped scan. The result is cached by the
// same inputs the stand model uses, so the atlas and the ambience do not rescan
// the realm every time they repaint.
export function forestReferenceScene() {
    const climate = state.worldOptions?.climate || 'temperate';
    const dayOfYear = Number.isFinite(Number(state.dayOfYear))
        ? Number(state.dayOfYear)
        : (Number(state.seasonIndex) || 0) * 100;
    const width = Number(state.worldW) || 0;
    const height = Number(state.worldH) || 0;
    const canvas = state.canvas;
    const zoom = Number(state.zoom) || 1;
    const centerX = canvas && zoom > 0 ? Math.floor((state.camera.x + canvas.width / 2) / (CELL * zoom)) : 0;
    const centerY = canvas && zoom > 0 ? Math.floor((state.camera.y + canvas.height / 2) / (CELL * zoom)) : 0;
    const key = [climate, Math.floor(dayOfYear), width, height, state.weather || 'clear',
        centerX, centerY, geoSeed()].join('|');
    if (referenceCache.key === key) return referenceCache.value;
    let stand = null;
    let tile = null;
    if (width && height && centerX >= 0 && centerY >= 0 && centerX < width && centerY < height) {
        stand = sampleStandAt(centerX + 0.5, centerY + 0.5, dayOfYear, climate);
        if (stand) tile = { x: centerX, y: centerY };
    }
    if (!stand) {
        const geo = state.resourceGeography;
        const total = geo?.forestStock ? Math.min(geo.forestStock.length, width * height) : 0;
        // A bounded fallback scan. The camera centre is usually a wood, so this
        // only runs after a move over open country; 512 stand queries is enough
        // to find the nearest catalogued type without touching every tile.
        const step = Math.max(1, Math.floor(total / 512));
        for (let index = 0; index < total; index += step) {
            const x = index % width, y = Math.floor(index / width);
            if (!state.explored?.[x]?.[y]) continue;
            stand = sampleStandAt(x + 0.5, y + 0.5, dayOfYear, climate);
            if (stand) { tile = { x, y }; break; }
        }
    }
    const profile = stand ? forestPresentationProfileForStand(stand) : DEFAULT_PROFILE;
    const season = seasonalState(dayOfYear, climate);
    const seasonName = ['spring', 'summer', 'autumn', 'winter'][season.season] || 'summer';
    const value = {
        available: Boolean(stand),
        profile,
        stand,
        tile,
        climate,
        dayOfYear: Math.floor(dayOfYear),
        season: seasonName,
        seasonIndex: season.season,
        hour: Number.isFinite(Number(state.timeOfDay)) ? Number(state.timeOfDay) : 12,
        weather: state.weather || 'clear',
        snowCover: season.snowCover,
        foliageTurn: season.foliageTurn,
        fog: profile.fog,
        visibility: profile.fog.visibility,
        light: profile.light,
        ground: profile.ground,
        wind: profile.wind,
        fauna: profile.fauna,
        sound: profile.sound,
    };
    referenceCache = { key, value };
    return value;
}

function geoSeed() {
    return Number(state.resourceGeography?.seed) || Number(state.worldSeed) || 1;
}

export function forestSceneAtTile(x, y) {
    const climate = state.worldOptions?.climate || 'temperate';
    const dayOfYear = Number(state.dayOfYear) || 0;
    const stand = sampleStandAt(Number(x) + 0.5, Number(y) + 0.5, dayOfYear, climate);
    if (!stand) return null;
    return {
        stand,
        profile: forestPresentationProfileForStand(stand),
        climate,
        dayOfYear,
        seasonIndex: Number(state.seasonIndex) || 0,
        weather: state.weather || 'clear',
    };
}

// ── Filters ─────────────────────────────────────────────────────────
const FILTER_DEFAULTS = Object.freeze({ family: 'all', resource: 'all', protection: 'all' });
let activeFilters = { ...FILTER_DEFAULTS };

export function forestMapFilters() {
    return { ...activeFilters };
}

export function setForestMapFilter(kind, value) {
    const group = FOREST_FILTER_GROUPS.find(entry => entry.id === kind);
    if (!group) return false;
    const option = group.options.find(entry => entry.id === value);
    if (!option) return false;
    activeFilters = { ...activeFilters, [kind]: option.id };
    return true;
}

export function resetForestMapFilters() {
    activeFilters = { ...FILTER_DEFAULTS };
}

export function forestMatchesFilters(row = {}) {
    if (activeFilters.family !== 'all' && row.family !== activeFilters.family) return false;
    if (activeFilters.resource !== 'all' && !(row.resources || []).includes(activeFilters.resource)) return false;
    if (activeFilters.protection !== 'all' && row.protection !== activeFilters.protection) return false;
    return true;
}

export function forestFilterOptions() {
    return FOREST_FILTER_GROUPS;
}

export function forestProtectionForStand(stand, stewardship = null) {
    if (!stand) return 'unmanaged';
    if (stand.protected || stand.preserve) return 'protected';
    if ((Number(stand.disturbance) || 0) > 0.02 || stand.disturbance) return 'disturbed';
    if (stewardship?.firebreak || stewardship?.drained || stewardship?.planted) return 'managed';
    const system = stand.dynamics?.silviculture?.system;
    if (system) return 'managed';
    return 'unmanaged';
}

// ── Symbols and legend ──────────────────────────────────────────────
export function forestMapSymbol(profile) {
    const use = FOREST_USE_ICONS[profile.useIcon] || FOREST_USE_ICONS.leaf;
    const danger = FOREST_DANGER_ICONS[profile.danger] || FOREST_DANGER_ICONS.none;
    return {
        type: profile.icon,
        typeLabel: profile.patternLabel,
        use: use.glyph,
        useLabel: use.label,
        danger: danger.glyph,
        dangerLabel: danger.label,
        pattern: profile.pattern,
    };
}

export function forestLegendEntries() {
    return [...new Map(FOREST_PRESENTATION_LIST.map(profile => [profile.family, profile])).values()]
        .map(profile => ({
            id: profile.family,
            family: profile.family,
            icon: profile.icon,
            pattern: profile.pattern,
            patternLabel: profile.patternLabel,
            label: profile.short,
            detail: profile.fog.detail,
            light: profile.light.mood,
            ground: profile.ground.label,
        }));
}

export function forestUseLegend() {
    return Object.values(FOREST_USE_ICONS);
}

export function forestDangerLegend() {
    return Object.values(FOREST_DANGER_ICONS);
}

// ── Guide rows ──────────────────────────────────────────────────────
const pct = value => Math.round(clamp01(value) * 100) + '%';

function birdLabel(id) {
    return String(id || 'bird').replace(/-/g, ' ');
}

export function forestPresentationGuide(scene = forestReferenceScene()) {
    const profile = scene.profile;
    const settings = forestPresentationSettings();
    const sound = profile.sound;
    const values = {
        '1.2.23.1.241': profile.parallax.toFixed(3) + '× · ' + profile.family + ' · ' + profile.canopyLayers.length + ' layers',
        '1.2.23.1.242': profile.silhouette + ' · aspect ' + profile.crown.aspect.toFixed(2) + ' · ' + profile.crown.tiers + ' tiers',
        '1.2.23.1.243': profile.leaves.summer + ' leaves · ' + profile.light.mood + ' light',
        '1.2.23.1.244': 'turn day ' + profile.phenology.turn + ' · leaf fall ' + profile.phenology.leafFall + ' · ' + (profile.leaves.turnShift >= 0 ? '+' : '') + profile.leaves.turnShift + ' days shift',
        '1.2.23.1.245': pct(profile.snow.retention / 1.8) + ' snow retention · ' + pct(profile.snow.bareShare) + ' bare crowns',
        '1.2.23.1.246': profile.ground.label + ' · ' + profile.ground.detail,
        '1.2.23.1.247': pct(profile.light.shaft) + ' shaft strength · ' + pct(profile.light.dapple) + ' dapple',
        '1.2.23.1.248': profile.fog.label + ' · visibility ' + pct(profile.fog.visibility) + ' · ' + pct(profile.fog.density / 1.6) + ' density',
        '1.2.23.1.249': scene.weather === 'rain' || scene.weather === 'storm' ? 'Wet floor active' : 'Dry floor · wet sheen ' + pct(profile.ground.wetSheen),
        '1.2.23.1.250': profile.wind.stiffness.toFixed(2) + ' stiffness · ' + profile.wind.gust.toFixed(2) + ' gust',
        '1.2.23.1.251': pct(profile.deadwood) + ' deadwood · ' + pct(profile.rootPlate) + ' root plates',
        '1.2.23.1.252': 'fern ' + pct(profile.understory.fern) + ' · grass ' + pct(profile.understory.grass) + ' · shrub ' + pct(profile.understory.shrub),
        '1.2.23.1.253': pct(profile.bloom.blossom) + ' blossom day ' + profile.phenology.blossom + ' · ' + pct(profile.bloom.fruit) + ' fruit day ' + profile.phenology.fruit,
        '1.2.23.1.254': birdLabel(profile.fauna.bird) + ' · ' + birdLabel(profile.fauna.mammal) + ' · ' + pct(profile.fauna.richness) + ' richness',
        '1.2.23.1.255': 'insects ' + pct(profile.fauna.richness * 0.8 + 0.1) + ' · ' + profile.fauna.insect,
        '1.2.23.1.256': sound.bed + ' · ' + pct(sound.density) + ' density · ' + sound.scale.mode + ' · ' + sound.birds.map(birdLabel).join(', '),
        '1.2.23.1.257': profile.instruments.map(entry => entry.label).join(' · ') + ' · ' + profile.sound.scale.mode + ' mode · ' + profile.sound.tempo + ' bpm',
        '1.2.23.1.258': pct(sound.silence) + ' silence · old growth ' + pct(sound.oldGrowth),
        '1.2.23.1.259': profile.icon + ' type · ' + (FOREST_USE_ICONS[profile.useIcon]?.glyph || '❧') + ' use · ' + (FOREST_DANGER_ICONS[profile.danger]?.glyph || '·') + ' danger',
        '1.2.23.1.260': profile.patternLabel + ' pattern · ' + profile.ground.label + ' · ' + profile.fog.label,
        '1.2.23.1.261': Object.keys(scene.stand?.species || {}).length + ' species in stand · ' + profile.goods.length + ' goods catalogued',
        '1.2.23.1.262': 'family ' + activeFilters.family + ' · resource ' + activeFilters.resource + ' · protection ' + activeFilters.protection,
        '1.2.23.1.263': settings.forestColorblind ? profile.patternLabel + ' pattern ON' : profile.patternLabel + ' pattern available',
        '1.2.23.1.264': settings.forestCanopyContrast ? 'Canopy contrast ON' : 'Canopy contrast off',
        '1.2.23.1.265': settings.forestFontScale.toUpperCase() + ' forest text',
        '1.2.23.1.266': forestReducedMotion() ? 'Reduced motion ON · ' + pct(forestMotionScale()) + ' sway' : 'Full motion · ' + pct(forestMotionScale()) + ' sway',
        '1.2.23.1.267': (settings.forestSubtitles ? 'Subtitles ON' : 'Subtitles off') + ' · ' + FOREST_CUE_KINDS.length + ' cue kinds',
        '1.2.23.1.268': settings.forestPerformance ? 'Performance mode ON' : 'Performance mode off',
        '1.2.23.1.269': pct(forestParticleScale()) + ' rain / leaf particles',
        '1.2.23.1.270': settings.forestMapView === 'symbolic' ? 'Symbolic map view ON' : 'Detailed map view',
    };
    return FOREST_PRESENTATION_POINTS.map(entry => ({
        ...entry,
        value: values[entry.id] || '',
    }));
}

export function forestPresentationSummary() {
    const scene = forestReferenceScene();
    const settings = forestPresentationSettings();
    const profile = scene.profile;
    const families = [...new Set(FOREST_PRESENTATION_LIST.map(profile => profile.family))];
    const patterns = [...new Set(FOREST_PRESENTATION_LIST.map(profile => profile.pattern))];
    const grounds = [...new Set(FOREST_PRESENTATION_LIST.map(profile => profile.ground.label))];
    return {
        profiles: FOREST_PRESENTATION_LIST.length,
        families,
        patterns,
        grounds,
        fogs: Object.values(FOREST_FOG_TYPES),
        settings,
        scene,
        filters: forestMapFilters(),
        requirements: FOREST_PRESENTATION_POINTS.length,
        seasons: profile?.seasons || [],
        phenology: profile?.phenology || null,
        canopyLayers: profile?.canopyLayers || [],
        fieldMarks: profile?.fieldMarks || [],
        cueKinds: FOREST_CUE_KINDS,
        guide: forestPresentationGuide(scene),
        legend: forestLegendEntries(),
        uses: forestUseLegend(),
        dangers: forestDangerLegend(),
    };
}

// ── Soundscape script ──────────────────────────────────────────────
// Deterministic cue selection. The ambience module owns the oscillators; this
// function only decides what the wood does next, which keeps the audio engine
// testable without a browser AudioContext.
const CUE_BIRDS = Object.freeze({
    crossbill: 'A crossbill chips in the spruce tops.',
    capercaillie: 'A capercaillie drums somewhere beyond the pines.',
    owl: 'An owl calls from the old wood.',
    woodpecker: 'A woodpecker hammers a dead trunk.',
    raptor: 'A raptor whistles above the canopy.',
    toucan: 'A toucan croaks in the wet canopy.',
    macaw: 'A macaw screams across the gap.',
    'harpy-eagle': 'A harpy eagle calls from the emergent crown.',
    jay: 'A jay warns the whole wood.',
    nightingale: 'A nightingale sings from the undergrowth.',
    crane: 'Cranes pass high over the trees.',
    heron: 'A heron lifts from the water.',
    kingfisher: 'A kingfisher stitches the bank.',
    hornbill: 'A hornbill claps its wings overhead.',
    lyrebird: 'A lyrebird repeats the wood back to itself.',
});

const CUE_BEDS = Object.freeze({
    'needle-wind': 'Wind moves through the needles.',
    'emergent-hum': 'The high canopy hums with insects.',
    'broadleaf-rustle': 'Broad leaves rustle overhead.',
    'dry-leaves': 'Dry leaves scrape across the ground.',
    'coastal-fog': 'Fog-damp wind pushes through the crowns.',
    'river-reed': 'Reeds and water move together.',
    'dry-grass': 'Dry grass hisses in the wind.',
    'savanna-hum': 'Heat and insects hum over the grass.',
    'mangrove-water': 'Water clucks among the stilt roots.',
    'bamboo-clatter': 'Bamboo knocks against bamboo.',
    'bog-wind': 'A low wind crosses the bog.',
    'heath-wind': 'Wind combs the heath.',
});

// Every cue the wood can make. The atlas preview and the scheduler share this
// list, so a button can never promise a sound the engine cannot produce.
export const FOREST_CUE_KINDS = Object.freeze([
    Object.freeze({ id: 'bird', label: 'Bird', action: 'Call a bird', detail: 'The resident bird of this regional wood.' }),
    Object.freeze({ id: 'insect', label: 'Insects', action: 'Raise the insects', detail: 'The warm-season insect chorus and its flight tone.' }),
    Object.freeze({ id: 'instrument', label: 'Instrument', action: 'Play the wood', detail: 'A short motif on an instrument built from this wood.' }),
    Object.freeze({ id: 'weather', label: 'Weather', action: 'Move the weather', detail: 'Wind, rain or snow moving through the regional bed.' }),
    Object.freeze({ id: 'drip', label: 'Drips', action: 'Hear the drips', detail: 'Rain or meltwater falling from the crowns.' }),
    Object.freeze({ id: 'creak', label: 'Creak', action: 'Bend a trunk', detail: 'Old wood and a stiff trunk answering a gust.' }),
    Object.freeze({ id: 'hush', label: 'Snow hush', action: 'Let the snow fall', detail: 'The muffled, close sound of a snow-loaded wood.' }),
    Object.freeze({ id: 'silence', label: 'Silence', action: 'Hold the silence', detail: 'The deliberate quiet of an old-growth stand.' }),
]);

export function forestSoundscape(profile, scene = {}) {
    const weather = String(scene.weather || 'clear').toLowerCase();
    const night = Number(scene.hour) >= 21 || Number(scene.hour) < 5;
    return {
        bed: profile.sound.bed,
        bedText: weather === 'rain' || weather === 'storm'
            ? 'Rain on the ' + profile.dominantLabel.toLowerCase() + ' leaves.'
            : (CUE_BEDS[profile.sound.bed] || 'The wood is moving.'),
        birds: night
            ? [profile.sound.birds.includes('owl') ? 'owl' : (profile.sound.birds[0] || 'owl')]
            : profile.sound.birds,
        insect: profile.fauna.insect,
        instruments: profile.instruments,
        density: profile.sound.density,
        silence: profile.sound.silence,
        oldGrowth: profile.sound.oldGrowth,
        mode: profile.sound.scale?.mode || 'Ionian',
        scale: profile.sound.scale || null,
        motif: profile.sound.motif || [0, 2, 4],
        tempo: profile.sound.tempo || 60,
        weatherReaction: profile.weatherReaction || { drip: 0, hush: 0, creak: 0 },
        night,
        weather,
        muggy: weather === 'rain' || weather === 'storm',
    };
}

function birdCue(sound, roll) {
    const birds = sound.birds || [];
    const bird = birds[Math.floor(clamp01(roll) * birds.length) % Math.max(1, birds.length)];
    return {
        kind: 'bird',
        text: CUE_BIRDS[bird] || ('A ' + birdLabel(bird) + ' calls.'),
        bird,
        duration: 1.1 + roll * 0.8,
    };
}

function instrumentCue(profile, roll) {
    const instrument = profile.instruments[Math.floor(roll * profile.instruments.length) % Math.max(1, profile.instruments.length)];
    return {
        kind: 'instrument',
        text: (/^[aeiou]/i.test(instrument.label) ? 'An ' : 'A ')
            + instrument.label + ' sounds somewhere in the wood.',
        instrument,
        duration: 1.6 + roll * 1.2,
    };
}

function cueForKind(profile, scene, kind, roll, sound = forestSoundscape(profile, scene)) {
    const label = profile.dominantLabel.toLowerCase();
    switch (kind) {
    case 'bird': return birdCue(sound, roll);
    case 'insect': return {
        kind: 'insect',
        text: sound.muggy ? 'Insects drone under the wet leaves.' : 'Insects rise from the sunlit gap.',
        duration: 1.5,
    };
    case 'instrument': return instrumentCue(profile, roll);
    case 'drip': return {
        kind: 'drip',
        text: sound.muggy ? 'Rain drips from the ' + label + ' crowns.' : 'Meltwater drips from the ' + label + ' crowns.',
        duration: 1.3 + roll * 0.4,
    };
    case 'creak': return {
        kind: 'creak',
        text: 'A ' + label + ' trunk creaks in the wind.',
        duration: 1.9 + roll * 0.8,
    };
    case 'hush': return {
        kind: 'hush',
        text: 'Snow muffles the ' + label + ' wood.',
        duration: 2.2 + roll * 0.8,
    };
    case 'silence': return { kind: 'silence', text: '', duration: 2.2 };
    case 'weather': return { kind: 'weather', text: sound.bedText, duration: 1.8 };
    default: return { kind: 'weather', text: sound.bedText, duration: 1.8 };
    }
}

// One cue. `roll` in 0..1 and `kindRoll` in 0..1 are supplied by the audio
// scheduler (seeded by time and type) so the same wood keeps a stable voice.
// `forcedKind` is the atlas preview path; it never depends on a random roll.
export function forestSoundCue(profile, scene = {}, roll = 0.5, kindRoll = 0.5, forcedKind = null) {
    const sound = forestSoundscape(profile, scene);
    const forced = String(forcedKind || '').toLowerCase();
    if (forced && FOREST_CUE_KINDS.some(entry => entry.id === forced)) {
        return cueForKind(profile, scene, forced, roll, sound);
    }
    const silence = clamp01(sound.silence);
    if (silence > 0.55 && kindRoll < silence * 0.6) {
        return { kind: 'silence', text: '', duration: 2.2 };
    }
    if (kindRoll < 0.52) return birdCue(sound, roll);
    if (kindRoll < 0.72) {
        return {
            kind: 'insect',
            text: sound.muggy ? 'Insects drone under the wet leaves.' : 'Insects rise from the sunlit gap.',
            duration: 1.5,
        };
    }
    if (kindRoll < 0.9) return instrumentCue(profile, roll);
    // Weather owns the tail of the distribution. In a wet wood it is a drip,
    // in snow a hush, and in dry weather the ordinary moving bed.
    if (sound.muggy) return cueForKind(profile, scene, 'drip', roll, sound);
    if (sound.weather === 'snow') return cueForKind(profile, scene, 'hush', roll, sound);
    if (sound.weatherReaction.creak > 0.72) return cueForKind(profile, scene, 'creak', roll, sound);
    return cueForKind(profile, scene, 'weather', roll, sound);
}

// Deterministic preview used by the atlas. The returned cue is exactly what the
// ambience engine plays, so the printed line and the sound cannot disagree.
export function forestSoundPreview(profile, scene = {}, kind = 'bird') {
    if (!profile) return null;
    const cueKind = FOREST_CUE_KINDS.some(entry => entry.id === kind) ? kind : 'bird';
    const rolls = {
        bird: 0.37, insect: 0.58, instrument: 0.74, weather: 0.94,
        drip: 0.42, creak: 0.61, hush: 0.28, silence: 0.1,
    };
    return forestSoundCue(profile, scene, rolls[cueKind] ?? 0.5, 0.5, cueKind);
}

export function forestTypeSoundPreview(typeId, kind = 'instrument', scene = {}) {
    const profile = forestPresentationProfile(typeId);
    if (!profile) return null;
    const live = {
        weather: scene.weather || 'clear',
        hour: Number.isFinite(Number(scene.hour)) ? Number(scene.hour) : 12,
        season: scene.season ?? 'summer',
        seasonIndex: Number.isFinite(Number(scene.seasonIndex)) ? Number(scene.seasonIndex) : 1,
    };
    return { profile, cue: forestSoundPreview(profile, live, kind) };
}

export function forestPresentationCueText(profile, kind = 'weather') {
    return forestSoundPreview(profile, {}, kind)?.text || '';
}

export function forestProfileTooltip(profile) {
    return [
        profile.short,
        profile.family + ' · ' + profile.silhouette,
        profile.ground.label,
        profile.fog.label,
        profile.dominantLabel + ' dominant',
    ].join(' · ');
}
