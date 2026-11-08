# Laubwälder 1.2.1 — Prüfprotokoll

Stand: 8. November 2026  
Bezug: `# 1.2.1 Laubwälder`, Punkte 1.2.1.1–1.2.1.60

## Prüfverfahren

Die Prüfung kombiniert vier Nachweisarten:

1. **Visuell:** `docs/terrain-reference/forest-reference.png` (15 echte Formationen bei 2,40×), `forest-seasons.png` (ein Ancient Wood an Tag 50/150/250/350), `tree-seasons.png` (acht Tage von Herbst bis Frühling), `terrain-stability-level-4.png` (Nahansicht), `contact-sheet.png` (vier Zoomstufen über vier Jahreszeiten), `daylight-reference.png` (acht Tageszeit-Frames) und `mist-reference.png` (Nahaufnahme des Bodennebels).
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
| 1.2.1.13 | Lichtdurchflutete Waldlichtungen | `drawForestClearing`; `forest-reference.png` · Woodland-Frames; `flowerBloom` | ◐ |
| 1.2.1.14 | Kleine natürliche Wiesen im Wald | `drawForestClearing`, `drawGrassTufts`; Clearing-Anteil in `forestStandAt` | ◐ |
| 1.2.1.15 | Junge Waldregeneration mit dichtem Nachwuchs | `forest-reference.png` · Regenerating Wood; `drawSapling` | ✅ |
| 1.2.1.16 | Unterholz aus Farnen, Brombeeren und Sträuchern | `terrain-stability-level-4.png`; `drawUnderstory`, `drawFern`, `drawBramble`, `drawShrub` | ✅ |
| 1.2.1.17 | Moosbewachsene Bodenbereiche | `terrain-stability-level-4.png`; `drawMossPatch`, `ground.moss` | ✅ |
| 1.2.1.18 | Waldsäume und Übergänge zu Grasland | `forest-reference.png` · Birch Grove und Alluvial Woodland; `edge` im Bestand | ✅ |
| 1.2.1.19 | Unterschiedliche Sichtweiten und Kronendichten | `forest-reference.png` · Ancient Woodland vs. Birch Grove; `canopy`, `light` | ✅ |
| 1.2.1.20 | Natürliche Schneisen, Wildwechsel, offene Flächen | `drawDeerTrail`, `drawForestClearing`; `ground.trail`, `clearing` | ◐ |
| 1.2.1.21 | Unterschiedliche Waldböden und Bodenfeuchtigkeit | `forest`-Metadaten: `soil`, `humus`, `moisture`; Alluvial vs. Hillside | ◐ |
| 1.2.1.22 | Laubteppiche aus frischen und verwitterten Blättern | `tree-seasons.png` · Tag 220–280; `drawLeafCarpet` | ✅ |
| 1.2.1.23 | Dunkle, humusreiche Böden | `terrain-stability-level-4.png`; `drawForestGround`, `ground.humus` | ✅ |
| 1.2.1.24 | Freiliegende Wurzeln, Steine, verwitterte Äste | `drawRoots`, `drawRock`, `drawFallenLog`; Nahansicht | ◐ |
| 1.2.1.25 | Pilzbewachsene Stümpfe und verrottendes Material | `drawMushroomCluster`, `drawStump`, `ground.mushrooms`; Nahansicht | ◐ |
| 1.2.1.26 | Frühling mit Austrieb und hellgrünen Kronen | `forest-seasons.png` · Tag 50; `tree-seasons.png` · Tag 30/60 | ✅ |
| 1.2.1.27 | Sommer mit dichten grünen Kronen | `forest-seasons.png` · Tag 150; `forest-reference.png` | ✅ |
| 1.2.1.28 | Herbst mit gelben, orangen, roten, braunen Blättern | `forest-seasons.png` · Tag 250; `tree-seasons.png` · Tag 220–280 | ✅ |
| 1.2.1.29 | Winter mit kahlen Ästen, Laub am Boden und Schnee | `forest-seasons.png` · Tag 350; `tree-seasons.png` · Tag 310–340 | ✅ |
| 1.2.1.30 | Unterschiedliche Zeitpunkte des Laubfalls je Art | `tree-seasons.png`; `tests/world/seasonal-foliage.test.js`; `treeTiming` | ✅ |
| 1.2.1.31 | Saisonale Blüten- und Fruchtbildung | `flowerBloom`; Frühjahrs-Frames; `acorns`, `beechnuts`, `chestnuts` in `forestGoodsFor` | ◐ |
| 1.2.1.32 | Hirsche, Rehe, Wildschweine, Füchse, Hasen | `tests/systems/forest-fauna.test.js`; `SIMULATED_SPECIES`; Fauna-Silhouetten in Wald-Frames | ✅ |
| 1.2.1.33 | Eichhörnchen, Mäuse und Kleintiere | `forestFaunaFor`, `tests/systems/forest-fauna.test.js` | ◐ |
| 1.2.1.34 | Eulen, Spechte, Singvögel, Greifvögel | `FOREST_FAUNA`; `forestFaunaFor`; `tests/systems/forest-fauna.test.js` | ◐ |
| 1.2.1.35 | Insekten, Käfer, Schmetterlinge, Ameisen | Habitat-Marker in `FOREST_FAUNA`; `drawForestFauna` | ◐ |
| 1.2.1.36 | Tierwechsel, Nester, Höhlen, Futterplätze | `drawDeerTrail`, `drawNest`, `tree`-Höhle; `ground.trail` | ◐ |
| 1.2.1.37 | Saisonale Wanderung und Fortpflanzungszeiten | `forest-fauna.js` (Migration, Reproduktion, Winterarten); `tests/systems/forest-fauna.test.js` und `forest-fauna-longrun.test.js` | ✅ |
| 1.2.1.38 | Bauholz aus unterschiedlichen Laubbaumarten | `forest-reference.json` · `timber`; `FOREST_SPECIES.*.timber` | ◐ |
| 1.2.1.39 | Brennholz und Holzkohle | `firewood`, `charcoal`; Burn Scar und Ancient Woodland | ◐ |
| 1.2.1.40 | Pilze, Beeren, Nüsse, Wildfrüchte | `forestGoodsFor`; `mushrooms`, `berries`, `acorns`, `beechnuts`, `chestnuts` | ◐ |
| 1.2.1.41 | Heilpflanzen und Kräuter | `herbs`; Alluvial/Linden|Ulmen-Frames | ◐ |
| 1.2.1.42 | Wildfleisch, Felle, Häute | `game`, `hides`; Jagd-/Fauna-Modell | ◐ |
| 1.2.1.43 | Honig und Bienenwachs | `honey`, `beeswax`; Linden-and-Elm-Stand | ◐ |
| 1.2.1.44 | Eicheln und natürliche Futtermittel | `acorns`; Oakwood; `forestGoodsFor` | ◐ |
| 1.2.1.45 | Alte, urwaldähnliche Laubwälder | `forest-reference.png` · Ancient Woodland | ✅ |
| 1.2.1.46 | Helle Buchenwälder und dunkle Eichenwälder | `forest-reference.png` · Beechwood vs. Oakwood | ✅ |
| 1.2.1.47 | Lichte Birkenhaine | `forest-reference.png` · Birch Grove | ✅ |
| 1.2.1.48 | Feuchte Auenlaubwälder | `forest-reference.png` · Alluvial Woodland | ✅ |
| 1.2.1.49 | Hangwälder und steile Berglaubwälder | `forest-reference.png` · Hillside Forest | ✅ |
| 1.2.1.50 | Einzelne Baumgruppen in offenen Landschaften | `loneTree`-Pfad in `terrain.js`; `contact-sheet.png` (Landschaft) | ◐ |
| 1.2.1.51 | Waldbrände und trockene Brandflächen | `forest-reference.png` · Burn Scar; `disturbance: burned` | ✅ |
| 1.2.1.52 | Schädlingsbefall und Baumkrankheiten | `forest-reference.png` · Diseased Stand; `disturbance: diseased` | ✅ |
| 1.2.1.53 | Sturmschäden und umgestürzte Bäume | `forest-reference.png` · Windthrow; Wurzelteiler/Logs | ✅ |
| 1.2.1.54 | Übermäßige Abholzung und Verlust des Kronendachs | `forest-reference.png` · Cut-over Wood; `stockRatio < 0.18` | ✅ |
| 1.2.1.55 | Bodenverdichtung und Überjagung | `compaction`, `huntingPressure` im Bestand; Ressourcen-/Fauna-Tests | ◐ |
| 1.2.1.56 | Regeneration nach Bränden, Rodungen, Sturm | `forest-reference.png` · Regenerating Wood + Burn Scar/Windthrow/Cut-over | ✅ |
| 1.2.1.57 | Sonnenstrahlen durch Kronenlücken | `drawCanopyLight`; Clearing-/Lückenlogik | ◐ |
| 1.2.1.58 | Leichter Bodennebel und feuchte Morgenstimmung | `drawForestMist` zeichnet bei 2,40× drei weiche, überlappende Nebelschwaden unter der Krone; `mist-reference.png` ist der echte 500×500-Ausschnitt des Morgenframes (Tag 150, 06:00) | ✅ |
| 1.2.1.59 | Blätterbewegung durch Wind und fallendes Laub | `sway` in `drawTree`, fallende Blätter in `drawBroadleaf`; Herbst-Frames | ✅ |
| 1.2.1.60 | Licht-/Farbwirkung nach Tageszeit und Jahreszeit | `daylight-reference.png`: Sommer/Winter × 06:00/12:00/18:00/23:00 auf Oakwood (60,42); `daylight.js` mit `timeOfDay`, Dawn-/Dusk-Gradient und Nachtveil. 12:00 bleibt Alpha 0; der Terrain-Cache wird nicht neu gerastert | ✅ |

