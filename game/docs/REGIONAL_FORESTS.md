# Regionale Waldtypen — 1.2.23.1

> **Status: implementiert und verifiziert (v3.51.0).** Alle 30 Punkte aus **1.2.23.1 Weitere regionale Waldtypen** laufen als regionale Overlay-Schicht über dem bestehenden `forestStandAt()`-Vertrag. Jede erzeugte Waldkachel erhält deterministisch genau einen Typ; es gibt keinen untypisierten Default. Nachweise: `tests/world/regional-forests.test.js` (30/30 Standortproben, 0 untypisierte Kacheln im 9-Klima-Scan, Save-Roundtrip), ein 25-Jahres-Kampagnenlauf mit Typzählung und `tests/browser/regional-forest-reference.mjs` (Spieler-Inspektor, gerenderte Typen, keine Konsolenfehler). Die konkreten implementierten Werte stehen in Abschnitt 10.

## 1. Warum dieser Abschnitt existiert

Die vorhandenen Biome 1.2.1–1.2.22 decken Laub-, Nadel-, Misch-, Tropen-, Savannen-, Taiga-, Tundra-, Steppen-, Wüsten-, Berg-, Küsten-, Sumpf- und Sonderwälder bereits als ein gemeinsames deterministisches Standmodell ab. 1.2.23.1 erfindet deshalb **keinen zweiten Wald-Simulator**. Die 30 regionalen Typen sind eine feinere geografische und ökologische Schicht über demselben `forestStandAt()`-Vertrag:

- dieselbe Kachel, derselbe Seed und derselbe Kontext ergeben weiterhin genau einen Stand;
- der Typ beeinflusst Artenmischung, Struktur, Boden, Güter, Fauna, Gefahren und Wiederbewaldung;
- Renderer, Ressourcenkarte, Förster-/Holzfäller-Prüfung und Sammel-Ledger lesen weiterhin denselben Stand;
- alte Saves bleiben lesbar, weil neue Formations-Indizes ausschließlich hinten angehängt werden und der Regionaltyp aus dem Stand abgeleitet wird, nicht aus einem neuen Pflichtfeld.

Der Spieler merkt den Unterschied nicht an einer neuen HUD-Leiste, sondern an dem, was er auf der Karte sieht, im Försterbericht liest, ernten kann und welche Risiken er tragen muss.

## 2. Gemeinsamer Vertrag

### 2.1 Ein Regionaltyp ist ein Datenobjekt, keine Sonderlogik

Jeder Typ beschreibt mindestens:

| Feld | Bedeutung |
|---|---|
| `id` | Stabile Nummer `1.2.23.1.001`–`1.2.23.1.030`. |
| `label` / `shortLabel` | Deutscher Spielname und kurze Kartenbezeichnung. |
| `baseFormation` | Bestehende Formation, auf der der Typ aufsetzt; verhindert doppelte Ökologie. |
| `climate` | Zulässige Klimafamilien und Ausschlüsse. |
| `site` | Temperatur-, Feuchtigkeits-, Höhen-, Salz-, Wasser- und Bodenfenster. |
| `species` | Gewichtete Artenliste mit realen Baumarten und regionalen Stellvertretern. |
| `structure` | Kronenschichten, Dichte, Licht, Totholz, Altersaufbau. |
| `goods` | Holz, Feuerung, Nahrung, Medizin, Faser, Harz, Spezialgut. |
| `fauna` | Reale Wirbeltier- und Insektenarten, keine reine Dekoration. |
| `hazards` | Feuer, Sturm, Hochwasser, Salz, Frost, Trockenheit, Schädlinge. |
| `succession` | Frische Störung, Regeneration, Jungwald, Genesung, Klimax. |
| `gameplay` | Eine klare Entscheidung, die dieser Typ erzeugt. |
| `render` | Silhouette, Boden, Licht, Jahreslauf, erkennbare Signatur. |
| `acceptance` | Prüfbare Mindestbedingungen für die Implementierung. |

### 2.2 Gate-Reihenfolge

Die Auswahl muss deterministisch und in dieser Reihenfolge erfolgen:

1. **Harte Ausschlüsse:** Klima, Salz, dauerhafte Überflutung, Höhe über der Baumgrenze, fehlender Walddruck.
2. **Standortfenster:** Temperatur, Feuchtigkeit, Boden, Grundwasser, Küstenabstand, Hanglage.
3. **Regionaler Patch:** ein grober, seed-basierter Hash entscheidet, ob innerhalb eines geeigneten Gürtels dieser Typ oder seine Basisformation entsteht.
4. **Bestehende Formation:** Störung, Alter, Bewirtschaftung und Sukzession werden wie bisher danach angewendet.

Der regionale Patch darf **nie** pro Kachel zufällig zwischen zehn ähnlichen Typen springen. Er arbeitet in zusammenhängenden Zellen, damit ein Wald auf der Karte als Region lesbar bleibt. Die Zellgröße ist pro Typ festzulegen, typischerweise 5×5 bis 9×9 Kacheln.

### 2.3 Ressourcen- und Wirtschaftsregeln

- Jeder Typ liefert mindestens ein benanntes Holz und ein saisonales Gut.
- Neue Güter werden im bestehenden `FOREST_GOODS`-Katalog registriert; es gibt keine typ-lokale Schattenwirtschaft.
- Knappe Spezialgüter (Kork, Teak, Harz, Mangrovenholz, Bambusfasern) erhalten einen echten Verwendungszweck, nicht nur einen Verkaufspreis.
- Der Typ darf die vorhandene Holzmenge nicht vervielfachen. Seine Produktivität liegt in einem expliziten Band und wird durch Stock-Ratio, Alter und Bewirtschaftung moduliert.
- Jede Ernte läuft über den bestehenden Sammel-/Holz-Ledger und reduziert den echten Bestand.

### 2.4 Darstellung und Player Read

Jeder Typ braucht auf einen Blick unterscheidbare Merkmale:

- **Silhouette:** Kronenform, Höhe, Stammanteil, Lücken.
- **Boden:** Nadelstreu, Laub, Torf, Salz, Sand, Fels, Schlamm.
- **Licht:** geschlossen, fleckig, neblig, gleißend, blaugrün.
- **Jahreslauf:** Austrieb, Blüte, Frucht, Laubfall, Schnee, Trockenheit.
- **Bewegung:** Nebel, Wind, Wasser, Insekten, Vögel.
- **Lesbarkeit bei 390 px:** Der Typ muss über Farbfläche, Kronenform und ein bis zwei Bodenmerkmale erkennbar sein, nicht über kleine Details.

### 2.5 Performance, Save und Determinismus

- Die Typauswahl ist O(1) pro Kachel und darf keinen Nachbarscan über die ganze Karte auslösen.
- Statische Metadaten werden pro Formation genau einmal berechnet und gecacht.
- Es gibt keine neuen Pflichtfelder im Save. Wird ein Regionaltyp gespeichert, dann als stabiler String oder angehängter Index, nie als Objektgraph.
- Ein Save/Load-Zyklus muss denselben Typ, dieselben Güter und dieselbe Fauna ergeben.
- Die 25-Jahres-Kampagne und der 60-Jahres-Soak müssen ohne neue Ausreißer laufen; der Typ darf die bestehenden Wildtier-, Holz- und Disturbance-Budgets nicht sprengen.

## 3. Übersicht aller 30 Typen

| ID | Typ | Klima / Standort | Wasser | Erkennungsmerkmal | Bestehende Basis |
|---|---|---|---|---|---|
| 001 | Borealer Nadelwald / Taiga | kalt, kontinental | mäßig feucht | dunkle Fichten, Moore, langer Schnee | `taiga-spruce`, `taiga-pine`, `taiga-larch`, `taiga-birch` |
| 002 | Gemäßigter Regenwald | kühl-ozeanisch, sehr feucht | ganzjährig nass | riesige Bäume, Moos, Baumfarne | keine; neue Formation |
| 003 | Atlantischer Nebelwald | kühl, küstennah | Nebel und Sprühregen | kurze, moosige Kronen, Flechten | keine; neue Formation |
| 004 | Mediterraner Hartlaubwald | warm, sommertrocken | Winterregen | immergrüne, ledrige Blätter | `oakwood`, `pinewood` |
| 005 | Sommergrüner Laubmischwald | gemäßigt, tiefgründig | gleichmäßig | Eiche, Buche, Esche, Ahorn | `mixed`, `oakwood`, `beechwood` |
| 006 | Reiner Buchenwald | gemäßigt, kühl-feucht | gut versorgt | glatte Stämme, geschlossenes Dach | `beechwood` |
| 007 | Eichen-Hainbuchenwald | gemäßigt, nährstoffreich | frisch | Eichen über Hainbuchen-Unterbau | `linden-elm` |
| 008 | Auenwald | gemäßigt, Flussniederung | Überflutungspuls | Weiden, Eschen, Altwasser | `alluvial`, `mixed-alluvial` |
| 009 | Bruchwald | gemäßigt, dauerhaft nass | Wasserstand nahe Boden | Erlen, Weiden, schwarzer Schlamm | `swamp-carr` |
| 010 | Moorwald | kalt-gemäßigt, sauer | Torf, Staunässe | Kiefern, Birken, Torfmoos | `wet-conifer` |
| 011 | Kiefern-Birkenwald | kühl, sandig, nährstoffarm | trocken bis frisch | lichte Kiefern, weiße Birken | `pine-heath`, `birchwood` |
| 012 | Fichten-Tannenwald | kühl, mittelgebirgig | feucht | dunkle Fichten und Tannen | `sprucewood`, `firwood` |
| 013 | Lärchenwald | kontinental, kühl | mäßig | goldene Nadeln im Herbst | `larchwood` |
| 014 | Bergmischwald | montan, wechselnd | frisch bis feucht | Buche, Tanne, Fichte, Ahorn | `mixed-montane` |
| 015 | Subalpiner Wald | hochmontan, rau | wechselnd | Krummholz, Zirbe, Lärche | `subalpine-scrub` |
| 016 | Küstenmammutbaumwald | küstennahe Nebelzone | hohe Luftfeuchte | monumentale rote Stämme | keine; neue Formation |
| 017 | Pazifischer Regenwald | ozeanisch, sehr nass | ganzjährig | Sitka-Fichte, Hemlocktanne, Moos | keine; neue Formation |
| 018 | Eukalyptuswald | warm, sommertrocken | saisonal | hohe, lichte Stämme, Feueranpassung | keine; neue Formation |
| 019 | Akazien-Waldland | halbtrocken, warm | Regen- und Trockenzeit | Schirmakazien über Gras | `savanna-woodland` |
| 020 | Miombo-Wald | tropisch-saisonal | Trockenzeit | lichte Kronen, Brachystegia | keine; neue Formation |
| 021 | Baobab-Waldland | trocken, heiß | stark saisonal | fassförmige Stämme | Savannen-Baobab-Grove |
| 022 | Dornwald / Thornscrub | trocken, heiß | sehr wenig | dornige, niedrige Kronen | Savannen-Thornscrub |
| 023 | Galeriewald | trocken, Flussufer | ganzjährig | grüner Korridor im Trockenland | `alluvial`, `riparian-corridor` |
| 024 | Mangrovenwald | tropisch, küstennah | Salz- und Brackwasser | Stelzwurzeln, Gezeiten | keine; neue Formation |
| 025 | Bambuswald | tropisch bis warmgemäßigt | feucht | hohle Halme, schnelle Regeneration | tropische Bambusformation |
| 026 | Teakwald | tropisch-saisonal | sommergrün | große Blätter, wertvolles Holz | keine; neue Formation |
| 027 | Salwald | tropisch-saisonal | sommergrün | Sal-Bäume, Feuerökologie | keine; neue Formation |
| 028 | Dipterocarpaceenwald | tropisch, Tiefland | sehr feucht | hohe Emergenten, Mastjahre | Tropenwald 1.2.4 |
| 029 | Lorbeerwald | mild, feucht, montan | Nebel und Regen | ledrige Lorbeerblätter | keine; neue Formation |
| 030 | Monsunwald | tropisch, ausgeprägte Trockenzeit | saisonal | Laubabwurf, Teak, Bambus | keine; neue Formation |

## 4. Die 30 Typen im Detail

### 4.1 Kaltboreale und kühl-ozeanische Wälder

#### 1.2.23.1.001 — Borealer Nadelwald / Taiga

**Kurzprofil:** Der geschlossene boreale Nadelwald der langen Winter, kurzen Sommer und weiten Nadelstreu. Er ist kein „kaltes Kiefernbild“, sondern ein eigener Regionaltyp mit Permafrostrand, Schneelast, Waldbrandmosaik und sehr langsamer Regeneration.

**Standort:** Klima `taiga`, `snow` oder kalte `mountain`-Lagen; Temperatur etwa 0,18–0,38; Feuchtigkeit 0,45–0,70; Höhe unter der Baumgrenze; Böden Podsol, podsolisierte Braunerde, Torfinseln und sandige Moränen. Staunässe ist häufig, aber nicht durchgehend.

**Bestand und Struktur:** Zwei bis drei Schichten. Die oberste Schicht bilden Fichte und Kiefer, regional Lärche; darunter stehen Birke, Vogelbeere und Jungfichten. Dichte 0,75–0,90, aber mit echten Lücken durch Brand, Windwurf und Insekten. Totholz ist ein prägendes Element: stehende Trockenstämme, Wurzelteller, Moderholz und vom Schnee gebrochene Gipfel.

**Artenpalette:** *Picea abies* oder *P. obovata* 45–60 %, *Pinus sylvestris* 15–30 %, *Larix sibirica* / *L. gmelinii* 5–20 %, *Betula pubescens* / *B. pendula* 8–20 %, *Sorbus aucuparia* 2–5 %. Boden: *Pleurozium schreberi*, *Hylocomium splendens*, *Cladonia* spp., *Vaccinium myrtillus*, *V. vitis-idaea*, *Ledum palustre*.

**Jahreslauf:** Winter mit tiefer Schneedecke, gebrochenen Ästen und reduzierter Bewegung; Frühjahr mit Schneeschmelze, sichtbarem Wurzelwerk und erstem Birkengrün; kurzer, heller Sommer mit Beerenernte und Insektenflug; Herbst mit Lärchengold, ersten Frösten und Vorratsarbeit.

**Boden und Krautschicht:** Nadelstreu, Moos, Flechten, Blaubeere, Preiselbeere, Zwergsträucher und Torfmoos in Senken. Der Boden ist sauer und nährstoffarm; Regenwürmer fehlen weitgehend. Pilze erscheinen nach feuchten Sommerwochen, nicht ganzjährig.

**Nutzung:** Fichten- und Kiefernholz, Brennholz, Harz, Zapfen, Blaubeeren, Preiselbeeren, Pilze, Wild, Felle, Rentierflechte, Torf in Randmooren. Die Wege sind im Sommer morastig und im Winter über Schneestraßen befahrbar; der Transport ist der eigentliche Engpass, nicht der Bestand.

**Fauna:** Elch, Rentier (regional), Braunbär, Wolf, Luchs, Vielfraß, Auerhuhn, Kreuzschnabel, Sperlingskauz, Fuchs, Hase, Borkenkäfer, Ameisen. Die Räuberpopulation muss an die echte Huftierbiomasse gekoppelt bleiben; keine dekorativen Wölfe ohne Beute.

**Störungen und Sukzession:** Feuer, Borkenkäfer, Schneebruch, Windwurf und Trockenstress. Nach einem Brand dominieren zunächst Birke, Weide und Moos, dann Kiefer, später Fichte. Die Regeneration ist deutlich langsamer als im gemäßigten Laubwald; ein Kahlschlag bleibt Jahrzehnte lesbar. Moore und Permafrostrand reagieren besonders träge.

**Spielerfahrung:** Der Spieler muss Winterbrennstoff und Bauholz über das Jahr sichern, aber auch entscheiden, ob er die letzten Altwälder schützt oder in die entfernten Bestände vordringt. Harz und Pelze geben eine lukrative, aber riskante Nebennutzung. Gute Planung belohnt Vorratshaltung; schlechte Planung bestraft nicht sofort, sondern im zweiten oder dritten Winter.

**Abgrenzung:** Die bestehenden `taiga-spruce`, `taiga-pine`, `taiga-larch` und `taiga-birch` bleiben die kleinräumigen Formationen. 001 ist der regionale Dachtyp mit eigener Kartenlegende, eigenem Winter-/Torfprofil und eigener Ressourcenpriorität. 011 ist der nährstoffarme Sand-Kiefern-Birkenwald der gemäßigten Zone, nicht die boreale Taiga; 012 ist der feuchte Fichten-Tannenwald der Mittelgebirge.

**Abnahme:** Der Typ ist in mindestens einem Taiga- und einem Snow-Seed erreichbar; Försterbericht, Karte und Ressourcenknoten nennen denselben Typ; Brennholz, Harz und Beeren folgen dem Jahreslauf; ein Kahlschlag regeneriert sichtbar über die definierten Stufen; ein Save/Load-Zyklus verändert weder Typ noch Bestand.

#### 1.2.23.1.002 — Gemäßigter Regenwald

**Kurzprofil:** Ein kühl-ozeanischer, ganzjährig sehr feuchter Wald mit enormer Biomasse, Baumfarnen, Moosen und einer dichten, mehrschichtigen Krone. Er ist die gemäßigte Entsprechung zum Tropenregenwald, aber mit anderen Arten, langsamerem Wachstum und anderen Gefahren.

**Standort:** Kühl-ozeanisch, windzugewandt, ganzjährig hohe Niederschläge und Nebel; Temperatur 0,40–0,58; Feuchtigkeit über 0,76; Küsten- oder Gebirgsnähe mit hoher Luftfeuchte; tiefe, organische, stark ausgewaschene Böden. Kein langer Frost, aber häufige Sturmlagen.

**Bestand und Struktur:** Drei bis vier Schichten: riesige Kronenbaumarten, mittlere Laubbäume, Baumfarne und eine moosige Bodenflora. Dichte 0,80–0,95, Licht am Boden sehr gering. Epiphyten, Lianen und Moospolster überziehen Stämme und Äste. Totholz verrottet schnell und bildet Keiminseln für Jungbäume.

**Artenpalette:** Je nach Region *Nothofagus* (Südhalbkugel), *Podocarpus*, *Weinmannia*, *Dicksonia antarctica*, *Eucryphia cordifolia*, *Aextoxicon punctatum*; in einer europäischen Variante *Quercus robur*, *Fagus sylvatica*, *Ilex aquifolium*, *Betula pendula* mit hohem Moosanteil. Die Artenliste muss regional klar sein, damit 002 nicht mit 017 zu einer einzigen „Regenwald“-Mischung verschmilzt.

**Jahreslauf:** Milde, nasse Winter; ganzjährige Vegetation; Frühjahr mit Farnwedeln und frischem Moos; Sommer mit kurzen Trockenphasen und Pilzschüben; Herbst mit Laubfall der sommergrünen Arten, aber ohne echte Kahlphase. Nebel ist ein tägliches, kein saisonales Ereignis.

**Boden und Krautschicht:** Tiefer Rohhumus, vermoderte Stämme, Moose, Farne, Sauerklee, Moosbeere und Pilze. Der Boden ist nährstoffarm, aber durch hohe Feuchtigkeit und schnellen Abbau biologically aktiv. Erosion ist auf steilen Flächen ein echtes Risiko.

**Nutzung:** Wertvolles, aber schwer zu transportierendes Holz; Feuerholz; Moos und Farn als Faser-/Polstermaterial; Pilze; Medizinalpflanzen; Honig; Wild. Die hohe Feuchtigkeit erschwert Trocknung und Lagerung. Wege verbrachen schnell und müssen instand gehalten werden.

**Fauna:** Rothirsch, Wildschwein, Marder, Fuchs, Eule, Specht, Frosch, Salamander, Schnecke, Käfer; in der südlichen Variante Beutelteufel, Kiwi oder Pudu als regionale Stellvertreter. Totholz beherbergt eine eigene Lebensgemeinschaft.

**Störungen und Sukzession:** Windwurf, Hangrutsch, Überschwemmung, selten Feuer. Lücken schließen sich über Baumfarne, Pionierbäume und Schattenbaumarten. Die Sukzession ist schnell im Kronenschluss, langsam in der Artenzusammensetzung. Ein großflächiger Windwurf ist ein Jahrzehnte sichtbares Landschaftsereignis.

**Spielerfahrung:** Hoher Holzwert und hohe Biodiversität stehen teurer Infrastruktur, langsamer Trocknung und Rutschgefahr gegenüber. Der Spieler wählt zwischen schonender Entnahme einzelner Stämme und flächiger Nutzung; letztere zerstört den Lebensraum und erhöht Erosion. Nebel senkt Sicht und Bewegungsgeschwindigkeit, erhöht aber die Regeneration.

**Abgrenzung:** 017 ist der pazifische Küstenregenwald mit Sitka-Fichte, Hemlocktanne und Rotholz; 002 ist der allgemeine gemäßigte Regenwald der Südhalbkugel und europäischen Ozeanränder. 003 ist der kühlere Nebelwald mit kürzerer Krone und anderer Artenpalette; 029 ist der milde Lorbeerwald mit ledrigen Blättern.

