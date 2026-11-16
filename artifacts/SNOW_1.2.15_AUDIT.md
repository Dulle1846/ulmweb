# 1.2.15 Schneelandschaften — Runtime Audit

Generated from a real Snowlands world (seed `20261215`, 176×176) through the actual profile, gather and annual hazard paths. 69/69 items are runtime-backed; 17/17 formations observed.

## Method

`scripts/snow-audit.mjs` generates the Snowlands climate, surveys every tile through `snowProfileAt()` across all four seasons and clear, snow, storm and fog weather, gathers a real snow product, and drives `updateSnowHazards()` against a placed house. The feature array locates a representative tile; each row records the field and consumer that makes the requirement observable.

## Probes

- Climate entry: Snowlands (14 climates total).
- Gathering: ok — game:2, peat:2, firewood:2, hides:2, cloudberry:2.
- Hazard: AVALANCHE RISK ON SNOWBOUND PASS · 56% / A BLIZZARD HIDES THE SLOPE; destroyed Timber Cottage; house dead: true.
- Winter resilience: insulated=1.000 vs open=0.584.

| ID | Requirement | Status | Code location | Observed runtime evidence |
|---|---|---|---|---|
| 1.2.15.1 | Snowy forests | **working** | js/world/snow-ecology.js#chooseFormation + js/presentation/rendering/snow-render.js | 92,21 day20 clear; formation=powder-basin; forest=0.884; conifers=2 |
| 1.2.15.2 | Open snowfields | **working** | js/world/snow-ecology.js#chooseFormation + js/presentation/rendering/snow-render.js | 98,32 day20 clear; formation=alpine-snowfield; depth=0.435; cover=0.629 |
| 1.2.15.3 | Snow-covered grasslands | **working** | js/world/snow-ecology.js#chooseFormation + js/presentation/rendering/snow-render.js | 112,42 day20 clear; formation=snow-grassland; grass=0.648; grasses=2 |
| 1.2.15.4 | Alpine snowfields | **working** | js/world/snow-ecology.js#chooseFormation + js/presentation/rendering/snow-render.js | 94,31 day20 clear; formation=snowbound-pass; alpine=0.654; height=0.602 |
| 1.2.15.5 | Frozen high plateaus | **working** | js/world/snow-ecology.js#chooseFormation + js/presentation/rendering/snow-render.js | 98,34 day20 clear; formation=frozen-plateau; plateau=0.628; relative=0.708 |
| 1.2.15.6 | Frozen valleys | **working** | js/world/snow-ecology.js#chooseFormation + js/presentation/rendering/snow-render.js | 0,0 day20 clear; formation=frozen-river; valley=1.000; relative=0.000 |
| 1.2.15.7 | Wind-blown snow surfaces | **working** | js/world/snow-ecology.js#chooseFormation + js/presentation/rendering/snow-render.js | 12,0 day20 clear; formation=frozen-river; exposure=0.405; drift=0.298 |
| 1.2.15.8 | Permanent snow regions | **working** | js/world/snow-ecology.js#chooseFormation + js/presentation/rendering/snow-render.js | 97,35 day20 clear; formation=permanent-snow; permanent=0.552; height=0.709 |
| 1.2.15.9 | Snow-covered coastal landscapes | **working** | js/world/snow-ecology.js#chooseFormation + js/presentation/rendering/snow-render.js | 0,0 day20 clear; formation=frozen-river; coastal=1.000; shore=-0.304 |
| 1.2.15.10 | Fresh powder snow | **working** | js/world/snow-ecology.js#surface + js/presentation/rendering/snow-render.js#drawSnowGround | 0,0 day20 snow; state=wet; depth=0.141; fresh=0.512; packed=0.439; icy=0.240; wet=0.655; drift=0.165; exposed=0.294; tracks=0.205 |
| 1.2.15.11 | Compacted snow | **working** | js/world/snow-ecology.js#surface + js/presentation/rendering/snow-render.js#drawSnowGround | 5,0 day20 clear; state=wet; depth=0.108; fresh=0.100; packed=0.365; icy=0.240; wet=0.655; drift=0.291; exposed=0.463; tracks=0.199 |
| 1.2.15.12 | Icy snow | **working** | js/world/snow-ecology.js#surface + js/presentation/rendering/snow-render.js#drawSnowGround | 0,0 day20 storm; state=wet; depth=0.113; fresh=0.020; packed=0.634; icy=0.360; wet=0.631; drift=0.466; exposed=0.385; tracks=0.200 |
| 1.2.15.13 | Wet snow | **working** | js/world/snow-ecology.js#surface + js/presentation/rendering/snow-render.js#drawSnowGround | 0,0 day20 clear; state=wet; depth=0.157; fresh=0.100; packed=0.334; icy=0.240; wet=0.655; drift=0.122; exposed=0.245; tracks=0.208 |
| 1.2.15.14 | Wind drifts | **working** | js/world/snow-ecology.js#surface + js/presentation/rendering/snow-render.js#drawSnowGround | 20,0 day20 clear; state=wet; depth=0.078; fresh=0.100; packed=0.383; icy=0.240; wet=0.655; drift=0.393; exposed=0.593; tracks=0.194 |
| 1.2.15.15 | Snow mounds | **working** | js/world/snow-ecology.js#surface + js/presentation/rendering/snow-render.js#drawSnowGround | 5,0 day20 clear; state=wet; depth=0.108; fresh=0.100; packed=0.365; icy=0.240; wet=0.655; drift=0.291; exposed=0.463; tracks=0.199 |
| 1.2.15.16 | Exposed ground patches | **working** | js/world/snow-ecology.js#surface + js/presentation/rendering/snow-render.js#drawSnowGround | 0,0 day20 clear; state=wet; depth=0.157; fresh=0.100; packed=0.334; icy=0.240; wet=0.655; drift=0.122; exposed=0.245; tracks=0.208 |
| 1.2.15.17 | Different snow depths | **working** | js/world/snow-ecology.js#surface + js/presentation/rendering/snow-render.js#drawSnowGround | 0,0 day20 clear; state=wet; depth=0.157; fresh=0.100; packed=0.334; icy=0.240; wet=0.655; drift=0.122; exposed=0.245; tracks=0.208 |
| 1.2.15.18 | Tracks and footprint patterns | **working** | js/world/snow-ecology.js#surface + js/presentation/rendering/snow-render.js#drawSnowGround | 0,0 day20 clear; state=wet; depth=0.157; fresh=0.100; packed=0.334; icy=0.240; wet=0.655; drift=0.122; exposed=0.245; tracks=0.208 |
| 1.2.15.19 | Drifts against buildings and rocks | **working** | js/world/snow-ecology.js#surface + js/presentation/rendering/snow-render.js#drawSnowGround | 5,0 day20 clear; state=wet; depth=0.108; fresh=0.100; packed=0.365; icy=0.240; wet=0.655; drift=0.291; exposed=0.463; tracks=0.199 |
| 1.2.15.20 | Frozen lakes | **working** | js/world/snow-ecology.js#water + js/presentation/rendering/snow-render.js#drawSnowWater | 1,0 day120 clear; frozen=true; lake=true; river=false; ice=0.417; edge=0.636; breakup=0.325; icicles=0.558; sheets=0.333; icefalls=0.133 |
| 1.2.15.21 | Frozen rivers | **working** | js/world/snow-ecology.js#water + js/presentation/rendering/snow-render.js#drawSnowWater | 0,0 day120 clear; frozen=true; lake=false; river=true; ice=0.343; edge=0.635; breakup=0.442; icicles=0.558; sheets=0.275; icefalls=0.133 |
| 1.2.15.22 | Icicles | **working** | js/world/snow-ecology.js#water + js/presentation/rendering/snow-render.js#drawSnowWater | 0,0 day20 clear; frozen=true; lake=false; river=true; ice=0.175; edge=0.635; breakup=0.710; icicles=0.558; sheets=0.140; icefalls=0.133 |
| 1.2.15.23 | Ice sheets | **working** | js/world/snow-ecology.js#water + js/presentation/rendering/snow-render.js#drawSnowWater | 1,0 day120 clear; frozen=true; lake=true; river=false; ice=0.417; edge=0.636; breakup=0.325; icicles=0.558; sheets=0.333; icefalls=0.133 |
| 1.2.15.24 | Small icefalls | **working** | js/world/snow-ecology.js#water + js/presentation/rendering/snow-render.js#drawSnowWater | 92,18 day20 clear; frozen=false; lake=false; river=false; ice=0.000; edge=0.000; breakup=0.124; icicles=0.563; sheets=0.000; icefalls=0.419 |
| 1.2.15.25 | Icy rocks | **working** | js/world/snow-ecology.js#water + js/presentation/rendering/snow-render.js#drawSnowWater | 0,0 day20 clear; frozen=true; lake=false; river=true; ice=0.175; edge=0.635; breakup=0.710; icicles=0.558; sheets=0.140; icefalls=0.133 |
| 1.2.15.26 | Frost patterns | **working** | js/world/snow-ecology.js#water + js/presentation/rendering/snow-render.js#drawSnowWater | 0,0 day20 clear; frozen=true; lake=false; river=true; ice=0.175; edge=0.635; breakup=0.710; icicles=0.558; sheets=0.140; icefalls=0.133 |
| 1.2.15.27 | Ice edges along waters | **working** | js/world/snow-ecology.js#water + js/presentation/rendering/snow-render.js#drawSnowWater | 0,0 day20 clear; frozen=true; lake=false; river=true; ice=0.175; edge=0.635; breakup=0.710; icicles=0.558; sheets=0.140; icefalls=0.133 |
| 1.2.15.28 | Breaking ice in spring | **working** | js/world/snow-ecology.js#water + js/presentation/rendering/snow-render.js#drawSnowWater | 0,0 day20 clear; frozen=true; lake=false; river=true; ice=0.175; edge=0.635; breakup=0.710; icicles=0.558; sheets=0.140; icefalls=0.133 |
| 1.2.15.29 | Snow-laden conifers | **working** | js/world/snow-ecology.js#buildTrees/buildFlora + snow-render.js#drawSnowTree/drawSnowDetails | 92,21 day20 clear; trees=snow-spruce:snow-spruce; shrubs=snow-willow; grasses=winter-sedge; lichens=feather-moss; load=0.825; underSnow=0.373 |
| 1.2.15.30 | Leafless deciduous trees | **working** | js/world/snow-ecology.js#buildTrees/buildFlora + snow-render.js#drawSnowTree/drawSnowDetails | 92,27 day20 clear; trees=bare-aspen; shrubs=snow-willow:juniper; grasses=fescue; lichens=reindeer-lichen; load=0.234; underSnow=0.464 |
| 1.2.15.31 | Snow-covered shrubs | **working** | js/world/snow-ecology.js#buildTrees/buildFlora + snow-render.js#drawSnowTree/drawSnowDetails | 0,0 day20 clear; trees=none; shrubs=snow-willow; grasses=none; lichens=none; load=0.780; underSnow=0.183 |
| 1.2.15.32 | Low winter grasses | **working** | js/world/snow-ecology.js#buildTrees/buildFlora + snow-render.js#drawSnowTree/drawSnowDetails | 3,0 day20 clear; trees=none; shrubs=none; grasses=winter-sedge; lichens=none; load=0.142; underSnow=0.185 |
| 1.2.15.33 | Exposed lichens and mosses | **working** | js/world/snow-ecology.js#buildTrees/buildFlora + snow-render.js#drawSnowTree/drawSnowDetails | 92,18 day20 clear; trees=none; shrubs=none; grasses=fescue; lichens=crustose-lichen; load=0.210; underSnow=0.218 |
| 1.2.15.34 | Plants beneath the snow | **working** | js/world/snow-ecology.js#buildTrees/buildFlora + snow-render.js#drawSnowTree/drawSnowDetails | 7,0 day20 clear; trees=none; shrubs=snow-willow; grasses=winter-sedge; lichens=none; load=0.780; underSnow=0.348 |
| 1.2.15.35 | Visible vegetation in wind-sheltered places | **working** | js/world/snow-ecology.js#buildTrees/buildFlora + snow-render.js#drawSnowTree/drawSnowDetails | 0,0 day20 clear; trees=none; shrubs=snow-willow; grasses=none; lichens=none; load=0.780; underSnow=0.183 |
| 1.2.15.36 | Different snow loads on plants | **working** | js/world/snow-ecology.js#buildTrees/buildFlora + snow-render.js#drawSnowTree/drawSnowDetails | 0,0 day20 clear; trees=none; shrubs=snow-willow; grasses=none; lichens=none; load=0.780; underSnow=0.183 |
| 1.2.15.37 | Animals with winter coats | **working** | js/world/snow-ecology.js#buildFauna + snow-render.js#drawSnowDetails | 0,0 day20 clear; fauna=ptarmigan:elk:snow-vole:migrating-goose; winterFur=true; season=spring |
| 1.2.15.38 | Ptarmigan | **working** | js/world/snow-ecology.js#buildFauna + snow-render.js#drawSnowDetails | 0,0 day20 clear; fauna=ptarmigan:elk:snow-vole:migrating-goose; winterFur=true; season=spring |
| 1.2.15.39 | Foxes | **working** | js/world/snow-ecology.js#buildFauna + snow-render.js#drawSnowDetails | 2,0 day20 clear; fauna=winter-stoat:ptarmigan:fox:elk:reindeer:snow-vole:lemming:migrating-goose; winterFur=true; season=spring |
| 1.2.15.40 | Wolves | **working** | js/world/snow-ecology.js#buildFauna + snow-render.js#drawSnowDetails | 54,0 day20 clear; fauna=winter-stoat:ptarmigan:fox:wolf:elk:reindeer:snow-vole:migrating-goose; winterFur=true; season=spring |
| 1.2.15.41 | Deer and other winter-active herbivores | **working** | js/world/snow-ecology.js#buildFauna + snow-render.js#drawSnowDetails | 0,0 day20 clear; fauna=ptarmigan:elk:snow-vole:migrating-goose; winterFur=true; season=spring |
| 1.2.15.42 | Small animals beneath the snow | **working** | js/world/snow-ecology.js#buildFauna + snow-render.js#drawSnowDetails | 0,0 day20 clear; fauna=ptarmigan:elk:snow-vole:migrating-goose; winterFur=true; season=spring |
| 1.2.15.43 | Seasonal animal migrations | **working** | js/world/snow-ecology.js#buildFauna + snow-render.js#drawSnowDetails | 0,0 day20 clear; fauna=ptarmigan:elk:snow-vole:migrating-goose; winterFur=true; season=spring |
| 1.2.15.44 | Hibernation and rest periods | **working** | js/world/snow-ecology.js#buildFauna + snow-render.js#drawSnowDetails | 4,0 day20 clear; fauna=winter-stoat:elk:snow-vole:lemming:bear; winterFur=true; season=spring |
| 1.2.15.45 | Snowfall of varying intensity | **working** | js/world/season.js + js/world/weather.js + js/world/snow-ecology.js#weather | 0,0 day20 clear; snowfall=0.160; storm=0.252; blizzard=0.351; wind=1.000; fog=0.154; frost=0.462; hoarfrost=0.524; visibility=0.659 |
| 1.2.15.46 | Snowstorms | **working** | js/world/season.js + js/world/weather.js + js/world/snow-ecology.js#weather | 14,0 day20 clear; snowfall=0.160; storm=0.282; blizzard=0.372; wind=1.000; fog=0.150; frost=0.462; hoarfrost=0.521; visibility=0.645 |
| 1.2.15.47 | Icy wind | **working** | js/world/season.js + js/world/weather.js + js/world/snow-ecology.js#weather | 12,0 day20 clear; snowfall=0.160; storm=0.280; blizzard=0.370; wind=1.000; fog=0.143; frost=0.462; hoarfrost=0.517; visibility=0.648 |
| 1.2.15.48 | Fog | **working** | js/world/season.js + js/world/weather.js + js/world/snow-ecology.js#weather | 82,40 day20 clear; snowfall=0.160; storm=0.288; blizzard=0.376; wind=1.000; fog=0.251; frost=0.462; hoarfrost=0.589; visibility=0.608 |
| 1.2.15.49 | Frost | **working** | js/world/season.js + js/world/weather.js + js/world/snow-ecology.js#weather | 0,0 day20 clear; snowfall=0.160; storm=0.252; blizzard=0.351; wind=1.000; fog=0.154; frost=0.462; hoarfrost=0.524; visibility=0.659 |
| 1.2.15.50 | Hoarfrost | **working** | js/world/season.js + js/world/weather.js + js/world/snow-ecology.js#weather | 0,0 day20 clear; snowfall=0.160; storm=0.252; blizzard=0.351; wind=1.000; fog=0.154; frost=0.462; hoarfrost=0.524; visibility=0.659 |
| 1.2.15.51 | Blizzards | **working** | js/world/season.js + js/world/weather.js + js/world/snow-ecology.js#weather | 20,0 day20 clear; snowfall=0.160; storm=0.295; blizzard=0.381; wind=1.000; fog=0.155; frost=0.462; hoarfrost=0.525; visibility=0.637 |
| 1.2.15.52 | Obstructed visibility | **working** | js/world/season.js + js/world/weather.js + js/world/snow-ecology.js#weather | 0,0 day20 clear; snowfall=0.160; storm=0.252; blizzard=0.351; wind=1.000; fog=0.154; frost=0.462; hoarfrost=0.524; visibility=0.659 |
| 1.2.15.53 | Alternating clear and overcast winter sky | **working** | js/world/season.js + js/world/weather.js + js/world/snow-ecology.js#weather | 0,0 day20 clear; snowfall=0.160; storm=0.252; blizzard=0.351; wind=1.000; fog=0.154; frost=0.462; hoarfrost=0.524; visibility=0.659 |
| 1.2.15.54 | Higher movement cost in deep snow | **working** | js/world/snow-hazards.js#updateSnowHazards + js/systems/resource-geography.js | 5,0 day20 clear; movement=0.797; icyRoads=0.076; supply=0.799; frostbite=0.315; avalanche=0.149; passClosed=0.000; hardiness=0.573; annual pass=js/world/snow-hazards.js |
| 1.2.15.55 | Icy roads and paths | **working** | js/world/snow-hazards.js#updateSnowHazards + js/systems/resource-geography.js | 1,0 day120 storm; movement=0.835; icyRoads=0.292; supply=0.705; frostbite=0.428; avalanche=0.118; passClosed=0.000; hardiness=0.503; annual pass=js/world/snow-hazards.js |
| 1.2.15.56 | Restricted supply | **working** | js/world/snow-hazards.js#updateSnowHazards + js/systems/resource-geography.js | 66,0 day20 clear; movement=0.729; icyRoads=0.107; supply=0.691; frostbite=0.344; avalanche=0.048; passClosed=0.126; hardiness=0.551; annual pass=js/world/snow-hazards.js |
| 1.2.15.57 | Risk of frostbite | **working** | js/world/snow-hazards.js#updateSnowHazards + js/systems/resource-geography.js | 0,0 day20 clear; movement=0.820; icyRoads=0.070; supply=0.783; frostbite=0.322; avalanche=0.055; passClosed=0.000; hardiness=0.569; annual pass=js/world/snow-hazards.js |
| 1.2.15.58 | Snowstorms with loss of visibility | **working** | js/world/snow-hazards.js#updateSnowHazards + js/systems/resource-geography.js | 0,0 day20 snow; movement=0.827; icyRoads=0.091; supply=0.755; frostbite=0.362; avalanche=0.050; passClosed=0.000; hardiness=0.548; annual pass=js/world/snow-hazards.js |
| 1.2.15.59 | Avalanche danger in the mountains | **working** | js/world/snow-hazards.js#updateSnowHazards + js/systems/resource-geography.js | 154,0 day20 clear; movement=0.759; icyRoads=0.116; supply=0.752; frostbite=0.314; avalanche=0.294; passClosed=0.091; hardiness=0.571; annual pass=js/world/snow-hazards.js |
| 1.2.15.60 | Frozen water sources | **working** | js/world/snow-hazards.js#updateSnowHazards + js/systems/resource-geography.js | 0,0 day20 clear; movement=0.820; icyRoads=0.070; supply=0.783; frostbite=0.322; avalanche=0.055; passClosed=0.000; hardiness=0.569; annual pass=js/world/snow-hazards.js |
| 1.2.15.61 | Seasonal closure of passes | **working** | js/world/snow-hazards.js#updateSnowHazards + js/systems/resource-geography.js | 88,30 day20 clear; movement=0.713; icyRoads=0.120; supply=0.649; frostbite=0.345; avalanche=0.307; passClosed=0.323; hardiness=0.548; annual pass=js/world/snow-hazards.js |
| 1.2.15.62 | Different winter resilience of buildings and units | **working** | js/world/snow-hazards.js#updateSnowHazards + js/systems/resource-geography.js | 0,0 day20 clear; movement=0.820; icyRoads=0.070; supply=0.783; frostbite=0.322; avalanche=0.055; passClosed=0.000; hardiness=0.569; annual pass=js/world/snow-hazards.js |
| 1.2.15.63 | Spring snowmelt | **working** | js/world/snow-ecology.js#thaw + snow-render.js#drawSnowWater/drawSnowDetails | 0,0 day20 clear; springMelt=0.825; thawed=0.426; mud=0.529; rivers=0.873; lakes=0.863; retreat=0.798; northSouth=0.440; aspect=east |
| 1.2.15.64 | Exposed ground after the thaw | **working** | js/world/snow-ecology.js#thaw + snow-render.js#drawSnowWater/drawSnowDetails | 0,0 day20 clear; springMelt=0.825; thawed=0.426; mud=0.529; rivers=0.873; lakes=0.863; retreat=0.798; northSouth=0.440; aspect=east |
| 1.2.15.65 | Muddy roads | **working** | js/world/snow-ecology.js#thaw + snow-render.js#drawSnowWater/drawSnowDetails | 0,0 day20 clear; springMelt=0.825; thawed=0.426; mud=0.529; rivers=0.873; lakes=0.863; retreat=0.798; northSouth=0.440; aspect=east |
| 1.2.15.66 | Swollen rivers | **working** | js/world/snow-ecology.js#thaw + snow-render.js#drawSnowWater/drawSnowDetails | 0,0 day20 clear; springMelt=0.825; thawed=0.426; mud=0.529; rivers=0.873; lakes=0.863; retreat=0.798; northSouth=0.440; aspect=east |
| 1.2.15.67 | Temporary meltwater lakes | **working** | js/world/snow-ecology.js#thaw + snow-render.js#drawSnowWater/drawSnowDetails | 0,0 day20 clear; springMelt=0.825; thawed=0.426; mud=0.529; rivers=0.873; lakes=0.863; retreat=0.798; northSouth=0.440; aspect=east |
| 1.2.15.68 | Snow retreat by elevation and sunlight | **working** | js/world/snow-ecology.js#thaw + snow-render.js#drawSnowWater/drawSnowDetails | 0,0 day20 clear; springMelt=0.825; thawed=0.426; mud=0.529; rivers=0.873; lakes=0.863; retreat=0.798; northSouth=0.440; aspect=east |
| 1.2.15.69 | Different melt speeds on north and south slopes | **working** | js/world/snow-ecology.js#thaw + snow-render.js#drawSnowWater/drawSnowDetails | 0,0 day20 clear; springMelt=0.825; thawed=0.426; mud=0.529; rivers=0.873; lakes=0.863; retreat=0.798; northSouth=0.440; aspect=east |

