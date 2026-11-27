# Wald-Darstellung, Audio, UI und Accessibility 1.2.23.1.241–270

**Status: implementiert, vertieft, verdrahtet und im Browser geprüft (v3.84.2).**

Die dreißig Punkte bilden eine gemeinsame Präsentations-, Audio- und
Zugänglichkeitsschicht über dem vorhandenen Waldmodell. Sie verändern keine
Simulation, keine Ernte, kein Wachstum und kein Save-Schema. Jede Anzeige liest
denselben `forestStandAt()`-Stand und dieselben regionalen Profile, die auch
Ernte, Fauna und Atlas verwenden.

## Architektur

| Modul | Aufgabe |
| --- | --- |
| `js/world/forest-presentation.js` | 60 regionale Profile, 30-Punkte-Manifest, Silhouetten, Icons, Muster, Instrumente, Boden- und Nebeltypen. |
| `js/systems/forest-presentation.js` | Einstellungs-Normalisierung, Render-Tuning, Referenzszene, Filter, Legende, Guide-Zeilen, deterministische Sound-Cues. |
| `js/core/forest-ambience.js` | Prozedurales WebAudio-Bett, Vögel/Insekten, Holz-Instrumente, Stille, Untertitel-Ereignisse. Keine Audiodatei. |
| `js/presentation/rendering/terrain.js` | Parallax, Silhouetten, Farben, Nebel, Licht, Nässe, Totholz, Unterholz, Blüten, Fauna, Insekten, Kartenicons und symbolische Karte. |
| `js/presentation/forest-atlas-panel.js` | Feldguide, Filter, Legende, Tooltips, Einstellungs-Zusammenfassung. |
| `js/app/main.js` | Persistierte Einstellungen, CSS-Klassen, Cache-Invalidierung, Untertitel-Live-Region. |
| `js/core/persistence.js` | Neun Wald-Einstellungen in `DEFAULT_SETTINGS` und `normalizeSettings`. |

Alle 60 Profile werden deterministisch aus `REGIONAL_FOREST_TYPES`,
`render.silhouette`, Klima und einem stabilen Hash abgeleitet. Es gibt keinen
zweiten Waldgenerator und keinen Per-Frame-Scan. Die Referenzszene wird alle
1,8 Sekunden neu gesampled; Render-Tuning und Ambience lesen nur dieses Ergebnis.

## Waldkunde-Erweiterung (v3.84.2)

Die dreißig Punkte waren vollständig, aber ein großer Teil ihrer Tiefe war nur
passiv sichtbar. Die Erweiterung macht dieselben Profildaten im Atlas lesbar,
hörbar und vergleichbar — ohne zweiten Generator, ohne Save-Feld und ohne
Simulationsänderung.

- **Datierter Jahreslauf.** Jeder der 60 Typen trägt vier Jahreszeiten mit
  Laubaustrieb, Kronenschluss, Blüte, Frucht, Herbstfärbung, Laubfall, erstem
  Schnee und Hochwinter. Die Tage stammen aus denselben Klimakurven wie
  `season.js`, verschoben um den regionalen Typ-Hash. Der Atlas markiert die
  aktuelle Jahreszeit und zeigt Blüte, Frucht, Schnee und Kahlanteil.
- **Kronentiefe.** Das Profil liefert Unterholz-, Stamm- und Kronendach-Ebene
  mit eigenem Parallaxfaktor, Deckkraft und Tint. Die Dach-Ebene ist exakt der
  Faktor, den die Landschaftskrone im Renderer verwendet.
- **Feldmerkmale.** Drei regionale Merkmale pro Typ (Wuchsform, Boden,
  Klimasignatur) stehen auf jeder Atlas-Karte und machen einen Bestand auch
  ohne Farbe erkennbar.
- **Hörbare Waldkunde.** Acht echte Cue-Arten — Vogel, Insekten, Instrument,
  Wetter, Tropfen, Knistern, Schneestille und Stille — lassen sich im Atlas per
  Tipp oder Tastatur abspielen. Die gedruckte Zeile ist exakt der Cue, den die
  Ambience erhält; sie funktioniert also auch bei stummgeschaltetem Ton. Die
  letzten acht Cues bleiben in einer Historie sichtbar.
- **Vertiefte Musik.** Jede Familie hat eine Holztonart (Dorian, Ionisch,
  Lydisch, Mixolydisch, Äolisch, Phrygisch oder pentatonisch), ein stabiles
  dreinotiges Motiv und ein eigenes Tempo. Der Synthesizer erzeugt zusätzlich
  Tropfen, ein knarrendes Stammholz und eine Schneestille.
