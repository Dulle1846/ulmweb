# Laubwälder 1.2.1 — Prüfprotokoll

Stand: 8. November 2026  
Bezug: `# 1.2.1 Laubwälder`, Punkte 1.2.1.1–1.2.1.60

## Prüfverfahren

Die Prüfung kombiniert vier Nachweisarten:

1. **Visuell:** `docs/terrain-reference/forest-reference.png` (15 echte Formationen bei 2,40×), `forest-seasons.png` (ein Ancient Wood an Tag 50/150/250/350), `tree-seasons.png` (acht Tage von Herbst bis Frühling), `terrain-stability-level-4.png` (Nahansicht), `contact-sheet.png` (vier Zoomstufen über vier Jahreszeiten), `daylight-reference.png` (acht Tageszeit-Frames), `mist-reference.png` (Nahaufnahme des Bodennebels) und `forest-detail-reference.png` (13 echte Nahmotive für die zuvor offenen Punkte).

Das Detailblatt ist kein Datenblatt: Jeder Rahmen ist ein echter Terrain-Render aus demselben Reich. Kleine Motive (Wechsel, Mast, Blüten, Tiere, Nest, Höhle) tragen zusätzlich einen Ring und ein Label; der Ring markiert nur die Fundstelle und zeichnet kein Motiv. Die Close-ups sind native Render bei 4,2×–6,4×, keine hochskalierten Ausschnitte.
2. **Modell/Test:** `node --test tests/world/forest-ecology.test.js`, `tests/presentation/daylight.test.js` und die bestehenden Wald-/Fauna-/Season-Tests.
3. **Browser-Regression:** `node tests/browser/terrain-stability.mjs` für Persistenz und Cache-Verhalten.
4. **Live-Benchmark:** `node tests/browser/device-benchmark.mjs` für die Landscape-Szene. Die Werte stammen aus Chromium/SwiftShader und sind keine Aussage über eine echte GPU.

Legende:

- **✅ visuell + Test** — im Referenzbild sichtbar und modellseitig geprüft.
- **◐ Test/Modell** — vorhanden und getestet, aber nicht als eigenes, isoliertes Motiv im Referenzbild.
- **⚠ Lücke/teilweise** — bewusst nicht behauptet; der konkrete Rest ist benannt.

Die Referenzbilder sind menschliche Prüfbilder, keine Pixel-Goldens. Das Laubwald-Modell umfasst 8 Baumarten und 15 Formationen; die 60 Punkte werden über diese gemeinsamen Daten und die vier Jahreszeiten geprüft.

## Einzelprüfung

