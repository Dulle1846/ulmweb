# Baumarten, Mischung, Genetik und Sukzession · 1.2.23.1.061–090

> **Status: implementiert (v3.58.0).** Die 30 Punkte laufen als reine, abgeleitete
> `forest-dynamics`-Schicht über dem bestehenden `forestStandAt()`-Vertrag. Es
> gibt keinen zweiten Waldsimulator, keine neue Karte, keinen neuen Save-Typ und
> keine zusätzliche Pro-Tick-Schleife. Jede Waldkachel berechnet beim Lesen
> dieselbe deterministische Dynamik aus Arten, Alter, Störung, Standort und
> Bewirtschaftung. Stand, Resource-Node, Nachwachsen, Holzernte, Sammeln, Atlas
> und Inspektor lesen genau diesen Datensatz.

## 1. Architektur

`js/world/forest-dynamics.js` ist eine pure Funktion:

```js
forestDynamicsFor({
  species, speciesWeightTotal, dominantShare, speciesDiversity, evenness,
  ageClass, canopy, density, clearing, edge, moisture, temperature, height,
  coniferShare, broadleafShare, deadwood, litter, humus, moss, shrub, bramble,
  berry, sapling, herb, grass, flowers, disturbance, succession, regionalType,
  tropical, pureIsland, silviculture, formationId, understoryType, stockRatio,
})
```

Sie liefert `composition`, `age`, `regeneration`, `health`, `hazard`,
`silviculture`, `structure`, `soil` und `goods`. Das Ergebnis wird nicht
gespeichert; es fällt aus den bereits vorhandenen, save-kompatiblen Standwerten.
`forestStandAt()` hängt es als `stand.dynamics` an und reicht die wichtigsten
Felder an `getResourceNodeAt()` weiter.

Die regionale Schicht mischt die 60 Typarten mit der lokalen Basisformation:
**60 % regionale Arten, 40 % Ausgangsbestand**. Anschließend hält
`balanceRegionalSpecies()` die Grundidentität fest: ein Laubwald bleibt mit
höchstens 38 % Nadelholz ein Laubwald, ein reiner Nadelwald behält mindestens
94 % Nadelholz; echte Mischformationen bleiben frei. Dadurch bleibt ein
Eichenwald ein Eichenwald, während die regionalen Arten den tatsächlichen
Kronenraum mitbestimmen. Die Mischung wird nicht nur angezeigt:
`forestPickSpecies()` und damit der Renderer, die Mischungsklasse, die
Samenquelle und die Holzernte lesen dieselben Gewichte.

## 2. Die 30 Punkte

