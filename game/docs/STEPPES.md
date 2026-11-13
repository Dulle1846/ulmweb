# Steppen 1.2.7

Die Steppe ist eine offene, aride Graslandschaft mit ausgeprägten Jahreszeiten,
geringer Deckung und realem Wasser-, Weide- und Branddruck. Sie ist kein
nebenläufiges Biom: `steppe-ecology.js` liefert dasselbe deterministische
Profil für Terrain, Sammeln, Weide-/Pferdezuchtbewertung und die
Gebäudeübersicht. Es gibt keine zusätzliche Tick-Schleife und keine neuen
Save-Felder.

## Implementierung

- **Profil:** `game/js/world/steppe-ecology.js` mit
  `steppePotentialAt()`, `isSteppeSite()`, `steppeProfileAt()`,
  `steppeProductsAt()`, `steppeGoodsFor()` und `steppeSummary()`.
- **Terrain:** `terrain.js` wählt auf offenen, warmen, trockenen Flächen das
  Steppenprofil statt des Graslandprofils. `steppe-render.js` zeichnet kurze
  und mittlere Gräser, Dornbüsche, Blüten, Kräuter, Salz, Sand, Erosion,
  saisonales Wasser, Staub, Schnee und ausgewählte Fauna.
- **Sammeln:** `gatherMeadowProducts()` und
  `gatherNearestGrasslandProducts()` erkennen Steppenflächen und nutzen
  dieselbe `FOREST_GOODS`-Ledger wie Wald- und Graslandprodukte.
- **Siedlungen:** `grasslandSiteSummaryAt()` liefert auf Steppenkacheln die
  Steppenübersicht; Farm- und Stallpanels zeigen sie ohne zweiten UI-Pfad.
- **Warenkatalog:** Neue Güter `steppe-grass`, `steppe-fibre`, `wool`, `clay`
  und `salt` werden über `FOREST_GOODS` registriert. Bestehende Güter wie
  `hay`, `game`, `hides`, `fur`, `herbs` und `wildflowers` bleiben
  unverändert.

## 56-Punkte-Audit

| ID | Umsetzung |
| --- | --- |
| 1.2.7.1 | `STEPPE_GRASSES` mit kurzen und mittleren Gräsern; `sward.height` |
| 1.2.7.2 | Trockenheitsresistente Gras-/Straucharten, `steppePotentialAt` |
| 1.2.7.3 | `thorny`-Sträucher, Dornzweige im Renderer |
| 1.2.7.4 | Saisonblüher und Heilkräuter in `flowers`/`herbs` |
| 1.2.7.5 | `shrubPatches`, Büschelgruppen im Profil und Bild |
| 1.2.7.6 | seltene `tree-island`-Formation und Bauminseln |
| 1.2.7.7 | formationsabhängige `sward.density` |
| 1.2.7.8 | `deepRoot` bei Gräsern und Sträuchern |
| 1.2.7.9 | `soil.bare`, offene Bodenflächen |
| 1.2.7.10 | `soil.chernozem`, `cropSuitability` |
| 1.2.7.11 | `soil.sand`, Staub im Profil und Renderer |
| 1.2.7.12 | `landform.hill`, hügelige Steppe |
| 1.2.7.13 | `landform.plain`, weite Ebene |
| 1.2.7.14 | `landform.gully`, Erosionsrinne |
| 1.2.7.15 | `soil.salt`, Salzflächen |
| 1.2.7.16 | `landform.seasonalPool`, saisonale Senke |
| 1.2.7.17 | `season.summerHeat`, heiße Sommer |
| 1.2.7.18 | `season.winterCold`, kalte Winter |
| 1.2.7.19 | `season.temperatureRange` |
| 1.2.7.20 | `season.seasonalRain` |
| 1.2.7.21 | `season.drought`, Dürrephasen |
| 1.2.7.22 | `springBloom` und Frühjahrsblüte |
| 1.2.7.23 | `summerScorch`, Sommertrocknung |
| 1.2.7.24 | `visual.snowCover`, Schneesteppe |
| 1.2.7.25 | Wildpferd `tarpan`, Steppenschaf |
| 1.2.7.26 | Saiga-Antilope in offenen Ebenen |
| 1.2.7.27 | Murmeltier, Erdhörnchen, Jerboa mit `burrow` |
| 1.2.7.28 | Steppenwolf und Steppenfuchs |
| 1.2.7.29 | Steppenadler und Turmfalke |
| 1.2.7.30 | Großtrappe mit `groundNesting` |
| 1.2.7.31 | Steppenheuschrecke und Steppenbiene |
| 1.2.7.32 | wandernde Herden über `migratory` |
| 1.2.7.33 | `pasture`, Weideland |
| 1.2.7.34 | `game`, `hides`, `fur` aus Jagd |
| 1.2.7.35 | `medicine`-Kräuter |
| 1.2.7.36 | `chernozem` und Getreideeignung |
| 1.2.7.37 | `materials.clay`, Tonvorkommen |
| 1.2.7.38 | `materials.stone`, oberflächennahe Mineralien |
| 1.2.7.39 | `wool`, `hides`, Tierhäute |
| 1.2.7.40 | `steppe-fibre`, Pflanzenfasern |
| 1.2.7.41 | `nomadism` aus Weide, Wasser und Sichtlinien |
| 1.2.7.42 | `pastureArea`, große Weidegebiete |
| 1.2.7.43 | `horseBreeding`, Pferdezuchtbedingungen |
| 1.2.7.44 | `sightlines`, weite Sicht |
| 1.2.7.45 | `cover`, wenige Deckungsmöglichkeiten |
| 1.2.7.46 | `waterholes`, Wasserstellen |
| 1.2.7.47 | `settlementDistance`, Siedlungsabstände |
| 1.2.7.48 | `seasonalMigration`, saisonale Wanderung |
| 1.2.7.49 | `hazards.drought` |
| 1.2.7.50 | `hazards.dustStorm`, Staubstürme |
| 1.2.7.51 | `hazards.waterScarcity` |
| 1.2.7.52 | `hazards.fire`, Steppenbrände |
| 1.2.7.53 | `hazards.overgrazing` |
| 1.2.7.54 | `hazards.foodShortage` |
| 1.2.7.55 | `hazards.extremeWinter` |
| 1.2.7.56 | `hazards.soilDegradation` |

## Verifikation

- `node --test tests/world/steppe-ecology.test.js tests/presentation/steppe-render.test.js`
  prüft alle 56 IDs, die Vollständigkeit der Vokabulare, Determinismus,
  Wertebereiche, Jahreszeiten, Waren, Gefahren und den Renderer.
- Der Sampler im Test erreicht alle 56 IDs über trockene, fruchtbare, hügelige,
  versalzene und überweidete Kacheln in vier Jahreszeiten.
- Die bestehenden Grasland-, Wald-, Inventar- und UI-Tests bleiben die
  Regressionsbasis; die Steppe teilt ihre Pfade, statt sie zu duplizieren.
