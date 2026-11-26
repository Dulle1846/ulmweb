# Fauna, Ökologie und Nahrungsnetze · 1.2.23.1.091–120

> **Status: implementiert, vertieft und als Spielmechanik verdrahtet (v3.64.0).**
> Die 30 Punkte laufen als eine reine, abgeleitete `forest-fauna-ecology`-Schicht
> über dem bestehenden `forestStandAt()`-Vertrag. Es gibt keine zweite Karte,
> keinen zweiten Waldsimulator, keinen neuen Save-Typ und keine zusätzliche
> Pro-Frame-Schleife. Jede Waldkachel berechnet beim Lesen dieselbe
> deterministische Lebensgemeinschaft aus Arten, Alter, Totholz, Wasser, Rand,
> Boden, Bewirtschaftung und Jahreszeit. Atlas, Inspektor, Sammeln, Jagd,
> Nachwachsen und das Herdenmodell lesen genau diesen Datensatz.

## 1. Architektur

`js/world/forest-fauna-ecology.js` ist eine pure Funktion. Sie importiert nur
`seasonalState()` und kennt keinen Spielzustand, keine Entity und keinen
Renderkontext. Dadurch kann sie während der Weltgenerierung, im Test und im
laufenden Spiel denselben Wert liefern.

```js
forestFaunaEcologyFor(stand, {
  day,        // Tag im 400-Tage-Jahr (Default 150)
  climate,    // 'temperate', 'taiga', 'savannah', ...
  seed, x, y  // für deterministische Zyklen und Korridore
});
```

Das Ergebnis enthält für jeden der 30 Punkte einen eigenen, benannten
Teilrekord mit stabiler ID (`1.2.23.1.091` bis `1.2.23.1.120`), außerdem
`foodWeb`, `indicators`, `pressures`, `products`, `signals`, `community`,
`headline` und `summary`. Alle Zahlen sind begrenzt (0–1, Prozent, kg/ha, m³,
Tiere/100 ha, Jahre) und werden nie gespeichert.

### Zwei Projektionen, eine Wahrheit

| Projektion | Verbraucher | Kosten | Zweck |
|---|---|---|---|
| `forestFaunaEcologyFor()` | Atlas, Inspektor, Sammeln, Tests | 30 kleine Guild-Objekte pro Aufruf | vollständige, lesbare Ökologie |
| `forestFaunaQuickSignalsFor()` | tägliches Herdenmodell | 25 Zahlen, keine Guild-Objekte | begrenzte Simulation ohne Allokationsspitze |
| `forestFaunaSignalsFor()` | Signatur für Werkzeuge/Tests | vollständiger Rekord, nur `signals` | eine Quelle für Prüfungen |
| `forestFaunaCommunityFor()` | Marker-Auswahl | vollständiger Rekord | nur Arten mit vorhandenem Renderer-Eintrag |

Der schnelle Pfad ist kein zweites Modell: Er liest dieselben Standfelder und
dieselben Formeln für Habitat, Prädation und Wasser. Der ausführliche Pfad
ergänzt die Guild-Details, die nur der Spieler sieht. Der Test
`tests/world/forest-fauna-ecology.test.js` prüft beide Richtungen.

### Warum der Rekord nicht am Stand hängt

`forestStandAt()` wird pro sichtbarer Kachel und Frame aufgerufen. Ein
30-Guild-Objekt dort würde die in v3.63.0 gemessene Bodenansicht unnötig
belasten. Deshalb gilt:

- **Standard:** `forestStandAt()` bleibt unverändert leicht; der Renderer liest
  die vorhandenen `stand.fauna`-Marker.
- **`context.faunaDetail: true`:** Der Stand erhält `stand.faunaEcology`. Das
  nutzen Atlas, Inspektor, Sammeln und Tests.
- **Herdenmodell:** nutzt `forestFaunaQuickSignalsFor()` mit einem
  `WeakMap`-Cache pro Stand und Tag. Eine Migration prüft höchstens die
  Nachbarkacheln, nicht die ganze Karte.

## 2. Die 30 Punkte

