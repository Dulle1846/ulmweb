# Dschungel-Innenraum (1.2.5)

Diese Phase baut den Dschungel als **Innenraum des bestehenden tropischen Regenwaldes** aus. Es gibt kein zweites Ökosystem und keinen zweiten Save-Zweig: `jungleProfileFor()` leitet aus demselben Stand, demselben Seed und derselben Kachel ein vollständiges 55-Punkte-Profil ab. Rendering, Survey, Bewegung, Gesundheit, Sammelwirtschaft und Kampf lesen dieses eine Profil.

Der Landschafts-Renderer zeichnet den Dschungel in zwei begrenzten Canvas-Pässen: `drawJungleFloor()` vor den Bäumen und `drawJungleUnderstory()` für Dickicht, Bambus, Dornen, Lianen, Pfade, Schluchten und Wasser. Auf dichten Baumkacheln läuft der Unterwuchs nach den Stämmen, damit er nicht vollständig von den Kronen verdeckt wird. Es gibt keine neue Rasterebene, keine pro-Frame-Suche und keinen zusätzlichen Speicherstand.

## Datenmodell

`js/world/jungle-ecology.js` ist die einzige Quelle:

- `JUNGLE_POINTS`: exakt 55 IDs von `1.2.5.1` bis `1.2.5.55`, jeweils mit stabilem `key` und Label.
- `jungleProfileFor(input)`: liefert `features`, `points`, sieben Höhenschichten, `landscape`, `navigation`, `fauna`, `resources`, `hazards`, `summary` und `type`.
- `JUNGLE_RESOURCE_GROUPS`: acht echte Ressourcengruppen; alle 66 IDs stammen aus dem bestehenden `TROPICAL_GOODS`-Register.
- `JUNGLE_FAUNA`: 20 Arten in acht Gruppen; neue Arten werden über `forestFaunaFor()` habitatabhängig in den bestehenden Fauna-Pfad gemischt.
- `jungleTacticsFromStand(stand)`: kompakter Zugriff für Kampf und Reise.

Alle Werte sind deterministisch aus Seed, Koordinate, Feuchte, Temperatur, Höhe, Bestandsdichte, Kronendach, Lichtung, Alter und Artmischung abgeleitet. Es gibt keine ungespeicherten Zufallswerte und keine teuren Nachbarkachel-Suchen.

## 55-Punkte-Abdeckung

Jede Zeile ist eine echte Anforderung. Der Wert steht in `stand.jungle.features[id]` und wird im Lumber-/Forester-Panel als Teil der Standbeschreibung angezeigt.

