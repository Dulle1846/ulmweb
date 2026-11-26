# Waldkultur, Religion, Gesellschaft und Wissen · 1.2.23.1.181–210

**Status:** implementiert, verdrahtet und im Browser geprüft (v3.78.0)
**Datenmodell:** `js/world/forest-culture.js`
**Laufzeit:** `js/systems/forest-culture.js`
**Hain-Schutz:** `js/world/sacred-groves.js` (gelesen von Ernte, Jagd und Feuerwehr)
**Browser-Referenz:** `npm run test:forest-industry-ui`

Die dreißig Punkte sind **eine Kulturschicht über dem vorhandenen Wald**, kein
zweiter Wirtschafts-, Währungs- oder Bevölkerungs-Simulator. Jeder regionale
Waldtyp hat seine eigene Kultur. Die Profile werden deterministisch aus den
sechzig bestehenden `REGIONAL_FOREST_TYPES` abgeleitet: dieselbe Welt, dieselbe
Region und derselbe Typ ergeben immer denselben Geist, denselben heiligen Baum,
dieselbe Arbeitstechnik, dasselbe Tabu, dieselben Namen und dasselbe Lied.
Alte Saves laden unverändert; alle neuen Felder liegen additiv unter
`state.economy.productionChains.forestCulture` und werden beim ersten Zugriff
normalisiert.

## Der Spielerpfad

1. **Heimatwald lesen.** Der Forest Atlas zeigt Kulturprofil, Geist, heiligen
   Baum, Tabu, Arbeitstechnik, Jagdregel, Philosophie, Wege, Fest und Kalender.
   Das Profil kommt aus dem echten Bestand am Schrein, nicht aus einer
   allgemeinen Tabelle.
2. **Hain weihen.** Ein fertiger Schrein neben lebendigem Wald erlaubt
   `DEDICATE GROVE` (12 Holz, 8 Gold). Die Aktion wählt eine echte Waldkachel,
   speichert sie als Hain und entzieht sie jedem Holzeinschlag, jeder Durch-
   forstung, jedem Feuerwehrschnitt und jeder Jagd.
3. **Rituale halten.** `MAKE OFFERING` verbraucht zwei echte gesammelte
   Waldgüter (Honig, Kräuter oder Pilze) und erhöht Gunst und Hingabe. Fest,
   Jagdritual und Baumhochzeit sind je einmal pro Jahr verfügbar; sie kosten
   vorhandene Nahrung, Gold oder beides und schreiben in Chronik, Legitimität
   und Politik.
4. **Recht setzen.** Ein Förster verwaltet das Waldrecht. `BALANCE`, `COMMONS`,
   `HUNTING` oder `TIMBER` ändern die realen Ernte-, Jagd-, Feld-, Weide- und
   Holzfaktoren. Das Recht wechselt höchstens einmal pro Jahr.
5. **Konflikte schlichten.** Ein Hain neben Holzrecht, jagende Parteien oder
   commons-/Köhler-Ansprüche erzeugen benannte Konflikte. `MEDIATE` kostet
   6 Gold und senkt die Spannung; offene Konflikte drücken jede Jahresbilanz.
6. **Wissen sammeln.** `COLLECT WOODLORE` speichert Märchen, Sage und Arbeits-
   lied der Heimatregion. Der neue Forschungszweig **Woodland** schaltet
   Forstwirtschaft, Kräuterkunde, Naturastronomie, Kartographie und
   Naturphilosophie frei. Nach dem Sammeln können Kinder regionale Baum- und
   Tiernamen erhalten.

## Die dreißig Punkte

