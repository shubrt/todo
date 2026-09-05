# Verifikation

Geprüft am 5. September 2026 mit Node `24.20.0`, dem gepinnten pnpm-Workspace
und Vite+. Web, Mobile und Desktop verwenden dasselbe Convex-Produktionsbackend.

## Automatisierte Prüfungen

`vp run qa` besteht vollständig: Formatierung, Lint einschließlich Typanalyse,
Workspace-Konventionen, alle TypeScript-Pakete und 99 Verhaltenstests in 15 Dateien.

| Testbestand              | Anzahl | Geprüftes Verhalten                                                                                                                         |
| ------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend                  | 42     | Aufgabenregeln, Wiederholungen, DST/Tageswechsel, Shoo, Sessions, HTTP-Idempotenz, Geräte-JWTs, Schlüsselwiderruf, aktuelle Habit-Snapshots |
| Web                      | 18     | PKCE/State, CSRF, Cookies, Offline-Sperren, fehlgeschlagene Befehle, unabhängige Subtasks, einmalige Geräteverbindungen                     |
| Gemeinsamer Geräteclient | 9      | Regionsadressen, sichere Verbindungsdaten, Token-Erneuerung, gebündelte Abrufe, Fehler und wiederholbare Abschlüsse                         |
| Mobile                   | 13     | Refresh während laufendem Abruf, Abmeldung während Konfiguration/Publikation, alte Snapshots, Kalender, Sortierung, Convex-Cleanup          |
| iOS-Config-Plugin        | 4      | Echtes Expo-Projekttemplate, wiederholter Prebuild, Extension/Embed/Build-Abhängigkeit, gemeinsame Entitlements und Mindestversionen        |
| Desktop                  | 12     | Vertrauensgrenzen für IPC, Monitorwechsel, verschlüsselte Speicherung, fehlgeschlagene UI-Aktionen, Provider-Cleanup                        |
| Logging                  | 1      | Keine Bodies, Aufgabentitel oder Zugangsdaten in strukturierten Ereignissen                                                                 |

Fachtests verwenden isolierte Daten und eine kontrollierte Uhr. Sie verändern
keine persönlichen Aufgaben im Produktivbackend. Native Betriebssystemtests
sind von diesen Tests getrennt zu betrachten.

## Web und Backend

Die tatsächliche Web-App läuft unter `https://todo.localhost`. Shoo-Anmeldung,
Besitzerzuordnung, Cookie-Sitzung und Convex-JWT-Verifikation über das
veröffentlichte JWKS wurden mit der echten lokalen Origin geprüft. Desktop-
und Handybreite der Web-Oberfläche wurden zuvor ohne horizontalen Überlauf
oder JavaScript-Fehler geprüft. Client, SSR und Nitro-Server werden über
`vp run build` erzeugt.

Die Gerätefunktionen sind im bestehenden Convex-Produktionsdeployment
veröffentlicht. Reale Prüfungen ergaben:

- `/auth/device-token`: HTTP 200, fünf Minuten Laufzeit, `apiKeyId` ohne Browser-`sid`.
- `/api/v1/habits/snapshot`: HTTP 200, fünf vorhandene Habits mit dem aktuellen `occurrenceKey`.
- Schlüsselverwaltung mit Geräte-JWT: abgewiesen.
- Web-App und macOS-Client lesen gleichzeitig denselben Datenbestand.

Der Mac erhielt einen eigenen widerrufbaren Anwendungsschlüssel. Temporäre
Verbindungsdateien wurden entfernt; der dauerhafte Zugang liegt verschlüsselt
im Geräte-Speicher. Bestehende persönliche Aufgaben wurden für diese Prüfung
nicht abgeschlossen oder durch Testaufgaben ergänzt.

## macOS