**Abnahme:** Der Typ ist nur bei sehr hoher Feuchtigkeit und ohne strengen Frost erreichbar; mindestens drei Schichten und zwei Epiphyten sind sichtbar; Moos und Farn reagieren auf Feuchtigkeit; Windwurf erzeugt eine echte Lücke; die Artenliste unterscheidet sich messbar von 017.

#### 1.2.23.1.003 — Atlantischer Nebelwald

**Kurzprofil:** Ein kühler, küstennaher Wald, der seinen Wasserhaushalt überwiegend aus Nebel, Sprühregen und hoher Luftfeuchtigkeit zieht. Die Bäume sind niedriger und knorriger als im Regenwald, die Stämme dicht mit Moos und Flechten besetzt.

**Standort:** Kühle Küsten- oder Inselberge, Temperatur 0,38–0,55, Feuchtigkeit 0,62–0,82, salzarme Windschatten, Höhenlage unter der Wolkenbildung. Böden sind sauer, torfig, flach und oft wassergesättigt. Salzspray und starke Winde begrenzen die Wuchshöhe.

**Bestand und Struktur:** Zwei Schichten, oft mit einer „windgescherten“ Kronenlinie. Buche, Eiche, Stechpalme, Vogelbeere, Hasel und Kiefer; Moose, Flechten, Farne und Sauerklee. Dichte 0,65–0,85; Licht am Boden wechselt mit Nebel und Wolkenlücken. Epiphyten sind häufiger als Lianen.

**Artenpalette:** *Fagus sylvatica*, *Quercus petraea*, *Ilex aquifolium*, *Sorbus aucuparia*, *Corylus avellana*, *Pinus sylvestris*, *Erica cinerea*; Moose *Hylocomium*, *Thuidium*, *Sphagnum* in Senken; Flechten *Usnea*, *Lobaria*.

**Jahreslauf:** Mild, feucht, stürmisch; Frühjahr mit frischem Grün und Nebeltropfen; Sommer selten heiß, mit Pilzen und Farnen; Herbst mit Laubfall und Stürmen; Winter frostarm, aber windig und nass. Nebel tritt besonders morgens und nach Regenfronten auf.

**Boden und Krautschicht:** Flacher Rohhumus, Torf, saure Braunerde, Moos, Farn, Heidekraut, Sauerklee, Pilze. Der Boden ist nährstoffarm und stark von der Luftfeuchte abhängig. Trockenperioden wirken überraschend stark, weil die Arten nicht an tiefe Wurzeln angepasst sind.

**Nutzung:** Holz, Brennholz, Holzkohle, Moos, Flechten, Pilze, Honig, Wild, Heilpflanzen. Flechten sind empfindlich gegen Luftverschmutzung und können als Frühwarnsystem für Rauch und Industrie dienen. Die geringe Wuchshöhe macht den Einschlag billig, den Ertrag aber klein.

**Fauna:** Rotwild, Reh, Wildschwein, Baummarder, Fuchs, Eule, Rabe, Specht, Frosch, Schnecke, Moosmilbe. Die feuchte Krautschicht ist ein Laich- und Rückzugsraum; Trockenheit reduziert die Amphibienpopulation.

**Störungen und Sukzession:** Sturm, Salzspray, Frosttrocknis, Schädlingsbefall, selten Feuer. Windwurf schafft kleine bis mittlere Lücken; die Regeneration über Buche, Eiche und Stechpalme ist langsam. Salz beeinflusst die Baumgrenze und die Artenzusammensetzung.

**Spielerfahrung:** Der Nebel liefert Wasser, senkt aber Sicht, Moral und Reisegeschwindigkeit. Der Spieler kann Moos und Flechten als Spezialgüter ernten, muss aber die empfindlichen Bestände schonen. Windschutz und Entwässerung sind echte Baumaßnahmen; falsche Drainage zerstört den Standort.

**Abgrenzung:** 002 ist niederschlagsreicher und strukturell höher; 029 ist wärmer, milder und lorbeerdominiert; 016/017 sind die nebelreichen Nadelbaum-Küstenwälder Nordamerikas. 003 ist der kühl-atlantische Laub-/Mischwald mit Salz- und Windsignatur.

**Abnahme:** Nebel erhöht die Bodenfeuchte messbar; Salz beeinflusst die Artenzusammensetzung; Flechten reagieren auf Rauch; ein Sturm erzeugt eine sichtbare Lücke; 390-px-Darstellung zeigt Nebel, Moos und Kronenlinie klar.

#### 1.2.23.1.004 — Mediterraner Hartlaubwald

**Kurzprofil:** Ein immergrüner, ledrig-blättriger Wald mit trockenem Sommer, mildem Winter und hoher Feueranpassung. Er ist niedriger und lichter als der gemäßigte Laubwald, aber keine bloße Macchia: geschlossene Hartlaubwälder bilden echte Kronendächer und alte, knorrige Stämme.

**Standort:** Warm, sommertrocken, winterfeucht; Temperatur 0,60–0,78; Feuchtigkeit 0,28–0,52; Küstennähe oder warme Becken; flache, steinige Kalk- oder Silikatböden, Terra rossa, stark erodiert. Salzspray an der Küste, Trockenstress im Sommer.

**Bestand und Struktur:** Zwei Schichten. Im Dach Stein- und Korkeiche, Aleppo- und Seestrandkiefer, Erdbeerbaum, Ölbaum; darunter Mastixstrauch, Zistrose, Ginster, Lavendel. Dichte 0,45–0,72; die Kronen sind breit und oft knorrig. Licht am Boden ist hoch; Totholz ist trocken und bleibt lange stehen.

**Artenpalette:** *Quercus ilex*, *Q. suber*, *Pinus halepensis*, *P. pinaster*, *Arbutus unedo*, *Olea europaea*, *Pistacia lentiscus*, *Cistus* spp., *Lavandula stoechas*, *Thymus* spp.

**Jahreslauf:** Winter mit Regen und grüner Krautschicht; Frühling mit Blüte und Insekten; Sommer mit Hitze, Trockenstress, Harzfluss und Feuergefahr; Herbst mit Regen, Pilzen und erneuter Blüte. Laub bleibt überwiegend immergrün, Korkeiche und einige Sträucher werfen zeitweise Blätter.

**Boden und Krautschicht:** Flachgründig, steinig, kalkreich oder sauer, oft von Erosion betroffen. Krautschicht: Thymian, Rosmarin, Lavendel, Zistrose, Gräser, Zwiebelpflanzen. Der Boden speichert wenig Wasser; Mulch und Stein bedecken große Flächen.

**Nutzung:** Kork, Steineiche-Mast, Pinienkerne, Harz, Oliven, Honig, Kräuter, Holzkohle, Feuerholz, Wild. Kork ist ein nachwachsendes Spezialgut mit langer Ernteperiode; unsachgemäße Ernte schädigt den Baum. Feuerholz ist knapp und wertvoll.

**Fauna:** Wildschwein, Reh, Kaninchen, Hase, Fuchs, Steinadler, Mäusebussard, Eidechse, Zikade, Gottesanbeterin, Bienen. Reptilien und Insekten sind artenreich; Amphibien fehlen weitgehend.

**Störungen und Sukzession:** Feuer, Dürre, Erosion, Beweidung, Korkernte. Viele Arten resprouten nach Feuer; Pinien öffnen ihre Zapfen. Wiederholte Brände können den Wald in Macchia oder Grasland verwandeln. Regeneration ist schnell im ersten Jahr, langsam im Kronenschluss.

**Spielerfahrung:** Der Spieler bewirtschaftet einen wasserarmen, feuergefährlichen Wald. Kork und Pinienkerne sind wertvoll, aber die Ernte ist saisonal und der Bestand empfindlich. Feuerpausen, Beweidungsmanagement und Wasserstellen sind zentrale Entscheidungen. Ein Brand kann in einer Nacht mehr zerstören als Jahre der Übernutzung.

**Abgrenzung:** 018 ist der Eukalyptuswald mit anderer Feueranpassung und anderer Artenpalette; 022 ist der trockenere Dornwald ohne geschlossene Hartlaubkrone; 005 ist sommergrün und niederschlagsreicher. 004 ist der echte mediterrane Hartlaubwald.

**Abnahme:** Der Typ ist an warme, sommertrockene Küsten-/Beckenstandorte gebunden; Kork, Mast und Harz sind saisonal verfügbar; Feuer breitet sich schneller aus als im Laubwald; resproutende Arten erscheinen nach dem Brand; das Panel unterscheidet 004 klar von 022.

#### 1.2.23.1.005 — Sommergrüner Laubmischwald

**Kurzprofil:** Der klassische gemäßigte Laubwald mit voller Sommerkrone, nährstoffreichem Boden, reicher Mast und ausgeprägtem Jahreszeitenwechsel. Er ist der spielerische „Normalfall“, an dem sich die anderen Typen messen lassen müssen.

**Standort:** Gemäßigt, 0,45–0,64 Temperatur, 0,50–0,72 Feuchtigkeit, tiefgründige Braunerde, Mull, gute Wasserhaltefähigkeit; Flachland bis untere Hänge. Kein dauerhafter Frost, keine lange Trockenheit.

**Bestand und Struktur:** Zwei bis drei Schichten. Eiche, Buche, Esche, Ahorn, Linde, Ulme, Hainbuche; Hasel und Holunder im Unterwuchs; Frühjahrsblüher vor dem Laubaustrieb. Dichte 0,70–0,88; Kronendach im Sommer geschlossen, im Winter offen. Alte Bäume, Höhlen und Totholz sind vorhanden, aber weniger extrem als im Urwald.

**Artenpalette:** *Quercus robur*, *Q. petraea*, *Fagus sylvatica*, *Fraxinus excelsior*, *Acer pseudoplatanus*, *Tilia cordata*, *Ulmus glabra*, *Carpinus betulus*, *Corylus avellana*, *Anemone nemorosa*, *Allium ursinum*.

**Jahreslauf:** Frühling mit Blüte, frischem Grün und Bodenkräutern; Sommer mit geschlossenem Dach, Mastansatz und Insekten; Herbst mit Laubfärbung, Eicheln, Bucheckern und Pilzen; Winter mit kahler Krone, Totholz und Schnee. Die Bodenvegetation hat ein deutliches Frühlingsfenster.

**Boden und Krautschicht:** Braunerde, Mull, Regenwürmer, Laubstreu, Frühjahrsblüher, Farn, Sauerklee, Waldmeister. Der Boden ist fruchtbar und regeneriert schneller als in Nadelwäldern. Verdichtung durch Fahrzeuge und Vieh ist ein reales Risiko.

**Nutzung:** Hochwertiges Laubholz, Furnier, Brennholz, Holzkohle, Mast für Schweine, Pilze, Bienenhonig, Kräuter, Wild. Die Vielfalt erlaubt viele kleine Betriebe; der Wald ist der wirtschaftliche Standardfall.

**Fauna:** Rothirsch, Reh, Wildschwein, Fuchs, Dachs, Baummarder, Eichhörnchen, Eule, Specht, Singvögel, Fledermaus, Käfer, Schmetterling. Die Mast beeinflusst Wildschwein- und Mäusepopulationen im Folgejahr.

**Störungen und Sukzession:** Windwurf, Trockenheit, Verbiss, Holzeinschlag, selten Feuer. Lücken schließen sich über Esche, Ahorn, Birke und Brombeere; Buche und Eiche brauchen länger. Die Sukzession ist gutmütig, aber nicht beliebig schnell.

**Spielerfahrung:** Der Typ ist der zugänglichste und vielseitigste Wald. Der Spieler kann auf Holz, Mast, Honig oder Erholung setzen und mehrere Strategien kombinieren. Der Preis dafür ist, dass er keine extreme Nische bedient; Spezialisierung auf andere Typen kann lukrativer sein.

**Abgrenzung:** 005 ist der regionale Dachtyp für den sommergrünen Mischwald. 006 ist der buchendominierte Sonderfall, 007 der eichen-hainbuchenreiche Sonderfall, 008 der Auenwald. Die bestehende Formation `mixed` bleibt die kleinräumige Ausprägung; 005 liefert die Regionskulisse und die Standard-Erwartung.

**Abnahme:** Alle vier Jahreszeiten sind klar unterscheidbar; Mast und Frühjahrsblüher erscheinen in den richtigen Fenstern; die Ressourcenpalette umfasst mindestens Holz, Mast, Honig und Wild; die Erholungs- und Biodiversitätswerte liegen über den Nadelwaldtypen; ein Save/Load-Zyklus bleibt identisch.

#### 1.2.23.1.006 — Reiner Buchenwald

**Kurzprofil:** Ein von der Rotbuche dominierter, schattiger Wald mit glatten, hellen Stämmen und einem geschlossenen Sommerdach. Im Winter ist er auffallend offen und durch die silbergrauen Stämme und die kupferfarbene Laubstreu erkennbar.

**Standort:** Gemäßigt, kühl-feucht; Temperatur 0,40–0,58; Feuchtigkeit 0,50–0,72; nährstoffreiche bis mäßig saure Braunerde, Löss, Lehm oder Kalkverwitterung. Die Buche verträgt Schatten besser als die meisten Konkurrenten, aber keine dauerhafte Staunässe.

**Bestand und Struktur:** Eine dominante Kronenschicht, darunter kaum Strauchwerk. Buchenanteil 65–88 %, beigemischt Eiche, Esche, Ahorn, Ulme und Hainbuche. Dichte 0,82–0,95; das Kronendach ist im Sommer fast geschlossen. Die Stämme sind zylindrisch, glatt und oft bis in die Krone astfrei. Totholz und Höhlen entstehen vor allem in alten Beständen.

**Artenpalette:** *Fagus sylvatica* 65–88 %, *Quercus petraea* 5–12 %, *Fraxinus excelsior* 3–8 %, *Acer pseudoplatanus* 2–6 %, *Carpinus betulus* 2–5 %. Boden: *Luzula luzuloides*, *Melica uniflora*, *Asperula odorata*, *Poa nemoralis*, *Mycelis muralis*; Frühjahrsblüher nur in lichten Phasen.

**Jahreslauf:** Frühjahr mit durchscheinendem, frischem Grün; Sommer mit dunklem, geschlossenem Dach; Herbst mit goldbrauner Färbung und starker Laubstreu; Winter mit nackten Kronen und gut sichtbarer Stammstruktur. Mastjahre treten unregelmäßig auf und prägen Wild und Schweinehaltung.

**Boden und Krautschicht:** Mull oder Moder, je nach Ausgangsgestein; flache Wurzelteller, Laubstreu, Pilze, Moos und wenige Kräuter. Die Streu zersetzt sich gut, aber der Boden kann bei Befahrung verdichten. Auf flachgründigen Hängen ist Erosion möglich.

**Nutzung:** Buchenholz für Möbel, Werkzeug, Parkett und Bahnschwellen; Brennholz und Holzkohle; Bucheckern als Mast; Pilze; Wild. Der hohe Schattenwurf macht den Wald für Weide und Feldfrüchte ungeeignet, aber für Hochwaldwirtschaft sehr wertvoll.

**Fauna:** Reh, Rothirsch, Wildschwein, Eichhörnchen, Baummarder, Fuchs, Waldkauz, Buntspecht, Singvögel, Käfer, Schmetterlinge. Mastjahre lassen Wildschwein- und Mäusepopulationen ansteigen; das muss sich in Jagd und Schäden niederschlagen.

**Störungen und Sukzession:** Windwurf, Trockenheit, Buchenrindenkrankheit, Verbiss und Holzeinschlag. In Lücken etablieren sich Esche, Ahorn, Birke und Brombeere; die Buche dominiert später wieder. Auf exponierten Standorten kann ein Sturm ganze Bestände flächig werfen.

**Spielerfahrung:** Der Buchenwald ist ein verlässlicher Holzlieferant, aber artenarm und dunkel. Der Spieler muss entscheiden, ob er die geschlossene Krone für maximalen Holzertrag erhält oder durch Durchforstung Licht für Biodiversität, Mast und Erholung schafft. Eine reine Buchenmonokultur ist ertragreich, aber anfällig gegen Sturm und Trockenheit.

**Abgrenzung:** 005 ist der artenreiche sommergrüne Mischwald; 007 ist der eichen-hainbuchenreiche Niederungswald; 006 ist die buchendominierte Regionalausprägung. Die bestehende Formation `beechwood` bleibt die kleinräumige Basis, wird aber um Regionalmetadaten, Mastjahre und die Buchenrindenkrankheit ergänzt.

**Abnahme:** Buchenanteil und Kronenschluss sind im Bestand nachweisbar; Mastjahre verändern Wildbestand und Schweinehaltung; Durchforstung erhöht Licht und Krautschicht; Sturm erzeugt eine echte Lücke; die Artenzahl bleibt unter 005, aber die Holzqualität darüber.

#### 1.2.23.1.007 — Eichen-Hainbuchenwald

**Kurzprofil:** Ein nährstoffreicher Niederungswald mit breiten Eichenkronen über einem dichten Unterbau aus Hainbuche, Hasel und Linde. Er ist der klassische Wald der Niederwald- und Mittelwaldwirtschaft: Eichen liefern Starkholz, Hainbuche liefert Brennholz und Werkzeugstiele.

**Standort:** Gemäßigt, sommerwarm bis kühl; Temperatur 0,46–0,62; Feuchtigkeit 0,55–0,74; tiefgründige Lehm-, Ton- und Lössböden, periodisch staunass, aber nicht dauerhaft überflutet. Flachland und untere Hänge, oft in Flussnähe.

**Bestand und Struktur:** Zwei Schichten. Oberstand aus alten Eichen, darunter Hainbuche, Linde, Feldahorn, Hasel und junge Eiche. Dichte 0,65–0,82; im Frühjahr blüht der Boden, im Sommer schließt sich die Krone. Die Hainbuche bildet einen dichten, schnittverträglichen Unterbau; ohne Nutzung entsteht ein fast undurchdringlicher Schatten.

**Artenpalette:** *Quercus robur* 30–48 %, *Carpinus betulus* 20–35 %, *Tilia cordata* 8–15 %, *Acer campestre* 5–10 %, *Corylus avellana* 5–12 %, *Quercus petraea* 3–8 %. Boden: *Anemone nemorosa*, *Ranunculus ficaria*, *Stellaria holostea*, *Pulmonaria officinalis*, *Primula elatior*.

**Jahreslauf:** Frühling mit auffälliger Bodenblüte vor dem Laubschluss; Sommer mit dichtem Dach und Mastansatz; Herbst mit Eicheln, Haselnüssen und Laubfärbung; Winter mit offener Krone und sichtbarem Niederwald. Eichelmast und Haselnussertrag schwanken stark zwischen Jahren.

**Boden und Krautschicht:** Nährstoffreicher Mull, zeitweise Staunässe, Regenwürmer, Frühjahrsblüher, Gräser und Kräuter. Die Bodenfruchtbarkeit ist hoch; Verdichtung und Überweidung sind die wichtigsten Schäden. Ein Teil des Jahres ist der Boden wassergesättigt, im Sommer trocknet er oberflächlich aus.

**Nutzung:** Eichenstarkholz, Hainbuchen-Werkholz, Brennholz, Holzkohle, Haselnüsse, Eichelmast, Wild, Pilze, Frühjahrsblüher als Erholungswert. Die Nieder- und Mittelwaldwirtschaft erzeugt eine charakteristische Stockausschlag-Struktur.

**Fauna:** Reh, Rothirsch, Wildschwein, Haselmaus, Siebenschläfer, Eichhörnchen, Fuchs, Waldkauz, Grünspecht, Mittelspecht, Käfer, Schmetterling. Alte Eichen mit Höhlen sind Schlüsselbäume für Fledermäuse und Höhlenbrüter.

**Störungen und Sukzession:** Niederwaldbetrieb, Beweidung, Sturm, Trockenheit, Eichenfraß und Verbiss. Ohne Nutzung wächst die Hainbuche hoch und verdrängt die Eiche; mit regelmäßigem Auf-den-Stock-Setzen bleibt die Eiche konkurrenzfähig. Die Sukzession ist stark managementabhängig.

**Spielerfahrung:** Der Spieler betreibt echte Waldwirtschaft: Eichen als Langzeitkapital, Hainbuchen als schnell nachwachsenden Betriebsstoff. Er kann auf Niederwald, Mittelwald oder Hochwald umstellen; jede Entscheidung verändert Licht, Artenvielfalt und Erträge über Jahrzehnte. Schweinehaltung im Mastjahr ist eine lukrative Kopplung.

**Abgrenzung:** 005 ist der allgemeine Laubmischwald; 006 ist buchendominiert; 007 ist der eichen-hainbuchenreiche Niederungswald. Die bestehende Formation `coppice-with-standards` beschreibt eine Bewirtschaftungsform, nicht den Regionaltyp; 007 kann diese Bewirtschaftung tragen, bleibt aber ökologisch eigenständig.

**Abnahme:** Eiche und Hainbuche sind gemeinsam nachweisbar; Stockausschlag und Eicheln folgen der Bewirtschaftung; ohne Nutzung gewinnt die Hainbuche sichtbar die Oberhand; Frühjahrsblüher erscheinen vor dem Laubschluss; die Holzerträge unterscheiden sich von 006.

