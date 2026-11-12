# Tiefenlicht

Ein eigenständiges Roguelike für den Browser: Du trägst die letzte Laterne hinab
in die Minen von Morrgrund, zehn Ebenen tief, um die Sonnenscherbe
zurückzuholen. Rundenbasiert, zufällig erzeugte Ebenen, Permadeath. Statt Hunger
tickt der Ölvorrat deiner Lampe: Je weniger Öl, desto kleiner dein Lichtkreis.

Das Spiel ist vom Genre des klassischen Rogue inspiriert, dessen Quelltext im
Wurzelverzeichnis liegt, teilt aber weder Code noch Inhalte mit ihm.

## Spielen

Es gibt keinen Build-Schritt und keine Abhängigkeiten. Starte einen beliebigen
statischen Webserver in diesem Ordner, zum Beispiel:

```bash
cd web
npm start            # entspricht: python3 -m http.server 8000
```

Dann <http://localhost:8000/> im Browser öffnen. Ein direkter Doppelklick auf
`index.html` funktioniert nicht, weil Browser ES-Module nicht über `file://` laden.

Die Steuerung steht im Spiel unter „Wie man spielt“ (Taste `?` oder `F1`).
Spielstand, Bestenliste und Einstellungen liegen im `localStorage` des Browsers.

## Aufbau

| Ordner | Inhalt |
|---|---|
| `js/engine/` | Spielregeln ohne Browser-Abhängigkeit (Karten, Licht, Kampf, Gegenstände, KI, Speichern). API in `js/engine/README.md`. |
| `js/art/` | Alle Kacheln, Figuren und Icons, zur Laufzeit auf Canvas gezeichnet. Übersicht: `dev/gallery.html`. |
| `js/audio/` | Alle Klänge, zur Laufzeit mit Web Audio erzeugt. Testseite: `dev/audio.html`. |
| `js/ui/`, `js/main.js`, `css/` | Oberfläche: Kartendarstellung, HUD, Inventar, Menüs, Eingabe. |
| `test/` | Tests und ein Test-Bot. |

## Entwicklung

```bash
npm test             # Engine-Tests (Node 22, etwa 40 Sekunden)
node test/bot.js 50  # lässt einen Bot 50 Durchläufe spielen (Balance-Check)
```

Mit `?debug` in der Adresse (optional `&seed=123&depth=5`) stellt das Spiel unter
`window.__tl` Hilfen zum Testen bereit.