| ID | Prüfpunkt | Nachweis | Status |
|---|---|---|---|
| 1.2.1.1 | Unterschiedliche Laubbaumarten und Baumformen | `forest-reference.png` · Mixed Woodland; 8 Arten in `FOREST_SPECIES`, Formen `spreading/dome/airy/round/oval/vase` | ✅ |
| 1.2.1.2 | Eichenwälder | `forest-reference.png` · Oakwood (60,42) | ✅ |
| 1.2.1.3 | Buchenwälder | `forest-reference.png` · Beechwood (90,26) | ✅ |
| 1.2.1.4 | Birkenwälder | `forest-reference.png` · Birch Grove (94,28) | ✅ |
| 1.2.1.5 | Ahornwälder | `forest-reference.png` · Maplewood (102,36) | ✅ |
| 1.2.1.6 | Kastanien-, Linden- und Ulmenbestände | `forest-reference.png` · Chestnut Grove und Linden and Elm Stand | ✅ |
| 1.2.1.7 | Unterschiedliche Baumhöhen, Stammdicken und Kronenformen | `forest-reference.png` · Ancient Woodland; `terrain-stability-level-4.png`; Höhe/Krone/Stamm in `FOREST_SPECIES` | ✅ |
| 1.2.1.8 | Junge, ausgewachsene und uralte Bäume | `forest-reference.png` · Regenerating Wood (jung), Beechwood (reif), Ancient Woodland (uralt); `AGE_SCALE` | ✅ |
| 1.2.1.9 | Abgestorbene Bäume, Stümpfe, umgestürzte Riesen | `forest-reference.png` · Windthrow, Cut-over Wood, Burn Scar; `drawSnag`, `drawStump`, `drawFallenLog` | ✅ |
| 1.2.1.10 | Baumdichten und natürliche Waldlücken | `forest-reference.png` · Ancient Woodland vs. Regenerating Wood; `canopy`, `clearing`, `treeChance` | ✅ |
| 1.2.1.11 | Mehrere Vegetationsschichten | `terrain-stability-level-4.png`; Kronen, Unterholz, Bodenstreu in `drawForestFloor` | ✅ |
| 1.2.1.12 | Dichte Abschnitte mit geschlossenem Kronendach | `forest-reference.png` · Ancient Woodland; überlappende Kronen über `forestTreeCopies` | ✅ |
| 1.2.1.13 | Lichtdurchflutete Waldlichtungen | `forest-detail-reference.png` · A light-flooded clearing (87,42); `drawForestClearing`, `flowerBloom` | ✅ |
| 1.2.1.14 | Kleine natürliche Wiesen im Wald | `forest-detail-reference.png` · A small natural meadow (86,44); `drawForestClearing`, `drawGrassTufts` | ✅ |
| 1.2.1.15 | Junge Waldregeneration mit dichtem Nachwuchs | `forest-reference.png` · Regenerating Wood; `drawSapling` | ✅ |
| 1.2.1.16 | Unterholz aus Farnen, Brombeeren und Sträuchern | `terrain-stability-level-4.png`; `drawUnderstory`, `drawFern`, `drawBramble`, `drawShrub` | ✅ |
| 1.2.1.17 | Moosbewachsene Bodenbereiche | `terrain-stability-level-4.png`; `drawMossPatch`, `ground.moss` | ✅ |
| 1.2.1.18 | Waldsäume und Übergänge zu Grasland | `forest-reference.png` · Birch Grove und Alluvial Woodland; `edge` im Bestand | ✅ |
| 1.2.1.19 | Unterschiedliche Sichtweiten und Kronendichten | `forest-reference.png` · Ancient Woodland vs. Birch Grove; `canopy`, `light` | ✅ |
| 1.2.1.20 | Natürliche Schneisen, Wildwechsel, offene Flächen | `forest-detail-reference.png` · Deer trail (114,24), ring-marked; `drawDeerTrail`, `ground.trail` | ✅ |
| 1.2.1.21 | Unterschiedliche Waldböden und Bodenfeuchtigkeit | `forest-detail-reference.png` · Alluvial wet (80,38, 70% moisture) vs. well-drained loam (65,109, 38%); `ground.soil` | ✅ |
| 1.2.1.22 | Laubteppiche aus frischen und verwitterten Blättern | `tree-seasons.png` · Tag 220–280; `drawLeafCarpet` | ✅ |
| 1.2.1.23 | Dunkle, humusreiche Böden | `terrain-stability-level-4.png`; `drawForestGround`, `ground.humus` | ✅ |
| 1.2.1.24 | Freiliegende Wurzeln, Steine, verwitterte Äste | `forest-detail-reference.png` · Roots (56,139), stones (87,61), fallen log (126,133); `drawRoots`, `drawRock`, `drawFallenLog` | ✅ |
| 1.2.1.25 | Pilzbewachsene Stümpfe und verrottendes Material | `forest-detail-reference.png` · Stump fungi (128,133) and floor fungi (88,30); `drawMushroomCluster`, `drawStump` | ✅ |
| 1.2.1.26 | Frühling mit Austrieb und hellgrünen Kronen | `forest-seasons.png` · Tag 50; `tree-seasons.png` · Tag 30/60 | ✅ |
| 1.2.1.27 | Sommer mit dichten grünen Kronen | `forest-seasons.png` · Tag 150; `forest-reference.png` | ✅ |
| 1.2.1.28 | Herbst mit gelben, orangen, roten, braunen Blättern | `forest-seasons.png` · Tag 250; `tree-seasons.png` · Tag 220–280 | ✅ |
| 1.2.1.29 | Winter mit kahlen Ästen, Laub am Boden und Schnee | `forest-seasons.png` · Tag 350; `tree-seasons.png` · Tag 310–340 | ✅ |
| 1.2.1.30 | Unterschiedliche Zeitpunkte des Laubfalls je Art | `tree-seasons.png`; `tests/world/seasonal-foliage.test.js`; `treeTiming` | ✅ |
| 1.2.1.31 | Saisonale Blüten- und Fruchtbildung | `forest-detail-reference.png` · Spring blossom (88,42) and autumn mast (104,21); `flowerBloom`, `drawMast` | ✅ |
| 1.2.1.32 | Hirsche, Rehe, Wildschweine, Füchse, Hasen | `tests/systems/forest-fauna.test.js`; `SIMULATED_SPECIES`; Fauna-Silhouetten in Wald-Frames | ✅ |
| 1.2.1.33 | Eichhörnchen, Mäuse und Kleintiere | `forest-detail-reference.png` · Squirrel herd on (71,104) and native 5,2× close-up; `forestFaunaAt` preserves `id = species`; `tests/systems/forest-fauna.test.js` | ✅ |
| 1.2.1.34 | Eulen, Spechte, Singvögel, Greifvögel | `forest-detail-reference.png` · Songbird on (97,18) and native 5,2× close-up; `FOREST_FAUNA`, `forestFaunaFor` | ✅ |
| 1.2.1.35 | Insekten, Käfer, Schmetterlinge, Ameisen | `forest-detail-reference.png` · Woodland butterfly on (89,16) and native 6,4× close-up; habitat marker in `FOREST_FAUNA` | ✅ |
| 1.2.1.36 | Tierwechsel, Nester, Höhlen, Futterplätze | `forest-detail-reference.png` · Nest and hollow on (59,46), trail (114,24), mast (104,21); `drawNest`, lower-trunk hollow | ✅ |
| 1.2.1.37 | Saisonale Wanderung und Fortpflanzungszeiten | `forest-fauna.js` (Migration, Reproduktion, Winterarten); `tests/systems/forest-fauna.test.js` und `forest-fauna-longrun.test.js` | ✅ |
| 1.2.1.38 | Bauholz aus unterschiedlichen Laubbaumarten | `forest-gathering.js` · timber ledger from real forest stock; Lumber Yard/Forester button; `forest-gathering.test.js` | ✅ |
| 1.2.1.39 | Brennholz und Holzkohle | `forest-gathering.js` · firewood/charcoal draw the real forest stock; Burn Scar and Ancient Woodland | ✅ |
| 1.2.1.40 | Pilze, Beeren, Nüsse, Wildfrüchte | `forest-gathering.js` · seasonal mushrooms, berries, acorns, beechnuts, chestnuts; `forest-gathering.test.js` | ✅ |
| 1.2.1.41 | Heilpflanzen und Kräuter | `forest-gathering.js` · seasonal herbs; Alluvial and Linden/Elm stands | ✅ |
| 1.2.1.42 | Wildfleisch, Felle, Häute | `forest-gathering.js` · hunt draws down a real herd; prime/good/lean; curing/tanning; `forest-gathering.test.js` | ✅ |
| 1.2.1.43 | Honig und Bienenwachs | `forest-gathering.js` · seasonal honey/beeswax; Linden/Elm stand | ✅ |
| 1.2.1.44 | Eicheln und natürliche Futtermittel | `forest-gathering.js` + `forest-pannage.js` · mast gathered; Stable consumes it into a bounded pannage reserve; `forest-pannage.test.js` | ✅ |
| 1.2.1.45 | Alte, urwaldähnliche Laubwälder | `forest-reference.png` · Ancient Woodland | ✅ |
| 1.2.1.46 | Helle Buchenwälder und dunkle Eichenwälder | `forest-reference.png` · Beechwood vs. Oakwood | ✅ |
| 1.2.1.47 | Lichte Birkenhaine | `forest-reference.png` · Birch Grove | ✅ |
| 1.2.1.48 | Feuchte Auenlaubwälder | `forest-reference.png` · Alluvial Woodland | ✅ |
| 1.2.1.49 | Hangwälder und steile Berglaubwälder | `forest-reference.png` · Hillside Forest | ✅ |
| 1.2.1.50 | Einzelne Baumgruppen in offenen Landschaften | `forest-detail-reference.png` · A lone tree in open country (108,74); `loneTree` branch in `terrain.js` | ✅ |
| 1.2.1.51 | Waldbrände und trockene Brandflächen | `forest-reference.png` · Burn Scar; `disturbance: burned` | ✅ |
| 1.2.1.52 | Schädlingsbefall und Baumkrankheiten | `forest-reference.png` · Diseased Stand; `disturbance: diseased` | ✅ |
| 1.2.1.53 | Sturmschäden und umgestürzte Bäume | `forest-reference.png` · Windthrow; Wurzelteiler/Logs | ✅ |
| 1.2.1.54 | Übermäßige Abholzung und Verlust des Kronendachs | `forest-reference.png` · Cut-over Wood; `stockRatio < 0.18` | ✅ |
| 1.2.1.55 | Bodenverdichtung und Überjagung | `forestRegrowthFactor` in `regrowForests`; `harvestForestGameAt` creates herd pressure from the actual removal; `forest-pressure.test.js` | ✅ |
| 1.2.1.56 | Regeneration nach Bränden, Rodungen, Sturm | `forest-reference.png` · Regenerating Wood + Burn Scar/Windthrow/Cut-over | ✅ |
| 1.2.1.57 | Sonnenstrahlen durch Kronenlücken | `forest-detail-reference.png` · Sun shaft (87,40), ring-marked; `drawCanopyLight` | ✅ |
| 1.2.1.58 | Leichter Bodennebel und feuchte Morgenstimmung | `drawForestMist` zeichnet bei 2,40× drei weiche, überlappende Nebelschwaden unter der Krone; `mist-reference.png` ist der echte 500×500-Ausschnitt des Morgenframes (Tag 150, 06:00) | ✅ |
| 1.2.1.59 | Blätterbewegung durch Wind und fallendes Laub | `sway` in `drawTree`, fallende Blätter in `drawBroadleaf`; Herbst-Frames | ✅ |
| 1.2.1.60 | Licht-/Farbwirkung nach Tageszeit und Jahreszeit | `daylight-reference.png`: Sommer/Winter × 06:00/12:00/18:00/23:00 auf Oakwood (60,42); `daylight.js` mit `timeOfDay`, Dawn-/Dusk-Gradient und Nachtveil. 12:00 bleibt Alpha 0; der Terrain-Cache wird nicht neu gerastert | ✅ |