| Punkt | Umsetzung | Wirkung / Nachweis |
|---|---|---|
| **091** Regionale Hirscharten | `deer.species[]` mit ID, Label, Latin, Share, Diet und Gewicht; `deerSpeciesFor()` wählt nach regionalem Waldtyp und Klima; `densityPer100Ha`, `browsePressure`, `rutSeason`, `winterYard`, `hunting.quotaPer100Ha` | Der Spieler sieht im Atlas/Inspektor die echte regionale Art (Rot-, Schwarzschwanz-, Fallow-, Sikahirsch, Elch, Rentier, Sambar, Chital, Muntjak, Rothirsch, Kudu, Impala, Saiga, Red Brocket); im Herdenmodell bleibt der gemeinsame Deer-Marker, damit die bestehende Renderer- und Save-Sprache erhalten bleibt. Test: Taiga → Elch, temperiert → Rot/Roe/Fallow, mediterran → Fallow, tropisch → Red Brocket, Miombo → Kudu |
| **092** Wildschweine mit Bodenschäden | `boar {present, sounderSize, rooting, soilDamage, mastUse, cropRisk, farrowingSeason, earthworms, wallowSites}` | Mast, Streu, Regenwürmer und Feuchte erhöhen die Rotte; `rooting` und `soilDamage` sind echte Druckwerte, die in `pressures` und im Signal `rooting` an das Wild-/Regenerationsmodell gehen. Test: Mast-reicher Wald > junger Kiefernwald |
| **093** Bären als seltene Spitzenprädatoren | `bear {present, densityPer100Km2, denSites, prey, berrySeason, salmonRun, danger, cubs}` | Dichte bleibt auf 0–6 Tiere/100 km² begrenzt; alte, mast- und beerenreiche, abgelegene Wälder tragen Bären, junge nicht. `prey` nennt Deer/Boar/Moose; `danger` ist im Inspektor lesbar. Test: alt > jung, Dichte ≤ 6 |
| **094** Wölfe mit Rudel- und Wanderverhalten | `wolf {present, packSize, packs, territoryKm2, huntSuccess, prey, corridorUse, livestockRisk, howlSeason}` | Rudelgröße 2–9, Territorium 70–260 km², Jagderfolg aus Beutebasis und Habitat; `corridorUse` verbindet 120 mit dem Rudel. Test: prey-reicher Nadelwald hat ein Rudel, isolierter/jagdintensiver Wald nicht |
| **095** Luchse als heimliche Einzeljäger | `lynx {present, densityPer100Km2, territoryKm2, solitary, stealth, prey, ambushCover}` | Immer `solitary: true`, Territorium 12–50 km², Deckung aus Totholz, Strauch und Jungbestand. Test: Einzelstatus, Territoriumsgrenzen, Beute |
| **096** Greifvögel als Waldgesundheits-Indikatoren | `raptors {species, pairs, canopyNesting, huntingLanes, prey, indicator, forestHealth, nestingSeason}` | `indicator` und `forestHealth` aggregieren Kronenraum, Höhlen, Beute, Störung und Standortfit; der Atlas zeigt sie als eigene Zeile. Test: reicher Rand/alter Wald > junger geschlossener Bestand |
| **097** Eulen in alten Bäumen und Höhlen | `owls {species, pairs, hollows, oldTrees, prey, nightActivity, fledgingSeason}` | Höhlen und alte Bäume heben die Paarzahl; die Art wechselt mit Nadel-/Laubwald. Test: alt > jung bei Paaren, Höhlen und alten Bäumen |
| **098** Spechte als Totholz-Spezialisten | `woodpeckers {species, pairs, standingDeadwoodUse, cavitiesExcavated, drumming, indicator}` | Stehendes Totholz, Zerfall und Alter erhöhen Paare und ausgehöhlte Stämme; `drumming` ist im Frühjahr am höchsten. Test: reich > arm |
| **099** Singvögel mit tageszeitabhängigem Gesang | `songbirds {speciesRichness, migrants, residents, chorus {dawn, midday, dusk}, chorusWindow, seedsEaten, insectsEaten}` | Der Chor ist morgens am stärksten, mittags am schwächsten und im Winter fast still; Artenzahl folgt Schichten, Rand, Blüte, Beeren und Alter. Test: dawn > midday, Sommer > Winter |
| **100** Biber als Landschaftsbaumeister | `beavers {present, colonies, dams, pondsHa, waterStorageM3, coppiceUse, floodRisk, fishNursery, willowRegrowth, peltValue}` | Nur echte Gewässer mit Weide/Erle/Pappel tragen Biber; Dämme erzeugen Teiche, Wasserspeicher und ein begrenztes Hochwasserrisiko. Test: Auenwald > trockener Kiefernwald |
| **101** Fischotter an sauberen Waldgewässern | `otters {present, individuals, territoryKm, fishShare, cleanWaterNeed, spraintSites, waterQuality, furValue}` | Otter folgen Wasserqualität und Fischbiomasse, nicht jedem nassen Tile; Verschmutzung und Jagddruck senken die Zahl. Test: sauber > schlammig, trocken = 0 |
| **102** Marder und Wiesel als kleine Räuber | `smallPredators {marten, weasel, smallPreyRelief}` | Marder braucht Altbestand, Totholz und Höhlen; Wiesel lebt im Strauch-/Randsaum und kontrolliert Nagetiere. Beide nennen ihre Beute. Test: unterschiedliche Dichten und Beutebindung |
| **103** Hasen und Kaninchen als Beute und Kulturfolger | `lagomorphs {hare, rabbit}` mit Dichte, Leverets, offenem Rand bzw. Warrens, Kulturfolge, Ernteschaden und Beuteliste | Hasen bevorzugen offene Ränder, Kaninchen trockene, sonnige, menschlich geprägte Böden. Test: offen > geschlossen; Frühjahr = Leverets |
| **104** Nagetiere mit Samenverbreitung und Vorräten | `rodents {species, abundance, seedCacheKgHa, cachedSpecies, seedDispersal, mastYearResponse, owlPrey, hoards}` | Mast und Streu füllen die Vorräte; `seedDispersal` speist das Signal für Beeren-/Samenverfügbarkeit. Test: reich > arm, Acorns im Cache |
| **105** Fledermäuse in Höhlen und alten Kronen | `bats {species, colony, roosts, nurseryRoosts, nightlyInsectKg, hibernacula, activity, waterTrapline}` | Höhlen und Alter heben Quartiere; im Winter `hibernating`, im Sommer `nursery`; Wasserlinien sind eigene Flugrouten. Test: reich > arm, Jahreszeiten |
| **106** Insekten als Bestäuber, Schädlinge und Nahrung | `insects {speciesRichness, pollinators, pests, foodForBirdsKgHa, decomposers, aquaticInsects, flowerVisitors}` | Drei getrennte Werte: Blütenbestäubung, echter Pestdruck (Trockenheit, Monokultur, Käferstörung) und Insektenbiomasse als Vogelnahrung. Test: reich > arm, Ausbruch > ruhiger Wald |
| **107** Ameisen als Bodenwender und Verteidiger | `ants {moundsPerHa, soilTurnoverKgHaYear, pestDefence, aphidTending, protected, swarming, prey}` | Hügel und Bodenumsatz steigen mit Streu, Kronenschluss und Feuchte; `pestDefence` speist das Pest-Control-Signal. Test: reich > arm, Schwärmen nur im Sommer |
| **108** Wildbienen mit Nistplätzen im Totholz | `wildBees {speciesRichness, deadwoodNesters, groundNesters, cavityNesters, pollinationShare, nestingSites, honeyPotential}` | Totholz, offene Bodenstellen und Höhlen sind getrennte Nistgilden; die Bestäubungsquote speist Honig und Beeren. Test: reich > arm |
| **109** Schmetterlinge als saisonale Farb- und Bestäubungsträger | `butterflies {speciesRichness, flightWeeks, nectarSources, brood, seasonalColour, migrants, caterpillars}` | Flugwochen und Farbwert fallen im Winter auf 0; Brut und Nektarquellen folgen der Phänologie. Test: Sommer > Winter |
| **110** Totholzkäfer als Zeiger alter Wälder | `deadwoodBeetles {speciesRichness, oldGrowthIndicator, deadwoodNeed, saproxylicShare, redListed, flightSeason}` | Artenzahl, Altwald-Indikator und Totholzbedarf steigen mit liegendem/stehendem Totholz und Zerfall. Test: alt > jung |
| **111** Amphibien in feuchten Waldmulden | `amphibians {present, species, pools, chorusSeason, moistureNeed, juvenileSurvival, fishPredation}` | Nur echte Gewässer und Mulden tragen Amphibien; Fischbesatz senkt die Überlebensrate; Frühjahr = Laichchor, Winter = Hibernation. Test: nass > trocken |
| **112** Reptilien auf sonnigen Waldlichtungen | `reptiles {species, abundance, baskingSites, sunnyClearings, winterRefuge, eggLaying}` | Lücken, Rand und offene Krone erhöhen die Sonnenplätze; geschlossener Hochwald senkt sie. Test: sonnig > geschlossen |
| **113** Fische in klaren Waldbächen | `fish {present, species, biomassKgHa, waterQuality, shadeNeed, spawning, pools}` | Wasserqualität, Schatten, Gumpen und fehlende Verdichtung bestimmen die Biomasse; trockene und schlammige Standorte fallen auf 0. Test: sauber > schlammig |
| **114** Krebse und Muscheln als Wasserqualitätsanzeiger | `waterFilters {crayfish, mussels, waterQuality, indicator, sensitive}` | Krebse und Muscheln haben getrennte Dichten; Muscheln filtern eine berechnete Menge Wasser pro Tag. Test: sauber > schlammig |
| **115** Pilze als Nahrung, Medizin und Zersetzer | `fungi {speciesRichness, edible, medicinal, decomposers, mycorrhizal, fruiting, yieldKgHa}` | Mykorrhiza, Zersetzung und Totholz trennen Speisepilz-, Medizin- und Zersetzeranteil; der Hauptertrag liegt im Herbst. Test: Herbst > Frühjahr |
| **116** Moose und Flechten als Feuchtigkeitsanzeiger | `mossLichen {mossCover, lichenCover, humidityIndicator, oldGrowthIndicator, speciesRichness, airQuality, desiccationRisk}` | Feuchte und Epiphyten heben die Zeigerwerte; Trockenheit erhöht das Austrocknungsrisiko. Test: feucht > trocken |
| **117** Parasiten mit regionalen Wirtsbindungen | `parasites {load, hosts[4], ticksPerDeer, liverFlukeRisk, mangeRisk, herdCondition, biodiversityBrake}` | Vier echte Wirt-Parasit-Paare: Deer Tick, Liver Fluke (Boar), Sarcoptic Mange (Fox), Feather Mite (Songbird). Dichte und Feuchte erhöhen die Last, Vielfalt bremst sie. Test: vier Hosts, dicht > dünn |
| **118** Aasfresser als Teil des Stoffkreislaufs | `scavengers {species, abundance, carcassRemovalDays, nutrientReturnKgHaYear, carcassSites, diseaseCleanup, winterReliance}` | Fuchs, Rabe, Käfer und Wildschwein entfernen Aas; wärmerer Wald entfernt schneller, Winter langsamer. Test: Sommer ≤ Winter bei den Tagen |
| **119** Räuber-Beute-Zyklen | `cycles {hareLynx, voleOwl, mast, predationPressure, herbivorePressure}` mit Phase, Label, Periode, Amplitude und Indizes | Neunjähriger Luchs-Hase-, vierjähriger Eulen-Maus- und 5–7-jähriger Mastzyklus; die Phase kommt deterministisch aus Seed, Kachel und Simulationsjahr. Test: deterministisch, begrenzt, nächstes Jahr anders |
| **120** Wanderkorridore | `corridors {quality, connectivity, nearestWoodKm, links, pinchPoints, direction, targetRegionalType, migration, roadBarrier}` | Rand, Kronenschluss, Totholz, Wasser und regionale Übergangszone bilden den Korridor; Siedlung, Lücke und Bach sind Engpässe. Test: Übergangswald > isolierter Bestand |

