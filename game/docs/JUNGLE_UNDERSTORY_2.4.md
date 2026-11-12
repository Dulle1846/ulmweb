# Dschungel-Unterwuchs bei 2,4× (schwaches Profil)

Diese Messung prüft die Unterwuchsschicht und den Detail-Cache auf der dichtesten gefundenen Dschungelkachel (`x=76, y=54`, Seed `20261104`) im echten gebauten Runtime-Bundle. Sie ergänzt den kanonischen 4,2×-Nachweis in [JUNGLE.md](JUNGLE.md).

## Profil und Reproduktion

- 720 × 540 CSS-Pixel, Device-Pixel-Ratio 1, **50 % Render-Scale** (360 × 140 Canvas), Zoom **2,4×**
- 30-FPS-Cap, **CDP-CPU-Throttling 4×**, SwiftShader/Software-GL, Canvas-Renderer
- echte Dschungelwelt mit 78 % Wald; der Messbereich wird über das produktive `revealArea()` aufgedeckt
- ein 1,2-s-Kaltlauf für den Detail-Cache-Neuaufbau und vier 2,2-s-Jahreszeitenfenster

```bash
cd game
npm run build:runtime
E2E_CHROMIUM_EXECUTABLE=/tmp/kac-chromium/chrome-linux/chrome \
E2E_SOFTWARE_GL=1 \
LD_LIBRARY_PATH=/tmp/kac-libs/usr/lib/x86_64-linux-gnu:/tmp/kac-libs/usr/lib \
FONTCONFIG_FILE=/tmp/kac-fonts.conf HOME=/tmp/kac-chrome-home \
npm run test:jungle-understory
# Bericht: artifacts/jungle-understory-2.4/jungle-proof.json
```

`npm run test:jungle-understory` setzt `JUNGLE_PROOF_ZOOM=2.4` und `JUNGLE_PROOF_OUT=artifacts/jungle-understory-2.4`. Der Lauf verwendet denselben Harness wie der kanonische Nachweis. Das FPS-Gate wird **nicht** gap-bereinigt; der Kaltlauf wird **nicht** aus dem Messfenster geschoben.

## Ursache vorher

Der bisherige Canvas-Pfad baute den gesamten Detail-Layer synchron auf. Auf dem schwachen Profil entstand daraus ein **104,3-ms-Draw-Frame** beim saisonalen Cache-Wechsel; im Kaltlauf lag der längste Draw-Frame bei **63,4 ms**. Der Unterwuchs selbst war mit **0,8 ms / 22 Aufrufe** (0,036 ms/Aufruf) nicht die Ursache.

## Inkrementeller Neuaufbau im Produktionscode

`js/presentation/rendering/terrain.js` baut den Detail-Layer jetzt in einem **offscreen Staging-Canvas** auf, während der bisherige Layer sichtbar bleibt:

1. `beginDetailBuild()` verwendet ein **wiederverwendetes** Staging-Canvas, zeichnet den gebackenen Boden und die Bodenkörnung einmal und setzt einen mutierenden Tile-Cursor auf den sichtbaren Bereich.
2. `drawTerrainDecorations()` ist an einer **Kachelgrenze fortsetzbar**. Es prüft pro Kachel eine Deadline; nach höchstens **4 ms pro Slice** wird der Cursor aktualisiert. Der nächste Frame setzt exakt an dieser Kachel fort. Ergebnisobjekte und Cursor-Neuzuweisungen wurden aus dem Per-Frame-Pfad entfernt.
3. `advanceDetailBuild()` verarbeitet pro gerendertem Frame höchstens ein **4-ms-Build-Budget**. Bricht die Kamera, der Zoom, der Content-Key (Jahreszeit/Tag) oder die Welt ab, wird der Staging-Build verworfen und später neu gestartet.
4. `finishDetailBuild()` zeichnet Nebel in das Staging-Canvas, kopiert das fertige Canvas in **einem** abschließenden Blit auf die sichtbare Fläche und setzt den neuen `detailState`.

