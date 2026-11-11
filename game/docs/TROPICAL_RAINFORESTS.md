# Tropische Regenwälder (1.2.4)

Diese Phase erweitert das bestehende deterministische Waldsystem um einen vollständigen tropischen Regenwald. Es gibt **kein zweites Ökosystem**: Klima, Stand, Ressourcen, Fauna, Sammelwirtschaft, Gesundheit, Rendering und Save-Pfad bleiben gemeinsam. Alle 65 Anforderungen sind als abgeleitete Stand-Eigenschaften, echte Güter, Fauna, Gefahren und Landnutzung vorhanden.

## Klima

`tropical` ergänzt die fünf bestehenden Klimazonen. Es liefert:

- eine warme, feuchte Temperatur- und Feuchtigkeitsbasis,
- eine eigene Terrainpalette mit tiefem Grün, Schwarzwasser und jungen Alluvialböden,
- immergrüne Kronen ohne temperierte Laubfärbung oder Schnee,
- 72 % Regen und 28 % klar, ohne Schneegewicht,
- dieselben 400-Tage-Jahreszeiten und dieselbe Wetter- und Lichtpipeline.

## Arten (13)

- **Kapok tree** (`kapok`, Ceiba pentandra) — buttressed large-leaved, Kapok fibre, Stingless-bee honey, herbs, Orchids
- **Mahogany** (`mahogany`, Swietenia macrophylla) — buttressed medium-leaved, Mahogany, honey, herbs, Tagua nuts
- **Brazil nut** (`brazil-nut`, Bertholletia excelsa) — buttressed large-leaved, Brazil nuts, Copal resin, Tagua nuts, herbs
- **Rubber tree** (`rubber`, Hevea brasiliensis) — medium-leaved, Natural rubber, Rubberwood, Cacao pods, herbs
- **Cacao** (`cacao`, Theobroma cacao) — large-leaved, Cacao pods, Cocoa, Vanilla, Stingless-bee honey
- **Balsa** (`balsa`, Ochroma pyramidale) — giant-leaved, Balsa, Kapok fibre, Passionfruit, Stingless-bee honey
- **Strangler fig** (`fig`, Ficus aurea) — buttressed medium-leaved, Wild figs, Natural rubber, Stingless-bee honey, Bromeliads
- **Rainforest palm** (`palm`, Euterpe precatoria) — emergent giant-leaved, Açaí, Palm fibre, Palm oil, Heart of palm
- **Ironwood** (`ironwood`, Dinizia excelsa) — buttressed small-leaved, Ironwood, Copal resin, Tagua nuts, herbs
- **Rosewood** (`rosewood`, Dalbergia nigra) — small-leaved, Rosewood, Rosewood oil, honey, Orchids
- **Giant bamboo** (`bamboo`, Guadua angustifolia) — small-leaved, Giant bamboo, Bamboo shoots, Rattan, Palm fibre
- **Mangosteen** (`mangosteen`, Garcinia mangostana) — large-leaved, Mangosteen, Rambutan, Durian, herbs
- **Sandalwood** (`sandalwood`, Santalum album) — small-leaved, Sandalwood, Sandalwood oil, Agarwood, Orchids

Die 13 Arten werden nach den 20 temperierten Arten angehängt. Alle bestehenden Save-Indizes bleiben unverändert.

## Formationen (12)

