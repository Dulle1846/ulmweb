# Regionale Waldwirtschaft 1.2.23.1.151–180

**Status:** implementiert und als Spielmechanik verdrahtet (v3.77.0)
**Datenmodell:** `js/world/forest-industries.js`
**Laufzeit:** `js/systems/forest-industries.js`
**Browser-Referenz:** `npm run test:forest-industry-ui`

Die dreißig Punkte sind **eine integrierte Waldwirtschaft**, kein zweiter
Simulator. Sie benutzen die vorhandenen regionalen Waldstände, die
Forstsammlung, das Sägewerk, die Carrier-Logistik, die Warenlager, das
zentrale Güteraudit, den Markt und den Forest Atlas. Der einzige neue
Gebäudetyp ist die **Forest Works** (`TYPE.FOREST_WORKS = 89`); das Sägewerk
bekommt Profile statt neuer Gebäude-IDs. Dadurch bleiben alte Saves, Rezepte,
Handelswege und die deterministische Tick-Reihenfolge erhalten.

## Der Spielerpfad

1. **Wald lesen.** Der Forest Atlas und das Sägewerks-Dossier nennen Holzart,
   Qualität, Wuchsform und die regionale Bauform. Der Spieler entscheidet, ob
   ein Bestand Bauholz, Möbelholz, Schiffbauholz, Bogenholz, Brennholz oder
   Industrierohstoff liefern soll.
2. **Sägewerk rüsten.** Fünf Profile verändern Annahme und Ausbeute. Ein
   Hartholz-Sägewerk akzeptiert nur Hartholz und erzeugt ein zusätzliches
   Brett; ein Weichholz-Profil erzeugt zusätzliches Brennholz; Schiff- und
   Bogenprofil erzeugen die jeweiligen Spezialsortimente.
3. **Forest Works bauen.** Das Gebäude hat 17 wählbare Produktionswege. Jeder
   Weg nennt Standardeingaben, Rohstoffe aus der laufenden Forstsammlung und
   seine Fertigware. Der Modus bleibt am Gebäude gespeichert.
4. **Rohstoff und Logistik verbinden.** Standardgüter kommen als echte
   Carrier-Aufträge. Harz, Rinde, Kork, Beeren, Kräuter, Pilze, Fisch, Palmöl
   und Maulbeerblatt kommen aus dem `forestGathering.stock` des verwalteten
   Waldes. Keine Werkstatt erfindet Rohstoff aus nichts.
5. **Verkaufen oder weiterverarbeiten.** Fertigwaren liegen im normalen
   Warenlager. Der Atlas zeigt reale Bestände und verkauft direkt aus dem
   Lager; Möbel, Pech, Teer, Papier, Seide, Kautschuk, Bambusfaser, Palmöl,
   Palmwedel und Gewürze laufen über dieselben Marktpreise wie alle anderen
   Güter.
6. **Über Jahrzehnte spezialisieren.** Der Spieler kann pro Region eine andere
   Nische aufbauen: Korkeiche und Tannin im Mittelmeer, Teak und Lackmöbel in
   den Tropen, Rotzeder und Schiffsharz an der Küste, Maulbeerwälder für Seide,
   Bambus für leichte Konstruktionen, Palmöl und Gewürze für Fernhandel.

## 151–154: Holz, Qualität, Sägewerke und Möbel

### 151 Regionale Holzarten

Achtzehn Holzarten tragen jeweils Härte, Elastizität, Fäulnisresistenz, Dichte,
Bearbeitbarkeit, Korn und eine beschreibende Note. Dieselben Werte werden vom
Sägewerk, von Forest Works, vom Markt und vom Atlas gelesen.