#### 1.2.23.1.008 — Auenwald

**Kurzprofil:** Ein dynamischer Wald entlang großer Flüsse, geprägt von periodischen Überflutungen, frischem Alluvium und einem Mosaik aus Weiden, Pappeln, Eschen, Eichen und Altwassern. Er ist kein ruhiger Wald, sondern ein jährlich neu verhandelter Standort.

**Standort:** Gemäßigt bis warmgemäßigt; Temperatur 0,44–0,66; Feuchtigkeit 0,70–0,92; Flussniederung, Grundwasseranschluss, periodische Überflutung; tiefgründige Schluff-, Sand- und Tonablagerungen. Die Überflutungsdauer ist der entscheidende Standortfaktor.

**Bestand und Struktur:** Ein Mosaik aus Pionierweiden und -pappeln auf jungen Kiesbänken, Eschen, Eichen und Ulmen auf höheren Terrassen, Altwassern, Röhrichten und Feuchtwiesen. Dichte 0,55–0,80; die Krone ist unregelmäßig, häufig lückig. Lianen wie Hopfen und Waldrebe verbinden die Schichten.

**Artenpalette:** *Salix alba*, *S. fragilis*, *Populus nigra*, *P. alba*, *Quercus robur*, *Fraxinus excelsior*, *Ulmus laevis*, *Alnus glutinosa*, *Humulus lupulus*, *Phalaris arundinacea*, *Iris pseudacorus*.

**Jahreslauf:** Winter mit Hochwasser, Eisgang und Überschwemmung; Frühling mit Rückzug des Wassers, frischem Austrieb und Laich; Sommer mit üppiger Vegetation, hohem Grundwasser und Insekten; Herbst mit Laubfall, Pilzen und erneuter Feuchte. Hochwasser kann das ganze Jahr über auftreten, ist aber im Winter/Frühjahr am wahrscheinlichsten.

**Boden und Krautschicht:** Frisches Alluvium, Schluff, Sand, Ton, hoher Grundwasserstand, nährstoffreich. Krautschicht: Röhricht, Seggen, Brennnessel, Mädesüß, Springkraut. Der Boden ist jung und ständig in Bewegung; Erosion und Sedimentation sind normale Prozesse.

**Nutzung:** Weich- und Hartholz, Weidenruten, Brennholz, Heu, Fisch, Wild, Beeren, Heilpflanzen. Die Aue ist landwirtschaftlich attraktiv, aber hochwassergefährlich. Weidenkulturen liefern Fasern für Körbe und Flechtwerk; der Auwald filtert Nährstoffe und speichert Hochwasser.

**Fauna:** Biber, Otter, Reiher, Eisvogel, Wasseramsel, Frosch, Libelle, Stechmücke, Fisch, Wildschwein, Reh. Die Überschwemmung schafft Laichplätze und Totholz; Trockenfallen zerstört sie.

**Störungen und Sukzession:** Hochwasser, Eisgang, Erosion, Sedimentation, Trockenheit, Holzeinschlag. Pioniere besiedeln neue Kiesbänke; Hartholzarten folgen auf höheren Terrassen. Die Sukzession wird immer wieder zurückgesetzt; ein statisches „Klimaxstadium“ gibt es hier nicht.

**Spielerfahrung:** Der Auenwald ist fruchtbar, aber riskant. Der Spieler muss Siedlungen und Felder auf höhere Terrassen legen, Deiche und Entwässerung planen und den Hochwasserzyklus respektieren. Weidenruten und Fisch sind wertvoll; eine falsche Deichlinie kann das ganze Tal verändern.

**Abgrenzung:** 009 ist der dauerhaft nasse Bruchwald ohne regelmäßige Überflutung; 023 ist der Galeriewald im Trockenland; die bestehende Formation `alluvial` ist die kleinräumige Basis. 008 ist der große Flussauen-Dachtyp mit Hochwasser- und Sedimentdynamik.

**Abnahme:** Hochwasser verändert Bodenfeuchte und erreichbare Flächen; Pionierarten erscheinen auf jungen Sedimenten; Biber und Fisch reagieren auf Wasserstände; Deiche und Drainage verändern den Typ nachvollziehbar; ein Save/Load-Zyklus erhält die Auenstruktur.

#### 1.2.23.1.009 — Bruchwald

**Kurzprofil:** Ein dauerhaft nasser, oft von Erlen und Weiden dominierter Wald auf torfigem oder gleyartigem Boden. Das Wasser steht nicht immer offen über der Oberfläche, aber der Boden ist ganzjährig gesättigt und von schwarzem Schlamm, Bulten und Moospolstern geprägt.

**Standort:** Gemäßigt bis kühl; Temperatur 0,38–0,58; Feuchtigkeit über 0,84; Klima `swamp` oder grundwassernahe Senken; Gley, Niedermoor, Torf, nährstoffreich bis mäßig sauer. Keine regelmäßige Strömung, aber ein hoher, stabiler Wasserstand.

**Bestand und Struktur:** Erle und Weide dominieren, Birke und Faulbaum treten hinzu; die Kronen sind locker bis halboffen. Dichte 0,55–0,75. Der Boden ist ein Mosaik aus Bulten, Schlenken, Wurzeltellern und offenen Wasserflächen. Totholz ist wassergesättigt und bleibt lange erhalten.

**Artenpalette:** *Alnus glutinosa* 35–55 %, *Salix cinerea* 15–30 %, *Betula pubescens* 5–15 %, *Frangula alnus* 3–8 %, *Carex* spp., *Sphagnum* spp., *Iris pseudacorus*, *Menyanthes trifoliata*.

**Jahreslauf:** Frühjahr mit hohem Wasserstand, Erlenkätzchen und erstem Grün; Sommer mit dichter Krautschicht, Mücken und Libellen; Herbst mit Erlenzapfen, Laubfall und Pilzen; Winter mit Eis, offenen Wasserlöchern und kahlen Kronen. Der Wasserstand schwankt, fällt aber selten tief.

**Boden und Krautschicht:** Gley, Niedermoor, Torf, Schlamm, Sauerstoffmangel, hoher Grundwasserstand. Krautschicht: Seggen, Schilf, Iris, Moos, Farn, Sauerklee. Der Boden ist trittempfindlich und für schwere Fahrzeuge ungeeignet.

**Nutzung:** Erlenholz (wasserfest), Weidenruten, Brennholz, Torf, Schilf, Heu, Wild, Fisch, Beeren, Heilpflanzen. Erle bindet Stickstoff und verbessert den Boden; eine Entwässerung verändert den Standort radikal.

**Fauna:** Biber, Otter, Fuchs, Reh, Wildschwein, Reiher, Bekassine, Frosch, Molch, Libelle, Stechmücke, Schnecke. Der Bruchwald ist ein wichtiger Laich- und Rastplatz; Trockenlegung vertreibt die Amphibien.

**Störungen und Sukzession:** Entwässerung, Überflutung, Windwurf, Torfabbau, Brennholzeinschlag. Ohne Eingriff bleibt der Bruchwald stabil; nach Drainage wandert er in Richtung Bruch-/Feuchtwald, nach Wiedervernässung zurück. Die Regeneration ist langsam, aber robust.

**Spielerfahrung:** Der Spieler kann den Bruchwald für wasserfestes Erlenholz und Brennstoff nutzen, muss aber die Entwässerung beherrschen. Drainage schafft kurzfristig Land, zerstört aber den Standort und erhöht spätere Überschwemmungsgefahr. Wiedervernässung ist teuer, aber langfristig lohnend.

**Abgrenzung:** 008 ist der periodisch überflutete Auenwald mit Strömung und Sediment; 010 ist der saure, ombrotrophe Moorwald; 009 ist der nährstoffreichere, dauerhaft nasse Bruchwald. Die bestehende Formation `swamp-carr` bleibt die Basis, wird aber um Wasserstands- und Drainagezustände erweitert.

**Abnahme:** Der Wasserstand ist ganzjährig hoch; Erle und Weide dominieren; Drainage verändert Arten und Boden nachvollziehbar; Amphibien und Biber reagieren auf den Wasserstand; die Karte zeigt Bulten, Schlenken und offenes Wasser.

#### 1.2.23.1.010 — Moorwald

**Kurzprofil:** Ein saurer, nährstoffarmer Wald auf tiefem Torf, mit verkümmerten Kiefern, Birken und Fichten, offenen Moorschlenken und einem Boden, der Wasser und Kohlenstoff speichert. Er ist kein nasser Nadelwald, sondern ein eigener, extrem langsamer Lebensraum.

**Standort:** Kühl-gemäßigt bis boreal; Temperatur 0,28–0,50; Feuchtigkeit über 0,78; Hochmoor, Niedermoorrand, wasserstauende Deckschichten; pH sauer, Nährstoffe sehr knapp, Torf tief. Kein Grundwasseranschluss im Hochmoor, aber ganzjährige Sättigung durch Regen.

**Bestand und Struktur:** Lückiger, niedriger Bestand aus Kiefer, Birke und Fichte; dazwischen offene Torfmoosflächen, Schlenken und Zwergsträucher. Dichte 0,25–0,55; die Bäume sind oft krumm, kurz und langsamwüchsig. Totholz bleibt durch die Nässe und Kälte sehr lange erhalten.

**Artenpalette:** *Pinus sylvestris* (Moorform) 25–45 %, *Betula pubescens* 20–35 %, *Picea abies* 5–20 %, *Vaccinium uliginosum*, *V. oxycoccos*, *Sphagnum* spp., *Eriophorum vaginatum*, *Drosera rotundifolia*, *Andromeda polifolia*.

**Jahreslauf:** Frühjahr mit tauendem Torf, offenen Wasserflächen und ersten Insekten; Sommer mit Wollgras, Sonnentau und Cranberries; Herbst mit Torfmooswachstum und Beerenernte; Winter mit Schnee, Eis und sehr langsamer Zersetzung. Das Wachstum ist in jedem Jahrzehnt kaum sichtbar.

**Boden und Krautschicht:** Tiefe Torfschichten, anaerobe Bedingungen, niedriger pH, geringe Nährstoffverfügbarkeit. Krautschicht: Torfmoos, Wollgras, Sonnentau, Rosmarinheide, Cranberry, Moosbeere. Der Boden speichert enorme Wassermengen und reagiert empfindlich auf Drainage.

**Nutzung:** Torf als Brennstoff, Kiefern- und Birkenholz, Cranberries, Moltebeeren, Heilpflanzen, Wild. Torfabbau ist attraktiv, aber praktisch irreversibel; die Wiedervernässung braucht Jahrzehnte. Der Moorwald ist zudem ein wichtiger Kohlenstoffspeicher.

**Fauna:** Kranich, Bekassine, Brachvogel, Moorschneehuhn (regional), Kreuzotter, Libelle, Moorfrosch, Elch, Fuchs. Die offenen Schlenken sind Laichplätze; Entwässerung zerstört sie schnell.

**Störungen und Sukzession:** Torfabbau, Entwässerung, Brand (auch unterirdisch schwelend), Windwurf, Klimaerwärmung. Die Regeneration ist extrem langsam; ein abgetorfter Stand regeneriert über Jahrhunderte, nicht über Jahrzehnte. Feuer im Torf ist schwer zu löschen und hinterlässt tiefe Narben.

**Spielerfahrung:** Der Spieler steht vor der klassischen Ressourcenfalle: Torf und Holz sind verlockend, aber der Standort ist nur einmal vorhanden. Eine nachhaltige Strategie nutzt Beerenernte, Jagd und schonende Einzelentnahme; eine kurzfristige Strategie zerstört Wasserhaushalt und Biodiversität. Das Spiel muss diese Entscheidung sichtbar und teuer machen.

**Abgrenzung:** 009 ist nährstoffreicher und wird von Erle/Weide dominiert; 010 ist sauer, torfbildend und von Kiefer/Birke geprägt. Die bestehende Formation `wet-conifer` beschreibt feuchten Nadelwald, nicht das ombrotrophe Moor. 010 braucht eigene Torf-, Wasserstands- und Regenerationswerte.

**Abnahme:** Torf und Wasserstand sind echte Standortwerte; Torfabbau senkt den Wasserstand und verändert die Arten; Wiedervernässung braucht eine definierte, lange Zeit; ein Moorbrand breitet sich anders aus als ein Kronenfeuer; die Karte zeigt offene Schlenken und niedrige Moorbäume.

### 4.2 Nährstoffarme, montane und subalpine Wälder

#### 1.2.23.1.011 — Kiefern-Birkenwald

**Kurzprofil:** Ein lichter, armer Sandwald aus Kiefern und Birken mit Heidekraut, Flechten und offenen Rohböden. Er wirkt zunächst karg, ist aber ein wichtiger Lebensraum für spezialisierte Vögel, Insekten und Flechten.

**Standort:** Kühl-gemäßigt bis südlich-boreal; Temperatur 0,34–0,56; Feuchtigkeit 0,32–0,56; sandige, kiesige oder podsolisierte Böden, nährstoffarm, schnell drainierend. Oft auf Sanderflächen, Dünenrändern, Moränen und trockenen Hängen.

**Bestand und Struktur:** Eine lichte Kiefernkrone über Birken, Wacholder und einzelnen Eichen; darunter Heidekraut, Blaubeere, Flechten und Rohboden. Dichte 0,38–0,64; die Stämme sind hoch und astfrei, die Kronen beginnen erst weit oben. Totholz ist sonnenexponiert und trocken; liegende Stämme verrotten langsam.

**Artenpalette:** *Pinus sylvestris* 40–62 %, *Betula pendula* 18–30 %, *B. pubescens* 5–12 %, *Juniperus communis* 3–8 %, *Quercus robur* 2–6 %, *Sorbus aucuparia* 2–4 %. Boden: *Calluna vulgaris*, *Vaccinium myrtillus*, *V. vitis-idaea*, *Cladonia* spp., *Pleurozium schreberi*, *Deschampsia flexuosa*.

**Jahreslauf:** Frühjahr mit Birkengrün und erstem Insektenflug; Sommer mit trockenem, hellem Boden und Beerenernte; Herbst mit Birken- und Lärchengold, Pilzen und Samen; Winter mit offener Struktur, Schnee und gut sichtbaren Stämmen. Die Krautschicht ist im Winter nicht vollständig bedeckt.

**Boden und Krautschicht:** Podsol, Sand, Kies, sauer, nährstoffarm, geringe Wasserhaltefähigkeit. Krautschicht: Heidekraut, Drahtschmiele, Flechten, Blaubeere, Preiselbeere, Kiefern-Jungwuchs. Der Boden ist empfindlich gegen Tritt, Befahrung und Erosion.

**Nutzung:** Kiefernholz, Birkenschälholz, Brennholz, Holzkohle, Teer und Pech (historisch), Pilze, Beeren, Wild, Honig, Weide für Schafe und Bienen. Die Erträge sind pro Hektar niedrig, aber die Bewirtschaftung ist billig und die Regeneration vergleichsweise schnell.

**Fauna:** Auerhuhn, Birkhuhn, Ziegenmelker, Baummarder, Eichhörnchen, Fuchs, Kreuzotter, Waldameise, Borkenkäfer, Schmetterlinge. Offene Sandflächen sind wichtige Sonnen- und Nistplätze; eine vollständige Kronenschließung vertreibt sie.

**Störungen und Sukzession:** Feuer, Trockenheit, Nährstoffeintrag, Kahlschlag, Beweidung. Nach Feuer kehren Birke und Kiefer schnell zurück; ohne Störung schließt sich die Krone und die Heide verschwindet. Die Sukzession ist schnell, aber artenarm; Licht ist die entscheidende Ressource.

**Spielerfahrung:** Der Spieler bekommt einen billigen, robusten Wald, der aber wenig pro Fläche liefert. Er kann ihn als Brennholzreserve, für Bienenweide oder als Jagdrevier nutzen. Eine zu starke Aufforstung oder Nährstoffzufuhr zerstört die offene Heide und damit die spezialisierten Arten; das ist ein sichtbarer Zielkonflikt.

**Abgrenzung:** 001 ist die boreale Taiga mit geschlossener Fichtenkrone und Permafrostnähe; 012 ist der feuchte Fichten-Tannenwald; 013 ist lärchendominiert. 011 ist der lichte Kiefern-Birken-Sandwald der gemäßigten und südlich-borealen Zone. Die bestehenden Formationen `pine-heath` und `birchwood` bleiben die kleinräumigen Ausprägungen.

**Abnahme:** Kiefer und Birke dominieren gemeinsam; Heide und Flechten sind bei offener Krone sichtbar; Feuer führt zu Birkensukzession; Kahlschlag und Nährstoffeintrag verändern die Krautschicht; Auerhuhn und Ziegenmelker reagieren auf die Offenheit.

#### 1.2.23.1.012 — Fichten-Tannenwald

**Kurzprofil:** Ein dunkler, feuchter Nadelwald der kühlen Mittelgebirge, in dem Fichte und Tanne die Krone bilden und Moos, Farne und Nadelstreu den Boden bedecken. Er ist die produktive, aber störungsanfällige Nadelwaldregion der feuchten Berglagen.

**Standort:** Kühl, niederschlagsreich; Temperatur 0,32–0,52; Feuchtigkeit 0,58–0,80; Höhenlage etwa 0,42–0,76; tiefgründige, saure Braunerde, Podsol, Blocklehm. Staunässe ist möglich, aber kein dauerhaftes Moor.

**Bestand und Struktur:** Zwei bis drei Schichten. Fichte und Tanne bilden die Hauptkrone, Buche und Bergahorn sind beigemischt; Vogelbeere und Jungfichten stehen in Lücken. Dichte 0,78–0,92; die Kronen sind dicht, die Stämme lang und gerade. Totholz und Moderholz sind reichlich vorhanden, werden aber durch Forstwirtschaft oft reduziert.

**Artenpalette:** *Picea abies* 35–55 %, *Abies alba* 20–40 %, *Fagus sylvatica* 5–15 %, *Acer pseudoplatanus* 3–8 %, *Sorbus aucuparia* 2–5 %. Boden: *Oxalis acetosella*, *Vaccinium myrtillus*, *Dryopteris* spp., *Rhytidiadelphus*, *Bazzania*, *Amanita* und *Boletus*.

**Jahreslauf:** Ganzjährig grün, aber im Frühjahr mit frischen Trieben und Vogelgesang; Sommer mit tiefem Schatten und Pilzen; Herbst mit Zapfen, Laubfall der Beimischung und erstem Schnee; Winter mit Schneelast, Sturm und eingeschränkter Forstarbeit. Tannen zeigen auffällige Zapfen in der Krone.

**Boden und Krautschicht:** Sauer, tiefgründig, humusreich, gut wasserhaltend; Nadelstreu, Moos, Farne, Sauerklee, Heidelbeere. Die Wurzeln sind flach bis herzförmig; Windwurf ist ein zentrales Risiko. Der Boden kann bei schwerer Befahrung verdichten und vernässen.

**Nutzung:** Bauholz, Möbelholz, Resonanzholz, Masten, Brennholz, Harz, Pilze, Wild. Fichten- und Tannenholz sind wertvoll, aber die Monokultur ist anfällig. Plenter- und Femelwirtschaft erhalten die Struktur besser als Kahlschlag.

**Fauna:** Reh, Rothirsch, Baummarder, Fuchs, Waldkauz, Raufußkauz, Buntspecht, Kreuzschnabel, Auerhuhn, Borkenkäfer, Ameise. Der Borkenkäfer profitiert von Trockenheit und Fichtenmonokultur; seine Massenvermehrung ist ein echtes Ereignis.

**Störungen und Sukzession:** Windwurf, Borkenkäfer, Schneebruch, Trockenheit, saure Deposition. Nach einem Windwurf folgt eine Fichten-Borkenkäfer-Kaskade; ohne Eingriff entsteht ein Mosaik aus Totholz, Jungwuchs und Restbeständen. Die Sukzession ist langsam und stark vom Ausgangsbestand abhängig.

**Spielerfahrung:** Der Spieler kann hohe Holzerträge erzielen, muss aber mit Windwurf und Borkenkäfer rechnen. Kahlschläge sind billig, erhöhen aber das Risiko; Plenterwirtschaft ist aufwendiger, stabiler und artenreicher. Die Entscheidung zwischen maximalem Kurzertrag und langfristiger Stabilität ist der Kern dieses Typs.

**Abgrenzung:** 001 ist die boreale Taiga mit langer Schneedecke, Permafrostnähe und anderen Arten; 013 ist lärchendominiert und licht; 014 ist der artenreiche Bergmischwald mit Buche und Ahorn. 012 ist der feuchte, dunkle Fichten-Tannenwald der Mittelgebirge. Die bestehenden Formationen `sprucewood` und `firwood` bleiben die kleinräumige Basis.

**Abnahme:** Fichte und Tanne sind gemeinsam nachweisbar; Borkenkäfer breitet sich nach Trockenheit und Windwurf aus; Plenterwirtschaft erhält mehr Struktur als Kahlschlag; Schneebruch erzeugt sichtbare Schäden; die Holzerträge liegen über 011, die Stabilität unter 014.

