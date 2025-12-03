# Volleyball DJ Pult (statische PWA)

- DJ-Pult fÃ¼r die Volleyball-Halle: Musik-Snippets nach Kategorien abspielen (Play, Stop mit Fade, LautstÃ¤rke).
- Wichtige Dateien: `index.html` (UI), `script.js` (Logik & Button-Aufbau), `style.css` (Styles), `service-worker.js` (Offline-Cache), `manifest.json` (App-Metadaten), `static/` (music/, special_music/, images/).
- Lokal testen: Im Ordner `pwa/` starten â€“ `python -m http.server 8000` â€“ dann im Browser `http://localhost:8000` Ã¶ffnen.
- Hosting: Ordner `pwa/` kann 1:1 auf statischen Hostern (z.â€¯B. GitHub Pages) genutzt werden.

## WebRTC-Remote (Tablet = Player, Handy = Remote)
- Player-Seite öffnen (`index.html`), Songs laden, dann `Remote koppeln` öffnen.
- `Offer erzeugen` ? QR/Text am Remote-Gerät (`remote.html`) scannen/einfügen.
- Remote erzeugt automatisch eine Answer ? QR/Text zurück zum Player (`Answer anwenden`).
- Sobald DataChannel offen ist: Status „Verbunden“, Remote fordert Songs an.
- Commands (JSON über DataChannel): `play`, `stop`, `randomStandard`, `randomOpponent`, `special{timeout|walkon|pause}`, `volume`, `requestSongs`; Player sendet `songsList` (ohne Gegner-Kategorie) und `nowPlaying`.
- Fallback: Offer/Answer können jederzeit per Text kopiert/eingefügt werden; QR-Scan via Kamera (jsQR) möglich.