Der letzte sichtbare Wechsel ist damit ein einzelner Canvas-Blit, nicht die 60–105 ms Dekorationsarbeit. `state.terrainBuildThisFrame` enthält weiterhin die Arbeit des jeweiligen Frames; der Proof klassifiziert **jeden** Staging-Frame als Cache-/Rebuild-Frame und prüft ihn zusätzlich gegen das 16,7-ms-Budget.

Zusätzlich wurde die Minimap als verbleibende Hauptthread-Arbeit entschärft: `js/presentation/rendering/minimap.js` cached die statische Terrain-Hälfte (abhängig von Welt, Terrain-Version und `exploredRevision`), und `js/app/game-loop.js` aktualisiert die Minimap nur noch mit **1 Hz** statt alle 400 ms. Die Entities und der Kamera-Rahmen werden weiterhin bei jedem Minimap-Tick gezeichnet. Der Unterwuchs-Timing-Pfad bleibt ausschließlich im 2,4×-Modus aktiv.

## Vorher / Nachher

| Kennzahl | Vorher (synchron) | Nachher (3 Läufe) |
| --- | ---: | ---: |
| Aggregierte Präsentations-FPS (keine Gap-Bereinigung) | **29,661** | **30,207 / 30,101 / 30,198** |
| Kaltlauf Draw-p95 | 5,4 ms | **8,9 / 8,3 / 8,5 ms** |
| Kaltlauf **Draw-Max** | **63,4 ms** | **10,1 / 8,8 / 10,0 ms** |
| Kaltlauf: längster Einzelframe | **63,4 ms** | **10,1 / 8,8 / 10,0 ms** |
| Längster saisonaler Draw-Frame (`drawAll.max`) | **104,3 ms** | **9,0 / 10,2 / 8,2 ms** |
| Kaltlauf: aktive Detailaufbauzeit | 61 ms (Dekorationspass) | **92 / 85 / 92 ms** (gesamter Staging-Aufbau) |
| Unterwuchs kalt | 0,8 ms / 22 / 0,036 ms pro Aufruf / max 0,6 ms | **1,2 / 2,0 / 1,1 ms; 22 Aufrufe; 0,055 / 0,091 / 0,050 ms pro Aufruf; max 0,5 / 0,8 / 0,5 ms** |

Die 85–92 ms sind aktive Arbeit über mehrere Frames, nicht die Latenz eines Frames. Entscheidend ist der längste Einzelframe: **63,4 → höchstens 10,1 ms** kalt und **104,3 → 10,2 ms** saisonal. Kein gemessener Frame liegt über 16,7 ms.

### Die drei Wiederholungsläufe

| Lauf | Aggregierte FPS | Fenster-FPS (diagnostisch) | Kalt Draw-p95 / Max | Saisonaler Draw-Max | Unterwuchs kalt |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | **30,207** | 29,636 | 8,9 / **10,1 ms** | **9,0 ms** | 1,2 ms / 22 / 0,055 ms pro Aufruf |
| 2 | **30,101** | 29,644 | 8,3 / **8,8 ms** | **10,2 ms** | 2,0 ms / 22 / 0,091 ms pro Aufruf |
| 3 | **30,198** | 29,653 | 8,5 / **10,0 ms** | **8,2 ms** | 1,1 ms / 22 / 0,050 ms pro Aufruf |

Die vollständigen Einzelberichte liegen unter `artifacts/jungle-understory-2.4/repeats-final5/run-1.json`, `run-2.json` und `run-3.json`; `summary.json` bündelt dieselben Werte inklusive Streuung.