| Holz | Charakter | Natürlicher Schwerpunkt |
| --- | --- | --- |
| `nothofagus-timber` | zähe Südbuche, dampfbiegsam | gemäßigter Regenwald |
| `podocarpus-timber` | feines, stabiles Nadelholz | gemäßigter Regenwald |
| `treefern-timber` | weich und faserig | gemäßigter Regenwald |
| `redwood-timber` | sehr lang, gerade, fäulnisfest | Küsten-Nadelwald |
| `sitka-timber` | leicht, resonant, elastisch | Küsten-Nadelwald |
| `hemlock-timber` | allgemeines Bau-Nadelholz | Küsten-Nadelwald |
| `eucalyptus-timber` | dicht, abrasiv, federnd | Hartlaubwald |
| `cork-timber` | dichte, fäulnisfeste Korkeiche | mediterraner Hartlaubwald |
| `holm-timber` | extrem harte Steineiche | mediterraner Hartlaubwald |
| `aleppo-timber` | harzige Mittelmeerkiefer | mediterraner Nadelwald |
| `miombo-timber` | trockenzeitliches Hartholz | Miombo |
| `teak-timber` | ölig, dimensionsstabil, fäulnisfest | Teak-/Monsunwald |
| `sal-timber` | schweres Konstruktionsholz | Sal-/Monsunwald |
| `dipterocarp-timber` | hohes tropisches Hartholz | tropischer Regenwald |
| `mangrove-timber` | salzfest, zäh, bootstauglich | Mangrove |
| `laurel-timber` | feines, insektenabweisendes Möbelholz | Lorbeerwald |
| `poplar-timber` | leicht, schnell, spaltbar | Auenwald |
| `tamarisk-timber` | salztolerant, biegsam | Ufer-/Trockenwald |

### 152 Holzqualitätsklassen

Jeder Batch erhält eine Note aus acht Klassen: **Construction**, **Furniture**,
**Export**, **Ship timber**, **Bow stave**, **Fuel**, **Fibre** und **Cork**.
Die Note verbindet Holzart, Sägeprofil und Region; sie steuert den Preis und
ist im Dossier sichtbar. Ein Bogenprofil kann aus elastischer Mangrove oder
Sitka einen Bogenstave machen, aber nicht aus weichem Baumfarn.

### 153 Spezialisierte Sägewerke

| Profil | Annahme | Wirkung |
| --- | --- | --- |
| General saw bench | alle Stämme | neutraler Batch |
| Hardwood saw | Hartholz | +1 Brett, −1 Brennholz, Möbelqualität |
| Softwood saw | Weichholz | +1 Brennholz, Bauqualität |
| Ship timber saw | schiffbaugeeignete Stämme | −1 Brett, Schiffbauholz |
| Bow stave bench | elastische Hölzer | −1 Brett, Bogenstäbe |

Das Profil wird auf der Gebäude-Entität gespeichert und beim Laden
wiederhergestellt. Die Auswahl ist eine echte Spielentscheidung, weil sie
Annahme, Ausbeute, Qualität und Marktpreis gleichzeitig verändert.

### 154 Regionale Möbelmanufakturen

Der Modus **Furniture manufactory** verbraucht zwei Bretter und erzeugt ein
Möbelstück. Der Stil kommt aus der Region des Betriebs, nicht aus einer
globalen Liste:

| Stil | Region | Aufschlag |
| --- | --- | --- |
| Nordic plank | borealer Taiga | +8 % |
| Rainforest bentwood | gemäßigter Regenwald | +12 % |
| Citrus inlay | mediterraner Hartlaubwald | +16 % |
| Carved oak | gemäßigter Laubwald | +10 % |
| Lacquered cane | Tropen | +18 % |
| Wrought acacia | Savanne | +12 % |
| Driftwood | Küste | +8 % |
| Alpine joined | Gebirge | +10 % |
| Steam-bent | Feuchtgebiet | +9 % |
| Court joinery | Standard | +6 % |

Damit ist dasselbe Rezept in zwei Reichen ein anderes Produkt. Ein
mediterraner Betrieb mit Citrus-Einlage erzielt einen anderen Preis als eine
nordische Plank-Manufaktur, ohne dass eine zweite Rezept-Engine nötig ist.

## 155–160: Harz, Pech, Kork, Tannin, Farben und Medizin

- **155 Harz** kommt als saisonaler Rohstoff aus Nadel- und Mischwäldern. Es
  speist den Resin still und ist Eingabe für Pech, Teer und Medizin.
- **156 Pech und Teer** werden im Resin still und im Tar kiln erzeugt. Sie sind
  echte Waren für Schiffbau und Belagerungsbedarf; der Marktpreis reagiert auf
  die Nachfrage, und der Atlas nennt den Verbraucher.
- **157 Kork** stammt ausschließlich von der Korkeiche. Der Cork stripping shed
  verarbeitet `cork-bark` zu Kork; nur mediterrane Korkeichenbestände liefern
  die Rinde. Das macht den Standort zu einem langfristigen Exportvorteil.
