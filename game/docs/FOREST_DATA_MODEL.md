# Wald-Datenmodell, Performance und Modding — 1.2.23.1.121–150

> **Status: implementiert (v3.67.0).** Die dreißig Punkte aus **E. Simulation,
> Datenmodell und Performance** liegen in `js/world/forest-model.js`. Das Modul
> baut keine zweite Simulation: Es liest die vorhandenen regionalen Typen,
> Stände, Böden, Sukzessionsprofile und RNG-Ströme und stellt daraus die
> Matrizen, Indizes und Budgets bereit, die Atlas, Störungsausbreitung und Save
> gemeinsam verwenden. Die 30 Punkte stehen zusätzlich als maschinenlesbares
> Manifest `FOREST_MODEL_REQUIREMENTS` im Code; der Spec-Audit liest dieses
> Manifest direkt.

## 1. Ein gemeinsamer Datenpfad

Jede Waldkachel läuft weiterhin durch:

`regional-forests.js` (Typ, IDs, Klima-/Höhenfenster)
→ `forest-ecology.js` (`forestStandAt`, Boden, Struktur, Phänologie)
→ `forest-succession.js` (Störung, Alter, Nachbarschaft)
→ `resource-geography.js` (Vorrat, Ernte, Save)
→ `forest-atlas-panel.js` (Spieleransicht).

`forest-model.js` ist die gemeinsame **Leseschicht** darüber. Es speichert
keinen zweiten Waldzustand und schreibt keine eigene Kachel. Die einzige
persistierte Ergänzung ist der Versionsmarker im Ressourcen-Snapshot; die
Typ-IDs selbst werden weiterhin deterministisch aus dem Seed abgeleitet.

## 2. Die dreißig Punkte

| Punkt | Umsetzung | Öffentliche Funktion |
|---|---|---|
| 121 | Stabile IDs `1.2.23.1.001`–`060`, Alt-Index-Migration | `forestTypeIdFor`, `forestTypeIdFromLegacy` |
| 122 | Normalisierte Gewichte aus Klima, Höhe, Temperatur und Feuchte | `forestRegionalWeightsFor` |
| 123 | Höhenfenster je Typ und je Baumart | `forestLimitsFor` |
| 124 | Temperatur-, Frost- und Niederschlagsfenster | `forestClimateEnvelopeFor` |
| 125 | Bodenmatrix aus Nährstoff, pH, Wasserspeicherung, Drainage und Erosion | `forestSoilFor` |
| 126 | Feuchtigkeitsindex und Lebensraumklasse Aue/Moor/Trockenwald | `forestMoistureIndexFor` |
| 127 | Störungsmatrix Feuer, Sturm, Eis, Hochwasser, Krankheit | `forestDisturbanceMatrixFor` |
| 128 | Sukzessionsmatrix mit frisch → Regeneration → Jungwald → erholt → geschlossen | `forestSuccessionMatrixFor` |
| 129 | Regionaler Artenpool für Bäume, Tiere und Unterwuchs | `forestSpeciesPoolFor` |
| 130 | Vier LOD-Stufen mit Baumabstand, Schatten und Baumdeckel | `forestLodFor` |
| 131 | Deterministische Chunk-Vorberechnung mit begrenzter Stichprobe | `precomputeForestChunk` |
| 132 | Jahres-Cadence auf dem bestehenden 400-Tage-Kalender | `forestAnnualCadenceFor` |
| 133 | Blatt-, Blüte- und Fruchtphase aus dem Stand | `forestPhenologyFor` |
| 134 | Stabiler Regions-Seed aus Seed, Koordinate und Typ | `forestRegionSeedFor` |
| 135 | Versionierter Save-Marker | `forestModelSaveMeta` |
| 136 | Migration alter `forestKind`-Indizes ohne Waldverlust | `migrateForestModelSave` |
| 137 | Modding-Schema für eigene Typen | `validateForestTypeDefinition` |
| 138 | Katalogweite Validierung von IDs, Arten und Gewichten | `validateForestModelCatalog` |
| 139 | Telemetrie für Chunks, Cache, Laufzeit und gesichtete Typen | `forestModelTelemetrySnapshot` |
| 140 | Festes Arbeitsbudget je Chunk | `forestChunkBudgetFor` |
| 141 | Gecachte Limits, Artenpools, Verteilungen und Chunks | `forestModelCacheStats` |
| 142 | Räumlicher Index für Tiere, Ressourcen und Nachbarsuche | `buildForestSpatialIndex` |
| 143 | Acht-Nachbar-Regel für Waldränder und Übergänge | `forestNeighboursFor` |
| 144 | Feuerausbreitung mit Windrichtung und Zellnachbarn | `forestFireSpreadFor` |
| 145 | Windwurf mit Richtung, Bestandsalter und Schadholz | `forestWindthrowFor` |
| 146 | Wasserfluss durch Auen und Bruchwälder | `forestWaterFlowFor` |
| 147 | Erosion nach Kahlschlag oder Brand | `forestErosionFor` |
| 148 | Regeneration von Kahlflächen über Jahrzehnte | `forestRegenerationFor` |
| 149 | Biodiversitätsindex je Waldtyp | `forestBiodiversityFor` |
| 150 | Getrennte Seeds für Vegetation, Tiere und Events | `forestRngSeedFor` |

