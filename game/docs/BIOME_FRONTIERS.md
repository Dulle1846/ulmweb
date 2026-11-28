# Frontier-Biome 1.2.23.2–16 — Savannen, Küsten, Eis, Tiefe, Magie und Erinnerung

**Version:** 3.92.0  
**Katalog:** `js/world/biome-frontiers.js` + `js/world/biome-frontier-expansion.js` + `js/world/biome-frontier-lifeworks.js`  
**Simulation:** `js/systems/biome-frontiers.js`  
**UI:** `js/presentation/biome-frontier-panel.js` (im Biome-Panel)  
**Jahrespass:** `updateBiomeFrontiers()` in `js/simulation/simulation.js`  
**Save:** additives `state.biomeFrontiers`, Save-Schema 15 unverändert

## 1. Was hier gebaut wurde

1.2.23.1 gibt den zehn Provinzen ein gemeinsames Wald-Langzeitregister. 1.2.23.2–16
ergänzt dazu **fünfzehn Frontier-Ökosysteme**, die nicht in jeder Provinz liegen
und nicht alle Wälder sind: offene Savanne, Gezeitenwald, Korallenküste,
Hochgebirgsrasen, subarktisches Buschland, Eiswüste, unterirdische Seen,
magischer Urwald, verfluchtes Ödland, Pilz- und Kristallboden, magisch
verwandelte Biome, seltene endemische Lebensgemeinschaften, historische
Landschaftsformen, klimaverscho­bene Ökotone und Katastrophengürtel.

Der Katalog ist **keine zweite Karte**. Der Deep-Pack 3.92.0 erweitert jede
Familie auf **24 Kohorten, 12 seltene Arten, 12 benannte Störungen, 8 Güter,
12 Relikt-Schichten und 12 Feldnotizen in drei Stufen**. Das sind **360
Artengruppen, 180 Spezialisten, 180 Hazards, 120 Güter, 180 Relikt-Schichten,
180 Langzeit-Feldnotizen und 30 wiederkehrende Zyklen** — 600 neue
Katalogeinträge gegenüber 3.91.0.

### Vorher/Nachher je Kategorie

| Kategorie | 3.91.0 pro Site | 3.92.0 pro Site | 3.91.0 gesamt | 3.92.0 gesamt |
| --- | ---: | ---: | ---: | ---: |
| Artengruppen / Kohorten | 12 | **24** | 180 | **360** |
| Seltene Spezialisten | 6 | **12** | 90 | **180** |
| Benannte Störungen | 6 | **12** | 90 | **180** |
| Seltene Güter | 4 | **8** | 60 | **120** |
| Relikt-Schichten | 6 | **12** | 90 | **180** |
| Feldnotizen | 6 | **12** | 90 | **180** |
| Kettenstufen | 1 | **3** (4/4/4) | 1 | **3** |
| Wiederkehrende Zyklen | 0 | **2** | 0 | **30** |

Die Feldnotizen zahlen jetzt **T1 18–34 Gold, T2 40–76 Gold, T3 96–128 Gold**
(plus Moral, Nahrung, Holz, Stein, Legitimität, Beziehungen, Garnisonsmoral
oder eine dauerhafte Kronen-Charta). Die kurzen Zyklen haben Periode 4, die
langen Periode 20; jeder kurze Harvest zahlt 14–20 Gold, jeder lange 60–82 Gold
und zusätzlich mindestens einen systemübergreifenden Effekt.

- Jedes der 15 Sites wird über einen stabilen Anker dem vorhandenen
  36-Regionen-Biome-Atlas zugeordnet (`atlasRegionId`, `atlasRegionName`).
- Es gibt genau **eine Site pro Familie** (maximal 15), nicht ein Raster neuer
  Kacheln.
- Der Jahrespass läuft **einmal** nach `updateBiomeAtlasAnnual()` und
  `updateForestLegacy()` und liest denselben Klimadrift.
- Aktionen kosten echtes Gold, Holz oder Stein; ihre Folgen werden im selben
  Ledger gespeichert.
- Es gibt keine Funktion, kein DOM und keine URL im persistenten Zustand.

## 2. Datenvertrag einer Familie

Jede Familie in `BIOME_FRONTIER_FAMILIES` deklariert:

| Feld | Bedeutung |
| --- | --- |
| `id`, `requirement` | stabile ID und Roadmap-Punkt 1.2.23.2–16 |
| `label`, `labelDe`, `title`, `titleDe` | Spielername und Roadmap-Wortlaut |
| `climates`, `atlasBiomes` | Klima-Envelope und bevorzugte Atlas-Biome |
| `palette` | drei Farben für die Karte/das Panel |
| `warmingGain`, `warmingStress` | Reaktion auf den gemeinsamen Klimadrift |
| `catastropheRisk` | jährliche Basiswahrscheinlichkeit einer Katastrophe |
| `magicBase`, `curseBase` | Start-Magie und -Korruption |
| `ageYears`, `startCondition`, `startExtent` | Gründungswerte |
| `soil`, `water`, `seasonality` | Standortfaktoren im Klartext |
| `profile`, `formation` | ausführliche Spielerbeschreibung und Struktur |
| `climateAnalog` | geordnete Klima-Analogie (langfristige Verschiebung) |
| `species` | 24 Baum-, Pflanzen-, Tier-, Pilz-, Korallen- oder Flechtenkohorten |
| `specialists` | 12 seltene Arten der regionalen Lebensgemeinschaft |
| `hazards` | 12 benannte Störungsregime mit Auslöser und Wirkung |
| `goods` | 8 seltene Güter mit Wert und Jahresertrag |
| `journal` | 12 Feldnotizen in 3 Stufen, je 4 Notizen, mit steigender einmaliger Belohnung |
| `cycles` | 2 wiederkehrende Zyklen: kurze 4-Jahres-Rotation und langer 20-Jahres-Bogen |
| `catastrophes` | benannte Katastrophe(n) |
| `relics` | 12 historische/Relikt-Schichten |
| `magicShift` | magische Verwandlung mit eigenem Namen |
| `site` | Name, Variante, Lore und Atlas-Anker |
| `referenceSeed` | deterministischer Referenz-Seed |

Der Katalog wird von `scripts/spec-audit.mjs` als Sektion **1.2.23.2-16**
gelesen. Jeder der 15 Punkte nennt in `consumer` seinen lebenden Verbraucher.

## 3. Die fünfzehn Ökosysteme

| Punkt | Familie | Site | Klima | Seltene Gemeinschaft | Güter |
| --- | --- | --- | --- | --- | --- |
| 1.2.23.2 | `savanna-dry-woodland` | Redpass Thornsea | savanna, arid, mediterranean | Shea Fruit Moth, Kori Bustard, Baobab Fruit Bat | Shea Butter, Gum Arabic |
| 1.2.23.3 | `mangrove` | Brackwater Maze | tropical, coastal, swamp | Mangrove Rivulus, Milky Stork, Horseshoe Crab | Mangrove Honey, Tannin Bark |
| 1.2.23.4 | `coral-coast` | Turquoise Shelf | tropical, coastal | Hawksbill Turtle, Giant Triton, Reef Heron | Reef Pearl, Sea Salt |
| 1.2.23.5 | `alpine-grassland` | High Choir Meadow | mountain, tundra | Apollo Butterfly, Alpine Salamander, Snow Finch | Alpine Hay, Gentian Root |
| 1.2.23.6 | `subarctic-shrub` | Dwarf Birch Reach | taiga, tundra, northern | Arctic Bramble, Lapland Bunting, Moor Frog | Cloudberry, Lichen Dye |
| 1.2.23.7 | `ice-desert` | The White Silence | snow, tundra, northern | Emperor Penguin Colony, Antarctic Silverfish, Snowy Sheathbill | Ice Crystal, Seal Oil |
| 1.2.23.8 | `underground-lakes` | The Amber Vault | mountain, volcanic, temperate, tundra | Blind Cave Salamander, Cave Pearl Mussel, White Cave Crab | Cave Amber, Cave Pearl |
| 1.2.23.9 | `magic-primeval` | The Sleeping Court | temperate, enchanted, taiga, tropical | Glimmer Fox, Echo Owl, Ley-root | Aether Sap, Moonpetal |
| 1.2.23.10 | `cursed-wasteland` | The Grey Wound | temperate, taiga, swamp, volcanic | Mire Wraith, Rot-fed Stork, Thorn Oracle | Blight Resin, Grave Salt |
| 1.2.23.11 | `fungal-crystal` | Crowncap Deep | swamp, mountain, volcanic, temperate | Glasswing Moth, Chandelier Fungus, Prism Newt | Glowcap, Crystal Shard |
| 1.2.23.12 | `magic-transfigured` | The Prism Scar | temperate, enchanted, tropical, mountain | Ley-touched Stag, Mirror Carp, Echo Warbler | Ley Crystal, Shimmer Down |
| 1.2.23.13 | `rare-community` | The Relict Garden | mountain, mediterranean, temperate, coastal | Serpentine Snail, Cliff Bee, Ghost Orchid | Rare Seed, Naturalist's Specimen |
| 1.2.23.14 | `historic-landform` | The Old Ridge | temperate, mediterranean, coastal | Great Crested Newt, Old-wood Lichen, Hazel Dormouse | Historic Hay, Old-wood Timber |
| 1.2.23.15 | `climate-shift` | The Moving Treeline | taiga, tundra, mountain, temperate | Northern Hawk Owl, Tundra Vole, Bog Rosemary | Treeline Seed, Summer Pasture |
| 1.2.23.16 | `catastrophe-belt` | The Drowned Coast | coastal, swamp, temperate, tropical | Pioneer Ground Beetle, Saltmarsh Sparrow, Grey Seal Pup | Salvage Driftwood, Saltmarsh Hay |

