# Baumarten, Mischung, Genetik und Sukzession · 1.2.23.1.061–090

> **Status: implementiert, vertieft und als Spielmechanik verdrahtet (v3.61.0).** Die 30 Punkte laufen als reine, abgeleitete
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
  berry, sapling, herb, grass, flowers, ageStructure, compaction,
  browsingPressure, logs, stumps, successionProgress, disturbance, succession,
  regionalType, tropical, pureIsland, silviculture, formationId,
  understoryType, stockRatio,
})
```

Sie liefert `composition`, `age`, `regeneration`, `health`, `hazard`,
`silviculture`, `structure`, `soil`, `goods` und das daraus abgeleitete
`working`-Profil. Das Ergebnis wird nicht
gespeichert; es fällt aus den bereits vorhandenen, save-kompatiblen Standwerten.
`forestStandAt()` hängt es als `stand.dynamics` an, spiegelt die neuen
Teilprofile nach `stand.structure` und reicht die wichtigsten Felder an
`getResourceNodeAt()` weiter. Die neuen Eingaben sind keine Save-Felder: Alter,
Verdichtung, Verbiss, Logs, Stümpfe und Sukzessionsfortschritt existieren bereits
im Stand und werden nur an die Ableitung durchgereicht.

Die regionale Schicht mischt die 60 Typarten mit der lokalen Basisformation:
**60 % regionale Arten, 40 % Ausgangsbestand**. Anschließend hält
`balanceRegionalSpecies()` die Grundidentität fest: ein Laubwald bleibt mit
höchstens 38 % Nadelholz ein Laubwald, ein reiner Nadelwald behält mindestens
94 % Nadelholz; echte Mischformationen bleiben frei. Dadurch bleibt ein
Eichenwald ein Eichenwald, während die regionalen Arten den tatsächlichen
Kronenraum mitbestimmen. Die Mischung wird nicht nur angezeigt:
`forestPickSpecies()` und damit der Renderer, die Mischungsklasse, die
Samenquelle und die Holzernte lesen dieselben Gewichte.

## 1b. Detailtiefe der 30 Punkte (v3.59.0, Spielrolle v3.60.0)

Die erste Ausbaustufe hatte pro Punkt meist eine Kennzahl. Die vertiefte Stufe
führt für jeden Punkt ein eigenes, zusammenhängendes Teilprofil. Alle Werte sind
begrenzt (0–1, Jahre, cm, ha oder Stämme/ha), deterministisch und werden aus dem
Bestand berechnet; es gibt weiterhin keinen zusätzlichen Save-Zustand.

| Punkt | Vertieftes Teilprofil | Neue, echte Verbraucher |
|---|---|---|
| **061** Regionale Sets | `composition.provenance` mit `regional`, `local`, `source`, `regionalSpecies`; `composition.cohorts[]` mit Art, Label, Share, Rolle, Alterscohorte, Samenquelle, Krankheitsrisiko und Timber-Anteil | Atlas `MIX`/Arten-Chips, Inspektor, Timber-Ledger, Sammelgut |
| **062** Mischungsgrad | `purity`, `dominantShare`, `speciesCount`, `evenness`, `mixtureClass`, `pureIsland`; jede Cohorte trägt ihre Rolle `pioneer`/`matrix`/`climax` | Atlas `MIX`, `COHORTS`, Inspektor-Mixklasse, Ernteertrag |
| **063** Pioniere | `pioneerSpecies`, `pioneerShare`, `roleForTraits()`, `seedSource`; junge Cohorten besitzen `young`-Alter und Pionierrolle | Pionierphase, Samenbank, Regeneration, Atlas |
| **064** Klimaxarten | `climaxSpecies`, `climaxShare`, `roleForTraits()`; Klimaxcohorten wechseln ab 24 % Alter auf `ancient` und liefern Mutterbaum-Saatgut | Klimaxphase, Mutterbäume, Genetik, Atlas |
| **065** Altersklassen | `age.cohorts {young,mature,ancient}`, `standAgeYears`, `spreadYears`, `dominantCohort`, `uneven`; sechs Phasen bleiben die Zeitachse | Atlas `COHORTS`/`PHASE`, Inspektor, Rotation, Timber-Faktor |
| **066** Totholz | `structure.deadwoodProfile` mit `total`, `standing`, `fallen`, `stumps`, `decay`, `habitat`, `cavityTreesPerHa`; die Summe der drei Fraktionen ist exakt `total` | Feuerlast, Humus, Mykorrhiza, Habitat-Score, Atlas `DEADWOOD`, Inspektor |
| **067** Naturverjüngung | `seedRain`, `germination`, `seedlingBank`, `saplingRecruitment`, `browseBrake`, `compactionBrake`, `naturalRegeneration`, `factor`, `seedSource` | `forestRegrowthFactor()` in den 400-Tage-Slices, Atlas `REGEN`, Inspektor |
| **068** Samenbank | `seedBankViability`, `buriedSeedYears`, `seedBank`, Serotinie- und Brandbonus; die Bank bleibt nach der Störung lesbar | Regeneration, Brandfolgebestand, Atlas `SEED BANK`, Inspektor |
| **069** Mutterbäume | `motherTrees`, `motherTreesPerHa`, `motherTreesBySpecies[]` mit Art, Label, Share und Stämmen/ha | Saatgutqualität, Naturverjüngung, Atlas/Inspektor |
| **070** Genetik | `geneticDiversity`, `inbreedingRisk`, `provenance`; Reininseln, Alter, Rand und Mischung fließen ein | Krankheitsresistenz, Regeneration, Atlas `GENETICS` |
| **071** Krankheitsresistenz | `diseaseResistance`, `pestFactor`, artspezifisches `disease`-Trait und Cohorten-Krankheitsrisiko | Echter `pestRisk`, Störungsanfälligkeit, Atlas `SITE FIT` |
| **072** Standortanpassung | `droughtStress`, `wetStress`, `coldStress`, `siteFitness`; Boden, Höhe, Feuchte und Art-Traits | Produktivität, Resistenz, Regeneration, Atlas/Inspektor |
| **073** Sukzession | `phase`, `phaseIndex`, `FOREST_PHASES`, `successionProgress`, `gapAge`; Fortschritt verlängert Lückenalter und Regeneration | Bestehende Störungssukzession, Atlas `PHASE`, Inspektor |
| **074** Störungsregime | `regime {fire,wind,ice,water,dominant,label,driver,severity,patchSizeHa,refugia,returnIntervalYears}` | `fireRiskDelta`, `windFactor`, Atlas `REGIME`, Inspektor |
| **075** Waldweide | `browsePressure`, `grazingPressure`, `retentionTreesPerHa`, `woodPasture`; Viehverbiss bremst echte Verjüngung | Regeneration, `forestRegrowthFactor()`, Atlas-Systemzähler |
| **076** Niederwald | `stoolsPerHa`, `harvestIntensity`, `rotationProgress`, `ageToRotationYears`, `coppice` | Kurze Rotation, Stockausschlag, Holzertrag |
| **077** Mittelwald | `standardsPerHa`, `stoolsPerHa`, `canopyTarget`, `coppice`, Ober-/Unterholz | Standards und Unterholz im Ertrag und Atlas |
| **078** Hochwald | `timberFactor`, `rotationYears`, `retentionTreesPerHa`, `canopyTarget` | Langrotation, Lumber-Camp-Batch, Durchforstung |
| **079** Plenterwald | `selection`, `retentionTreesPerHa`, `harvestIntensity`, `canopyTarget`, einzelstammweise Rotation | Selection-Ernte und Dauerbestand |
| **080** Dauerwald | `continuousCover`, `retentionTreesPerHa`, `rotationProgress`, hoher Regenerationsfaktor | Naturnahe Bewirtschaftung ohne Kahlschlag |
| **081** Waldränder | `structure.edgeProfile {active,widthM,mantleCover,species,lightBonus}` plus `edgeDiversity` | Randvielfalt, Licht, Lianen, Wild, Atlas `EDGE` |
| **082** Lichtwald | `lightWoodland`, `canopyTarget`, `gapProfile.light`, Krautschicht und Gras | Offene Krone, Weide, Atlas `LIGHT` |
| **083** Kronenlücken | `structure.gapProfile {fraction,age,sizeClass,origin,light,regenerationShare}`; `gapOrigin` aus Sturm, Feuer, Ernte oder Alter | Lückenalter, Verjüngung, Atlas `GAPS`, Inspektor |
| **084** Lianen | `structure.lianaProfile {cover,types,goods}`; temperate Ivy/Honeysuckle, tropisch Rattan/Liana vines | Rattan/Weidenruten, Randstruktur, Atlas `STRUCTURE` |
| **085** Epiphyten | `structure.epiphyteProfile {cover,groups,richness}` mit Moss, Lichen, Fern, Orchid | Moos, Flechte, Orchideen, Atlas/Inspektor |
| **086** Unterholz | `understoryProfile {shrub,sapling,browse,label}`, `layers`, `shrubLayer`, `saplingLayer` | Habitat, Deckung, Verbiss, Wild, Atlas `STRUCTURE` |
| **087** Krautschicht | `herbProfile {cover,food,medicine,flowering}`, `herbFood`, `medicinalHerbs` | Kräuter-/Medizinertrag, Wild, Atlas `HERB` |
| **088** Wurzeltiefe | `soil.rootingType` (`Deep taproot`/`Heart root`/`Sinker roots`/`Shallow plate`), `rootDepth`, `waterUptake`, `topsoilUptake`, `subsoilUptake` | Staunässe, Trockenstress, Atlas `SOIL` |
| **089** Streu/Humus | `litterProfile {broadleaf,needle,depthCm,quality,cToN}`, `humusDepthCm`, `humusForm`, `decomposition` | Mull/Moder/Mor, Pilzertrag, Atlas `SOIL`/`MYCORRHIZA` |
| **090** Mykorrhiza | `mycorrhiza`, `mycorrhizaType` (`Ectomycorrhizal`/`Arbuscular`/`Mixed network`), `networkReachM`, `mycorrhizaLabel` | Regeneration, Resistenz, Pilzertrag, Atlas/Inspektor |

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

## 2b. Spielerbeobachtung und Wirkung (Live-Beweis)

Der Live-Beweis startet mit `Seed 20261123`, temperate, ohne Save und spielt
über die sichtbaren Knöpfe: Lumberyard-Inspektor, `THIN NEAREST STAND`,
`GATHER FOREST PRODUCTS`, Forest-Atlas und die 4×-Geschwindigkeit. Nach drei
vollen Jahren (Jahr 1 → Jahr 4, Tick 1.269) zeigt der Lauf 4.274 Waldkacheln,
0 untypisierte Kacheln, alle sechs Bewirtschaftungssysteme, 60 Atlas-Karten und
14 Karten mit Ökologieblock. Die Stichprobe umfasst 238 Bestände: Niederwald 20,
Mittelwald 4, Hochwald 164, Plenterwald 1, Dauerwald 45, Waldweide 4. Die Ernte
senkte den Bestand am Lumberyard von 181 auf 171 und legte 10 Logs ins lokale
Lager (18 → 28); das Sammeln lieferte 2 Timber, 3 Birch sap, 3 Wild garlic,
2 Firewood, 3 Maple syrup und 2 Mushrooms. Der Gesamtbestand bewegte sich in
drei Jahren von 637.348 auf 629.068. Am beobachteten Störungsstand `(87, 38)`
wuchs das Störungsalter von 60 auf 600 Tage, die Phase wechselte von `fresh`
zu `recovered` und die Samenbank von 48 % auf 36 %.

| Punkt | Was der Spieler sieht | Was er tun kann | Nachgewiesene Wirkung |
|---|---|---|---|
| **061** Regionale Baumarten-Sets | Arten-Chips im Atlas, Arten im Inspektor | Mischbestand ernten | regionale Arten bestimmen Timber, Mischung und Sammelgut |
| **062** Rein- bis Mischwald | `MIX`-Wert und Reinheitsgrad im Atlas | Durchforsten | Reinheit/Mischung ändern Ertrag und Struktur |
| **063** Pionierarten auf Störflächen | Pionierphase und Brandbestand im Atlas/Inspektor | Störungsfläche aufsuchen | Brandbestand: 81 % Samenbank, Pionieranteil |
| **064** Klimaxarten in alten Beständen | `PHASE`, Pionier/Klimax im Atlas | Alten Bestand stehen lassen | Old-growth: 53 % Klimaxanteil, mehr Mutterbäume |
| **065** Altersklassen und Bestandsphasen | sechs Phasen und Rotation | Warten oder ernten | Rotation 19–158 Jahre, Phase wechselt mit dem Bestand |
| **066** Totholz | `Deadwood` und die drei Fraktionen im Inspektor | Totholz stehen lassen | 22 % Totholz (9 % stehend / 9 % liegend / 4 % Stümpfe); Feuerlast, Humus, Mykorrhiza und Habitat |
| **067** Naturverjüngung | `Regeneration`, `Seed source`, Regen/Germ im Inspektor | Durchforsten | 57 % Samenregen, 66 % Keimung, 52 % Sämlinge, 46 % Recruitment; der Faktor läuft in den 400-Tage-Slices |
| **068** Samenbank nach Störungen | `SEED BANK` im Atlas | Brandfläche beobachten | 81 % nach Brand statt niedrigerer ungestörter Bank |
| **069** Mutterbäume | `mother trees`/ha im Atlas | Alte Bäume stehen lassen | 26 Mutterbäume/ha über 3 Arten, höhere Samenqualität |
| **070** Genetische Vielfalt | `GENETICS` im Atlas | Mischbestand erhalten | 73 % genetische Breite, geringeres Inzuchtrisiko |
| **071** Regionale Krankheitsresistenz | `SITE FIT`/Resistenz im Atlas | Art und Standort wählen | 61 % Resistenz moduliert das echte Pestrisiko |
| **072** Standortanpassung | `SITE FIT` im Atlas/Inspektor | Standortgerechte Art wählen | 85 % Fitness speist Produktivität |
| **073** Sukzession Pionier → Klimax | Phasen und `Succession` im Inspektor | Drei Jahre laufen lassen | 3 Jahre bis Jahr 4 / Tick 1.269; beobachtete Störung 60 → 600 Tage, Phase fresh → recovered |
| **074** Regionale Störungsregime | `REGIME` mit Feuer-/Windanteil, Severity, Patch und Return im Atlas | Standort und Bestand wählen | Feuer-, Wind-, Eis- und Wasserregime unterscheidbar; 31 % Severity, 2,5 ha Patch, 165 Jahre Return |
| **075** Waldweide | `Waldweide`, `Browse` im Inspektor | Beweideten Bestand aufsuchen | 32 % Verbissdruck, 12 Retention-Bäume/ha, langsamere Regeneration |
| **076** Niederwald | `Niederwald` im Atlas/Inspektor | Jungbestand durchforsten | 19-Jahres-Rotation, 1.121 Stöcke/ha und 124 % Regeneration |
| **077** Mittelwald | `Mittelwald` im Atlas/Inspektor | Ober-/Unterholz ernten | 34-Jahres-Rotation, 35 Standards/ha, 117 % Regeneration |
| **078** Hochwald | `Hochwald` im Atlas/Inspektor | Lange Rotation abwarten | 136-Jahres-Rotation, 104 % Timber-Faktor |
| **079** Plenterwald | `Plenterwald` im Atlas/Inspektor | Einzelstammweise ernten | 90-Jahres-Rotation, Selection-Flag |
| **080** Dauerwald | `Dauerwald` im Atlas/Inspektor | Dauerbestand stehen lassen | 125-Jahres-Rotation, 117 % Regeneration |
| **081** Waldränder und Ökotone | `EDGE` mit Mantelbreite/Deckung, Lianen im Atlas | Rand aufsuchen | 16 m Mantel, 73 % Deckung, 76 % Randvielfalt, mehr Licht und Sammelgut |
| **082** Lichtwald | `LIGHT` = Open woodland | Offene Krone aufsuchen | offener Bestand mit 72 % Krautschicht und 55 % Kronenziel |
| **083** Kronendachlücken | `GAPS` mit Größe, Ursprung und Alter im Atlas | Sturm-/Erntelücke beobachten | 86 % Lücke, `storm / large`, 111 Tage Lückenalter |
| **084** Lianen | `Liana` mit Typen im Atlas/Inspektor | Feuchten/tropischen Bestand aufsuchen | 34 % Lianenbedeckung (Ivy, Honeysuckle), Rattan/Weidenruten |
| **085** Epiphyten | `epiphyte` mit Gruppen im Atlas/Inspektor | Feuchten Bestand aufsuchen | 44 % Epiphytenbedeckung (Moss, Lichen, Fern, Orchid) |
| **086** Unterholz | `STRUCTURE`/Understorey mit Browse | Durchforsten | Strauch-/Jungbaumschicht speist Habitat und 32 % Verbiss |
| **087** Krautschicht | `HERB` mit Food/Medicine/Flowering | Licht schaffen | 63 % Kraut, 69 % Nahrung, 60 % Medizin, 58 % Blüte |
| **088** Wurzeltiefe | `Roots`, `Rooting`, `Water uptake` | Art und Feuchte wählen | `Deep taproot`, 74 % Wurzeln, 70 % Wasseraufnahme senkt Staunässe |
| **089** Streu und Humus | `SOIL` mit Litter-Tiefe, Humus-Tiefe und Decomposition | Laub-/Nadelbestand wählen | Mull, 4 cm Streu, 7 cm Humus, 70 % Zersetzung erhöhen den Pilzertrag |
| **090** Mykorrhiza-Netzwerke | `MYCORRHIZA` mit Typ, Reichweite und Label | Alten Bestand stehen lassen | `Arbuscular`, 85 % Netzwerk, 28 m Reichweite; bessere Regeneration/Resistenz/Pilze |

Der Live-Beweis liegt als `tests/browser/forest-dynamics-live-proof.mjs` bei und
schreibt `artifacts/forest-dynamics-live/forest-dynamics-live.json` sowie die
Screenshots `forest-atlas-ecology.png` und `forest-dynamics-live.png`. Er nutzt
denselben `forestStandAt()`-Datensatz wie Atlas und Inspektor; es gibt keine
test-only Waldregel.

## 3a. Spielrolle: was der Spieler mit den 30 Punkten tut (v3.60.0)

`forestDynamicsFor()` liefert zusätzlich ein begrenztes `working`-Profil. Es
bündelt die 30 Teilprofile in Werte, die vorhandene Spielsysteme bereits lesen:
`timber {sawlog, firewood, specialty, logShare, volume, quality}`,
`forage {mushrooms, herbs, mast, game, honey, berries, fibre}`,
`habitat {score, deadwood, edge, gap, understory, herb, epiphytes, lianas}`,
`water {uptake, retention}` und `products[]`. Es wird bei jedem `forestStandAt()`
neu berechnet und niemals gespeichert.

| Punkte | Spielerhandlung | Wirkung im bestehenden System |
|---|---|---|
| **061–065** Regionale Sets, Mischung, Pionier/Klimax, Alter | Lumberyard an einen Bestand setzen, durchforsten oder stehen lassen | Cohorten, Reinheit und Altersmix bestimmen `sawlog`, `specialty` und `harvestVolume`; Klimax-/Mutterbäume erhöhen Mast; alte Bestände erhöhen Habitat |
| **066** Totholzfraktionen | Totholz stehen lassen oder nutzen | Liegendes Holz und Stümpfe erhöhen den Firewood-Anteil, Totholz-Habitat und Höhlenbäume speisen Wild und Insekten, Zersetzung speist Pilze |
| **067–070** Verjüngung, Samenbank, Mutterbäume, Genetik | Ernten, Störflächen beobachten, alte Bäume stehen lassen | `forestRegrowthFactor()` liest weiter den Regenerationsfaktor; Samenqualität/Mutterbäume erhöhen Mast und Verjüngung, Genetik senkt Pestrisiko |
| **071–072** Krankheitsresistenz und Standortfit | Art und Standort wählen | Resistenz senkt echtes `pestRisk`, Standortfit erhöht `harvestVolume`, Produktivität und Regeneration |
| **073–074** Sukzession und Störungsregime | Drei Jahre laufen lassen, Kontrolltrupp schicken | Phasen und Lückenalter bleiben die Zeitachse; Regime-Severity erhöht Feuer-/Windgewicht und Stockverlust, Refugien senken die Ausbreitung |
| **075–080** Waldweide, Nieder-, Mittel-, Hoch-, Plenter- und Dauerwald | Lumberyard-Knopf nutzen | Der Knopf heißt jetzt CUT COPPICE / CUT UNDERWOOD / SELECT FELLING / SINGLE-TREE CUT / POLLARD AND CLEAR / THIN NEAREST STAND; `logShare` teilt den Hieb in Logs und Firewood, Coppice/Wood-Pasture erzeugen zusätzliches Firewood im Lumber-Camp |
| **081–083** Waldrand, Lichtwald, Kronenlücken | Rand oder Lücke aufsuchen | Manteldeckung, Lücken-Verjüngung und Krautlicht erhöhen Wild, Beeren, Kräuter und Habitat; Lückenalter bleibt lesbar |
| **084–085** Lianen und Epiphyten | Feuchten/alten Bestand aufsuchen | Lianen liefern Weidenruten/Rattan und Fasern, Epiphyten Moos/Flechte/Orchideen; beide erhöhen die Habitatnote |
| **080–090** Arbeitsholz und Markt | Sammeln, durchforsten, verkaufen oder liefern | `volume` skaliert Lumber-Batch und Durchforstung, `quality`/`specialty` verkürzen oder verlängern den Signature-Timber-Takt; `sawlog`/`firewood`/`logShare` teilen den Hieb. Jedes gesammelte Gut hat einen individuellen Marktpreis oder einen echten Verbraucher (Nahrung, Medizin, Pannage, Sägewerk) — siehe 3b. |
| **086–087** Unterholz und Krautschicht | Durchforsten, Licht schaffen, sammeln | Strauch-/Jungbaumschicht speist Wild und Beeren, Krautnahrung/Medizin/Blüte speisen Kräuter, Honig und Wild; Verbiss bremst die Regeneration |
| **088–090** Wurzeln, Streu/Humus, Mykorrhiza | Alten, humusreichen Bestand stehen lassen | Wurzeltiefe senkt Staunässe, Streu/Humus erhöhen Wasserretention und Pilzertrag, Mykorrhiza-Typ/Reichweite speisen Pilze, Regeneration, Resistenz und Insekten |

Die Werte sind keine Parallelökonomie: Holz geht in denselben Lumber-/Sawmill-/
Timber-Market-Pfad, Mast in dieselbe Pannage-Reserve, Wild in dieselben Herden,
Insekten in dieselben Kolonien und die Störung in dieselbe Sukzession.

## 3b. Jedes Waldgut hat einen Preis oder einen Verbraucher (v3.61.0)

Der Audit umfasst alle **260** Einträge in `FOREST_GOODS`, nicht nur die zehn
Güter einer Stichprobe. `tests/systems/forest-goods-economy.test.js` prüft für
jede ID drei Dinge: einen `forestDeliveryChannel()`, einen positiven
`forestGoodMarketPrice()` und ein sichtbares `forestGoodUseLabel()`.

| Gut / Gruppe | Preis | Verbraucher / Spielerweg |
|---|---|---|
| `timber`, `firewood`, regionale Timbers | Holzmarkt / Sägewerk | `DELIVER FOREST GOODS` → Lumber-/Sawmill-Kette; Firewood bleibt Feuerung, regionale Timbers behalten ihre Identität und ihren Markt |
| `honey`, `game`, `mushrooms`, Beeren, Obst, Fisch, Mast | `tradeValue` + Kategorie-Fallback, saisonal und nach Nahrungsnachfrage | `DELIVER` → royal food store; alternativ `SELL` → Gold; Mast zusätzlich Pannage |
| Kräuter, Flechten, Rinde, Harz, Medizin-Güter | Kategorie-/`tradeValue`-Preis | `DELIVER` → `addMedicineStock()` (Heiler/`brewMedicine`); alternativ Markt |
| Felle, Häute, gefärbt/gegerbt, Bienenwachs, Luxus-, Gift-, Faser-, Stein-, Salz- und alle übrigen Regionalgüter | individueller `tradeValue` oder Kategorie-Fallback | `DELIVER` → Gold; `SELL` → Gold; keine ID bleibt ohne Kanal |
| `acorns`, `beechnuts`, `chestnuts`, `hazelnuts`, `hornbeam-seeds`, `spruce-cones`, `fir-cones`, `pine-cones`, `dwarf-pine-cones` | Mast-Preis | Pannage-Futter (`feedStableFromMast`) und Markt |
| `hay`, `meadow-grass`, `steppe-grass` | Futter-Preis | Pannage-Futter und Markt |

`forestGoodMarketPrice()` nutzt zuerst den vorhandenen
`BIOME_RESOURCE_BY_ID[].tradeValue`, dann wenige Wald-Overrides und zuletzt
den Kategoriepreis. Der Preis ist saisonal (0,94–1,12) und bei Nahrung zusätzlich
an die bestehende Lebensmittelnachfrage gebunden. `SELL FOREST GOODS` verkauft
das nicht-hölzerne Los zu diesem Quote, bucht Gold in dieselbe Staatskasse und
protokolliert die Bewegung im Goods Book. `DELIVER FOREST GOODS` nutzt denselben
Quote für Marktgüter und zeigt statt „X gold“ den tatsächlich gezahlten Betrag.
Ist der lokale Yard voll, geht der Holzrest in dieselbe gefilterte
Warehouse-Kette; dadurch wird eine echte Lieferung nicht zu totem Bestand. Holz
bleibt bewusst im Yard, weil Logs → Planks → Bauen/Firewood die produktive Kette
sind.

Die Pannage-Liste ist keine zweite Datenpflege mehr: `MAST_GOODS` und
`FODDER_GOODS` werden direkt aus den Kategorien in `FOREST_GOODS` abgeleitet.
Damit sind Kegel, Haselnüsse, Hainbuchen-Samen und Steppengras echte Reserve,
sobald sie im gemeinsamen Sammel-Ledger liegen.

## 3. Echte Wirkungen

- **Regeneration:** `forestRegrowthFactor()` multipliziert den bisherigen
  Kompaktions-/Verbissschutz mit `dynamics.regeneration.factor` (0,64–1,40,
  Gesamtdeckel 1,58). Der 400-Tage-Slice bleibt unverändert; die Ökologie läuft
  auf demselben begrenzten Takt.
- **Holzernte:** Lumber-Camp-Batch und Durchforstung multiplizieren den
  regionalen Timber-Wert mit `silviculture.timberFactor` (0,75–1,10) und dem
  abgeleiteten `working.timber.volume` (Durchforstung 0,80–1,20; Lumber-Batch
  0,85–1,15). Die Durchforstung teilt den
  tatsächlich entnommenen Bestand über `logShare` in Logs und Firewood; ein
  Niederwald/Mittelwald/Waldweide-Camp erzeugt zusätzlich einen begrenzten
  Firewood-Nebenertrag. Der Lumber-Cache speichert dafür zusätzlich
  `timberFactor`, `system` und das begrenzte `working`-Profil; `quality` und
  `specialty` ändern den Signature-Timber-Takt, ohne den Hieb zu verdoppeln.
- **Sammeln:** Kräuter, Pilze, Moos/Flechte, Weidenruten/Rattan und Orchideen
  erscheinen nur, wenn die abgeleitete Struktur sie trägt; `forestGoodsFor()`
  multipliziert die Abundanz jetzt zusätzlich mit dem passenden
  `working`-Faktor (Holz, Mast, Pilze, Kräuter, Honig, Beeren, Fasern, Wild).
  `medicinalHerbs` speist den Kräuterertrag, `decomposition` den Pilzertrag,
  Mutterbäume/Alter den Mast. Der Lumberyard sammelt dieselben Produkte über den
  sichtbaren Knopf; ein Holzprodukt bleibt immer in der Auswahl.
- **Pannage:** mehr Mast aus alten, masttragenden Beständen füllt dieselbe
  `FEED STABLE FROM MAST OR HAY`-Reserve; es gibt keine neue Währung.
- **Wild und Insekten:** `working.habitat` aus Totholz, Höhlen, Rand, Lücke,
  Unterholz, Kraut und Epiphyten erhöht die Präferenz und damit die echte
  Herdenkapazität; liegendes/stehendes Totholz, Stümpfe, Höhlen, Streu und
  Mykorrhiza ändern die Kapazität der gespeicherten Insektenkolonien.
- **Störung:** Regime-Severity und Refugien ändern Gewicht, Stockverlust und
  Ausbreitung der bestehenden Feuer-/Wind-/Käfer-Sukzession.
- **Boden und Wasser:** `waterUptake` senkt die abgeleitete Staunässe des
  Bestands (statt nur angezeigt zu werden); `rootDepth` bleibt der Wurzelwert.
  `gapAge` hat jetzt auch ohne aktiven Störungsdatensatz ein echtes Alter aus
  Bestandsalter, Lücke und Sukzessionsalter; alte Wälder tragen ältere Lücken.
- **Merkmale:** `fire` fließt in die Samenbank nach Brand ein, `coppice` in den
  Regenerationsfaktor von Nieder- und Mittelwald. Die übrigen 12 Traits waren
  bereits über Fitness, Risiko, Struktur oder Ertrag verdrahtet.
- **Gefahren:** Feuerrisiko, Pestrisiko und Windexposition werden mit den
  artspezifischen Abweichungen moduliert; zusätzlich verstärkt eine hohe
  Regime-Severity die Feuer-/Windgewichte und ein hohes Refugium senkt das
  Ausbreitungsrisiko. Die Werte bleiben auf 0–1 begrenzt.
- **Produktivität:** Standortfit fließt mit 0,86–1,06 in die bestehende
  Produktivität ein; keine neue Ökonomie.
- **Darstellung:** Der Atlas zeigt pro anwesendem Typ einen echten
  19-Zellen-Ökologieblock; die SYSTEM-Zeile nennt Rotation, Timber-Faktor und
  Retention, die eigene WORKING-Zeile Sawlog, Firewood, Specialty, Quality,
  Log Share und Volume. Jeder Güter-Chip nennt seine Verwendung. Der Inspektor
  druckt dieselbe Working-Zeile plus Pilze, Kräuter, Mast, Wild, Honig, Beeren,
  Fasern und Habitat sowie eine Forest-goods-Zeile mit Preis und Verwendung. Der
  Ökologieblock selbst zeigt Mischung, Alterscohorten, Phase, Pionier/Klimax,
  Samenbank, Regenerationsnische, Genetik, Standortfit, System/Retention,
  Regime/Severity/Return, Totholzfraktionen, Boden/Litter/Humus,
  Mykorrhiza-Typ/Reichweite, Struktur, Rand, Licht, Lücken und Krautschicht. Die
  Detailzeilen umbrechen, damit auch lange Werte lesbar bleiben. Eine sichtbare
  Silvikultur-Zusammenfassung nennt alle sechs Systeme mit ihrer Stichproben-
  zahl; dadurch ist auch ein seltener Bestand wie Niederwald auffindbar. Der
  Inspektor druckt dieselben Werte. Im Nahzoom zeichnet der Renderer Lianen und
  Epiphyten aus `stand.dynamics.structure`.

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
  Gemisch- und Survey-Gates plus der Nachweis, dass das working-Profil Mast,
  Pilze und Holzabundanz real verändert.
- `tests/world/forest-pressure.test.js` — Kompaktion und Verbiss bremsen die
  Regeneration weiterhin.
- `tests/systems/forest-gathering.test.js` — echte Standdynamik im
  Sammelergebnis, Saison, Bounty, Durchforstung und die Aufteilung eines
  Niederwald-Hiebs in Logs und Firewood.
-   `tests/presentation/forest-atlas.test.js` — 60 Karten, 19-Zellen-Ökologieblock,
  alle sechs Systeme, Cohorten-, Regen-, Totholz-, Rand-, Kraut- und
  Sawlog/Firewood-Zeilen.
- `tests/systems/forest-fauna.test.js` und `forest-insects.test.js` —
  Totholz/Höhlen/Rand/Kraut erhöhen die echte Herdenpräferenz; liegendes Holz,
  Stümpfe, Streu und Mykorrhiza erhöhen die Insektenkapazität, Resistenz senkt
  den Käfer-Habitatwert.
- `tests/systems/forest-succession.test.js` — Regime-Severity und Refugien
  verändern Störungsgewicht und Ausbreitung.
- `tests/browser/regional-forest-reference.mjs` — tropische Atlas-Referenz mit
  Regime-, Wasseraufnahme-, Zersetzungs-, Lückenalter- und Medizinzeile.
- `tests/browser/forest-dynamics-live-proof.mjs` — frischer Spieler, Lumberyard,
  Ernte, Sammeln, 14 Atlas-Ökologiekarten, drei Jahre Fast-Forward und alle 30
  Beobachtungen.
- `tests/world/regional-forests.test.js` — 60 Standortfenster, 9-Klima-Scan,
  Übergänge, Save-Roundtrip.

## 6. Verifikation

Stand 2026-11-25: **1.467/1.467 Tests** grün. Die deterministische
25-Jahres-Kampagne läuft **10.040 Ticks** in **21.642,2 ms** (**1,533 ms/Tick**),
64 Bewohner, alle 13 Ambitionen, alle Anforderungen wahr, **3.507 Waldkacheln**,
**0 untypisiert**, 20 echte Fuel-Backfill-Aufträge (max. 1 pro Phase), kein Game
Over. Die tropische Browser-Referenz sieht **9.526 Waldkacheln**, **0 untypisiert**,
**60 Atlas-Karten**, **18 Timber-Market-Zeilen**, drei verschiedene gerenderte
Bestände, den 19-Zellen-Ökologieblock und die Lianen-/Epiphytenzeile, ohne
Konsolen- oder Seitenfehler. Der neue Spieler-Live-Beweis spielt **4.274
Waldkacheln**, **238 Bestände**, **60 Atlas-Karten**, **14 Ökologiekarten**, drei
Jahre und alle 30 Punkte ohne Seiten-, Konsolen- oder Netzwerkfehler durch;
Ernte, Sammeln, Durchforstung, Sukzession und alle sechs Systeme sind darin
belegt. Der Durchforstungsklick liefert **7 Logs + 3 Firewood** (Stock 181 →
171), der Sammelklick **2 Timber, 3 Birch sap, 2 Firewood, 2 Beech timber,
2 Birch timber und 2 Mushrooms**. Der sichtbare Verkauf hebt die Staatskasse von
**101 auf 107 Gold** (+6 für 3 Birch sap und 2 Mushrooms), die Lieferung bringt
**6 Logs und 2 Firewood** in Yard/Warehouse und leert das Holz-Ledger; der
Endbestand liegt bei **629.138**. Die Working-Zeile zeigt in jedem der 12
Atlas-Samples Sawlog, Firewood, Quality, Log Share, Pilze, Mast, Wild und Habitat.
Der Spec-Audit meldet **1.616/1.618 implementiert** in 38 Abschnitten; offen
bleiben nur 4.0.1 und 4.0.6. Der Produktionsdeploy wird aus genau diesem
getesteten Commit gebaut; beide Hosts werden danach auf denselben Commit und
den Live-Beweis geprüft.