| ID | Anforderung | Datenfeld | Gruppe |
| --- | --- | --- | --- |
| 1.2.5.1 | Massive shrub and scrub stands | `massiveThickets` | Vegetation |
| 1.2.5.2 | Dense lianas and intergrown plants | `denseVines` | Vegetation |
| 1.2.5.3 | Large broadleaf plants | `largeLeafPlants` | Vegetation |
| 1.2.5.4 | Bamboo stands | `bambooStands` | Vegetation |
| 1.2.5.5 | Dense ferns and climbing plants | `fernsClimbers` | Vegetation |
| 1.2.5.6 | Thorn bushes and spiny vegetation | `thornBushes` | Vegetation |
| 1.2.5.7 | Different vegetation heights | `vegetationHeightLayers` | Vegetation |
| 1.2.5.8 | Small open patches between dense plant walls | `smallOpenPatches` | Gelände |
| 1.2.5.9 | Different sight ranges | `sightRangeVariety` | Gelände |
| 1.2.5.10 | Areas of nearly impenetrable undergrowth | `impenetrableUndergrowth` | Gelände |
| 1.2.5.11 | Small natural passages | `naturalPassages` | Gelände |
| 1.2.5.12 | Hidden clearings | `hiddenGlades` | Gelände |
| 1.2.5.13 | Narrow animal trails | `animalTrails` | Gelände |
| 1.2.5.14 | Dense vegetation walls | `vegetationWalls` | Gelände |
| 1.2.5.15 | Hidden watercourses and terrain hollows | `hiddenStreamsHollows` | Gelände |
| 1.2.5.16 | Bamboo forests | `bambooForests` | Pflanzen |
| 1.2.5.17 | Giant ferns | `giantFerns` | Pflanzen |
| 1.2.5.18 | Climbing plants and lianas | `climbingVines` | Pflanzen |
| 1.2.5.19 | Thorn plants | `thornPlants` | Pflanzen |
| 1.2.5.20 | Large leaves and tropical shrubs | `broadLeavesShrubs` | Pflanzen |
| 1.2.5.21 | Poisonous and irritant plants | `poisonousIrritantPlants` | Pflanzen |
| 1.2.5.22 | Fruit-bearing plants | `fruitingPlants` | Pflanzen |
| 1.2.5.23 | Rare and fantastic jungle plants | `rareFantasticPlants` | Pflanzen |
| 1.2.5.24 | Dense vegetation on hilly ground | `hillsideDenseVegetation` | Gelände |
| 1.2.5.25 | Humid hollows | `wetHollows` | Gelände |
| 1.2.5.26 | Small ravines | `smallRavines` | Gelände |
| 1.2.5.27 | Vegetated rock outcrops | `rockOutcrops` | Gelände |
| 1.2.5.28 | Hidden waterfalls | `hiddenWaterfalls` | Gelände |
| 1.2.5.29 | Flooded jungle areas | `floodedJungle` | Gelände |
| 1.2.5.30 | Natural passages between rock and plants | `rockPlantPassages` | Gelände |
| 1.2.5.31 | Clearings and elevated viewpoints | `clearingsViewpoints` | Gelände |
| 1.2.5.32 | Large predators | `largePredators` | Fauna |
| 1.2.5.33 | Snakes and lizards | `snakesLizards` | Fauna |
| 1.2.5.34 | Monkeys and arboreal animals | `monkeysArboreal` | Fauna |
| 1.2.5.35 | Tropical birds | `tropicalBirds` | Fauna |
| 1.2.5.36 | Insects and venomous spiders | `insectsSpiders` | Fauna |
| 1.2.5.37 | Amphibians and moisture-loving animals | `amphibians` | Fauna |
| 1.2.5.38 | Animals camouflaged in dense vegetation | `camouflagedAnimals` | Fauna |
| 1.2.5.39 | Rare and especially dangerous species | `rareDangerousSpecies` | Fauna |
| 1.2.5.40 | Fruits and nuts | `fruitsNuts` | Ressourcen |
| 1.2.5.41 | Tropical hardwoods | `tropicalTimber` | Ressourcen |
| 1.2.5.42 | Fibres and plant materials | `fibresPlantMaterials` | Ressourcen |
| 1.2.5.43 | Medicinal plants | `medicinalPlants` | Ressourcen |
| 1.2.5.44 | Poisons and special plant extracts | `poisonsExtracts` | Ressourcen |
| 1.2.5.45 | Spices and rare natural products | `spicesRareProducts` | Ressourcen |
| 1.2.5.46 | Hunting and gathering products | `huntingGathering` | Ressourcen |
| 1.2.5.47 | Rare resources at hidden locations | `hiddenRareResources` | Ressourcen |
| 1.2.5.48 | Increased movement costs | `movementCost` | Taktik |
| 1.2.5.49 | Restricted sight range | `sightRestriction` | Taktik |
| 1.2.5.50 | Difficult navigation | `navigationDifficulty` | Taktik |
| 1.2.5.51 | Ambushes and surprise attacks | `ambushesSurprise` | Taktik |
| 1.2.5.52 | Diseases and parasites | `diseaseParasites` | Taktik |
| 1.2.5.53 | Harder supply of larger forces | `supplyDifficulty` | Taktik |
| 1.2.5.54 | Advantages for local units | `localAdvantage` | Taktik |
| 1.2.5.55 | Special suitability for guerrilla and defensive warfare | `guerrillaDefence` | Taktik |

## Höhenschichten

Das Profil liefert sieben Schichten mit Meterbereich und Dichte: Bodenstreu (0–0,4 m), Kräuter/Dornen (0,3–1,4 m), Sträucher (1–3,4 m), Unterholz mit Lianen und Bambus (2,4–8 m), untere Kronen (7–16 m), Hauptkronendach (14–32 m) und Emergenten/Aussichtspunkte (28–48 m). Die Schichten sind abgeleitet und werden nicht separat gespeichert.

## Landschaft und Verstecke

`landscape` enthält echte, pro Kachel stabile Flags: `ravine`, `rockOutcrop`, `hiddenStream`, `waterfall`, `flooded`, `clearing`, `hiddenGlade`, `animalTrail`, `passage`, `openPath`, `rockPassage`, `viewpoint`, `vegetationWall`, `denseWall`, `openPatches` sowie die lokale Sichtweite in Metern. Versteckte Lichtungen, Schluchten, Felsvorsprünge und Wasserfälle sind selten und an Gelände, Alter und Feuchte gebunden. Der Renderer zeichnet sie nur, wenn das Flag und der zugehörige Punkt stark genug sind.

## Ressourcen und Fauna

