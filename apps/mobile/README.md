# Todo für iPhone und Android

Die Expo-App nutzt dieselben Aufgaben und Habits wie die Web-App. Sie enthält Wichtig, die Bereiche me/agency/work mit aktiver Liste und Backlog, schnelle Erfassung, Aufgabendetails, Unteraufgaben, Planung, Snooze, tägliche Habits, Wiederholungen, Rückblick und Einstellungen. Die Gestaltung ist auf das Handy abgestimmt.

Ein langer Druck auf einen Task öffnet die Pfeile für die manuelle Sortierung. Erledigte und offene Aufgaben behalten ihre getrennten Blöcke. Abschlüsse erscheinen erst nach der Backendbestätigung. Bei einer unterbrochenen Verbindung zeigt die App den zuletzt geladenen Stand und sperrt Änderungen bis zur Wiederverbindung.

## Starten

Aus dem Repository-Verzeichnis:

```sh
vp install
vp run @todo/mobile#typecheck
vp test run apps/mobile/test/mobile.test.ts
vp run @todo/mobile#build
vp run @todo/mobile#prebuild
```

`build` erzeugt die JavaScript-/Hermes-Bundles für beide Plattformen. `prebuild` erzeugt die nativen Projekte ohne Paketinstallation und fügt über `plugins/withTodoHabitSurfaces.cjs` die Widget-Extension sowie die Android-Ressourcen hinzu. `ios/` und `android/` sind generiert und werden nicht eingecheckt. Änderungen gehören in das Plugin oder `modules/todo-habit-surfaces`.

Für die native App:

```sh
vp run @todo/mobile#ios
# Oder mit Android-Emulator bzw. angeschlossenem Android-Gerät:
vp run @todo/mobile#android
```

Die Skripte bauen und starten die App lokal. Danach startet `vp run @todo/mobile#dev` nur den Metro-Server für den bereits installierten Development Build. Expo Go enthält das eigene native Widget-Modul nicht; die App weist dort auf die fehlenden Funktionen hin.

## Optional mit EAS bauen