| Punkt | Umsetzung | Live-Verbraucher |
| --- | --- | --- |
| 181 Waldgeister und Baumgottheiten | Jeder der 60 Typen erhält einen eigenen Geist, heiligen Baum, Tabu, Fest und eine Philosophie; 12 Traditionen (boreal, gemäßigt, mediterran, Feucht, Gebirge, Küste, Savanne, tropisch, Mangrove, Bambus, Lorbeer, Wolkenwald) liefern das Grundmuster. | Atlasprofil, Hain-Gunst, Fest, Opfer |
| 182 Heilige Haine | Echte Kacheln unter `forestCulture.groves`; zentrale Prüfung in `harvestForest`, `harvestForestGameAt`, Feuerwehr und kontrolliertem Brand. | `DEDICATE GROVE`, Hainkarte, Ernteschutz |
| 183 Druiden und Waldpriester | `TYPE.SHRINE` ist jetzt echter Arbeitsplatz mit Job `druid`, einem Platz, Learning-Skill und Eintrag im Bevölkerungsregister. | Schrein, Rollenzensus, Gunst, Feste |
| 184 Förster und Waldrecht | Nur ein arbeitender Förster darf das Recht setzen; Holzrecht, Jagd, Allmende und Ausgleich ändern echte Faktoren. | `setForestRights`, Atlas-Rechte, Ernte/Jagd/Feld |
| 185 Köhler | Jede Forest Works im Modus `charcoal` zählt als Köhlergemeinschaft. Ab dem zweiten Kohlenmeiler steigt die Kohleausbeute begrenzt. | Rollenzensus, `runForestWorks`, Kohlepreis |
| 186 Holzfäller | Regionale Arbeitstechnik und Tabu werden angezeigt; Haine und markierte Bäume sind aus dem Holzpfad entfernt. | Holzfäller-Zensus, Hain-Schutz, Atlas |
| 187 Sammler | Der Kultur-Forage-Faktor fließt in die bestehende `gatherForestProducts`-Ausbeute; der Kalender nennt Blüte, Ernte und Jagd. | Sammeln, Kalender, Atlas |
| 188 Jäger | Das Jagdritual öffnet die Saison; Jagdregel und Kalenderfenster werden angezeigt; der Kultur-Hunt-Faktor verstärkt die echte Jagdausbeute. | `processForestHunt`, `HUNT RITE` |
| 189 Waldbauern | Betriebe in Waldnähe zählen als Waldbauern; der Agroforst-Faktor fließt in `ecotoneHarvestFactor` und damit in die echte Feldernte. | Felder, Rollenzensus, Pannage |
| 190 Wanderhirten | Stablehands in Waldnähe zählen als Hirten; Allmende und Hain erhöhen die Masttage in `feedStableFromMast`. | Ställe, Pannage, Rollenzensus |
| 191 Einsiedler und Waldklöster | Tiefwaldschreine zählen als Einsiedelei; ein Scriptorium in Reichweite macht daraus ein Waldkloster mit Forschungsgewicht. | Rollenzensus, Forschung, Atlas |
| 192 Hexen und Kräuterfrauen | Heilerinnen in Waldnähe zählen als Kräuterfrauen; ihr Anteil und Kräuterkunde verbessern den Medizin-Faktor. | Gesundheitspfad, Rollenzensus |
| 193 Regionale Märchen | Jeder Typ hat ein eigenes Märchen mit Moral; `COLLECT WOODLORE` legt es in ein begrenztes Archiv. | Atlas, Chronik, Legacy |
| 194 Sagen über verschwundene Wälder | Jede Region hat eine eigene Sage über einen verlorenen Wald oder alten Baum; sie wird mit dem Märchen gespeichert. | Woodlore-Archiv, Legacy |
| 195 Lieder und Arbeitsgesänge | Jede Region nennt ein Arbeitslied mit Vers und Berufsbezug; das Lied wird mit dem Märchen gesammelt und im Atlas gezeigt. | Woodlore-Archiv, Kultur-Gunst |
| 196 Waldkalender | Blüte-, Jagd-, Fäll- und Ruhefenster werden aus dem Regionalprofil abgeleitet und mit der aktuellen Jahreszeit markiert. | Atlas, Sammeln, Jagd |
| 197 Feste | Jede Region hat ein eigenes Fest mit Fokus und Jahreszeit; `HOLD FESTIVAL` kostet 8 Nahrung und 5 Gold, gibt Moral, Legitimität und Gunst. | Atlas, Politik, Chronik |
| 198 Opfergaben | Honig, Kräuter oder Pilze aus dem echten Waldlager werden verbraucht; eine Gabe pro Jahreszeit, Gunst und Hingabe steigen. | Atlas, `state.forestGathering`, Hain |
| 199 Tabus gegen heilige Bäume | Das Tabu ist Teil des Profils; die zentrale Hainprüfung verhindert Fällen, Durchforsten, Feuerwehr und Jagd auf der Kachel. | `harvestForest`, Hainkarte |
| 200 Jagdrituale und Initiationsriten | `HUNT RITE` kostet 4 Nahrung, ist einmal pro Jahr verfügbar und öffnet die Jagd mit erhöhtem Kulturfaktor. | `processForestHunt`, Moral, Atlas |
| 201 Baumhochzeiten | `TREE WEDDING` verlangt einen Hain und 10 Gold; Hingabe, Gunst, Legitimität und Klerus steigen, einmal pro Jahr. | Atlas, Politik, Legacy |
| 202 Namensgebung | Nach gesammeltem Märchen oder Lied schlägt `forestCultureChildName` deterministisch einen regionalen Baum-/Tiernamen vor; Geburten übernehmen ihn. | `createChildFromParents`, Woodlore |
| 203 Waldrecht | Vier Prioritäten mit echten Faktoren; nur Förster, nur einmal pro Jahr, mit politischer Wirkung. | Atlas, Ernte, Jagd, Feld, Pannage, Holz |
| 204 Allmende | `COMMONS` erhöht Feld-, Weide- und Forage-Faktor, gibt Legitimität und Commons-Stimmen und wird als Dorfgemeinschaftsrecht protokolliert. | Felder, Ställe, Sammeln, Politik |
| 205 Nutzungskonflikte | Holzrecht am Hain, Jagd gegen Herden, Allmende gegen Köhler und Holz gegen Waldbauern erzeugen benannte, begrenzte Konflikte; Mediation kostet Gold. | Atlas, Moral, Gunst, Politik |
| 206 Waldbildung | Der Woodland-Forschungszweig, Förster und Kräuterfrauen bilden die praktische Schule; der Atlas zeigt Förster, Kräuterfrauen und Klosterforschung. | Forschung, Rollenzensus |
| 207 Kräuterkunde | `woodland-herb-lore` ist eine echte Technologie nach Forstwirtschaft und verbessert Forage und Medizin. | Forschung, Sammeln, Gesundheit |
| 208 Naturastronomie | `woodland-astronomy` liest den Kalender, gibt bessere Opfergaben und ist Voraussetzung für Kartographie und Philosophie. | Forschung, Kalender, Opfer |
| 209 Kartographie | `woodland-cartography` erhöht das Hainlimit und schreibt Wege und heilige Orte in den Atlas. | Forschung, Hainlimit, Atlas |
| 210 Naturphilosophie | `woodland-natural-philosophy` ist die Abschlusstechnologie nach Astronomie und Kartographie; sie erhöht Forschung und Legitimität und zeigt die regionale Gleichgewichtsphilosophie. | Forschung, Atlas, Politik |