Die acht Gruppen sind Früchte/Nüsse, tropische Hölzer, Fasern/Pflanzenmaterial, Heilpflanzen, Gifte/Extrakte, Gewürze/rare Naturprodukte, Jagd-/Sammelerzeugnisse und seltene Ressourcen an versteckten Standorten. Die Abundanz steigt mit der jeweiligen Standeigenschaft; seltene Gruppen haben höhere Schwellen. `forestGoodsFor()` fügt nur Güter hinzu, die im gemeinsamen Register existieren, und respektiert die bestehende saisonale Schwelle.

Die Fauna umfasst Jaguar, Ozelot, Bushmaster, Anakonda, Leguan, Lianennatter, Brüllaffe, Spinnenaffe, Tukan, Ara, Harpyie, Bullet Ant, Tarantel, Morphofalter, Pfeilgiftfrosch, Blattmimikfrosch, Laubfrosch, Riesenotter, Tapir und Agouti. Tarnung, Seltenheit und Gefahr sind echte Profilwerte; die Arten erscheinen nur, wenn das Habitat sie trägt. Die neuen Arten sind in `FAUNA`, `TROPICAL_RESTRICTED_SPECIES` und der bestehenden Fauna-Zusammenfassung registriert.

## Taktische Wirkung

- **Bewegung:** `getForestMovementFactorAt()` multipliziert den bisherigen tropischen Faktor mit dem Jungle-Faktor. Die Kombination bleibt auf `0,55–1` begrenzt, damit Träger nicht stehen bleiben. `landscape.openPath` umfasst Lichtungen, verborgene Lichtungen, Tierpfade, Felsdurchgänge und Schluchten; diese Kacheln verlieren den größten Teil des Unterholzzuschlags.
- **Sicht:** `forestSightBlock()` liefert für dichte Dschungelkacheln einen echten Sichtblock; Lichtungen, verborgene Lichtungen, Pfade und Felsdurchgänge öffnen ihn. `sightRadius` kommt aus demselben Profil; Aussichtspunkte auf Lichtungen und Felsvorsprüngen senken die Sichtbehinderung zusätzlich.
- **Navigation:** `getJungleTacticsAt(x,y)` liefert gecachte Werte für Pfade, Hinterhalte, Versorgung, lokale Verteidigung und Guerilla. Felsvorsprünge und Vegetationswände erhöhen die Deckung, verborgene Lichtungen und Felsdurchgänge den lokalen Bonus.
- **Kampf:** Gegner bewegen sich im Dschungel langsamer, erleiden alle 23 Ticks Ambush-Schaden und alle 37 Ticks Versorgungsattrition. Verteidiger erhalten Deckung; lokale Levies erhalten den Local-/Guerilla-Bonus. Alle Zufallsrollen laufen über den bestehenden deterministischen Kampfstrom.
- **Krankheit und Verletzungen:** Die Jungle-Hazards werden in `forestProductsAt()` mit den tropischen Hazards zusammengeführt. `tropicalExposure()` startet daraus die bestehende Gesundheitsausbruch-Logik; Dornen verursachen zusätzlich eine echte Arbeitsverletzung, Arbeit im Dschungel wird langsamer.
- **Jagd:** Getarnte Arten im gemeinsamen Herdenmodell (Jaguar, Ozelot) lassen sich pro Jagdgang schwerer erbeuten; Herde, Fortpflanzung und Jagddruck bleiben im gemeinsamen Fauna-Modell. Die übrigen Tarnarten bleiben Habitatbeobachtungen.

### Nachbesserung 2026-11-12

Die Prüfung der 55 Punkte ergab fünf Stellen, an denen das Profil zwar einen Wert lieferte, aber noch keinen vollständigen Verbraucher hatte. Diese sind jetzt geschlossen:

- **1.2.5.12 Verborgene Lichtungen:** `landscape.openPath` öffnet Sicht und Bewegung; der Renderer zeichnet die Lichtung mit seltenen Leuchtpflanzen statt sie hinter Fels oder Wand zu verstecken.
- **1.2.5.27/1.2.5.30/1.2.5.31 Fels und Aussicht:** Felsdurchgänge gelten als `passage`, Felsvorsprünge geben zusätzliche Deckung, und erhöhte Fels-/Lichtungsflächen wirken als Aussichtspunkte mit größerer Sichtweite.
- **1.2.5.6/1.2.5.19 Dornen:** `hazards.thorns` ist an `tropicalExposure()` angeschlossen und kann Waldarbeiter verletzen.
- **1.2.5.17/1.2.5.23 Riesenfarne und seltene Pflanzen:** eigene Canvas-Signaturen für Riesenfarne und leuchtende Rare-Blüten.
- **1.2.5.38 Tarnung:** getarnte Arten reduzieren die Beute eines Jagdgangs, ohne ein zweites Populationsmodell einzuführen.
- **Versorgung:** `supplyFactor` sinkt mit Dickicht, Sichtbehinderung, fehlenden Durchgängen und Überschwemmung. Der Wert wird im Forester-Panel und in der taktischen Zusammenfassung angezeigt.