- **Emergent Rainforest** (`tropical-emergent`, Index 40) — Giant kapok, ironwood and Brazil-nut crowns above a closed lower canopy
- **Lowland Rainforest** (`tropical-canopy`, Index 41) — A layered broadleaf canopy of mahogany, rubber, palms and shade-tolerant saplings
- **Floodplain Rainforest** (`tropical-floodplain`, Index 42) — Várzea forest on rich alluvium, with palms, figs and a seasonal high-water line
- **Palm Grove** (`tropical-palm-grove`, Index 43) — A bright palm-dominated grove with açaí, rattan and a wet herb floor
- **Swamp Forest** (`tropical-swamp`, Index 44) — Dark igapó woodland standing in black water, with stilt roots and floating plants
- **Cloud Forest** (`tropical-montane`, Index 45) — Mossy montane rainforest in cool mist, with ironwood, tree ferns and hanging gardens
- **Bamboo Brake** (`tropical-bamboo`, Index 46) — A dense giant-bamboo thicket in a canopy gap, almost impassable without a cut path
- **Treefall Gap** (`tropical-gap`, Index 47) — A sunlit hole in the canopy where balsa, bamboo and fast pioneer growth race upward
- **Secondary Regrowth** (`tropical-secondary`, Index 48) — Young balsa, bamboo and cacao closing over an abandoned clearing
- **Old-growth Rainforest** (`tropical-ancient`, Index 49) — Cathedral-like ancient trees, enormous buttresses, hollows and a deep undisturbed floor
- **Riverbank Forest** (`tropical-riverbank`, Index 50) — A ribbon of figs, palms and bamboo along a river, with a canoe landing and rich alluvium
- **Abandoned Plantation** (`tropical-plantation`, Index 51) — Cacao, rubber and palm rows escaping into a young rainforest understorey

Die zwölf Formationen liegen als Indizes 40–51 nach den 39 bestehenden Formationen. `forestTypeIndex('tropical-emergent') === 40`; ältere Ressourcen-Saves behalten ihre Bedeutung.

## 65-Punkte-Abdeckung

Jede Zeile ist eine eigene Anforderung. Der Wert wird pro Stand deterministisch aus Klima, Feuchte, Höhe, Bestand, Alter, Licht und Artenmischung abgeleitet und ist über `forestSurveyAt()` sichtbar. Kein tropischer Punkt benötigt einen separaten Save-Zähler.