#### 1.2.23.1.013 — Lärchenwald

**Kurzprofil:** Ein luftiger, lichtdurchfluteter Nadelwald aus Lärchen, die im Herbst goldgelb werden und im Winter ihre Nadeln verlieren. Er ist der einzige große Nadelwald, der den Jahreszeitenwechsel so deutlich wie ein Laubwald zeigt.

**Standort:** Kontinental-kühl bis montan; Temperatur 0,28–0,50; Feuchtigkeit 0,38–0,62; Höhenlage 0,45–0,82; gut drainierte Braunerden, Podsole, Schutt- und Moränenböden. Lärchen sind lichtbedürftig und vertragen keine starke Beschattung.

**Bestand und Struktur:** Eine lichte Kronenschicht aus Lärche, beigemischt Zirbe, Fichte, Kiefer und Birke; darunter Wacholder, Vogelbeere und Jungwuchs. Dichte 0,42–0,66; die Kronen sind schmal und lassen viel Licht durch. Der Boden ist von Nadelstreu, Flechten, Gräsern und niedrigen Sträuchern bedeckt.

**Artenpalette:** *Larix decidua* 45–65 %, *L. sibirica* 10–20 % (regional), *Pinus cembra* 5–15 %, *Picea abies* 5–15 %, *Pinus sylvestris* 3–10 %, *Betula pendula* 3–8 %. Boden: *Vaccinium*, *Calluna*, *Cladonia*, *Deschampsia flexuosa*, *Gentiana* in höheren Lagen.

**Jahreslauf:** Frühjahr mit zartem, hellem Grün; Sommer mit dichtem, aber lichtem Nadelkleid; Herbst mit spektakulärem Gold und beginnendem Nadelabwurf; Winter mit kahlen Zweigen, Schnee und sehr klarer Kronenstruktur. Der Nadelabwurf ist ein zentrales Erkennungsmerkmal.

**Boden und Krautschicht:** Gut drainiert, oft steinig, sauer bis neutral; Nadelstreu, Flechten, Gräser, Heidekraut, Jungwuchs. Erosion ist auf steilen Hängen möglich; die Lärche ist tiefwurzelnd und relativ sturmfest.

**Nutzung:** Dauerhaftes Bau- und Möbelholz, Veneer, Masten, Brennholz, Harz, Terpentin, Pilze, Wild. Lärchenholz ist witterungsbeständig und besonders für Außenbau, Brücken und Schindeln geeignet. Die langsame Jugend macht die Umtriebszeit lang.

**Fauna:** Rothirsch, Reh, Auerhuhn, Birkhuhn, Kreuzschnabel, Eichhörnchen, Baummarder, Fuchs, Borkenkäfer, Schmetterling. Die lichte Struktur begünstigt Bodenbrüter und Insekten; dichte Jungbestände sind dagegen artenarm.

**Störungen und Sukzession:** Feuer, Lawine, Windwurf, Lärchenkrebs, Wildverbiss. Lärchen sind lichtbedürftig; ohne Störung oder Durchforstung werden sie von Fichten und Tannen verdrängt. Nach Feuer kehren Lärche und Kiefer oft als Pioniere zurück.

**Spielerfahrung:** Der Spieler erhält ein wertvolles, witterungsbeständiges Holz, muss aber lange warten und die Konkurrenz durch Schattenbaumarten kontrollieren. Der Herbst ist die optisch stärkste Jahreszeit; eine zu frühe oder zu späte Ernte verändert den Ertrag. Der Typ belohnt Geduld und gezielte Durchforstung.

**Abgrenzung:** 001 enthält Lärche nur als Beimischung der borealen Taiga; 012 ist feucht und dunkel; 015 ist die subalpine Krummholzstufe. 013 ist der lärchendominierte, helle Kontinental-/Montanwald. Die bestehende Formation `larchwood` bleibt die Basis, wird aber um Nadelabwurf, Holzqualität und Lichtbedarf erweitert.

**Abnahme:** Lärchen werfen im Herbst sichtbar Nadeln ab; die Krone ist im Winter kahl; die Lichtdurchlässigkeit ist höher als bei 012; Lärchenholz hat einen eigenen Dauerhaftigkeitswert; ohne Durchforstung gewinnen Schattenbaumarten die Oberhand.

#### 1.2.23.1.014 — Bergmischwald

**Kurzprofil:** Ein artenreicher, mehrschichtiger Wald der mittleren Bergstufe, in dem Buche, Tanne, Fichte, Bergahorn und Bergulme je nach Höhe und Exposition wechseln. Er ist der stabile, vielfältige Gegenpol zum dunklen Fichten-Tannenwald.

**Standort:** Montan, 0,48–0,84 Höhe; Temperatur 0,34–0,56; Feuchtigkeit 0,55–0,80; steile bis mäßige Hänge, wechselnde Exposition, tiefgründige bis flachgründige Braunerden, Ranker, Blockschutt. Lawinen, Rutschungen und Windwurf sind reale Standortfaktoren.

**Bestand und Struktur:** Drei Schichten: Buche und Tanne im Hauptdach, Fichte und Bergahorn in Gruppen, Bergulme und Vogelbeere in Lücken; darunter Hasel, Jungwuchs, Farne und Moos. Dichte 0,72–0,88; die Kronen sind unregelmäßig und gruppenweise aufgebaut. Totholz, Blocküberlagerung und Wurzelstöcke prägen den Boden.

**Artenpalette:** *Fagus sylvatica* 20–35 %, *Abies alba* 15–28 %, *Picea abies* 15–28 %, *Acer pseudoplatanus* 8–15 %, *Ulmus glabra* 3–8 %, *Sorbus aucuparia* 3–6 %. Boden: *Dryopteris filix-mas*, *Athyrium filix-femina*, *Oxalis*, *Mercurialis perennis*, *Prenanthes purpurea*.

**Jahreslauf:** Frühjahr mit Höhengradient: unten Laubaustrieb, oben noch Schnee; Sommer mit kühler, feuchter Luft und üppiger Krautschicht; Herbst mit Buchen- und Ahornfarben, Pilzen und ersten Schneefällen; Winter mit Schnee, Lawinengefahr und eingeschränkter Bringung. Die Höhenzonierung ist im Gelände sichtbar.

**Boden und Krautschicht:** Braunerde, Ranker, Humus, Blockschutt, wechselnd tiefgründig; Farne, Moos, Sauerklee, Bingelkraut, Hochstauden. Die Wurzeln stabilisieren Hänge; Kahlschlag erhöht Erosion und Rutschgefahr.

**Nutzung:** Mischholz, Furnier, Bauholz, Brennholz, Schutzfunktion, Pilze, Wild, Weide in lichten Lagen. Der Bergmischwald ist ein wichtiger Wasser- und Bodenschutz; seine Schutzfunktion kann wirtschaftlich mehr wert sein als der Holzertrag.

**Fauna:** Rothirsch, Reh, Gämse, Luchs, Fuchs, Baummarder, Habicht, Sperlingskauz, Schwarzspecht, Alpensalamander, Käfer. Die Vielfalt der Höhenlagen schafft Rückzugsräume; Lawinen und Schnee strukturieren die Populationen.

**Störungen und Sukzession:** Lawine, Rutschung, Windwurf, Borkenkäfer, Schneebruch, Trockenheit. Nach einer Lawine etablieren sich Pioniere und Hochstauden; nach Windwurf folgt ein Mosaik aus Brombeere, Ahorn und Jungfichte. Die Sukzession ist langsam und standortabhängig.

**Spielerfahrung:** Der Spieler bewirtschaftet einen vielseitigen, aber schwer zugänglichen Wald. Steile Hänge, Schnee und Lawinen erhöhen die Bringungskosten; Kahlschlag ist nicht nur wirtschaftlich riskant, sondern kann Siedlungen und Wasserwege gefährden. Schutz-, Nutz- und Erholungsfunktion müssen ausbalanciert werden.

**Abgrenzung:** 012 ist der feuchte, dunkle Fichten-Tannenwald; 015 ist die subalpine Krummholzstufe; 014 ist der artenreiche Bergmischwald mit Buche, Ahorn und Ulme. Die bestehende Formation `mixed-montane` bleibt die kleinräumige Basis, wird aber um Lawinen-, Erosions- und Schutzfunktionswerte erweitert.

**Abnahme:** Mindestens vier Baumarten bilden den Bestand; Höhenzonierung verändert die Artenzusammensetzung; Kahlschlag erhöht Erosion und Rutschgefahr; Lawinen erzeugen eine eigene Sukzession; die Schutzfunktion ist im Panel sichtbar und wirtschaftlich bewertet.

#### 1.2.23.1.015 — Subalpiner Wald

**Kurzprofil:** Die obere Waldstufe nahe der Baumgrenze: niedrige, windgeformte Bäume, Krummholz, offene Felsflächen und eine kurze Vegetationsperiode. Hier endet der geschlossene Wald, und jede Nutzung ist eine Grenzüberschreitung.

**Standort:** Hochmontan bis subalpin, 0,78–0,94 Höhe; Temperatur 0,20–0,40; Feuchtigkeit 0,45–0,72; flachgründige Ranker, Podsole, Schutt, Fels, periglaziale Böden. Starker Wind, Schnee, Frost und kurze Sommer begrenzen das Wachstum.

**Bestand und Struktur:** Lückiger Bestand aus Zirbe, Lärche, Fichte, Bergahorn und Vogelbeere; dazwischen Grünerle, Weide, Wacholder und Krummholz. Dichte 0,22–0,48; die Bäume sind oft mehrstämmig, gebogen und schneebedeckt. Offene Fels- und Rasenflächen wechseln mit Baumgruppen.

**Artenpalette:** *Pinus cembra* 20–40 %, *Larix decidua* 20–35 %, *Picea abies* 10–25 %, *Sorbus aucuparia* 5–10 %, *Alnus viridis* 5–15 %, *Salix* spp., *Juniperus communis*. Boden: *Vaccinium*, *Empetrum*, *Loiseleuria*, *Cladonia*, *Nardus stricta*.

**Jahreslauf:** Langer Winter mit Schnee und Lawinen; kurzer Frühling mit Schneeschmelze und raschem Austrieb; Sommer mit Bergblumen, Beeren und Insekten; Herbst mit frühem Frost, Lärchengold und Schnee. Die Vegetationsperiode ist nur wenige Monate lang.

**Boden und Krautschicht:** Flach, steinig, sauer, nährstoffarm, stark wind- und frostgeprägt. Krautschicht: Zwergsträucher, Borstgras, Flechten, Moose, Bergblumen. Der Boden ist empfindlich gegen Tritt und Erosion; eine geschlossene Pflanzendecke fehlt oft.

**Nutzung:** Schutz vor Lawinen, Rutschungen und Erosion; Brennholz in begrenztem Umfang; Weide; Beeren; Pilze; Wild; Zirbelnüsse. Der Holzertrag ist gering, die Schutzwirkung hoch. Rodung kann Lawinen in darunterliegende Siedlungen lenken.

**Fauna:** Gämse, Steinbock, Murmeltier, Schneehase, Fuchs, Steinadler, Birkhuhn, Auerhuhn, Alpendohle, Kreuzotter, Schmetterling. Die offenen Flächen sind Weide- und Sonnenplätze; Schnee und Lawinen strukturieren die Lebensräume.

**Störungen und Sukzession:** Lawine, Schneedruck, Wind, Frost, Rutschung, Weide. Die Regeneration ist extrem langsam; ein zerstörter Subalpinwald braucht Jahrhunderte. Die Baumgrenze verschiebt sich mit dem Klima, aber nicht sprunghaft.

**Spielerfahrung:** Der Spieler darf hier nur begrenzt ernten. Die wichtigste Entscheidung ist, ob er die Schutzwirkung erhält oder kurzfristig Holz gewinnt. Eine Rodung kann Lawinen und Überschwemmungen auslösen, die weit unterhalb des Waldes Schaden anrichten. Der Typ macht die ökologische Schuld sichtbar.

**Abgrenzung:** 014 ist der geschlossene Bergmischwald darunter; 015 ist die offene, windgeformte Waldgrenze. Die bestehende Formation `subalpine-scrub` bleibt die Basis, wird aber um Lawinen-, Baumgrenzen- und Schutzfunktionswerte erweitert. 001 ist die boreale Taiga, nicht die alpine Höhenstufe.

**Abnahme:** Der Bestand ist lückig und windgeformt; Lawinen und Schneedruck verändern die Struktur; Rodung erhöht die Lawinengefahr; die Baumgrenze reagiert auf Klima, aber langsam; Zirbelnüsse und Weide sind saisonal verfügbar.

### 4.3 Ozeanische Riesenwälder und feuergeprägte Trockenwälder

#### 1.2.23.1.016 — Küstenmammutbaumwald

**Kurzprofil:** Ein Küstenwald mit monumentalen, rotbraunen Mammutbäumen, die aus dem Nebel ragen und oft hunderte Jahre alt sind. Der Wald lebt von Sommernebel, tiefen Alluvialböden und einer außergewöhnlich hohen Biomasse.

**Standort:** Küstennahe Nebelzone, Temperatur 0,44–0,60, Feuchtigkeit 0,72–0,92, Höhenlage 0,20–0,58; geschützte Täler, Alluvialflächen und Unterhänge; tiefgründige, saure, humusreiche Böden. Sommernebel und Winterregen sind die entscheidenden Wasserquellen.

**Bestand und Struktur:** Eine oder zwei überragende Kronenschichten aus Mammutbaum, Douglasie und Hemlocktanne; darunter Lorbeer, Tanoak, Ahorn und eine dichte Strauchschicht aus Rhododendron, Heidelbeere und Hasel. Dichte 0,78–0,94; die Stämme sind sehr dick, rotbraun und oft hohlgebrannt. Der Boden ist von Farnen, Sauerklee und Moderholz bedeckt.

**Artenpalette:** *Sequoia sempervirens* 35–60 %, *Pseudotsuga menziesii* 10–25 %, *Tsuga heterophylla* 8–18 %, *Lithocarpus densiflorus* 5–12 %, *Umbellularia californica* 3–8 %, *Polystichum munitum*, *Oxalis oregana*, *Rhododendron macrophyllum*.

**Jahreslauf:** Winter mit starkem Regen, Hochwasser und Stürmen; Frühjahr mit frischem Farnwuchs und Vogelgesang; Sommer mit kühlem Nebel, trockenem Oberboden und kaum Regen; Herbst mit Pilzen, Laubfall der Beimischung und erstem Regen. Der Nebel hält den Wald auch im trockensten Monat am Leben.

**Boden und Krautschicht:** Tiefe Alluvial- und Hangböden, sauer, humusreich, hohe organische Substanz; Farne, Sauerklee, Moos, Pilze. Die Wurzeln erschließen tiefe Wasservorräte; Nebelwasser wird über Blätter und Zweige aufgenommen. Erosion ist nach Rodung und auf steilen Flächen ein großes Risiko.

**Nutzung:** Witterungsbeständiges Mammutbaumholz, Douglasienholz, Brennholz, Farnwedel, Pilze, Beeren, Wild. Die Bäume wachsen schnell für ihre Größe, aber die Umtriebszeit ist lang. Ein gefällter Altbaum ist ein jahrhundertealtes Kapital, das nicht kurzfristig ersetzt werden kann.

**Fauna:** Roosevelt-Elch, Schwarzwedelhirsch, Puma, Baummarder, Fleckenkauz, Marmelalk, Weißkopfseeadler, Salamander, Bananenschnecke, Käfer. Die hohlen Altstämme sind Nist- und Rückzugsräume; Rodung zerstört sie unwiederbringlich.

**Störungen und Sukzession:** Feuer mit niedriger bis mittlerer Intensität, Windwurf, Hochwasser, Hangrutsch, Holzeinschlag. Mammutbäume sind feuerresistent und können nach Verletzungen weiterleben; nach einem Brand entstehen Höhlen und offene Kronen. Die Sukzession ist langsam, aber der Bestand kann Jahrhunderte überdauern.

**Spielerfahrung:** Der Spieler bewirtschaftet einen der wertvollsten und langsamsten Wälder des Spiels. Er kann einzelne Bäume entnehmen, ohne den Bestand zu zerstören, oder flächig roden und kurzfristig Reichtum gewinnen. Der Nebel liefert Wasser, senkt aber Sicht und trocknet das Holz nicht. Der Wald ist ein Naturwunder, das sich nicht schnell ersetzen lässt.

**Abgrenzung:** 002 ist der allgemeine gemäßigte Regenwald ohne die monumentale Mammutbaum-Dominanz; 017 ist der pazifische Regenwald mit Sitka-Fichte und Hemlocktanne, aber ohne die roten Riesenstämme. 016 ist an die küstennahe Nebelzone und tiefe Alluvialböden gebunden.

**Abnahme:** Mammutbäume sind als eigene, sehr große Art sichtbar; Nebel erhöht die Wasserverfügbarkeit; Feuer hinterlässt Höhlen, aber tötet alte Bäume nicht automatisch; Rodung zerstört den Bestand über Jahrhunderte; die Holzqualität ist hoch, die Regeneration langsam.

#### 1.2.23.1.017 — Pazifischer Regenwald

**Kurzprofil:** Ein sehr nasser, immergrüner Küstenwald aus Sitka-Fichte, Hemlocktanne und Riesenthuja mit einer üppigen Moos- und Farnschicht. Er ist der Inbegriff des gemäßigten Regenwalds Nordamerikas und ein wichtiger Laich- und Wanderkorridor für Lachs.

**Standort:** Hypermaritim, kühle Sommer, milde Winter; Temperatur 0,38–0,56; Feuchtigkeit über 0,80; Küstenstreifen, Flusstäler, Inseln; tiefe, organische, saure Böden, hohe Niederschläge, häufige Nebel.

**Bestand und Struktur:** Drei Schichten: Sitka-Fichte und Hemlocktanne im Dach, Riesenthuja und Ahorn in Gruppen, darunter Schwertfarn, Salal, Teufelskeule und Moos. Dichte 0,80–0,95; die Stämme sind moosbewachsen, die Kronen schließen sich fast vollständig. Totholz und umgestürzte Bäume sind zentrale Strukturelemente.

**Artenpalette:** *Picea sitchensis* 30–45 %, *Tsuga heterophylla* 25–40 %, *Thuja plicata* 8–18 %, *Acer macrophyllum* 5–12 %, *Alnus rubra* 3–8 %, *Polystichum munitum*, *Gaultheria shallon*, *Oplopanax horridus*, *Hylocomium splendens*.

**Jahreslauf:** Winter mit starkem Regen, Hochwasser und Sturm; Frühjahr mit üppigem Farn- und Mooswuchs; Sommer mit milden Temperaturen, Nebel und kurzen Trockenphasen; Herbst mit Pilzen, Laubfall der Beimischung und beginnendem Regen. Es gibt keine echte Vegetationsruhe.

**Boden und Krautschicht:** Tiefe organische Böden, sauer, nährstoffreich durch Meeresnährstoffe und Laub, sehr feucht; Farne, Moose, Salal, Teufelskeule, Pilze. Die Böden speichern viel Wasser; nach Rodung kann Regen ungehindert abfließen und Bäche aufreißen.

**Nutzung:** Sitka-Fichtenholz, Hemlocktanne, Thuja (sehr witterungsbeständig), Ahorn, Brennholz, Pilze, Beeren, Wild, Lachs. Thuja ist für Boote, Schindeln und Außenbau besonders wertvoll; der Lachs ist ein saisonaler, aber zentraler Nahrungs- und Wirtschaftsfaktor.

**Fauna:** Schwarzbär, Roosevelt-Elch, Schwarzwedelhirsch, Puma, Fischermarder, Fleckenkauz, Weißkopfseeadler, Lachs, Salamander, Libelle. Die Lachswanderung bringt Meeresnährstoffe in den Wald und muss als echtes saisonales Ereignis simuliert werden.

**Störungen und Sukzession:** Windwurf, Hochwasser, Hangrutsch, selten Feuer, Holzeinschlag. Windwurf schafft große Lücken, die von Ahorn, Salal und Jungfichten besiedelt werden; Totholz im Bach stabilisiert die Ufer und schafft Laichplätze. Die Sukzession ist schnell im Kronenschluss, langsam in der Artenzusammensetzung.

**Spielerfahrung:** Der Spieler erhält sehr hohe Biomasse und wertvolles Holz, muss aber Regen, Rutschgefahr und die Abhängigkeit vom Lachs respektieren. Eine Rodung am Bach zerstört Laichplätze und damit eine wichtige Nahrungsquelle. Der Wald belohnt schonende Bewirtschaftung und langfristige Planung.

**Abgrenzung:** 002 ist der allgemeine gemäßigte Regenwald der Südhalbkugel und europäischen Ozeanränder; 016 ist der Mammutbaumwald mit roten Riesenstämmen und tieferen Alluvialböden. 017 ist der pazifische Nadelbaum-Regenwald mit Sitka-Fichte, Hemlocktanne, Thuja und Lachs.