## 3. Standort- und Klimamatrix

Die Verteilung ist kein neuer Zufallsgenerator. Für ein Klima werden die
passenden Typen gefiltert und mit ihrer Priorität sowie drei Fenster-Fits
gewichtet:

```text
fit = 0.38 * fit(Höhe) + 0.34 * fit(Temperatur) + 0.28 * fit(Feuchte)
weight = priority * (0.2 + fit * 0.8)
share = weight / sum(weight)
```

`fit` ist 1 innerhalb des artspezifischen Fensters und fällt außerhalb mit dem
Abstand ab. Dadurch bleibt die Verteilung über Klimagrenzen stetig, ohne dass
eine Kachel zwischen zehn ähnlichen Typen springt. Die Summe aller `share` ist
exakt 1. Das Ergebnis wird nach Klima und auf zwei Nachkommastellen gerundeten
Standortwerten gecacht.

Die Bodenmatrix kombiniert die bestehenden `BIOME_SOIL_TYPES` mit Humus,
Säure, Wasserstand und Kronenschluss. Der pH liegt zwischen 4,2 und 7,4; die
Klassen `poor/moderate/rich`, `acidic/neutral/alkaline` und
`dry/fresh/retentive` sind reine Anzeige- und Regelhilfen. Der Feuchtigkeitsindex
gewichtet Feuchte, Nässe, Wasserlöcher und den regionalen Hochwasserfaktor.
Daraus folgen `dry`, `fresh`, `moist`, `wet`, `flooded` sowie die Lebensräume
`dry-forest`, `upland`, `mire` und `floodplain`.

## 4. Störung, Sukzession und Nachbarschaft

Die Störungsmatrix liest die bereits vorhandenen Standwerte
`fireRisk`, `windExposure`, `snowPotential`, `pestRisk` und den regionalen
Hochwasserfaktor. Sie erfindet keine neuen Zufallsereignisse; sie macht die
Zusammensetzung sichtbar und liefert eine grobe Wiederkehrzeit.

Die Sukzessionsmatrix verwendet exakt die Schwellen aus
`FOREST_SUCCESSION_PROFILES` und `forestSuccessionStage`:

| Stufe | Übergang |
|---|---|
| fresh | `freshDays` → regrowth |
| regrowth | `regrowthDays` → young |
| young | `youngDays` → recovered |
| recovered | `recoveredDays` → closed |

Die Ausbreitung in `forest-succession.js` nutzt jetzt dieselbe
`forestNeighbourOrderFor`-Reihenfolge wie das Modell. Bei Sturm werden die
downwind gelegenen Nachbarn zuerst geprüft; bei ruhigem Wetter entscheidet
weiterhin der deterministische Seed-Hash über den Start. Die acht Nachbarn
bleiben auf die Karte begrenzt; Randkacheln haben drei, Binnenkacheln acht
gültige Nachbarn.

## 5. Chunks, LOD und Budget

`precomputeForestChunk` tastet höchstens 16 Punkte je 16×16-Chunk ab. Die
Stichprobe ist an den LOD-Tier gekoppelt:

| LOD | Zoom | Schritt | Bäume/Chunk | Schatten |
|---|---:|---:|---:|---|
| detail | ≥ 0,95 | 1 | 48 | voll |
| canopy | ≥ 0,55 | 1 | 24 | ambient |
| mass | ≥ 0,28 | 2 | 10 | keine |
| impostor | < 0,28 | 6 | 3 | keine |

Das Arbeitsbudget ist `maxStands: 16`, `maxTypes: 8`, `maxTrees` je LOD und
`maxMs: 1,6` (detail) bzw. `0,8`. `withinBudget` bezieht sich auf die
**Arbeitsmenge**, nicht auf eine wackelige Wanduhr: Ein langsamer CI-Rechner
soll den Test nicht falsch rot machen. Die tatsächliche Laufzeit steht in
`elapsedMs` und in der Telemetrie.

Die Caches sind hart begrenzt:

- Verteilungen: 64 Einträge,
- Limits: 64,
- Artenpools: 64,
- Chunks: 64.

Bei Überschreitung wird der älteste Eintrag verdrängt. `forestModelCacheStats`
macht die Größen sichtbar; `clearForestModelCaches` leert sie für Tests und
Seed-Wechsel. Die Telemetrie hält höchstens acht letzte Chunk-Proben und zählt
Chunks, Cache-Treffer, Fehlschläge, Maximalzeit und gesichtete Typen.

## 6. Feuer, Windwurf, Wasser, Erosion und Regeneration

- **Feuer:** `forestFireSpreadFor` bewertet die acht Nachbarn mit ihrem
  `fireRisk`, der Windausrichtung und dem saisonalen Trockenheitsfaktor.
