# Waldkrieg, Diplomatie, Grenzen und Strategie · 1.2.23.1.211–240

**Status:** implementiert, verdrahtet und als Spielerdurchlauf geprüft (v3.83.0)
**Datenmodell:** `js/world/forest-warfare.js`
**Laufzeit:** `js/systems/forest-warfare.js`
**Grenzschutz:** `js/world/sacred-groves.js` (liest auch gemeinsame Schutzgebiete)
**Browser-Referenz:** `npm run test:forest-war-ui`
**Jahrespass:** `updateForestWarfare()` in `js/simulation/simulation.js`

Die dreißig Punkte sind **eine Kriegs- und Diplomatie-Schicht über dem vorhandenen
Wald**, kein zweiter Feldzugs-, Provinz- oder Wirtschafts-Simulator. Jeder der
vier Nachbarfronten hat ein eigenes regionales Waldprofil, das deterministisch
aus den sechzig bestehenden `REGIONAL_FOREST_TYPES` abgeleitet wird. Dieselbe
Welt, dieselbe Region und derselbe Typ ergeben immer dieselben Sichtlinien,
Bewegungskosten, Hinterhaltwerte, Elefanten, Schiffs- und Belagerungsholz-Qualitäten,
Schmugglerpfade und Erholungsjahre. Alte Saves laden unverändert; alle neuen
Felder liegen additiv unter `state.economy.productionChains.forestWarfare` und
werden beim ersten Zugriff normalisiert.

## Die Grundidee

Ein Wald ist keine Kulisse für einen Kampf. Er entscheidet, **wer den Kampf
annehmen kann**:

- **Sicht** – dichter Wald verkürzt die Sichtlinie. Der Wert senkt die eigene
  Koordination im Gefecht und macht einen Hinterhalt wahrscheinlicher.
- **Bewegung** – Unterholz, Sumpf, Schnee und Monsun verlangsamen eine Kolonne.
  Der Wegzustand und die Jahreszeit ändern den Faktor; ein geschlossener Weg
  bleibt vorhanden, trägt aber weniger Truppen und Handel.
- **Kavallerie** – der regionale Kavallerie-Widerstand plus jede gefällte
  Verhau-Reihe (Abatis) drückt die Kampfkraft berittener Gegner.
- **Elefanten** – nur tropische und Savannenfronten können sie ernähren. In
  jedem anderen Wald wird die Aktion mit dem Geländegrund abgelehnt.
- **Holz** – Belagerungsmaterial und Schiffsbauholz sind getrennte, gedeckelte
  Reserven. Belagerungsmaterial wird im Krieg verbraucht; Schiffsbauholz wird
  jährlich zu einer echten Werfthülle.
- **Menschen** – Siedler, Rebellen, Flüchtlinge, Partisanen und Deportierte
  sind benannte, begrenzte Größen. Sie verändern Kontrolle, Moral, Legitimität
  und die jährliche Provinzbilanz.

## Der Spielerpfad

1. **Front lesen.** Der Forest Atlas zeigt unter dem Kulturteil den
   **Forest War**-Abschnitt: vier Fronten, regionale Kriegstradition,
   Kontrolle, Beziehung, Vertrauen, Furcht, Kriegsmüdigkeit, alle taktischen
   Faktoren, die vier Jahreszeiten des Waldwegs und die offenen Narben.
2. **Grenze bauen.** `BORDER POST` (10 Holz, 6 Gold) erhöht die Kontrolle der
   echten Provinz und senkt den Grenzdruck. `STRENGTHEN WATCH` (8 Gold,
   2 Nahrung) verbessert die Entdeckung. `RECRUIT SCOUTS` (6 Gold, 3 Nahrung)
   bringt Regionalwissen, besseren Hinterhalt und weniger Schmuggel.
3. **Weg öffnen.** `OPEN FOREST ROAD` (12 Holz, 4 Stein, 8 Gold) erhöht die
   Wegstufe. Jede Stufe verbessert Bewegung und Handel; die Jahreszeit
   entscheidet, ob der Weg tatsächlich offen ist.
4. **Krieg führen.** `LAY AMBUSH` verlangt Krieg, Deckung und Späher.
   `FIGHT FOREST BATTLE` rechnet mit echten Soldaten, Sicht, Bewegung,
   Kavallerie, Karten, Verhau und Elefanten. Verwundete und Gefallene werden in
   denselben Soldatenakten eingetragen, die das Militärpanel liest.