Die Tabelle nennt die ursprünglichen Kernarten und -güter. Das Panel zeigt pro
Site die vollen 24 Kohorten, 12 Spezialisten und 8 Güter; die neuen deep-pack
Namen stehen ausschließlich in `biome-frontier-lifeworks.js`.

### Content-Pack 3.92.0 — Die dreistufige Feldforschungskette

Jede Site hat zwölf **Feldnotizen**, verteilt auf drei Stufen mit je vier
Notizen. Eine Notiz ist kein freischaltbarer Text ohne Spiel: Sie liest einen
echten Zähler oder Zustand — Survey, Deep Survey, Conservation, Restoration,
Harvest, Stabilisation, Condition, Hazard, Klima-Analogstufe, Relikt-Schicht,
lebende Spezialisten, Zyklus-Ernten oder abgeschlossene Rotationen — und zahlt
genau einmal. Die Belohnungen steigen mit der Stufe und umfassen Gold, Moral,
Nahrung, Holz, Stein, Legitimität, Fraktionszustimmung, diplomatische
Beziehungen, Garnisonsmoral, Wildmagie/Korruption sowie die dauerhafte
**Kronen-Charta** der Stufe 3.

**Freischaltung:** Stufe 1 ist von Beginn an offen. Stufe 2 öffnet erst, wenn
alle vier Notizen der Stufe 1 im `state.biomeFrontiers`-Ledger stehen; Stufe 3
erst nach allen vier Notizen der Stufe 2. Die erreichbare Stufe wird beim
Settle-Aufruf einmal festgelegt. Eine einzelne Aktion kann deshalb nicht durch
mehrere Stufen kaskadieren. Jede ID bleibt in alten Saves gültig; die früheren
sechs Notizen wurden den Stufen 1/1/1, 2/2 und 3 zugeordnet und ihre festen
Gold-/Moralgrants steigen mit der Stufe.

Beispiele: der **Feuerkalender** und die **Gras-Kohorte** bilden Stufe 1; die
**Restoration Line** und das **Rotationsbuch** öffnen Stufe 2; die
**Redpass-Charta** schließt nach fünf vollständigen Rotationen Stufe 3 ab.
Dieselbe Kette existiert für alle 15 Familien mit eigenen Namen und Zielen,
etwa **Creek Harvest → Root Restoration → Blue-Carbon Pact** an der Mangrove,
**Shelf Take → Snow Wall → Ice Steward** in der Eiswüste oder **Wrack Take →
Dune Repair → Living-Coast Charter** am Katastrophengürtel.

### Übersicht der neuen Ketten und Zyklen

Jede Site folgt demselben mechanischen Rhythmus, aber mit eigenen Namen:
Stufe 1 verlangt Survey, Deep Survey, Conservation und den ersten Harvest;
Stufe 2 verbindet Restoration mit einer echten Zyklus-Ernte; Stufe 3 verlangt
Hazard-Erfahrung, vier Restorationen, acht Zyklus-Ernten und fünf vollständige
Rotationen. Die kurze Rotation öffnet alle vier Jahre ein Harvest-Fenster und
danach ein Regenerationsfenster; der lange Bogen läuft über zwanzig Jahre und
berührt bei jedem Harvest Wirtschaft, Moral, Politik, Diplomatie, Garnison
und/oder Magie.