## 3. Regionale Hirscharten (091)

Die Artauswahl ist keine globale Liste. Sie folgt dem regionalen Waldtyp und,
falls dieser fehlt, dem Klima:

| Region / Typ | Arten (Auswahl) |
|---|---|
| Taiga, borealer Nadelwald, Fichten-Tannen, Kiefern-Birke, Lärche, subalpin | Elch (62 %), Reh (38 %) |
| Tundra, Schnee, arktisch | Rentier (78 %), Elch (22 %) |
| Mediterraner Hartlaubwald, Kork-/Steineiche, Aleppo-Kiefer | Damhirsch (52 %), Rothirsch (34 %), Reh (14 %) |
| Küstenmammutbaum, pazifischer Regenwald, atlantischer Nebelwald, gemäßigter Regenwald | Schwarsschwanzhirsch (58 %), Reh (24 %), Rothirsch (18 %) |
| Auen, Bruch, Moor, Galerie, Delta, Lagune | Rothirsch (44 %), Reh (34 %), Sikahirsch (22 %) |
| Miombo, Akazie, Baobab, Dornbusch, Savanne, Steppe | Großer Kudu (50 %), Impala (34 %), Saiga (16 %) — keine echten Hirsche, aber dieselbe Browser-/Grazer-Nische |
| Teak, Sal, Dipterocarp, Bambus, Monsun, Lorbeer | Sambar (46 %), Chital (34 %), Muntjak (20 %) |
| Tropischer Regenwald, Dschungel | Red Brocket (52 %), Sambar (28 %), Muntjak (20 %) |
| Gemäßigter Laubwald (Fallback) | Rothirsch (46 %), Reh (38 %), Damhirsch (16 %) |