5. **Material wirtschaften.** `CUT SIEGE TIMBER` (15 Holz) füllt den
   Belagerungsvorrat; `PRESS SIEGE` verbraucht zehn Einheiten und senkt
   Garnison und Kontrolle. `RESERVE SHIP TIMBER` (12 Holz, 4 Gold) füllt den
   Mastvorrat; zwölf Einheiten werden im Jahrespass zu einer echten Hülle.
6. **Gelände nutzen.** `MUSTER ELEPHANTS`, `FELL ABATIS`, `RAISE PARTISANS`,
   `SET WAR FIRE`, `BURN FOR FIELDS`, `DEPORT WOODLANDERS` und
   `LEVY TIMBER QUOTA` greifen in Gelände, Bevölkerung und Vorräte ein.
7. **Handel und Druck.** `OPEN FOREST ROUTE`, `RUN SMUGGLING`, Embargo auf
   Holz, Harz oder Medizin und Zollsätze von 0, 5, 10 oder 15 Prozent erzeugen
   echtes Gold, echte Beziehung und ein echtes Risiko.
8. **Frieden sichern.** `SIGN BORDER TREATY` (8 Gold) verbietet für acht Jahre
   Hinterhalt, Kriegsfeuer und Partisanen. `CREATE JOINT PRESERVE` (12 Gold)
   markiert eine echte Waldkachel, die der gemeinsame Hain-Schutz vor jedem
   Beil schützt.
9. **Menschen und Wald.** `RECOGNISE WOODLAND RIGHTS`,
   `PRESS SETTLER CLAIMS`, `COLONISE WOODLAND`, `SUPPRESS RESISTANCE`,
   `SETTLE REFUGEES`, `FOUND MILITARY COLONY`, `CLEAR REBEL CAMP` und
   `FUND WAR ECOLOGY` verändern Provinz, Bevölkerung und Wald langfristig.

## Die dreißig Punkte