**Abnahme:** Sitka-Fichte und Hemlocktanne dominieren; Moos und Farne sind ganzjährig sichtbar; Lachs wandert saisonal und beeinflusst Bär, Adler und Nährstoffe; Rodung am Bach reduziert Laichplätze; Windwurf erzeugt eine echte Lücke.

#### 1.2.23.1.018 — Eukalyptuswald

**Kurzprofil:** Ein warmer, sommertrockener Wald mit hohen, lichten Eukalyptusbäumen, hartem Laub und einer feuerangepassten Flora. Nach einem Brand treibt vieles aus dem Stamm neu aus, während andere Arten nur über Samen zurückkehren.

**Standort:** Warmgemäßigt bis subtropisch; Temperatur 0,56–0,78; Feuchtigkeit 0,30–0,56; Küsten- und Hügelland, lateritische oder sandige, nährstoffarme Böden; sommertrocken, winterfeucht, frostarm.

**Bestand und Struktur:** Eine hohe, offene Kronenschicht aus Eukalyptus, darunter Akazien, Banksien, Grasbäume und eine grasige bis strauchige Bodenschicht. Dichte 0,35–0,68; die Stämme sind oft glatt, hell und hoch, die Kronen schmal und licht. Totholz und Baumhöhlen sind wichtige Lebensräume.

**Artenpalette:** *Eucalyptus regnans* 25–40 %, *E. globulus* 15–25 %, *E. marginata* 10–20 %, *Corymbia* spp. 5–12 %, *Acacia* spp. 5–10 %, *Banksia* spp. 3–8 %, *Xanthorrhoea* spp. Boden: *Themeda*, *Poa*, *Pteridium*, *Daviesia*, *Hakea*.

**Jahreslauf:** Winter mit Regen und Wachstum; Frühjahr mit Blüte und Insekten; Sommer mit Hitze, Trockenheit, Harz und Feuergefahr; Herbst mit Samenreife und erstem Regen. Viele Eukalypten blühen unregelmäßig; einige verlieren im Sommer einen Teil des Laubs.

**Boden und Krautschicht:** Nährstoffarm, sauer, oft lateritisch, sandig oder steinig; Gras, Bracken, Banksien, Akazien, Grasbäume. Der Boden kann nach Feuer wasserabweisend werden; Erosion ist auf entwaldeten Flächen stark.

**Nutzung:** Hartholz, Möbelholz, Pfosten, Brennholz, Holzkohle, Eukalyptusöl, Gerbstoff, Honig, Wild. Eukalyptus wächst schnell und kann als Plantage dienen, aber Monokulturen sind anfällig und artenarm. Öl und Honig sind attraktive Spezialgüter.

**Fauna:** Koala, Känguru, Wombat, Possum, Kakadu, Kookaburra, Leierschwanz, Termite, Ameise, Skink. Koalas brauchen bestimmte Eukalyptusarten; eine Monokultur mit falscher Art ist kein Koala-Lebensraum.

**Störungen und Sukzession:** Kronenfeuer, Trockenheit, Sturm, Holzeinschlag, Phytophthora. Viele Eukalypten treiben nach Feuer aus dem Stamm aus (epikormisch); andere Arten sterben ab und keimen aus Samen. Die Sukzession ist schnell, aber die Artenzusammensetzung kann sich dauerhaft verändern.

**Spielerfahrung:** Der Spieler kann schnell wertvolles Holz und Öl produzieren, lebt aber mit einem hohen Feuerrisiko. Feuerpausen, Brandschneisen und die Wahl zwischen Feuerresistenz und Holzertrag sind zentrale Entscheidungen. Koala- und Vogelhabitate machen eine reine Plantagenstrategie langfristig teuer.

**Abgrenzung:** 004 ist der mediterrane Hartlaubwald mit anderer Artenpalette und anderer Feueranpassung; 022 ist der trockenere Dornwald; 020 ist der tropische Miombo-Wald. 018 ist der austral-asiatische Eukalyptuswald mit hohen, lichten Stämmen und epikormischem Austrieb.

**Abnahme:** Eukalyptus dominiert und ist als eigene Art sichtbar; Feuer löst epikormischen Austrieb und Samenkeimung aus; Koalas hängen von bestimmten Arten ab; Eukalyptusöl und Honig sind saisonal verfügbar; eine Monokultur reduziert die Artenvielfalt.

#### 1.2.23.1.019 — Akazien-Waldland

**Kurzprofil:** Ein halbtrockenes, warmes Waldland mit schirmförmigen Akazien über einer Gras- und Krautschicht. Es ist kein geschlossener Wald, sondern ein lichter Übergang zwischen Savanne und Trockenwald, der von Regenzeit, Feuer und Weide geprägt ist.

**Standort:** Halbtrocken bis trocken, warm; Temperatur 0,64–0,86; Feuchtigkeit 0,24–0,46; Savannen- und Steppenränder, sandige bis tonige Böden, niedrige, aber saisonale Niederschläge. Frost fehlt oder ist selten.

**Bestand und Struktur:** Schirmakazien und Dornbäume stehen einzeln oder in Gruppen über Gras, Krautern und niedrigen Sträuchern. Dichte 0,18–0,40; die Kronen sind flach und weit, die Stämme oft verdreht. Der Boden bleibt zwischen den Bäumen offen und sonnig.

**Artenpalette:** *Vachellia tortilis* 25–40 %, *V. nilotica* 10–20 %, *Senegalia* spp. 10–20 %, *Balanites aegyptiaca* 5–12 %, *Commiphora* spp. 5–12 %, *Adansonia digitata* 0–5 % (Übergang zu 021). Gräser: *Themeda*, *Digitaria*, *Eragrostis*; Krauter: *Acacia* pod plants, *Ocimum*.

**Jahreslauf:** Trockenzeit mit Laubabwurf, Dornen, Staub und Wasserknappheit; Regenzeit mit raschem Grün, Blüte, Insekten und Weide; danach Samen und Hülsen; kühle Trockenzeit mit Ernte und Feuer. Die Kronen wirken während der Trockenzeit oft kahl.

**Boden und Krautschicht:** Sandig bis tonig, nährstoffarm, oft versalzt oder verkrustet; Gras, Krauter, Dornsträucher, Termitenhügel. Der Boden ist stark von Weide, Feuer und Wassererosion geprägt.

**Nutzung:** Gummi arabicum, Hülsen als Viehfutter, Brennholz, Holzkohle, Bauholz, Honig, Medizin, Wild, Weide. Gummi arabicum ist ein hochwertiges Spezialgut; die Hülsen sind in der Trockenzeit eine wichtige Futterreserve.

**Fauna:** Giraffe, Elefant, Impala, Gazelle, Kudu, Löwe, Gepard, Hyäne, Geier, Perlhuhn, Termite, Webervogel. Die Bäume sind Futter-, Schatten- und Nistplätze; Elefanten können Bestände stark verändern.

**Störungen und Sukzession:** Feuer, Weide, Dürre, Elefantenschaden, Holzeinschlag. Feuer tötet junge Bäume und fördert Gras; intensive Weide verhindert Regeneration; ohne Störung kann Verbuschung eintreten. Die Sukzession ist langsam und stark vom Niederschlag abhängig.

**Spielerfahrung:** Der Spieler balanciert Vieh, Wild, Feuerholz und Gummiertrag. Zu viele Tiere zerstören die Verjüngung; zu wenig Feuer lässt Sträucher überhandnehmen. Gummi arabicum und Honig belohnen eine schonende Nutzung, während Holzkohle schnelles Geld bringt, aber den Bestand ausdünnt.

**Abgrenzung:** 020 ist der feuchtere Miombo-Wald mit lichter, aber geschlossenerer Krone; 021 ist das baobabdominierte Waldland; 022 ist der trockenere, niedrige Dornwald. 019 ist das akaziendominierte, halbtrockene Waldland mit Grasmatrix.

**Abnahme:** Akazien bilden die Kronenschicht; Gras bleibt zwischen den Bäumen sichtbar; Gummi, Hülsen und Honig sind saisonal verfügbar; Feuer und Weide verändern die Verjüngung; Elefanten können den Bestand öffnen.

#### 1.2.23.1.020 — Miombo-Wald

**Kurzprofil:** Ein tropischer, laubwerfender Wald mit lichter Krone aus Brachystegia und Julbernardia über einer hohen Gras- und Krautschicht. Er ist der weit verbreitete „Trockenwald“ des südlichen Afrikas und lebt vom Wechsel zwischen Regen- und Trockenzeit.

**Standort:** Tropisch-saisonal; Temperatur 0,62–0,84; Feuchtigkeit 0,38–0,60; 700–1.200 mm Jahresniederschlag mit ausgeprägter Trockenzeit; sandige, stark ausgewaschene, nährstoffarme Böden; keine dauerhafte Staunässe.

**Bestand und Struktur:** Eine lichte bis halboffene Kronenschicht aus Miombo-Bäumen, darunter Strauchwerk, junge Bäume und eine hohe Grasschicht. Dichte 0,35–0,62; die Kronen sind rund bis schirmförmig, die Stämme oft krumm und knorrig. Im Sommer ist der Wald grün, in der Trockenzeit weitgehend kahl.

**Artenpalette:** *Brachystegia spiciformis* 25–40 %, *B. boehmii* 10–20 %, *Julbernardia globiflora* 15–25 %, *Isoberlinia angolensis* 5–12 %, *Pterocarpus angolensis* 3–8 %, *Uapaca kirkiana* 3–8 %. Gräser: *Hyparrhenia*, *Andropogon*; Krauter: *Cryptosepalum*.

**Jahreslauf:** Trockenzeit mit Laubabwurf, Feuer, Staub und Holzernte; früher Regen mit raschem Laubaustrieb und Blüte; Regenzeit mit dichtem Grün, Pilzen und Insekten; Nachregenzeit mit Früchten und Samen. Der Laubaustrieb erfolgt oft vor dem ersten Regen.

**Boden und Krautschicht:** Tiefe, sandige, saure, nährstoffarme Böden; hohe Gras- und Krautschicht, Pilze, Termiten. Der Boden ist arm, aber tief durchwurzelt; Feuer und Weide beeinflussen die Nährstoffkreisläufe.

**Nutzung:** Brennholz und Holzkohle (die wichtigste lokale Nutzung), Bauholz, Bienenhonig, wilde Früchte, Pilze, Medizin, Wild, Weide. Miombo-Honig und Uapaca-Früchte sind regionale Spezialgüter; Holzkohle ist lukrativ, aber zerstört die Regeneration.

**Fauna:** Elefant, Sable-Antilope, Roan-Antilope, Wildhund, Löwe, Leopard, Miombo-Spezialvögel, Termite, Biene, Käfer. Die lichte Struktur und die Grasschicht tragen eine andere Tiergemeinschaft als der geschlossene Regenwald.

**Störungen und Sukzession:** Feuer, Elefantenschaden, Holzkohleproduktion, Dürre, Landwirtschaft. Viele Miombo-Bäume treiben nach Feuer aus; intensive Holzkohleproduktion und wiederholte Brände verhindern die Verjüngung. Die Sukzession ist langsam, weil die Bäume langsam wachsen.

**Spielerfahrung:** Der Spieler steht vor der Wahl zwischen Holzkohle als schnellem Geld und dem langfristigen Erhalt des Miombo. Honig, Früchte und Wild belohnen eine schonende Nutzung; Feuermanagement ist entscheidend. Der Typ macht sichtbar, wie eine scheinbar unerschöpfliche Ressource innerhalb weniger Jahrzehnte verschwinden kann.

**Abgrenzung:** 019 ist das akaziendominierte, trockenere Waldland mit Schirmkronen; 021 ist baobabdominiert; 030 ist der asiatische Monsunwald mit Teak und Sal. 020 ist der afrikanische Miombo-Wald mit Brachystegia/Julbernardia und ausgeprägter Trockenzeit.

**Abnahme:** Brachystegia und Julbernardia dominieren; der Wald ist in der Trockenzeit laubabwerfend; Holzkohle reduziert die Regeneration; Honig und Früchte sind saisonal verfügbar; Feuer und Elefanten verändern die Struktur.

### 4.4 Trockene und saisonale Tropenwälder

#### 1.2.23.1.021 — Baobab-Waldland

**Kurzprofil:** Ein heißes, trockenes Waldland mit fassförmigen Baobabs, die Wasser speichern und in der Trockenzeit kahl bleiben. Zwischen den alten Riesen stehen Akazien, Tamarinden und eine spärliche Gras- und Krautschicht.

**Standort:** Heiß und stark saisonal; Temperatur 0,68–0,90; Feuchtigkeit 0,18–0,40; Savannen- und Trockenwaldzone, sandige bis tonige Böden, niedrige und unregelmäßige Niederschläge. Frost ist ausgeschlossen; Dürre ist der Normalfall, nicht die Ausnahme.

**Bestand und Struktur:** Baobabs als einzelne Emergenten oder in lockeren Gruppen, dazwischen Akazien, Tamarinde, Balanites und Commiphora. Dichte 0,12–0,32; die Kronen sind im Sommer grün, in der Trockenzeit kahl. Der Baobab speichert Wasser im Stamm und kann jahrhundertealt werden.

**Artenpalette:** *Adansonia digitata* 25–45 %, *Tamarindus indica* 10–20 %, *Vachellia* spp. 15–25 %, *Balanites aegyptiaca* 5–12 %, *Commiphora* spp. 5–10 %. Gräser: *Digitaria*, *Eragrostis*, *Panicum*; Krauter: *Adenium*, *Sansevieria*.

**Jahreslauf:** Trockenzeit mit kahlen Kronen, Hitze, Staub und Wasserknappheit; vor dem Regen Blüte und Fruchtreife; Regenzeit mit raschem Laubaustrieb, Gras und Insekten; danach Früchte, Samen und erneute Trockenheit. Der Baobab blüht oft nachts und wird von Fledermäusen bestäubt.

**Boden und Krautschicht:** Sandig bis tonig, nährstoffarm, oft stark versalzt oder verkrustet; spärliche Gras- und Krautschicht, Sukkulenten, Dornsträucher. Der Boden trocknet tief aus; nur tiefwurzelnde Arten überleben.

**Nutzung:** Baobabfrüchte (Vitamin C), Blätter, Rinde, Fasern, Samen, Honig, Medizin, Brennholz, Viehfutter. Das Holz ist weich und wenig wertvoll; die Frucht und die Faser sind die eigentlichen Güter. Ein gefällter Baobab ist ein jahrhundertealter Verlust.

**Fauna:** Elefant, Giraffe, Impala, Pavian, Fledermaus, Biene, Webervogel, Gecko, Schlange. Elefanten können Baobabs ringeln und zum Absterben bringen; Fledermäuse bestäuben die Blüten.

**Störungen und Sukzession:** Dürre, Feuer, Elefantenschaden, Landwirtschaft, Holzeinschlag. Baobabs wachsen extrem langsam; ihre Regeneration ist kaum beobachtbar. Feuer tötet junge Bäume, alte Baobabs überleben oft. Die Sukzession ist langsamer als bei jedem anderen Typ.

**Spielerfahrung:** Der Spieler erhält einen langlebigen, fruchtbaren Baum, der sich nicht schnell ersetzen lässt. Früchte, Fasern und Honig sind saisonal und wertvoll; das Fällen für Brennholz ist fast immer eine schlechte Entscheidung. Der Typ belohnt langfristiges Denken und bestraft kurzfristige Ausbeutung.

**Abgrenzung:** 019 ist akaziendominiert und weniger trocken; 020 ist der feuchtere Miombo-Wald; 022 ist der niedrige Dornwald. 021 ist das baobabdominierte, heiße Waldland mit saisonalem Laubabwurf und Wasserspeicherung.

**Abnahme:** Baobabs sind als eigene, sehr langlebige Art sichtbar; Früchte und Blätter folgen der Regenzeit; Fällen reduziert den Bestand dauerhaft; Elefanten können Baobabs schädigen; die Regeneration ist deutlich langsamer als bei 019.

#### 1.2.23.1.022 — Dornwald / Thornscrub

**Kurzprofil:** Ein trockener, niedriger und oft undurchdringlicher Dornwald aus Akazien, Commiphora und Sukkulenten. Er ist die trockenste Waldformation des Spiels und näher an der Wüste als an der Savanne.

**Standort:** Arid bis semi-arid; Temperatur 0,72–0,92; Feuchtigkeit 0,10–0,30; Wüstenrand, felsige Hänge, sandige Ebenen, salzhaltige Böden. Niederschlag ist unregelmäßig und oft extrem niedrig.

**Bestand und Struktur:** Niedrige, dornige Bäume und Sträucher von 1–5 m, oft zu undurchdringlichen Dickichten verwoben; dazwischen Sukkulenten, Gräser und nackter Boden. Dichte 0,28–0,55; die Kronen sind flach, die Dornen lang und zahlreich. Nach Regen erscheint eine kurzlebige Krautschicht.

**Artenpalette:** *Vachellia* spp. 20–35 %, *Commiphora* spp. 15–28 %, *Boscia* spp. 8–15 %, *Euphorbia* spp. 3–8 %, *Aloe* spp., *Sansevieria*, *Balanites*. Gräser: *Aristida*, *Eragrostis*, *Cenchrus*.

**Jahreslauf:** Lange Trockenzeit mit Dormanz, Dornen und Staub; kurze Regenzeit mit raschem Grün, Blüte und Insekten; danach Früchte und Samen; kühle Trockenzeit mit nächtlicher Kälte. Die meisten Pflanzen sind sukkulent oder tiefwurzelnd.

**Boden und Krautschicht:** Felsig, sandig, salzhaltig, flachgründig, nährstoffarm; Sukkulenten, Dornsträucher, spärliche Gräser. Der Boden ist stark erosionsgefährdet, besonders nach Beweidung und Holzeinschlag.

**Nutzung:** Brennholz, Holzkohle, Gummi, Harz, Medizin, Viehfutter, Fasern, Wild. Die Erträge sind gering; der Wald ist vor allem eine Überlebensressource. Dornen machen die Bewegung schwer und den Einschlag gefährlich.

**Fauna:** Dikdik, Kudu, Steinbock, Hyäne, Leopard, Schakal, Hornrabe, Webervogel, Schlange, Skorpion, Termite. Die Dornen schützen Nester und Junge; Sukkulenten speichern Wasser.

**Störungen und Sukzession:** Dürre, Überweidung, Holzeinschlag, Feuer (selten), Erosion. Intensive Beweidung kann den Dornwald in Wüste verwandeln; nach Regen und Schutz erholt er sich langsam. Die Sukzession ist Jahrzehnte lang.

**Spielerfahrung:** Der Spieler kämpft um Brennstoff und Weide. Dornwald ist eine wichtige Grenz- und Verteidigungslandschaft, aber wirtschaftlich arm. Zu viel Vieh oder Holzeinschlag führt zur Versteppung; der Typ macht die fragility trockener Ökosysteme sichtbar.

**Abgrenzung:** 019 ist das halbtrockene Akazien-Waldland mit mehr Gras und größeren Bäumen; 021 ist baobabdominiert; 004 ist der mediterrane Hartlaubwald mit Winterregen. 022 ist der trockenste, niedrigste und dornenreichste Waldtyp.

**Abnahme:** Der Bestand bleibt niedrig und dornig; nach Regen erscheint eine kurzlebige Krautschicht; Überweidung und Holzeinschlag erhöhen Erosion; Dornen behindern Bewegung; die Arten unterscheiden sich klar von 019.

#### 1.2.23.1.023 — Galeriewald

**Kurzprofil:** Ein schmaler, grüner Waldkorridor entlang eines Flusses in einer ansonsten trockenen Landschaft. Er bildet eine eigene, feuchte Welt mit hohen Bäumen, Lianen und dichter Krautschicht, die sich messerscharf von der umgebenden Trockenheit abhebt.

**Standort:** Trockenland mit permanentem oder saisonalem Fluss; Temperatur 0,58–0,86; lokale Feuchtigkeit 0,50–0,82; alluviale Uferböden, Grundwasseranschluss, periodische Überflutung. Das Umland kann halbwüstenartig sein.

**Bestand und Struktur:** Ein schmaler, oft nur wenige Bäume breiter Streifen mit geschlossener Krone, hohen Pappeln, Tamarisken, Weiden, Akazien und Feigen; darunter Schilf, Lianen und Hochstauden. Dichte 0,65–0,88; die Kronen berühren sich und bilden einen dunklen Korridor.

**Artenpalette:** *Populus euphratica* 20–35 %, *Tamarix* spp. 15–25 %, *Salix* spp. 10–20 %, *Vachellia nilotica* 8–15 %, *Ficus* spp. 5–10 %, *Phoenix* spp. 3–8 %, *Phragmites*, *Cynodon*, *Clematis*.

**Jahreslauf:** Hochwasser im Frühjahr oder während der Regenzeit; danach üppiges Wachstum, Blüte und Frucht; Trockenzeit mit Rückzug des Wassers, aber grüner Krone; Winter mit kühleren Nächten und Laubfall einiger Arten. Der Korridor bleibt länger grün als das Umland.