| Punkt | Umsetzung | Wirkung / Nachweis |
|---|---|---|
| **061** Regionale Baumarten-Sets | `blendedRegionalSpecies()` vereinigt die Arten aller 60 `REGIONAL_FOREST_TYPES` mit der Basisformation; 60 % regionale, 40 % lokale Gewichte; alle Schlüssel sind in `FOREST_SPECIES` vorhanden | `stand.species`, `pickSpecies()`, `mixture`, Dynamik und `forestSpecies` nutzen die regionale Zusammensetzung. Test: regionale Keys im Bestand, `regionalShare > 0.4` |
| **062** Rein- bis Mischwald | `composition.purity`, `dominantShare`, `evenness`, `mixtureClass` (`pure`, `dominant`, `even`, `mixed`) plus echte `pureIsland`-Flecken | Atlas/Inspektor zeigen Klasse und Reinheitsgrad; reine Inseln liefern für jeden Baum-Roll die Inselart. Test: alle Klassen in einem echten Realm |
| **063** Pionierarten auf jungen Störflächen | 14 Arten-Traits, darunter `pioneer`; Brand-, Kahlschlag- und Windwurfformationen führen Birke/Rowan; `pioneerSpecies` und `phase = pioneer` | Mehr Pionierarten und höhere Samenbank auf Störflächen. Test: gestörte Bestände führen Birke/Rowan, Pionierphase vorhanden |
| **064** Klimaxarten in alten Beständen | `shade`-Trait, `climaxSpecies`, normalisierter `pioneerShare`/`climaxShare`, Klimaxphase | Alte geschlossene Bestände kippen sichtbar zur Klimaxart. Test: Klimaxbestände haben `climaxShare > pioneerShare` |
| **065** Altersklassen und Bestandsphasen | `age.class`, `age.phase`, `age.phaseIndex`, `age.phases`, `rotationYears`; sechs Phasen von Pionier bis Klimax | Jeder Waldtyp hat eine lesbare Phase; die Rotation folgt System und Langlebigkeit. Test: alle sechs Phasen im Realm, Phase passt zur Altersklasse |
| **066** Totholz als eigene Größe | `deadwood` aus Logs, Stümpfen, Alter und Krankheit; Dynamik nutzt es für Feuerlast, Humus und Habitat | Totholz steuert Feuer, Mykorrhiza, Zersetzung und Lebensraum. Test: alt > reif > jung, `structure.deadwood` identisch |
| **067** Naturverjüngung aus dem Bestand | `seedBank`, `motherTrees`, `seedQuality`, `naturalRegeneration`, `regeneration.factor` | `forestRegrowthFactor()` multipliziert den Faktor in den bestehenden 400-Tage-Slices; kein neuer Zustand. Test: Faktor beschleunigt/verlangsamt die bestehende Regeneration |
| **068** Samenbank nach Störungen | `seedBank` steigt mit Pionieranteil, Serotinie, Streu und Störung; Brand erhöht sie | Nach Feuer steht mehr samenfähiges Material bereit. Test: Burn > ungestört |
| **069** Mutterbäume für Saatgut | `motherTrees`, `motherTreesPerHa`, `seedQuality`; alte Bestände liefern mehr und besseres Saatgut | Hohe Samenqualität erhöht die Naturverjüngung. Test: alt > jung bei Mutterbäumen und Qualität |
| **070** Genetische Vielfalt | `geneticDiversity` aus Artendiversität, Evenness, Reinheit, Rand und Alter; `inbreedingRisk` | Reine Inseln sind genetisch enger, Mischbestände breiter. Test: rein < gemischt, Inzuchtrisiko > |
| **071** Regionale Krankheitsresistenz | `disease`-Trait je Art, `diseaseResistance`, `pestFactor` | Resistenz senkt den echten `pestRisk` im Stand; anfällige Arten erhöhen ihn. Test: Eiche > Ulme, Ulme > Pestfaktor |
| **072** Standortanpassung | `drought`, `wet`, `cold`, `root`; `siteFitness`, `droughtStress`, `wetStress`, `coldStress` | Trockenheit, Nässe und Höhe/Kälte verändern Fitness und Produktivität. Test: Kiefer trocken > Erle trocken; Erle nass > Kiefer nass |
| **073** Sukzession Pionier → Klimax | `forestSuccessionStage()` wird in `phase` übersetzt; `pioneer`, `thicket`, `pole`, `mature`, `old-growth`, `climax` | Bestehende Störungssukzession bleibt die einzige Zeitachse. Test: frisch → Pionier, jung → Dickung, Erholung → Stangenholz, alt → Klimax |
| **074** Regionale Störungsregime | `hazard.regime` mit Feuer, Wind, Eis und Wasser; regionale Feuer-/Flutwerte, Höhe, Kronenschluss und Totholz | Das dominante Regime und seine Rotation sind lesbar; Feuerrisiko und Windexposition werden real moduliert. Test: trockene Kiefer feuerdominanter als nasse Erle, Fichte eisdominanter als Kiefer |
| **075** Waldweide | `wood-pasture` aus `mixed-open`/Grazing und offenem Kronendach; `browsePressure`, `woodPasture` | Viehverbiss bremst Regeneration, offene Struktur bleibt erhalten. Test: System erkannt, Verbissdruck > Hochwald |
| **076** Niederwald | `coppice` aus `swamp-carr`/Coppice-Nutzung; kurze Rotation, hoher Regenerationsfaktor | Stockausschlag wird als eigenes System geführt. Test: echter `swamp-carr`-Stand ist `coppice` |
| **077** Mittelwald | `coppice-with-standards` aus der gleichnamigen Formation; Ober-/Unterholz, 30-Jahres-Basisrotation | Mischung aus Standards und Unterholz bleibt sichtbar und erntbar. Test: System, Label, Rotation |
| **078** Hochwald | Default `high-forest` für geschlossene Hochwälder; lange Rotation, hoher Timber-Faktor | Lange Umtriebe und hohe Stammholzausbeute. Test: Default-System und Rotation > 100 Jahre |
| **079** Plenterwald | `selection-forest`/`selection-felling`; einzelstammweise Nutzung, `selection`, `continuousCover` | Ungleichaltriger Bestand mit dauernder Entnahme. Test: System und Dauerwald-Flag |
| **080** Dauerwald | `continuous-cover` für artenreiche, ungleichaltrige Mischbestände; dauernde Bedeckung, hoher Regenerationsfaktor | Naturnahe Bewirtschaftung ohne Kahlschlag. Test: Mischbestand wird Dauerwald, Regeneration > Hochwald |
| **081** Waldränder und Ökotone | `edge`, `clearing`, `edgeDiversity`, `ecotone`; Licht-, Kraut- und Lianenbonus | Der Rand hat eigene Artenvielfalt und mehr Nahrung. Test: Rand > Innenstand |
| **082** Lichtwald | `lightWoodland` bei offenem Kronendach und hoher Krautschicht; Lichttransmission und Gras/Herb | Offene Kronen lassen Bodenvegetation und Weide zu. Test: licht + krautreich = Lichtwald |
| **083** Kronendachlücken | `canopyGap` aus Clearing, Störung und Alter; `gapAge` aus der Sukzession | Lücken sind echte Struktur, keine reine Farbfläche. Test: Lücke > 30 %, Alter vorhanden |
| **084** Lianen | `lianaCover` aus Feuchte, Alter, Rand und Breitlaub; tropische Lianen aus dem Regenwaldprofil | Lianen tragen Struktur, Rattan/Weidenruten und Randvielfalt; der Renderer zeichnet Kletterer im Nahzoom. Test: feucht/alt > trocken, tropisch > temperat |
| **085** Epiphyten | `epiphyteCover` aus Feuchte, Moos, Kronenschluss, Alter und tropischem Profil | Moos, Flechte und Orchideen werden als Güter angeboten; der Renderer setzt Trunk-Patches. Test: feucht/alt > trocken, tropisch > temperat |
| **086** Unterholz | `shrubLayer`, `saplingLayer`, `understoryLabel`, `layers`; bestehende Sträucher, Brombeere, Beeren und Jungbäume | Unterholz bleibt eine eigene Schicht und speist Habitat, Deckung und Sammelgut. Test: Schichtenzahl und Label |
| **087** Krautschicht | `herbLayer`, `medicinalHerbs`; Kräuter, Gras und Blumen | Nahrung, Medizin und Weide hängen an der Krautschicht; `forestGoodsFor()` bietet Kräuter nur bei echter Bodendeckung. Test: Kräuter/Medizin > Schwelle |
| **088** Wurzeltiefe | `rootDepth`, `waterUptake` aus Art-Traits und Feuchte | Tiefwurzler senken die Staunässe und trotzen Trockenheit; die Werte sind pro Baumtyp verschieden. Test: Kiefer > Birke, Wasseraufnahme 0–1 |
| **089** Streu und Humus | `litterQuality`, `humusForm` (`Mull`/`Moder`/`Mor`), `decomposition` | Laubstreu bildet Mull, Nadelstreu Mor; Zersetzung hängt von Feuchte, Wärme und Koniferenanteil ab. Test: Eiche Mull, Fichte Mor, Laub > Nadel |
| **090** Mykorrhiza-Netzwerke | `mycorrhiza`, `mycorrhizaLabel`; Alter, Humus, Moos, Genetik und Störung | Pilznetzwerke verbessern Regeneration, Krankheitsresistenz und Sammelertrag; alte Wälder sind besser vernetzt. Test: alt > gestört, Netzwerklabel |