## Formations

- Snowy forest (`snow-forest`): 97 tiles on the reference day, 5712 across all samples.
- Open snowfield (`open-snowfield`): 0 tiles on the reference day, 184 across all samples.
- Snow-covered grassland (`snow-grassland`): 29 tiles on the reference day, 232 across all samples.
- Alpine snowfield (`alpine-snowfield`): 1876 tiles on the reference day, 36060 across all samples.
- Frozen plateau (`frozen-plateau`): 1005 tiles on the reference day, 16848 across all samples.
- Frozen valley (`frozen-valley`): 351 tiles on the reference day, 4122 across all samples.
- Wind-scoured snow (`wind-scoured-snow`): 22 tiles on the reference day, 592 across all samples.
- Permanent snow (`permanent-snow`): 6327 tiles on the reference day, 132552 across all samples.
- Snowy coast (`snowy-coast`): 909 tiles on the reference day, 18180 across all samples.
- Frozen lake (`frozen-lake`): 7689 tiles on the reference day, 153780 across all samples.
- Frozen river (`frozen-river`): 6957 tiles on the reference day, 139140 across all samples.
- Drift field (`drift-field`): 0 tiles on the reference day, 1291 across all samples.
- Exposed ground (`exposed-ground`): 44 tiles on the reference day, 1998 across all samples.
- Rocky snow (`rocky-snow`): 311 tiles on the reference day, 6106 across all samples.
- Frozen marsh (`frozen-marsh`): 487 tiles on the reference day, 8373 across all samples.
- Snowbound pass (`snowbound-pass`): 2802 tiles on the reference day, 59771 across all samples.
- Powder basin (`powder-basin`): 2070 tiles on the reference day, 34579 across all samples.