**Boden und Krautschicht:** Alluvial, sandig bis schluffig, nährstoffreich, zeitweise überflutet, oft versalzt; Schilf, Gräser, Hochstauden, Lianen. Der Boden ist instabil und erosionsgefährdet, wenn die Ufervegetation entfernt wird.

**Nutzung:** Holz, Brennholz, Futter, Früchte, Schatten, Fisch, Wild, Medizin, Transportkorridor. Der Galeriewald ist oft die einzige Holzquelle in der Trockenzeit; seine Zerstörung trifft die gesamte Landschaft.

**Fauna:** Elefant, Büffel, Antilope, Krokodil, Flusspferd, Fisch, Reiher, Eisvogel, Frosch, Libelle, Mücke. Der Korridor ist Wanderroute, Schattenplatz und Laichgebiet; er verbindet sonst isolierte Lebensräume.

**Störungen und Sukzession:** Hochwasser, Dürre, Ufererosion, Abholzung, Beweidung, Flussregulierung. Der Wald erholt sich schnell, wenn Wasser und Ufer bleiben; nach Dammbau oder Grundwasserabsenkung verschwindet er. Die Sukzession folgt dem Wasser, nicht nur der Zeit.

**Spielerfahrung:** Der Spieler kontrolliert einen strategischen Engpass: Wasser, Schatten, Holz und Bewegung laufen durch denselben Korridor. Eine Siedlung am Fluss profitiert enorm, aber Übernutzung zerstört den einzigen grünen Streifen. Der Typ macht sichtbar, wie Wasser die ganze Landschaft organisiert.

**Abgrenzung:** 008 ist der breite Auenwald der gemäßigten Flüsse; 019 ist das offene Akazien-Waldland; 023 ist der schmale, lineare Galeriewald im Trockenland. Die bestehende Formation `alluvial` und die Savannen-Riparian-Korridore sind die Basis, werden aber um Korridorbreite, Wasserführung und Fragmentierung erweitert.

**Abnahme:** Der Wald bildet einen klar erkennbaren Korridor; Wasserstand und Hochwasser verändern Breite und Arten; Abholzung erhöht Ufererosion; Tiere nutzen den Korridor als Wanderroute; ein Damm oder Grundwasserabfall lässt den Wald schrumpfen.

### 4.5 Tropische Küsten- und Bambuswälder

#### 1.2.23.1.024 — Mangrovenwald

**Kurzprofil:** Ein tropischer Küstenwald auf Salzwasser, mit Stelzwurzeln, Atemwurzeln und einem dichten, dunklen Kronendach. Er steht im Gezeitenwechsel, schützt die Küste vor Sturm und ist eine Kinderstube für Fische und Krebse.

**Standort:** Tropisch bis subtropisch; Temperatur 0,66–0,90; Salz- und Brackwasser, Gezeiten, weicher Schlick, Küstenlagunen, Deltas, Flussmündungen. Kein Frost; hohe Luftfeuchtigkeit und periodische Überflutung.

**Bestand und Struktur:** Eine bis drei Schichten aus Mangrovenarten mit Stelz-, Stützwurzeln und Pneumatophoren. Dichte 0,72–0,92; die Kronen sind dunkelgrün und oft undurchdringlich. Die Zonierung folgt dem Salz- und Überflutungsgradienten: vorne Rhizophora, dahinter Avicennia und Laguncularia.

**Artenpalette:** *Rhizophora mangle* 25–40 %, *Avicennia germinans* 15–28 %, *Laguncularia racemosa* 10–20 %, *Bruguiera* spp. 5–15 %, *Sonneratia* spp. 3–10 %; Seegras und Algen in angrenzenden Flachwasserzonen.

**Jahreslauf:** Gezeiten prägen den Tagesrhythmus, nicht die Jahreszeiten; Regenzeit bringt Süßwasser und Nährstoffe; Trockenzeit erhöht den Salzgehalt; Fortpflanzung über Schwimmpropagulen, die mit dem Wasser verbreitet werden. Stürme können ganze Bestände umwerfen.

**Boden und Krautschicht:** Salzwasser, Schlick, anaerob, schwefelhaltig, instabil; nur wenige krautige Pflanzen, viel Luftwurzelwerk und Detritus. Der Boden speichert Kohlenstoff und stabilisiert die Küste.

**Nutzung:** Mangrovenholz, Holzkohle, Gerbstoff, Honig, Fisch, Krabbe, Muschel, Garnelen, Viehfutter, Dachmaterial. Der ökologische Wert als Küstenschutz und Fischkinderstube übersteigt oft den direkten Holzertrag.

**Fauna:** Krabbe, Garnele, Fisch, Muschel, Reiher, Storch, Krokodil, Affe, Manati, Mücke. Die Wurzeln bieten Versteck und Laichplatz; die Kronen sind Nistplätze für Wasservögel.

**Störungen und Sukzession:** Zyklon, Sturmflut, Erosion, Holzeinschlag, Aquakultur, Süßwasserableitung, Meeresspiegelanstieg. Mangroven erholen sich langsam nach flächiger Rodung; eine Änderung des Salz- oder Wasserregimes kann den Standort dauerhaft zerstören.

**Spielerfahrung:** Der Spieler kann die Küste schützen oder die Mangroven für schnelles Holz und Garnelenfarmen opfern. Der kurzfristige Gewinn ist hoch, der langfristige Verlust an Küstenschutz und Fischerei ebenfalls. Der Typ macht die Verbindung zwischen Wald, Meer und Siedlung direkt sichtbar.

**Abgrenzung:** 009 ist der dauerhaft nasse Bruchwald mit Süßwasser; 017 ist der gemäßigte Küstenregenwald; 024 ist der salztolerante, gezeitenabhängige Mangrovenwald. Die Zonierung nach Salz und Überflutung ist das entscheidende Alleinstellungsmerkmal.

**Abnahme:** Stelz- und Atemwurzeln sind sichtbar; Salz und Gezeiten bestimmen die Zonierung; Rodung erhöht Küstenerosion; Fische und Krebse nutzen die Wurzeln als Kinderstube; ein Save/Load-Zyklus erhält die Zonierung.

#### 1.2.23.1.025 — Bambuswald

**Kurzprofil:** Ein dichter Wald aus hohen, hohlen Bambushalmen, der nach der Blüte großflächig abstirbt und aus Rhizomen schnell wieder austreibt. Er ist die am schnellsten regenerierende Holzformation des Spiels.

**Standort:** Tropisch bis warmgemäßigt; Temperatur 0,54–0,86; Feuchtigkeit 0,55–0,86; tiefe, feuchte, gut drainierte Böden, Flussufer, Hänge, Sekundärwälder. Bambus besiedelt oft gestörte Flächen und Waldränder.

**Bestand und Struktur:** Dichte Halme von 5–30 m Höhe, eine offene Kronenschicht und eine dichte Streuschicht; dazwischen junge Triebe und breitblättrige Kräuter. Dichte 0,65–0,90; die Halme sind hohl, geringelt und oft grün oder gelblich. Nach der Blüte sterben ganze Bestände ab.

**Artenpalette:** *Dendrocalamus strictus* 25–40 %, *Bambusa bambos* 15–25 %, *B. vulgaris* 10–20 %, *Phyllostachys* spp. 5–15 %, *Guadua angustifolia* 5–15 % (regional); Unterwuchs: *Alpinia*, *Musa*, Farne, Gräser.

**Jahreslauf:** Regenzeit mit raschem Halmlängenwachstum (bis zu mehreren Zentimetern pro Tag); Trockenzeit mit Härtung und Ernte; Blüte in langen, unregelmäßigen Zyklen (oft Jahrzehnte); nach der Blüte sterben die Halme ab, Sämlinge keimen. Die schnelle Regeneration ist das Markenzeichen.

**Boden und Krautschicht:** Tief, feucht, nährstoffreich, gut drainiert; Rhizome bilden ein dichtes Netz. Die Streuschicht ist dicht und schwer zersetzbar; Erosion wird durch das Wurzelnetz gebremst.

**Nutzung:** Bauholz, Gerüste, Möbel, Körbe, Papier, Fasern, Nahrung (Sprossen), Viehfutter, Erosionsschutz, Wasserrohre. Bambus ist leicht, elastisch und schnell verfügbar; die Haltbarkeit ist geringer als bei Massivholz.

**Fauna:** Bambusratte, Bambusbär (regional), Fasan, Eichhörnchen, Insekt, Spinne, Frosch. Die dichte Struktur bietet Versteck; die Blüte und der anschließende Absterbeprozess verändern das Nahrungsangebot massiv.

**Störungen und Sukzession:** Feuer, Rodung, Blüte/Absterben, Überernte. Bambus treibt nach Feuer und Schnitt schnell aus; nach der Blüte bricht der Bestand zusammen und andere Arten keimen. Die Sukzession ist schnell und ungleichmäßig.

**Spielerfahrung:** Der Spieler erhält einen fast erneuerbaren Baustoff, der sich innerhalb weniger Jahre nachwachsen lässt. Die Kehrseite ist die Monokultur und der plötzliche Zusammenbruch nach der Blüte. Eine kluge Strategie hält Reserven und gemischte Bestände; eine reine Bambuswirtschaft ist hocheffizient, aber riskant.

**Abgrenzung:** Die tropische Bambusformation in 1.2.4 ist eine kleinräumige Ausprägung; 025 ist der regionale Bambuswald-Dachtyp mit Blüte, Absterben und schneller Rhizomregeneration. 030 ist der Monsunwald mit Teak, Sal und Bambus als Beimischung, nicht als dominanter Bestand.

**Abnahme:** Bambus dominiert und wächst sichtbar schnell; Ernte und Feuer fördern den Austrieb; die Blüte löst ein Bestandssterben aus; Bau- und Faserprodukte sind verfügbar; die Regeneration ist schneller als bei allen anderen Holztypen.

### 4.6 Asiatische Saison- und Regenwälder

#### 1.2.23.1.026 — Teakwald

**Kurzprofil:** Ein tropischer Saisonwald mit großen, breitblättrigen Teakbäumen, die in der Trockenzeit ihr Laub verlieren und während des Monsuns eine mächtige Krone bilden. Teak ist das wertvollste Holz des Typs, aber die Umtriebszeit ist lang.

**Standort:** Tropisch-saisonal; Temperatur 0,64–0,86; Feuchtigkeit 0,44–0,66; 1.200–2.500 mm Niederschlag mit drei bis fünf trockenen Monaten; tiefe, fruchtbare, gut drainierte Alluvial- oder Basaltböden. Kein Frost, keine dauerhafte Staunässe.

**Bestand und Struktur:** Teak bildet die obere Krone, beigemischt Lagerströmia, Dalbergia, Xylia und Terminalia; darunter Bambus, Gräser und junge Bäume. Dichte 0,52–0,74; die Kronen sind groß und breit, die Stämme gerade und hoch. In der Trockenzeit ist der Wald auffallend kahl und sonnig.

**Artenpalette:** *Tectona grandis* 35–55 %, *Lagerstroemia speciosa* 8–15 %, *Dalbergia latifolia* 5–12 %, *Xylia xylocarpa* 5–10 %, *Terminalia* spp. 5–10 %, *Bambusa* spp. 5–12 %. Boden: *Dendrocalamus*, *Imperata*, *Dioscorea*, *Phyllanthus*.

**Jahreslauf:** Trockenzeit mit Laubabwurf, Holzernte und Feuergefahr; Vormonsun mit Blüte und erstem Grün; Monsun mit üppigem Wachstum, Bambusschossen und Insekten; Nachmonsun mit Fruchtreife und Samen. Teak blüht oft erst nach mehreren Jahrzehnten.

**Boden und Krautschicht:** Tief, nährstoffreich, gut drainiert, oft rot oder braun; Bambus, Gräser, Kräuter, Jungwuchs. Der Boden ist empfindlich gegen Erosion, wenn nach dem Holzeinschlag der Monsun einsetzt.

**Nutzung:** Teakholz für Möbel, Schiffbau, Türen und Schnitzerei; Brennholz, Bambus, Honig, Lack, Futter, Medizin. Teak ist witterungsbeständig und sehr wertvoll; die lange Wachstumszeit macht Raubbau besonders schädlich.

**Fauna:** Elefant, Gaur, Tiger, Leopard, Sambar, Axishirsch, Hornrabe, Pfau, Langur, Termite. Die offene Trockenzeit krone bietet Sicht und Weide; der Monsun schafft Deckung und Wasser.

**Störungen und Sukzession:** Feuer, Beweidung, Brandrodung, Holzeinschlag, Zyklon. Teak treibt nach Feuer und Schnitt aus; Bambus breitet sich nach Störung schnell aus. Die Sukzession ist schnell im Unterwuchs, langsam im Teakstarkholz.

**Spielerfahrung:** Der Spieler investiert in ein langfristiges Premiumholz. Kurzfristig locken Bambus, Honig und Brennholz; wer den Teakbestand übernutzt, verliert Jahrzehnte an Wertzuwachs. Feuer und Beweidung müssen aktiv gemanagt werden, sonst bleibt nur Bambus und Gras.

**Abgrenzung:** 027 ist saldominiert und feuerangepasster; 030 ist der breitere Monsunwald mit Teak, Sal und Bambus; 028 ist der immerfeuchte Dipterocarpaceenwald. 026 ist der teakdominierte Saisonwald mit langer Umtriebszeit.

**Abnahme:** Teak dominiert und ist in der Trockenzeit kahl; Teakholz hat einen eigenen Premiumwert; Feuer und Beweidung reduzieren die Verjüngung; Bambus breitet sich nach Störung aus; die Umtriebszeit ist deutlich länger als bei 025.

#### 1.2.23.1.027 — Salwald

**Kurzprofil:** Ein halbimmergrüner bis laubwerfender Tropenwald mit Sal-Bäumen, der in der Trockenzeit Laub verliert, aber kurz danach wieder austreibt. Sal ist feuerangepasst, wirtschaftlich vielseitig und prägt große Teile Südasiens.

**Standort:** Tropisch-saisonal; Temperatur 0,60–0,86; Feuchtigkeit 0,40–0,62; 1.000–2.000 mm Niederschlag mit ausgeprägter Trockenzeit; tiefe, gut drainierte, oft saure Böden. Sal verträgt periodische Trockenheit, aber keinen Frost.

**Bestand und Struktur:** Sal bildet eine dichte bis halboffene Krone, beigemischt Terminalia, Buchanania, Madhuca, Diospyros und Bambus. Dichte 0,62–0,84; die Stämme sind gerade, die Kronen breit. In der Trockenzeit fällt das Laub, im Frühjahr treibt der Wald mit rötlichem Junglaub aus.

**Artenpalette:** *Shorea robusta* 35–55 %, *Terminalia tomentosa* 8–15 %, *Buchanania latifolia* 5–12 %, *Madhuca longifolia* 5–10 %, *Diospyros* spp. 3–8 %, *Bambusa* spp. 5–12 %. Boden: *Imperata*, *Themeda*, *Curcuma*, *Dioscorea*.

**Jahreslauf:** Trockenzeit mit Laubfall, Laubharken, Feuer und Holzernte; Frühjahr mit rötlichem Neuaustrieb und Blüte; Monsun mit dichtem Grün, Pilzen und Insekten; Nachmonsun mit Früchten und Samen. Die Laubstreu ist ein wichtiger Rohstoff und Nährstoffträger.

**Boden und Krautschicht:** Tief, gut drainiert, sauer bis neutral, nährstoffreich; Gräser, Kräuter, Bambus, Jungwuchs. Laubstreu wird gesammelt und als Brennstoff, Mulch oder Kompost genutzt; zu intensive Entnahme verarmt den Boden.

**Nutzung:** Salholz für Bau, Möbel, Schwellen und Werkzeug; Harz, Blüten, Früchte, Honig, Lack, Futter, Medizin, Laubstreu. Sal ist vielseitig, aber das Holz ist weniger wertvoll als Teak.

**Fauna:** Elefant, Gaur, Tiger, Leopard, Sambar, Axishirsch, Lippenbär, Hornrabe, Pfau, Langur. Die Laubstreu beherbergt Insekten und Kleintiere; Feuer und Laubharken reduzieren sie.

**Störungen und Sukzession:** Feuer, Beweidung, Laubharken, Holzeinschlag, Brandrodung. Sal treibt nach Feuer kräftig aus; wiederholte Brände und intensive Beweidung verhindern die Verjüngung. Die Sukzession ist schnell im Unterwuchs, langsam im Salstarkholz.

**Spielerfahrung:** Der Spieler kann Sal vielseitig nutzen, muss aber die Laubstreu und die Verjüngung schonen. Feuer ist ein Werkzeug und eine Gefahr: Es kann Bambus und Konkurrenz kontrollieren, aber junge Sal-Bäume töten. Der Typ belohnt eine balancierte Wald-Weide-Wirtschaft.

**Abgrenzung:** 026 ist teakdominiert und weniger feuerabhängig; 030 ist der übergreifende Monsunwald; 028 ist immerfeucht. 027 ist der saldominierte, laubwerfende Saisonwald mit starker Feuer- und Laubstreu-Kopplung.

**Abnahme:** Sal dominiert und treibt nach Feuer aus; Laubstreu ist ein nutzbares Gut; zu intensive Entnahme reduziert die Bodenfruchtbarkeit; Feuer tötet Jungpflanzen, nicht alte Bäume; die Arten unterscheiden sich klar von 026.

#### 1.2.23.1.028 — Dipterocarpaceenwald

**Kurzprofil:** Ein artenreicher, immerfeuchter Tieflandsregenwald mit hohen Dipterocarpaceen, einem geschlossenen Dach und einer außergewöhnlichen Baumvielfalt. Viele Arten blühen und fruchten gemeinsam in unregelmäßigen Mastjahren.

**Standort:** Immerfeucht-tropisch; Temperatur 0,70–0,92; Feuchtigkeit über 0,76; 2.000 mm+ Niederschlag ohne echte Trockenzeit; tiefe Ton- und Lehmböden, nährstoffarm, aber gut durchwurzelt; Höhenlage unter 0,40.

**Bestand und Struktur:** Drei bis vier Schichten: riesige Emergenten, ein geschlossenes Hauptdach, mittlere Bäume und eine schattige Unterwuchsschicht. Dichte 0,82–0,95; die Stämme sind hoch und oft mit Brettwurzeln; Lianen und Epiphyten sind häufig. Totholz und Baumhöhlen sind vielfältig.

**Artenpalette:** *Shorea* spp. 20–35 %, *Dipterocarpus* spp. 10–20 %, *Dryobalanops* spp. 8–15 %, *Hopea* spp. 5–12 %, *Eusideroxylon zwageri* 3–8 %, *Koompassia* spp. 3–8 %. Unterwuchs: *Rattan*, *Alpinia*, Farne, Sämlinge.

**Jahreslauf:** Keine echte Trockenzeit; Regen fällt ganzjährig, mit einer leichten saisonalen Schwankung. General Flowering tritt unregelmäßig nach trockeneren Wochen auf; dann blühen und fruchten viele Arten gleichzeitig. Die Kronen bleiben überwiegend grün.

**Boden und Krautschicht:** Tiefe, tonige, saure, nährstoffarme Böden; hohe Biomasse, schneller Abbau, Mykorrhiza. Der Boden ist empfindlich gegen Verdichtung und Erosion; die Nährstoffe zirkulieren schnell im Ökosystem.

**Nutzung:** Hartholz (Shorea, Dipterocarpus), Harz, Illipe-Nüsse, Kampfer, Rattan, Medizin, Wild, Honig. Das Holz ist wertvoll, aber die Arten sind oft gefährdet; selektive Entnahme ist schwierig, weil einzelne Emergenten fehlen.

**Fauna:** Orang-Utan, Gibbon, Hornrabe, Tiger, Sonnenbär, Zibetkatze, Fledermaus, Käfer, Termite. Die Mastjahre beeinflussen Wildschweine, Nagetiere und Raubtiere über die ganze Landschaft.

**Störungen und Sukzession:** Windwurf, Trockenheit, Feuer (selten), Holzeinschlag, Waldbrände nach Rodung. Lücken schließen sich langsam; Mastjahre sind für die Verjüngung entscheidend. Die Sukzession ist komplex und stark von der Artenvielfalt abhängig.

**Spielerfahrung:** Der Spieler erhält einen hochwertigen, aber schwer zu bewirtschaftenden Wald. Selektiver Einschlag ist möglich, aber die Wege und die Artenvielfalt leiden. Mastjahre sind ein seltenes Ereignis, das Nahrung und Jagd für Jahre verändert. Der Typ belohnt Geduld und den Schutz der Emergenten.

**Abgrenzung:** Der bestehende Tropenwald 1.2.4 ist die allgemeine Basis; 028 ist die dipterocarpaceenreiche, immerfeuchte Tieflandsausprägung mit Mastjahren. 026 und 027 sind saisonal und laubwerfend; 030 ist der Monsunwald mit Teak/Sal.

**Abnahme:** Mindestens fünf Dipterocarpaceen sind nachweisbar; die Krone ist mehrschichtig und geschlossen; Mastjahre synchronisieren Blüte/Frucht; selektiver Einschlag reduziert die Artenvielfalt; die Regeneration ist langsamer als bei 026/027.

#### 1.2.23.1.029 — Lorbeerwald

