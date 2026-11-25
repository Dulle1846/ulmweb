# Zoomstufen und Kartenplatzierung

**Stand:** Erste Umsetzung im Hauptbranch `ulmweb-branch`  
**Spieltexte:** Englisch  
**Dokumentation:** Deutsch

## Fünf Zoomstufen

Die Kamera besitzt einen stufenlosen Zoom. Die Darstellung wechselt abhängig vom tatsächlichen Zoomfaktor zwischen fünf bewusst unterschiedlichen Detailstufen:

| Stufe | Bereich | Darstellung |
|---|---:|---|
| 1 – Landscape | unter 0,14 | Landschaft und Terrain; einzelne Einheiten und Gebäude werden ausgeblendet |
| 2 – Districts | 0,14 bis unter 0,55 | Gebäudeflächen als farbige Zonen mit knappen Funktionsbezeichnungen; keine Personen |
| 3 – Rooftops | 0,55 bis unter 1,55 | Gebäude in Dach-/Draufsicht; Menschen und Gegner als lesbare Aktivitäts- bzw. Einheitensymbole |
| 4 – Interiors | 1,55 bis unter 4,40 | Gebäudeflächen mit Innenraumdetails, Einrichtung und sichtbaren Personen |
| 5 – Ground study | ab 4,40 | Waldboden, Waldgüter mit kurzen Labels, Ameisen, Käfer, Schmetterlinge, Bienen und die Tiere des Bestands als Nahstudie |

Die Presets liegen bei `0,09×`, `0,30×`, `0,95×`, `2,40×` und `5,40×`; der maximale Zoom beträgt `7,40×`. Die Ground-study-Stufe ist kein neuer Renderer: Sie erweitert denselben gecachten Terrain-Detaildurchlauf und dieselbe WebGL-Bodenfläche.

Die Schwellenwerte und Zoomgrenzen sind in `core/config.js` definiert. Die reine Klassifizierung, Begrenzung und Interpolation liegt in `core/zoom-model.js`. Die Darstellung selbst gehört zu `presentation/rendering/entities.js`.

## Kamera und Zoomverhalten

- Das Mausrad zoomt zum Mauszeiger statt pauschal zum Kartenmittelpunkt.
- Während der sanften Zoom-Interpolation wird derselbe Weltpunkt unter dem Cursor gehalten.
- Die Interpolation ist zeitbasiert und damit weniger von der Bildrate abhängig.
- Die Kamera wird an den Weltgrenzen gehalten. Ist die Welt kleiner als der sichtbare Bereich, wird sie zentriert.
- Die fünf Preset-Schaltflächen und die Tasten 1–5 springen auf gut lesbare Beispielwerte der jeweiligen Zoomstufe.
- Die Zoomspanne reicht weit genug heraus, um die gesamte 160×160-Welt als Landschaft zu sehen.

## Drag-and-drop für Karten

Die Karte im Seitenpanel wird mit gedrückter linker Maustaste oder per Touch auf die Weltkarte gezogen.

Während des Ziehens:
1. Die Bildschirmposition wird mit der aktuellen Kamera und Zoomstufe in Weltkoordinaten umgerechnet.
2. Die Platzierungslogik prüft die vollständige Gebäudefläche.
3. Terrain, Weltgrenzen, Gebäudeüberschneidungen und verfügbare Ressourcen werden geprüft.
4. Eine grüne Vorschau signalisiert einen gültigen Platz; eine rote Vorschau zeigt den Ablehnungsgrund.
5. Beim Loslassen auf der Karte wird dieselbe Prüfung erneut ausgeführt. Erst dann werden Ressourcen abgezogen und die Entität erzeugt.

Ein Abbruch außerhalb der Karte verändert weder Ressourcen noch Spielzustand. Ein ungültiger Ablageort kostet ebenfalls keine Ressourcen.

Die Vorschau ist aufgeteilt:
- `systems/cards.js` entscheidet, ob der Platz gültig ist.
- `presentation/input.js` verarbeitet Ziehen, Loslassen und Touch.
- `presentation/rendering/placement-preview.js` zeichnet den Vorschau-Fußabdruck.
- `presentation/effects.js` bleibt für die Darstellung von Feedbackmeldungen zuständig.

## Oberfläche

Das bisherige Tailwind-CDN-Markup wurde durch eine eigenständige responsive Stylesheet-Datei ersetzt: `css/game.css`. Die HTML-Struktur und alle DOM-IDs, die von der Spiellogik benötigt werden, liegen in `index.html`. Die dynamischen Inhalte für Ressourcen, Karten, Ereignisse, Statistiken und Forschung werden in `presentation/rendering/ui.js` erzeugt.

Die sichtbaren Spieltexte bleiben Englisch. Technische Hinweise und Dokumentation bleiben Deutsch.

## Verifikation

Automatisierte Abdeckung:
- Grenzen und Zuordnung der fünf Zoomstufen.
- Alle fünf Zoom-Presets und die Ground-study-Schwelle.
- Zoombegrenzung und Interpolation.
- Kameraanker unter dem Cursor.
- JavaScript-Syntax, relative Modulimporte, HTML-ID-Verträge und lokale Frontend-Assets.
- Gebäudefußabdrücke und Überschneidungen.
- Vollständige relative Modulimports und JavaScript-Syntax.

Die Browserprüfung der tatsächlichen Bedienung und visuellen Qualität umfasst langsames und schnelles Mausrad, alle fünf Zoomstufen einschließlich Ground study, Cursoranker an Kartenrändern, Drag-and-drop auf gültigem und ungültigem Terrain, Abbruch außerhalb der Karte sowie Fenstergrößenwechsel. Ein erfolgreicher Syntax-/Unit-Test ersetzt diese Sichtprüfung nicht.