- **158 Tannine** entstehen im Tannin yard aus Rinde. Gerberei und Färberei
  lesen dieselbe Ware; Rinde wird dadurch ein Nebenprodukt mit echtem Preis.
- **159 Natürliche Farbstoffe** entstehen im Dye works aus Beeren, Flechten und
  Tannin. Die Rezeptur akzeptiert mehrere regionale Beerensorten, sodass der
  Spieler seinen Waldbestand an die Farbpalette anpassen kann.
- **160 Medizin** entsteht im Forest apothecary aus Kräutern, Rinde und Harz.
  Sie ist eine normale Ware und erreicht die vorhandenen Gesundheits- und
  Handelsverbraucher; die Werkstatt ist kein isolierter Heilzauber.

## 161–167: Nahrung, Jagd, Bienen, Fisch und Weide

Diese Punkte nutzen die bestehende Forstsammlung und die vorhandenen
Wild-/Herdenpfade. Die neuen Industrierohstoffe werden in `forestGathering`
geführt und über die bekannten Sammel-, Jagd-, Fischerei- und Weidepfade
gewonnen:

- **161 Früchte und Beeren** sind saisonale Nahrung und Eingabe für
  Konserven und Farbstoffe. Regionale Beerensorten haben unterschiedliche
  Fenster; der Bestand ist begrenzt und wächst nach.
- **162 Nüsse und Samen** sind haltbare Vorräte und werden in der
  Konservenküche verwendet. Sie geben dem Wald eine Ernte, die nicht sofort
  verdirbt.
- **163 Pilze** sind eine saisonale Nahrungs- und Handelsware. Die
  Konservenküche macht sie haltbar; der Atlas zeigt Saison und Bestand.
- **164 Jagd** nutzt die vorhandenen regionalen Wildarten und die
  Wildbestände. Der Ertrag ist begrenzt, saisonal und von der Waldgesundheit
  abhängig; Raubtiere und Beute bleiben Teil desselben Nahrungsnetzes.
- **165 Honig und Wachs** kommen aus der Waldimkerei. Sie sind Nahrung,
  Handelsware und Rohstoff für die bestehenden Bienen-/Waldprodukte.
- **166 Fischerei** in Waldbächen und Auen liefert `river-fish`/`lake-fish`.
  Der Stream smokehouse macht daraus haltbaren Räucherfisch.
- **167 Waldweide** bleibt an die vorhandenen Herden- und Weidekapazitäten
  gebunden. Rinder, Schafe und Ziegen konkurrieren mit Wild und Holznachwuchs;
  die Weide ist kein kostenloser Bonus.

## 168–170: Köhlerei, Teeröfen und Potasche

- **168 Köhlerei.** Der Charcoal clamp verbraucht drei Brennholz und erzeugt
  zwei Holzkohle. Holzkohle ist eine normale Ware für Schmiede, Metallurgie
  und Winterbedarf; der Betrieb ist ein dauerhafter Käufer für Brennholz.
- **169 Teeröfen.** Der Tar kiln verbraucht Harz und etwas Brennholz und
  erzeugt Teer. Zusammen mit Pech bedient er Schiffbau und Belagerungen.
- **170 Potasche.** Das Potash works verbraucht Brennholz und Rinde und erzeugt
  Potasche. Sie ist eine Fertigware für Glas und Seife und macht Asche bzw.
  Rinde zu einem handelbaren Nebenprodukt.

Alle drei Wege laufen in `runForestWorks` mit denselben Reservezielen und
demselben Lager wie die übrigen Werkstätten. Kein Weg kann den Markt mit
unbegrenzter Ausgabe überschwemmen.

## 171–174: Bauholz, Brennholz, Schiffbau und Bogenbau

- **171 Bau- und Brennholz** sind getrennte Sortimente. Der Batch-Planer
  entscheidet anhand des Sägeprofils, ob ein Stamm als Bauholz, Brett oder
  Brennholz endet; die Bestände werden getrennt geführt.
- **172 Brennholzbedarf** entsteht aus Haushalten, Werkstätten, Köhlerei und
  dem Winter. Der Bedarf ist ein realer Verbraucher, nicht nur eine Zahl im
  Lager; ein Betrieb ohne Brennholz kann seinen Batch nicht ausführen.
- **173 Schiffbauholz** entsteht aus langen, geraden Stämmen im
  Ship-timber-Profil. Es ist eine eigene Fertigware mit eigenem Preis und
  einem echten Verbraucher im Schiffbau.