| Punkt | Familie | Kurzer Zyklus | Langer Zyklus |
| --- | --- | --- | --- |
| 1.2.23.2 | `savanna-dry-woodland` | Grass-and-Fire Rotation · 4J | Elephant Road Decade · 20J |
| 1.2.23.3 | `mangrove` | Tide and Propagule Cycle · 4J | Cyclone Recovery Arc · 20J |
| 1.2.23.4 | `coral-coast` | Reef Spawning Window · 4J | Reef Resilience Decade · 20J |
| 1.2.23.5 | `alpine-grassland` | Shieling Season · 4J | Transhumance Generation · 20J |
| 1.2.23.6 | `subarctic-shrub` | Lichen Recovery Cycle · 4J | Reindeer Migration Arc · 20J |
| 1.2.23.7 | `ice-desert` | Meltwater Window · 4J | Shelf Break Cycle · 20J |
| 1.2.23.8 | `underground-lakes` | Drip and Flood Cycle · 4J | Lake Level Century · 20J |
| 1.2.23.9 | `magic-primeval` | Ley Tide · 4J | Covenant Renewal · 20J |
| 1.2.23.10 | `cursed-wasteland` | Mourning Cycle · 4J | Curse Waning · 20J |
| 1.2.23.11 | `fungal-crystal` | Fruiting Pulse · 4J | Crystal Seam Cycle · 20J |
| 1.2.23.12 | `magic-transfigured` | Fold Weather · 4J | Anchor Alignment · 20J |
| 1.2.23.13 | `rare-community` | Refuge Season · 4J | Refugium Century · 20J |
| 1.2.23.14 | `historic-landform` | Parish Year · 4J | Charter Renewal · 20J |
| 1.2.23.15 | `climate-shift` | Treeline Season · 4J | Analog Transition · 20J |
| 1.2.23.16 | `catastrophe-belt` | Storm and Salvage Cycle · 4J | Breach Recovery Arc · 20J |

### 1.2.23.2 — Savannen und Trockenwälder

Baobab, Schirmakazie, Shea und Marula stehen über einem Grasfeld aus Red Oat
Grass; Elefant, Giraffe und Ernte-Termite halten die Kronenschicht offen. Drei
Störungen — spätes Grassfeuer, mehrjährige Dürre, Überweidung — verändern
Condition und Ausdehnung. Die Klima-Analogie führt von Sudan-Savanne über
Sahel-Dornbusch zur sahelo-saharischen Übergangszone. Shea Butter und Gum
Arabic sind echte Güter; die Katastrophe ist ein Kronenfeuer.

### 1.2.23.3 — Mangroven

Rote, schwarze und weiße Mangrove, Nipa, Schlammspringer, Winkerkrabbe,
Mangrovenreiher und Seegras bilden einen Gezeitenwald. Zyklonflut,
Salzwasserintrusion und Holzkohleschnitt sind die jährlichen Störungen.
Conservation erhöht die Vegetation der angeschlossenen Küstenregion und senkt
Erosion; Abholzung tut das Gegenteil. Güter: Mangrovenhonig und Tanninrinde.

### 1.2.23.4 — Koralleninseln und tropische Küsten

Staghorn- und Hirnkoralle, Riesmuschel, Seegras, Kokospalme, Papageifisch,
Grüne Meeresschildkröte und Fregattvogel teilen eine Bedingung. Massenbleiche,
Sturmflut und Sprengfischerei sind die Hazard-Chronik; die Katastrophe kann die
ganze Flachwasserregion in eine Algen-Schuttfläche verwandeln. Rifflperle und
Meersalz finanzieren Schutz und Wiederherstellung.

### 1.2.23.5 — Alpine Graslandschaften

Tufted Fescue, Edelweiß, Gelber Enzian und Zwergweide bilden einen 10–25 cm
hohen Rasen; Gämse, Steinbock, Murmeltier und Steinadler halten ihn offen.
Lawine, Frosttrocknis und Überweidung sind die Hazard-Chronik. Die
Klima-Analogie wandert von alpiner Matte über subalpines Gebirgsgebüsch zu
Schutt und Schneebett. Heu und Enzianwurzel sind die Güter.