- **Legende als Filter.** Ein Tipp auf ein Familienzeichen filtert den Atlas
  auf diese Familie; ein zweiter Tipp hebt den Filter auf. `aria-pressed` macht
  den Zustand für Hilfsmittel sichtbar, und die Legende kann nicht von der
  Filterleiste abweichen.
- **Zugänglichkeit.** Cue-Zeile und Filterzähler sind höfliche Live-Regionen;
  Cue-Schaltflächen sind auf groben Zeigern 44 px hoch; Jahreslauf und
  Kronentiefe brechen auf zwei Spalten um, ohne horizontal zu überlaufen.

## Die dreißig Punkte

### Darstellung

1. **Kronendach-Parallaxe (241).** Jeder Typ trägt einen Parallaxfaktor aus
   Silhouette und Kronentiefe. Die Massenkrone verschiebt sich gegen Stamm und
   Boden; im Nah-LOD bleibt ein Bruchteil erhalten.
2. **Baum-Silhouetten (242).** Neun Familien (Spire, Dome, Emergent, Umbrella,
   Baobab, Stilt, Bamboo, Column, Scrub) bestimmen Kronenaspekt, Asymmetrie und
   Etagen; der Typ-Hash variiert sie ein zweites Mal.
3. **Regionale Blattfarben und Lichtstimmungen (243).** Sommer-, Herbst- und
   Frühlingstint sowie Lichtfarbe fließen in Krone, Boden und Lichtstrahlen.
4. **Herbstlaub (244).** Regionale und artweise Verschiebung des Farbwechsels;
   benachbarte Bestände färben nicht am selben Tag.
5. **Schneelasten und kahle Kronen (245).** Regionale Schneeretention und
   Kahlanteil; Nadelholz hält mehr, Mangrove und Palme fast nichts.
6. **Bodentexturen (246).** Acht Wehen: Nadelstreu, Laubstreu, Tiefstreu, Moos,
   Watt, Marsch, Sand und Vulkanasche, jeweils mit eigenen Markierungen.
7. **Lichtstrahlen (247).** Zwei überlappende Schäfte pro Kronenlücke, entlang
   des Sonnenvektors und gedämpft durch die regionale Nebeldichte.
8. **Nebelarten und Sichtweiten (248).** Neun Nebelverhalten von Küstenschleier
   bis Aschefall; Sichtweite wirkt auf Nebel, Licht und Lesbarkeit.
9. **Regen, Tropfwasser und nasse Oberflächen (249).** Nasser Boden, Pfützen,
   Blattglanz und Tropflinien, gebunden an das echte Wetter.
10. **Wind und Steifheit (250).** Artweise Steifheitstabelle für Amplitude und
    Frequenz; Wetter multipliziert, Richtung bleibt gleich.
11. **Totholz, Wurzelteller und Stämme (251).** Liegende Stämme, stehende
    Tothölzer, Stümpfe und Windwurf-Wurzelteller aus den Regionalwerten.
12. **Unterholz (252).** Farn-, Gras- und Strauchgewichte werden zu den
    bestehenden Unterholzwerten addiert; ein begrenztes Motiv pro Kachel.
13. **Blüten und Früchte (253).** Regionsblüte im Frühling, echte Früchte und
    Zapfen im Herbst, mit begrenzter Dichte.
14. **Tiere und Vögel (254).** Regionale Fauna aus dem simulierten Bestand,
    zusätzlich zwei bis drei Kronenvogel-Silhouetten in der Ferne.
15. **Insektenwolken und Schmetterlinge (255).** Begrenzte Wolke über sonnigen
    Lücken, Bienen in Trachtwäldern, Schmetterlinge in Blühwäldern.

### Audio

16. **Regionale Waldgeräusche (256).** Gefiltertes Rauschen je Region, Vögel
    und Insekten aus der Faunenliste, Wetter moduliert das Bett.
17. **Instrumente aus regionalen Hölzern (257).** Drei Instrumente pro Typ
    (Eiche-Harfe, Buche-Flöte, Esche-Fiedel usw.) mit Timbre, Helligkeit,
    Abklingen und Obertönen; deterministisches Motiv.
18. **Stille im alten Wald (258).** Altholz senkt das Bett, macht Rufe selten
    und dehnt das Motiv; die Stille ist ein hörbares Stilmittel.
19. **Untertitel (267).** Jeder Vogel-, Insekten-, Instrument- oder
    Wetter-Cue schreibt eine Zeile in eine höfliche Live-Region über der Karte.
    Funktioniert auch bei ausgeschaltetem Ton.

### Karte und Atlas

20. **Kartenicons (259).** Typ, Nutzung und Gefahr als begrenzte Symbole pro
    gesampelter Waldkachel, im gecachten Detail-Raster.
21. **Ökologische Legende (260).** Neun Familien, drei Nutzungen, vier Gefahren
    plus Schutz- und Störungssymbole, generiert aus denselben Tabellen.