Das arm64-Paket wurde gebaut und als echte Electron-App gestartet. Nach dem
Verbindungsdialog, nach lokaler Abmeldung und nach erneuter Anmeldung wurden
alle sechs Ansichten sowie die Einstellungen geprüft. Es gab keine Renderer-
oder Konsolenfehler und keinen horizontalen Überlauf.

Native Laufzeitprüfungen bestätigen: sichtbares Fenster, `alwaysOnTop`, alle
Schreibtische, registrierter globaler Kurzbefehl, Renderer-Sandbox, isolierter
Preload und deaktivierte Node-Integration. Der macOS-Schlüsselbund war verfügbar;
`connection.enc` enthält den Geräteschlüssel nicht im Klartext. Nach der Anmeldung
stehen keine eingegebenen Zugangsdaten mehr im Formular oder in localStorage.

Die App liegt unter `apps/desktop/release/todo-darwin-arm64/todo.app`, zusätzlich
als ZIP und lokal unter `~/Applications/todo.app`. Sie ist nicht mit einer Apple
Developer ID signiert oder notarisiert. Manuelles Wechseln zwischen mehreren
Spaces und fremden Vollbild-Apps bleibt Teil der persönlichen Betriebsabnahme;
die dafür vorgesehenen nativen Fensteroptionen sind gesetzt und geprüft.

## Expo, Widgets und Live Activities

Beide JavaScript-/Hermes-Bundles wurden erfolgreich exportiert. `expo install
--check` meldet passende Abhängigkeiten. Expo Doctor besteht 20 von 21 Prüfungen;
ausschließlich die lokale CocoaPods-Installation fehlt.

Der Prebuild erzeugt iOS und Android. Autolinking findet das lokale native Modul.
Das iOS-Projekt besitzt genau eine Widget-Extension, eine App-Abhängigkeit und
eine eingebettete `.appex`. App, Podfile und Extension verwenden mindestens iOS 17. Höhere konfigurierte Mindestversionen bleiben erhalten. App Group, gemeinsamer
Schlüsselbund und EAS-Metadaten stimmen überein.

Die Swift-Quellen für Datenmodell, gemeinsamen Speicher, App Intents, Widget und
Live Activity wurden zusammen gegen das vorhandene iOS-18.2-Simulator-SDK auf
Typkorrektheit geprüft. Der Expo-Moduladapter besteht die Swift-Syntaxprüfung.
Kotlin und Android-Ressourcen wurden geprüft, aber noch nicht nativ kompiliert.

Ein vollständiger nativer App-Build und Gerätetests sind noch offen. Das lokale
Xcode 16.2 ist für Expo 57 zu alt und sein `xcrun` scheitert zusätzlich beim Laden
einer Systembibliothek. Android SDK und passendes JDK fehlen. EAS-Profile sind
vorbereitet; es ist noch kein Expo-Konto angemeldet. Der geprüfte lokale Wizard
`bash .cache/setup-mobile.sh` führt durch Konto, Projekt, iPhone-Registrierung,
Signierung, Preview-Build und Installation. Er wurde nicht interaktiv ausgeführt.

Auf einem installierten Gerät stehen insbesondere Widget-Abhaken bei geschlossener
App, Tageswechsel, Netzverlust, Schlüsselwiderruf, Live-Activity-Laufzeit und
Android-Benachrichtigungen zur Abnahme aus. Die [mobile Anleitung](../apps/mobile/README.md)
enthält die Schritte, [Habit-Flächen](habit-surfaces.md) die Betriebssystemgrenzen.

## Weitere Betriebsarbeit

Railway ist noch nicht veröffentlicht. Daher bleibt der Shoo-Login aus einer
öffentlichen Web-Origin ebenso offen wie eine optionale Axiom-Weiterleitung.
Push über APNs, App-Store-/Play-Store-Verteilung und macOS-Notarisierung sind
nicht eingerichtet. Diese Punkte ändern nichts am gemeinsamen Backend und
den bereits laufenden lokalen Web- und Mac-Clients.