## Ergebnis

- **39 Punkte** sind visuell und modellseitig belegt.
- **21 Punkte** sind als „Test/Modell“ markiert: vorhanden und getestet, aber ohne isolierte Einzelmotiv-Aufnahme (u. a. Waldlichtung, Wiese, Wechsel, Böden, Wurzeln/Pilze, Forstprodukte).
- **0 Punkte** sind noch als offene Lücke markiert.

Die Tageszeit ist ein reiner Präsentationszustand: Sie färbt die bereits gerenderte Welt und löst keinen Terrain-Rebuild aus. Um 12:00 ist der Overlay Alpha 0, damit die Standardoptik unverändert bleibt. Der Bodennebel ist im Nahbereich sichtbar, ohne die Krone zu einem hellen Ring zu machen.

## Reproduktion

```sh
cd game
node --test tests/world/forest-ecology.test.js tests/systems/forest-fauna.test.js tests/systems/forest-fauna-longrun.test.js
npm run test:forest-reference
npm run test:terrain-stability
npm run test:atmosphere-reference
npm run test:device-benchmark
```

Die 60 Punkte beziehen sich auf dieselben 15 Formationen und 8 Arten. Die Bilder unter `docs/terrain-reference/` sind die visuellen Belege; `forest-reference.json` enthält die konkreten Tile-Koordinaten, Arten, Güter und Fauna.