**Kurzprofil:** Ein milder, feuchter Bergwald mit immergrünen Lorbeergewächsen, ledrigen Blättern und einer dichten Moos- und Epiphytenschicht. Er kommt in ozeanischen Insel- und Hochlandregionen vor und wirkt wie ein grüner, nebliger Wolkenwald.

**Standort:** Mild-ozeanisch bis montan; Temperatur 0,50–0,68; Feuchtigkeit 0,68–0,88; Höhenlage 0,30–0,72; vulkanische oder alte, tief verwitterte Böden, sauer, humusreich, oft nebelfeucht. Kein strenger Frost, keine lange Trockenheit.

**Bestand und Struktur:** Zwei bis drei Schichten aus Lorbeer, Ocotea, Persea, Apollonias, Stechpalme und Baumheide; darunter Farne, Moose und Jungwuchs. Dichte 0,70–0,86; die Kronen sind immergrün und ledrig, die Stämme oft moosbewachsen. Epiphyten und Flechten sind auffällig.

**Artenpalette:** *Laurus azorica* / *L. novocanariensis* 20–35 %, *Ocotea foetens* 10–20 %, *Persea indica* 10–18 %, *Apollonias barbujana* 5–12 %, *Ilex perado* 5–10 %, *Erica arborea* 5–12 %, *Myrica faya* 5–10 %. Boden: *Woodwardia*, *Dryopteris*, *Saxifraga*, Moose.

**Jahreslauf:** Mild und feucht; Frühjahr mit Blüte und frischem Austrieb; Sommer mit Nebel, aber ohne echte Dürre; Herbst mit Früchten und Laubfall einzelner Arten; Winter mit Regen, Wind und selten Frost. Die immergrüne Krone bleibt das ganze Jahr geschlossen.

**Boden und Krautschicht:** Tiefe, saure, humusreiche Vulkanböden; Farne, Moose, Sauerklee, Flechten. Der Boden ist nährstoffreich, aber erosionsgefährdet; Nebel liefert zusätzliches Wasser.

**Nutzung:** Holz, Brennholz, Holzkohle, Früchte, Honig, Medizin, Lorbeeröl, Wild. Die Bäume wachsen langsam; die Holzqualität ist gut, aber die Bestände sind oft klein und geschützt.

**Fauna:** Lorbeertaube, Bolles Taube, Amsel, Buchfink, Eidechse, Fledermaus, Käfer, Schnecke. Endemische Vögel sind auf die Früchte und die dichte Krone angewiesen; Ratten und verwilderte Tiere sind eine echte Gefahr.

**Störungen und Sukzession:** Wind, Hangrutsch, Feuer, Rodung, invasive Arten. Lorbeerwälder erholen sich langsam; nach Rodung breiten sich Heide und invasive Arten aus. Die Sukzession ist langsam und stark von der Isolation abhängig.

**Spielerfahrung:** Der Spieler bewirtschaftet einen seltenen, artenreichen Wald mit endemischen Arten. Holz ist wertvoll, aber die Bestände sind klein; Früchte und Honig sind nachhaltiger. Nebel liefert Wasser, senkt aber Sicht und Ernteertrag. Der Typ belohnt Schutz und bestraft großflächige Rodung.

**Abgrenzung:** 003 ist der kühl-atlantische Nebelwald mit Buche/Eiche und Salz; 002 ist der gemäßigte Regenwald; 028 ist der tropische Dipterocarpaceenwald. 029 ist der mild-montane Lorbeerwald mit immergrünen, ledrigen Blättern und endemischen Vögeln.

**Abnahme:** Lorbeer dominiert und bleibt immergrün; Nebel und Moos sind sichtbar; endemische Vögel reagieren auf Früchte; Rodung fördert invasive Arten; die Bestände sind klein und langsam regenerierend.

#### 1.2.23.1.030 — Monsunwald

**Kurzprofil:** Ein tropischer Saisonwald mit einer kurzen, aber heftigen Regenzeit und einer langen Trockenzeit. Teak, Sal, Terminalia und Bambus wechseln sich ab; der Wald ist im Monsun grün und in der Trockenzeit weitgehend kahl.

**Standort:** Tropisch-saisonal; Temperatur 0,66–0,88; Feuchtigkeit 0,48–0,74 während der Regenzeit, 0,20–0,40 in der Trockenzeit; 1.500–2.500 mm Niederschlag, drei bis fünf trockene Monate; tiefe, gut drainierte, oft basaltische oder alluviale Böden.

**Bestand und Struktur:** Eine wechselnde Kronenschicht aus Teak, Sal, Terminalia, Anogeissus und Bambus; darunter Gräser, Kräuter und Jungwuchs. Dichte 0,58–0,80; die Kronen sind im Monsun geschlossen, in der Trockenzeit offen. Bambus kann nach Störung dominieren.

**Artenpalette:** *Tectona grandis* 15–25 %, *Shorea robusta* 15–25 %, *Terminalia* spp. 10–18 %, *Anogeissus latifolia* 5–10 %, *Bambusa* spp. 10–20 %, *Dendrocalamus* spp. 5–12 %. Boden: *Themeda*, *Imperata*, *Curcuma*, *Dioscorea*.

**Jahreslauf:** Trockenzeit mit Laubfall, Feuer, Holzernte und Staub; Vormonsun mit Blüte und erstem Grün; Monsun mit starkem Regen, üppigem Wachstum und Bambusschossen; Nachmonsun mit Früchten, Samen und erneuter Trockenheit. Der Wechsel ist abrupt und landschaftsprägend.

**Boden und Krautschicht:** Tief, nährstoffreich, gut drainiert, aber während des Monsuns stark wasserführend; Gräser, Kräuter, Bambus, Jungwuchs. Der Boden ist erosionsgefährdet, wenn die Trockenzeitvegetation fehlt und der Monsun einsetzt.

**Nutzung:** Teak- und Salholz, Bambus, Brennholz, Futter, Honig, Lack, Früchte, Medizin, Wild. Der Monsunwald ist ein multifunktionaler Wirtschaftswald; die Ernte muss vor dem Monsun erfolgen, sonst sind die Wege unpassierbar.

**Fauna:** Elefant, Gaur, Tiger, Leopard, Sambar, Axishirsch, Hornrabe, Pfau, Langur, Termite, Biene. Die Trockenzeit konzentriert Tiere an Wasserstellen; der Monsun verteilt sie wieder.

**Störungen und Sukzession:** Feuer, Beweidung, Brandrodung, Holzeinschlag, Zyklon, Erosion. Feuer und Beweidung formen den Unterwuchs; Bambus breitet sich nach Störung aus; Teak und Sal treiben nach Schnitt aus. Die Sukzession ist schnell, aber die Artenzusammensetzung verschiebt sich.

**Spielerfahrung:** Der Spieler plant im Jahresrhythmus: Ernte und Brandschutz in der Trockenzeit, Wachstum und Wasser im Monsun. Teak, Sal und Bambus bieten unterschiedliche Strategien; eine reine Bambuswirtschaft ist schnell, eine Teakwirtschaft langsam und wertvoll. Der Typ macht den Monsun als echten Wirtschaftsfaktor sichtbar.

**Abgrenzung:** 026 ist teakdominiert, 027 saldominiert, 028 immerfeucht; 030 ist der übergreifende Monsunwald mit dem vollen Teak-Sal-Bambus-Mosaik und dem stärksten saisonalen Wechsel. 025 ist der reine Bambuswald.

**Abnahme:** Der Wald verliert in der Trockenzeit sein Laub und treibt im Monsun aus; Teak, Sal und Bambus sind gemeinsam nachweisbar; Ernte vor dem Monsun ist wirtschaftlich entscheidend; Feuer und Beweidung verändern den Unterwuchs; die Arten unterscheiden sich klar von 026/027/028.

## 5. Querschnittsmatrix

Die Matrix ist die schnelle Designprüfung. Sie ersetzt nicht die Einzelabschnitte, sondern macht sichtbar, ob ein Typ eine eigene Nische besitzt oder nur eine Farbvariante wäre.

| ID | Wasser | Feuer | Frost | Salz | Holz | Nahrung | Spezialgut | Hauptrisiko | Zentrale Entscheidung |
|---|---|---|---|---|---|---|---|---|---|
| 001 | mäßig, Staunässe | mittel | sehr hoch | nein | Nadelholz | Beeren, Pilze, Wild | Harz, Pelz, Torf | Winter, Borkenkäfer | Vorrat vs. Altwald |
| 002 | sehr hoch | selten | gering | nein | Mischholz | Pilze, Beeren, Wild | Moos, Farn, Medizin | Windwurf, Erosion | Einzelentnahme vs. Fläche |
| 003 | Nebel, hoch | selten | mäßig | ja | Laub-/Mischholz | Pilze, Honig | Flechten, Moos | Sturm, Salz, Trockenheit | Windschutz vs. Drainage |
| 004 | Winterregen | sehr hoch | gering | ja | Hartlaub, Kiefer | Mast, Öl, Honig | Kork, Pinienkerne | Dürre, Feuer | Kork vs. Feuerholz |
| 005 | gleichmäßig | gering | mäßig | nein | Edellaubholz | Mast, Pilze, Honig | Furnier, Wild | Verbiss, Sturm | Vielseitigkeit vs. Spezialisierung |
| 006 | frisch | gering | mäßig | nein | Buchenholz | Mast, Pilze | Furnier, Mast | Sturm, Trockenheit | Reinbestand vs. Mischung |
| 007 | frisch, staunass | gering | mäßig | nein | Eiche/Hainbuche | Mast, Nüsse | Stockausschlag | Verbiss, Nutzungsaufgabe | Niederwald vs. Hochwald |
| 008 | Hochwasser | sehr gering | mäßig | nein | Weich-/Hartholz | Fisch, Wild, Obst | Weidenruten | Überschwemmung | Deich vs. Aue |
| 009 | dauerhaft nass | sehr gering | mäßig | nein | Erle/Weide | Fisch, Wild | Torf, Schilf | Drainage, Windwurf | Entwässern vs. erhalten |
| 010 | Torf, sauer | mittel | hoch | nein | Moorholz | Beeren, Wild | Torf, Medizin | Torfabbau, Brand | Torf vs. Kohlenstoff |
| 011 | trocken | hoch | mäßig | nein | Kiefer/Birke | Beeren, Pilze | Teer, Heide | Feuer, Nährstoffeintrag | Offenheit vs. Aufforstung |
| 012 | feucht | gering | hoch | nein | Fichte/Tanne | Pilze, Wild | Resonanzholz, Harz | Windwurf, Borkenkäfer | Kahlschlag vs. Plenter |
| 013 | mäßig | mittel | hoch | nein | Lärche | Pilze, Wild | Terpentin | Feuer, Schattenkonkurrenz | Geduld vs. Durchforstung |
| 014 | frisch | gering | hoch | nein | Mischholz | Pilze, Wild | Schutzholz | Lawine, Erosion | Nutzung vs. Schutz |
| 015 | wechselnd | selten | sehr hoch | nein | Zirbe/Lärche | Beeren, Wild | Zirbelnüsse | Lawine, Rodung | Schutz vs. Brennholz |
| 016 | Nebel, hoch | mittel | gering | ja | Mammutbaum | Farn, Pilze | Rotholz, Burl | Rodung, Erosion | Einzelbaum vs. Fläche |
| 017 | sehr hoch | selten | gering | ja | Sitka/Thuja | Lachs, Beeren | Thuja, Lachs | Windwurf, Rutschung | Holz vs. Bach |
| 018 | sommertrocken | sehr hoch | gering | nein | Eukalyptus | Honig, Wild | Öl, Gerbstoff | Kronenfeuer | Feuerpause vs. Ertrag |
| 019 | saisonal | hoch | nein | möglich | Akazie | Hülsen, Honig | Gummi arabicum | Dürre, Überweidung | Vieh vs. Wild |
| 020 | saisonal | hoch | nein | nein | Miombo | Früchte, Honig | Holzkohle, Honig | Holzkohle, Feuer | Kohle vs. Regeneration |
| 021 | sehr trocken | mittel | nein | möglich | weiches Holz | Früchte, Blätter | Baobabfaser | Dürre, Elefant | Frucht vs. Fällen |
| 022 | arid | selten | nein | ja | Dornholz | Futter, Wild | Gummi, Medizin | Überweidung, Erosion | Weide vs. Schutz |
| 023 | Fluss | gering | nein | möglich | Weichholz | Fisch, Wild | Schatten, Futter | Dammbau, Abholzung | Wasser vs. Holz |
| 024 | Salzgezeiten | selten | nein | sehr hoch | Mangrovenholz | Fisch, Krebse | Gerbstoff, Honig | Rodung, Sturmflut | Küstenschutz vs. Holz |
| 025 | feucht | mittel | gering | nein | Bambus | Sprossen | Fasern, Papier | Blüte, Monokultur | Schnelligkeit vs. Reserve |
| 026 | saisonal | hoch | nein | nein | Teak | Honig, Wild | Teakholz | Feuer, Übernutzung | Langzeit vs. Bambus |
| 027 | saisonal | sehr hoch | nein | nein | Sal | Honig, Früchte | Harz, Lack | Laubharken, Feuer | Nutzung vs. Boden |
| 028 | immerfeucht | selten | nein | nein | Dipterocarp | Nüsse, Wild | Harz, Rattan | Mastjahre, Rodung | Selektion vs. Fläche |
| 029 | Nebel, hoch | selten | gering | nein | Lorbeer | Früchte, Honig | Lorbeeröl | Rodung, Invasoren | Schutz vs. Holz |
| 030 | Monsun | hoch | nein | nein | Teak/Sal/Bambus | Honig, Früchte | Lack, Bambus | Monsun, Feuer | Jahresrhythmus vs. Maximalertrag |

## 6. Implementierung

Die 30 Typen sind kein zweiter Wald-Simulator. Sie sind eine regionale Overlay-Schicht über dem vorhandenen Stand, dem vorhandenen Ressourcenknoten, dem vorhandenen Inspektor und dem vorhandenen Renderer.

### 6.1 Daten und Auswahl

- `game/js/world/regional-forests.js` enthält `REGIONAL_FOREST_TYPES` (30 Typen), `REGIONAL_SPECIES` (16 angehängte Arten), `REGIONAL_GOODS` (eigene Holzsorten) und `REGIONAL_FORESTS_TEST_SITES`.
- `regionalForestTypeFor()` prüft Klima, Basisformation, Temperatur, Feuchte und Höhe. Innerhalb der passenden Kandidaten entscheidet die ökologische Priorität; ein 7×7-Cell-Hash bricht Gleichstände und macht den Typ als Region lesbar. Es gibt keinen Nachbarscan und keinen untypisierten Rückgabewert für eine echte Waldkachel.
- `forestStandAt()` ruft den Regionaltyp vor Störung, Alter und Sukzession auf. `stand.type` bleibt die bestehende Formation, `stand.regionalTypeId` und die abgeleiteten Felder tragen den Regionaltyp.
- `regionalFormationFor()` cached die Kombination aus Basisformation und Regionaltyp. Die Basiszusammensetzung bleibt erhalten, damit alte Saves und die bestehenden Misch-/Nadelwald-Verträge unverändert bleiben. Regionale Güter und Fauna werden additiv ergänzt; die regionale Palette, Kronenhöhe, Stammform und der Nebel kommen aus `regionalType.render`.

### 6.2 Wirkung auf bestehende Systeme

| Effekt | Angeschlossenes System | Sichtbar für den Spieler |
|---|---|---|
| `timber` | Kapazität und Ertrag des Waldknotens | Holzertrag im Lumber-/Forester-Inspektor, Erntemenge |
| `regrowth` | `forestRegrowthFactor()` und `regrowForests()` | Regenerationswert im Inspektor, tatsächliches Nachwachsen |
| `fire` | `forestFireRisk` und die bestehende Störungs-/Sukzessionslogik | Brandrisiko im Inspektor, Feuerereignisse |
| `fauna` | Habitat-/Wildtierdruck und die bestehende Faunazusammensetzung | Wildlife-Wert und Tierarten im Inspektor |
| `forage` | Sammelproduktivität und saisonale Waldgüter | Forage-Wert und Sammelangebot |
| `work` | Arbeitsfaktor des Waldknotens | Work-Wert, Ernte- und Wegekosten |
| `flood` | Hochwasserschutz-/Überflutungsprofil | Hochwasserwert im Inspektor |

Jede Wirkung wird bei Bedarf gelesen und bleibt an den bestehenden Tick bzw. den bestehenden begrenzten Regenerations-/Sukzessionstakt gebunden. Es gibt keine neue globale Wald-simulation und keinen zusätzlichen Per-Frame-Scan.

### 6.3 Save und Determinismus

- Der Typ wird nicht als neues Pflichtfeld gespeichert. Er wird beim Laden aus Seed, Kachel und Standortfaktoren erneut abgeleitet.
- `serializeResourceGeography()` und `restoreResourceGeography()` reproduzieren Bestand, Kapazität und daraus abgeleiteten Typ; der Test in `tests/world/regional-forests.test.js` prüft den Roundtrip.
- Alte Saves ohne Regionaldaten laden unverändert; beim ersten Zugriff entsteht derselbe Typ wie in einer frisch generierten Welt.

## 7. Verifikation

### 7.1 Unit- und Integrationstests

`game/tests/world/regional-forests.test.js` prüft:

- 30 eindeutige IDs und 30 dokumentierte Standortproben, jede liefert exakt ihren Typ;
- differenzierte Effekt-Tupel und mindestens 25 verschiedene Paletten;
- eine generierte temperate Welt ohne eine einzige untypisierte Waldkachel;
- einen 9-Klima-Scan, der alle 30 Typen tatsächlich erzeugt;
- Determinismus und einen Ressourcen-Save/Load-Roundtrip für Typ, Effekte und Bestand.

Die bestehenden Wald-, Nadelwald-, Mischwald-, Tropen-, Savannen-, Taiga-, Tundra- und Ressourcentests bleiben grün. Die neuen Arten wurden ausschließlich hinten an `FOREST_SPECIES` angehängt; die bestehenden 38 Indizes bleiben unverändert.

### 7.2 Generierte Welten: 9-Klima-Scan

Seed `20261123`, `small`, `continent`, Wasser 46, Landmasse 58, Fruchtbarkeit 55, Wälder 70, Berge 55, Rauheit 58:

| Klima | Waldkacheln |
|---|---:|
| temperate | 4.168 |
| taiga | 4.285 |
| snow | 4.493 |
| mountain | 6.386 |
| swamp | 4.190 |
| savanna | 1.332 |
| coastal | 5.306 |
| tropical | 9.047 |
| tundra | 693 |
| **Summe** | **39.900** |

Ergebnis: **39.900 Waldkacheln, 0 untypisiert, 30/30 Typen erzeugt.** Die tatsächlichen Kachelzahlen pro Typ: 001 8.305 · 002 57 · 003 3.494 · 004 372 · 005 2.773 · 006 516 · 007 81 · 008 911 · 009 3.693 · 010 194 · 011 142 · 012 2.030 · 013 928 · 014 1.888 · 015 3.141 · 016 169 · 017 313 · 018 7 · 019 298 · 020 769 · 021 95 · 022 1 · 023 162 · 024 1.770 · 025 634 · 026 102 · 027 6 · 028 3.678 · 029 587 · 030 2.784.

### 7.3 25-Jahres-Kampagne

Der deterministische Lauf `npm run test:campaign` (Seed 20261108, common-weal, 25 Jahre) war grün: 10.040 Ticks, 19,4 s, 1,094 ms pro Tick, alle Kampagnenanforderungen erfüllt, kein Game Over. Die Typzählung nach 25 Jahren:

| Typ | Kacheln |
|---|---:|
| 1.2.23.1.002 Gemäßigter Regenwald | 18 |
| 1.2.23.1.004 Mediterraner Hartlaubwald | 14 |
| 1.2.23.1.005 Sommergrüner Laubmischwald | 2.667 |
| 1.2.23.1.006 Reiner Buchenwald | 231 |
| 1.2.23.1.011 Kiefern-Birkenwald | 162 |
| 1.2.23.1.012 Fichten-Tannenwald | 56 |
| 1.2.23.1.013 Lärchenwald | 40 |
| 1.2.23.1.014 Bergmischwald | 319 |
| **Summe** | **3.507, davon 0 untypisiert** |

Eine temperate Kampagne enthält naturgemäß nur die temperate Typen. Der 9-Klima-Scan oben belegt die Erreichbarkeit aller 30; der Kampagnenlauf belegt, dass die Typisierung auch nach 25 Jahren Waldwirtschaft, Sukzession und Ernte lückenlos bleibt.

### 7.4 Browser-Referenz

`node tests/browser/regional-forest-reference.mjs` startet ein echtes tropisches Reich (Seed 20261104), pausiert die Simulation, scannt alle 9.526 Waldkacheln und öffnet einen echten Lumberyard-Inspektor. Ergebnis:

- **9.526 Waldkacheln, 0 untypisiert**, sechs tatsächlich vorkommende Regionaltypen im tropischen Reich;
- Inspektorzeile: `Forest type: Mangrovenwald — … · Timber yield 78% · Regrowth 94% · Fire -6% · Wildlife 124% · Forage 120%`;
- drei gerenderte Stände (024 Mangrove, 028 Dipterocarpaceenwald, 025 Bambuswald) mit drei unterschiedlichen SHA-256-Bildhashes;
- keine Konsolenfehler und keine Page-Errors.

Artefakte: `artifacts/regional-forests/regional-forests.json`, `regional-forests.png`, `stand-024.png`, `stand-028.png`, `stand-025.png`.

### 7.5 Performance

Die Auswahl ist O(1) pro Kachel und läuft nur beim Aufbau des Standes. Die 30 Regionalformationen werden pro Basisformation/Typ einmal gecacht; Ressourcenknoten behalten den bereits gebauten Stand. Der Kampagnen-Tick blieb mit 1,094 ms im normalen Bereich. Es gibt keinen neuen Per-Frame-Pfad; der Renderer liest nur die vorhandenen Standfelder.

## 8. Implementierte Entscheidungen

1. **Overlay statt Parallelmodell:** `stand.type` bleibt die bestehende Formation. Der Regionaltyp reitet auf `forestStandAt()`, damit Ressourcen, Fauna, Sammeln, Inspektor und Renderer dieselbe Quelle behalten.
2. **Save-Kompatibilität:** Keine neuen Pflichtfelder. Der Typ wird deterministisch neu abgeleitet; alte Saves bleiben lesbar.
3. **Arten-Indizes:** Die 16 neuen Arten und die neuen Holzsorten wurden hinten angehängt. Bestehende Indizes und Formationen bleiben unverändert.
4. **Basisformation bleibt Basis:** Misch- und Nadelwald behalten ihre bestehende Artenmischung; regionale Güter/Fauna sind additiv. Das verhindert, dass ein Mischwald durch ein Overlay seine ökologische Identität verliert.
5. **Sichtbarkeit:** Regionale Bodenpalette, Kronenhöhe, Stammform, Nebel und Silhouette kommen aus dem Typ; der Inspektor zeigt Label, Kurzprofil und die konkreten Effektwerte.
6. **Kein Default:** Für eine echte Waldkachel liefert der Selektor immer einen Typ. Der Fallback greift nur für synthetische Aufrufe ohne Basisformation und ist ebenfalls klimatisch bestimmt.

## 9. Bewusste Grenzen

- Die regionale Schicht fügt 16 Arten und eigene Holzsorten hinzu, aber die vorhandenen Formationen zeichnen weiterhin ihre Basiszusammensetzung. Die regionale Identität ist heute primär Palette, Kronen-/Stammform, Nebel, Güter, Fauna und Wirkung; ein eigener Baum-Zeichenpfad pro Typ ist nicht Teil dieses Durchgangs.
- Nicht jede neue Holz sorte hat bereits ein eigenes Rezept oder einen eigenen Marktpreis. Sie ist im bestehenden `FOREST_GOODS`-Katalog registriert und über den Stand sichtbar; die vorhandene Sammel-/Holzökonomie bleibt die Quelle der Ernte.
- Ein einzelnes Reich enthält nur die Typen seiner Klimazone. Alle 30 sind über den 9-Klima-Scan und die 30 Standortproben belegt, nicht alle gleichzeitig in einem einzelnen Seed.
- Der 60-Jahres-Soak wurde für diesen Batch nicht erneut gefahren; die 25-Jahres-Kampagne und der 9-Klima-Scan sind die verlangten Nachweise. Der Nightly-Soak bleibt das Release-Gate.

## 10. Implementierte Werte

Die folgenden Tabellen werden aus `REGIONAL_FOREST_TYPES` erzeugt und geben den tatsächlichen Stand des Codes wieder, nicht den ursprünglichen Entwurf. Prozentwerte sind Multiplikatoren (100 % = unverändert), Feuer und Hochwasser sind relative Zu-/Abschläge.

### 10.1 Standortfenster und Arten

| ID | Typ | Klima | Basisformationen | Temperatur | Feuchte | Höhe | Prio | Arten | Silhouette |
|---|---|---|---|---|---|---|---|---|---|
| 001 | Borealer Nadelwald / Taiga | taiga, snow, mountain | taiga-spruce, taiga-pine, taiga-larch, taiga-birch, taiga-mixed, sprucewood, pinewood | 0.10–0.46 | 0.34–0.82 | 0.00–0.86 | 6 | spruce, pine, larch, birch, rowan | spire |
| 002 | Gemäßigter Regenwald | temperate, mountain | beechwood, mixed, alluvial, mixed-alluvial, sprucewood, firwood | 0.40–0.58 | 0.72–1.00 | 0.00–0.72 | 8 | nothofagus, podocarpus, beech, oak, birch, treefern | emergent |
| 003 | Atlantischer Nebelwald | coastal, mountain | beechwood, oakwood, birchwood, pinewood, hillside, mixed | 0.34–0.54 | 0.60–0.83 | 0.04–0.85 | 5 | beech, oak, birch, pine, rowan, hazel | wind-sheared |
| 004 | Mediterraner Hartlaubwald | coastal, temperate | oakwood, pinewood, chestnut-grove, hillside | 0.60–0.82 | 0.20–0.54 | 0.00–0.66 | 7 | cork-oak, holm-oak, aleppo-pine, juniper, oak | gnarled |
| 005 | Sommergrüner Laubmischwald | temperate, mountain | oakwood, beechwood, mixed, maplewood, linden-elm, chestnut-grove, mixed-open, mixed-ecotone | 0.44–0.66 | 0.46–0.76 | 0.00–0.63 | 2 | oak, beech, ash, maple, linden, elm, hornbeam | dome |
| 006 | Reiner Buchenwald | temperate, mountain | beechwood, mixed, hillside | 0.38–0.60 | 0.48–0.76 | 0.00–0.70 | 4 | beech, oak, ash, maple, hornbeam | dome |
| 007 | Eichen-Hainbuchenwald | temperate, coastal | linden-elm, mixed, coppice-with-standards, mixed-open | 0.46–0.65 | 0.54–0.78 | 0.00–0.52 | 5 | oak, hornbeam, linden, hazel, maple, elm | dome |
| 008 | Auenwald | temperate, coastal, swamp | alluvial, mixed-alluvial, swamp-carr, tropical-floodplain | 0.40–0.70 | 0.72–0.97 | 0.00–0.52 | 9 | willow, alder, ash, oak, elm, birch | airy |
| 009 | Bruchwald | swamp, temperate | swamp-carr | 0.36–0.60 | 0.78–1.00 | 0.00–0.48 | 10 | alder, willow, birch, ash, oak | airy |
| 010 | Moorwald | taiga, snow, temperate, mountain | wet-conifer, pine-heath, taiga-spruce, taiga-mixed, taiga-pine, taiga-birch, pinewood, subalpine-scrub | 0.18–0.55 | 0.72–1.00 | 0.00–0.82 | 9 | pine, birch, spruce, dwarf-pine, juniper | gnarled |
| 011 | Kiefern-Birkenwald | temperate, taiga, snow | pine-heath, pinewood, birchwood, mixed-open, taiga-pine | 0.30–0.60 | 0.28–0.58 | 0.00–0.72 | 4 | pine, birch, juniper, oak, rowan | airy |
| 012 | Fichten-Tannenwald | mountain, taiga, temperate | sprucewood, firwood, mixed-conifer, mountain-conifer | 0.26–0.56 | 0.55–0.84 | 0.18–0.86 | 6 | spruce, fir, beech, maple, rowan, birch | spire |
| 013 | Lärchenwald | taiga, snow, mountain | larchwood, taiga-larch, mountain-conifer, mixed-conifer | 0.22–0.54 | 0.32–0.68 | 0.18–0.86 | 6 | larch, pine, spruce, birch, juniper | airy |
| 014 | Bergmischwald | mountain, temperate | mixed-montane, mixed-conifer, mixed-fir-beech-maple, hillside, selection-forest | 0.28–0.62 | 0.44–0.80 | 0.42–0.90 | 5 | beech, fir, spruce, maple, rowan, birch | layered |
| 015 | Subalpiner Wald | mountain, snow, taiga | subalpine-scrub, mountain-conifer, taiga-larch, larchwood | 0.08–0.48 | 0.28–0.82 | 0.72–1.00 | 8 | juniper, pine, larch, spruce, dwarf-pine, birch | krummholz |
| 016 | Küstenmammutbaumwald | coastal | sprucewood, firwood, mixed-conifer, mixed-fir-beech-maple, beechwood, oakwood, mixed, pinewood | 0.47–0.62 | 0.66–0.80 | 0.22–0.55 | 8 | redwood, sitka, hemlock, nothofagus, treefern | column |
| 017 | Pazifischer Regenwald | coastal | sprucewood, firwood, mixed-conifer, wet-conifer | 0.38–0.54 | 0.64–0.84 | 0.00–0.66 | 7 | sitka, hemlock, redwood, nothofagus, treefern | emergent |
| 018 | Eukalyptuswald | savanna, coastal | savanna-woodland, oakwood, pinewood | 0.62–0.86 | 0.26–0.41 | 0.00–0.72 | 6 | eucalyptus, aleppo-pine, acacia, ironwood, juniper | airy |
| 019 | Akazien-Waldland | savanna | savanna-woodland, mixed-open | 0.55–0.86 | 0.30–0.56 | 0.00–0.76 | 4 | acacia, camelthorn, marula, fever-tree, baobab | umbrella |
| 020 | Miombo-Wald | savanna | savanna-woodland, mixed-open | 0.52–0.82 | 0.48–0.64 | 0.00–0.72 | 5 | miombo, acacia, marula, baobab, fever-tree | umbrella |
| 021 | Baobab-Waldland | savanna | savanna-woodland | 0.55–0.92 | 0.24–0.46 | 0.40–0.78 | 6 | baobab, marula, camelthorn, acacia, fever-tree | baobab |
| 022 | Dornwald / Thornscrub | savanna | savanna-woodland | 0.55–0.96 | 0.06–0.40 | 0.00–0.46 | 7 | acacia, camelthorn, baobab, marula, juniper | thorn |
| 023 | Galeriewald | savanna | savanna-woodland, alluvial, mixed-alluvial, tropical-riverbank | 0.48–0.88 | 0.62–0.92 | 0.00–0.50 | 9 | willow, alder, fever-tree, acacia, fig, ash | corridor |
| 024 | Mangrovenwald | tropical | tropical-swamp, tropical-floodplain, tropical-riverbank, tropical-palm-grove | 0.62–0.92 | 0.58–1.00 | 0.00–0.44 | 10 | mangrove, palm, fig, balsa, bamboo | stilt |
| 025 | Bambuswald | tropical | tropical-bamboo, tropical-secondary, tropical-gap, tropical-plantation | 0.58–0.88 | 0.68–0.96 | 0.05–0.66 | 8 | bamboo, balsa, fig, palm, teak | bamboo |
| 026 | Teakwald | tropical | tropical-monsoon, tropical-canopy, tropical-secondary | 0.60–0.88 | 0.56–0.66 | 0.05–0.66 | 6 | teak, sal, bamboo, fig, ironwood | large-leaf |
| 027 | Salwald | tropical | tropical-monsoon, tropical-secondary, tropical-gap | 0.60–0.90 | 0.46–0.58 | 0.05–0.70 | 7 | sal, teak, bamboo, acacia, ironwood | large-leaf |
| 028 | Dipterocarpaceenwald | tropical | tropical-emergent, tropical-canopy, tropical-ancient, tropical-montane | 0.64–0.92 | 0.76–1.00 | 0.00–0.72 | 9 | dipterocarp, ironwood, rosewood, fig, bamboo, palm | emergent |
| 029 | Lorbeerwald | coastal, mountain, tropical | beechwood, mixed-montane, tropical-montane, hillside, mixed-fir-beech-maple | 0.46–0.68 | 0.64–0.88 | 0.55–0.88 | 6 | laurel, nothofagus, beech, oak, podocarpus, treefern | dome |
| 030 | Monsunwald | tropical | tropical-monsoon, tropical-secondary, tropical-canopy | 0.60–0.90 | 0.64–0.78 | 0.05–0.72 | 5 | teak, sal, bamboo, fig, ironwood, dipterocarp | layered |

### 10.2 Wirkung pro Typ

| ID | Typ | Holzertrag | Regeneration | Brandrisiko | Fauna | Sammeln | Arbeit | Hochwasser | Güter |
|---|---|---|---|---|---|---|---|---|---|
| 001 | Borealer Nadelwald / Taiga | 106% | 68% | +2% | 92% | 96% | 90% | +0% | spruce-cones, pine-cones, resin, blueberries, lingonberries, mushrooms, lichen, game, timber, firewood |
| 002 | Gemäßigter Regenwald | 112% | 112% | -4% | 118% | 114% | 86% | +20% | mushrooms, herbs, lichen, moss, timber, firewood, game |
| 003 | Atlantischer Nebelwald | 92% | 90% | -2% | 108% | 108% | 90% | +12% | mushrooms, lichen, moss, herbs, honey, timber, firewood |
| 004 | Mediterraner Hartlaubwald | 84% | 72% | +16% | 94% | 108% | 96% | +0% | acorns, bark, pine-cones, resin, honey, herbs, timber, firewood |
| 005 | Sommergrüner Laubmischwald | 100% | 100% | +0% | 105% | 108% | 100% | +0% | acorns, beechnuts, mushrooms, honey, herbs, game, timber, firewood |
| 006 | Reiner Buchenwald | 108% | 96% | -1% | 92% | 94% | 102% | +0% | beechnuts, mushrooms, porcini, game, timber, firewood |
| 007 | Eichen-Hainbuchenwald | 102% | 108% | +0% | 106% | 110% | 104% | +0% | acorns, hazelnuts, mushrooms, herbs, game, timber, firewood |
| 008 | Auenwald | 94% | 96% | -3% | 114% | 112% | 88% | +70% | willow-withies, herbs, mushrooms, honey, game, river-fish, timber, firewood |
| 009 | Bruchwald | 86% | 82% | -5% | 116% | 100% | 82% | +85% | alder-timber, willow-withies, sphagnum, bog-herb, game, firewood, timber |
| 010 | Moorwald | 62% | 42% | +6% | 112% | 106% | 74% | +90% | pine-cones, blueberries, lingonberries, cloudberry, sphagnum, peat, timber, firewood |
| 011 | Kiefern-Birkenwald | 86% | 116% | +8% | 100% | 112% | 106% | +0% | pine-cones, birch-sap, blueberries, lingonberries, lichen, mushrooms, timber, firewood |
| 012 | Fichten-Tannenwald | 118% | 78% | -1% | 98% | 94% | 88% | +0% | spruce-cones, fir-cones, resin, mushrooms, lichen, game, timber, firewood |
| 013 | Lärchenwald | 98% | 104% | +4% | 98% | 108% | 104% | +0% | larch-timber, larch-cones, resin, mushrooms, blueberries, herbs, timber, firewood |
| 014 | Bergmischwald | 110% | 92% | -2% | 110% | 104% | 94% | +0% | mushrooms, herbs, game, rowan-berries, resin, timber, firewood |
| 015 | Subalpiner Wald | 60% | 58% | +0% | 90% | 92% | 78% | +0% | juniper-berries, pine-cones, larch-cones, lichen, herbs, resin, timber, firewood |
| 016 | Küstenmammutbaumwald | 134% | 82% | -2% | 112% | 98% | 90% | +10% | resin, mushrooms, lichen, herbs, timber, firewood |
| 017 | Pazifischer Regenwald | 120% | 100% | -4% | 116% | 108% | 86% | +16% | resin, mushrooms, lichen, herbs, game, timber, firewood |
| 018 | Eukalyptuswald | 106% | 124% | +18% | 92% | 106% | 102% | +0% | resin, honey, herbs, timber, firewood, charcoal |
| 019 | Akazien-Waldland | 78% | 100% | +10% | 112% | 114% | 98% | +0% | gum-arabic, marula-fruit, honey, game, timber, firewood |
| 020 | Miombo-Wald | 82% | 108% | +12% | 108% | 116% | 96% | +0% | honey, mushrooms, game, marula-fruit, timber, firewood |
| 021 | Baobab-Waldland | 72% | 72% | +8% | 114% | 110% | 92% | +0% | baobab-fruit, baobab-fibre, marula-fruit, game, timber, firewood |
| 022 | Dornwald / Thornscrub | 56% | 66% | +6% | 84% | 100% | 90% | +0% | thorn-branches, gum-arabic, game, firewood, timber |
| 023 | Galeriewald | 92% | 122% | -5% | 120% | 116% | 94% | +60% | willow-withies, river-fish, honey, game, herbs, timber, firewood |
| 024 | Mangrovenwald | 78% | 94% | -6% | 124% | 120% | 78% | +100% | mangrove-timber, shellfish, salt, fish, reed, timber, firewood |
| 025 | Bambuswald | 90% | 132% | +2% | 96% | 118% | 90% | +0% | bamboo, bamboo-shoots, rattan, herbs, timber, firewood |
| 026 | Teakwald | 126% | 90% | +6% | 98% | 100% | 100% | +0% | honey, mushrooms, herbs, timber, firewood, charcoal |
| 027 | Salwald | 112% | 98% | +12% | 106% | 108% | 102% | +0% | resin, honey, herbs, game, timber, firewood |
| 028 | Dipterocarpaceenwald | 116% | 104% | -4% | 126% | 114% | 84% | +10% | resin, rattan, mushrooms, herbs, timber, firewood |
| 029 | Lorbeerwald | 90% | 102% | -2% | 114% | 112% | 92% | +10% | herbs, honey, mushrooms, lichen, timber, firewood |
| 030 | Monsunwald | 104% | 112% | +6% | 108% | 108% | 96% | +0% | bamboo, bamboo-shoots, honey, mushrooms, herbs, timber, firewood |

### 10.3 Bodenpalette pro Typ

| ID | Typ | Palette |
|---|---|---|
| 001 | Borealer Nadelwald / Taiga | #4b3e2b #635036 #78613f #3d4a35 #8a744b |
| 002 | Gemäßigter Regenwald | #33452d #425b34 #566b3d #293b28 #66744b |
| 003 | Atlantischer Nebelwald | #40503b #53654a #68735a #354434 #747d64 |
| 004 | Mediterraner Hartlaubwald | #7a6546 #93764e #a88b5e #66543d #b59b6e |
| 005 | Sommergrüner Laubmischwald | #4d6338 #6f763d #57452e #7a5b36 #647b40 |
| 006 | Reiner Buchenwald | #5a5338 #756a42 #8b7b4c #48432f #9a8958 |
| 007 | Eichen-Hainbuchenwald | #4d6337 #6c743c #594a2f #7b5f39 #657b41 |
| 008 | Auenwald | #3f5236 #587042 #6a6a3d #30432f #7b7b4b |
| 009 | Bruchwald | #35452f #4a5d39 #5d6040 #29382b #6b6b4a |
| 010 | Moorwald | #3e4432 #54583b #676746 #31362a #757652 |
| 011 | Kiefern-Birkenwald | #6a5a3e #84704b #9a8459 #564932 #aa9468 |
| 012 | Fichten-Tannenwald | #3f3c2d #55503a #6a6043 #343529 #776b4d |
| 013 | Lärchenwald | #5d5136 #756641 #8c794c #4a432f #a18c5b |
| 014 | Bergmischwald | #435032 #5b6740 #6f754d #35432e #7e855c |
| 015 | Subalpiner Wald | #5c5c45 #747251 #89855d #484b39 #9a9469 |
| 016 | Küstenmammutbaumwald | #4a3a2b #624d36 #786044 #352d24 #8a7051 |
| 017 | Pazifischer Regenwald | #33432e #465a37 #596a41 #283628 #6b7650 |
| 018 | Eukalyptuswald | #8a7452 #a58a61 #b89d73 #725f44 #c5ad84 |
| 019 | Akazien-Waldland | #8a7444 #a38a52 #b89c61 #705e3a #c4aa70 |
| 020 | Miombo-Wald | #7d6d45 #957e51 #aa9160 #655838 #b9a06d |
| 021 | Baobab-Waldland | #92784a #a88d58 #bd9f66 #77603c #c9ae78 |
| 022 | Dornwald / Thornscrub | #9a7d4d #af9159 #c2a466 #7d653f #cdb37a |
| 023 | Galeriewald | #435c35 #5c7442 #6f7d4a #32452f #81905b |
| 024 | Mangrovenwald | #34543a #456b45 #587b4d #294530 #6b8a59 |
| 025 | Bambuswald | #3c5d33 #517545 #657f4d #2e4a2c #788f5e |
| 026 | Teakwald | #4b6234 #627548 #777c4f #3a4c2d #8a8b5d |
| 027 | Salwald | #5c6536 #747b45 #888a50 #48502e #9a9b60 |
| 028 | Dipterocarpaceenwald | #2f4f30 #42653b #557546 #263f28 #687f55 |
| 029 | Lorbeerwald | #3b5335 #506b3e #647a49 #2e452d #778c5b |
| 030 | Monsunwald | #3f6136 #557844 #6b824d #304b2e #7d905b |