| ID | Anforderung | Datenfeld | Nachweis |
| --- | --- | --- | --- |
| 1.2.4.1 | Riesige tropische Laubbäume mit breiten Kronen | `largeBroadleafCanopy` | `stand.tropical.features[id]`, `plants`, `canopyStrata` |
| 1.2.4.2 | Bäume mit gewaltigen Brettwurzeln | `buttressRoots` | `stand.tropical.features[id]`, `plants`, `canopyStrata` |
| 1.2.4.3 | Unterschiedliche Stammformen und Rindenstrukturen | `trunkBarkVariety` | `stand.tropical.features[id]`, `plants`, `canopyStrata` |
| 1.2.4.4 | Hohe Baumriesen über dem Kronendach | `emergentGiants` | `stand.tropical.features[id]`, `plants`, `canopyStrata` |
| 1.2.4.5 | Kleinere Bäume in unteren Vegetationsschichten | `lowerTrees` | `stand.tropical.features[id]`, `plants`, `canopyStrata` |
| 1.2.4.6 | Baumarten mit unterschiedlichen Blattgrößen | `leafSizeVariety` | `stand.tropical.features[id]`, `plants`, `canopyStrata` |
| 1.2.4.7 | Blühende und fruchttragende Baumarten | `floweringFruitingTrees` | `stand.tropical.features[id]`, `plants`, `canopyStrata` |
| 1.2.4.8 | Seltene und besonders alte Urwaldbäume | `rareAncientTrees` | `stand.tropical.features[id]`, `plants`, `canopyStrata` |
| 1.2.4.9 | Bodenschicht mit Farnen, Moosen und kleinen Pflanzen | `groundFernsMosses` | `stand.tropical.features[id]`, `plants`, `canopyStrata` |
| 1.2.4.10 | Dichte Strauch- und Jungbaumschicht | `denseShrubSaplings` | `stand.tropical.features[id]`, `plants`, `canopyStrata` |
| 1.2.4.11 | Unteres und oberes Kronendach | `layeredCanopy` | `stand.tropical.features[id]`, `plants`, `canopyStrata` |
| 1.2.4.12 | Einzelne Baumriesen über dem Kronendach | `scatteredEmergents` | `stand.tropical.features[id]`, `plants`, `canopyStrata` |
| 1.2.4.13 | Lianen und Kletterpflanzen | `lianas` | `stand.tropical.features[id]`, `plants`, `canopyStrata` |
| 1.2.4.14 | Epiphyten und Aufsitzerpflanzen | `epiphytes` | `stand.tropical.features[id]`, `plants`, `canopyStrata` |
| 1.2.4.15 | Riesige Farne | `giantFerns` | `stand.tropical.features[id]`, `plants`, `canopyStrata` |
| 1.2.4.16 | Orchideen und Bromelien | `orchidsBromeliads` | `stand.tropical.features[id]`, `plants`, `canopyStrata` |
| 1.2.4.17 | Große Blattpflanzen | `largeLeafPlants` | `stand.tropical.features[id]`, `plants`, `canopyStrata` |
| 1.2.4.18 | Tropische Palmen | `palms` | `stand.tropical.features[id]`, `plants`, `canopyStrata` |
| 1.2.4.19 | Fruchttragende Sträucher | `fruitingShrubs` | `stand.tropical.features[id]`, `plants`, `canopyStrata` |
| 1.2.4.20 | Fleischfressende Pflanzen | `carnivorousPlants` | `stand.tropical.features[id]`, `plants`, `canopyStrata` |
| 1.2.4.21 | Giftige und medizinisch nutzbare Pflanzen | `poisonousMedicinalPlants` | `stand.tropical.features[id]`, `plants`, `canopyStrata` |
| 1.2.4.22 | Seltene Pflanzenarten mit besonderen Eigenschaften | `rareSpecialistPlants` | `stand.tropical.features[id]`, `plants`, `canopyStrata` |
| 1.2.4.23 | Stark verwitterte und ausgewaschene Böden | `weatheredLeachedSoil` | `stand.tropical.soil`, `ground` |
| 1.2.4.24 | Feuchte, dunkle Waldböden | `darkWetSoil` | `stand.tropical.soil`, `ground` |
| 1.2.4.25 | Oberflächliche Wurzelsysteme | `surfaceRoots` | `stand.tropical.soil`, `ground` |
| 1.2.4.26 | Verrottende Pflanzenmasse | `decayingMatter` | `stand.tropical.soil`, `ground` |
| 1.2.4.27 | Wasseransammlungen und kleine Tümpel | `pools` | `stand.tropical.soil`, `ground` |
| 1.2.4.28 | Unterschiedliche Bodenfeuchtigkeit | `soilMoistureVariety` | `stand.tropical.soil`, `ground` |
| 1.2.4.29 | Flussnahe Überschwemmungsgebiete | `floodplain` | `stand.tropical.soil`, `ground` |
| 1.2.4.30 | Häufige starke Regenfälle | `heavyRain` | `stand.tropical.water`, `weatherWeights` |
| 1.2.4.31 | Dauerhaft hohe Luftfeuchtigkeit | `highHumidity` | `stand.tropical.water`, `weatherWeights` |
| 1.2.4.32 | Kleine Wasserläufe und Bäche | `streams` | `stand.tropical.water`, `weatherWeights` |
| 1.2.4.33 | Große Flüsse und Nebenarme | `largeRivers` | `stand.tropical.water`, `weatherWeights` |
| 1.2.4.34 | Temporäre Überschwemmungen | `temporaryFloods` | `stand.tropical.water`, `weatherWeights` |
| 1.2.4.35 | Wasserfälle und natürliche Wasserbecken | `waterfallsPools` | `stand.tropical.water`, `weatherWeights` |
| 1.2.4.36 | Nebel und Dunst zwischen Baumkronen | `canopyMist` | `stand.tropical.water`, `weatherWeights` |
| 1.2.4.37 | Affen und baumbewohnende Säugetiere | `monkeys` | `stand.tropical.features[id]`, `fauna`, `forestFaunaFor` |
| 1.2.4.38 | Große Raubkatzen | `bigCats` | `stand.tropical.features[id]`, `fauna`, `forestFaunaFor` |
| 1.2.4.39 | Tropische Vögel mit auffälligem Gefieder | `tropicalBirds` | `stand.tropical.features[id]`, `fauna`, `forestFaunaFor` |
| 1.2.4.40 | Schlangen, Echsen und Amphibien | `reptilesAmphibians` | `stand.tropical.features[id]`, `fauna`, `forestFaunaFor` |
| 1.2.4.41 | Zahlreiche Insektenarten | `insects` | `stand.tropical.features[id]`, `fauna`, `forestFaunaFor` |
| 1.2.4.42 | Fruchtfressende Tiere | `frugivores` | `stand.tropical.features[id]`, `fauna`, `forestFaunaFor` |
| 1.2.4.43 | Spezialisierte Arten mit begrenzten Verbreitungsgebieten | `restrictedSpecies` | `stand.tropical.features[id]`, `fauna`, `forestFaunaFor` |
| 1.2.4.44 | Tropische Edelhölzer | `tropicalHardwoods` | `stand.tropical.features[id]`, `goods`, `FOREST_GOODS` |
| 1.2.4.45 | Früchte und Nüsse | `fruitsNuts` | `stand.tropical.features[id]`, `goods`, `FOREST_GOODS` |
| 1.2.4.46 | Gewürze und aromatische Pflanzen | `spices` | `stand.tropical.features[id]`, `goods`, `FOREST_GOODS` |
| 1.2.4.47 | Medizinische Pflanzen | `medicinalPlants` | `stand.tropical.features[id]`, `goods`, `FOREST_GOODS` |
| 1.2.4.48 | Naturfasern und Harze | `fibresResins` | `stand.tropical.features[id]`, `goods`, `FOREST_GOODS` |
| 1.2.4.49 | Honig und tierische Erzeugnisse | `honeyAnimalProducts` | `stand.tropical.features[id]`, `goods`, `FOREST_GOODS` |
| 1.2.4.50 | Seltene Naturmaterialien | `rareMaterials` | `stand.tropical.features[id]`, `goods`, `FOREST_GOODS` |
| 1.2.4.51 | Giftige Pflanzen und Tiere | `poisonousOrganisms` | `stand.tropical.hazard`, `workFactor`, `forest-gathering` |
| 1.2.4.52 | Tropische Krankheiten | `tropicalDiseases` | `stand.tropical.hazard`, `workFactor`, `forest-gathering` |
| 1.2.4.53 | Parasiten und Insektenübertragung | `parasitesVectors` | `stand.tropical.hazard`, `workFactor`, `forest-gathering` |
| 1.2.4.54 | Hohe Luftfeuchtigkeit und schnelle Verderbnis von Vorräten | `spoilage` | `stand.tropical.hazard`, `workFactor`, `forest-gathering` |
| 1.2.4.55 | Schwierige Fortbewegung durch dichtes Unterholz | `difficultMovement` | `stand.tropical.hazard`, `workFactor`, `forest-gathering` |
| 1.2.4.56 | Überschwemmungen und Starkregen | `floodStormHazard` | `stand.tropical.hazard`, `workFactor`, `forest-gathering` |
| 1.2.4.57 | Gefahren durch große Raubtiere | `predatorHazard` | `stand.tropical.hazard`, `workFactor`, `forest-gathering` |
| 1.2.4.58 | Schlechte Sicht und Orientierung | `visibilityOrientation` | `stand.tropical.hazard`, `workFactor`, `forest-gathering` |
| 1.2.4.59 | Kleine Siedlungen an Flüssen und Lichtungen | `settlements` | `stand.tropical.landUse`, `clearance`, `regrowth` |
| 1.2.4.60 | Landwirtschaft in geeigneten Gebieten | `agriculture` | `stand.tropical.landUse`, `clearance`, `regrowth` |
| 1.2.4.61 | Plantagen und spezielle Nutzpflanzen | `plantations` | `stand.tropical.landUse`, `clearance`, `regrowth` |
| 1.2.4.62 | Jagd, Fischfang und Sammelwirtschaft | `huntingFishingGathering` | `stand.tropical.landUse`, `clearance`, `regrowth` |
| 1.2.4.63 | Flussbasierte Handelsrouten | `riverTrade` | `stand.tropical.landUse`, `clearance`, `regrowth` |
| 1.2.4.64 | Rodung und langfristige ökologische Folgen | `clearance` | `stand.tropical.landUse`, `clearance`, `regrowth` |
| 1.2.4.65 | Wiederbewaldung aufgegebener Nutzflächen | `regrowth` | `stand.tropical.landUse`, `clearance`, `regrowth` |