## Zustand und Grenzen

```js
state.economy.productionChains.forestCulture = {
  version: 1,
  homeRegion, groves[8], lore[60], conflicts[8], history[24], actions[16],
  favor, rights: { priority, sinceYear },
  festivals, offerings, rites, weddings,
  lastOfferingKey, festivalYear, huntYear, weddingYear, rightsChangedYear,
  lastAnnualYear, lastUpdateSeason, lastUpdateYear, revision
}
```

- **Kein Per-Frame-Aufwand.** `updateForestCulture()` läuft in der täglichen
  Wirtschaft, macht aber nur bei einem Jahres- oder Saisonwechsel Arbeit. Die
  Jahresbilanz liest Rollen, Gunst und Konflikte einmal; sie scannt keine
  Kacheln und zieht keinen Zufall aus dem gemeinsamen Simulation-RNG.
- **Kein zweiter Wald.** Haine sind Koordinaten auf der bestehenden
  Ressourcenkarte. Die Prüfung liegt in `js/world/sacred-groves.js` und wird von
  Ernte, Jagd und Feuerwehr gelesen. Natürliche Störungen bleiben Teil der
  bestehenden Sukzession; menschliche Eingriffe werden um den Hain herum
  geführt.
- **Keine neue Währung.** Gunst, Hingabe und Kulturfaktoren sind abgeleitete
  Skalare. Opfer und Feste verbrauchen vorhandene Güter, Nahrung und Gold.