Jeder Eintrag nennt `weightKg`, `diet` (`browser`, `grazer`, `mixed`), `share`
und `latin`. Der Spieler sieht damit im Atlas und Inspektor dieselbe Art, die
das Herdenmodell als Jagd- und Waldbewohner führt.

## 4. Nahrungsnetz

`foodWeb` ist eine begrenzte Liste von 16 Guilds (Pflanzen, Samen, Insekten,
Nagetiere, Hasen, Deer, Boar, Fisch, Amphibien, Singvögel, Greife, Eulen,
Wölfe, Luchse, Bären, Otter, Aas) mit Trophie-Level und Biomasse-Prozent. Die
Kanten sind echte Pfade:

- Pflanzen → Deer (Browse), Boar (Wühlen), Hasen (Gras), Insekten (Nektar)
- Samen → Nagetiere (Cache), Boar (Mast)
- Insekten → Singvögel, Fledermäuse, Amphibien, Fische
- Nagetiere → Eulen, Greife
- Hasen → Luchs, Greif
- Deer → Wolf, Bär, Luchs
- Boar → Wolf, Bär
- Fisch → Otter
- Amphibien → Otter
- Singvögel → Greif
- Aas → Bär, Greif, Insekten

`keystone` nennt das oberste tatsächlich vorhandene Guild (Wölfe/Luchs, sonst
Greife/Eulen, sonst insektenfressende Vögel). Der Rekord bleibt unter 24 Knoten
und 40 Kanten; er ist eine Leseprojektion, kein Agenten-Solver.

