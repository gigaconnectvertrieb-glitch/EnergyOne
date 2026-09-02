# E1 Feld — iOS und Android

Dieselbe Feld-App wie unter https://e1direktvertrieb.de/app  
Login, Route, Abschluss, Bilanz. Kein zweites Backend.

## Einmal einrichten

```bash
cd native/feld
npm install @capacitor/core @capacitor/cli @capacitor/android @capacitor/ios
npx cap add android
npx cap add ios
npx cap sync
```

## Android

- Android Studio öffnen: `npm run android`
- Gerät oder Emulator, Run
- APK zum Testen: Build → Generate Signed Bundle / APK
- Play Store: Google-Konto (einmalig Gebühr), Bundle hochladen

## iOS

- Nur auf einem Mac: `npm run ios`
- Apple Developer Programm (99 € / Jahr)
- Signing Team in Xcode setzen, dann Archive → App Store Connect

## Wichtig

Die App lädt live von e1direktvertrieb.de. Render-Update = App-Inhalt neu, ohne Store-Update.
Store-Update nur bei Icon, Name, Rechten.