## Vertiefung P1–P3

Die Punkte 1.2.1.1–1.2.1.60 bleiben unverändert belegt. Die folgende Vertiefung ergänzt sie, ohne die 15 Formationen oder die 8 Arten zu vermehren.

| Thema | Umsetzung | Nachweis |
|---|---|---|
| P1 Boden und Feuchte | `ground.soil` (`loam`/`humus`/`alluvial`/`dry`), Humus, Streu, Moos und Blüten; Bodenwäsche und Trockenrisse im Renderer | `forestStandAt`; `drawSoilWash`; `forest-ecology.test.js` |
| P1 Sonnenlicht | ein `solarVector` für Tageslicht-Gradient, Baumschatten, Kronenlicht und WebGL-Schatten | `daylight.js`; `terrain.js`; `terrain-webgl.js`; `daylight.test.js` |
| P1 Nebel | `forestMistFactor` aus Tageszeit, Feuchte, Jahreszeit und Wetter; kein Nebel um 12:00 und nachts | `daylight.js`; `drawForestMist`; `daylight.test.js` |
| P1 Herden | mehrere Tiere pro Herde, kleine Bewegung, Tierspuren, Verbiss, Kadaver, Nest/Höhle und sichtbare Reviermarken (Fuchs/Wildvogel) | `drawForestFaunaScene`; `drawFaunaTerritory`; `forestFaunaSignAt`; `forest-fauna.test.js` |
| P1 Mikrofauna | Käfer, Ameisen, Schmetterlinge, Bienen und Mäuse aus Totholz, Streu, Blüten und Jahreszeit | `forestMicrofaunaAt`; `drawMicroFauna`; `forest-ecology.test.js` |
| P2 Hölzer | acht artgetrennte, ganzjährig sammelbare Sorten von `oak-timber` bis `alder-timber` | `FOREST_SPECIES.wood`, `FOREST_GOODS`, `forestGoodsFor`; `forest-ecology.test.js`, `forest-gathering.test.js` |
| P2 Produkte | Chantarellen, Steinpilze, Bärlauch, Waldsauerklee, Walderdbeeren, Schlehen und Holzäpfel mit eigener Saison | `SEASON_GOODS`; `forestGoodsFor`; `forest-ecology.test.js` |
| P2 Blattformen | acht Blattsilhouetten in der Laubstreu und getrennte Linden-/Ulmen-Labels | `drawSpeciesLeaf`; `subtype`/`label`; `forest-ecology.test.js` |
| P3 Ausbreitung | Feuer, Sturm und Krankheit greifen alle 12 Tage auf ein Nachbartile über, max. 4 pro Pass, mit echtem Stockverlust und `spreadHistory` | `forest-succession.js`; `forest-succession.test.js` |
| P3 Bekämpfung | `SUPPRESS FOREST DISTURBANCE` im Lumber Yard/Forester; 90 Tage Eindämmung gegen Holz, Nahrung oder Gold | `suppressNearestForestDisturbance`; `management-ui.js`; `forest-succession.test.js` |
| P3 Langzeit | 40 Jahre auf zwei Seeds: 6,6–7,3 % aktive Störungen, Peak 9,5–10,0 % im ersten Jahr, 96,1–96,3 % Waldstock, 114 Ereignisse und ~5.323 Ausbreitungen; keine Überlastung, Raten unverändert | `tests/systems/forest-succession-longrun.test.js` |
| Performance | Streu- und Moosschleifen reduziert (19→15, 5→4), Mikrofauna auf drei Gruppen × drei Marken und Nahzoom begrenzt, ein Solarvektor statt drei Berechnungen | `terrain.js`; `terrain-webgl.js` |
| Performance Regrowth | 400-Tage-Zyklus in 400 Tagesscheiben; 576×576 mit 201.570 halb geleerten Wald-Tiles: 802 ms pro Vollpass → 2,34 ms Median / 5,71 ms Maximum pro Tagesscheibe | `regrowForests`; `resource-geography.test.js` |

