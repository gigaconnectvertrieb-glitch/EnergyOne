# E1 Orga für Windows

Fenster ums Portal. Kein zweites Backend.

Auf einem Windows-PC:

```
cd native/desktop
npm install electron electron-builder --save-dev
npm run dist
```

Die EXE liegt unter `dist/`. Installieren, anmelden wie im Browser.

Updates der Oberfläche kommen vom Server. In Benutzer „Update an alle schicken“ — dann in der App und hier auf Aktualisieren.