- **Keine neuen Gebäudetypen.** Der Druide nutzt den bestehenden Schrein; der
  Förster den bestehenden Forstposten; Köhler, Waldbauern, Hirten und
  Kräuterfrauen ihre bestehenden Arbeitsplätze.
- **Bounded UI.** Der Atlas zeigt ein Profil, einen Kalender, sechs Aktionen,
  vier Rechte, höchstens acht Haine, acht Konflikte, 60 Lore-Einträge und einen
  aufklappbaren 30-Punkte-Feldguide. Die Rollen- und Wissenskarten sind
  begrenzte Zähler, keine Live-Scans pro Frame.
- **Save-Kompatibilität.** Fehlende oder beschädigte Kulturwerte werden auf
  sichere Defaults normalisiert; die alten Wirtschafts-, Forst- und
  Bevölkerungsfelder bleiben unverändert.

## Forschung

| Technologie | Kosten | Voraussetzung | Wirkung |
| --- | --- | --- | --- |
| Woodland forestry | 22 | – | Forstwirtschaftliche Praxis, etwas geringerer Bauaufwand und Nahrungsbedarf |
| Woodland herb lore | 36 | Forestry | Medizinischer Kulturbonus, bessere Forage |
| Natural astronomy | 52 | Herb lore | Kalenderwissen, Forschung, bessere Opfer |
| Woodland cartography | 70 | Astronomy | Handel, Forschung, zwei zusätzliche Haine |
| Natural philosophy | 92 | Astronomy + Cartography | Forschung, Legitimität, letzter Hainplatz |

Die Technologien erscheinen im normalen Research-Panel und im neuen Zweig
**Woodland**. Die Abschlusszahlen sind dynamisch (`TECHNOLOGIES.length`), nicht
als „24“ fest verdrahtet.

## Verifikation (v3.78.0)

- `node --test tests/systems/forest-culture.test.js` — 9/9 grün: 30 Punkte,
  60 Profile, Druidenjob, Hain-Schutz, Opfer/Fest/Riten/Hochzeit, Rechte und
  Konflikt, Woodlore/Namensgebung, Forschung, Save-Normalisierung.
- `npm test` — vollständiger Lauf, siehe Release-Changelog.
- `npm run test:campaign` — 25 Jahre, `ok: true`, 10.040 Ticks.
- `npm run spec:audit` — 1.711/1.711 Punkte, 0 offen; Abschnitt
  `1.2.23.1.181-210` mit 30/30.
- `npm run test:forest-industry-ui` — echte Chromium-Referenz: Profil,
  30 Feldguide-Punkte, Hainweihe, Schutzprüfung, Opfer, Fest, Jagdritual,
  Baumhochzeit, Waldrecht, Woodlore und Rollenzensus; keine neuen Seiten- oder
  Konsolenfehler. Screenshots:
  `artifacts/forest-industry-ui/forest-culture.png`,
  `forest-culture-roles.png`, `forest-culture-guide.png`.

## Bekannte Grenzen

- Die Browser-Referenz prüft die gerenderte Oberfläche und die echten
  Zustandsübergänge; sie ist kein vollständiger Playthrough aller 60 Regionen.
- Die 30 Punkte sind als Kultur- und Nutzungsschicht umgesetzt, nicht als
  separate Religion mit eigenem Klerus-Simulator. Politik, Legitimität und
  Moral laufen weiter über die vorhandenen Pfade.
- Natürliche Störungen (Feuer, Wind, Käfer) bleiben möglich; der Hain schützt
  vor menschlichem Einschlag, Jagd und Feuerwehrschnitt. Das ist die
  beabsichtigte Grenze zwischen Tabu und Naturgewalt.