Die Tests prüfen zusätzlich, dass jede der zwölf Formationen wirklich generiert wird, alle 65 IDs vorhanden sind, die 13 Arten eigene Hölzer besitzen, tropische Güter auch im Winter verfügbar bleiben, die Schneehöhe immer 0 ist, die Landnutzung Siedlung/Acker/Plantagen/Wiederbewuchs erzeugen kann und ein Stand über einen erneuten Lauf byte-gleich bleibt.

## Wasser, Böden und Gefahren

- **Böden:** tief verwitterte Latosole und ausgelaugte Upland-Oxisole, dunkle Feuchthumusauflagen, flächige Wurzeln, Falllaub und Totholz. Auenformationen wechseln auf jungen Alluviumboden.
- **Wasser:** ganzjährig hohe Feuchte, Bäche, Flüsse, temporäre Überschwemmungen, Tümpel, Wasserfälle und Nebel. Die bestehende Hydrology- und Wetterpipeline bleibt die einzige Quelle.
- **Gefahren:** Krankheits- und Parasitenrisiko, schnelle Verderbnis, dichter Unterwuchs, Überschwemmung, Raubtiere und reduzierte Sicht. Sie fließen in `workFactor`, Sichtprofil, Sammelertrag und die bestehende Gesundheits-/Medizinlogik ein.
- **Medizin:** `quinine-bark`, `fever-bark`, `cat-claw`, `copaiba-oil` und `ipecac` sind echte Sammelgüter und werden von `applyHerbalRemedy()` verbraucht.