## 5. Spielrolle: was die 30 Punkte tatsächlich verändern

Die Werte sind keine Parallelökologie. Sie fließen in vorhandene Systeme:

| System | Gelesene Werte | Konkrete Wirkung |
|---|---|---|
| **Tägliches Herdenmodell** (`js/systems/forest-fauna.js`) | `forestFaunaQuickSignalsFor()`: `deer`, `boar`, `bear`, `wolf`, `lynx`, `beaver`, `otter`, `fish`, `rabbit`, `predation`, `waterQuality` | Neue reale Herden für Elch, Rentier, Bär, Biber und Otter; Präferenz und Kapazität der bestehenden Deer/Roe/Boar/Wolf/Lynx-Herden reagieren auf dieselben Signale. Bär ist ein echter Prädator mit Deer/Boar/Elch/Rentier als Beute. Biber und Otter siedeln nur an echten Gewässern. |
| **Jagd** (`harvestForestGameAt`) | Herdenzustand, `products.venisonKgHa`, `products.boarKgHa` | Der Abschuss entnimmt weiterhin echte Tiere aus einer konkreten Herde; Qualität und Bestand reagieren auf die neue Habitat- und Prädationslage. |
| **Sammeln** (`forestGoodsFor`) | `signals.gameYield`, `fishYield`, `mushroomYield`, `honeyYield`, `seedDispersal`, `biodiversity` | Wildbret, Fisch, Pilze, Honig, Beeren, Kräuter/Medizin und Felle ändern ihre Abundanz. Der Test `the shared stand and goods path consume the fauna record` isoliert jeden Kanal. |
| **Nachwachsen** (`forestRegrowthFactor`, Sukzession) | `stand.browsingPressure`, Verbiss-/Wühlwerte, `pressures.barkBeetle` | Rehe und Wildschweine bremsen die Verjüngung; der Käferdruck bleibt an die bestehende Störungssukzession gekoppelt. |
| **Wasser und Boden** | `mossLichen.humidityIndicator`, `waterFilters.indicator`, `beavers.waterStorageM3`, `fungi.mycorrhizal` | Wasserqualität, Wasserrückhalt, Pilzertrag und die Feuchtezeiger sind im Inspektor lesbar; Biberteiche erhöhen den Wasserspeicher. |
| **Atlas** (`forest-atlas-panel.js`) | Acht neue Zellen: WILDLIFE, PREDATORS, WATER FAUNA, INSECTS, DEADWOOD LIFE, CYCLE, CORRIDOR, HARVEST | Jede der 60 regionalen Karten zeigt die echte Lebensgemeinschaft ihres ersten Bestands, ohne einen zweiten Survey. |
| **Inspektor** (`management-ui.js`) | `forestFaunaEcologySummary()` plus `FAUNA ECOLOGY`, `FOOD WEB`, `INDICATORS` | Der Lumberyard/Forester zeigt regionale Deer-Art, Browse, Wühlen, Wolf/Bär, Biber/Otter, Fisch, Bestäuber, Schädlinge, Wasser, Zyklus, Korridor, Gesundheits-/Altwald-/Vielfaltsindizes und die Größe des Nahrungsnetzes. |
| **Karte** (`forestFaunaFor`) | `stand.fauna`, regionale Key, `wetness`, `mastCrop`, Alter | Bär, Biber, Otter, Elch und Rentier erscheinen als echte Marker, wenn ihr Habitat sie trägt. Die Auswahl bleibt begrenzt und nutzt die vorhandenen Renderer-Formen. |