- **174 Bogenholz** entsteht aus elastischen Hölzern im Bow-stave-Profil.
  Elastizität und Holzart entscheiden, ob der Batch Bogenstäbe liefert; weiche
  Hölzer werden abgelehnt.

## 175–180: Papier, Seide, Kautschuk, Bambus, Palmöl und Gewürze

- **175 Papier** entsteht in der Paper mill aus Rinde, Kräutern und Wasser.
  Papier ist eine normale Ware für Verwaltung, Handel und die vorhandenen
  Papierverbraucher.
- **176 Seide** entsteht im Mulberry silk house aus Maulbeerblatt. Nur
  Maulbeerwälder liefern das Blatt; der Betrieb macht einen spezialisierten
  Wald zu einem langfristigen Seidenstandort.
- **177 Kautschuk** entsteht in der Rubber press aus `natural-rubber`. Der
  tropische Rohstoff wird zu einer Fertigware mit eigenem Markt und
  Verbraucher.
- **178 Bambusfasern** entstehen im Bamboo splitting yard aus Bambus. Sie sind
  eine leichte Konstruktions- und Flechtware und öffnen tropischen Wäldern
  einen Nicht-Holz-Export.
- **179 Palmöl und Palmwedel** entstehen in der Palm press and thatch yard aus
  `palm-oil` und `palm-fibre`. Beide Waren haben eigene Verbraucher und Preise;
  der Betrieb ist kein bloßer Holz-Ersatz.
- **180 Gewürze** entstehen im Spice sorting house aus Pfeffer, Zimt, Muskat,
  Nelken, Kardamom oder Allspice. Die Rezeptur akzeptiert mehrere regionale
  Gewürze; das macht Fernhandel und Standortwahl zu einer echten Entscheidung.

## Die 17 Werkstattwege

| Modus | Standardeingabe | Rohstoff | Ausgabe |
| --- | --- | --- | --- |
| Charcoal clamp | 3 Brennholz | — | 2 Holzkohle |
| Potash works | 3 Brennholz | 1 Rinde | 1 Potasche |
| Furniture manufactory | 2 Bretter | — | 1 Möbel |
| Resin still | — | 3 Harz | 2 Pech |
| Tar kiln | 1 Brennholz | 4 Harz | 2 Teer |
| Tannin yard | — | 3 Rinde | 2 Tannin |
| Dye works | 1 Tannin | 2 Beeren + 1 Flechte | 2 Farbe |
| Forest apothecary | — | 2 Kräuter + 1 Rinde + 1 Harz | 1 Medizin |
| Paper mill | 2 Wasser | 2 Rinde + 1 Kräuter | 2 Papier |
| Mulberry silk house | 1 Brennholz | 3 Maulbeerblatt | 2 Seide |
| Rubber press | — | 3 Naturkautschuk | 2 Kautschuk |
| Bamboo splitting yard | — | 3 Bambus | 2 Bambusfaser |
| Palm press and thatch yard | — | 2 Palmöl + 2 Palmfaser | 2 Palmöl + 1 Palmwedel |
| Spice sorting house | — | 2 Pfeffer + 2 Zimt | 2 Gewürze |
| Cork stripping shed | — | 3 Korkrinde | 2 Kork |
| Stream smokehouse | 1 Brennholz | 3 Flussfisch | 2 Räucherfisch |
| Forest preserve kitchen | 1 Wasser | 2 Beeren + 2 Pilze | 2 Konserven |

Die Tabelle ist die Spielanleitung; die verbindliche Definition steht in
`FOREST_WORKS_MODES`. Ein Modus kann nur laufen, wenn sein Standort die
geforderten Rohstoffe tatsächlich liefern kann. `modeFitsStand()` prüft die
Region, bevor der Spieler den Batch startet.

## Markt, Reserveziele und Langzeitmotivation

Der Forest Atlas zeigt für jede Fertigware den physischen Bestand, den
Verkaufspreis und einen direkten Verkaufsknopf. Der Verkauf geht durch
`getPhysicalStock()` und dieselbe Warenbuchhaltung wie jeder andere Handel.
Die Werkstatt produziert nur bis zu den gemeinsamen Reservezielen; dadurch
bleibt ein Betrieb wirtschaftlich, ohne die Lager unbegrenzt zu füllen.

Langfristig entstehen mehrere sich überlagernde Ziele:

- **Standortwahl:** Kork, Teak, Rotzeder und Maulbeerblatt sind nicht überall
  verfügbar. Ein Reich kann nicht jede Nische gleichzeitig optimal bedienen.
- **Waldpflege:** Wer Rinde, Harz und Beeren will, muss den Bestand anders
  behandeln als ein reines Sägeholz-Reich. Die Ernte ist begrenzt und
  regeneriert.
- **Qualität:** Ein höheres Sägeprofil und bessere Stämme erzeugen bessere
  Qualitätsklassen und höhere Preise; das lohnt sich über Jahrzehnte.
- **Handel:** Fertigwaren mit eigenem Preis und Verbraucher schaffen neue
  Exporte und neue Abhängigkeiten. Ein Krieg oder eine Blockade trifft nicht
  mehr nur Getreide.
- **Arbeit:** Jede Werkstatt braucht Arbeitskräfte. Der Wald wird vom
  Rohstofflieferanten zum Arbeitgeber und zur Steuerbasis.

## 3.76.0 — Lebendige Waldgilde, Meisterwerkstätten und Klinikversorgung

Die dreißig Punkte waren vollständig gebaut, aber die zwanzig Fertigwaren hatten
noch überwiegend nur einen Markt. 3.76.0 schließt diese Lücke mit drei echten,
wiederkehrenden Verbrauchern. Der Bestand bleibt derselbe: **30/30 Punkte**,
18 Holzarten, 8 Qualitätsklassen, 5 Sägeprofile, 17 Werkstattwege, 20 Güter,
10 Möbelstile und 1.680 Audit-Anforderungen. Neu ist die lange Kette danach.

### Was konkret hinzugekommen ist

- **16 Gilden-Patrone** decken alle zwanzig Fertigwaren ab. Jeder Patron hat
  einen politischen Stand, eine eigene Bestellung, einen Auftragstext und eine
  Mindeststufe. Die Palette reicht von der Worshipful Company of Goldsmiths
  (Holzkohle, Potasche) über die Crown Navy (Schiffbauholz, Pech, Teer) bis zur
  Society of Woodland Explorers (Kautschuk, Bambusfaser, Palmwedel, Gewürze).
- **Drei aktive Aufträge** sind immer auf dem Brett. Nach Lieferung oder Ablauf
  wird sofort ein neuer Auftrag aus dem gespeicherten deterministischen Strom
  gezogen. Es gibt keine endliche Auftragsliste und keinen unbegrenzten
  Verlauf: nur drei aktive Aufträge und die letzten zwölf Archivzeilen.
- **Zehn Renown-Stufen** von Harbour Factor (0) bis Eternal Patron (760).
  Jede Stufe erhöht den Marktpreis aller Waldwaren dauerhaft um +2 %, maximal
  +18 %. Höhere Stufen schalten exotischere Patrone und größere, teurere
  Lieferungen frei. Renown ist damit ein Langzeitfortschritt, der neue Verkäufe
  besser macht, statt nur eine Zahl im Dossier zu sein.
- **Echte Lieferung:** `deliverForestCommission` prüft zuerst den tatsächlich
  unreservierten Lagerbestand. Ist genug Ware da, werden die Güter über
  `consumeFromWarehouse` aus den passenden Lagerhäusern entnommen, als
  Warenbewegung gebucht und über `addResource("gold")` bezahlt. Fehlt Ware,
  passiert nichts; es wird keine Teilmenge verbraucht und kein Gold erzeugt.
- **Gildenpolitik:** Eine Lieferung erhöht Gildenruf und Legitimität und bewegt
  die Fraktion des Patrons über `applyPoliticalEffects`. Ein abgelaufener Auftrag
  kostet 3 Renown und etwas Gildenruf; das Brett rotiert weiter. Dadurch hängen
  Waldwirtschaft, Hof, Glaube und Diplomatie an derselben Politiksimulation.
- **Vier Meisterschaftsstufen pro Werkstatt:** Apprentice (0 Batches),
  Journeyman (12), Master (36), Guild Master (80). Jede Stufe speichert nur eine
  Zahl auf dem Gebäude (`forestBatches`), gibt einen dauerhaften
  Möbelprestigebonus und erzeugt ab Stufe 2 deterministisch eine zusätzliche
  Einheit pro 8, 5 bzw. 3 Batches. Der Bonus läuft durch `addLocalOutput` und
  respektiert das physische Ausgangslager sowie die Reservegrenzen.