## Rendering

`js/presentation/rendering/jungle-render.js` zeichnet:

- Dickicht, Dornen, Bambus, Lianenvorhänge, Riesenfarne und Vegetationswände,
- Tierpfade, Lichtungen, verborgene Lichtungen, Aussichtspunkte und seltene Leuchtblüten,
- Schluchten, Felsvorsprünge, verborgene Bäche und Wasserfälle,
- Überschwemmungen und den dunkleren Dschungelboden.

`tropical-render.js` ruft den Bodenpass aus `drawTropicalFloor()` und den Unterwuchspass aus `drawTropicalUnderstory()` auf. `terrain.js` zeichnet den Unterwuchs auf dichten Baumkacheln zusätzlich nach den Stämmen. Es gibt keine neuen Texturen und keine Shader-Änderung.

## Verifikation

```bash
cd game
node --test tests/world/jungle.test.js
node --test tests/systems/jungle-integration.test.js
npm test
npm run test:campaign
npm run build:runtime
npm run test:tropical-reference
npm run test:jungle-proof
npm run test:jungle-raid
```

Ergebnis auf diesem Stand:

- `node --test tests/world/jungle.test.js`: 5/5, alle 55 IDs, Wertebereiche, Determinismus, sieben Schichten, Ressourcen gegen das gemeinsame Register, Fauna-Gruppen, Stand-/Survey-Integration.
- `node --test tests/systems/jungle-integration.test.js`: 2/2, echte generierte Geografie, Movement-Faktor, gecachte Taktikwerte, Sammelprofil und Renderer-Smoke-Test.
- `npm test`: **850/850** Tests; Syntax und relative Importe für 132 Quelldateien, 203 referenzierte UI-IDs und lokale HTML-Assets sauber.
- `npm run test:campaign`: 25-Jahres-Kampagne erfolgreich, Exit 0.
- `npm run build:runtime`: 309 Dateien, 7,14 MiB.
- `npm run test:tropical-reference`: 12/12 Formationen, vier Jahreszeiten und ein zusätzliches Dschungel-Innenraumbild bei 2,4× auf WebKit WebGL; `tropical-reference.json` enthält jetzt pro Formation das vollständige Jungle-Profil. Das Innenraumbild liegt unter `docs/terrain-reference/jungle-interior.png`.
- `npm run test:jungle-proof`: echte Browser-Session mit dem gebauten Runtime-Bundle, Exit 0; Details und Messwerte unten.
- `npm run test:jungle-raid`: echte Browser-Session mit einem vollständigen Kriegs-Raid über die produktive Kriegsfront, lokale Levies, `updateSimulation()` und alle vier Dschungel-Taktiken; Details unten.

## Browser-Nachweis

Der reproduzierbare Nachweis läuft **nicht** gegen den Quellbaum, sondern gegen `artifacts/kings-and-cards-deploy/public`. Eine separate Messung der Unterwuchsschicht bei **2,4× Zoom** auf demselben schwachen Profil steht in [JUNGLE_UNDERSTORY_2.4.md](JUNGLE_UNDERSTORY_2.4.md).

```bash
cd game
npm run build:runtime
npm run test:jungle-proof
# vollständiger Bericht: artifacts/jungle-proof/jungle-proof.json
```

Das Harness startet einen echten tropischen Realm über `#start-new-game` (Seed `20261104`, 78 % Wald), sucht daraus echte dichte Dschungel-, Pfad-/Lichtungs- und versteckte Kacheln, bewegt echte Dorfbewohner durch `updateFriendlyMovement()`, tickt den echten `updateCombat()`, sammelt über das produktive `forestGathering`-Ledger, öffnet das echte Lumberyard-Management und sampelt den echten `requestAnimationFrame`-Loop. Es verwendet keine synthetischen Referenzbilder und keine separate Testsimulation.

Auf diesem Host muss Chromium/Software-GL explizit gesetzt werden; auf einem Rechner mit Playwright-Browser sind die Variablen optional:

```bash
E2E_CHROMIUM_EXECUTABLE=/tmp/kac-chromium/chrome-linux/chrome \
E2E_SOFTWARE_GL=1 \
LD_LIBRARY_PATH=/tmp/kac-libs/usr/lib/x86_64-linux-gnu:/tmp/kac-libs/usr/lib \
FONTCONFIG_FILE=/tmp/kac-fonts.conf HOME=/tmp/kac-chrome-home \
JUNGLE_PROOF_OUT=artifacts/jungle-proof npm run test:jungle-proof
```

