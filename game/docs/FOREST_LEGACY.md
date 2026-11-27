# Langfristige Wald-Systeme, Events, Modding und QA (3.89.0)

**Punkte:** `1.2.23.1.271–300` · **Status: implementiert und verdrahtet**  
**Jahrespass:** einmal pro Jahr in der bestehenden Annual-Maintenance-Kette  
**Save:** additiv unter `state.forestLegacy`, Schema 15 bleibt unverändert

## Was der Spieler sieht

Der **Forest Legacy**-Block steht im Forest Atlas unter Waldkultur und Waldkrieg.
Zehn Provinzwälder zeigen ihren regionalen Waldtyp, Klimadruck, Höhenlage,
Artencohorten, sechs Gefahrenchroniken, Jahresringe, drei
Jahrhundert-Projektionen und ihre echten Aktionen. Die Anzeige ist ein Reader
über denselben Ledger, den die Jahres-Simulation schreibt; sie erzeugt keine
zweite Karte und keinen zweiten Tick.

Jeder Wald ist eine Provinz, nicht ein eigener Waldtyp: Die zehn Regionen
verwenden die vorhandenen `REGIONAL_FOREST_TYPES`, `REGIONAL_SPECIES`,
`FOREST_FAUNA` und `FOREST_CULTURE_REGIONS`. Dadurch bleiben die 60
Waldformationen und ihre bestehenden Ökologie-, Ernte- und Atlas-Pfade die
einzige Quelle für Holz, Arten und Darstellung.

## Die 30 Punkte und ihr Live-Verbraucher

| Punkt | System | Live-Verbraucher |
|---|---|---|
| 271 | Waldsukzession über Jahrhunderte | `forestLegacyCentury`, jährlicher Phasenwechsel |
| 272 | Langsame Klimaverschiebung der Waldtypen | `getClimateDrift`, `region.climateShift`, Typwechsel |
| 273 | Artenwanderung in kühlere Höhenlagen | `advanceSpeciesMigration` |
| 274 | Lokales Aussterben von Baum- und Tierarten | `advanceExtinctionRisk` |
| 275 | Wiederansiedlung verschwundener Arten | `reintroduceForestSpecies` |
| 276 | Naturschutz als politische Entscheidung | `setForestConservationLaw` |
| 277 | Schutzgebiete mit eigenen Regeln | `protectForestRegion`, `forestLegacyRegionRules` |
| 278 | Aufforstung und Wiederbewaldung | `afforestForestRegion`, Baumschule |
| 279 | Waldbrand als regionales Großereignis | `applyForestHazard("fire")`, `advanceHazards` |
| 280 | Dürre mit Baumsterben und Ernteausfällen | `applyForestHazard("drought")`, `advanceHazards` |
| 281 | Stürme mit Windwurf und Trümmern | `applyForestHazard("storm")`, `advanceHazards` |
| 282 | Insektenkalamitäten in Nadelwäldern | `applyForestHazard("insect")`, `advanceHazards` |
| 283 | Invasive Arten mit Verdrängung | `applyForestHazard("invasive")`, `advanceHazards` |
| 284 | Pilzepidemien mit regionalen Wirten | `applyForestHazard("fungus")`, `advanceHazards` |
| 285 | Samenbanken für bedrohte Waldtypen | `buildForestInstitution("seed-bank")` |
| 286 | Genbanken und Erhaltungszucht | `buildForestInstitution("gene-bank")` |
| 287 | Baumschulen für Wiederaufforstung | `buildForestInstitution("nursery")` |
| 288 | Waldmuseum und Naturkundesammlung | `buildForestInstitution("museum")`, Codex |
| 289 | Naturdenkmäler und geschützte alte Bäume | `designateForestMonument` |
| 290 | Jahresringe als Klimaarchiv | `forestLegacyRingArchive` |
| 291 | Alte Bäume mit eigener Geschichte | `monument.story` im Regionsdetail |
| 292 | Bürgerwissenschaft für Artenbeobachtung | `fundCitizenScience`, jährliche Beobachtungen |
| 293 | Modding eigener Waldtypen und Arten | `data-packs.js` `forests`, `forestLegacyModdedTypes` |
| 294 | Community-Szenarien mit regionalen Wäldern | `scenario.forestType`, `applyScenarioStart` |
| 295 | Erfolge für Entdeckung und Schutz | `evaluateAchievements`, 8 Achievements |
| 296 | Codex für Bäume, Tiere und Waldkulturen | `forestLegacyCodex` |
| 297 | Referenz-Seeds für visuelle/ökologische Tests | `FOREST_LEGACY_REFERENCE_CASES` |
| 298 | Browser-Tests für jede Waldregion | `tests/browser/forest-legacy-mobile.mjs` |
| 299 | Langzeit-Soaks für Wachstum und Artenverschiebung | `scripts/forest-legacy-soak.mjs` |
| 300 | Roadmap-Leitplanken | `FOREST_LEGACY_GUARDRAILS` und Save-/Determinismus-Tests |

## Jahrespass

`updateForestLegacy()` läuft in `ANNUAL_TASKS` genau einmal pro Jahr, nach
`biomeAtlas`. Er ist idempotent: Ein zweiter Aufruf im selben Jahr ändert
nichts. Der Pass:

1. verschiebt bei anhaltender Erwärmung den regionalen Waldtyp höchstens alle
   `shiftYears` Jahre und passt nur die betroffenen Arten an;
2. bewegt lebende Arten mit dem Klimasignal in höhere Lagen und erhöht dort den
   Hitzestress;
3. erhöht Stress und würfelt deterministisch lokales Aussterben; Samen- und
   Genbanken sichern einen Teil der Fälle;