## 3. Echte Wirkungen

- **Regeneration:** `forestRegrowthFactor()` multipliziert den bisherigen
  Kompaktions-/Verbissschutz mit `dynamics.regeneration.factor` (0,64–1,40,
  Gesamtdeckel 1,58). Der 400-Tage-Slice bleibt unverändert; die Ökologie läuft
  auf demselben begrenzten Takt.
- **Holzernte:** Lumber-Camp-Batch und Durchforstung multiplizieren den
  regionalen Timber-Wert mit `silviculture.timberFactor` (0,75–1,10). Der
  Lumber-Cache speichert dafür zusätzlich `timberFactor` und `system`.
- **Sammeln:** Kräuter, Pilze, Moos/Flechte, Weidenruten/Rattan und Orchideen
  erscheinen nur, wenn die abgeleitete Struktur sie trägt; der Ertrag wird mit
  dem passenden `goods.boost` (0,75–1,30) multipliziert. Holz nutzt den
  Bewirtschaftungsfaktor.
- **Gefahren:** Feuerrisiko, Pestrisiko und Windexposition werden mit den
  artspezifischen Abweichungen moduliert; die Werte bleiben auf 0–1 begrenzt.
- **Produktivität:** Standortfit fließt mit 0,86–1,06 in die bestehende
  Produktivität ein; keine neue Ökonomie.