- **Windwurf:** `forestWindthrowFor` leitet die Richtung aus dem Stand-Seed ab;
  Alter und Windexposition erhöhen das Risiko, flach wurzelnde Bestände
  zusätzlich. `salvage` ist die grobe Schadholzmenge.
- **Wasser:** `forestWaterFlowFor` verbindet Nässe, Feuchte, Hochwasser und
  Hangneigung. Auen und Bruchwälder werden als `floodplain`/`mire` markiert.
- **Erosion:** `forestErosionFor` kombiniert Bodenerodierbarkeit, offene
  Kronen, Hangneigung, Störung und Wasserfluss. Kahlschlag und Brand liegen
  deutlich über geschlossenem Altbestand.
- **Regeneration:** `forestRegenerationFor` nutzt den vorhandenen
  `forestRegrowthFactor`, den Samenvorrat, Mutterbäume und den Erosionszuschlag.
  Die Jahre bis zum Kronenschluss sind eine Anzeige, keine neue Tick-Schleife.
- **Biodiversität:** `forestBiodiversityFor` gewichtet Artenvielfalt, Totholz,
  Kronenschichten, Faunenreichtum und Altersklasse zu 0–100 %.

## 7. Save und Migration

Neue Ressourcen-Snapshots tragen:

```js
{
  version: 1,
  forestModelVersion: 1,
  forest: [...],
  stone: [...],
  forestCapacity: [...],
  stoneCapacity: [...]
}
```

`restoreResourceGeography` akzeptiert weiterhin Snapshots ohne
`forestModelVersion`. Der Marker ist optional; ein alter 3.66-Save lädt ohne
Waldverlust. `migrateForestModelSave` übersetzt alte `forestKind`-Indizes
(1-basiert) in stabile IDs und dedupliziert sie. `validateForestModelSave`
weist unbekannte IDs, Duplikate und fremde Versionen zurück. Die
Typ-IDs selbst werden nicht als Pflichtfeld gespeichert, weil sie aus Seed,
Katalog und Standort deterministisch hervorgehen.

## 8. Modding

Ein eigener Typ muss `validateForestTypeDefinition` bestehen:

- `id`: `1.2.23.1.NNN` oder `mod:name`,
- `key`, `label`, `climates`, `formations`,
- `temp`, `moisture`, `height` als aufsteigende Werte in `[0,1]`,
- `priority` als Zahl 0,5–20 in halben Schritten,
- gewichtete `species`, `goods`, `fauna`.

`validateForestModelCatalog` prüft zusätzlich eindeutige IDs und Keys sowie
Gewichtssummen. Die 60 eingebauten Typen bestehen den Validator; ein Mod-Typ
mit negativem Artgewicht wird mit einer konkreten Fehlermeldung abgelehnt.

## 9. RNG-Ströme und Determinismus

`FOREST_RNG_STREAMS` trennt:

- `forest-vegetation`,
- `forest-animals`,
- `forest-events`.

`forestRngSeedFor(stream, seed, x, y)` salzt den Stand-Seed mit dem Streamnamen.
Damit können Vegetations-, Tier- und Ereignislogik unabhängig würfeln, ohne
dass eine zusätzliche Tierentscheidung die Baumartenverteilung verschiebt.
Alle Funktionen sind reine Reads; sie verändern keinen globalen Zähler.

## 10. Spieleransicht

Der FORESTS-Atlas zeigt je vorhandenem Typ zusätzlich vier Zeilen:

- `MODEL` — stabile ID, regionaler Anteil, Temperatur-/Feuchte-/Höhenfenster,
- `SOIL / WATER` — Boden, pH, Nährstoff, Wasserspeicherung, Feuchtigkeitsklasse,
- `DISTURBANCE` — Feuer, Sturm, Eis, Hochwasser, Sukzessionsstufe, Wiederkehr,
- `PERFORMANCE` — LOD, Bäume/Chunk, Biodiversität, Regenerationsjahre, RNG-Stream.

Die Zeilen sind aus demselben Stand abgeleitet, den der Förster und die Ernte
lesen. Sie zeigen keine erfundenen Zahlen und keine `NaN`-Platzhalter.

## 11. Nachweise

- `tests/world/forest-model.test.js` — 14 Tests über alle 30 Punkte, inklusive
  Manifest, IDs, Gewichte, Boden, Feuchtigkeit, Störung, Sukzession, Artenpool,
  LOD, Chunk/Cache/Telemetrie, Save-Migration, Modding, Spatial Index,
  Nachbarschaft, Feuer, Windwurf, Wasser, Erosion, Regeneration, Biodiversität
  und RNG.
- `tests/presentation/forest-atlas.test.js` — die vier neuen Atlas-Zeilen.
- `tests/world/regional-forests.test.js` — Save-Roundtrip und alter Save ohne
  Marker.
- `tests/systems/forest-succession.test.js` — bestehende Ausbreitung und
  Kontrolle bleiben grün.
- `tests/browser/regional-forest-reference.mjs` — echter Browserlauf mit 60
  Atlas-Karten, 10 Modellblöcken, den vier neuen Zeilen, drei gerenderten
  Standbildern und keiner `undefined`/`NaN`- oder Konsolenfehlermeldung.