## Landnutzung

Flußnahe Auen und Uferwälder können kleine Siedlungen, Bootsanleger, Ackerflächen und Flusshandel tragen. Aufgegebene Plantagen und Sekundärwälder führen zu Rodungsdruck und Wiederbewuchs. Der Renderer zeichnet dafür kleine Pfahlbauten, Feldzeilen, Plantagenreihen, Kanus, Stümpfe und junge Triebe; die Werte bleiben aus dem Stand abgeleitet und werden nicht als neue Karte gespeichert.

## Audit 1.2.4 — Status (11.11.2026)

**Pflichtpunkte: 65/65 vorhanden.** Die Daten, Güter, Fauna, Gefahren und
Landnutzung sind vollständig; in diesem Durchgang wurden die noch fehlenden
sichtbaren Pfade nachgezogen.

### In diesem Audit nachgezogen

| Punkte | Ergänzung |
| --- | --- |
| 1.2.4.5, 1.2.4.11 | Eigene mittlere Baumschicht mit kleinen Kronen zwischen Unterwuchs und Kronendach |
| 1.2.4.8 | Alte Bäume erhalten Baumhöhlen und hängendes Bartmoos |
| 1.2.4.21 | Medizinpflanzen mit Blüten und eigenem Blattbild |
| 1.2.4.22 | Seltene Geisterorchidee als eigene, helle Epiphytensilhouette |
| 1.2.4.25 | Freiliegende Oberflächenwurzeln auf dem Waldboden |
| 1.2.4.26 | Verrottende Stämme mit Pilzen und Moos |
| 1.2.4.32–35 | Bäche, breite Flüsse, Wasserfälle und temporäre Flutwasserflächen als eigene Wassergrafik |
| 1.2.4.37–43 | Primaten, Reptilien, Fische und Amphibien haben eigene Canvas-Gruppen; Jaguar/Ozelot erhalten Fellzeichnung, Tukane, Macaws und Harpyien Farben |
| 1.2.4.51, 1.2.4.53 | Giftpflanzen und Stechmücken-/Parasitenhinweise im Unterwuchs |
| 1.2.4.62–63 | Fischfalle am Flussufer und Kanu-/Handelsspuren |