### Die fünf neuen gespeicherten Herden

`SIMULATED_FAUNA_IDS` enthält jetzt zusätzlich `moose`, `reindeer`, `bear`,
`beaver` und `otter`. Sie liegen im bestehenden `forestFauna.herds`-Schema
(`id`, `species`, `x`, `y`, `population`, `capacity`, `trend`, `lastMoved`,
`huntingPressure`, `lastHuntedDay`) und werden von derselben Validierung,
Serialisierung und Wiederherstellung getragen. Alte Saves bleiben gültig: Fehlt
eine Art, wird sie beim nächsten `ensureForestFauna()` nicht nachträglich in
einen bestehenden Bestand injiziert; neue Reiche seeden sie aus `stand.fauna`.
`FOREST_FAUNA_LIMITS` bleibt bei 240 Herden und 480 Insektenkolonien.

## 6. Save- und Performance-Vertrag

- **Kein neues Save-Feld für die Ökologie.** Der 30-Punkte-Rekord wird bei
  jedem Lesen neu berechnet.
- **Fünf neue Herdenarten** nutzen das vorhandene, validierte Herden-Schema.
  `validateForestFaunaSnapshot()` akzeptiert sie über `SIMULATED_SPECIES`;
  alte Saves ohne sie bleiben ohne Migration gültig.
- **Kein Per-Frame-Aufruf.** Der Renderer liest weiterhin nur `stand.fauna` und
  die Marker. Der ausführliche Rekord entsteht nur bei `faunaDetail`, im Atlas
  (einmal pro Typ und Survey-Fenster), im Inspektor (bei geöffnetem Panel) und
  beim Sammeln (einmal pro Aktion).
- **Begrenzte Simulation.** Das Herdenmodell bleibt bei 48 Auflösungen/Tag,
  acht Insekten-Batches und 240 Herden. Die schnelle Signalprojektion kostet
  25 Zahlen statt 30 Guild-Objekte.
- **Determinismus.** Gleicher Stand, gleicher Tag, gleicher Seed und gleiche
  Koordinaten liefern denselben Rekord. Die Zyklen hängen nur von Seed, Kachel
  und Jahr ab, nicht von der Frame-Zeit.

## 7. Tests

- `tests/world/forest-fauna-ecology.test.js` — alle 30 Punkte, regionale
  Hirscharten, Wühlschäden, Bärenseltenheit, Wolfsrudel, Luchs-Einzelstatus,
  Greifvogel-Indikator, Höhlen/Eulen/Spechte, Tageschor, Biber, Otter, Marder/
  Wiesel, Hasen/Kaninchen, Nagetier-Caches, Fledermäuse, Bestäuber/Schädlinge,
  Ameisen, Wildbienen, Schmetterlinge, Totholzkäfer, Amphibien, Reptilien,
  Fische, Krebse/Muscheln, Pilze, Moos/Flechten, Parasiten, Aasfresser, Zyklen,
  Korridore, Nahrungsnetz, Determinismus, Stand-/Goods-Verbraucher und die
  Herdenpräferenz.