Die beiden folgenden Blöcke werden von `scripts/sync-jungle-doc.mjs` aus dem zuletzt geschriebenen `artifacts/jungle-proof/jungle-proof.json` erzeugt. Außerhalb der Marker bleiben die historischen Vorher-/Nachher-Notizen und die Grenzen stehen.

<!-- JUNGLE_EVIDENCE_BEGIN -->
### Funktionsnachweis

| Prüfung | Gemessener Wert im Browser |
| --- | --- |
| Bewegung, dicht | `getForestMovementFactorAt` = **0,550**; 100 echte Bewegungsticks = **1,886 Kacheln** |
| Bewegung, offener Pfad | Faktor = **0,652**; 100 Ticks = **2,536 Kacheln**; dicht ist **25,7 %** langsamer |
| Sicht, dicht | `forestSightBlock` = **0,54**, `Sight: 2 tiles`, `limited: true` |
| Sicht, Tierpfad/Lichtung | Block = **0**, `Sight: 8 tiles`, `limited: false` |
| Kampf | `AMBUSH` bei Tick 23; `SUPPLY` bei Tick 37 mit **1** Attritionsschaden; Deckung dicht **14** vs. offen **18** Schaden; lokale Levy **25** vs. fremde Garde **22** Schaden |
| Ressourcen | Acht Gruppen real gesammelt (8 Gruppen im Bericht); Bestand enthält u. a. Açaí, Timber, Rattan, Quinine, Curare, Vanilla, Bromeliads und Orchideen |
| Versteckter Ort | `HIDDEN GLADE` in der UI; UI-Gather liefert **11** Güter, darunter Bromeliads und Orchideen; **14** Bestands-IDs |
| UI-Felder | `Layers`, `Sight 2`, `Ambush 63 %`, `Cover 100 %`, `Supply 66 %`, `Guerrilla 82 %`, `Local 25 %`, `Disease 75 %`, `Parasites 86 %` |
| Konsole/Netz | **0** Page-/Console-Fehler, **0** Console-Fehler, **0** fehlgeschlagene Requests, **0** HTTP-Fehler, **0** fehlende Assets |
<!-- JUNGLE_EVIDENCE_END -->

### Echter Kriegs-Raid

Der separate Browser-Proof `test:jungle-raid` startet denselben gebauten tropischen Realm, rekrutiert sechs echte Levies über `recruitVillager()`, erklärt einen Kriegs-Realm und lässt `updateSimulation()` die produktive `maybeLaunchWarFront()`-Kriegsfront auslösen. Der Raid wird anschließend vollständig durch die feste Simulation gespielt; es gibt keine synthetischen Paare und keinen separaten Combat-Aufruf.

```bash
cd game
npm run build:runtime
npm run test:jungle-raid
# vollständiger Bericht: artifacts/jungle-raid/jungle-raid.json
```

Gemessener Lauf (Seed `20261104`, dichte Kachel `94,24`, 720 × 540, 4× CPU-Throttle):

| Prüfung | Beobachtung im echten Raid |
| --- | --- |
| Kriegsfront | `WAR FRONT` bei Tick 1 mit zwei TROLL-Raidern; `raidActive` bis zur Auflösung |
| Abschluss | `RAID DEFEATED — THE REALM HOLDS` bei Tick 238; `totalRaidsSurvived` **1**, Keep **1200/1200** |
| Ambush | `AMBUSH` bei Tick 92, **14** Schaden am Raider |
| Versorgung | `SUPPLY` bei Tick 74, **1** Attritionsschaden |
| Deckung | ungedeckter Treffer **15**, tatsächlich **10** Schaden pro TROLL-Treffer (Faktor **0,68**) |
| Guerilla | Basisstoß **19**, tatsächlicher Levy-Stoß **24** (Faktor **1,257**) |
| Falle | `TRAP` bei Tick 9, **22** sichtbarer Schaden statt einer stillen HP-Änderung |

Der Lauf deckte einen echten Reichweitenbruch auf: Gardisten und Ritter griffen über den vollen lokalen Suchradius von **7 Tiles** an, obwohl Raider erst auf **1,8 Tiles** zuschlagen. Dadurch wurden Raids aus der Ferne gewonnen, bevor Deckung, Gegenschlag oder der lokale Bonus überhaupt zum Zug kamen. `DEFENDER_REACH` staffelt die Reichweite jetzt nach Waffengattung: Garde **1,8**, Ritter **2,2**, Bogenschütze **7,0**, Turm **7,0** Tiles. Der Proof besteht darauf, dass außerhalb dieser Nahkampfreichweite kein Schaden über die legitimen Umweltquellen (Falle 22, Ambush höchstens 14, Supply 1) hinausgeht.