### 1.2.23.6 — Subarktische Buschlandschaften

Zwergbirke, Teeblatt-Weide, Moorbeere, Moltebeere und Rentierflechte wachsen
auf diskontinuierlichem Permafrost; Rentier, Moorschneehuhn und Norwegische
Lemminge bewegen die Nahrungskette. Permafrost-Tau, Spätfrost und Überverbiss
sind die Störungen. Die Klima-Analogie führt von niedrigarktischer
Strauchtundra über Flechtenheide zur polaren Wüste.

### 1.2.23.7 — Eiswüsten

Schneealgen, Eisflchten, Arktischer Mohn, Kryomoose, Schneesturmvogel,
Eiswurm und Weddellrobbe leben auf Plateau, Nunatak und Blau-Eiszunge.
Katabatischer Sturm, Whiteout und Schmelzwasserflut sind die Hazard-Chronik;
die höchste Warming-Empfindlichkeit des Katalogs und ein möglicher
Eisregal-Abbruch machen die Site zum Frühwarnsystem. Eis kristall und
Robbenöl sind quotaierte Güter.

### 1.2.23.8 — Unterirdische Seen und Höhlensysteme

Blindfisch, Grottenolm, Höhlengarnele, Glühwürmchen, Blasse Höhlenmoose,
Höhlenpilz und Hufeisennase bewohnen eine Kalksteinhöhle mit stillem See.
Firsteinsturz, Gasblase und unterirdische Flut sind die Störungen; die
Tiefenbefahrung dokumentiert Blind salamander, Höhlenperlmuschel und weiße
Höhlenkrabbe. Höhlenbernstein und Kalzitperle sind die Güter.

### 1.2.23.9 — Magische Urwälder

Silberrinde, Mondweide, Prismenfarn und Glühkappe bilden einen Urwald, in dem
Warden Stag, Phoenixmotte und Glocken klingender Vogel leben. Schleierausdünnung,
Wildwuchs und Glamour sind die Hazard-Chronik. Ein magisches Ereignis kann die
Site verwandeln; Stabilisierung senkt Magie und Korruption. Güter: Aether-Saft
und Mondblüte.

### 1.2.23.10 — Verfluchte Ödlande

Schwarzdorn, Eschenfäule, Leichenrohr, Blight Beetle, Hollow Hound und
Grabseule besetzen eine graue Wunde. Fluchausbreitung, vergiftetes Wasser und
Zehrfieber sind die Störungen; Korruption ist ein sichtbarer Wert und treibt
Condition und Artenverlust. Blight Resin und Grave Salt sind die Güter;
Stabilisierung kann den blighted Aspekt zurück in natural führen.

### 1.2.23.11 — Pilz- und Kristallökosysteme

Riesenkappe, Laternenshelf, Kristallmoos, Quarzspine, Sporeling,
Kristallkäfer und Blinder Molch teilen einen lebenden Boden. Sporenwolke,
Splittersturm und Tunnel Fäule sind die Störungen. Glühkappen und
Kristallsplitter werden unter echtem Condition-Verlust geerntet; die
Tiefenbefahrung dokumentiert Glasflügelmotte, Kronleuchterpilz und Prismenmolch.

### 1.2.23.12 — Veränderte Biome durch magische Ereignisse

Shimmer-oak, Glassfern, Skyroot, Ley-Eel, Echo Moth und Mirror Finch sind aus
einem gewöhnlichen Flusswald geworden. Die Site startet im Aspekt
`transfigured` und trägt ihren ursprünglichen Biomen im Feld `originBiome`.
Unstable Magic, Terrain Shift und Glamour Storm sind die Störungen; eine
Wild-Magic-Entladung kann eine zweite Faltung auslösen, während Stabilisierung
den Aspekt naturalisiert, ohne die Erinnerung zu löschen. Güter: Ley Crystal und
Shimmer Down.

### 1.2.23.13 — Seltene regionale Pflanzen- und Tiergemeinschaften

Serpentinenfarn, Klippen-Zwergmispel, Schneelotus, Höhlenorchidee, Relikt-Ralle,
Schneeleopard und Nachtpapagei überleben auf Serpentin, Klippe und alter
Heckenbank. Sammeldruck, invasiver Verbiss und Fragmentierung sind die
Störungen; unter 30 Condition verschwindet zuerst ein Spezialist, ab 65 kehrt
er zurück. Rare Seed und Naturalist's Specimen sind quotaierte Güter.