- `tests/systems/forest-fauna.test.js` — bestehende Herden-, Zeichen-, Save-
  und Habitat-Gates.
- `tests/systems/forest-fauna-longrun.test.js` — vier simulierte Jahre mit drei
  Seeds, Migration, Dispersion, Jagddruck und begrenzter Füllrate.
- `tests/world/forest-ecology.test.js` — Stand, Formationen, Güter und Fauna
  bleiben konsistent.
- `tests/presentation/forest-atlas.test.js` und
  `tests/ui/master-ui-contract.test.js` — Atlas-/Inspektor-Vertrag.

## 8. Was der Spieler sieht und tut

1. **Waldatlas öffnen.** Jede anwesende regionale Karte zeigt im Ökologieblock
   jetzt zusätzlich WILDLIFE, PREDATORS, WATER FAUNA, INSECTS, DEADWOOD LIFE,
   CYCLE, CORRIDOR und HARVEST. Die Hirschart ist die echte regionale Art.
2. **Lumberyard oder Forester's Lodge inspizieren.** Die Zeile `FAUNA ECOLOGY`
   nennt Deer-Art und Dichte, Browse, Wühlen, Wolf/Bär, Biber/Otter, Fisch,
   Bestäuber, Schädlinge, Wasser, Zyklus und Korridor. `FOOD WEB` nennt das
   Keystone-Guild und die Zahl der Guilds/Kanten; `INDICATORS` nennt Gesundheit,
   Wasser, Totholz-Kontinuität, Altwald und Biodiversität.
3. **Jagen.** Die Herde am Tile ist die echte Population. Ein Wolf benötigt
   Beute, ein Bär ist selten, ein Biber sitzt am Wasser, ein Otter am sauberen
   Bach. Die Strecke bleibt eine konkrete Entnahme.
4. **Sammeln.** Wildbret, Fisch, Pilze, Honig, Beeren, Kräuter und Felle
   reagieren auf dieselben Werte; ein blütenreicher Rand liefert mehr Honig, ein
   alter Mykorrhiza-Wald mehr Pilze, ein sauberer Bach mehr Fisch.
5. **Vier Jahre laufen lassen.** Die Zyklen wechseln deterministisch; der
   Korridor und die Waldgesundheit bleiben lesbar; die Herden bleiben innerhalb
   ihrer Kapazität.

## 9. Verifikation

Stand 2026-11-26 (Release v3.64.0): Der Fokus-Test besteht mit **35/35**
Prüfungen. Die bestehenden Wald-/Fauna-/Insekten-Tests bestehen mit **30/30**,
der Vier-Jahres-Soak mit **2/2**. Der volle `npm test`-Lauf besteht mit
**1527/1527**; das Syntaxgate meldet **224 Dateien / 254 UI-IDs**. Die
deterministische 25-Jahres-Kampagne endet mit `ok: true`: **25 Jahre, 10.040
Ticks, 3,15–3,19 ms/Tick** (31,2 s und 43,9 s in zwei Läufen auf dem geteilten
Runner), 64 Einwohner, **13/13 Ambitionsstufen** und kein Game Over. Die Browser-Referenz öffnet **60 Atlas-Karten**, liest **14
Ökologieblöcke** und **12 Stichproben**, nennt **vier regionale Hirscharten**,
bestätigt **17 Gilden / 24 Kanten**, prüft alle **30 Fauna-Punkte** im
sichtbaren Text und zeichnet **0 Seiten- oder Konsolenfehler** auf. Die
Screenshots liegen unter `artifacts/forest-dynamics-live/`.

Die Messung aus v3.63.0 (5,4×/7,4×, Software-WebGL) bleibt die Referenz für die
Bodenansicht. Die neue Schicht fügt dort keinen Per-Frame-Rekord hinzu: Atlas,
Inspektor und Sammeln lesen den detaillierten Datensatz nur auf Anforderung,
während das tägliche Herdenmodell die gecachten Quick-Signale verwendet.
