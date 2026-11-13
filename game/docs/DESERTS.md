# Wüsten und Halbwüsten 1.2.8

Wüsten sind kein sandfarbenes Grasland. `game/js/world/desert-ecology.js`
leitet aus Höhe, Feuchte, Temperatur, Klima, Jahreszeit, Wetter, Wind und
realer Landnutzung ein deterministisches Profil ab. Dasselbe Profil versorgt
Terrain, Sammeln, Farm-/Stallübersicht und den gemeinsamen Warenkatalog. Es
gibt keine zusätzliche Tick-Schleife, keine neuen Save-Felder und keine
per-Kachel gespeicherten Zustände.

## Implementierung

- **Ökologie:** `desert-ecology.js` mit `desertPotentialAt()`,
  `isDesertSite()`, `desertProfileAt()`, `desertGoodsFor()`,
  `desertProductsAt()`, `desertSummary()` und `desertRequirement()`.
- **Landformen:** zehn Formationen von Sandmeer und Dünenfeld über Fels-,
  Geröll-, Kies- und Salzfläche bis Kalt-, Gebirgs- und Trockenbeckenwüste.
- **Dünen:** kleine Sandhügel, große Wanderdünen, lange Kämme,
  halbmondförmige Dünen und Windverwehungen; vier Sandsandfarben.
- **Fels:** freiliegende Felsen, Blöcke, Steilwände, Tafelberge, Canyons,
  zerklüftete Hänge, Verwitterung, Geröllfelder, Erosionsrinnen, Höhlen und
  Spalten.
- **Vegetation:** Trockengräser mit tiefen Wurzeln, Dornsträucher, Sukkulenten,
  Regenblüher, Kräuter und Palmen. Oasen tragen Palmhaine, Wasser, fruchtbaren
  Boden, Felder und Obstpflanzungen.
- **Tiere:** Wüstenfuchs, Sandkatze, Schlangen, Warane, Skorpione, Käfer,
  Springmaus, Sandratte, Geier und Kamele; nachtaktive und weitgehend
  wasserunabhängige Arten.
- **Waren:** Salz, Sand, Gestein, Edelsteine, Kupfererz, Heilkräuter, Datteln,
  Pflanzenfasern, Harz und archäologische Funde. Bestehende Güter wie Wolle,
  Häute, Wild und Felle bleiben im selben Ledger.
- **Terrain:** `terrain.js` wählt auf offenen, trockenen Flächen zuerst das
  Wüstenprofil und ruft `desert-render.js` auf. Palmen laufen über das
  bestehende Baumraster; die Windpass nutzt das Wüstenprofil mit.
- **Sammeln:** `gatherMeadowProducts()` und
  `gatherNearestGrasslandProducts()` prüfen Wüste vor Steppe vor Grasland.
  Datteln liefern Nahrung, Wüstenkräuter Medizin, die übrigen neuen Waren
  Gold; Salz und Wolle sind ebenfalls lieferbar.
- **Siedlungen:** `grasslandSiteSummaryAt()` zeigt auf Wüstenkacheln die
  Wüstenübersicht. Oasen melden Wasser, Anbau, Karawanen und
  Siedlungseignung über denselben Farm-/Stallpfad.

## 75-Punkte-Audit