| Punkt | Umsetzung | Live-Verbraucher |
| --- | --- | --- |
| 211 Wälder als Grenzen | Jede Front erhält ihr regionales Kriegsprofil aus einem der sechzig Waldtypen: Grenzgelände, Deckung, Sicht, Bewegung und Kavallerie. | Vier Fronten, Provinzkontrolle, Gefecht, Hinterhalt |
| 212 Grenzposten und Waldwachen | Post und Wache sind bezahlte, begrenzte Ausbaustufen; sie erhöhen Provinzkontrolle und senken Grenzdruck. | `raiseBorderPost`, `strengthenForestWatch`, Weltkarte |
| 213 Waldwege mit Saison | Drei Wegstufen; jede Jahreszeit hat einen offenen oder geschlossenen Zustand mit regionalem Grund. | Bewegung, Handel, Routenertrag |
| 214 Hinterhalte | Hinterhalt braucht Krieg, Deckung, Späher und Nahrung; er verstärkt das nächste Gefecht und wird dabei verbraucht. | `layForestAmbush`, `fightForestBattle` |
| 215 Späher | Späher sind pro Front begrenzt und verbessern Hinterhalt, Sicht und Schmuggelabwehr. | `recruitForestScouts`, Modifikatoren |
| 216 Waldkampf | Das Gefecht rechnet Sicht, Bewegung, Kavallerie, Karten, Verhau, Elefanten, Partisanen und Moral; es verwundet echte Soldaten. | `fightForestBattle`, Militär, Provinz |
| 217 Belagerungsmaterial | Holz wird zu einem gedeckelten Vorrat; der Sturmangriff verbraucht ihn und senkt Garnison und Kontrolle. | `cutSiegeTimber`, `pressForestSiege` |
| 218 Schiffsbauholz | Mast- und Kielholz ist eine eigene Reserve; zwölf Einheiten werden zu einer echten Flottenhülle. | `reserveShipTimber`, Jahrespass, `state.military.ships` |
| 219 Kriegselefanten | Nur tropische und Savannenfronten können Elefanten mustern; sie kosten jährlich Nahrung. | `musterWarElephants`, Gefecht, Jahrespass |
| 220 Kavalleriehindernisse | Regionale Kavallerie-Bremse plus drei Verhau-Reihen; jede Reihe kostet Holz und Nahrung. | `fellAbatis`, Gefecht |
| 221 Partisanen | Partisanen entstehen nur im Krieg an einer umkämpften Front und entziehen dem Gegner jährlich Kontrolle. | `raiseForestPartisans`, Jahrespass |
| 222 Waldbrände als Waffe | Kriegsfeuer nutzt den echten kontrollierten Brand, senkt feindliche Kontrolle und hinterlässt eine Narbe. | `setWarFire`, Sukzession, Narben |
| 223 Brandrodung | Brandrodung gewinnt Nahrung und Siedler, kostet einen echten Waldbrand und erzeugt Widerstand. | `burnForFields`, Nahrung, Siedler, Narben |
| 224 Deportation | Deportation senkt Rebellen und Siedlerdruck, kostet Legitimität, Moral und erzeugt Flüchtlinge. | `deportWoodlanders` |
| 225 Holzkontingente | Ein jährliches Kontingent verbraucht Holz und Nahrung und liefert Gold und Belagerungsmaterial. | `levyTimberQuota` |
| 226 Embargo | Ein Embargo auf Holz, Harz oder Medizin beendet das Handelsabkommen und verschiebt Beziehung und Furcht. | `setForestEmbargo`, Diplomatie |
| 227 Waldhandelsrouten | Eine Route kostet Holz und Gold und zahlt jährlich Gold; Ertrag liest Wegstufe und Saison. | `openForestTradeRoute`, Jahrespass |
| 228 Zoll | Vier Zollsätze erzeugen jährliches Gold, erhöhen aber Schmuggelrisiko und Abkühlung. | `setForestCustoms`, Jahrespass |
| 229 Schmuggel | Versteckte Waldwege erlauben einen jährlichen Schmuggelzug mit Risiko, Gold und Beziehungsverlust. | `runForestSmuggling` |
| 230 Waldkarten | Karten kosten Gold und Forschung, verbessern Sicht und Hinterhaltabwehr und gelten als Militärgeheimnis. | `commissionWarMaps` |
| 231 Grenzvertrag | Ein Vertrag kostet Gold, hebt Beziehung und Vertrauen und sperrt für acht Jahre die aggressiven Waldaktionen. | `signBorderTreaty`, Jahrespass |
| 232 Gemeinsames Schutzgebiet | Ein Schutzgebiet braucht Vertrag und eine echte Waldkachel; der Hain-Schutz lehnt dort jedes Beil ab. | `createJointPreserve`, `sacredGroveTileAt` |
| 233 Rechte indigener Gemeinschaften | Eine Charta kostet Gold, hebt Legitimität und Moral, senkt Rebellen und dämpft den Holzeinschlag. | `recognizeWoodlandRights`, Modifikatoren |
| 234 Siedlerdruck | Siedlerclaims kosten Nahrung und roden jährlich eine echte Waldkachel; ab dem dritten Claim wächst der Widerstand. | `pressSettlerClaims`, Jahrespass |
| 235 Kolonisation | Drei Claims und ein echter Preis übertragen die Provinz an die Krone und erzeugen Rebellen und Flüchtlinge. | `colonizeWoodland`, Weltkarte |
| 236 Widerstand | Widerstand ist ein benannter Lagerwert; Niederschlagung kostet Gold, Nahrung, Moral und Legitimität. | `suppressForestResistance` |
| 237 Waldflüchtlinge | Flüchtlinge entstehen aus Krieg, Brand, Deportation und Kolonisation; Ansiedlung kostet Nahrung und Holz. | `settleForestRefugees`, Jahrespass |
| 238 Militärkolonien | Eine Militärkolonie kostet Holz, Stein und Gold, gibt Kontrolle und Garnison und isst jährlich Nahrung. | `foundMilitaryColony` |
| 239 Rebellenrückzugsraum | Ein Rebellenlager braucht einen Soldaten und Nahrung zum Räumen; Erfolg und Verwundung sind deterministisch. | `clearRebelCamp` |
| 240 Ökologische Kriegsfolgen | Jede Narbe speichert Kachel, Jahr und Schwere; der Jahrespass heilt sie über die regionalen Erholungsjahre. | Narben, `fundWarEcologyRecovery`, Waldbestand |

## Zustand und Grenzen