- **Klinikversorgung:** `supplyClinicMedicine(6)` entnimmt Medizin aus echten
  Waldlagerhäusern und füllt den bestehenden öffentlichen Klinikvorrat
  (`MEDICINE_MAX_STOCK = 60`). Die Atlas-Anzeige nennt den verfügbaren
  Lagerbestand und den aktuellen Klinikbestand. Damit hat das Apotheker-Rezept
  einen echten Spielerpfad bis zur behandelten Krankheit.
- **UI:** Der Forest Atlas zeigt Gildenstand, Renown-Fortschritt, die drei
  Patronkarten mit Menge, Lagerbestand, Belohnung, Frist und Lieferknopf, die
  letzten zwölf Aufträge sowie die Klinikversorgung. Das Gebäude-Dossier zeigt
  Meisterschaftsrang, Batches und nächste Stufe.

### Wie das die Deepsimulation vertieft

Die neue Kette ist bewusst keine parallele Wirtschaft. Ein Auftrag liest
`warehouse.stored` und `warehouse.reservedOut`, schreibt eine Warenbewegung und
eine Goldbewegung, verändert `politics` und landet im selben Ereignisprotokoll
wie Steuern, Kriege und Gerichtsfälle. Die Werkstattmeisterschaft entsteht nur
aus echten `runForestWorks`-Batches. Die Klinikmedizin läuft durch dieselbe
Logistik und denselben Gesundheitsvorrat wie Ausbrüche und Heiler. So gilt:
**Ökologie → Sammlung → Werkstatt → Carrier → Lager → Gilde/Klinik → Gold,
Renown, Fraktion, Gesundheit.** Jede Unterbrechung ist für den Spieler sichtbar.

### Endloser Content, aber begrenzter Zustand

Das Brett ist ein unendlicher Generator mit festem Speicherbild: 16 Patrone,
mehrere Güter pro Patron, stufenabhängige Mengen, deterministische Belohnungen
und drei rotierende Plätze. Ein 100-Jahres-Reich kann immer weiter spielen,
ohne dass die Historie unbegrenzt wächst oder ein zweiter Simulator entsteht.
Neue Inhalte lassen sich später als weitere Patrone, Güter oder Auftragstypen
in den Katalog aufnehmen, ohne die Laufzeitform zu ändern.

## Integration und Speicherung

- **Daten:** `WOOD_PROPERTIES`, `WOOD_QUALITY_CLASSES`, `SAW_PROFILES`,
  `FOREST_WORKS_MODES`, `FURNITURE_STYLES`, `INDUSTRY_GOODS` und
  `FOREST_INDUSTRY_REQUIREMENTS`.
- **Laufzeit:** `runForestWorks`, `updateForestIndustry`, `forestWorksStatus`,
  `setForestWorksMode`, `setSawProfile`, `forestIndustrySummary`,
  `industryQuote`, `industrySaleRows`, `sellForestIndustryGood`,
  `supplyClinicMedicine`, `forestMasteryFor`; Gildenlaufzeit in
  `js/systems/forest-guild.js` mit `ensureForestGuild`,
  `deliverForestCommission`, `updateForestGuild`, `forestGuildSummary` und
  `consumeIndustryGoodFromWarehouses`.
- **Gebäude:** `TYPE.FOREST_WORKS = 89`, Baukosten 38 Holz / 18 Stein / 10 Gold,
  zwei Arbeitsplätze, Beruf `woodwright`.
- **Logistik:** `RECIPES[TYPE.FOREST_WORKS]` ist ein `custom`-Rezept mit 48
  Input-/Output-Kapazität; `requestSupply` akzeptiert `acceptedInputs`.
- **Save:** `sawProfile`, `forestMode` und `forestBatches` werden auf der
  Entität serialisiert und beim Laden wiederhergestellt. Der Gildenstand liegt
  unter `economy.productionChains.forestGuild`; der bestehende
  `restoreEconomyCycleState` erhält ihn ohne Migration. Alte Saves öffnen mit
  einem frisch gezogenen Brett und ohne Fortschrittsverlust.
- **Cadence:** `FOREST_INDUSTRY_INTERVAL = 30`, maximal acht Werkstätten pro
  Lauf; `FOREST_GUILD_INTERVAL = 30`, höchstens drei ablaufende Aufträge pro
  Prüfung. Keine unbegrenzte Arbeit pro Frame.