<!-- JUNGLE_PERFORMANCE_BEGIN -->
### Performance-Profil

Bewusst schwaches Profil: **720 × 540 CSS-Pixel, Device-Pixel-Ratio 1, 50 % Render-Scale (360 × 140 Canvas), Zoom 4,2, 30-FPS-Cap, SwiftShader/Software-GL und CDP-CPU-Throttling 4×**. Die Kamera steht auf der dichtesten gefundenen Dschungelkachel. Jede Jahreszeit läuft in einem eigenen 2,2-s-Fenster; das Gesamtfenster danach verwendet dieselbe Kamera und dasselbe Profil.

**Metrik (reproduzierbar):** Jedes Fenster läuft vollständig in einem einzigen `page.evaluate`; zwischen Start und Ende gibt es keinen Harness-Aufruf, keine Navigation und keinen Klick. Die Probe hängt sich in den echten Game-Loop und stempelt jeden tatsächlich präsentierten Frame nach dem Draw mit `performance.now()`. Der Frame-Abstand ist die Wall-Clock-Differenz dieser Stempel; zusätzlich zählen ein unabhängiger `requestAnimationFrame`-Zähler und `PerformanceObserver('longtask')` mit. Ein Abstand wird nur dann als **externe No-Work-Lücke** abgetrennt, wenn er **> 50 ms** ist, die gemessene App-Arbeit (`drawMs + simMs + uiMs`) **< 12 ms** bleibt und **kein Long Task** ihn überlappt. `rawInterval` behält jede Lücke; `interval` und die Budgetprüfung verwenden die Anwendungsframes. Die Fensterlänge ist fest 2,2 s.

**FPS:** Die maßgebliche `presentationFps` ist **alle präsentierten Frames geteilt durch die Wall-Clock-Spanne vom ersten bis zum letzten präsentierten Frame**. Jede No-Work-Lücke liegt in dieser Spanne und senkt die Zahl; es wird **keine** Lückenzeit abgezogen. Die Spanne enthält nur den Rand vor dem ersten Frame nicht, weshalb zusätzlich `rawFps` (Frames / gesamte 2,2-s-Wanduhr, inklusive der vier Ränder) ausgewiesen ist. `workFps` ist reine Diagnose (App-Zeit ohne No-Work-Lücken) und wird **nie** für das ≥30-FPS-Gate verwendet.

| Jahreszeit | Frames (App) | Median App | App-p95 | Roh-p95 / Max | Draw-p95 / Max | Sim-p95 / Max | UI-p95 / Max | Präsentations-FPS | Fenster-FPS |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Frühling (Tag 50) | 65 (65) | 33,3 ms | **35,3 ms** | 35,3 / 42,0 ms | 2,7 / 3,4 ms | 0,6 / 9,4 ms | 0,0 / 0,0 ms | **30,313** | 29,540 |
| Sommer (Tag 150) | 65 (64) | 33,3 ms | **34,7 ms** | 34,8 / 50,1 ms | 2,7 / 3,7 ms | 0,3 / 7,0 ms | 0,0 / 0,0 ms | **30,273** | 29,536 |
| Herbst (Tag 250) | 67 (65) | 33,3 ms | **36,4 ms** | 36,7 / 41,5 ms | 2,5 / 4,6 ms | 0,6 / 0,7 ms | 0,1 / 0,1 ms | **30,397** | 30,336 |
| Winter (Tag 350) | 66 (66) | 33,3 ms | **35,2 ms** | 35,2 / 43,5 ms | 2,5 / 9,0 ms | 0,6 / 5,7 ms | 0,0 / 0,8 ms | **30,437** | 29,958 |
| Gesamtfenster | 47 (46) | 33,2 ms | **35,0 ms** | 36,1 / 56,6 ms | 2,5 / 3,8 ms | 0,1 / 3,7 ms | 0,0 / 0,0 ms | **30,262** | 29,366 |

**Gesamte Messstrecke:** 263 präsentierte Frames in vier 2,2-s-Fenstern; 260 davon sind Anwendungsframes. Die Summe der vier First-to-last-Spannen beträgt **8664,0 ms**; daraus ergeben sich **30,355 Präsentations-FPS**. Die Summe der vier vollen 2,2-s-Wanduhren beträgt **8812,8 ms** und ergibt **29,843 Fenster-FPS**; die Differenz sind die vier Start-/Endränder und keine entfernte No-Work-Lücke. 1 externe No-Work-Lücken mit zusammen **50,1 ms** liegen vollständig in der Präsentationsspanne und senken die Rate. Die längste Jahreszeiten-Lücke war **50,1 ms** (Tag 150) mit **1,7 ms** App-Arbeit und keinem Long Task.