22. **Tooltips (261).** Art-Chips nennen Lateinname, Form, Holz und
    Unterholsrolle; Gut-Chips Kategorie, Verwendung und Saison.
23. **Filter (262).** Drei unabhängige Gruppen (Familie, Ressource, Schutz)
    kombinieren sich; Reset zeigt alle 60 Typen.

### Accessibility und Performance

24. **Farbenblindheitssichere Codierung (263).** Acht Muster (Chevron, Punkte,
    Raute, Strahlen, Wellen, Kreuz, Balken, Ringe) auf Legende, Karte und
    Filter-Chip; Name und Glyphe bleiben immer sichtbar.
25. **Kontrastmodus (264).** Helleres Kronendach, dunkle Kontur der Massenkrone,
    weniger Nebel und Lichtschleier; unabhängig vom UI-Kontrast.
26. **Schriftgröße (265).** Drei Stufen (Normal, Groß, Sehr groß) skalieren
    Atlas-Karten, Notizen, Chips und Guide, ohne die Karte zu verändern.
27. **Reduzierte Bewegung (266).** Bestehende `reduceMotion`-Einstellung senkt
    Schwanken auf 18 %, stoppt Lichtpulse und Insektenbewegung und unterdrückt
    Falllaub.
28. **Performance-Modus (268).** Halbiert Kronenbewegung, zeichnet einen
    Lichtschaft, überspringt Insektenwolke und vereinfacht Ferndetails.
29. **Reduzierte Partikel (269).** Regen und Schnee auf 60 %, Falllaub und
    Insektensprenkel entfallen; Nässe und Schneedecke bleiben lesbar.
30. **Alternative Kartenansicht (270).** Flache regionale Kronenfläche mit Typ-,
    Nutzungs- und Gefahrenicon statt einzelner Bäume, Unterholz, Fauna, Nebel
    und Lichtschäften. Gleiche Kachelfarben, gleiche Klickziele.

## Persistierte Einstellungen

`forestAmbience`, `forestAmbienceVolume`, `forestSubtitles`, `forestColorblind`,
`forestCanopyContrast`, `forestFontScale`, `forestPerformance`,
`forestReducedParticles` und `forestMapView` liegen neben den bestehenden
Interface-Einstellungen. Sie werden normalisiert, überleben Speichern/Laden und
ändern nie das Simulationsergebnis. `reduceMotion` bleibt die gemeinsame
Einstellung für Interface und Wald.

## Verifikation

- `node --test tests/systems/forest-presentation.test.js` — 11 Tests:
  Profile, Guide, Filter, Legende, deterministische Cues, Schutzstatus,
  Einstellungs-Normalisierung, vier Jahreszeiten mit datierten Tagen,
  Kronentiefe, Feldmerkmale, Tonarten/Motive und alle acht Cue-Vorschauen.
- `npm run test:forest-presentation-ui` — echter Chromium-Spielerpfad:
  startet ein Reich, öffnet den Atlas, prüft 60 Karten, 30 Guide-Punkte,
  18 Filter, Filterwirkung, vier Jahreszeiten, drei Kronenebenen, acht Cues,
  60 Karten-Hörproben, die echte Instrumenten-Vorschau mit Cue-Historie, den
  Legendenfilter, alle Einstellungen, die kombinierte
  Farbenblind-/Kontrastdarstellung, Schriftvergrößerung, Cache-Neuaufbau,
  symbolische Karte, Ambience-Status und die Untertitel-Live-Region.
- `npm run test:forest-presentation-mobile` — echter Touch-Spielerpfad bei
  390×844 und 768×1024: Gründung, Atlas, alle 30 Guide-Punkte, jeder der 18
  Filter und der Reset, 23 Legende-Einträge, Baum- und Gut-Tooltip per Tap,
  vier Jahreszeiten, drei Kronenebenen, acht Cue-Ziele mit 44-px-Prüfung und
  echter Touch-Hörprobe, alle neun Wald-Einstellungen plus reduzierte Bewegung,
  Untertitel-Cue, symbolische Karte, Speichern/Neuladen/Fortsetzen sowie
  Overflow- und Überlappungsprüfungen. Dieselbe Reise läuft gegen beide
  Live-Hosts.
- `npm test` und der deterministische 25-Jahres-Feldzug sind das Release-Gate;
  der 60-Jahres-Soak bleibt Nightly.

## Grenzen

Die Ambience startet erst nach einer Spielerinteraktion, weil Browser Audio
sonst blockieren. Auf Geräten ohne WebAudio bleibt der Atlas vollständig
bedienbar; Untertitel und Guide funktionieren ohne Ton. Die symbolische Karte
ist eine bewusst flache Darstellung und kein Ersatz für den Detail-Atlas.