**Streuung:** Die aggregierte FPS liegt in allen drei Läufen über dem unveränderten Gate von 30. Die Spanne beträgt **30,101–30,207 FPS**, also 0,106 FPS oder rund **0,35 %**. Der mediane Lauf liegt bei 30,198 FPS. Die Streuung wird nicht durch Draw-Arbeit verursacht: Die App-Arbeit in den verbleibenden langen Frames liegt bei 1–3 ms; der Browser wartet bei einzelnen rAF-Lücken 50–67 ms. Diese Lücken sind im Kontrolllauf ohne Dschungel ebenso vorhanden. Der Proof entfernt sie **nicht** aus der FPS-Statistik.

**30-FPS-Cap:** Das Profil bleibt bei 30 FPS. Damit ist die Präsentationsrate physikalisch nahe 30 gedeckelt; ein großer numerischer Abstand wie 31 oder 32 FPS wäre ohne Änderung von Cap oder Messung nicht erreichbar. Die drei Läufe zeigen reproduzierbar **Exit 0** und jeweils einen positiven Abstand von 0,101–0,207 FPS. Einzelne Läufe können durch eine zusätzliche externe rAF-Lücke knapp unter 30 fallen; das ist eine Eigenschaft des unveränderten, nicht gap-bereinigten 30-FPS-Gates, nicht des Detail-Caches.

### Jahreszeiten

| Jahreszeit | FPS Lauf 1 / 2 / 3 | Draw-p95 Lauf 1 / 2 / 3 | Draw-Max (inkl. Staging) Lauf 1 / 2 / 3 |
| --- | ---: | ---: | ---: |
| Frühling (Tag 50) | 29,599 / 29,136 / 29,543 | 3,7 / 4,1 / 3,1 ms | 9,0 / 9,8 / 4,0 ms |
| Sommer (Tag 150) | 30,516 / 30,541 / 30,470 | 3,5 / 3,7 / 2,6 ms | 8,1 / 8,4 / 3,6 ms |
| Herbst (Tag 250) | 30,262 / 30,479 / 30,546 | 2,8 / 2,8 / 2,6 ms | 8,8 / 10,2 / 8,2 ms |
| Winter (Tag 350) | 30,451 / 30,245 / 30,234 | 3,0 / 3,3 / 2,5 ms | 3,3 / 3,9 / 3,6 ms |

Die Draw-Max-Spalte verwendet den vollständigen Draw-Pfad (inklusive Cache-/Staging-Frames), nicht nur den steady Draw. Der Proof prüft diese Werte zusätzlich zum p95. Im Kaltlauf liegt der längste Draw-Frame bei **10,1 ms**, in den Saisons bei höchstens **10,2 ms**. Damit liegt kein einzelner Frame über dem 16,7-ms-Budget.

## Bewertung und Grenzen

- **Unterwuchs:** Die zusätzlichen Canvas-Pässe bleiben mit **0,050–0,091 ms pro Aufruf** im Kaltlauf sehr günstig. Sie werden weiterhin separat pro Aufruf ausgewiesen.
- **Detail-Cache:** Der Neuaufbau ist budgetiert und sichtbar unterbrechbar. Ein Kaltstart oder Jahreszeitenwechsel zeigt während des Aufbaus den alten Layer; der neue Layer erscheint erst nach dem abschließenden Blit.
- **Minimap:** Die statische Terrain-Hälfte wird nur bei Welt-/Explorationsänderungen neu gerastert; die Laufzeit aktualisiert sie mit 1 Hz statt 400 ms. Das beseitigt eine wiederkehrende Hauptthread-Last außerhalb des Welt-Draws.
- **Grenze:** Der Nachweis gilt für diesen Seed, diese dichte Kachel, SwiftShader, Canvas und CDP-4×-CPU-Throttling. Er ist kein Hardware-GPU-Benchmark. Die Fenster-FPS inklusive der Ränder liegt unter 30 und bleibt diagnostisch; das Gate verwendet ausschließlich die aggregierte, nicht gap-bereinigte Präsentations-FPS. Die verbleibenden rAF-Lücken sind externe Browser-Scheduler-Effekte und werden nicht aus der Statistik entfernt.