`eas.json` enthält Development Builds für Geräte und iOS-Simulator sowie Preview- und Store-Builds. Die Konfiguration folgt den offiziellen [EAS-Build-Profilen](https://docs.expo.dev/build/eas-json/). Zum Verwenden des Expo-Build-Dienstes einmal mit dem eigenen Expo-Konto anmelden und das Projekt verknüpfen. Diese Schritte benötigen das gewünschte Konto und erzeugen anschließend Build-Aufträge.

```sh
cd apps/mobile
npx eas-cli@latest login
npx eas-cli@latest init
npx eas-cli@latest build --profile development --platform all
# Nur für einen iOS-Simulator:
npx eas-cli@latest build --profile development-simulator --platform ios
# Installierbare interne Version ohne Metro-Verbindung:
npx eas-cli@latest build --profile preview --platform all
# Store-Binaries, ohne automatische Veröffentlichung:
npx eas-cli@latest build --profile production --platform all
```

EAS zeigt bei der Verknüpfung die konkrete Projekt-ID. Falls die CLI die dynamische `app.config.ts` nicht automatisch ändern kann, den angezeigten Wert dort unter `extra.eas.projectId` eintragen. Kein Dummy-Projekt ist hinterlegt. Für iOS-Geräte verlangt auch ein interner Build passende Apple-Signierung und registrierte Geräte. Preview erzeugt auf Android eine APK, Production ein Store-Bundle. Die Versionsquelle ist lokal; vor einer weiteren Store-Veröffentlichung `version`, `ios.buildNumber` und `android.versionCode` in `app.config.ts` passend erhöhen. Im Repository wurden keine EAS-Projekte, Cloud-Builds oder Store-Veröffentlichungen angelegt.

## Einmalig auf einem Gerät verbinden

1. Das gemeinsame Convex-Backend einschließlich Geräte-Token-Route bereitstellen. Die vorhandene Web-Anmeldung und Signaturschlüssel bleiben Grundlage. Details stehen in [native-api.md](../../docs/native-api.md).
2. In der Web-App unter Einstellungen einen eigenen Anwendungsschlüssel für das Handy erzeugen.
3. In der Handy-App die HTTPS-Adresse des Deployments auf `.convex.site` und den Schlüssel einfügen. Alternativ das Verbindungs-JSON oder einen `todo://connect#…`-Link einfügen.

```json
{
  "siteUrl": "https://dein-deployment.convex.site",
  "apiKey": "todo_<anwendungsschluessel>"
}
```

Die Verbindung liegt in Expo SecureStore. JavaScript hält Zugang und kurzlebige JWTs nur während der Sitzung im Speicher. Das Widget-Modul speichert seinen Zugang im gemeinsamen iOS-Keychain-Bereich bzw. mit Android Keystore verschlüsselt. Ein Verbindungslink enthält den vollständigen Geräteschlüssel; kein externer QR-Dienst ist beteiligt. Die App kann weiterhin vollständig per Texteingabe verbunden werden.

Ein widerrufener Schlüssel führt zur erneuten Anmeldung. Eine Netzstörung löscht ihn nicht. Beim Trennen des Geräts stoppt die App laufende Synchronisierung, wartet deren native Schreibzugriffe ab und entfernt anschließend Widget-Daten sowie beide gespeicherten Zugänge.

## Homescreen und Live-Anzeige

Unter Mehr → Habits auf einen Blick stehen die verfügbaren Funktionen des installierten Geräts. Die App zeigt den letzten bestätigten Aktualisierungszeitpunkt.

- iOS: Auf dem Homescreen gedrückt halten, Bearbeiten → Widget hinzufügen → Todo. Das Widget bleibt auf dem Homescreen. Eine zusätzliche Live Activity lässt sich aus der App für Sperrbildschirm und unterstützte Dynamic-Island-Geräte starten.
- Android: Widget hinzufügen in der App öffnet den Launcher-Dialog. Alternativ Todo über die Widget-Auswahl des Launchers hinzufügen. Die laufende Habit-Benachrichtigung muss separat aktiviert werden; Android 13 und neuer fragt nach der Benachrichtigungsberechtigung.

Die Widget-Aktionen sind in Swift und Kotlin implementiert und rufen das gemeinsame Backend auch ohne laufenden JavaScript-Prozess auf. Sie übernehmen keine optimistischen Abschlüsse. Die Instanz-ID und `occurrenceKey` verhindern, dass ein alter Widget-Button einen Habit des neuen Tages erledigt.

Das Betriebssystem bestimmt die Aktualisierungszeiten im Hintergrund. iOS begrenzt eine Live Activity auf acht aktive Stunden; sie ersetzt kein dauerhaftes Homescreen-Widget. Android kann eine laufende Benachrichtigung insbesondere auf neueren Versionen durch Wegwischen entfernen lassen. Bei fehlender Verbindung bleibt der letzte bestätigte Stand sichtbar. Für Live Activities gibt es hier keinen APNs-Push-Dienst.

## Native Voraussetzungen und Gerätetest

Expo SDK 57 verwendet React Native 0.86.3 und React 19.2.3. Für iOS ist eine zu SDK 57 passende vollständige Xcode-Installation erforderlich, mindestens Xcode 26.4. Command Line Tools allein reichen nicht. Android benötigt die zu SDK 57 passende Android-SDK-/Gradle-Umgebung und ein JDK 17 oder neuer. Die Expo-Dokumentation beschreibt die [lokale native Entwicklungsumgebung](https://docs.expo.dev/guides/local-app-development/) und [Entwicklungs-Builds](https://docs.expo.dev/develop/development-builds/introduction/).

Für ein iPhone müssen App und Widget-Extension mit demselben Apple-Team signiert werden. App Group und gemeinsamer Keychain-Zugriff müssen in den Provisioning-Profilen freigeschaltet sein. Die erzeugten IDs und Entitlements stehen im nativen Projekt. Eigene Bundle-IDs in `app.config.ts` ändern und danach erneut prebuild ausführen. Ein Build oder eine Veröffentlichung über EAS ist nicht vorausgesetzt.

Auf echten Geräten prüfen:

1. Verbinden, Habit in der App abschließen und denselben Stand in Web-App und Widget sehen.
2. Haupt-App schließen, Habit direkt im Widget abschließen und anschließend die Historie prüfen.
3. Verbindung unterbrechen. Ein fehlgeschlagener Abschluss darf kein Häkchen vortäuschen. Nach Wiederverbindung erneut aktualisieren.
4. Tageswechsel einschließlich alter Widget-Aktion prüfen. Der Abschluss einer vergangenen Instanz muss abgelehnt werden.
5. Live Activity starten/beenden bzw. Android-Benachrichtigung erlauben, ablehnen und deaktivieren.
6. Geräteschlüssel im Web widerrufen. App und Widget dürfen keine weiteren Aufgabenänderungen ausführen.
7. Gerät trennen, während ein Update läuft. Widget-Inhalte und gespeicherter Zugang müssen entfernt bleiben.

TypeScript, Logiktests, beide Metro-/Hermes-Exporte und die Erzeugung der nativen Projekte lassen sich ohne Apple-Signierung prüfen. Sie ersetzen weder das Kompilieren der Swift-/Kotlin-Quellen noch den Gerätetest. Beim Implementierungsdurchlauf war die lokale Xcode-Installation für SDK 57 zu alt; ein signierter iOS-Build ist daher weiterhin separat auszuführen.