Die `GL Driver Message … GPU stall due to ReadPixels` ist eine Browser-/Screenshot-Rücklesewarnung des Software-WebGL-Pfads, kein Spielcode-Fehler: im Quellbaum gibt es kein `readPixels` außer im separaten Testwerkzeug `tests/browser/terrain-perf.html`. Das Spiel rendert ausschließlich auf dem gecachten Canvas-2D-Terrain und fordert auf keinem Spielerpfad einen WebGL-/WebGPU-Kontext an; der Renderer-Schalter und die WebGL-Zeilen des Benchmarks wurden entfernt. Damit entstehen auf Software-GPUs auch keine `Automatic fallback to software WebGL`-Warnungen mehr.

## Ergebnis

- **60 Punkte** sind belegt: 52 mit dem bestehenden visuellen bzw. Modell-/Testnachweis, 8 über den neuen Forstprodukte-Ledger sowie das Verdichtungs-/Überjagungsmodell samt Tests.
- **0 Punkte** sind nur „Test/Modell“ ohne isoliertes Motiv.
- **0 Punkte** sind als offene Lücke markiert.

Die Tageszeit ist ein reiner Präsentationszustand: Sie färbt die bereits gerenderte Welt und löst keinen Terrain-Rebuild aus. Um 12:00 ist der Overlay Alpha 0, damit die Standardoptik unverändert bleibt. Der Bodennebel ist im Nahbereich sichtbar, ohne die Krone zu einem hellen Ring zu machen.

## Reproduktion

```sh
cd game
node --test tests/world/forest-ecology.test.js tests/systems/forest-fauna.test.js tests/systems/forest-fauna-longrun.test.js tests/systems/forest-gathering.test.js tests/systems/forest-pannage.test.js tests/systems/forest-succession.test.js tests/systems/forest-succession-longrun.test.js tests/world/forest-pressure.test.js tests/presentation/daylight.test.js
npm run test:forest-reference
npm run test:forest-detail
npm run test:terrain-stability
npm run test:atmosphere-reference
npm run test:device-benchmark
```

Die 60 Punkte beziehen sich auf dieselben 15 Formationen und 8 Arten. Die Bilder unter `docs/terrain-reference/` sind die visuellen Belege; `forest-reference.json` enthält die konkreten Tile-Koordinaten, Arten, Güter und Fauna.