### 1.2.23.14 — Historische Landschaftsformen

Relikt-Linde, alte Eibe, Moororchidee, Sumpfdotterblume, Sandeidechse, altes
Herdenvieh und Kirchenkauz halten Ridge-and-Furrow, Römerstraßenhecke und
mittelalterlichen Fischteich lesbar. Tiefpflügen, Entwässerung und Vernachlässigung
sind die Störungen. Jede Tiefenbefahrung und jedes zwölfte Jahr lesen eine
weitere Relikt-Schicht (Open-field Ridge, Monastic Grange Boundary usw.).

### 1.2.23.15 — Biome durch langfristige Klimaveränderungen

Fichte und Moorbirke weichen Federgras, Saiga und Steppenarten. Die Site ist
ein Prozess: `climatePressure` verschiebt die Analogie von geschlossenem
Boreallwald über offene Birken-Waldsteppe zur Federgrassteppe. Dürre, früher
Tau und Kantenfeuer sind die Störungen. Treeline Seed und Summer Pasture sind
die Güter; die Artenliste ist selbst das Klimaarchiv.

### 1.2.23.16 — Biome, die durch ökologische Katastrophen verschwinden oder sich verändern

Pionierbirke, Weidenröschen, Salzwiesengras, Glasschmalz, Krähen, Kegelrobbe
und Schlammgarnele besiedeln eine bereits gebrochene Küste. Sturmflut,
Murenabgang und Salzauswaschung sind die Störungen. Die Site startet am
nächsten zur Schwelle, ihre Katastrophe kann in offenes Wasser übergehen, und
selbst eine vanished Site behält History und Relikt-Schichten. Revival kostet
26 Gold und 10 Holz und setzt drei Gründungskohorten zurück.

## 4. Aktionen und Kosten

| Aktion | Kosten | Wirkung |
| --- | --- | --- |
| Survey | 8 Gold | Condition, Arten, Hazards und Güter werden sichtbar |
| Deep Survey | 12 Gold | Seltene Gemeinschaft, Relikt-Schichten und exakte Werte |
| Conserve | 14 Gold, 6 Holz | dauerhafter Warden-Vertrag; halbiert den jährlichen Verlust, schützt Spezialisten, hebt die Atlas-Vegetation |
| Restore | 12 Gold, 8 Holz | Condition +9, Extent +3, Atlas-Vegetation +, Moral +1 |
| Revive | 26 Gold, 10 Holz | nur bei vanished; Condition 16, drei Gründungskohorten |
| Harvest | kostenlos | +2–5 Güter, Condition −3 (−1,5 unter Schutz), Extent −0,4, Atlas-Vegetation − |
| Stabilise | 16 Gold, 4 Stein | Magie −24, Korruption −24, Condition +3; natural, wenn Magie < 55 und Korruption < 45 |
| Sell | kostenlos | lagert Güter in Gold um; kein Jahres-Slot |

Jede Site hat **eine Aktion pro Jahr**. Der Grund steht als `title` am
deaktivierten Button, nie als stummes `disabled`.

## 5. Der Jahrespass

`updateBiomeFrontiers()` läuft genau einmal pro Jahr und ist idempotent.

1. **Klima:** derselbe `getClimateDrift()` wie Atlas und Wald-Ledger.
   `warming = drift / 20 + max(0, year − 1) × 0,002`, für Frontier-Sites auf
   ±0,4 begrenzt. Das ist die ökologische Ausdrucksgrenze dieser Formationen,
   kein zweites Klimamodell.
2. **Condition:** `gain − stress + Schutz + Regeneration − Korruption − Aspekt ± Jitter`.
   Die Regeneration greift unter 55 und ist bei polaren bzw.
   Katastrophen-Sites bewusst ausgesetzt.
3. **Klima-Analogie:** ab 52 Pressure und frühestens nach 6 Jahren wandert die
   Analogie eine Stufe; `stats.climateShifts` zählt das Ereignis.
4. **Magie:** deterministischer Wurf; ein Surge erhöht Magie, kann bei ≥ 62
   eine natürliche Site transfiguren. Eine frische Stabilisierung hält die
   Magie drei Jahre niedrig.
5. **Korruption:** offene Sites steigen, geschützte fallen; ab 60 wird der
   Aspekt `blighted`, über 45 kostet Korruption zusätzlich Condition.