- **UI:** Management-Dossier mit Sägeprofil, Werkstattmodus, Status, Batches,
  Meisterschaft, Batch-Knopf und Verkauf; Forest Atlas mit 17-Pfad-Katalog,
  Markt, Gildenbrett, Klinikversorgung und den 30 Anleitungen.

## Verifikation

```bash
cd game
npm test
npm run test:forest-industry-ui
npm run test:campaign
npm run spec:audit
```

Die Browser-Referenz baut eine echte Forest Works, öffnet den Atlas und den
Feldguide, füllt einen lagerbasierten Gildenauftrag, versorgt die Klinik mit
Medizin, verkauft Holzkohle aus dem Lager, wechselt den Werkstattmodus und
führt einen echten Batch aus. Die fokussierten Systemtests prüfen zusätzlich
deterministische Bretter, Ablauf/Rotation, Meisterschaftsboni und den
Lagerabzug der Klinik. Der Spec-Audit führt alle dreißig Punkte als eigene
Sektion `1.2.23.1.151–180`; jeder Eintrag nennt seinen echten Verbraucher. Der
25-Jahres-Feldzug bleibt deterministisch und grün.

## 3.77.0 — Zertifizierte Aufträge, Karawanen, Patronpakte und Großabnehmer

Dieser Pass schließt die fünf zuvor offenen Spielerpfade. Die Waldwirtschaft
bleibt eine Kette über vorhandene Lager, Carrier, Politik und Forschung; es
gibt keine neue Währung und keinen zweiten Simulator.

- **Möbelstil und Mindestqualität:** Jeder Möbelauftrag nennt jetzt einen Stil
  und eine Qualitätsklasse. `deliverForestCommission` prüft den unreservierten
  Möbelbestand **und** die passenden Provenienzlose, bevor es etwas entnimmt.
  Ohne vollständigen Nachweis bleibt die Ware unangetastet.
- **Gildenkarawanen:** Jeder neue Auftrag startet eine Karawane. Ankunft,
  Verzögerung und Überfall kommen deterministisch aus dem gespeicherten
  Gilden-PRNG. Erst nach `arrived` ist die Lieferung möglich; ein Überfall
  verlangt einen bezahlten Geleitschutz. Pro Auftrag wird nur ein kleiner
  Karawanenzustand gespeichert.
- **16 Patronpakte:** Drei Lieferungen an denselben Patron schalten dessen
  dauerhaften, individuellen Bonus frei (Warenpreis, Forschung oder
  Marinehandel). Der Pakt läuft über dieselben `politics`-/Ruf-Pfade und ist im
  Patronregister sichtbar.
- **Schiffbauwerft und Papiermühle:** `TYPE.SHIPYARD = 90` verbraucht
  Schiffbauholz, Pech, Teer, Holzkohle und Potasche für Flottenhüllen;
  `TYPE.PAPER_MILL = 91` verbraucht Papier, Potasche und Holzkohle für
  Forschungsreserve. Beide sind normale, von Carriern versorgte Gebäude mit
  sichtbarem Status `ready`, `starved` oder `unstaffed`. Eine Stockung
  verbraucht keine Teilware.
- **Meisterwerke mit Provenienz:** Seltene, deterministisch gewürfelte
  Meisterwerk-Möbel aus Meisterschafts-Batches tragen Stil, Region, Werkstatt,
  Meister, Jahr, Wert und Prestige. Sie erscheinen im Dynastiearchiv und im
  Gildenbereich; das Provenienzledger ist auf 120 Lose, das Meisterwerkarchiv
  auf 24 Einträge begrenzt.
- **Neue Grenzen:** `FOREST_FURNITURE_LOT_LIMIT = 120`,
  `FOREST_MASTERWORK_LIMIT = 24`, `FOREST_GUILD_ACTIVE_LIMIT = 3`,
  `GRAND_CONSUMER_INTERVAL = 60`. Alte Saves erhalten Standardwerte; alte
  Aufträge bekommen eine bereits angekommene Legacy-Karawane.

Verifiziert mit fokussierten Systemtests, vollständigem `npm test`, dem
25-Jahres-Feldzug, dem Spec-Audit und `test:forest-industry-ui` inklusive
Screenshot von Gildenauftrag, Karawane, Werft/Papiermühle und
Dynastie-Provenienz.