| ID | Umsetzung |
| --- | --- |
| 1.2.8.1 | `sand-sea`/`dune-field`, breite Dünenfelder, `drawDune` |
| 1.2.8.2 | `rock-desert`, `rocks.exposed` |
| 1.2.8.3 | `gravel-desert`, `soil.gravel`, Geröllpunkte |
| 1.2.8.4 | `pebble-plain`, `soil.pebble`, Kiesflächen |
| 1.2.8.5 | `salt-flat`, `soil.salt`, helle Salzkruste |
| 1.2.8.6 | `semi-desert`, verstreute Gräser und Sträucher |
| 1.2.8.7 | `cold-desert`, Frost-/Kälteprofil, Schneeauflage |
| 1.2.8.8 | `mountain-desert`, hohe Relief-Bedingungen |
| 1.2.8.9 | `dry-basin`, geschlossene trockene Becken |
| 1.2.8.10 | Dünentyp `small-hills` |
| 1.2.8.11 | Dünentyp `great-dunes`, große Dünenkörper |
| 1.2.8.12 | Dünentyp `linear-ridges` |
| 1.2.8.13 | Dünentyp `crescent-dunes`, halbmondförmige Silhouette |
| 1.2.8.14 | Dünentyp `wind-scour`, Windverwehungen |
| 1.2.8.15 | `DESERT_SANDS` mit vier Farben, `sand.hex`, Renderer |
| 1.2.8.16 | `exposedRock`, Fels zwischen Sandflächen |
| 1.2.8.17 | Sand an Felswänden/Bauten, `sand` + `rock`, Bodenwäsche |
| 1.2.8.18 | `rocks.boulders`, freistehende Blöcke |
| 1.2.8.19 | `rocks.cliff`, steile Felswände |
| 1.2.8.20 | `rocks.mesa`, Tafelberge mit Plateau |
| 1.2.8.21 | `rocks.canyon`, Schluchten im Renderer |
| 1.2.8.22 | `rocks.rugged`, zerklüftete Gebirgsabschnitte |
| 1.2.8.23 | `rocks.weathered`, verwitterte Formationen |
| 1.2.8.24 | `rocks.scree`, Geröllfelder |
| 1.2.8.25 | `rocks.erosion`, Erosionsrinnen |
| 1.2.8.26 | `rocks.cave`, Höhlen und Felsspalten |
| 1.2.8.27 | `DESERT_SHRUBS` mit `thorny`, Dornzweige |
| 1.2.8.28 | `DESERT_GRASSES` mit `deepRoot` |
| 1.2.8.29 | `DESERT_SUCCULENTS`: Agave, Aloe, Kaktus, Euphorbie |
| 1.2.8.30 | `DESERT_FLOWERS`, `bloom` nach Regen |
| 1.2.8.31 | `deepRoot` und `vegetation.deepRoots` |
| 1.2.8.32 | `DESERT_PALMS`, verstreute Palmen |
| 1.2.8.33 | Halbwüste mit höherer Grasdichte |
| 1.2.8.34 | `vegetation.groundwater`, Vegetation an Wasseradern |
| 1.2.8.35 | `water.spring`, natürliche Quelle |
| 1.2.8.36 | `water.oasis` + `vegetation.palms`, Palmhain |
| 1.2.8.37 | `water.pond`, kleine Seen und Teiche |
| 1.2.8.38 | `soil.fertile`, fruchtbarer Oasenboden |
| 1.2.8.39 | `settlement.fields`, kleine Ackerflächen |
| 1.2.8.40 | `settlement.orchards`, Obst-/Nutzpflanzen |
| 1.2.8.41 | `water.waterhole`, Tiertränken |
| 1.2.8.42 | `settlement.label` Karawanenrast, `drawCaravan` |
| 1.2.8.43 | `settlement.suitable`, Siedlung an Wasserstelle |
| 1.2.8.44 | `DESERT_FAUNA.fennec`/`sand-cat` |
| 1.2.8.45 | `horned-viper` und `monitor-lizard` |
| 1.2.8.46 | `scorpion` und `darkling-beetle` |
| 1.2.8.47 | `jerboa` und `sand-rat` |
| 1.2.8.48 | `vulture`, Aasfresser |
| 1.2.8.49 | `camel`, angepasstes Nutztier |
| 1.2.8.50 | `nocturnal`, nachtaktive Arten |
| 1.2.8.51 | `waterIndependent`, hohe Wasserunabhängigkeit |
| 1.2.8.52 | `materials.salt`, Salz/Mineralien |
| 1.2.8.53 | `desert-sand` und `desert-stone` |
| 1.2.8.54 | `materials.gems`/`metal`, Edelsteine/Kupfer |
| 1.2.8.55 | `DESERT_HERBS`, `desert-herb` als Medizin |
| 1.2.8.56 | `dates`, Oasenfrüchte |
| 1.2.8.57 | `hides`, `wool` aus der Wüstenfauna |
| 1.2.8.58 | `desert-resin`, seltene Harze |
| 1.2.8.59 | `materials.archaeology`, `archaeological-find` |
| 1.2.8.60 | `hazards.heat`, extreme Taghitze |
| 1.2.8.61 | `hazards.nightCold`, starke nächtliche Abkühlung |
| 1.2.8.62 | `hazards.sandstorm`, Sandstürme |
| 1.2.8.63 | `hazards.dust`, staubige Winde |
| 1.2.8.64 | `hazards.heavyRain`, seltene heftige Regenfälle |
| 1.2.8.65 | `hazards.flashFlood`, Sturzfluten |
| 1.2.8.66 | `hazards.drought`, Dürreperioden |
| 1.2.8.67 | `hazards.visibility`, Sichtbehinderung |
| 1.2.8.68 | `water.scarcity`, hohe Bedeutung des Wassers |
| 1.2.8.69 | `economy.supplyCost`, hohe Truppenversorgungskosten |
| 1.2.8.70 | `economy.agriculture`, schwierige Landwirtschaft |
| 1.2.8.71 | `waterhole` + `caravan`, Routen zwischen Wasserstellen |
| 1.2.8.72 | `economy.wellControl`, strategische Brunnenkontrolle |
| 1.2.8.73 | `economy.caravanTrade`, Karawanenhandel |
| 1.2.8.74 | `economy.building`, spezialisierte Bauweisen |
| 1.2.8.75 | `economy.storage`, hohe Bedeutung der Vorratshaltung |

## Verifikation

- `node --test tests/world/desert-ecology.test.js tests/presentation/desert-render.test.js`
  prüft alle 75 IDs, die Vollständigkeit der Vokabulare, Determinismus,
  Wertebereiche, Jahreszeiten, Oasen, Gefahren, Waren, Lieferkanäle und alle
  zehn Renderer-Formationen.
- Der Zehn-Kachel-Sampler im Test erreicht alle 75 IDs sowie alle zehn
  Formationen, vier Sandfarben und fünf Dünentypen.
- `desert-render.test.js` prüft endliche Koordinaten und eine harte
  Aufrufobergrenze bei 18–96 px Kachelgröße, damit Detailreichtum nicht in
  ungebremsten Zeichenaufwand umschlägt.
- Bestehende Wald-, Grasland-, Steppen-, Inventar- und UI-Tests bleiben die
  Regressionsbasis; die Wüste teilt deren Pfade.