6. **Katastrophe:** höchstens eine pro Site-Jahr, deterministisch aus
   Seed/Site/Jahr. Sie senkt Condition und Extent, schreibt Hazard-Erinnerung,
   kann die Site vanished setzen und die Atlas-Vegetation senken.
7. **Seltene Gemeinschaft:** unter 30 verschwindet ein Spezialist, ab 65 kehrt
   einer zurück.
8. **Güter:** jährlicher Ertrag nur bei Condition ≥ 30, unter Schutz etwas
   geringer, mit Kronen-Charta +8 %; Bestand ist auf 999 begrenzt.
9. **Zyklen:** pro Site werden zwei Zyklen gelesen. Ein Harvest-Fenster zahlt
   einmal pro Periode, ein Regenerationsfenster hebt Condition und senkt
   Korruption, und eine volle Rotation erhöht den Zähler. Die bezahlten
   Perioden werden in `site.cycles` gespeichert, damit Save/Load keinen
   Harvest doppelt auszahlt. **Nur untersuchte Sites zahlen**: die erste Survey
   macht die Site für die Krone lesbar; vorher läuft die Ökologie weiter, aber
   Harvest- und Regenerationsfenster verfallen, statt Jahre nachträglich
   auszuzahlen. Lange Harvests schreiben zusätzlich in `state.resources`,
   `state.morale`, `state.politics`, `state.diplomacy`, Soldatenmoral und/oder
   Wildmagie.
10. **Relikt-Schichten:** historische Sites lesen alle zwölf Jahre eine weitere
    Schicht.
11. **Feldnotizen:** deklarative Ziele werden nach jeder Aktion, jeder
    Katastrophe und am Ende des Jahrespasses geprüft, aber erst nach der ersten
    Survey. Die beim Aufruf erreichbare Stufe ist fixiert; jede Notiz zahlt
    genau einmal und wird im Site-Verlauf gespeichert.
12. **Phase:** pristine ≥ 82, resilient ≥ 62, strained ≥ 40, relict ≥ 18,
    collapse ≥ 1, vanished < 0,5.

## 6. Persistenz und Performance

- `state.biomeFrontiers` ist additiv. Ein alter Save ohne das Feld startet beim
  nächsten Tick einen deterministischen Katalog.
- `serializeBiomeFrontierState()` normalisiert auch beim Speichern, damit ein
  exakter JSON-Roundtrip garantiert ist.
- `validateBiomeFrontierSnapshot()` prüft Version, Seed, 15 Sites, eindeutige
  Familien, Array-Grenzen und alle 0–100-Werte.
- Jede Site hat höchstens 24 Arten, 12 Spezialisten, 12 Hazards, 8 Güter, 12
  Feldnotizen, 2 Zyklen, 12 History-Zeilen und 12 Relikt-Schichten; der globale
  Verlauf ist auf 48 Zeilen begrenzt.
- Der Jahrespass läuft über 15 Sites. Es gibt keinen Per-Frame-, Per-Tick- oder
  Per-Tile-Aufwand und keinen neuen Canvas.

## 7. UI

Das Register sitzt im bestehenden **BIOMES**-Panel zwischen Frontier-Markt und
den entdeckten Regionen. Jede Site ist ein `<details>`-Card mit:

- Name, Familie, Klima-Analogie, Phase und Aspekt,
- vier Metern (Condition, Extent, Wild Magic, Corruption),
- zwölf Hazard-Karten mit Jahr und Severity,
- zwei Zyklus-Karten mit Phase, Harvest-/Regenerationsfenster, Rotationen und
  Belohnungszeile,
- Arten-Roster, seltener Gemeinschaft, zwölf Feldnotizen in drei Stufen und
  zwölf Relikt-Schichten,
- acht Gütern mit Bestand und Verkauf,
- echten Aktionsbuttons mit Kosten und Begründung,
- Site-Record und Field Guide 1.2.23.2–16.

Die Karten sind standardmäßig geschlossen; nur die erste öffnet sich. Das hält
den DOM-Aufwand auch im späten Spiel begrenzt. Nach einer Aktion bleibt die
zuletzt geöffnete Karte offen, damit ihr Ergebnis an derselben Stelle sichtbar
ist. Direkt über der Aktionsleiste steht die letzte Entscheidung mit Jahr, Art
und vollem Ergebnistext; der vollständige Verlauf bleibt darunter im
SITE RECORD.