4. würfelt ein regionales Großereignis aus den sechs Gefahrentypen, abhängig von
   Klima, Schutzstatus und seltener Formation;
5. schreibt Jahresringe, Institutionen, Beobachtungen, Codex und Erfolge;
6. hält alle Felder begrenzt: 10 Regionen, 8 Arten je Region, 60 Ringe,
   40 History-Einträge und 80 Aktionen.

Schutzregeln sind echte Regeln, nicht nur Text: Ein Reservat verbietet
Salvage-Holz, senkt die Gefahrenlast und das Aussterberisiko, erlaubt aber
Aufforstung, Samen- und Genarbeit. Ein Naturdenkmal schützt den benannten Baum
und seine Geschichte. Die Naturschutzgesetze kosten Gold und Legitimität und
sind auf eine Entscheidung pro Jahr begrenzt.

## Aktionen und Kosten

| Aktion | Kosten | Wirkung |
|---|---|---|
| Samenbank / Genbank / Baumschule / Museum | gestaffelt nach Stufe 1–3 | Bestand, Backup, Setzlinge und Codex wachsen jährlich |
| Naturschutzgesetz | Gold, teils Legitimität | eine stehende Politik pro Jahr; beeinflusst Risiko und Schutzstatus |
| Schutzgebiet | 18 Gold | Reserve mit eigenen Regeln und weniger Störung |
| Aufforstung | 10 Gold, 8 Holz, 8 Setzlinge | +4,5 % Kronendach, weniger Stress, echte Biomasse |
| Wiederansiedlung | 14 Gold, Seed oder Genmaterial | holt eine lokal ausgestorbene Art zurück |
| Naturdenkmal | 16 Gold, 6 Holz | benennt einen alten Baum, schützt ihn und schreibt seine Geschichte |
| Bürgerwissenschaft | 18 / 34 / 58 Gold | mehr Beobachtungen, Codex und geringerer Stress |

## Modding und Community-Szenarien

Ein lokales Datenpaket darf bis zu sechs `forests` enthalten. Jeder Eintrag hat
eine ID, einen Namen, Beschreibung, ein bis vier Klimazonen, eine Palette und
zwei bis acht Arten (mindestens ein Baum). IDs werden mit der Pack-ID
namensraumt, Längen und Werte begrenzt und gegen ausführbare Felder geprüft.
Ein Szenario kann mit `forestType` an einen dieser Wälder gebunden werden. Der
Wald wird beim Start über dieselbe `chooseType`-Auswahl in die erste Provinz
gesetzt; ohne installiertes Pack bleibt das Szenario ungültig. Es gibt keine
Plugin-Ausführung, keine URLs und keine DOM-Inhalte.

## Speicher- und Performance-Vertrag

- `state.forestLegacy` ist optional. Alte Saves ohne den Block laden weiter und
  erhalten beim nächsten Jahrespass oder beim Öffnen des Atlas einen frischen,
  deterministischen Ledger.
- `save-runtime.js` serialisiert und restauriert den Ledger; `save-validation.js`
  prüft Version, Seed, Regions-IDs, Art-/Ringgrenzen und Institutionen.
- Kein Per-Frame-, Per-Tick- oder Per-Tile-Aufwand. Der Atlas liest den
  gespeicherten Ledger; der einzige neue Simulationsaufruf ist der Jahrespass.
- Alle Zufallsentscheidungen kommen aus `hash32(seed, region, year, species)`
  und damit aus dem Weltseed, nicht aus `Math.random()`.

## Verifikation

- `tests/systems/forest-legacy.test.js` — 30-Punkte-Manifest, zehn Regionen,
  alle sechs Gefahren, Aktionen, Aussterben/Wiederansiedlung, Save-Roundtrip,
  25-Jahres-Determinismus und 300-Jahres-Soak.
- `tests/core/data-packs.test.js` — Forest-Validierung, Namensraum, Grenzen,
  Scenario-Bindung und installierte Wälder.
- `tests/systems/scenario.test.js` — `forestType` über Definition, Start und
  Normalisierung.
- `tests/core/save-validation.test.js` — optionaler Ledger und alte Saves.
- `tests/browser/forest-legacy-mobile.mjs` — responsive Spielerpfad für
  390×844, 820×1180 und 1440×900: alle zehn Regionen geöffnet, 30 Punkte und
  zehn Jahresringarchive geprüft, alle vier Institutionen und alle acht
  Aktionen ausgeführt (inklusive Bürgerwissenschaft und Naturdenkmal),
  Ein-Aktion-pro-Jahr-Sperre, kein horizontaler Overflow, keine Überlappungen,
  keine abgeschnittenen Ringe und keine Konsolen-/Ladefehler.
- `npm run test:forest-legacy-soak` — zehn Referenz-Seeds × 300 Jahre.

## Leitplanken für neue Waldtypen

1. Neue Typen bleiben additiv in der gemeinsamen Typquelle; kein paralleles
   Waldmodell und keine neue Karte.
2. Jeder neue Typ liefert Klima, Palette und mindestens eine Baumart; fehlende
   Daten dürfen den Start nicht blockieren.
3. Keine Per-Frame-Abfrage: Atlas und Inspektor lesen gecachte oder gespeicherte
   Werte, der Jahrespass bleibt der einzige ökologische Takt.
4. Neue Ledgerfelder brauchen Defaults, eine Obergrenze, Save-Validierung und
   einen Test mit einem alten Save ohne das Feld.
5. Zufall nur aus Weltseed und stabilen Schlüsseln; keine Zeit-, DOM- oder
   Renderabhängigkeit.
6. Ein neuer Waldtyp erhält einen Referenz-Seed und einen Browserpfad, bevor er
   als freigeschaltet gilt.