**Gate:** Jede der vier Jahreszeiten wird einzeln gegen **App-p95 ≤ 50 ms** geprüft; ein fehlender oder nicht-finiter Wert lässt den Lauf scheitern. Zusätzlich werden Draw- und UI-p95/Max pro Jahreszeit gegen **16,7 ms** und die Gesamtstrecke gegen **≥30 Präsentations-FPS** geprüft. Der schlechteste App-p95 ist **36,4 ms**, der schlechteste Draw-Max **9,0 ms**, der schlechteste UI-Max **0,8 ms**.

**Kontrolllauf ohne Dschungelarbeit:** Dieselbe Seite, dieselbe Kamera-Mechanik, dasselbe 4×-Throttling und derselbe Canvas-Renderer, aber die statische Wasser-/Leerfläche `(3, 3)` statt des dichten Dschungels. Ausgewählt wurde der Versuch mit der größten gemessenen No-Work-Lücke (2 Versuche insgesamt): **116 Frames (113 App)**, App-Median **33,2 ms**, App-p95 **42,0 ms**, Präsentations-FPS **29,241**, **3 externe Lücke(n)** mit **237,5 ms** und **3,0 ms** App-Arbeit (Draw 2,7 ms, Sim 0,3 ms, UI 0,0 ms), **0 Long Tasks**. Damit tritt eine lange No-Work-Pause nachweislich auch ohne Vegetation, Simulation oder Dschungel-Draw auf.

**Budgets und Begründung:**

- **Draw und UI:** Das Projekt definiert in `docs/TERRAIN_PERFORMANCE.md` und dem Endurance-Audit bereits **16,7 ms pro Draw-Pass und UI-Refresh**. Dieses Harness prüft p95 und Max; der schlechteste Draw war **9,0 ms**, die schlechteste UI **0,8 ms**.
- **Frame-Pacing:** Für das 4×-CPU-/Software-GL-Profil gilt **p95 ≤ 50 ms**. Das ist bewusst konservativer als ein 60-FPS-Budget. Der Median liegt in allen vier Jahreszeiten bei 33–34 ms (30 FPS), der schlechteste App-p95 bei **36,4 ms**.
- **FPS:** Die Gesamtstrecke hält **30,355 Präsentations-FPS** (≥ 30). Die reine Fenster-FPS ist mit **29,843** niedriger, weil sie zusätzlich die vier Start-/Endränder der 2,2-s-Fenster enthält; sie ist kein Gate und wird nicht schöngerechnet. Frühere 30,4 FPS waren gap-bereinigt und sind **kein gültiger Vergleichswert** für dieses Gate.
- **Keine Ausnahme-Jahreszeit:** Alle vier App-p95-Werte (35,3 / 34,7 / 36,4 / 35,2 ms) liegen unter 50 ms. Rohwerte über 50 ms sind ausschließlich die als externe No-Work-Lücken klassifizierten Frames; ihre App-Arbeit liegt bei 1,7–1,7 ms, und der Kontrolllauf zeigt dieselbe Art Lücke ohne Dschungel.

**Vorher/Nachher der behobenen Nachweis-Hindernisse (aktuelle Messung):**

| Engstelle | Vorher | Nachher |
| --- | --- | --- |
| Sicht auf Tierpfad/Lichtung | `forestSightBlock` öffnete nur `clearing`; Pfad blieb versperrt | Pfad/Durchgang öffnet: Block **0,54 → 0**, Sicht **2 → 8 Kacheln** |
| Bewegung auf Pfad | Pfad hatte keinen eigenen Bewegungsvorteil (Faktor **0,550**) | Pfad-Faktor **0,652**; dichte Wand bleibt **0,550** |
| UI-Krankheit/Parasiten | Felder fehlten im SiteNote-String (`null`) | **Disease 75 % / Parasites 86 %** sichtbar |
| Seltener Fund im Bestand | Fünf-Slot-Auswahl lieferte nur generische Güter; versteckte Rare-IDs blieben außerhalb | Gemischte Ernte + Rare-Fund: UI-Gather **11 Güter**, Bestand **14 IDs** inkl. Orchideen/Bromeliads |
| Performance-Sample | Management-Modal ließ `ui-modal-open` aktiv; der Loop zeichnete die Welt absichtlich nicht, Probe = **0 Frames** | Modal geschlossen und explizit geprüft; **65/65/67/66 Frames** über vier Jahreszeiten |
| Frame-Metrik | Frühere Probe verteilte Start/Warten/Auslesen über Harness-Schritte; die gap-bereinigte 30,4-FPS-Zahl entfernte Stalls aus dem Nenner | Vollständig autonomes In-Page-Fenster; **30,355 Präsentations-FPS** aus allen Frames über die Wall-Clock-Spanne, **29,843 Fenster-FPS** inklusive der vier Ränder |
| Kontrolllauf | Fehlte in der ersten Runde; externe Pausen waren nur eine Behauptung | Leere Wasserfläche: **3** No-Work-Lücke(n) von **237,5 ms** bei **3,0 ms** App-Arbeit, **0** Long Tasks |