- **Darstellung:** Der Atlas zeigt pro anwesendem Typ einen echten
  Ökologieblock (Mischung, Phase, Pionier/Klimax, Samenbank, Mutterbäume,
  Genetik, Standortfit, Resistenz, System, Humus/Wurzeln/Mykorrhiza, Struktur,
  Lücken). Der Inspektor druckt dieselben Werte. Im Nahzoom zeichnet der
  Renderer Lianen und Epiphyten aus `stand.dynamics.structure`.

## 4. Save- und Performance-Vertrag

- **Kein Save-Feld.** `dynamics` wird bei jedem `forestStandAt()` neu berechnet.
  Alte Saves bleiben ohne Migration gültig.
- **Kein zweiter Bestand.** Die 60 regionalen Arten werden in die bestehende
  `species`-Liste gemischt; `pickSpecies`, `mixture`, `meta` und der Renderer
  lesen weiter dieselbe Quelle.
- **Begrenzte Arbeit.** Die Berechnung ist O(Arten pro Kachel) ohne
  Nachbarscan, ohne Per-Tick-Schleife und ohne Allocation pro Baum. Lianen und
  Epiphyten kosten nur im Nahzoom wenige Striche.
- **Determinismus.** Gleiche Kachel, gleicher Seed und gleicher Kontext liefern
  denselben Datensatz; der Test replayt `stand.dynamics` tiefengleich.

## 5. Tests

- `tests/world/forest-dynamics.test.js` — Trait-Matrix, alle 30 Punkte,
  Mischungsklassen, echte regionale Arten, Phasen, Samenbank, Genetik,
  Standortfit, Störungsregime, alle sechs Systeme, Struktur, Boden und die
  gemeinsame Nutzung durch Stand/Node/Regeneration/Güter.
- `tests/world/forest-ecology.test.js` — bestehende Stand-, Arten-, Alters-,
  Gemisch- und Survey-Gates.
- `tests/world/forest-pressure.test.js` — Kompaktion und Verbiss bremsen die
  Regeneration weiterhin.
- `tests/systems/forest-gathering.test.js` — echte Standdynamik im
  Sammelergebnis, Saison, Bounty, Durchforstung.
- `tests/presentation/forest-atlas.test.js` — 60 Karten, Ökologieblock und
  Inspectortext.
- `tests/world/regional-forests.test.js` — 60 Standortfenster, 9-Klima-Scan,
  Übergänge, Save-Roundtrip.

## 6. Verifikation

Stand 2026-11-25: **1.450/1.450 Tests** grün. Die deterministische
25-Jahres-Kampagne läuft **10.040 Ticks** in **19.213,8 ms** (**1,175 ms/Tick**),
72 Bewohner, alle 13 Ambitionen, alle Anforderungen wahr, **3.507 Waldkacheln**,
**0 untypisiert**, 23 echte Fuel-Backfill-Aufträge (max. 1 pro Phase), kein Game
Over. Die tropische Browser-Referenz sieht **9.526 Waldkacheln**, **0 untypisiert**,
**60 Atlas-Karten**, **18 Timber-Market-Zeilen**, drei verschiedene gerenderte
Bestände, den Ökologieblock und die Lianen-/Epiphytenzeile, ohne Konsolen- oder
Seitenfehler. Der Spec-Audit meldet **1.616/1.618 implementiert** in 38
Abschnitten; offen bleiben nur 4.0.1 und 4.0.6. Beide Live-Hosts wurden nach dem
Produktionsdeploy geprüft.