### Smartphone und Querformat

Unter 641 px wird die 29-teilige Registerleiste zu einem nativen
Auswahlfeld; der Dialog nutzt fast die volle Viewport-Höhe und der Banner
schrumpft. Das gilt auch für kurze Querformate bis 960 px Breite, wo die
Registerleiste sonst den gesamten Scrollport verbrauchen würde.

Die Aktionsleiste steht direkt nach Condition, Ausdehnung, Klima und Phase,
nicht erst unter Arten, Gütern und Geschichte. Auf schmalen Viewports sind
Aktions-, Verkaufs-, Karten- und Guide-Schaltflächen mindestens 44×44 CSS-Pixel
groß, der Field Guide wird einspaltig, und Karten- sowie Guide-Texte wachsen
auf 10–12 px. Lange Site-Namen, Klima-Analogien und Hinweise umbrechen statt
abgeschnitten zu werden; deaktivierte Aktionen behalten einen lesbaren
Kontrast und den sichtbaren Jahresgrund.

## 8. Verifikation

- `tests/systems/biome-frontiers.test.js` — **14 Tests**: Katalog (24/12/12/8/12/12,
  drei Stufen, zwei Zyklen), 15 Sites, Aktionen, Jahres-Sperre,
  Katastrophe/Revival, Klima-Analogie, Atlas-Kopplung, Feldnotizen,
  Stufen-Gating mit einmaliger T2-Belohnung, Save-Roundtrip, Zyklus- und
  Cross-System-Effekte, 25-Jahres-Determinismus, 300-Jahres-Soak,
  Action-Begründungen.
- `tests/browser/biome-frontiers-ui.mjs` — Desktop/Tablet-Spielerpfad: 15
  Karten, **360 Kohorten, 180 Spezialisten, 180 Hazards, 120 Güter, 180
  Feldnotizen**, 15 Guide-Punkte, Survey, Deep Survey, Conservation,
  Restoration, Stufe 1 → Stufe 2, genau eine T2-Belohnung, echter Save/Reload
  über `#save-btn` und `#continue-game-btn`, Layout-Audit und Screenshots.
- `tests/browser/biome-frontiers-mobile.mjs` — Smartphone-Referenz auf
  360×640, 390×844 und 414×896 sowie 640×360, 844×390 und 896×414: alle 15
  Guide-Punkte werden einzeln gelesen, jede Site-Karte geöffnet und geschlossen
  und alle acht Aktionen (Survey, Deep Survey, Conservation, Restoration,
  Revival, Harvest, Stabilisation, Verkauf) über echte Touch-Ziele ausgeführt.
  Zusätzlich läuft auf jedem Viewport die Kette Stufe 1 → Stufe 2; auf 640×360
  wird sie gespeichert, neu geladen und unverändert wiedergefunden. 44-px-Ziele,
  Textumbruch, Scrollport, Überlappung, Konsolen- und Assetfehler werden pro
  Breite geprüft.
- `scripts/biome-frontiers-soak.mjs` — drei Seeds × 300 Jahre, Bound- und
  Finite-Prüfung, JSON-Bericht.
- `npm run spec:audit` — Sektion `1.2.23.2-16` ohne offene Punkte.

## 9. Guardrails

1. Der Katalog ist reine Daten: kein Code, DOM, URL oder Save-Mutation aus einer
   Familiendefinition.
2. Eine Site pro Familie, 15 insgesamt; alle Arrays sind begrenzt (24 Arten, 12
   Spezialisten, 12 Hazards, 8 Güter, 12 Feldnotizen, 2 Zyklen, 12
   Verlaufszeilen, 12 Relikt-Schichten).
3. Der Jahrespass läuft einmal in der bestehenden Jahreskette.
4. Deterministische Hashes aus Seed, Site und Jahr; kein Verbrauch des
   gemeinsamen Gameplay-RNG.
5. Additives `state.biomeFrontiers`; Save-Schema 15 bleibt gültig.
6. Jede Aktion kostet echte Ressourcen und beachtet eine Aktion pro Site/Jahr.
7. Condition, Extent, Magie und Korruption bleiben 0–100; eine vanished Site
   behält Geschichte und Relikt-Schichten und ist mit höheren Kosten revivbar.