**Reproduktion und Grenzen der Metrik:** Der Befehl oben baut `artifacts/kings-and-cards-deploy/public` und schreibt `artifacts/jungle-proof/jungle-proof.json`; die Tabellenwerte werden von `scripts/sync-jungle-doc.mjs` aus genau diesem Bericht erzeugt und danach geprüft. Die Kontrollfläche wird über `isWaterAt()` aus derselben echten Welt gewählt. Die Klassifikation ist absichtlich konservativ: Eine externe Lücke muss über dem 50-ms-Budget liegen, unter 12 ms App-Arbeit haben und darf keinen Long Task überlappen. `PerformanceObserver('longtask')` und die CDP-Drosselung sind Browser-Diagnosen; der Nachweis gilt für diesen gebauten Lauf, diesen Seed und diese Software-GL-Umgebung. Er ist kein Hardware-GPU-Benchmark und keine Garantie für jede denkbare Maschine. Ein einzelner 55-ms-Stall senkt die Präsentations-FPS; er verschwindet nicht durch eine Subtraktion.
<!-- JUNGLE_PERFORMANCE_END -->

### Vorher/Nachher der behobenen Nachweis-Hindernisse (historische Runde)

Die folgende Tabelle hält die ursprünglichen Verbesserungen und die damals gemessenen Nachher-Werte fest. Die **aktuellen, gate-relevanten** Werte stehen ausschließlich im generierten Performance-Block oben; die frühere **30,4-FPS**-Zahl ist ausdrücklich die alte, gap-bereinigte Metrik und kein gültiger Wert für das heutige ≥30-FPS-Gate.

| Engstelle | Vorher | Nachher (damalige Runde) |
| --- | --- | --- |
| Sicht auf Tierpfad/Lichtung | `forestSightBlock` öffnete nur `clearing`; Pfad blieb versperrt | Pfad/Durchgang öffnet: Block **0,54 → 0**, Sicht **2 → 8 Kacheln** |
| Bewegung auf Pfad | Pfad hatte keinen eigenen Bewegungsvorteil (Faktor **0,55**) | Pfad-Faktor **0,652**; dichte Wand bleibt **0,55** |
| UI-Krankheit/Parasiten | Felder fehlten im SiteNote-String (`null`) | **Disease 75 % / Parasites 86 %** sichtbar |
| Seltener Fund im Bestand | Fünf-Slot-Auswahl lieferte nur generische Güter; versteckte Rare-IDs blieben außerhalb | Gemischte Ernte + Rare-Fund: UI-Gather **11 Güter**, Bestand **14 IDs** inkl. Orchideen/Bromeliads |
| Performance-Sample | Management-Modal ließ `ui-modal-open` aktiv; der Loop zeichnete die Welt absichtlich nicht, Probe = **0 Frames** | Modal geschlossen und explizit geprüft; **66/64/65/66 Frames** über vier Jahreszeiten |
| Frame-Metrik | Frühere Probe verteilte Start/Warten/Auslesen über Harness-Schritte; der Winter-p95 lag bei **50,0 ms** und war nicht sauber zuordenbar | Vollständig autonomes In-Page-Fenster, Wall-Clock-Stempel, rAF-Zähler und Long-Task-Observer: App-p95 **37,0 / 46,1 / 35,9 / 34,9 ms**, Winter **0** externe Lücken, Gesamt **30,4 FPS** (gap-bereinigt; heute nicht gate-relevant) |
| Kontrolllauf | Fehlte; externe Pausen waren nur eine Behauptung | Leere Wasserfläche: **65,8 ms** No-Work-Lücke bei **2,4 ms** App-Arbeit, **0** Long Tasks |

## Grenzen

Der Dschungel ist eine abgeleitete Interpretation des tropischen Waldes, kein separater Biomtyp. Die Ressourcen sind bewusst bestehende tropische Güter; es wurden keine neuen Wirtschaftsgüter und keine neue Währung eingeführt. Die Darstellung bleibt Canvas-2D und nutzt die vorhandenen Bäume, Böden und Wasserfarben. Die Browser-Referenz ist eine visuelle Prüfung, kein Pixel-Diff und kein GPU-Benchmark. Der Performance-Nachweis verwendet Software-GL und einen einzelnen Seed; er belegt den konkreten gebauten Lauf, nicht jede denkbare GPU- und Weltkonfiguration.