### Vollständig vorhanden

- **1.2.4.1–20:** Baumriesen, Brettwurzeln, Stamm-/Rindenvielfalt, Kronenschichten, Blattgrößen, Blüten/Früchte, Urwaldbäume, Bodenfarne/Moose, Strauch-/Jungbaumschicht, Lianen, Epiphyten, Riesenfarn, Orchideen/Bromelien, Großblattpflanzen, Palmen, Fruchtsträucher und Kannenpflanzen.
- **1.2.4.23–29:** verwitterte Latosole, dunkle Feuchthumusböden, Oberflächenwurzeln, Totholz/Streu, Tümpel, Feuchtevielfalt und Auenböden.
- **1.2.4.37–50:** alle tropischen Faunengruppen und die Güterpfade für Edelhölzer, Früchte/Nüsse, Gewürze, Medizin, Fasern/Harze, Honig/Tierprodukte und seltene Materialien.
- **1.2.4.55, 1.2.4.57, 1.2.4.59–63, 1.2.4.65:** Bewegungs-/Sichtdruck, Raubtiergefahr, Siedlungen, Ackerbau, Plantagen, Jagd/Fischfang, Flusshandel und Wiederbewuchs.

### Risiko- und Systempfad statt separater Grafik

- **1.2.4.30, 1.2.4.31, 1.2.4.56:** Regen, Feuchte, Sturm und Flut laufen über die bestehende Wetter-, Wasser- und Sichtpipeline.
- **1.2.4.52–54:** Krankheit, Parasiten und Verderbnis sind abgeleitete Risiken und fließen in `workFactor`, Sichtprofil und Sammelertrag ein; die tropischen Medizingüter sind über die bestehende Medizinlogik verbrauchbar. Eine separate Malaria-/Parasiten-Epidemie ist bewusst nicht modelliert.
- **1.2.4.58:** schlechte Sicht ist ein echtes Sichtprofil (`sightRadius`, `visibility`), kein separater Bildfilter.
- **1.2.4.64:** Rodung ist als `clearance`, Stumpf, Bestandsrückgang und langfristige Sukzession modelliert; die unmittelbare Folge ist sichtbar, die Jahrzehntfolge bewusst simulationsseitig.

### Offene Restpunkte

**Keine offenen Pflichtpunkte.** Die verbleibende Grenze ist die Darstellungsform:
Das Spiel ist eine deterministische 2D-Canvas-Welt, keine 3D-Mesh-Welt. Krankheiten
und Parasiten bleiben Risiko-/Gesundheitswerte statt eigener Krankheits-Sprites;
Wasserfälle erscheinen an montanen Kacheln, nicht als neue Hydrologie-Simulation.

## Reproduktion

```bash
cd game
node --test tests/world/tropical-forest.test.js
npm test
npm run test:campaign
npm run test:tropical-reference
```

Die Browser-Referenz liegt unter `docs/terrain-reference/tropical-reference.png`, die Jahreszeitenleiste unter `tropical-seasons.png` und die vollständigen Metadaten inklusive aller 65 Werte unter `tropical-reference.json`.


## Verification on this head

- `npm test`: 759/759 pass; syntax and relative imports clean for 107 source files and 189 UI ids.
- Focused tropical suite: 8/8, including all 65 point ids, all 12 formations, deterministic stand generation and the complete tropical shader palette.
- `npm run test:tropical-reference`: 12/12 formations and four seasonal frames captured on WebKit WebGL at 800 × 800. The metadata records all 65 features for every formation.
- `npm run test:campaign`: 10,040 ticks, 25 years, 13/13 ambitions, no game over, 0.823 ms per tick.