```js
state.economy.productionChains.forestWarfare = {
  version: 1,
  fronts: [{
    realmId, provinceId,
    posts, watch, road, scouts, abatis, elephants, partisans,
    siegeMaterial, shipTimber, maps, rights,
    treaty, preserve, embargo, customs, route,
    settlers, colony, rebels, refugees, deportations,
    scars[12], battles, victories, warYears, pressure,
    postYear, watchYear, roadYear, scoutYear, abatisYear,
    elephantYear, partisanYear, ambushYear, battleYear,
    fireYear, burnYear, deportYear, quotaYear, smuggleYear,
    settlerYear, suppressYear, refugeeYear, clearCampYear,
    recoveryYear, lastActionYear
  }],
  history[24], totals, lastUpdateYear, revision
}
```

- **Kein Per-Frame-Aufwand.** Der Kriegsrat läuft einmal pro Jahr im
  bestehenden Jahrespass. Er liest höchstens vier Fronten, höchstens zwölf
  Narben pro Front und schreibt die vorhandene Provinz-, Diplomatie- und
  Militärstruktur. Es gibt keinen täglichen oder per-Frame-Scan.
- **Kein zweiter Krieg.** Das Gefecht ist eine bounded Auflösung mit echten
  Soldaten; es erzeugt keine neue Armee, keine neue Einheit und keine zweite
  Karte. Provinzen, Besitzer und Garnisonen bleiben die vorhandenen
  Weltkarten-Datensätze.
- **Kein zweiter Handel.** Routen, Zoll und Schmuggel schreiben Gold und
  Beziehung in dieselben Ressourcen- und Diplomatiepfade. Ein Embargo beendet
  das bestehende Handelsabkommen.
- **Kein zweiter Wald.** Kriegsfeuer und Brandrodung rufen den vorhandenen
  kontrollierten Brand auf. Narben verändern den echten `forestStock` und
  heilen über die jährliche Prüfung. Ein gemeinsames Schutzgebiet wird vom
  bestehenden Hain-Schutz gelesen.
- **Save-Kompatibilität.** Fehlende Fronten, alte Ledger und beschädigte Werte
  werden auf sichere Defaults normalisiert. Alle Felder sind additiv; das
  Kultur-Schema bleibt unverändert.

## Verifikation (v3.83.0)

- `node --test tests/systems/forest-warfare.test.js` — 15/15 grün: 30 Punkte,
  60 Kriegsprofile, Grenzposten/Wache/Späher, Saisonstraßen, Hinterhalt und
  Gefecht mit echten Soldaten, Belagerungs- und Schiffsbauholz, Elefanten- und
  Geländesperren, Embargo/Route/Zoll/Schmuggel, Vertrag und gemeinsames
  Schutzgebiet, Rechte/Siedler/Kolonisation, Deportation/Flüchtlinge/
  Militärkolonie, Kriegsfeuer/Brandrodung/Narben, jährlicher idempotenter Pass,
  Alt-Save-Normalisierung und die Atlas-Zusammenfassung.
- `npm test` — vollständiger Lauf, siehe Release-Changelog.
- `npm run test:campaign` — 25 Jahre, `ok: true`.
- `npm run spec:audit` — Abschnitt `1.2.23.1.211–240` mit 30/30.
- `npm run test:forest-war-ui` — echte Chromium-Referenz: vier Fronten,
  30-Punkte-Feldguide, Grenzposten, Wache, Späher, Straße, Kriegserklärung,
  Hinterhalt, Gefecht, Embargo, Zoll, gemeinsames Schutzgebiet, Siedler und
  Jahrespass. Die Save-Normalisierung deckt der Systemtest ab; Speichern und
  Laden prüft der Live-Durchlauf auf beiden Produktions-Hosts.

## Bekannte Grenzen

- Die vier Fronten sind die vier bestehenden diplomatischen Reiche. Es gibt
  keine freie Eroberung beliebiger Weltkacheln; Kolonisation überträgt die
  vorhandene frontier-Provinz.
- Ein Gefecht ist eine jährliche, deterministische Auflösung, kein
  Echtzeit-Feldzug. Es liest die vorhandenen Soldaten und schreibt dieselben
  Verwundeten-/Gefallenen-Akten.
- Der gemeinsame Schutz schützt eine Kachel pro Front. Das ist eine bewusste
  Begrenzung, damit der Atlas und der Hain-Schutz lesbar bleiben.
- Der 60-Jahres-Soak bleibt dem Nightly-Workflow vorbehalten.
